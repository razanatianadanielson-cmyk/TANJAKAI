const { z } = require('zod');
const { paginationSchema } = require('../../utils/pagination');

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ');

const listQuery = paginationSchema.extend({
  entite: z.string().trim().max(60).optional(),
  action: z.enum(['INSERT', 'UPDATE', 'DELETE']).optional(),
  utilisateur: z.string().trim().max(160).optional(), // contient (nom, prénom ou e-mail)
  motif: z.string().trim().max(200).optional(),       // contient
  depuis: date.optional(),
  jusqua: date.optional(),
});

const idParams = z.object({ id: z.coerce.number().int().positive() });

module.exports = { listQuery, idParams };
