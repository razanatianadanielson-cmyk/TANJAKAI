const db = require('../../config/db');
const { arrondi } = require('./engine');

const run = (runner) => runner || db;

// ---------- Lecture des entrées du moteur (valeurs gelées de la campagne) ----------

async function chargerEntrees(runner, campagneId, grilleId) {
  const q = run(runner);
  const [poles, criteres, axes] = await Promise.all([
    q.query(
      `SELECT cp.pole_id AS "poleId", p.code AS "poleCode"
         FROM campagne_pole cp JOIN pole p ON p.id = cp.pole_id
        WHERE cp.campagne_id = $1 ORDER BY p.code`,
      [campagneId],
    ),
    // critères notés : cible GELÉE (campagne_cible) + pondération et barème de la grille GELÉE,
    // la pondération de la famille d'activité l'emportant sur celle par défaut
    q.query(
      `SELECT cp.pole_id AS "poleId", c.axe_id AS "axeId", a.code AS "axeCode",
              cc.critere_id AS "critereId", c.intitule, c.sens_optimisation AS "sens",
              cc.valeur_cible AS "valeurCible", pc.poids AS "poidsCritere", b.plancher, b.plafond,
              s.valeur_realisee AS "valeurRealisee", COALESCE(s.statut = 'VALIDEE', false) AS "saisieValidee"
         FROM campagne_pole cp
         JOIN pole p ON p.id = cp.pole_id
         JOIN campagne_cible cc ON cc.campagne_id = cp.campagne_id AND cc.pole_id = cp.pole_id
         JOIN critere c ON c.id = cc.critere_id
         JOIN axe a ON a.id = c.axe_id
         JOIN LATERAL (
              SELECT DISTINCT ON (x.critere_id) x.id, x.poids, x.applicable
                FROM ponderation_critere x
               WHERE x.grille_id = $2 AND x.critere_id = cc.critere_id
                 AND (x.famille_id = p.famille_id OR x.famille_id IS NULL)
               ORDER BY x.critere_id, (x.famille_id IS NULL)
         ) pc ON pc.applicable
         JOIN bareme b ON b.ponderation_critere_id = pc.id
         LEFT JOIN saisie s ON s.campagne_id = cp.campagne_id AND s.pole_id = cp.pole_id AND s.critere_id = cc.critere_id
        WHERE cp.campagne_id = $1`,
      [campagneId, grilleId],
    ),
    q.query(
      `SELECT DISTINCT ON (p.id, pa.axe_id) p.id AS "poleId", pa.axe_id AS "axeId", pa.poids
         FROM campagne_pole cp
         JOIN pole p ON p.id = cp.pole_id
         JOIN ponderation_axe pa ON pa.grille_id = $2 AND (pa.famille_id = p.famille_id OR pa.famille_id IS NULL)
        WHERE cp.campagne_id = $1
        ORDER BY p.id, pa.axe_id, (pa.famille_id IS NULL)`,
      [campagneId, grilleId],
    ),
  ]);
  return { poles: poles.rows, criteres: criteres.rows, axes: axes.rows };
}

// ---------- Historisation ----------

async function prochaineVersion(runner, poleId, campagneId) {
  const { rows } = await run(runner).query(
    'SELECT COALESCE(MAX(version), 0) + 1 AS v FROM score_pole WHERE pole_id = $1 AND campagne_id = $2',
    [poleId, campagneId],
  );
  return rows[0].v;
}

// numeric(10,4), CHECK >= 0 : un taux négatif est ramené à 0 (la note est identique), l'infini est plafonné
const tauxStocke = (t) => (t === null ? null : arrondi(Math.min(Math.max(t, 0), 9999.9999), 4));

/** Copie complète (valeurs, cibles, pondérations, barèmes) : le score ne dépend plus de la grille courante. */
async function insererScore(client, { poleId, campagneId, grilleId, version, resultat }) {
  const sp = await client.query(
    `INSERT INTO score_pole (pole_id, campagne_id, version, grille_id, score_consolide, partiel, fige)
     VALUES ($1, $2, $3, $4, $5, $6, false) RETURNING id`,
    [poleId, campagneId, version, grilleId, resultat.scoreConsolide, resultat.partiel],
  );
  const scorePoleId = sp.rows[0].id;
  for (const axe of resultat.axes) {
    const sa = await client.query(
      'INSERT INTO score_axe (score_pole_id, axe_id, note, poids) VALUES ($1, $2, $3, $4) RETURNING id',
      [scorePoleId, axe.axeId, axe.note, axe.poidsNominal],
    );
    for (const c of axe.criteres) {
      await client.query(
        `INSERT INTO score_critere (score_axe_id, critere_id, valeur_saisie, valeur_cible, taux_atteinte,
                                    note, poids, plancher, plafond, sens_optimisation)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [sa.rows[0].id, c.critereId, c.valeurSaisie, c.valeurCible, tauxStocke(c.tauxAtteinte),
          c.note, c.poidsNominal, c.plancher, c.plafond, c.sens],
      );
    }
  }
  return scorePoleId;
}

async function figer(client, scorePoleId) {
  await client.query('UPDATE score_pole SET fige = true WHERE id = $1', [scorePoleId]);
}

// ---------- Restitution ----------

function filtresScores({ campagneId, poleId, responsableId }) {
  return [campagneId || null, poleId || null, responsableId || null];
}
const WHERE_SCORES = `WHERE ($1::uuid IS NULL OR v.campagne_id = $1)
                        AND ($2::uuid IS NULL OR v.pole_id = $2)
                        AND ($3::uuid IS NULL OR p.responsable_id = $3)`;

async function listerScores(filters, { limit, offset }) {
  const params = filtresScores(filters);
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT v.score_pole_id AS id, v.pole_id AS "poleId", v.pole_code AS "poleCode", v.pole_intitule AS "poleIntitule",
              v.campagne_id AS "campagneId", v.exercice, v.trimestre, v.version,
              v.score_consolide AS "scoreConsolide", v.partiel, v.fige, v.date_calcul AS "dateCalcul",
              v.famille_id AS "familleId", f.libelle AS famille
         FROM v_score_courant v JOIN pole p ON p.id = v.pole_id JOIN famille_activite f ON f.id = v.famille_id
         ${WHERE_SCORES}
        ORDER BY v.exercice DESC, v.trimestre DESC, v.pole_code LIMIT $4 OFFSET $5`,
      [...params, limit, offset],
    ),
    db.query(`SELECT count(*)::int AS total FROM v_score_courant v JOIN pole p ON p.id = v.pole_id ${WHERE_SCORES}`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function trouverScore(id) {
  const sp = await db.query(
    `SELECT sp.id, sp.pole_id AS "poleId", sp.campagne_id AS "campagneId", sp.version, sp.grille_id AS "grilleId",
            sp.score_consolide AS "scoreConsolide", sp.partiel, sp.fige, sp.date_calcul AS "dateCalcul",
            p.code AS "poleCode", p.intitule AS "poleIntitule", p.responsable_id AS "responsableId",
            c.exercice, c.trimestre
       FROM score_pole sp JOIN pole p ON p.id = sp.pole_id JOIN campagne c ON c.id = sp.campagne_id
      WHERE sp.id = $1`,
    [id],
  );
  if (!sp.rows[0]) return null;
  const axes = await db.query(
    `SELECT sa.id, sa.axe_id AS "axeId", a.code, a.libelle, sa.note, sa.poids
       FROM score_axe sa JOIN axe a ON a.id = sa.axe_id WHERE sa.score_pole_id = $1 ORDER BY a.code`,
    [id],
  );
  const criteres = axes.rows.length
    ? await db.query(
      `SELECT sc.score_axe_id AS "scoreAxeId", sc.critere_id AS "critereId", cr.intitule, cr.unite,
              sc.valeur_saisie AS "valeurSaisie", sc.valeur_cible AS "valeurCible", sc.taux_atteinte AS "tauxAtteinte",
              sc.note, sc.poids, sc.plancher, sc.plafond, sc.sens_optimisation AS sens
         FROM score_critere sc JOIN critere cr ON cr.id = sc.critere_id
        WHERE sc.score_axe_id = ANY($1::uuid[]) ORDER BY cr.intitule`,
      [axes.rows.map((a) => a.id)],
    )
    : { rows: [] };
  return {
    ...sp.rows[0],
    axes: axes.rows.map((a) => ({ ...a, criteres: criteres.rows.filter((c) => c.scoreAxeId === a.id) })),
  };
}

module.exports = { chargerEntrees, prochaineVersion, insererScore, figer, listerScores, trouverScore };
