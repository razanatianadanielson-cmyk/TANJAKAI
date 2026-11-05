// Applique, dans l'ordre alphabétique, les fichiers de db/migrations/*.sql non encore appliqués.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const env = require('../config/env');

const DIR = path.join(__dirname, '..', '..', 'db', 'migrations');

(async () => {
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
                          name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query('SELECT name FROM public.schema_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    let applied = 0;
    for (const file of files) {
      if (done.has(file)) continue;
      console.log(`> ${file}`);
      await client.query(fs.readFileSync(path.join(DIR, file), 'utf8')); // le fichier gère sa propre transaction
      await client.query('INSERT INTO public.schema_migrations (name) VALUES ($1)', [file]);
      applied += 1;
    }
    console.log(applied ? `${applied} migration(s) appliquée(s).` : 'Base déjà à jour.');
  } catch (err) {
    console.error('Échec de la migration :', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
