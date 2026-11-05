const { z } = require('zod');
const { paginationSchema } = require('../../utils/pagination');

const idParams = z.object({ id: z.string().uuid() });

const listQuery = paginationSchema.extend({
  poleId: z.string().uuid().optional(),
  active: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
});

const creerBody = z.object({
  poleId: z.string().uuid(),
  libelle: z.string().trim().min(3, 'Libellé obligatoire (3 caractères minimum)').max(120),
});

module.exports = { idParams, listQuery, creerBody };
