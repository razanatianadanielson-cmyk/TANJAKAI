class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const badRequest = (msg, details) => new HttpError(400, 'BAD_REQUEST', msg, details);
const unauthorized = (msg = 'Authentification requise') => new HttpError(401, 'UNAUTHENTICATED', msg);
const forbidden = (msg = 'Accès refusé') => new HttpError(403, 'FORBIDDEN', msg);
const notFound = (msg = 'Ressource introuvable') => new HttpError(404, 'NOT_FOUND', msg);
const conflict = (msg) => new HttpError(409, 'CONFLICT', msg);

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, conflict };
