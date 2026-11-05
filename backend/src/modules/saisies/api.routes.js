const router = require('express').Router();
const { z } = require('zod');
const { authenticateServiceKey, requireServiceRight } = require('../../middlewares/serviceAuth');
const idempotency = require('../../middlewares/idempotency');
const validate = require('../../middlewares/validate');
const asyncHandler = require('../../utils/asyncHandler');
const service = require('./api.service');

const body = z.object({
  campagne_id: z.string().uuid(),
  critere_id: z.string().uuid(),
  pole_id: z.string().uuid().optional(), // facultatif : par défaut, le pôle de la clé
  valeur_realisee: z.number().finite().nullable().optional(),
  unite: z.string().max(30).optional(),
  commentaire: z.string().max(2000).nullable().optional(),
  motif_non_renseigne: z.string().max(1000).nullable().optional(),
});

// Monté sous /api/v1/service/saisies — authentification par clé de service (en-tête X-Service-Key)
router.post('/', authenticateServiceKey, requireServiceRight('saisie:ecriture'), idempotency, validate({ body }),
  asyncHandler(async (req, res) => {
    const r = await service.deposer(req.serviceKey, req.idempotencyKey, req.valid.body);
    res.status(r.statut).json({ data: r.saisie, idempotent: r.idempotent, avertissements: r.avertissements || [] });
  }));

module.exports = router;
