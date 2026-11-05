const router = require('express').Router();
const s = require('./cles-service.schemas');
const service = require('./cles-service.service');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');

// Réservé à l'administrateur (2.6.2) ; la clé en clair n'est visible qu'à la création.
router.use(authenticate, requireRole(ROLES.ADMINISTRATEUR));

router.get('/', validate({ query: s.listQuery }),
  asyncHandler(async (req, res) => res.json(await service.lister(req.valid.query))));

router.post('/', validate({ body: s.creerBody }),
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(201).json(await service.creer(req.user, req.valid.body));
  }));

router.post('/:id/revoquer', validate({ params: s.idParams }),
  asyncHandler(async (req, res) => res.json(await service.revoquer(req.user, req.valid.params.id))));

module.exports = router;
