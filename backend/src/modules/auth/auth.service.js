const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const db = require('../../config/db');
const repo = require('./auth.repository');
const totp = require('./totp');
const { erreursMotDePasse } = require('./password-policy');
const { HttpError, unauthorized, notFound, conflict, forbidden } = require('../../utils/httpError');

const ROLES_2FA = ['DIRECTION_GENERALE', 'ADMINISTRATEUR']; // second facteur obligatoire (cahier des charges 2.6.2)
// Hash factice : on compare toujours un mot de passe pour ne pas révéler si l'e-mail existe (timing).
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const nouveauJetonRafraichissement = () => crypto.randomBytes(48).toString('base64url');

/** `sid` = identifiant de la connexion (famille de jetons de rafraîchissement), vérifié par le middleware. */
function signAccessToken(user, sid) {
  return jwt.sign({ role: user.role, ...(sid ? { sid } : {}) }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: env.JWT_EXPIRES_IN,
    algorithm: 'HS256',
  });
}

const signChallenge = (user) => jwt.sign({ purpose: '2fa' }, env.JWT_SECRET, {
  subject: user.id, expiresIn: `${env.CHALLENGE_MINUTES}m`, algorithm: 'HS256',
});

function lireChallenge(token) {
  try {
    const p = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (p.purpose !== '2fa') throw new Error('mauvais usage');
    return p.sub;
  } catch (err) {
    throw new HttpError(401, 'CHALLENGE_EXPIRED', "L'étape de vérification a expiré : reconnectez-vous");
  }
}

const exige2fa = (user) => (user.second_facteur_actif || ROLES_2FA.includes(user.role)) && !env.DEV_SKIP_2FA;
const profilPublic = (u) => ({ id: u.id, nom: u.nom, prenom: u.prenom, role: u.role, mdpAChanger: Boolean(u.mdp_a_changer) });
const journal = (user, evenement, ctx, detail) => repo.journaliser({
  utilisateurId: user ? user.id : null, email: user ? null : ctx.email, evenement, ip: ctx.ip, userAgent: ctx.userAgent, detail,
});

/** Ouvre une connexion : jeton d'accès court + jeton de rafraîchissement opaque, révocable, stocké sous forme d'empreinte. */
async function ouvrirSession(user, ctx, { runner, famille, expireLe } = {}) {
  const refreshToken = nouveauJetonRafraichissement();
  const session = await repo.creerSession(runner, {
    utilisateurId: user.id, famille: famille || null, tokenHash: sha256(refreshToken),
    expireLe: expireLe || new Date(Date.now() + env.SESSION_MAX_HOURS * 3600 * 1000), ip: ctx.ip, userAgent: ctx.userAgent,
  });
  return {
    accessToken: signAccessToken(user, session.famille), refreshToken, tokenType: 'Bearer', expiresIn: env.JWT_EXPIRES_IN,
    inactiviteMinutes: env.SESSION_IDLE_MINUTES, user: profilPublic(user),
  };
}

/** Échec d'une vérification : compte l'échec (verrouillage temporaire) puis refuse. */
async function refuserEchec(user, ctx, evenement, message) {
  const verrouille = await repo.registerFailure(user.id, env.LOGIN_MAX_ATTEMPTS, env.LOGIN_LOCK_MINUTES);
  await journal(user, evenement, ctx);
  if (verrouille) {
    await journal(user, 'COMPTE_VERROUILLE', ctx, `Verrouillé ${env.LOGIN_LOCK_MINUTES} minutes après ${env.LOGIN_MAX_ATTEMPTS} échecs`);
    throw new HttpError(423, 'ACCOUNT_LOCKED', 'Compte temporairement verrouillé après plusieurs échecs');
  }
  throw unauthorized(message);
}

async function verifierNonVerrouille(user, ctx) {
  if (user.verrouille_jusqua && new Date(user.verrouille_jusqua) > new Date()) {
    await journal(user, 'CONNEXION_REFUSEE_VERROUILLE', ctx);
    throw new HttpError(423, 'ACCOUNT_LOCKED', 'Compte temporairement verrouillé après plusieurs échecs');
  }
}

async function login({ email, password }, ctx = {}) {
  ctx = { ...ctx, email };
  const user = await repo.findByEmail(email);
  const ok = await bcrypt.compare(password, user ? user.mot_de_passe_hash : DUMMY_HASH);

  if (!user || !user.actif) {
    await journal(null, 'ECHEC_CONNEXION', ctx, user ? 'Compte désactivé' : 'Identifiant inconnu');
    throw unauthorized('Identifiants invalides');
  }
  await verifierNonVerrouille(user, ctx);
  if (!ok) await refuserEchec(user, ctx, 'ECHEC_MOT_DE_PASSE', 'Identifiants invalides');

  // Second facteur obligatoire pour la direction et l'administration (et pour tout compte qui l'a activé).
  // Le compteur d'échecs n'est PAS remis à zéro à cette étape : sinon un code à 6 chiffres pourrait être deviné
  // par séries de tentatives séparées par une nouvelle saisie du mot de passe.
  if (exige2fa(user)) {
    return { status: 202, body: { requiresSecondFactor: true, enrollment: !user.totp_secret, challengeToken: signChallenge(user) } };
  }
  await repo.resetFailures(user.id);
  await journal(user, 'CONNEXION_REUSSIE', ctx);
  return { status: 200, body: await ouvrirSession(user, ctx) };
}

// ---------------------------------------------------------------------------------------------
// Second facteur : vérification à la connexion
// ---------------------------------------------------------------------------------------------
async function utilisateurDuDefi(challengeToken, ctx) {
  const user = await repo.findById(lireChallenge(challengeToken));
  if (!user || !user.actif) throw unauthorized('Identifiants invalides');
  await verifierNonVerrouille(user, ctx);
  return user;
}

/** Consomme un code TOTP (anti-rejeu) ou un code de secours. Retourne 'TOTP' | 'SECOURS' | null. */
async function accepterCode(user, secretChiffre, code) {
  const saisi = String(code).trim();
  if (/^\d{6}$/.test(saisi)) {
    const p = totp.verifier(totp.dechiffrer(secretChiffre, env), saisi, { dernierPas: user.totpDernierPas });
    if (p === null) return null;
    return (await repo.memoriserPas(user.id, p)) ? 'TOTP' : null;
  }
  if (totp.ressembleCodeSecours(saisi) && user.totp_secret) {
    return (await repo.consommerCodeSecours(user.id, totp.empreinte(saisi))) ? 'SECOURS' : null;
  }
  return null;
}

async function verifier2fa({ challengeToken, code }, ctx = {}) {
  const user = await utilisateurDuDefi(challengeToken, ctx);
  if (!user.totp_secret) throw conflict("Ce compte n'a pas encore enrôlé d'application d'authentification");
  const methode = await accepterCode(user, user.totp_secret, code);
  if (!methode) await refuserEchec(user, ctx, 'ECHEC_2FA', 'Code de vérification invalide');
  await repo.resetFailures(user.id);
  if (methode === 'SECOURS') await journal(user, 'CODE_SECOURS_UTILISE', ctx, `${await repo.codesSecoursRestants(user.id)} code(s) de secours restant(s)`);
  await journal(user, 'CONNEXION_REUSSIE', ctx, methode === 'SECOURS' ? 'Second facteur : code de secours' : 'Second facteur : TOTP');
  return { status: 200, body: await ouvrirSession(user, ctx) };
}

// ---------------------------------------------------------------------------------------------
// Enrôlement du second facteur
// ---------------------------------------------------------------------------------------------
async function preparerSecret(user) {
  const secret = totp.genererSecret();
  await repo.enregistrerSecretEnAttente(null, user.id, totp.chiffrer(secret, env));
  return {
    secret: secret.match(/.{1,4}/g).join(' '),
    secretBrut: secret,
    otpauthUri: totp.uriOtpauth({ compte: user.email, secret, emetteur: env.TOTP_ISSUER }),
    emetteur: env.TOTP_ISSUER,
  };
}

/** Valide le premier code, active le second facteur et remet les codes de secours (affichés une seule fois). */
async function activerAvecCode(user, code, ctx) {
  if (!user.totp_secret_attente) throw conflict("Aucun enrôlement en cours : demandez d'abord un nouveau secret");
  const secret = totp.dechiffrer(user.totp_secret_attente, env);
  const p = totp.verifier(secret, String(code).trim(), { dernierPas: null });
  if (p === null) return null;
  const codes = totp.genererCodesSecours();
  await db.withTransaction({ userId: user.id, motif: 'Activation du second facteur' }, async (client) => {
    await repo.activerTotp(client, user.id, user.totp_secret_attente, p);
    await repo.remplacerCodesSecours(client, user.id, codes.map(totp.empreinte));
  });
  await journal(user, 'TOTP_ACTIVE', ctx);
  return codes;
}

/** Première connexion d'un compte soumis au second facteur : enrôlement guidé par le jeton de défi. */
async function demarrerEnrolement({ challengeToken }, ctx = {}) {
  const user = await utilisateurDuDefi(challengeToken, ctx);
  if (user.totp_secret) throw conflict('Ce compte a déjà enrôlé une application d\'authentification');
  return preparerSecret(user);
}

async function confirmerEnrolement({ challengeToken, code }, ctx = {}) {
  const user = await utilisateurDuDefi(challengeToken, ctx);
  if (user.totp_secret) throw conflict('Ce compte a déjà enrôlé une application d\'authentification');
  const codes = await activerAvecCode(user, code, ctx);
  if (!codes) await refuserEchec(user, ctx, 'ECHEC_2FA', 'Code de vérification invalide');
  await repo.resetFailures(user.id);
  await journal(user, 'CONNEXION_REUSSIE', ctx, 'Second facteur : enrôlement');
  return { status: 200, body: { ...(await ouvrirSession(user, ctx)), codesSecours: codes } };
}

async function setup2fa(userId) {
  const user = await repo.findById(userId);
  if (user.totp_secret) throw conflict('Le second facteur est déjà activé');
  return preparerSecret(user);
}

async function activer2fa(userId, { code }, ctx = {}) {
  const user = await repo.findById(userId);
  if (user.totp_secret) throw conflict('Le second facteur est déjà activé');
  const codes = await activerAvecCode(user, code, ctx);
  if (!codes) throw new HttpError(422, 'INVALID_CODE', 'Code de vérification invalide : vérifiez l\'heure de votre téléphone');
  return { codesSecours: codes };
}

async function verifierMotDePasse(user, motDePasse) {
  if (!(await bcrypt.compare(motDePasse, user.mot_de_passe_hash))) throw new HttpError(422, 'INVALID_PASSWORD', 'Mot de passe actuel incorrect');
}

async function desactiver2fa(userId, { motDePasse, code }, ctx = {}) {
  const user = await repo.findById(userId);
  if (ROLES_2FA.includes(user.role)) throw forbidden('Le second facteur est obligatoire pour votre rôle : seul un administrateur peut le réinitialiser');
  if (!user.totp_secret) throw conflict("Le second facteur n'est pas activé");
  await verifierMotDePasse(user, motDePasse);
  if (!(await accepterCode(user, user.totp_secret, code))) throw new HttpError(422, 'INVALID_CODE', 'Code de vérification invalide');
  await db.withTransaction({ userId, motif: 'Désactivation du second facteur' }, (client) => repo.desactiverTotp(client, userId, false));
  await journal(user, 'TOTP_DESACTIVE', ctx);
}

async function regenererCodesSecours(userId, { motDePasse }, ctx = {}) {
  const user = await repo.findById(userId);
  if (!user.totp_secret) throw conflict("Le second facteur n'est pas activé");
  await verifierMotDePasse(user, motDePasse);
  const codes = totp.genererCodesSecours();
  await db.withTransaction({ userId, motif: 'Nouveaux codes de secours' }, (client) => repo.remplacerCodesSecours(client, userId, codes.map(totp.empreinte)));
  await journal(user, 'CODES_SECOURS_RENOUVELES', ctx);
  return { codesSecours: codes };
}

// ---------------------------------------------------------------------------------------------
// Jetons de rafraîchissement : rotation, détection de rejeu, inactivité
// ---------------------------------------------------------------------------------------------
/**
 * Chaque renouvellement remplace le jeton (rotation). Présenter un jeton déjà remplacé signale un vol possible :
 * toute la connexion est révoquée. Les révocations sont validées AVANT de refuser (pas de rollback).
 */
async function refresh({ refreshToken }, ctx = {}) {
  const issue = await db.withTransaction({}, async (client) => {
    const s = await repo.sessionParEmpreinte(client, sha256(refreshToken));
    if (!s) return { refus: 'INVALID_REFRESH' };
    if (s.revoqueLe) {
      if (s.motif === 'ROTATION') {
        await repo.revoquerFamille(client, s.famille, 'REJEU_DETECTE');
        return { refus: 'REPLAY', utilisateurId: s.utilisateurId };
      }
      return { refus: 'SESSION_ENDED' };
    }
    if (new Date(s.expireLe) <= new Date()) { await repo.revoquerSession(client, s.id, 'EXPIREE'); return { refus: 'SESSION_EXPIRED' }; }
    if (Date.now() - new Date(s.derniereActivite).getTime() > env.SESSION_IDLE_MINUTES * 60000) {
      await repo.revoquerFamille(client, s.famille, 'INACTIVITE');
      return { refus: 'IDLE', utilisateurId: s.utilisateurId };
    }
    const user = await repo.findById(s.utilisateurId, client);
    if (!user || !user.actif) { await repo.revoquerFamille(client, s.famille, 'COMPTE_DESACTIVE'); return { refus: 'SESSION_ENDED' }; }
    const nouveau = await ouvrirSession(user, ctx, { runner: client, famille: s.famille, expireLe: s.expireLe });
    await repo.revoquerSession(client, s.id, 'ROTATION', null);
    return { ok: nouveau };
  });
  if (issue.ok) return issue.ok;
  if (issue.refus === 'REPLAY') await repo.journaliser({ utilisateurId: issue.utilisateurId, evenement: 'REJEU_JETON', ip: ctx.ip, userAgent: ctx.userAgent, detail: 'Jeton de rafraîchissement déjà utilisé : connexion révoquée' });
  if (issue.refus === 'IDLE') await repo.journaliser({ utilisateurId: issue.utilisateurId, evenement: 'SESSION_EXPIREE', ip: ctx.ip, userAgent: ctx.userAgent, detail: `Inactivité de plus de ${env.SESSION_IDLE_MINUTES} minutes` });
  const messages = {
    IDLE: ['SESSION_EXPIRED', 'Session expirée pour inactivité'],
    SESSION_EXPIRED: ['SESSION_EXPIRED', 'Session expirée : reconnectez-vous'],
  };
  const [code, message] = messages[issue.refus] || ['SESSION_ENDED', 'Session terminée : reconnectez-vous'];
  throw new HttpError(401, code, message);
}

async function logout(user, ctx = {}) {
  if (user.sid) await repo.revoquerFamille(null, user.sid, 'DECONNEXION');
  await repo.journaliser({ utilisateurId: user.id, evenement: 'DECONNEXION', ip: ctx.ip, userAgent: ctx.userAgent });
}

async function sessions(user) {
  const rows = await repo.sessionsActives(user.id);
  return rows.map(({ famille, ...s }) => ({ ...s, courante: famille === user.sid }));
}

async function revoquerAutresSessions(user, ctx = {}) {
  const courante = user.sid ? await repo.sessionActiveDeFamille(user.sid) : null;
  const n = await repo.revoquerSessionsUtilisateur(null, user.id, 'REVOCATION_UTILISATEUR', courante ? courante.id : null);
  await repo.journaliser({ utilisateurId: user.id, evenement: 'SESSIONS_REVOQUEES', ip: ctx.ip, userAgent: ctx.userAgent, detail: `${n} autre(s) connexion(s) terminée(s)` });
  return { revoquees: n };
}

// ---------------------------------------------------------------------------------------------
// Compte
// ---------------------------------------------------------------------------------------------
async function changerMotDePasse(user, { actuel, nouveau }, ctx = {}) {
  const u = await repo.findById(user.id);
  await verifierMotDePasse(u, actuel);
  if (actuel === nouveau) throw new HttpError(422, 'WEAK_PASSWORD', "Le nouveau mot de passe doit différer de l'actuel", ['différent du mot de passe actuel']);
  const manques = erreursMotDePasse(nouveau, { email: u.email, nom: u.nom, prenom: u.prenom });
  if (manques.length) throw new HttpError(422, 'WEAK_PASSWORD', `Mot de passe trop faible : ${manques.join(', ')}`, manques);
  const hash = await bcrypt.hash(nouveau, env.BCRYPT_ROUNDS);
  await db.withTransaction({ userId: user.id, motif: 'Changement de mot de passe' }, (client) => repo.changerMotDePasse(client, user.id, hash));
  const courante = user.sid ? await repo.sessionActiveDeFamille(user.sid) : null;
  await repo.revoquerSessionsUtilisateur(null, user.id, 'MOT_DE_PASSE_MODIFIE', courante ? courante.id : null);
  await repo.journaliser({ utilisateurId: user.id, evenement: 'MOT_DE_PASSE_MODIFIE', ip: ctx.ip, userAgent: ctx.userAgent, detail: 'Autres connexions révoquées' });
}

async function me(userId) {
  const profil = await repo.profil(userId);
  if (!profil || !profil.actif) throw notFound('Utilisateur introuvable');
  return { ...profil, codesSecoursRestants: profil.totpActif ? await repo.codesSecoursRestants(userId) : 0, inactiviteMinutes: env.SESSION_IDLE_MINUTES };
}

module.exports = {
  login, me, signAccessToken, verifier2fa, demarrerEnrolement, confirmerEnrolement, setup2fa, activer2fa, desactiver2fa,
  regenererCodesSecours, refresh, logout, sessions, revoquerAutresSessions, changerMotDePasse,
};
