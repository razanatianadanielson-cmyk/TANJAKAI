const { z } = require('zod');

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const toOffset = ({ page, limit }) => (page - 1) * limit;

const paginated = (data, { page, limit }, total) => ({ data, pagination: { page, limit, total } });

module.exports = { paginationSchema, toOffset, paginated };
