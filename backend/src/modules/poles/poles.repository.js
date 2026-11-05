const db = require('../../config/db');

const COLUMNS = `p.id, p.code, p.intitule, p.famille_id AS "familleId", f.libelle AS famille,
                 p.responsable_id AS "responsableId",
                 (SELECT u.prenom || ' ' || u.nom FROM utilisateur u WHERE u.id = p.responsable_id) AS "responsableNom",
                 p.effectif, p.implantation,
                 p.date_rattachement AS "dateRattachement", p.statut`;

async function list({ responsableId, familleId, limit, offset }) {
  const params = [responsableId || null, familleId || null];
  const where = 'WHERE ($1::uuid IS NULL OR p.responsable_id = $1) AND ($2::uuid IS NULL OR p.famille_id = $2)';
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT ${COLUMNS} FROM pole p JOIN famille_activite f ON f.id = p.famille_id
        ${where} ORDER BY p.code LIMIT $3 OFFSET $4`,
      [...params, limit, offset],
    ),
    db.query(`SELECT count(*)::int AS total FROM pole p ${where}`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function findById(id) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM pole p JOIN famille_activite f ON f.id = p.famille_id WHERE p.id = $1`,
    [id],
  );
  return rows[0] || null;
}

/** `client` : connexion de la transaction ouverte par withTransaction (audit actif). */
async function insert(client, data) {
  const { rows } = await client.query(
    `INSERT INTO pole (code, intitule, famille_id, responsable_id, effectif, implantation, date_rattachement)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [data.code, data.intitule, data.familleId, data.responsableId || null,
      data.effectif ?? null, data.implantation || null, data.dateRattachement],
  );
  return rows[0].id;
}

async function insertSuspension(client, poleId, { motif, dateDebut, dateFin }) {
  const { rows } = await client.query(
    `INSERT INTO suspension_pole (pole_id, motif, date_debut, date_fin) VALUES ($1,$2,$3,$4)
     RETURNING id, pole_id AS "poleId", motif, date_debut AS "dateDebut", date_fin AS "dateFin"`,
    [poleId, motif, dateDebut, dateFin],
  );
  return rows[0];
}

async function listSuspensions(poleId) {
  const { rows } = await db.query(
    `SELECT id, pole_id AS "poleId", motif, date_debut AS "dateDebut", date_fin AS "dateFin"
       FROM suspension_pole WHERE pole_id = $1 ORDER BY date_debut DESC`, [poleId]);
  return rows;
}

async function verrouiller(client, id) {
  const { rows } = await client.query('SELECT id, code, responsable_id AS "responsableId" FROM pole WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] || null;
}

async function responsableValide(client, id) {
  const { rows } = await client.query(
    "SELECT id, nom, prenom FROM utilisateur WHERE id = $1 AND role = 'RESPONSABLE_POLE' AND actif", [id]);
  return rows[0] || null;
}

async function majResponsable(client, id, responsableId) {
  await client.query('UPDATE pole SET responsable_id = $2 WHERE id = $1', [id, responsableId]);
}

/** Brouillons, saisies soumises ou renvoyées d'une campagne en cours : elles passent au nouveau responsable (les saisies validées restent intactes). */
async function transfererSaisies(client, poleId, ancienId, nouveauId) {
  const { rowCount } = await client.query(
    `UPDATE saisie s SET saisi_par = $3
       FROM campagne c
      WHERE c.id = s.campagne_id AND c.statut IN ('OUVERTE','ROUVERTE')
        AND s.pole_id = $1 AND s.source = 'ESPACE' AND s.saisi_par = $2 AND s.statut <> 'VALIDEE'`,
    [poleId, ancienId, nouveauId]);
  return rowCount;
}

async function campagneEnCours(client) {
  const { rows } = await client.query("SELECT id FROM campagne WHERE statut IN ('OUVERTE','ROUVERTE') ORDER BY exercice DESC, trimestre DESC LIMIT 1");
  return rows[0] ? rows[0].id : null;
}

async function notifier(client, campagneId, destinataireId, message) {
  await client.query(
    "INSERT INTO notification (campagne_id, destinataire_id, canal, message) VALUES ($1,$2,'APPLICATION',$3)",
    [campagneId, destinataireId, message]);
}

module.exports = {
  list, findById, insert, insertSuspension, listSuspensions,
  verrouiller, responsableValide, majResponsable, transfererSaisies, campagneEnCours, notifier,
};
