const crypto = require('crypto');
const db = require('../config/db');
const { HttpError } = require('../utils/httpError');

function empreinteCle(cle) {
  return crypto
    .createHash('sha256')
    .update(cle)
    .digest('hex');
}

async function authenticateServiceKey(req, res, next) {
  const cle = req.headers['x-service-key'];

  if (!cle) {
    return next(
      new HttpError(
        401,
        'SERVICE_KEY_REQUIRED',
        'Clé de service obligatoire'
      )
    );
  }

  const empreinte = empreinteCle(cle);

  try {
    const result = await db.query(
      `
      SELECT id, pole_id, droits, active
      FROM cle_service
      WHERE empreinte_cle = $1
      `,
      [empreinte]
    );

    if (result.rowCount === 0 || !result.rows[0].active) {
      return next(
        new HttpError(
          401,
          'INVALID_SERVICE_KEY',
          'Clé de service invalide'
        )
      );
    }

    req.serviceKey = result.rows[0];

    return next();
  } catch (err) {
    return next(err);
  }
}

function requireServiceRight(droit) {
  return (req, res, next) => {
    if (!req.serviceKey) {
      return next(
        new HttpError(
          401,
          'SERVICE_KEY_REQUIRED',
          'Clé de service obligatoire'
        )
      );
    }

    if (!req.serviceKey.droits.includes(droit)) {
      return next(
        new HttpError(
          403,
          'SERVICE_RIGHT_FORBIDDEN',
          'Droit de service insuffisant'
        )
      );
    }

    next();
  };
}

module.exports = {
  authenticateServiceKey,
  requireServiceRight,
  empreinteCle,
};
