const router = require('express').Router();
const s = require('./alertes.schemas');
const service = require('./alertes.service');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');

router.use(authenticate);

router.get('/', requireRole(ROLES.CONTROLE_GESTION, ROLES.DIRECTION_GENERALE, ROLES.ADMINISTRATEUR),
  asyncHandler(async (req, res) => res.json({ data: await service.seuils() })));

// Un nouveau seuil prend effet à sa date ; l'historique est conservé (jamais de modification en place)
router.post('/', requireRole(ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR), validate({ body: s.seuilBody }),
  asyncHandler(async (req, res) => res.status(201).json(await service.creerSeuil(req.user, req.valid.body))));

module.exports = router;
