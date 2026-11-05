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

module.exports = { list, getById, create, update, valider };
