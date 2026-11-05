const db = require('../../config/db');

const COLUMNS = `c.id, c.exercice, c.trimestre, c.statut, c.grille_id AS "grilleId",
                 c.date_ouverture AS "dateOuverture", c.date_limite AS "dateLimite", c.date_cloture AS "dateCloture"`;

async function lister({ limit, offset }) {
  const [rows, count] = await Promise.all([
    db.query(`SELECT ${COLUMNS} FROM campagne c ORDER BY c.exercice DESC, c.trimestre DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    db.query('SELECT count(*)::int AS total FROM campagne'),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function trouver(id) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM campagne c WHERE c.id = $1`, [id]);
  return rows[0] || null;
}

/** Verrou de ligne : deux clôtures simultanées sont sérialisées. */
async function verrouiller(client, id) {
  const { rows } = await client.query(
    'SELECT id, statut, grille_id AS "grilleId", exercice, trimestre FROM campagne WHERE id = $1 FOR UPDATE',
    [id],
  );
  return rows[0] || null;
}

async function cloturer(client, id) {
  await client.query("UPDATE campagne SET statut = 'CLOTUREE' WHERE id = $1", [id]);
}

async function ouvrir(client, { exercice, trimestre, grilleId, dateLimite }, userId) {
  const { rows } = await client.query('SELECT fn_ouvrir_campagne($1::integer, $2::smallint, $3::uuid, $4::date, $5::uuid) AS id',
    [exercice, trimestre, grilleId, dateLimite, userId]);
  return rows[0].id;
}

/** Couples pôle/critère du périmètre gelé sans cible : le critère est exclu de la notation du pôle. */
async function sansCible(client, campagneId, grilleId, exercice) {
  const { rows } = await client.query(
    `SELECT p.code AS "poleCode", c.intitule AS critere
       FROM fn_criteres_effectifs($1, $2, $3) e
       JOIN pole p ON p.id = e.pole_id JOIN critere c ON c.id = e.critere_id
      WHERE e.valeur_cible IS NULL ORDER BY p.code, c.intitule`, [campagneId, grilleId, exercice]);
  return rows;
}

async function enregistrerReouverture(client, campagneId, motif, userId) {
  await client.query('INSERT INTO reouverture (campagne_id, motif, reouvert_par) VALUES ($1,$2,$3)', [campagneId, motif, userId]);
  await client.query("UPDATE campagne SET statut = 'ROUVERTE' WHERE id = $1", [campagneId]);
}

async function reouvertures(campagneId) {
  const { rows } = await db.query(
    `SELECT r.id, r.motif, r.date, r.reouvert_par AS "reouvertPar" FROM reouverture r
      WHERE r.campagne_id = $1 ORDER BY r.date DESC`, [campagneId]);
  return rows;
}

/** Destinataires : responsables des pôles du périmètre gelé + contrôle de gestion actif. */
async function destinataires(client, campagneId) {
  const { rows } = await client.query(
    `SELECT DISTINCT u.id FROM utilisateur u
      WHERE u.actif AND (u.role = 'CONTROLE_GESTION'
         OR u.id IN (SELECT p.responsable_id FROM campagne_pole cp JOIN pole p ON p.id = cp.pole_id
                      WHERE cp.campagne_id = $1 AND p.responsable_id IS NOT NULL))`, [campagneId]);
  return rows.map((r) => r.id);
}

async function notifier(client, campagneId, destinataireIds, message) {
  for (const id of destinataireIds) {
    await client.query(
      "INSERT INTO notification (campagne_id, destinataire_id, canal, message) VALUES ($1,$2,'APPLICATION',$3)",
      [campagneId, id, message]);
  }
}

module.exports = { lister, trouver, verrouiller, cloturer, ouvrir, sansCible, enregistrerReouverture, reouvertures, destinataires, notifier };
