const { z } = require('zod');

const idParams = z.object({ id: z.string().uuid() });

const ouvrirBody = z.object({
  exercice: z.number().int().min(2000).max(2100),
  trimestre: z.number().int().min(1).max(4),
  grilleId: z.string().uuid(),
  dateLimite: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ'),
});

const rouvrirBody = z.object({ motif: z.string().trim().min(5, 'Motif obligatoire (5 caractères minimum)').max(500) });

module.exports = { idParams, ouvrirBody, rouvrirBody };
