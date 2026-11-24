const db = require('../../config/db');
const repo = require('./poles.repository');
const { toOffset, paginated } = require('../../utils/pagination');
const { notFound, conflict, badRequest } = require('../../utils/httpError');

async function list(user, query) {
  const { page, limit, familleId } = query;
  // Cloisonnement : un responsable de pôle ne voit que ses propres pôles
  const responsableId = user.role === 'RESPONSABLE_POLE' ? user.id : undefined;
  const { rows, total } = await repo.list({ responsableId, familleId, limit, offset: toOffset(query) });
  return paginated(rows, { page, limit }, total);
}

async function getById(user, id) {
  const pole = await repo.findById(id);
  // 404 (et non 403) pour ne pas révéler l'existence d'un pôle d'un autre responsable
  if (!pole || (user.role === 'RESPONSABLE_POLE' && pole.responsableId !== user.id)) {
    throw notFound('Pôle introuvable');
  }
  return pole;
}

async function create(user, data) {
  const id = await db.withTransaction({ userId: user.id }, (client) => repo.insert(client, data));
  return repo.findById(id);
}

/** Suspension temporaire de notation (pôle récent ou en restructuration) : motif et durée obligatoires. */
async function suspendre(user, poleId, data) {
  await getById(user, poleId); // 404 si le pôle n'existe pas
  return db.withTransaction({ userId: user.id, motif: data.motif }, (client) => repo.insertSuspension(client, poleId, data));
}

async function suspensions(user, poleId) {
  await getById(user, poleId); // cloisonnement : un responsable ne voit que ses pôles
  return repo.listSuspensions(poleId);
}

/**
 * Corrige une suspension saisie par erreur (motif, dates). Les campagnes déjà ouvertes gardent leur périmètre gelé :
 * la correction ne vaut que pour les campagnes ouvertes ensuite.
 */
async function modifierSuspension(user, poleId, suspensionId, data) {
  return db.withTransaction({ userId: user.id, motif: 'Correction d\'une suspension' }, async (client) => {
    const s = await repo.verrouillerSuspension(client, poleId, suspensionId);
    if (!s) throw notFound('Suspension introuvable');
    const suite = { motif: data.motif ?? s.motif, dateDebut: data.dateDebut ?? s.dateDebut, dateFin: data.dateFin ?? s.dateFin };
    if (suite.dateFin < suite.dateDebut) throw badRequest('La date de fin doit être postérieure ou égale à la date de début');
    return repo.majSuspension(client, suspensionId, suite);
  });
}

/** Supprime une suspension ajoutée par erreur (motif obligatoire, tracé au journal d'audit). */
async function supprimerSuspension(user, poleId, suspensionId, { motif }) {
  return db.withTransaction({ userId: user.id, motif: `Suppression d'une suspension : ${motif}` }, async (client) => {
    const s = await repo.verrouillerSuspension(client, poleId, suspensionId);
    if (!s) throw notFound('Suspension introuvable');
    await repo.supprimerSuspension(client, suspensionId);
    return { supprime: true, dateDebut: s.dateDebut, dateFin: s.dateFin };
  });
}

/**
 * Rattache (ou détache, si responsableId est null) le responsable d'un pôle.
 * Le nouveau responsable doit avoir le rôle RESPONSABLE_POLE et un compte actif.
 * Ses prédécesseurs perdent l'accès au pôle ; les saisies non validées d'une campagne en cours lui sont transférées.
 */
async function changerResponsable(user, poleId, { responsableId, motif }) {
  const resultat = await db.withTransaction({ userId: user.id, motif: `Rattachement : ${motif}` }, async (client) => {
    const pole = await repo.verrouiller(client, poleId);
    if (!pole) throw notFound('Pôle introuvable');
    if ((pole.responsableId || null) === responsableId) {
      throw conflict(responsableId ? 'Ce responsable est déjà rattaché à ce pôle' : 'Ce pôle n\'a déjà aucun responsable');
    }
    let nouveau = null;
    if (responsableId) {
      nouveau = await repo.responsableValide(client, responsableId);
      if (!nouveau) throw conflict('Le compte choisi doit être un responsable de pôle actif');
    }
    await repo.majResponsable(client, poleId, responsableId);
    let saisiesTransferees = 0;
    if (nouveau && pole.responsableId) {
      saisiesTransferees = await repo.transfererSaisies(client, poleId, pole.responsableId, nouveau.id);
    }
    if (nouveau) {
      const campagne = await repo.campagneEnCours(client);
      if (campagne) await repo.notifier(client, campagne, nouveau.id, `Le pôle ${pole.code} vous est rattaché : vous pouvez saisir ses indicateurs.`);
    }
    return { saisiesTransferees };
  });
  return { ...(await repo.findById(poleId)), ...resultat };
}

/**
 * Modifie la fiche d'un pôle (motif obligatoire, tracé dans le journal d'audit).
 * Le code ne peut plus changer dès que le pôle est entré dans une campagne : les scores et exports s'y réfèrent.
 */
async function modifier(user, poleId, { motif, ...champs }) {
  await db.withTransaction({ userId: user.id, motif: `Modification : ${motif}` }, async (client) => {
    const pole = await repo.verrouiller(client, poleId);
    if (!pole) throw notFound('Pôle introuvable');
    if (champs.code !== undefined && champs.code !== pole.code) {
      const u = await repo.usage(client, poleId);
      if (u.campagnes > 0) throw conflict('Le code d\'un pôle déjà entré dans une campagne ne peut plus être modifié');
    }
    if (champs.familleId !== undefined && !(await repo.familleExiste(client, champs.familleId))) {
      throw badRequest('Famille d\'activité inconnue');
    }
    await repo.maj(client, poleId, champs);
  });
  return repo.findById(poleId);
}

/**
 * Supprime un pôle créé par erreur ou jamais utilisé. Refusé dès qu'il a servi (campagne, saisie, score, alerte, synthèse,
 * clé de service) : l'historique ne s'efface pas, on suspend le pôle à la place. La suppression reste inscrite au journal d'audit.
 */
async function supprimer(user, poleId, { motif }) {
  return db.withTransaction({ userId: user.id, motif: `Suppression : ${motif}` }, async (client) => {
    const pole = await repo.verrouiller(client, poleId);
    if (!pole) throw notFound('Pôle introuvable');
    const u = await repo.usage(client, poleId);
    const emplois = [[u.campagnes, 'campagne(s)'], [u.saisies, 'saisie(s)'], [u.scores, 'score(s)'], [u.alertes, 'alerte(s)'], [u.syntheses, 'synthèse(s)'], [u.cles, 'clé(s) de service']]
      .filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}`);
    if (emplois.length) {
      throw conflict(`Ce pôle a déjà servi (${emplois.join(', ')}) : il ne peut pas être supprimé. Utilisez une suspension de notation à la place.`);
    }
    const cibles = await repo.supprimer(client, poleId);
    return { supprime: true, code: pole.code, ciblesSupprimees: cibles };
  });
}

module.exports = { modifierSuspension, supprimerSuspension, list, getById, create, suspendre, suspensions, changerResponsable, modifier, supprimer };
