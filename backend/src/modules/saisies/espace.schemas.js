const { z } = require('zod');

const idParams = z.object({ id: z.string().uuid() });
const poleParams = z.object({ id: z.string().uuid(), poleId: z.string().uuid() });
const critereParams = z.object({ id: z.string().uuid(), poleId: z.string().uuid(), critereId: z.string().uuid() });

// PUT = remplacement du brouillon du critère : une valeur absente est effacée (jamais préremplie ni estimée)
const saisieBody = z.object({
  valeurRealisee: z.number().finite().nullable().optional(),
  commentaire: z.string().max(2000).nullable().optional(),
  motifNonRenseigne: z.string().max(1000).nullable().optional(),
  uniteFournie: z.string().max(30).optional(),
});

module.exports = { idParams, poleParams, critereParams, saisieBody };
