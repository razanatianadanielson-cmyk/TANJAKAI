const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 10),
  options: '-c search_path=notation,public',
});

pool.on('error', (err) => {
  console.error('Erreur PostgreSQL :', err);
});

module.exports = pool;