const { z } = require('zod');

const idParams = z.object({
  id: z.string().uuid(),
});

const listQuery = z.object({
  campagne_id: z.string().uuid().optional(),
  pole_id: z.string().uuid().optional(),
  statut: z.string().optional(),
});

const createBody = z.object({
  campagne_id: z.string().uuid(),
  critere_id: z.string().uuid(),
  pole_id: z.string().uuid(),
  valeur_realisee: z.number().nullable().optional(),
  commentaire: z.string().max(2000).nullable().optional(),
  motif_non_renseigne: z.string().max(1000).nullable().optional(),
});

const updateBody = z.object({
  valeur_realisee: z.number().nullable().optional(),
  commentaire: z.string().max(2000).nullable().optional(),
  motif_non_renseigne: z.string().max(1000).nullable().optional(),
});

module.exports = {
  idParams,
  listQuery,
  createBody,
  updateBody,
};
