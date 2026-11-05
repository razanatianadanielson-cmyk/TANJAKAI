const { HttpError } = require('../utils/httpError');

async function idempotency(req, res, next) {
  const key = req.headers['idempotency-key'];

  if (!key) {
    return next(
      new HttpError(
        400,
        'IDEMPOTENCY_KEY_REQUIRED',
        'Idempotency-Key obligatoire'
      )
    );
  }

  if (key.length > 255) {
    return next(
      new HttpError(
        400,
        'INVALID_IDEMPOTENCY_KEY',
        'Idempotency-Key trop longue'
      )
    );
  }

  req.idempotencyKey = key;
  next();
}

module.exports = idempotency;
