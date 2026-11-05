const { z } = require('zod');
const { paginationSchema } = require('../../utils/pagination');

const idParams = z.object({ id: z.string().uuid() });

const listQuery = paginationSchema.extend({
  axeId: z.string().uuid().optional(),
  valide: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

const base = {
  intitule: z.string().trim().min(2).max(200),
  definition: z.string().trim().min(10, 'Définition précise obligatoire (10 caractères minimum)').max(2000),
  unite: z.string().trim().min(1).max(30),
  sensOptimisation: z.enum(['MAXIMISER', 'MINIMISER']),
  sourceDonnee: z.string().trim().min(2).max(300),
  justificatifRequis: z.boolean().default(false),
  valeurMin: z.number().nullable().optional(),
  valeurMax: z.number().nullable().optional(),
  variationMaxPct: z.number().positive().nullable().optional(),
};

const bornes = (d) => d.valeurMin == null || d.valeurMax == null || d.valeurMin < d.valeurMax;
const MSG_BORNES = { message: 'valeurMin doit être inférieure à valeurMax', path: ['valeurMin'] };

const createBody = z.object({ axeId: z.string().uuid(), ...base }).refine(bornes, MSG_BORNES);
const updateBody = z.object({ ...base, justificatifRequis: base.justificatifRequis.optional() })
  .partial().refine((d) => Object.keys(d).length > 0, { message: 'Aucun champ à modifier' }).refine(bornes, MSG_BORNES);

module.exports = { idParams, listQuery, createBody, updateBody };
