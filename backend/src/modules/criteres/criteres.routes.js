const router = require('express').Router();
const service = require('./criteres.service');
const schemas = require('./criteres.schemas');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');

router.use(authenticate);

router.get('/', validate({ query: schemas.listQuery }), asyncHandler(async (req, res) =>
  res.json(await service.list(req.valid.query))));
router.get('/:id', validate({ params: schemas.idParams }), asyncHandler(async (req, res) =>
  res.json(await service.getById(req.valid.params.id))));

router.post('/', requireRole(ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR), validate({ body: schemas.createBody }),
  asyncHandler(async (req, res) => {
    const critere = await service.create(req.user, req.valid.body);
    res.status(201).location(`/api/v1/criteres/${critere.id}`).json(critere);
  }));
router.patch('/:id', requireRole(ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR),
  validate({ params: schemas.idParams, body: schemas.updateBody }),
  asyncHandler(async (req, res) => res.json(await service.update(req.user, req.valid.params.id, req.valid.body))));
router.post('/:id/supprimer', requireRole(ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR),
  validate({ params: schemas.idParams, body: schemas.supprimerBody }),
  asyncHandler(async (req, res) => res.json(await service.supprimer(req.user, req.valid.params.id, req.valid.body))));
// Validation de la définition : réservée au contrôle de gestion
router.post('/:id/valider', requireRole(ROLES.CONTROLE_GESTION), validate({ params: schemas.idParams }),
  asyncHandler(async (req, res) => res.json(await service.valider(req.user, req.valid.params.id))));

module.exports = router;
