const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const validate = require('../../middlewares/validate');
const { authenticate } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');
const { notFound } = require('../../utils/httpError');

const idParams = z.object({ id: z.string().uuid() });
const listQuery = z.object({
  lue: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

router.use(authenticate);

// Chacun ne voit que ses propres notifications
router.get('/', validate({ query: listQuery }), asyncHandler(async (req, res) => {
  const { lue, limit } = req.valid.query;
  const [rows, nonLues] = await Promise.all([
    db.query(
      `SELECT id, message, lue, date_envoi AS "dateEnvoi", campagne_id AS "campagneId",
              alerte_id AS "alerteId", saisie_id AS "saisieId"
         FROM notification WHERE destinataire_id = $1 AND canal = 'APPLICATION' AND ($2::boolean IS NULL OR lue = $2)
        ORDER BY date_envoi DESC LIMIT $3`, [req.user.id, lue ?? null, limit]),
    db.query("SELECT count(*)::int AS n FROM notification WHERE destinataire_id = $1 AND canal = 'APPLICATION' AND NOT lue", [req.user.id]),
  ]);
  res.json({ data: rows.rows, nonLues: nonLues.rows[0].n });
}));

router.post('/lues', asyncHandler(async (req, res) => {
  const { rowCount } = await db.query('UPDATE notification SET lue = true WHERE destinataire_id = $1 AND NOT lue', [req.user.id]);
  res.json({ marquees: rowCount });
}));

router.post('/:id/lue', validate({ params: idParams }), asyncHandler(async (req, res) => {
  const { rowCount } = await db.query('UPDATE notification SET lue = true WHERE id = $1 AND destinataire_id = $2', [req.valid.params.id, req.user.id]);
  if (!rowCount) throw notFound('Notification introuvable');
  res.status(204).end();
}));

module.exports = router;
