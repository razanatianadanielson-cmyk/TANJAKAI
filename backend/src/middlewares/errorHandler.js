const { ZodError } = require('zod');
const env = require('../config/env');
const { HttpError } = require('../utils/httpError');

// Codes d'erreur PostgreSQL émis par les contraintes et triggers du schéma.
const PG_ERRORS = {
  '23505': [409, 'CONFLICT', "Cette ressource existe déjà (contrainte d'unicité)"],
  '23503': [409, 'REFERENCE_ERROR', 'Référence invalide ou ressource encore utilisée'],
  '23514': [422, 'RULE_VIOLATION', 'Règle métier non respectée'],
  '23P01': [409, 'CONFLICT', 'Chevauchement interdit'],
  '23502': [400, 'BAD_REQUEST', 'Champ obligatoire manquant'],
  '22P02': [400, 'BAD_REQUEST', 'Valeur au mauvais format'],
  '42501': [403, 'FORBIDDEN', 'Opération non autorisée'],
};

function notFoundHandler(req, res, next) {
  next(new HttpError(404, 'NOT_FOUND', `Route inconnue : ${req.method} ${req.originalUrl}`));
}

// Format d'erreur unique : { error: { code, message, details?, requestId } }
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Erreur interne du serveur';
  let details;

  if (err instanceof HttpError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Données invalides';
    details = err.issues.map((i) => ({ champ: i.path.join('.'), message: i.message }));
  } else if (err && err.type === 'entity.parse.failed') {
    status = 400; code = 'BAD_REQUEST'; message = 'Corps JSON invalide';
  } else if (err && err.type === 'entity.too.large') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Corps de requête trop volumineux';
  } else if (err && err.code && PG_ERRORS[err.code]) {
    [status, code, message] = PG_ERRORS[err.code];
    // les messages RAISE EXCEPTION de nos triggers sont rédigés pour l'utilisateur
    if (err.code === '23514' || err.code === '42501') message = err.message;
    if (err.constraint) details = { contrainte: err.constraint };
  }

  if (status >= 500) {
    console.error(JSON.stringify({ level: 'error', requestId: req.id, msg: err.message, stack: err.stack }));
    if (env.NODE_ENV !== 'production') details = { cause: err.message };
  }

  res.status(status).json({ error: { code, message, ...(details ? { details } : {}), requestId: req.id } });
}

module.exports = { errorHandler, notFoundHandler };
