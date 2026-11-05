const router = require('express').Router();
const s = require('./audit.schemas');
const service = require('./audit.service');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');

// Journal d'audit : lecture seule, administrateur uniquement (le journal lui-même est en ajout seul côté base)
router.use(authenticate, requireRole(ROLES.ADMINISTRATEUR));

router.get('/', validate({ query: s.listQuery }), asyncHandler(async (req, res) => res.json(await service.lister(req.valid.query))));
router.get('/entites', asyncHandler(async (req, res) => res.json(await service.entites())));
router.get('/:id', validate({ params: s.idParams }), asyncHandler(async (req, res) => res.json(await service.detail(req.valid.params.id))));

module.exports = router;
