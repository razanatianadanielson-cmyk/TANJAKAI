const router = require('express').Router();
const db = require('../../config/db');
const { authenticate } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');

router.use(authenticate);

// Les trois axes (financier, humain, qualité) sont des données de référence : lecture seule.
router.get('/', asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT id, code, libelle FROM axe ORDER BY code');
  res.json({ data: rows });
}));

module.exports = router;
