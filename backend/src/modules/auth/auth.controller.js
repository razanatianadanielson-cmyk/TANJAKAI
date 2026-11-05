const service = require('./auth.service');
const admin = require('./auth.admin.service');

const ctx = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });
const envoyer = (res, { status, body }) => res.status(status).json(body);

module.exports = {
  login: async (req, res) => envoyer(res, await service.login(req.valid.body, ctx(req))),
  verify2fa: async (req, res) => envoyer(res, await service.verifier2fa(req.valid.body, ctx(req))),
  enrolementDemarrer: async (req, res) => res.json(await service.demarrerEnrolement(req.valid.body, ctx(req))),
  enrolementConfirmer: async (req, res) => envoyer(res, await service.confirmerEnrolement(req.valid.body, ctx(req))),
  refresh: async (req, res) => res.json(await service.refresh(req.valid.body, ctx(req))),
  logout: async (req, res) => { await service.logout(req.user, ctx(req)); res.status(204).end(); },
  me: async (req, res) => res.json(await service.me(req.user.id)),
  sessions: async (req, res) => res.json({ data: await service.sessions(req.user) }),
  revoquerAutres: async (req, res) => res.json(await service.revoquerAutresSessions(req.user, ctx(req))),
  setup2fa: async (req, res) => res.json(await service.setup2fa(req.user.id)),
  activer2fa: async (req, res) => res.json(await service.activer2fa(req.user.id, req.valid.body, ctx(req))),
  desactiver2fa: async (req, res) => { await service.desactiver2fa(req.user.id, req.valid.body, ctx(req)); res.status(204).end(); },
  codesSecours: async (req, res) => res.json(await service.regenererCodesSecours(req.user.id, req.valid.body, ctx(req))),
  changerMotDePasse: async (req, res) => { await service.changerMotDePasse(req.user, req.valid.body, ctx(req)); res.status(204).end(); },
  monJournal: async (req, res) => res.json(await admin.journal({ utilisateurId: req.user.id }, { page: 1, limit: 20 })),
  comptes: async (req, res) => res.json({ data: await admin.comptes() }),
  journal: async (req, res) => res.json(await admin.journal(req.valid.query, req.valid.query)),
  deverrouiller: async (req, res) => res.json(await admin.deverrouiller(req.user, req.valid.params.id, ctx(req))),
  reinitialiser2fa: async (req, res) => res.json(await admin.reinitialiser2fa(req.user, req.valid.params.id, ctx(req))),
  revoquerSessions: async (req, res) => res.json(await admin.revoquerSessions(req.user, req.valid.params.id, ctx(req))),
};
