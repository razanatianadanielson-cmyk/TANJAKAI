const { z } = require('zod');
const { paginationSchema } = require('../../utils/pagination');

const loginBody = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

const challengeToken = z.string().min(20).max(2000);
const code = z.string().trim().min(6).max(20);

const verify2faBody = z.object({ challengeToken, code });
const enrolementDemarrerBody = z.object({ challengeToken });
const refreshBody = z.object({ refreshToken: z.string().min(20).max(500) });
const activerBody = z.object({ code });
const desactiverBody = z.object({ motDePasse: z.string().min(1).max(200), code });
const motDePasseBody = z.object({ motDePasse: z.string().min(1).max(200) });
const changerMotDePasseBody = z.object({ actuel: z.string().min(1).max(200), nouveau: z.string().min(1).max(200) });

const idParams = z.object({ id: z.string().uuid() });
const journalQuery = paginationSchema.extend({
  utilisateurId: z.string().uuid().optional(),
  email: z.string().trim().max(254).optional(),
  evenement: z.string().trim().max(60).optional(),
  depuis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  jusqua: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

module.exports = {
  loginBody, verify2faBody, enrolementDemarrerBody, refreshBody, activerBody, desactiverBody, motDePasseBody,
  changerMotDePasseBody, idParams, journalQuery,
};
