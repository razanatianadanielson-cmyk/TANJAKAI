const db = require('../../config/db');

const COLUMNS = `ci.id, ci.pole_id AS "poleId", p.code AS "poleCode", ci.critere_id AS "critereId",
                 c.intitule AS critere, c.unite, ci.exercice, ci.valeur_cible AS "valeurCible",
                 ci.date_validation AS "dateValidation", ci.valide_par AS "validePar"`;
const FROM = 'FROM cible ci JOIN pole p ON p.id = ci.pole_id JOIN critere c ON c.id = ci.critere_id';

async function list({ responsableId, poleId, critereId, exercice, valide, limit, offset }) {
  const params = [responsableId || null, poleId || null, critereId || null, exercice || null, valide ?? null];
  const where = `WHERE ($1::uuid IS NULL OR p.responsable_id = $1) AND ($2::uuid IS NULL OR ci.pole_id = $2)
                   AND ($3::uuid IS NULL OR ci.critere_id = $3) AND ($4::int IS NULL OR ci.exercice = $4)
                   AND ($5::boolean IS NULL OR ((ci.date_validation IS NOT NULL) = $5))`;
  const [rows, count] = await Promise.all([
    db.query(`SELECT ${COLUMNS} ${FROM} ${where} ORDER BY ci.exercice DESC, p.code, c.intitule LIMIT $6 OFFSET $7`,
      [...params, limit, offset]),
    db.query(`SELECT count(*)::int AS total ${FROM} ${where}`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function findById(id, client = db) {
  const { rows } = await client.query(`SELECT ${COLUMNS}, p.responsable_id AS "responsableId" ${FROM} WHERE ci.id = $1`, [id]);
  return rows[0] || null;
}

async function trouverParCle(client, poleId, critereId, exercice) {
  const { rows } = await client.query(
    'SELECT id, date_validation FROM cible WHERE pole_id = $1 AND critere_id = $2 AND exercice = $3 FOR UPDATE',
    [poleId, critereId, exercice],
  );
  return rows[0] || null;
}

async function campagneExiste(client, exercice) {
  const { rows } = await client.query('SELECT 1 FROM campagne WHERE exercice = $1 LIMIT 1', [exercice]);
  return rows.length > 0;
}

async function critereApplicableValide(client, critereId) {
  const { rows } = await client.query('SELECT valide FROM critere WHERE id = $1', [critereId]);
  return rows[0] || null;
}

async function poleExiste(client, poleId) {
  const { rows } = await client.query('SELECT 1 FROM pole WHERE id = $1', [poleId]);
  return rows.length > 0;
}

/** Toute (re)saisie d'une cible annule sa validation : la direction doit la revalider. */
async function upsert(client, { poleId, critereId, exercice, valeurCible }) {
  const { rows } = await client.query(
    `INSERT INTO cible (pole_id, critere_id, exercice, valeur_cible) VALUES ($1,$2,$3,$4)
     ON CONFLICT (pole_id, critere_id, exercice)
     DO UPDATE SET valeur_cible = EXCLUDED.valeur_cible, date_validation = NULL, valide_par = NULL
     RETURNING id`,
    [poleId, critereId, exercice, valeurCible],
  );
  return rows[0].id;
}

async function valider(client, id, userId) {
  const { rowCount } = await client.query(
    'UPDATE cible SET date_validation = current_date, valide_par = $2 WHERE id = $1 AND date_validation IS NULL',
    [id, userId],
  );
  return rowCount;
}

async function validerLot(client, { exercice, poleId }, userId) {
  const { rowCount } = await client.query(
    `UPDATE cible SET date_validation = current_date, valide_par = $3
      WHERE exercice = $1 AND date_validation IS NULL AND ($2::uuid IS NULL OR pole_id = $2)`,
    [exercice, poleId || null, userId],
  );
  return rowCount;
}

async function verrouiller(client, id) {
  const { rows } = await client.query('SELECT id, date_validation FROM cible WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] || null;
}

module.exports = {
  list, findById, trouverParCle, campagneExiste, critereApplicableValide, poleExiste, upsert, valider, validerLot, verrouiller,
};
