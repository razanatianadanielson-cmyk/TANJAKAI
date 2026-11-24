const db = require('../../config/db');

const COLUMNS = `c.id, c.axe_id AS "axeId", a.code AS axe, c.intitule, c.definition, c.unite,
                 c.sens_optimisation AS "sensOptimisation", c.source_donnee AS "sourceDonnee",
                 c.justificatif_requis AS "justificatifRequis", c.valide, c.valide_par AS "validePar",
                 c.date_validation AS "dateValidation", c.valeur_min AS "valeurMin",
                 c.valeur_max AS "valeurMax", c.variation_max_pct AS "variationMaxPct"`;

async function list({ axeId, valide, limit, offset }) {
  const params = [axeId || null, valide ?? null];
  const where = 'WHERE ($1::uuid IS NULL OR c.axe_id = $1) AND ($2::boolean IS NULL OR c.valide = $2)';
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT ${COLUMNS} FROM critere c JOIN axe a ON a.id = c.axe_id ${where}
        ORDER BY a.code, c.intitule LIMIT $3 OFFSET $4`,
      [...params, limit, offset],
    ),
    db.query(`SELECT count(*)::int AS total FROM critere c ${where}`, params),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function findById(id, client = db) {
  const { rows } = await client.query(
    `SELECT ${COLUMNS} FROM critere c JOIN axe a ON a.id = c.axe_id WHERE c.id = $1`, [id],
  );
  return rows[0] || null;
}

async function insert(client, d) {
  const { rows } = await client.query(
    `INSERT INTO critere (axe_id, intitule, definition, unite, sens_optimisation, source_donnee,
                          justificatif_requis, valeur_min, valeur_max, variation_max_pct)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [d.axeId, d.intitule, d.definition, d.unite, d.sensOptimisation, d.sourceDonnee,
      d.justificatifRequis ?? false, d.valeurMin ?? null, d.valeurMax ?? null, d.variationMaxPct ?? null],
  );
  return rows[0].id;
}

const FIELDS = {
  intitule: 'intitule', definition: 'definition', unite: 'unite', sensOptimisation: 'sens_optimisation',
  sourceDonnee: 'source_donnee', justificatifRequis: 'justificatif_requis',
  valeurMin: 'valeur_min', valeurMax: 'valeur_max', variationMaxPct: 'variation_max_pct',
};

async function update(client, id, data) {
  const sets = []; const params = [id];
  for (const [key, col] of Object.entries(FIELDS)) {
    if (data[key] !== undefined) { params.push(data[key]); sets.push(`${col} = $${params.length}`); }
  }
  await client.query(`UPDATE critere SET ${sets.join(', ')} WHERE id = $1`, params);
}

/** Où le critère sert déjà : cibles, grilles, périmètres gelés, saisies, scores. */
async function usage(client, id) {
  const { rows } = await client.query(
    `SELECT (SELECT count(*) FROM cible WHERE critere_id = $1)::int AS cibles,
            (SELECT count(*) FROM ponderation_critere WHERE critere_id = $1)::int AS grilles,
            (SELECT count(*) FROM campagne_cible WHERE critere_id = $1)::int AS campagnes,
            (SELECT count(*) FROM saisie WHERE critere_id = $1)::int AS saisies,
            (SELECT count(*) FROM score_critere WHERE critere_id = $1)::int AS scores`, [id]);
  return rows[0];
}

async function supprimer(client, id) {
  await client.query('DELETE FROM critere WHERE id = $1', [id]);
}

async function valider(client, id, userId) {
  await client.query(
    'UPDATE critere SET valide = true, valide_par = $2, date_validation = current_date WHERE id = $1',
    [id, userId],
  );
}

async function verrouiller(client, id) {
  const { rows } = await client.query('SELECT id, valide FROM critere WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] || null;
}

module.exports = { usage, supprimer, list, findById, insert, update, valider, verrouiller };
