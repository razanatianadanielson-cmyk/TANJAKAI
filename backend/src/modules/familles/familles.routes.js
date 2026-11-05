const router = require('express').Router();
const service = require('./familles.service');
const schemas = require('./familles.schemas');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => res.json({ data: await service.list() })));
router.post(
  '/',
  requireRole(ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR),
  validate({ body: schemas.createBody }),
  asyncHandler(async (req, res) => res.status(201).json(await service.create(req.user, req.valid.body))),
);

module.exports = router;
