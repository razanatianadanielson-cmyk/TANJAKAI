const { z } = require('zod');
const { paginationSchema } = require('../../utils/pagination');

const idParams = z.object({ id: z.string().uuid() });

const listQuery = paginationSchema.extend({
  campagneId: z.string().uuid().optional(),
  poleId: z.string().uuid().optional(),
  statut: z.enum(['BROUILLON', 'VALIDEE']).optional(),
  type: z.enum(['POLE', 'COMPARATIVE']).optional(),
});

// poleId absent = synthèse comparative
const genererBody = z.object({ campagneId: z.string().uuid(), poleId: z.string().uuid().optional() });

const modifierBody = z.object({ contenu: z.string().trim().min(1, 'Le commentaire ne peut pas être vide').max(6000) });

module.exports = { idParams, listQuery, genererBody, modifierBody };
