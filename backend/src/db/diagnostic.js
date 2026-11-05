// Affiche l'état de la base : migrations appliquées, fonctions clés et tables présentes.
const { Client } = require('pg');
const env = require('../config/env');

(async () => {
  const c = new Client({ connectionString: env.DATABASE_URL });
  await c.connect();
  try {
    const mig = await c.query(`SELECT to_regclass('public.schema_migrations') AS t`);
    if (mig.rows[0].t) {
      const r = await c.query('SELECT name FROM public.schema_migrations ORDER BY name');
      console.log('Migrations appliquées :', r.rows.map((x) => x.name).join(', ') || '(aucune)');
    } else console.log('Table schema_migrations absente : aucune migration enregistrée.');
    const f = await c.query(`SELECT n.nspname AS schema, p.proname AS nom, pg_get_function_identity_arguments(p.oid) AS args
                               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                              WHERE p.proname IN ('fn_ouvrir_campagne','fn_criteres_effectifs') ORDER BY 1,2`);
    console.log('Fonctions :', f.rows.length ? '' : 'AUCUNE trouvée');
    f.rows.forEach((x) => console.log(`  ${x.schema}.${x.nom}(${x.args})`));
    const t = await c.query(`SELECT table_schema, count(*) AS n FROM information_schema.tables
                              WHERE table_schema IN ('notation','public') GROUP BY 1`);
    t.rows.forEach((x) => console.log(`Tables dans ${x.table_schema} : ${x.n}`));
  } finally { await c.end(); }
})().catch((e) => { console.error('Erreur :', e.message); process.exit(1); });
