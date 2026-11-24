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

async function verrouillerSuspension(client, poleId, suspensionId) {
  const { rows } = await client.query(
    `SELECT id, motif, date_debut::text AS "dateDebut", date_fin::text AS "dateFin"
       FROM suspension_pole WHERE id = $1 AND pole_id = $2 FOR UPDATE`, [suspensionId, poleId]);
  return rows[0] || null;
}

async function majSuspension(client, id, { motif, dateDebut, dateFin }) {
  const { rows } = await client.query(
    `UPDATE suspension_pole SET motif = $2, date_debut = $3, date_fin = $4 WHERE id = $1
     RETURNING id, pole_id AS "poleId", motif, date_debut AS "dateDebut", date_fin AS "dateFin"`,
    [id, motif, dateDebut, dateFin]);
  return rows[0];
}

async function supprimerSuspension(client, id) {
  await client.query('DELETE FROM suspension_pole WHERE id = $1', [id]);
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

/** Combien de fois le pôle a déjà servi : campagnes, saisies, scores, alertes, synthèses, clés de service. */
async function usage(client, id) {
  const { rows } = await client.query(
    `SELECT (SELECT count(*) FROM campagne_pole WHERE pole_id = $1)::int AS campagnes,
            (SELECT count(*) FROM saisie WHERE pole_id = $1)::int AS saisies,
            (SELECT count(*) FROM score_pole WHERE pole_id = $1)::int AS scores,
            (SELECT count(*) FROM alerte WHERE pole_id = $1)::int AS alertes,
            (SELECT count(*) FROM synthese_trimestrielle WHERE pole_id = $1)::int AS syntheses,
            (SELECT count(*) FROM cle_service WHERE pole_id = $1)::int AS cles`, [id]);
  return rows[0];
}

async function familleExiste(client, id) {
  const { rows } = await client.query('SELECT 1 FROM famille_activite WHERE id = $1', [id]);
  return rows.length > 0;
}

const CHAMPS = { code: 'code', intitule: 'intitule', familleId: 'famille_id', effectif: 'effectif', implantation: 'implantation', dateRattachement: 'date_rattachement' };

async function maj(client, id, data) {
  const sets = []; const params = [id];
  for (const [cle, colonne] of Object.entries(CHAMPS)) {
    if (data[cle] !== undefined) { params.push(data[cle]); sets.push(`${colonne} = $${params.length}`); }
  }
  await client.query(`UPDATE pole SET ${sets.join(', ')} WHERE id = $1`, params);
}

/** Suppression d'un pôle jamais utilisé : ses cibles (jamais gelées dans une campagne) partent avec lui, ses suspensions en cascade. */
async function supprimer(client, id) {
  const c = await client.query('DELETE FROM cible WHERE pole_id = $1', [id]);
  await client.query('DELETE FROM pole WHERE id = $1', [id]);
  return c.rowCount;
}

module.exports = {
  usage, familleExiste, maj, supprimer, verrouillerSuspension, majSuspension, supprimerSuspension,
  list, findById, insert, insertSuspension, listSuspensions,
  verrouiller, responsableValide, majResponsable, transfererSaisies, campagneEnCours, notifier,
};
