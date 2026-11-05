const pool = require('../../db/pool');
const { HttpError } = require('../../utils/httpError');

function estResponsablePole(req) {
  return req.user?.role === 'RESPONSABLE_POLE';
}

function ajouterRestrictionPole(req, conditions, values) {
  if (estResponsablePole(req)) {
    values.push(req.user.id);
    conditions.push(`EXISTS (
      SELECT 1
      FROM pole p
      WHERE p.id = s.pole_id
        AND p.responsable_id = $${values.length}
    )`);
  }
}

async function list(req, res) {
  const conditions = [];
  const values = [];

  if (req.query.campagne_id) {
    values.push(req.query.campagne_id);
    conditions.push(`s.campagne_id = $${values.length}`);
  }

  if (req.query.pole_id) {
    values.push(req.query.pole_id);
    conditions.push(`s.pole_id = $${values.length}`);
  }

  if (req.query.statut) {
    values.push(req.query.statut);
    conditions.push(`s.statut::text = $${values.length}`);
  }

  ajouterRestrictionPole(req, conditions, values);

  const where = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const result = await pool.query(
    `
    SELECT
      s.id,
      s.campagne_id,
      s.pole_id,
      s.critere_id,
      s.valeur_realisee,
      s.commentaire,
      s.motif_non_renseigne,
      s.statut,
      s.source,
      s.cle_idempotence,
      s.date_soumission,
      s.saisi_par,
      s.valide_par,
      s.date_validation
    FROM saisie s
    ${where}
    ORDER BY s.date_soumission DESC NULLS LAST
    `,
    values
  );

  res.json({
    data: result.rows,
    count: result.rowCount,
  });
}

async function getById(req, res) {
  const values = [req.params.id];
  let restriction = '';

  if (estResponsablePole(req)) {
    values.push(req.user.id);
    restriction = `
      AND EXISTS (
        SELECT 1
        FROM pole p
        WHERE p.id = s.pole_id
          AND p.responsable_id = $2
      )
    `;
  }

  const result = await pool.query(
    `
    SELECT
      s.id,
      s.campagne_id,
      s.pole_id,
      s.critere_id,
      s.valeur_realisee,
      s.commentaire,
      s.motif_non_renseigne,
      s.statut,
      s.source,
      s.cle_idempotence,
      s.date_soumission,
      s.saisi_par,
      s.valide_par,
      s.date_validation
    FROM saisie s
    WHERE s.id = $1
    ${restriction}
    `,
    values
  );

  if (result.rowCount === 0) {
    throw new HttpError(404, 'NOT_FOUND', 'Saisie introuvable');
  }

  res.json(result.rows[0]);
}

async function verifierPoleAutorise(req, poleId) {
  if (!estResponsablePole(req)) return;

  const result = await pool.query(
    `
    SELECT id
    FROM pole
    WHERE id = $1
      AND responsable_id = $2
    `,
    [poleId, req.user.id]
  );

  if (result.rowCount === 0) {
    throw new HttpError(
      403,
      'POLE_FORBIDDEN',
      'Vous ne pouvez pas accéder à ce pôle'
    );
  }
}

async function create(req, res) {
  const {
    campagne_id,
    critere_id,
    pole_id,
    valeur_realisee,
    commentaire,
    motif_non_renseigne,
  } = req.body;

  if (!req.user?.id) {
    throw new HttpError(
      401,
      'UNAUTHENTICATED',
      'Utilisateur non authentifié'
    );
  }

  await verifierPoleAutorise(req, pole_id);

  const result = await pool.query(
    `
    INSERT INTO saisie (
      campagne_id,
      critere_id,
      pole_id,
      valeur_realisee,
      commentaire,
      motif_non_renseigne,
      statut,
      source,
      saisi_par
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      'BROUILLON',
      'ESPACE',
      $7
    )
    RETURNING *
    `,
    [
      campagne_id,
      critere_id,
      pole_id,
      valeur_realisee ?? null,
      commentaire ?? null,
      motif_non_renseigne ?? null,
      req.user.id,
    ]
  );

  res.status(201).json(result.rows[0]);
}

async function update(req, res) {
  const {
    valeur_realisee,
    commentaire,
    motif_non_renseigne,
  } = req.body;

  const current = await pool.query(
    `
    SELECT id, pole_id
    FROM saisie
    WHERE id = $1
    `,
    [req.params.id]
  );

  if (current.rowCount === 0) {
    throw new HttpError(404, 'NOT_FOUND', 'Saisie introuvable');
  }

  await verifierPoleAutorise(req, current.rows[0].pole_id);

  const result = await pool.query(
    `
    UPDATE saisie
    SET
      valeur_realisee = COALESCE($1, valeur_realisee),
      commentaire = COALESCE($2, commentaire),
      motif_non_renseigne = COALESCE($3, motif_non_renseigne)
    WHERE id = $4
    RETURNING *
    `,
    [
      valeur_realisee ?? null,
      commentaire ?? null,
      motif_non_renseigne ?? null,
      req.params.id,
    ]
  );

  res.json(result.rows[0]);
}

module.exports = {
  list,
  getById,
  create,
  update,
};
