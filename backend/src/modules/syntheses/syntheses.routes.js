const router = require('express').Router();
const s = require('./syntheses.schemas');
const service = require('./syntheses.service');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');

router.use(authenticate);

// Dépense du mois, plafond et journal des coûts
router.get('/cout', requireRole(ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR),
  asyncHandler(async (req, res) => res.json(await service.cout())));

router.get('/', requireRole(ROLES.CONTROLE_GESTION, ROLES.DIRECTION_GENERALE, ROLES.RESPONSABLE_POLE), validate({ query: s.listQuery }),
  asyncHandler(async (req, res) => res.json(await service.lister(req.user, req.valid.query))));

router.get('/:id', requireRole(ROLES.CONTROLE_GESTION, ROLES.DIRECTION_GENERALE, ROLES.RESPONSABLE_POLE), validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json(await service.detail(req.user, req.valid.params.id))));

// Génération, relecture et validation : contrôle de gestion uniquement
router.post('/generer', requireRole(ROLES.CONTROLE_GESTION), validate({ body: s.genererBody }),
  asyncHandler(async (req, res) => res.status(201).json(await service.generer(req.user, req.valid.body))));

router.patch('/:id', requireRole(ROLES.CONTROLE_GESTION), validate({ params: s.idParams, body: s.modifierBody }),
  asyncHandler(async (req, res) => res.json(await service.modifier(req.user, req.valid.params.id, req.valid.body))));

router.post('/:id/valider', requireRole(ROLES.CONTROLE_GESTION), validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json(await service.valider(req.user, req.valid.params.id))));

module.exports = router;
