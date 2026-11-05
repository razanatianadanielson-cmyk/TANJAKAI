const { z } = require('zod');

const createBody = z.object({
  libelle: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
});

module.exports = { createBody };
