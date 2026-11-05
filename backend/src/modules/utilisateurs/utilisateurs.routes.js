const router = require('express').Router();
const s = require('./utilisateurs.schemas');
const service = require('./utilisateurs.service');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');

router.use(authenticate);

// Lecture (rattacher un responsable à un pôle). Jamais de hash ni de donnée de sécurité.
router.get('/', requireRole(ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR), validate({ query: s.listQuery }),
  asyncHandler(async (req, res) => res.json(await service.lister(req.valid.query.role))));

// Administration des comptes : administrateur uniquement
router.post('/', requireRole(ROLES.ADMINISTRATEUR), validate({ body: s.creerBody }),
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store'); // le mot de passe provisoire ne doit jamais être mis en cache
    res.status(201).json(await service.creer(req.user, req.valid.body));
  }));

router.patch('/:id/role', requireRole(ROLES.ADMINISTRATEUR), validate({ params: s.idParams, body: s.modifierBody }),
  asyncHandler(async (req, res) => res.json(await service.changerRole(req.user, req.valid.params.id, req.valid.body))));

router.post('/:id/desactiver', requireRole(ROLES.ADMINISTRATEUR), validate({ params: s.idParams, body: s.desactiverBody }),
  asyncHandler(async (req, res) => res.json(await service.desactiver(req.user, req.valid.params.id, req.valid.body))));

router.post('/:id/reactiver', requireRole(ROLES.ADMINISTRATEUR), validate({ params: s.idParams, body: s.desactiverBody }),
  asyncHandler(async (req, res) => res.json(await service.reactiver(req.user, req.valid.params.id, req.valid.body))));

module.exports = router;
