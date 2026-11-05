const db = require('../../config/db');
const repo = require('./cibles.repository');
const { toOffset, paginated } = require('../../utils/pagination');
const { notFound, conflict, HttpError } = require('../../utils/httpError');

async function list(user, query) {
  // Cloisonnement : un responsable ne voit que les cibles de ses pôles
  const responsableId = user.role === 'RESPONSABLE_POLE' ? user.id : undefined;
  const { rows, total } = await repo.list({ ...query, responsableId, offset: toOffset(query) });
  return paginated(rows, query, total);
}

async function definir(user, data) {
  const id = await db.withTransaction({ userId: user.id }, async (client) => {
    if (!(await repo.poleExiste(client, data.poleId))) throw new HttpError(422, 'UNKNOWN_POLE', 'Pôle inconnu');
    if (!(await repo.critereApplicableValide(client, data.critereId))) throw new HttpError(422, 'UNKNOWN_CRITERE', 'Critère inconnu');
    const existante = await repo.trouverParCle(client, data.poleId, data.critereId, data.exercice);
    // Une cible validée dont l'exercice a déjà une campagne est figée : elle ne se modifie plus en cours d'exercice.
    if (existante && existante.date_validation && (await repo.campagneExiste(client, data.exercice))) {
      throw conflict('Cible validée et exercice déjà ouvert : modification impossible');
    }
    return repo.upsert(client, data);
  });
  return repo.findById(id);
}

/** La cible est validée par la direction générale (cahier § 2.1.3). */
async function valider(user, id) {
  await db.withTransaction({ userId: user.id, motif: 'Validation de la cible' }, async (client) => {
    const cible = await repo.verrouiller(client, id);
    if (!cible) throw notFound('Cible introuvable');
    if (cible.date_validation) throw conflict('Cible déjà validée');
    await repo.valider(client, id, user.id);
  });
  return repo.findById(id);
}

async function validerLot(user, data) {
  const nombre = await db.withTransaction({ userId: user.id, motif: `Validation des cibles ${data.exercice}` },
    (client) => repo.validerLot(client, data, user.id));
  return { exercice: data.exercice, validees: nombre };
}

module.exports = { list, definir, valider, validerLot };
