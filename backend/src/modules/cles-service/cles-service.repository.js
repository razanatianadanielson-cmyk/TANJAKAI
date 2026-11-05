const db = require('../../config/db');

// Dernière utilisation = dernière saisie reçue par cette clé (aucune écriture à chaque appel, donc pas de bruit dans l'audit)
const SELECT = `SELECT k.id, k.pole_id AS "poleId", p.code AS "poleCode", p.intitule AS "poleIntitule", k.libelle, k.prefixe,
                       k.droits, k.active, k.date_creation AS "dateCreation", k.date_revocation AS "dateRevocation",
                       (SELECT count(*)::int FROM saisie s WHERE s.cle_service_id = k.id) AS "nbSaisies"
                  FROM cle_service k JOIN pole p ON p.id = k.pole_id`;

async function lister({ poleId, active, limit, offset }) {
  const params = [poleId || null, active === undefined ? null : active];
  const where = 'WHERE ($1::uuid IS NULL OR k.pole_id = $1) AND ($2::boolean IS NULL OR k.active = $2)';
  const [rows, count] = await Promise.all([
    db.query(`${SELECT} ${where} ORDER BY k.date_creation DESC LIMIT $3 OFFSET $4`, [...params, limit, offset]),
    db.query(`SELECT count(*)::int AS total FROM cle_service k ${where}`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function trouver(client, id) {
  const { rows } = await (client || db).query(`${SELECT} WHERE k.id = $1`, [id]);
  return rows[0] || null;
}

async function pole(client, poleId) {
  const { rows } = await client.query('SELECT id, statut FROM pole WHERE id = $1', [poleId]);
  return rows[0] || null;
}

async function inserer(client, { poleId, libelle, empreinte, prefixe }) {
  const { rows } = await client.query(
    `INSERT INTO cle_service (pole_id, libelle, empreinte_cle, prefixe, droits)
     VALUES ($1,$2,$3,$4,ARRAY['saisie:ecriture']) RETURNING id`,
    [poleId, libelle, empreinte, prefixe]);
  return rows[0].id;
}

async function revoquer(client, id, userId) {
  const { rowCount } = await client.query(
    'UPDATE cle_service SET active = false, date_revocation = now(), revoquee_par = $2 WHERE id = $1 AND active',
    [id, userId]);
  return rowCount > 0;
}

module.exports = { lister, trouver, pole, inserer, revoquer };
