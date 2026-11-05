const db = require('../../config/db');
const pool = require('../../db/pool');
const { HttpError } = require('../../utils/httpError');

async function verifierAccesPole(req, saisieId) {
  if (req.user?.role !== 'RESPONSABLE_POLE') return;

  const result = await pool.query(
    `SELECT s.id FROM saisie s JOIN pole p ON p.id = s.pole_id
      WHERE s.id = $1 AND p.responsable_id = $2`,
    [saisieId, req.user.id]
  );

  if (result.rowCount === 0) {
    throw new HttpError(403, 'POLE_FORBIDDEN', 'Vous ne pouvez pas agir sur cette saisie');
  }
}

async function soumettre(req, res) {
  await verifierAccesPole(req, req.params.id);

  const result = await db.withTransaction({ userId: req.user.id, motif: 'Soumission d\'une saisie' }, (client) =>
    client.query(
      `UPDATE saisie SET statut = 'SOUMISE', date_soumission = now()
        WHERE id = $1 AND statut IN ('BROUILLON', 'RENVOYEE') RETURNING *`,
      [req.params.id]
    )
  );

  if (result.rowCount === 0) {
    throw new HttpError(409, 'INVALID_STATUS', 'La saisie doit être en brouillon ou renvoyée pour être soumise');
  }

  res.json(result.rows[0]);
}

async function valider(req, res) {
  const result = await db.withTransaction({ userId: req.user.id, motif: 'Validation d\'une saisie' }, async (client) => {
    const saisie = await client.query('SELECT id, statut, saisi_par FROM saisie WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (saisie.rowCount === 0) throw new HttpError(404, 'NOT_FOUND', 'Saisie introuvable');
    const row = saisie.rows[0];
    if (row.statut !== 'SOUMISE') throw new HttpError(409, 'INVALID_STATUS', 'Seule une saisie soumise peut être validée');
    if (row.saisi_par && req.user.id === row.saisi_par) {
      throw new HttpError(403, 'SELF_VALIDATION_FORBIDDEN', 'Un utilisateur ne peut pas valider sa propre saisie');
    }
    return client.query(
      `UPDATE saisie SET statut = 'VALIDEE', valide_par = $2, date_validation = now()
        WHERE id = $1 RETURNING *`,
      [req.params.id, req.user.id]
    );
  });

  res.json(result.rows[0]);
}

/**
 * Renvoi pour correction : le motif est conservé dans renvoi_correction (jamais dans la saisie),
 * et le responsable du pôle est notifié.
 */
async function renvoyer(req, res) {
  const motif = (req.body.motif || '').trim();
  if (!motif) throw new HttpError(422, 'MOTIF_REQUIRED', 'Le motif de renvoi est obligatoire');

  const saisie = await db.withTransaction({ userId: req.user.id, motif }, async (client) => {
    const cur = await client.query(
      `SELECT s.id, s.statut, s.campagne_id, p.responsable_id, p.code AS pole_code, cr.intitule
         FROM saisie s JOIN pole p ON p.id = s.pole_id JOIN critere cr ON cr.id = s.critere_id
        WHERE s.id = $1 FOR UPDATE OF s`,
      [req.params.id]
    );
    if (cur.rowCount === 0) throw new HttpError(404, 'NOT_FOUND', 'Saisie introuvable');
    const row = cur.rows[0];
    if (!['SOUMISE', 'VALIDEE'].includes(row.statut)) {
      throw new HttpError(409, 'INVALID_STATUS', 'La saisie ne peut pas être renvoyée dans son état actuel');
    }
    const upd = await client.query(
      `UPDATE saisie SET statut = 'RENVOYEE', valide_par = NULL, date_validation = NULL WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    await client.query('INSERT INTO renvoi_correction (saisie_id, motif, renvoye_par) VALUES ($1, $2, $3)',
      [req.params.id, motif, req.user.id]);
    if (row.responsable_id) {
      await client.query(
        `INSERT INTO notification (saisie_id, campagne_id, destinataire_id, canal, message)
         VALUES ($1, $2, $3, 'APPLICATION', $4)`,
        [req.params.id, row.campagne_id, row.responsable_id,
          `${row.pole_code} : « ${row.intitule} » renvoyé pour correction. Motif : ${motif}`]
      );
    }
    return upd.rows[0];
  });

  res.json(saisie);
}

module.exports = { soumettre, valider, renvoyer };
