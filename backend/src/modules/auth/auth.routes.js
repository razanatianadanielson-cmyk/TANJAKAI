const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const env = require('../../config/env');
const controller = require('./auth.controller');
const s = require('./auth.schemas');
const validate = require('../../middlewares/validate');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');
const { HttpError } = require('../../utils/httpError');

const limiteur = (limit) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => next(new HttpError(429, 'TOO_MANY_REQUESTS', 'Trop de tentatives, réessayez plus tard')),
});
// Anti force brute : connexion, second facteur et enrôlement partagent des limites strictes par IP
const sensible = limiteur(env.LOGIN_RATE_LIMIT);
const renouvellement = limiteur(env.LOGIN_RATE_LIMIT * 6);

// --- Ouverture de session (publique) ---
router.post('/login', sensible, validate({ body: s.loginBody }), asyncHandler(controller.login));
router.post('/verify-2fa', sensible, validate({ body: s.verify2faBody }), asyncHandler(controller.verify2fa));
router.post('/2fa/enrolement/demarrer', sensible, validate({ body: s.enrolementDemarrerBody }), asyncHandler(controller.enrolementDemarrer));
router.post('/2fa/enrolement/confirmer', sensible, validate({ body: s.verify2faBody }), asyncHandler(controller.enrolementConfirmer));
router.post('/refresh', renouvellement, validate({ body: s.refreshBody }), asyncHandler(controller.refresh));

// --- Compte connecté ---
router.get('/me', authenticate, asyncHandler(controller.me));
router.post('/logout', authenticate, asyncHandler(controller.logout));
router.get('/sessions', authenticate, asyncHandler(controller.sessions));
router.post('/sessions/revoquer-autres', authenticate, asyncHandler(controller.revoquerAutres));
router.get('/journal', authenticate, asyncHandler(controller.monJournal));
router.post('/mot-de-passe', authenticate, sensible, validate({ body: s.changerMotDePasseBody }), asyncHandler(controller.changerMotDePasse));
router.post('/2fa/setup', authenticate, asyncHandler(controller.setup2fa));
router.post('/2fa/activer', authenticate, sensible, validate({ body: s.activerBody }), asyncHandler(controller.activer2fa));
router.post('/2fa/desactiver', authenticate, sensible, validate({ body: s.desactiverBody }), asyncHandler(controller.desactiver2fa));
router.post('/2fa/codes-secours', authenticate, sensible, validate({ body: s.motDePasseBody }), asyncHandler(controller.codesSecours));

// --- Administration des comptes : réservée à l'administrateur ---
const admin = requireRole(ROLES.ADMINISTRATEUR);
router.get('/admin/comptes', authenticate, admin, asyncHandler(controller.comptes));
router.get('/admin/journal-connexions', authenticate, admin, validate({ query: s.journalQuery }), asyncHandler(controller.journal));
router.post('/admin/comptes/:id/deverrouiller', authenticate, admin, validate({ params: s.idParams }), asyncHandler(controller.deverrouiller));
router.post('/admin/comptes/:id/reinitialiser-2fa', authenticate, admin, validate({ params: s.idParams }), asyncHandler(controller.reinitialiser2fa));
router.post('/admin/comptes/:id/revoquer-sessions', authenticate, admin, validate({ params: s.idParams }), asyncHandler(controller.revoquerSessions));

module.exports = router;
