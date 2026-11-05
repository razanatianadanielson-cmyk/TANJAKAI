const db = require('../../config/db');
const repo = require('./auth.repository');
const { toOffset, paginated } = require('../../utils/pagination');
const { notFound } = require('../../utils/httpError');

const ROLES_2FA = ['DIRECTION_GENERALE', 'ADMINISTRATEUR'];

async function comptes() { return repo.comptes(); }

async function journal(filtres, pagination) {
  const { rows, total } = await repo.lireJournal(filtres, toOffset(pagination), pagination.limit);
  return paginated(rows, pagination, total);
}

async function cible(id) {
  const u = await repo.findById(id);
  if (!u) throw notFound('Compte introuvable');
  return u;
}

const tracer = (admin, cibleUser, evenement, ctx, detail) => repo.journaliser({
  utilisateurId: cibleUser.id, evenement, ip: ctx.ip, userAgent: ctx.userAgent, detail: `${detail} (par ${admin.id})`,
});

async function deverrouiller(admin, id, ctx = {}) {
  const u = await cible(id);
  await db.withTransaction({ userId: admin.id, motif: 'Déverrouillage de compte' }, (client) => repo.deverrouiller(client, id));
  await tracer(admin, u, 'COMPTE_DEVERROUILLE', ctx, 'Déverrouillage manuel');
  return { id, verrouille: false };
}

/** Compte dont le téléphone est perdu : le second facteur est effacé et sera réenrôlé à la prochaine connexion. */
async function reinitialiser2fa(admin, id, ctx = {}) {
  const u = await cible(id);
  await db.withTransaction({ userId: admin.id, motif: 'Réinitialisation du second facteur' }, async (client) => {
    await repo.desactiverTotp(client, id, ROLES_2FA.includes(u.role));
    await repo.revoquerSessionsUtilisateur(client, id, 'SECOND_FACTEUR_REINITIALISE', null);
  });
  await tracer(admin, u, 'TOTP_REINITIALISE', ctx, 'Second facteur réinitialisé, connexions révoquées');
  return { id, totpActif: false };
}

async function revoquerSessions(admin, id, ctx = {}) {
  const u = await cible(id);
  const n = await repo.revoquerSessionsUtilisateur(null, id, 'REVOCATION_ADMINISTRATEUR', null);
  await tracer(admin, u, 'SESSIONS_REVOQUEES', ctx, `${n} connexion(s) terminée(s)`);
  return { revoquees: n };
}

module.exports = { comptes, journal, deverrouiller, reinitialiser2fa, revoquerSessions };
