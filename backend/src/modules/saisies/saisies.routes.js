const router = require('express').Router();

const controller = require('./saisies.controller');
const actions = require('./saisies.actions');
const schemas = require('./saisies.schemas');

const validate = require('../../middlewares/validate');
const {
  authenticate,
  requireRole,
  ROLES,
} = require('../../middlewares/auth');

const asyncHandler = require('../../utils/asyncHandler');

router.use(authenticate);

/*
 * Consultation des saisies
 * Responsable : ses pôles
 * Contrôle de gestion / Direction / Admin : accès global
 */
router.get(
  '/',
  validate({ query: schemas.listQuery }),
  asyncHandler(controller.list)
);

router.get(
  '/:id',
  validate({ params: schemas.idParams }),
  asyncHandler(controller.getById)
);

/*
 * Création et modification
 * Réservées au responsable de pôle.
 */
router.post(
  '/',
  requireRole(ROLES.RESPONSABLE_POLE),
  validate({ body: schemas.createBody }),
  asyncHandler(controller.create)
);

router.patch(
  '/:id',
  requireRole(ROLES.RESPONSABLE_POLE),
  validate({
    params: schemas.idParams,
    body: schemas.updateBody,
  }),
  asyncHandler(controller.update)
);

/*
 * Workflow :
 * Responsable -> soumission
 * Contrôle de gestion uniquement -> validation ou renvoi (règle du schéma)
 */
router.post(
  '/:id/soumettre',
  requireRole(ROLES.RESPONSABLE_POLE),
  asyncHandler(actions.soumettre)
);

router.post(
  '/:id/valider',
  requireRole(ROLES.CONTROLE_GESTION),
  asyncHandler(actions.valider)
);

router.post(
  '/:id/renvoyer',
  requireRole(ROLES.CONTROLE_GESTION),
  asyncHandler(actions.renvoyer)
);

module.exports = router;
