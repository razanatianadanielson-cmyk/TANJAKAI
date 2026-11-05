const router = require('express').Router();
const service = require('./grilles.service');
const schemas = require('./grilles.schemas');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');

const gestionnaires = requireRole(ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR);

router.use(authenticate);

// Lecture : contrôle de gestion, direction et administration (un responsable n'a pas besoin de la grille complète)
const lecteurs = requireRole(ROLES.CONTROLE_GESTION, ROLES.DIRECTION_GENERALE, ROLES.ADMINISTRATEUR);
router.get('/', lecteurs, validate({ query: schemas.listQuery }), asyncHandler(async (req, res) =>
  res.json(await service.list(req.valid.query))));
router.get('/:id', lecteurs, validate({ params: schemas.idParams }), asyncHandler(async (req, res) =>
  res.json(await service.getById(req.valid.params.id))));

router.post('/', gestionnaires, validate({ body: schemas.createBody }), asyncHandler(async (req, res) => {
  const grille = await service.creer(req.user, req.valid.body);
  res.status(201).location(`/api/v1/grilles/${grille.id}`).json(grille);
}));
router.put('/:id/ponderations-axes', gestionnaires,
  validate({ params: schemas.idParams, body: schemas.axesBody }),
  asyncHandler(async (req, res) => res.json(await service.definirPonderationsAxes(req.user, req.valid.params.id, req.valid.body))));
router.put('/:id/ponderations-criteres', gestionnaires,
  validate({ params: schemas.idParams, body: schemas.criteresBody }),
  asyncHandler(async (req, res) => res.json(await service.definirPonderationsCriteres(req.user, req.valid.params.id, req.valid.body))));
// Validation : réservée au contrôle de gestion
router.post('/:id/valider', requireRole(ROLES.CONTROLE_GESTION), validate({ params: schemas.idParams }),
  asyncHandler(async (req, res) => res.json(await service.valider(req.user, req.valid.params.id))));
router.delete('/:id', gestionnaires, validate({ params: schemas.idParams }),
  asyncHandler(async (req, res) => { await service.supprimer(req.user, req.valid.params.id); res.status(204).end(); }));

module.exports = router;
