const router = require('express').Router();
const controller = require('./campagnes.controller');
const service = require('./campagnes.service');
const schemas = require('./campagnes.schemas');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');
const { paginationSchema } = require('../../utils/pagination');

const { idParams } = schemas;

router.use(authenticate);

router.get('/', validate({ query: paginationSchema }), asyncHandler(controller.lister));
router.get('/:id', validate({ params: idParams }), asyncHandler(controller.detail));

// Ouverture : réservée au contrôle de gestion (gel de la grille, du périmètre et des cibles)
router.post('/', requireRole(ROLES.CONTROLE_GESTION), validate({ body: schemas.ouvrirBody }), asyncHandler(controller.ouvrir));
// Calcul à blanc (aucune écriture)
router.post('/:id/simuler', requireRole(ROLES.CONTROLE_GESTION), validate({ params: idParams }), asyncHandler(controller.simuler));
// Clôture + calcul + historisation + gel des scores
router.post('/:id/cloturer', requireRole(ROLES.CONTROLE_GESTION), validate({ params: idParams }), asyncHandler(controller.cloturer));
// Réouverture motivée, tracée et notifiée
router.post('/:id/rouvrir', requireRole(ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR),
  validate({ params: idParams, body: schemas.rouvrirBody }), asyncHandler(controller.rouvrir));

// Corrections d'erreurs d'ouverture : date limite, annulation d'une campagne jamais utilisée
router.patch('/:id', requireRole(ROLES.CONTROLE_GESTION), validate({ params: idParams, body: schemas.dateLimiteBody }),
  asyncHandler(async (req, res) => res.json(await service.modifierDateLimite(req.user, req.valid.params.id, req.valid.body))));
router.post('/:id/supprimer', requireRole(ROLES.CONTROLE_GESTION), validate({ params: idParams, body: schemas.supprimerBody }),
  asyncHandler(async (req, res) => res.json(await service.supprimer(req.user, req.valid.params.id, req.valid.body))));

module.exports = router;
