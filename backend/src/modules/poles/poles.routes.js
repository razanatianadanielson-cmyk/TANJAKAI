const router = require('express').Router();
const controller = require('./poles.controller');
const schemas = require('./poles.schemas');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');

router.use(authenticate);

router.get('/', validate({ query: schemas.listQuery }), asyncHandler(controller.list));
router.get('/:id', validate({ params: schemas.idParams }), asyncHandler(controller.getById));
router.post(
  '/',
  requireRole(ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR),
  validate({ body: schemas.createBody }),
  asyncHandler(controller.create),
);

router.patch(
  '/:id/responsable',
  requireRole(ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR),
  validate({ params: schemas.idParams, body: schemas.responsableBody }),
  asyncHandler(controller.changerResponsable),
);

router.get('/:id/suspensions', validate({ params: schemas.idParams }), asyncHandler(controller.suspensions));
router.post(
  '/:id/suspensions',
  requireRole(ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR),
  validate({ params: schemas.idParams, body: schemas.suspensionBody }),
  asyncHandler(controller.suspendre),
);

module.exports = router;
