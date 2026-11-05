const { z } = require('zod');
const { paginationSchema } = require('../../utils/pagination');

const idParams = z.object({ id: z.string().uuid() });

const listQuery = paginationSchema.extend({
  campagneId: z.string().uuid().optional(),
  poleId: z.string().uuid().optional(),
});

module.exports = { idParams, listQuery };
