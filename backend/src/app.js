const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const routes = require('./routes');
const requestId = require('./middlewares/requestId');
const requestLogger = require('./middlewares/requestLogger');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const { HttpError } = require('./utils/httpError');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // À activer derrière un reverse proxy (nginx, etc.) : app.set('trust proxy', 1);

  // Ordre important : tout ce qui protège passe AVANT les routes métier.
  app.use(requestId);
  app.use(requestLogger);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true }));
  app.use(rateLimit({
    windowMs: 60 * 1000,
    limit: env.RATE_LIMIT_PER_MIN,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next) => next(new HttpError(429, 'TOO_MANY_REQUESTS', 'Trop de requêtes')),
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' })); // sonde de vie (sans base)
  app.use('/api/v1', routes); // toutes les routes sont versionnées

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
