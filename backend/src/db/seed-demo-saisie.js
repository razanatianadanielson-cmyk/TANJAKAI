// Prépare une campagne VIERGE pour s'entraîner à la saisie : T1 2027, mêmes critères et mêmes cibles que la démo.
// Prérequis : `npm run seed` puis `npm run seed:demo`. Usage : npm run seed:demo:saisie
const env = require('../config/env');
const db = require('../config/db');

const EXERCICE = 2027;
const TRIMESTRE = 1;
const EXERCICE_SOURCE = 2026;

(async () => {
  if (env.NODE_ENV === 'production') throw new Error('Démo interdite en production');
  try {
    const id = await db.withTransaction({}, async (c) => {
      const q = async (text, params) => (await c.query(text, params)).rows;
      const [controle] = await q("SELECT id FROM utilisateur WHERE email = 'controle@tanjakai.local'");
      const [pole] = await q("SELECT id FROM pole WHERE code = 'BPO-01'");
      const [source] = await q(
        `SELECT grille_id FROM campagne WHERE exercice = $1 AND trimestre = 3`, [EXERCICE_SOURCE]);
      if (!controle || !pole || !source) throw new Error('Lancez d’abord : npm run seed puis npm run seed:demo');

      const deja = await q('SELECT id FROM campagne WHERE exercice = $1 AND trimestre = $2', [EXERCICE, TRIMESTRE]);
      if (deja.length) { console.log('La campagne vierge existe déjà.'); return deja[0].id; }

      await c.query("SELECT set_config('app.user_id', $1, true)", [controle.id]);
      // mêmes cibles que 2026, validées pour 2027
      await c.query(
        `INSERT INTO cible (pole_id, critere_id, exercice, valeur_cible, date_validation, valide_par)
         SELECT pole_id, critere_id, $2, valeur_cible, CURRENT_DATE, $3
           FROM cible WHERE exercice = $1 AND pole_id = $4
         ON CONFLICT DO NOTHING`,
        [EXERCICE_SOURCE, EXERCICE, controle.id, pole.id]);
      const [camp] = await q(
        'SELECT fn_ouvrir_campagne($1::integer, $2::smallint, $3::uuid, (CURRENT_DATE + 30), $4::uuid) AS id',
        [EXERCICE, TRIMESTRE, source.grille_id, controle.id]);
      return camp.id;
    });
    console.log(`Campagne vierge prête : T${TRIMESTRE} ${EXERCICE} (${id}). Choisissez-la dans « Ma saisie ».`);
  } catch (err) {
    console.error('Échec :', err.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();
