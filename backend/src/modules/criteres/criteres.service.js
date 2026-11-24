const db = require('../../config/db');
const repo = require('./criteres.repository');
const { toOffset, paginated } = require('../../utils/pagination');
const { notFound, conflict } = require('../../utils/httpError');

async function list(query) {
  const { rows, total } = await repo.list({ ...query, offset: toOffset(query) });
  return paginated(rows, query, total);
}

async function getById(id) {
  const critere = await repo.findById(id);
  if (!critere) throw notFound('Critère introuvable');
  return critere;
}

async function create(user, data) {
  const id = await db.withTransaction({ userId: user.id }, (client) => repo.insert(client, data));
  return repo.findById(id);
}

/** Un critère validé est référencé par des grilles figées : on ne le modifie plus (créer un nouveau critère). */
async function update(user, id, data) {
  await db.withTransaction({ userId: user.id }, async (client) => {
    const critere = await repo.verrouiller(client, id);
    if (!critere) throw notFound('Critère introuvable');
    if (critere.valide) throw conflict('Critère validé : sa définition ne peut plus être modifiée');
    await repo.update(client, id, data);
  });
  return repo.findById(id);
}

/**
 * Supprime un critère créé par erreur. Refusé dès qu'il sert (cible, grille, campagne, saisie, score) :
 * on supprime d'abord ses cibles, et un critère déjà dans une grille ou une campagne reste pour l'historique.
 */
async function supprimer(user, id, { motif }) {
  return db.withTransaction({ userId: user.id, motif: `Suppression d'un critère : ${motif}` }, async (client) => {
    const critere = await repo.verrouiller(client, id);
    if (!critere) throw notFound('Critère introuvable');
    const u = await repo.usage(client, id);
    const emplois = [[u.cibles, 'cible(s)'], [u.grilles, 'grille(s)'], [u.campagnes, 'campagne(s)'], [u.saisies, 'saisie(s)'], [u.scores, 'score(s)']]
      .filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}`);
    if (emplois.length) {
      throw conflict(`Ce critère sert déjà (${emplois.join(', ')}) : il ne peut pas être supprimé.${u.cibles > 0 && !u.grilles && !u.campagnes && !u.saisies && !u.scores ? ' Supprimez d\'abord ses cibles.' : ''}`);
    }
    await repo.supprimer(client, id);
    return { supprime: true };
  });
}

/** Définition validée par le contrôle de gestion avant toute activation dans une grille. */
async function valider(user, id) {
  await db.withTransaction({ userId: user.id, motif: 'Validation de la définition du critère' }, async (client) => {
    const critere = await repo.verrouiller(client, id);
    if (!critere) throw notFound('Critère introuvable');
    if (critere.valide) throw conflict('Critère déjà validé');
    await repo.valider(client, id, user.id);
  });
  return repo.findById(id);
}

module.exports = { supprimer, list, getById, create, update, valider };
