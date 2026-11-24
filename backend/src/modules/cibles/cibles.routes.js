const router = require('express').Router();
const service = require('./cibles.service');
const schemas = require('./cibles.schemas');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');

router.use(authenticate);

router.get('/', validate({ query: schemas.listQuery }), asyncHandler(async (req, res) =>
  res.json(await service.list(req.user, req.valid.query))));

// Proposition de cible : contrôle de gestion / administration. Validation : direction générale.
router.put('/', requireRole(ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR), validate({ body: schemas.upsertBody }),
  asyncHandler(async (req, res) => res.json(await service.definir(req.user, req.valid.body))));
router.patch('/:id', requireRole(ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR), validate({ params: schemas.idParams, body: schemas.modifierBody }),
  asyncHandler(async (req, res) => res.json(await service.modifier(req.user, req.valid.params.id, req.valid.body))));
router.post('/:id/supprimer', requireRole(ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR), validate({ params: schemas.idParams, body: schemas.supprimerBody }),
  asyncHandler(async (req, res) => res.json(await service.supprimer(req.user, req.valid.params.id, req.valid.body))));
router.post('/valider-lot', requireRole(ROLES.DIRECTION_GENERALE), validate({ body: schemas.validerLotBody }),
  asyncHandler(async (req, res) => res.json(await service.validerLot(req.user, req.valid.body))));
router.post('/:id/valider', requireRole(ROLES.DIRECTION_GENERALE), validate({ params: schemas.idParams }),
  asyncHandler(async (req, res) => res.json(await service.valider(req.user, req.valid.params.id))));

module.exports = router;
