const { z } = require('zod');
const { paginationSchema } = require('../../utils/pagination');

const idParams = z.object({ id: z.string().uuid() });
const listQuery = paginationSchema;

const poids = z.number().min(0).max(100).refine((v) => Math.round(v * 100) / 100 === v, 'Deux décimales au maximum');
const motif = z.string().trim().min(3).max(500);

const createBody = z.object({
  motif: motif.optional(),
  copierDepuis: z.string().uuid().optional(),
});

const pondAxe = z.object({
  axeId: z.string().uuid(),
  familleId: z.string().uuid().nullable().optional(),
  poids: poids.refine((v) => v > 0, 'Le poids d\'un axe doit être supérieur à 0'),
  motif: motif.optional(),
}).refine((d) => !d.familleId || d.motif, { message: 'Une pondération par famille doit être motivée', path: ['motif'] });

const pondCritere = z.object({
  critereId: z.string().uuid(),
  familleId: z.string().uuid().nullable().optional(),
  poids,
  applicable: z.boolean().default(true),
  motif: motif.optional(),
  // plancher et plafond sont des TAUX D'ATTEINTE de la cible (ex. 0.5 et 1)
  plancher: z.number().min(0).optional(),
  plafond: z.number().positive().optional(),
}).refine((d) => !d.familleId || d.motif, { message: 'Une pondération par famille doit être motivée', path: ['motif'] })
  .refine((d) => d.applicable || d.motif, { message: 'Un critère non applicable doit être motivé', path: ['motif'] })
  .refine((d) => !d.applicable || (d.plancher !== undefined && d.plafond !== undefined),
    { message: 'Barème (plancher et plafond) obligatoire pour un critère applicable', path: ['plancher'] })
  .refine((d) => d.plancher === undefined || d.plafond === undefined || d.plancher < d.plafond,
    { message: 'Le plancher doit être inférieur au plafond', path: ['plancher'] });

const unique = (keyOf, label) => (list, ctx) => {
  const seen = new Set();
  for (const item of list) {
    const k = keyOf(item);
    if (seen.has(k)) ctx.addIssue({ code: 'custom', message: `${label} en double` });
    seen.add(k);
  }
};

const axesBody = z.object({
  ponderations: z.array(pondAxe).min(1)
    .superRefine(unique((p) => `${p.axeId}|${p.familleId || ''}`, 'Pondération d\'axe')),
});
const criteresBody = z.object({
  ponderations: z.array(pondCritere).min(1)
    .superRefine(unique((p) => `${p.critereId}|${p.familleId || ''}`, 'Pondération de critère')),
});

module.exports = { idParams, listQuery, createBody, axesBody, criteresBody };
