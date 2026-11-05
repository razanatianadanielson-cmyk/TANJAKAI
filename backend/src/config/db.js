const { Pool, types } = require('pg');
const env = require('./env');

// DATE -> texte « AAAA-MM-JJ » (évite le décalage de fuseau horaire de JavaScript)
types.setTypeParser(1082, (v) => v);
// NUMERIC -> nombre (notes, pondérations, valeurs : 2 à 4 décimales, sans risque de perte ici)
types.setTypeParser(1700, (v) => parseFloat(v));

// Toutes les tables vivent dans le schéma « notation » (voir db/migrations/001_schema.sql).
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  options: '-c search_path=notation,public',
});

pool.on('error', (err) => {
  // erreur sur un client inactif : on la journalise sans arrêter le serveur
  console.error(JSON.stringify({ level: 'error', msg: 'pg pool error', error: err.message }));
});

/** Requête paramétrée simple. Toujours passer les valeurs dans `params` (jamais de concaténation SQL). */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * Exécute `fn(client)` dans une transaction.
 * `ctx.userId` et `ctx.motif` alimentent le journal d'audit (triggers fn_audit côté base).
 */
async function withTransaction(ctx, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (ctx && ctx.userId) await client.query("SELECT set_config('app.user_id', $1, true)", [ctx.userId]);
    if (ctx && ctx.motif) await client.query("SELECT set_config('app.motif', $1, true)", [ctx.motif]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function ping() {
  await pool.query('SELECT 1');
}

function close() {
  return pool.end();
}

module.exports = { pool, query, withTransaction, ping, close };
