const db = require('../../config/db');

const COLUMNS = `g.id, g.version, g.statut, g.date_validation AS "dateValidation",
                 g.valide_par AS "validePar", g.motif_changement AS "motifChangement"`;

async function list({ limit, offset }) {
  const [rows, count] = await Promise.all([
    db.query(`SELECT ${COLUMNS} FROM grille_notation g ORDER BY g.version DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    db.query('SELECT count(*)::int AS total FROM grille_notation'),
  ]);
  return { rows: rows.rows, total: count.rows[0].total };
}

async function findById(id, client = db) {
  const { rows } = await client.query(`SELECT ${COLUMNS} FROM grille_notation g WHERE g.id = $1`, [id]);
  return rows[0] || null;
}

async function verrouiller(client, id) {
  const { rows } = await client.query('SELECT id, version, statut FROM grille_notation WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] || null;
}

async function derniere(client, statut) {
  const { rows } = await client.query(
    `SELECT id, version FROM grille_notation WHERE ($1::statut_grille IS NULL OR statut = $1)
      ORDER BY version DESC LIMIT 1`, [statut || null],
  );
  return rows[0] || null;
}

async function brouillonExistant(client) {
  const { rows } = await client.query("SELECT id, version FROM grille_notation WHERE statut = 'BROUILLON' LIMIT 1");
  return rows[0] || null;
}

async function insert(client, version, motif) {
  const { rows } = await client.query(
    'INSERT INTO grille_notation (version, motif_changement) VALUES ($1, $2) RETURNING id', [version, motif || null],
  );
  return rows[0].id;
}

/** Copie pondérations et barèmes d'une grille source : l'ancienne version n'est jamais modifiée. */
async function copier(client, sourceId, cibleId) {
  await client.query(
    `INSERT INTO ponderation_axe (grille_id, axe_id, famille_id, poids, motif)
     SELECT $2, axe_id, famille_id, poids, motif FROM ponderation_axe WHERE grille_id = $1`, [sourceId, cibleId],
  );
  await client.query(
    `INSERT INTO ponderation_critere (grille_id, critere_id, famille_id, poids, applicable, motif)
     SELECT $2, critere_id, famille_id, poids, applicable, motif FROM ponderation_critere WHERE grille_id = $1`,
    [sourceId, cibleId],
  );
  await client.query(
    `INSERT INTO bareme (ponderation_critere_id, plancher, plafond)
     SELECT n.id, b.plancher, b.plafond
       FROM ponderation_critere o
       JOIN bareme b ON b.ponderation_critere_id = o.id
       JOIN ponderation_critere n ON n.grille_id = $2 AND n.critere_id = o.critere_id
                                 AND n.famille_id IS NOT DISTINCT FROM o.famille_id
      WHERE o.grille_id = $1`, [sourceId, cibleId],
  );
}

async function remplacerAxes(client, grilleId, items) {
  await client.query('DELETE FROM ponderation_axe WHERE grille_id = $1', [grilleId]);
  for (const p of items) {
    await client.query(
      'INSERT INTO ponderation_axe (grille_id, axe_id, famille_id, poids, motif) VALUES ($1,$2,$3,$4,$5)',
      [grilleId, p.axeId, p.familleId || null, p.poids, p.motif || null],
    );
  }
}

async function remplacerCriteres(client, grilleId, items) {
  await client.query('DELETE FROM ponderation_critere WHERE grille_id = $1', [grilleId]); // barèmes en cascade
  for (const p of items) {
    const { rows } = await client.query(
      `INSERT INTO ponderation_critere (grille_id, critere_id, famille_id, poids, applicable, motif)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [grilleId, p.critereId, p.familleId || null, p.poids, p.applicable, p.motif || null],
    );
    if (p.plancher !== undefined && p.plafond !== undefined) {
      await client.query(
        'INSERT INTO bareme (ponderation_critere_id, plancher, plafond) VALUES ($1,$2,$3)',
        [rows[0].id, p.plancher, p.plafond],
      );
    }
  }
}

/** Critères référencés qui ne sont pas encore validés (définition non approuvée). */
async function criteresNonValides(client, ids) {
  const { rows } = await client.query(
    'SELECT id, intitule FROM critere WHERE id = ANY($1::uuid[]) AND NOT valide', [ids],
  );
  return rows;
}

async function criteresInconnus(client, ids) {
  const { rows } = await client.query('SELECT id FROM critere WHERE id = ANY($1::uuid[])', [ids]);
  const connus = new Set(rows.map((r) => r.id));
  return ids.filter((i) => !connus.has(i));
}

async function valider(client, id, userId) {
  await client.query(
    "UPDATE grille_notation SET statut = 'VALIDEE', date_validation = current_date, valide_par = $2 WHERE id = $1",
    [id, userId],
  );
}

async function supprimer(client, id) {
  await client.query('DELETE FROM grille_notation WHERE id = $1', [id]);
}

async function pondérationsAxes(id, client = db) {
  const { rows } = await client.query(
    `SELECT pa.id, a.code AS axe, pa.axe_id AS "axeId", pa.famille_id AS "familleId",
            f.libelle AS famille, pa.poids, pa.motif
       FROM ponderation_axe pa JOIN axe a ON a.id = pa.axe_id
       LEFT JOIN famille_activite f ON f.id = pa.famille_id
      WHERE pa.grille_id = $1 ORDER BY (pa.famille_id IS NOT NULL), f.libelle, a.code`, [id],
  );
  return rows;
}

async function pondérationsCriteres(id, client = db) {
  const { rows } = await client.query(
    `SELECT pc.id, c.id AS "critereId", c.intitule, a.code AS axe, pc.famille_id AS "familleId",
            f.libelle AS famille, pc.poids, pc.applicable, pc.motif, b.plancher, b.plafond
       FROM ponderation_critere pc
       JOIN critere c ON c.id = pc.critere_id JOIN axe a ON a.id = c.axe_id
       LEFT JOIN famille_activite f ON f.id = pc.famille_id
       LEFT JOIN bareme b ON b.ponderation_critere_id = pc.id
      WHERE pc.grille_id = $1 ORDER BY (pc.famille_id IS NOT NULL), f.libelle, a.code, c.intitule`, [id],
  );
  return rows;
}

module.exports = {
  list, findById, verrouiller, derniere, brouillonExistant, insert, copier, remplacerAxes, remplacerCriteres,
  criteresNonValides, criteresInconnus, valider, supprimer, pondérationsAxes, pondérationsCriteres,
};
