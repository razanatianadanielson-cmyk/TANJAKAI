const { z } = require('zod');
const { paginationSchema } = require('../../utils/pagination');

const idParams = z.object({ id: z.string().uuid() });

const listQuery = paginationSchema.extend({
  familleId: z.string().uuid().optional(),
});

const createBody = z.object({
  code: z.string().trim().min(1).max(30),
  intitule: z.string().trim().min(1).max(200),
  familleId: z.string().uuid(),
  responsableId: z.string().uuid().optional(),
  effectif: z.number().int().min(0).optional(),
  implantation: z.string().trim().max(200).optional(),
  dateRattachement: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ'),
});

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ');
const suspensionBody = z.object({
  motif: z.string().trim().min(3).max(500),
  dateDebut: date,
  dateFin: date,
}).refine((d) => d.dateFin >= d.dateDebut, { message: 'dateFin doit être postérieure à dateDebut', path: ['dateFin'] });

// Rattacher / détacher un responsable : acte tracé, motif obligatoire (responsableId null = détacher)
const responsableBody = z.object({
  responsableId: z.string().uuid().nullable(),
  motif: z.string().trim().min(5, 'Motif obligatoire (5 caractères minimum)').max(500),
});

module.exports = { idParams, listQuery, createBody, suspensionBody, responsableBody };
