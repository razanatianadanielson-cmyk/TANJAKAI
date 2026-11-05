const { z } = require('zod');
const { paginationSchema } = require('../../utils/pagination');

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ');

const idParams = z.object({ id: z.string().uuid() });
const planParams = z.object({ id: z.string().uuid(), planId: z.string().uuid() });

const listQuery = paginationSchema.extend({
  statut: z.enum(['ACTIVE', 'ACCUSEE', 'CLOTUREE']).optional(),
  actives: z.enum(['true', 'false']).transform((v) => v === 'true').optional(), // ACTIVE + ACCUSEE
  type: z.enum(['VIGILANCE', 'DIRECTION', 'DEGRADATION']).optional(),
  poleId: z.string().uuid().optional(),
  exercice: z.coerce.number().int().min(2000).max(2100).optional(),
  trimestre: z.coerce.number().int().min(1).max(4).optional(),
});

const planBody = z.object({
  description: z.string().trim().min(3, 'Description obligatoire').max(1000),
  echeance: date,
});

const accuserBody = z.object({ plans: z.array(planBody).min(1, 'Au moins une action avec échéance est exigée').max(20) });

const majPlanBody = z.object({ statut: z.enum(['A_FAIRE', 'EN_COURS', 'TERMINE']) });

const seuilBody = z.object({
  axeId: z.string().uuid().nullable().optional(),
  valeur: z.number().min(0).max(100),
  ecartDegradation: z.number().gt(0).max(100).nullable().optional(),
  dateEffet: date,
});

module.exports = { idParams, planParams, listQuery, planBody, accuserBody, majPlanBody, seuilBody };
