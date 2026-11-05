const router = require('express').Router();
const db = require('../../config/db');
const asyncHandler = require('../../utils/asyncHandler');

// Disponibilité de l'API ET de la base
router.get('/ready', asyncHandler(async (req, res) => {
  try {
    await db.ping();
    res.json({ status: 'ok', database: 'up' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', database: 'down' });
  }
}));

module.exports = router;
