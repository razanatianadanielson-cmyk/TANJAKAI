const db = require('../../config/db');
const repo = require('./poles.repository');
const { toOffset, paginated } = require('../../utils/pagination');
const { notFound, conflict } = require('../../utils/httpError');

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

module.exports = { list, getById, create, suspendre, suspensions, changerResponsable };
