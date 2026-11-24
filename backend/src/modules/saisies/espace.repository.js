const db = require('../../config/db');

const run = (client) => client || db;

async function campagne(id, client) {
  const { rows } = await run(client).query(
    `SELECT id, exercice, trimestre, statut, date_limite AS "dateLimite" FROM campagne WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function pole(campagneId, poleId, client) {
  const { rows } = await run(client).query(
    `SELECT p.id, p.code, p.intitule, p.responsable_id AS "responsableId", f.libelle AS famille
       FROM campagne_pole cp JOIN pole p ON p.id = cp.pole_id JOIN famille_activite f ON f.id = p.famille_id
      WHERE cp.campagne_id = $1 AND cp.pole_id = $2`, [campagneId, poleId]);
  return rows[0] || null;
}

/** Critères réellement notés pour le pôle (cible gelée à l'ouverture) + saisie existante + trimestre précédent. */
async function lignes(campagneId, poleId, exercice, trimestre, client) {
  const { rows } = await run(client).query(
    `SELECT cc.critere_id AS "critereId", c.intitule, c.definition, c.unite, a.code AS axe,
            c.sens_optimisation AS sens, c.justificatif_requis AS "justificatifRequis",
            c.valeur_min AS "valeurMin", c.valeur_max AS "valeurMax", c.variation_max_pct AS "variationMaxPct",
            cc.valeur_cible AS "valeurCible",
            s.id AS "saisieId", s.statut, s.valeur_realisee AS "valeurRealisee", s.commentaire,
            s.motif_non_renseigne AS "motifNonRenseigne", s.source,
            (SELECT count(*)::int FROM piece_justificative pj WHERE pj.saisie_id = s.id) AS "nbPieces",
            (SELECT r.motif FROM renvoi_correction r WHERE r.saisie_id = s.id ORDER BY r.date DESC LIMIT 1) AS "dernierRenvoi",
            prev.valeur_realisee AS "valeurPrecedente"
       FROM campagne_cible cc
       JOIN critere c ON c.id = cc.critere_id
       JOIN axe a ON a.id = c.axe_id
       LEFT JOIN saisie s ON s.campagne_id = cc.campagne_id AND s.pole_id = cc.pole_id AND s.critere_id = cc.critere_id
       LEFT JOIN LATERAL (
            SELECT s2.valeur_realisee FROM saisie s2 JOIN campagne c2 ON c2.id = s2.campagne_id
             WHERE s2.pole_id = cc.pole_id AND s2.critere_id = cc.critere_id AND s2.statut = 'VALIDEE'
               AND (c2.exercice * 4 + c2.trimestre) < ($3::int * 4 + $4::int)
             ORDER BY c2.exercice DESC, c2.trimestre DESC LIMIT 1) prev ON true
      WHERE cc.campagne_id = $1 AND cc.pole_id = $2
      ORDER BY a.code, c.intitule`,
    [campagneId, poleId, exercice, trimestre]);
  return rows;
}

async function pieces(saisieIds, client) {
  if (!saisieIds.length) return [];
  const { rows } = await run(client).query(
    `SELECT id, saisie_id AS "saisieId", nom_fichier AS "nomFichier", type_mime AS "typeMime",
            taille_octets AS "tailleOctets", depose_le AS "deposeLe"
       FROM piece_justificative WHERE saisie_id = ANY($1::uuid[]) ORDER BY depose_le`, [saisieIds]);
  return rows;
}

async function trouverSaisie(client, campagneId, poleId, critereId) {
  const { rows } = await client.query(
    'SELECT id, statut FROM saisie WHERE campagne_id = $1 AND pole_id = $2 AND critere_id = $3 FOR UPDATE',
    [campagneId, poleId, critereId]);
  return rows[0] || null;
}

async function critereDuPerimetre(client, campagneId, poleId, critereId) {
  const { rows } = await client.query(
    `SELECT c.unite, c.valeur_min AS "valeurMin", c.valeur_max AS "valeurMax", c.variation_max_pct AS "variationMaxPct",
            c.justificatif_requis AS "justificatifRequis"
       FROM campagne_cible cc JOIN critere c ON c.id = cc.critere_id
      WHERE cc.campagne_id = $1 AND cc.pole_id = $2 AND cc.critere_id = $3`, [campagneId, poleId, critereId]);
  return rows[0] || null;
}

async function inserer(client, d, userId) {
  const { rows } = await client.query(
    `INSERT INTO saisie (campagne_id, pole_id, critere_id, valeur_realisee, commentaire, motif_non_renseigne,
                         statut, source, saisi_par)
     VALUES ($1,$2,$3,$4,$5,$6,'BROUILLON','ESPACE',$7) RETURNING id`,
    [d.campagneId, d.poleId, d.critereId, d.valeurRealisee, d.commentaire, d.motifNonRenseigne, userId]);
  return rows[0].id;
}

async function remplacer(client, id, d) {
  await client.query(
    'UPDATE saisie SET valeur_realisee = $2, commentaire = $3, motif_non_renseigne = $4 WHERE id = $1',
    [id, d.valeurRealisee, d.commentaire, d.motifNonRenseigne]);
}

async function soumettre(client, ids) {
  await client.query(
    "UPDATE saisie SET statut = 'SOUMISE', date_soumission = now() WHERE id = ANY($1::uuid[])", [ids]);
}

/** Reprise par le responsable : SOUMISE -> RENVOYEE (statut éditable). Les saisies validées ne sont pas concernées. */
async function reprendre(client, campagneId, poleId) {
  const { rows } = await client.query(
    `UPDATE saisie SET statut = 'RENVOYEE' WHERE campagne_id = $1 AND pole_id = $2 AND statut = 'SOUMISE' RETURNING id`,
    [campagneId, poleId]);
  return rows.length;
}

async function effacer(client, id) {
  await client.query('DELETE FROM saisie WHERE id = $1', [id]);
}

async function validerPole(client, campagneId, poleId, userId) {
  const { rows } = await client.query(
    `UPDATE saisie SET statut = 'VALIDEE', valide_par = $3, date_validation = now()
      WHERE campagne_id = $1 AND pole_id = $2 AND statut = 'SOUMISE' AND (saisi_par IS NULL OR saisi_par <> $3)
      RETURNING id`, [campagneId, poleId, userId]);
  return rows.length;
}

async function avancement(campagneId, responsableId) {
  const { rows } = await db.query(
    `SELECT p.id AS "poleId", p.code AS "poleCode", p.intitule, f.libelle AS famille,
            (SELECT count(*)::int FROM campagne_cible cc WHERE cc.campagne_id = cp.campagne_id AND cc.pole_id = cp.pole_id) AS total,
            count(s.id)::int AS "saisies",
            count(*) FILTER (WHERE s.statut = 'BROUILLON')::int AS brouillons,
            count(*) FILTER (WHERE s.statut = 'SOUMISE')::int AS soumises,
            count(*) FILTER (WHERE s.statut = 'VALIDEE')::int AS validees,
            count(*) FILTER (WHERE s.statut = 'RENVOYEE')::int AS renvoyees
       FROM campagne_pole cp
       JOIN pole p ON p.id = cp.pole_id JOIN famille_activite f ON f.id = p.famille_id
       LEFT JOIN saisie s ON s.campagne_id = cp.campagne_id AND s.pole_id = cp.pole_id
      WHERE cp.campagne_id = $1 AND ($2::uuid IS NULL OR p.responsable_id = $2)
      GROUP BY p.id, p.code, p.intitule, f.libelle, cp.campagne_id, cp.pole_id
      ORDER BY p.code`, [campagneId, responsableId || null]);
  return rows;
}

async function destinatairesControle(client) {
  const { rows } = await client.query("SELECT id FROM utilisateur WHERE actif AND role = 'CONTROLE_GESTION'");
  return rows.map((r) => r.id);
}

async function notifier(client, campagneId, destinataireIds, message) {
  for (const id of destinataireIds) {
    await client.query(
      "INSERT INTO notification (campagne_id, destinataire_id, canal, message) VALUES ($1,$2,'APPLICATION',$3)",
      [campagneId, id, message]);
  }
}

module.exports = { reprendre, effacer,
  campagne, pole, lignes, pieces, trouverSaisie, critereDuPerimetre, inserer, remplacer, soumettre, validerPole,
  avancement, destinatairesControle, notifier,
};
