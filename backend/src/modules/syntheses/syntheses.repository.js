const db = require('../../config/db');

const run = (client) => client || db;

async function campagne(id, client) {
  const { rows } = await run(client).query(
    'SELECT id, exercice, trimestre, statut FROM campagne WHERE id = $1', [id]);
  return rows[0] || null;
}

async function campagnePrecedenteCloturee(exercice, trimestre, client) {
  const { rows } = await run(client).query(
    "SELECT id FROM campagne WHERE (exercice * 4 + trimestre) = $1 AND statut = 'CLOTUREE'", [exercice * 4 + trimestre - 1]);
  return rows[0] ? rows[0].id : null;
}

/** Scores courants d'une campagne, une ligne par critère : uniquement des données chiffrées et des intitulés. */
async function lignesScores(campagneId, poleId, client) {
  const { rows } = await run(client).query(
    `SELECT v.pole_id AS "poleId", p.code, p.intitule, f.libelle AS famille,
            v.score_consolide AS "scoreConsolide", v.partiel,
            a.code AS "axeCode", a.libelle AS "axeLibelle", sa.note AS "axeNote", sa.poids AS "axePoids",
            cr.intitule AS critere, cr.unite, sc.valeur_saisie AS valeur, sc.valeur_cible AS cible,
            sc.taux_atteinte AS taux, sc.note, sc.poids
       FROM v_score_courant v
       JOIN pole p ON p.id = v.pole_id
       JOIN famille_activite f ON f.id = p.famille_id
       JOIN score_axe sa ON sa.score_pole_id = v.score_pole_id
       JOIN axe a ON a.id = sa.axe_id
       LEFT JOIN score_critere sc ON sc.score_axe_id = sa.id
       LEFT JOIN critere cr ON cr.id = sc.critere_id
      WHERE v.campagne_id = $1 AND ($2::uuid IS NULL OR v.pole_id = $2)
      ORDER BY p.code, a.code, cr.intitule`, [campagneId, poleId || null]);
  return rows;
}

const SELECT = `SELECT s.id, s.campagne_id AS "campagneId", c.exercice, c.trimestre, s.type, s.pole_id AS "poleId",
                       p.code AS "poleCode", p.intitule AS "poleIntitule", p.responsable_id AS "responsableId",
                       s.contenu, s.contenu_origine AS "contenuOrigine", s.generee_automatiquement AS "genereeAutomatiquement",
                       s.statut, s.mode, s.motif_degrade AS "motifDegrade", s.modele, s.donnees,
                       s.valide_par AS "validePar", s.date_validation AS "dateValidation", s.cree_le AS "creeLe",
                       s.date_modification AS "dateModification",
                       (SELECT COALESCE(sum(j.cout), 0) FROM journal_cout_ia j WHERE j.synthese_id = s.id) AS cout
                  FROM synthese_trimestrielle s
                  JOIN campagne c ON c.id = s.campagne_id
                  LEFT JOIN pole p ON p.id = s.pole_id`;

async function lister({ campagneId, poleId, statut, type, seulementValidees, responsableId, limit, offset }) {
  const params = [campagneId || null, poleId || null, statut || null, type || null, seulementValidees || false, responsableId || null];
  const where = `WHERE ($1::uuid IS NULL OR s.campagne_id = $1) AND ($2::uuid IS NULL OR s.pole_id = $2)
                   AND ($3::text IS NULL OR s.statut::text = $3) AND ($4::text IS NULL OR s.type::text = $4)
                   AND (NOT $5::boolean OR s.statut = 'VALIDEE')
                   AND ($6::uuid IS NULL OR (s.type = 'POLE' AND p.responsable_id = $6))`;
  const from = `FROM synthese_trimestrielle s LEFT JOIN pole p ON p.id = s.pole_id ${where}`;
  const [rows, count] = await Promise.all([
    db.query(`${SELECT} ${where} ORDER BY c.exercice DESC, c.trimestre DESC, s.type DESC, p.code NULLS FIRST LIMIT $7 OFFSET $8`,
      [...params, limit, offset]),
    db.query(`SELECT count(*)::int AS total ${from}`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function trouver(id, client) {
  const { rows } = await run(client).query(`${SELECT} WHERE s.id = $1`, [id]);
  return rows[0] || null;
}

async function existante(client, campagneId, type, poleId) {
  const { rows } = await client.query(
    `SELECT id, statut FROM synthese_trimestrielle
      WHERE campagne_id = $1 AND type = $2 AND pole_id IS NOT DISTINCT FROM $3
      ORDER BY (statut = 'VALIDEE') DESC LIMIT 1 FOR UPDATE`, [campagneId, type, poleId]);
  return rows[0] || null;
}

async function inserer(client, d) {
  const { rows } = await client.query(
    `INSERT INTO synthese_trimestrielle
       (campagne_id, pole_id, type, contenu, contenu_origine, generee_automatiquement, statut, mode, motif_degrade, modele, donnees, genere_par)
     VALUES ($1,$2,$3,$4,$4,true,'BROUILLON',$5,$6,$7,$8,$9) RETURNING id`,
    [d.campagneId, d.poleId, d.type, d.contenu, d.mode, d.motifDegrade, d.modele, JSON.stringify(d.donnees), d.userId]);
  return rows[0].id;
}

async function regenerer(client, id, d) {
  await client.query(
    `UPDATE synthese_trimestrielle
        SET contenu = $2, contenu_origine = $2, mode = $3, motif_degrade = $4, modele = $5, donnees = $6,
            genere_par = $7, modifie_par = NULL, date_modification = NULL, cree_le = now()
      WHERE id = $1`,
    [id, d.contenu, d.mode, d.motifDegrade, d.modele, JSON.stringify(d.donnees), d.userId]);
}

async function journaliserCout(client, syntheseId, { modele, tokensEntree, tokensSortie, cout }) {
  await client.query(
    'INSERT INTO journal_cout_ia (synthese_id, modele, tokens_entree, tokens_sortie, cout) VALUES ($1,$2,$3,$4,$5)',
    [syntheseId, modele, tokensEntree, tokensSortie, cout]);
}

async function modifierContenu(client, id, contenu, userId) {
  await client.query(
    'UPDATE synthese_trimestrielle SET contenu = $2, modifie_par = $3, date_modification = now() WHERE id = $1', [id, contenu, userId]);
}

async function valider(client, id, userId) {
  await client.query(
    "UPDATE synthese_trimestrielle SET statut = 'VALIDEE', valide_par = $2, date_validation = now() WHERE id = $1", [id, userId]);
}

/** Dépense du mois civil en cours (dollars) et nombre d'appels. */
async function coutDuMois(client) {
  const { rows } = await run(client).query(
    `SELECT COALESCE(sum(cout), 0)::float8 AS consomme, count(*)::int AS appels
       FROM journal_cout_ia WHERE date >= date_trunc('month', now())`);
  return rows[0];
}

async function derniersAppels(limit) {
  const { rows } = await db.query(
    `SELECT j.id, j.modele, j.tokens_entree AS "tokensEntree", j.tokens_sortie AS "tokensSortie", j.cout::float8 AS cout, j.date,
            s.type, p.code AS "poleCode", c.exercice, c.trimestre
       FROM journal_cout_ia j
       JOIN synthese_trimestrielle s ON s.id = j.synthese_id
       JOIN campagne c ON c.id = s.campagne_id
       LEFT JOIN pole p ON p.id = s.pole_id
      ORDER BY j.date DESC LIMIT $1`, [limit]);
  return rows;
}

async function destinataires(client, { poleId }) {
  const { rows } = await client.query(
    `SELECT id FROM utilisateur WHERE actif AND role = 'DIRECTION_GENERALE'
     UNION SELECT responsable_id FROM pole WHERE id = $1 AND responsable_id IS NOT NULL`, [poleId || null]);
  return rows.map((r) => r.id);
}

async function notifier(client, campagneId, destinataireIds, message) {
  for (const id of destinataireIds) {
    await client.query(
      "INSERT INTO notification (campagne_id, destinataire_id, canal, message) VALUES ($1,$2,'APPLICATION',$3)", [campagneId, id, message]);
  }
}

module.exports = {
  campagne, campagnePrecedenteCloturee, lignesScores, lister, trouver, existante, inserer, regenerer,
  journaliserCout, modifierContenu, valider, coutDuMois, derniersAppels, destinataires, notifier,
};
