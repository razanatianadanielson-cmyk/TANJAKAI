require('dotenv').config();
const { z } = require('zod');

const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL est obligatoire'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET doit contenir au moins 32 caractères'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(20), // requêtes /auth sensibles par IP et par 15 min
  DEV_SKIP_2FA: bool,
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
  SESSION_MAX_HOURS: z.coerce.number().int().positive().default(12),
  CHALLENGE_MINUTES: z.coerce.number().int().positive().default(5),
  TOTP_ISSUER: z.string().default('TANJAKAI'),
  TOTP_ENC_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'TOTP_ENC_KEY : 64 caractères hexadécimaux').optional().or(z.literal('').transform(() => undefined)),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(120),
  UPLOAD_DIR: z.string().default('./uploads'),
  UPLOAD_MAX_MB: z.coerce.number().positive().default(5),
  // Synthèses assistées : OpenRouter n'est appelé que depuis le serveur ; sans clé, le mode dégradé s'applique.
  OPENROUTER_API_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: z.string().min(1).default('openai/gpt-4o-mini'),
  OPENROUTER_PLAFOND_MENSUEL: z.coerce.number().min(0).default(5), // dépense maximale par mois civil, en dollars
  OPENROUTER_MAX_TOKENS: z.coerce.number().int().min(100).max(4000).default(900),
  OPENROUTER_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  SYNTHESE_SEUIL_EVOLUTION: z.coerce.number().min(0).default(1), // écart de note (points) à partir duquel un critère est dit en progression ou en recul
  VARIATION_ANORMALE_PCT: z.coerce.number().positive().default(50),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Configuration invalide :\n${details}`);
}
if (parsed.data.NODE_ENV === 'production' && parsed.data.DEV_SKIP_2FA) {
  throw new Error('DEV_SKIP_2FA ne doit jamais être activé en production');
}

module.exports = Object.freeze(parsed.data);

