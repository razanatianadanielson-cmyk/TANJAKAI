const { z } = require('zod');
const { paginationSchema } = require('../../utils/pagination');

const idParams = z.object({ id: z.string().uuid() });
const exercice = z.number().int().min(2000).max(2100);

const listQuery = paginationSchema.extend({
  poleId: z.string().uuid().optional(),
  critereId: z.string().uuid().optional(),
  exercice: z.coerce.number().int().min(2000).max(2100).optional(),
  valide: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

const upsertBody = z.object({
  poleId: z.string().uuid(),
  critereId: z.string().uuid(),
  exercice,
  valeurCible: z.number().finite(),
});

const modifierBody = z.object({ valeurCible: z.number().finite() });
const supprimerBody = z.object({ motif: z.string().trim().min(5).max(500) });

const validerLotBody = z.object({ exercice, poleId: z.string().uuid().optional() });

module.exports = { modifierBody, supprimerBody, idParams, listQuery, upsertBody, validerLotBody };
