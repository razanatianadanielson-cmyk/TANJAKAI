const router = require('express').Router();
const service = require('./espace.service');
const schemas = require('./espace.schemas');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');

// Monté sous /api/v1/campagnes
router.use(authenticate);

router.get('/:id/avancement', validate({ params: schemas.idParams }),
  asyncHandler(async (req, res) => res.json(await service.avancement(req.user, req.valid.params.id))));

router.get('/:id/poles/:poleId/saisies', validate({ params: schemas.poleParams }),
  asyncHandler(async (req, res) => res.json(await service.plan(req.user, req.valid.params.id, req.valid.params.poleId))));

router.put('/:id/poles/:poleId/criteres/:critereId', requireRole(ROLES.RESPONSABLE_POLE),
  validate({ params: schemas.critereParams, body: schemas.saisieBody }),
  asyncHandler(async (req, res) => {
    const { id, poleId, critereId } = req.valid.params;
    res.json(await service.enregistrer(req.user, id, poleId, critereId, req.valid.body));
  }));

router.post('/:id/poles/:poleId/soumettre', requireRole(ROLES.RESPONSABLE_POLE), validate({ params: schemas.poleParams }),
  asyncHandler(async (req, res) => res.json(await service.soumettre(req.user, req.valid.params.id, req.valid.params.poleId))));

router.post('/:id/poles/:poleId/valider', requireRole(ROLES.CONTROLE_GESTION), validate({ params: schemas.poleParams }),
  asyncHandler(async (req, res) => res.json(await service.validerPole(req.user, req.valid.params.id, req.valid.params.poleId))));

router.post('/:id/poles/:poleId/reprendre', requireRole(ROLES.RESPONSABLE_POLE), validate({ params: schemas.poleParams, body: schemas.motifBody }),
  asyncHandler(async (req, res) => res.json(await service.reprendre(req.user, req.valid.params.id, req.valid.params.poleId, req.valid.body))));

router.delete('/:id/poles/:poleId/criteres/:critereId', requireRole(ROLES.RESPONSABLE_POLE), validate({ params: schemas.critereParams }),
  asyncHandler(async (req, res) => {
    const { id, poleId, critereId } = req.valid.params;
    res.json(await service.effacer(req.user, id, poleId, critereId));
  }));

module.exports = router;
