const db = require('../../config/db');
const repo = require('./grilles.repository');
const { toOffset, paginated } = require('../../utils/pagination');
const { notFound, conflict, HttpError } = require('../../utils/httpError');

async function list(query) {
  const { rows, total } = await repo.list({ ...query, offset: toOffset(query) });
  return paginated(rows, query, total);
}

async function getById(id) {
  const grille = await repo.findById(id);
  if (!grille) throw notFound('Grille introuvable');
  const [ponderationsAxes, ponderationsCriteres] = await Promise.all([
    repo.pondérationsAxes(id), repo.pondérationsCriteres(id),
  ]);
  return { ...grille, ponderationsAxes, ponderationsCriteres };
}

/** Verrouille la grille et vérifie qu'elle est encore modifiable (brouillon). */
async function brouillonVerrouille(client, id) {
  const grille = await repo.verrouiller(client, id);
  if (!grille) throw notFound('Grille introuvable');
  if (grille.statut !== 'BROUILLON') {
    throw conflict(`Grille v${grille.version} validée et figée : créez une nouvelle version`);
  }
  return grille;
}

/**
 * Nouvelle version : jamais d'écrasement. Sans `copierDepuis`, on repart de la dernière version validée.
 * Une seule version en brouillon à la fois.
 */
async function creer(user, { motif, copierDepuis }) {
  const id = await db.withTransaction({ userId: user.id, motif }, async (client) => {
    await client.query('LOCK TABLE grille_notation IN SHARE ROW EXCLUSIVE MODE');
    const brouillon = await repo.brouillonExistant(client);
    if (brouillon) throw conflict(`La version ${brouillon.version} est déjà en brouillon : validez-la ou supprimez-la`);
    const derniere = await repo.derniere(client);
    const version = derniere ? derniere.version + 1 : 1;
    if (version > 1 && !motif) {
      throw new HttpError(422, 'MOTIF_REQUIRED', 'Le motif du changement est obligatoire pour une nouvelle version');
    }
    const grilleId = await repo.insert(client, version, motif);
    let source = null;
    if (copierDepuis) {
      source = await repo.findById(copierDepuis, client);
      if (!source) throw notFound('Grille à copier introuvable');
    } else if (derniere) {
      source = await repo.derniere(client, 'VALIDEE');
    }
    if (source) await repo.copier(client, source.id, grilleId);
    return grilleId;
  });
  return getById(id);
}

async function definirPonderationsAxes(user, id, { ponderations }) {
  await db.withTransaction({ userId: user.id, motif: 'Pondérations des axes' }, async (client) => {
    await brouillonVerrouille(client, id);
    await repo.remplacerAxes(client, id, ponderations);
  });
  return getById(id);
}

async function definirPonderationsCriteres(user, id, { ponderations }) {
  const ids = [...new Set(ponderations.map((p) => p.critereId))];
  await db.withTransaction({ userId: user.id, motif: 'Pondérations et barèmes des critères' }, async (client) => {
    await brouillonVerrouille(client, id);
    const inconnus = await repo.criteresInconnus(client, ids);
    if (inconnus.length) throw new HttpError(422, 'UNKNOWN_CRITERE', `Critère(s) inconnu(s) : ${inconnus.join(', ')}`);
    const nonValides = await repo.criteresNonValides(client, ids);
    if (nonValides.length) {
      throw new HttpError(422, 'CRITERE_NOT_VALIDATED',
        `Critère(s) à faire valider par le contrôle de gestion avant activation : ${nonValides.map((c) => c.intitule).join(', ')}`);
    }
    await repo.remplacerCriteres(client, id, ponderations);
  });
  return getById(id);
}

/** Validation = contrôles de somme à 100 % et de barèmes (triggers) puis gel définitif. */
async function valider(user, id) {
  await db.withTransaction({ userId: user.id, motif: 'Validation de la grille' }, async (client) => {
    await brouillonVerrouille(client, id);
    await repo.valider(client, id, user.id);
  });
  return getById(id);
}

async function supprimer(user, id) {
  await db.withTransaction({ userId: user.id, motif: 'Suppression d\'un brouillon de grille' }, async (client) => {
    await brouillonVerrouille(client, id);
    await repo.supprimer(client, id);
  });
}

module.exports = { list, getById, creer, definirPonderationsAxes, definirPonderationsCriteres, valider, supprimer };
