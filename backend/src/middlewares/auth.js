const jwt = require('jsonwebtoken');
const env = require('../config/env');
const repo = require('../modules/auth/auth.repository');
const { HttpError, unauthorized, forbidden } = require('../utils/httpError');

const ROLES = Object.freeze({
  RESPONSABLE_POLE: 'RESPONSABLE_POLE',
  CONTROLE_GESTION: 'CONTROLE_GESTION',
  DIRECTION_GENERALE: 'DIRECTION_GENERALE',
  ADMINISTRATEUR: 'ADMINISTRATEUR',
});

const ROUTES_MDP_PROVISOIRE = ['/auth/mot-de-passe', '/auth/me', '/auth/logout'];

/**
 * Vérifie le jeton « Bearer » et renseigne req.user = { id, role, sid }.
 * `sid` identifie la connexion (famille de jetons) : si elle porte un `sid`, le serveur vérifie qu'elle n'a été
 * ni révoquée (déconnexion, réinitialisation) ni laissée inactive plus de SESSION_IDLE_MINUTES.
 * Les requêtes d'arrière-plan (en-tête X-TJ-Passif: 1, ex. relève des notifications) ne comptent pas comme activité.
 */
async function authenticate(req, res, next) {
  const [type, token] = (req.headers.authorization || '').split(' ');
  if (type !== 'Bearer' || !token) return next(unauthorized());
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return next(new HttpError(401, 'INVALID_TOKEN', 'Jeton invalide ou expiré'));
  }
  // un jeton de défi (étape second facteur) ne donne accès à aucune ressource
  if (payload.purpose || !payload.role) return next(new HttpError(401, 'INVALID_TOKEN', 'Jeton invalide ou expiré'));
  req.user = { id: payload.sub, role: payload.role, sid: payload.sid };
  if (!payload.sid) return next();
  try {
    const session = await repo.sessionActiveDeFamille(payload.sid);
    if (!session || session.utilisateurId !== payload.sub) return next(new HttpError(401, 'SESSION_ENDED', 'Session terminée : reconnectez-vous'));
    if (session.inactive) return next(new HttpError(401, 'SESSION_EXPIRED', 'Session expirée pour inactivité'));
    if (session.aToucher && req.get('x-tj-passif') !== '1') await repo.toucherSession(session.id);
    // mot de passe provisoire : seules la consultation du profil, le changement de mot de passe et la déconnexion restent possibles
    if (session.mdpAChanger && !ROUTES_MDP_PROVISOIRE.some((r) => req.originalUrl.split('?')[0].replace(/\/$/, '').endsWith(r))) {
      return next(new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', 'Mot de passe provisoire : changez-le avant de continuer'));
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Habilitation côté serveur, à placer sur CHAQUE route protégée. */
const requireRole = (...allowed) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (!allowed.includes(req.user.role)) return next(forbidden());
  return next();
};

module.exports = { authenticate, requireRole, ROLES };
