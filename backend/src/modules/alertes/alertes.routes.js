const router = require('express').Router();
const s = require('./alertes.schemas');
const service = require('./alertes.service');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');

const { RESPONSABLE_POLE: RP, CONTROLE_GESTION: CG, DIRECTION_GENERALE: DG, ADMINISTRATEUR: AD } = ROLES;

router.use(authenticate);

// Liste (le responsable ne voit que les alertes de son pôle) ; ?actives=true = ACTIVE + ACCUSEE
router.get('/', validate({ query: s.listQuery }), asyncHandler(async (req, res) => res.json(await service.lister(req.user, req.valid.query))));
router.get('/:id', validate({ params: s.idParams }), asyncHandler(async (req, res) => res.json(await service.detail(req.user, req.valid.params.id))));

// Accusé de prise en compte + plan d'action daté (responsable du pôle concerné uniquement)
router.post('/:id/accuser', requireRole(RP), validate({ params: s.idParams, body: s.accuserBody }),
  asyncHandler(async (req, res) => res.json(await service.accuser(req.user, req.valid.params.id, req.valid.body))));

router.post('/:id/plans', requireRole(RP, CG), validate({ params: s.idParams, body: s.planBody }),
  asyncHandler(async (req, res) => res.status(201).json(await service.ajouterPlan(req.user, req.valid.params.id, req.valid.body))));
router.patch('/:id/plans/:planId', requireRole(RP, CG), validate({ params: s.planParams, body: s.majPlanBody }),
  asyncHandler(async (req, res) => res.json(await service.majPlan(req.user, req.valid.params.id, req.valid.params.planId, req.valid.body))));

router.post('/:id/cloturer', requireRole(CG), validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json(await service.cloturer(req.user, req.valid.params.id))));

module.exports = router;
