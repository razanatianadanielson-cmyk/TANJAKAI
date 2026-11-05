const db = require('../../config/db');

const COLONNES = `a.id, a.type, a.statut, a.message, a.date_creation AS "dateCreation",
       a.accuse_par AS "accusePar", a.date_accuse AS "dateAccuse",
       a.pole_id AS "poleId", p.code AS "poleCode", p.intitule AS "poleIntitule",
       sp.score_consolide AS "scoreConsolide", sp.partiel,
       c.id AS "campagneId", c.exercice, c.trimestre,
       s.valeur AS seuil, s.axe_id AS "seuilAxeId",
       (SELECT count(*)::int FROM plan_action pa WHERE pa.alerte_id = a.id) AS "nbPlans",
       (SELECT count(*)::int FROM plan_action pa WHERE pa.alerte_id = a.id AND pa.statut <> 'TERMINE') AS "nbPlansOuverts"`;
const JOINTURES = `FROM alerte a
       JOIN pole p ON p.id = a.pole_id
       JOIN score_pole sp ON sp.id = a.score_pole_id
       JOIN campagne c ON c.id = sp.campagne_id
       JOIN seuil_critique s ON s.id = a.seuil_id`;

async function lister({ statuts, type, poleId, exercice, trimestre, responsableId }, offset, limit) {
  const where = [];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (statuts) add('a.statut = ANY(?::statut_alerte[])', statuts);
  if (type) add('a.type = ?', type);
  if (poleId) add('a.pole_id = ?', poleId);
  if (exercice) add('c.exercice = ?', exercice);
  if (trimestre) add('c.trimestre = ?', trimestre);
  if (responsableId) add('p.responsable_id = ?', responsableId);
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await db.query(`SELECT count(*)::int AS n ${JOINTURES} ${w}`, params);
  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT ${COLONNES} ${JOINTURES} ${w}
      ORDER BY (a.statut = 'CLOTUREE'), a.date_creation DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { rows, total: total.rows[0].n };
}

async function trouver(runner, id) {
  const { rows } = await (runner || db).query(
    `SELECT ${COLONNES}, p.responsable_id AS "responsableId" ${JOINTURES} WHERE a.id = $1`, [id]);
  return rows[0] || null;
}

async function verrouiller(client, id) {
  const { rows } = await client.query(
    `SELECT a.id, a.statut, a.pole_id AS "poleId", a.type, p.responsable_id AS "responsableId", p.code AS "poleCode"
       FROM alerte a JOIN pole p ON p.id = a.pole_id WHERE a.id = $1 FOR UPDATE OF a`, [id]);
  return rows[0] || null;
}

async function plans(runner, alerteId) {
  const { rows } = await (runner || db).query(
    `SELECT id, description, echeance, statut,
            (statut <> 'TERMINE' AND echeance < CURRENT_DATE) AS "enRetard"
       FROM plan_action WHERE alerte_id = $1 ORDER BY echeance, description`, [alerteId]);
  return rows;
}

async function ajouterPlan(client, alerteId, { description, echeance }) {
  const { rows } = await client.query(
    `INSERT INTO plan_action (alerte_id, description, echeance) VALUES ($1,$2,$3)
     RETURNING id, description, echeance, statut`, [alerteId, description, echeance]);
  return rows[0];
}

async function majPlan(client, alerteId, planId, statut) {
  const { rows } = await client.query(
    'UPDATE plan_action SET statut = $3 WHERE id = $2 AND alerte_id = $1 RETURNING id, description, echeance, statut',
    [alerteId, planId, statut]);
  return rows[0] || null;
}

async function accuser(client, id, userId) {
  await client.query("UPDATE alerte SET statut = 'ACCUSEE', accuse_par = $2, date_accuse = now() WHERE id = $1", [id, userId]);
}

async function cloturer(client, id) {
  await client.query("UPDATE alerte SET statut = 'CLOTUREE' WHERE id = $1", [id]);
}

async function notifier(client, alerteId, destinataireIds, message) {
  for (const id of new Set(destinataireIds)) {
    await client.query(
      "INSERT INTO notification (alerte_id, destinataire_id, canal, message) VALUES ($1,$2,'APPLICATION',$3)",
      [alerteId, id, message]);
  }
}

async function utilisateursParRole(client, role) {
  const { rows } = await client.query('SELECT id FROM utilisateur WHERE actif AND role = $1', [role]);
  return rows.map((r) => r.id);
}

// --- Seuils ---
async function seuils() {
  const { rows } = await db.query(
    `SELECT s.id, s.axe_id AS "axeId", a.code AS "axeCode", s.valeur, s.ecart_degradation AS "ecartDegradation",
            s.date_effet AS "dateEffet",
            (s.date_effet = (SELECT max(s2.date_effet) FROM seuil_critique s2
                              WHERE s2.axe_id IS NOT DISTINCT FROM s.axe_id AND s2.date_effet <= CURRENT_DATE)) AS "enVigueur"
       FROM seuil_critique s LEFT JOIN axe a ON a.id = s.axe_id
      ORDER BY (s.axe_id IS NOT NULL), a.code, s.date_effet DESC`);
  return rows;
}

async function creerSeuil(client, { axeId, valeur, ecartDegradation, dateEffet }) {
  const { rows } = await client.query(
    `INSERT INTO seuil_critique (axe_id, valeur, ecart_degradation, date_effet) VALUES ($1,$2,$3,$4)
     RETURNING id, axe_id AS "axeId", valeur, ecart_degradation AS "ecartDegradation", date_effet AS "dateEffet"`,
    [axeId || null, valeur, ecartDegradation ?? null, dateEffet]);
  return rows[0];
}

module.exports = {
  lister, trouver, verrouiller, plans, ajouterPlan, majPlan, accuser, cloturer, notifier,
  utilisateursParRole, seuils, creerSeuil,
};
