const router = require('express').Router();
const controller = require('./scoring.controller');
const schemas = require('./scoring.schemas');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');

router.use(authenticate);

// Liste des derniers scores (un responsable ne voit que ses pôles)
router.get('/', validate({ query: schemas.listQuery }), asyncHandler(controller.lister));
// Score détaillé et explicable
router.get('/:id', validate({ params: schemas.idParams }), asyncHandler(controller.detail));
// Vérification par recalcul (reproductibilité)
router.get(
  '/:id/verification',
  requireRole(ROLES.CONTROLE_GESTION, ROLES.DIRECTION_GENERALE, ROLES.ADMINISTRATEUR),
  validate({ params: schemas.idParams }),
  asyncHandler(controller.verifier),
);

module.exports = router;
