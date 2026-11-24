// DÉPART PROPRE pour la démonstration : efface TOUTES les données (pôles, campagnes, saisies, scores, alertes, journal d'audit…),
// recrée la base vide, les 4 comptes de test et le pôle BPO-01, puis installe le référentiel (6 critères, grille validée) et les
// cibles 2027 de BPO-01. Rien d'autre : le reste (compte, pôle, cibles, campagne, saisies…) s'ajoute pendant la démonstration.
// DÉVELOPPEMENT UNIQUEMENT. Usage : npm run demo:depart-propre -- --oui
const { execFileSync } = require('child_process');
const path = require('path');
const { Client } = require('pg');
const env = require('../config/env');

const CRITERES = [
  ['FINANCIER', 'Réalisation du chiffre d’affaires budgété', 'M Ar', 'MAXIMISER', 60, 1000],
  ['FINANCIER', 'Marge', '%', 'MAXIMISER', 40, 20],
  ['HUMAIN', 'Rotation du personnel', '%', 'MINIMISER', 50, 10],
  ['HUMAIN', 'Absentéisme', '%', 'MINIMISER', 50, 4],
  ['QUALITE', 'Satisfaction client', '%', 'MAXIMISER', 70, 90],
  ['QUALITE', 'Taux de réclamation', '%', 'MINIMISER', 30, 2],
];
const POIDS_AXES = { FINANCIER: 40, HUMAIN: 30, QUALITE: 30 };
const EXERCICE_CIBLES = 2027;

const lancer = (script) => execFileSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit', env: process.env });

(async () => {
  if (env.NODE_ENV === 'production') throw new Error('Interdit en production');
  if (!process.argv.includes('--oui')) {
    console.log('ATTENTION : cette commande EFFACE toutes les données de la base (pôles, saisies, scores, alertes, journal d\'audit).');
    console.log('Les comptes de test sont recréés. Pour confirmer, relancez : npm run demo:depart-propre -- --oui');
    return;
  }
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS notation CASCADE');
    await client.query('CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    await client.query('DELETE FROM public.schema_migrations');
    console.log('Base vidée. Recréation…');
  } finally {
    await client.end();
  }
  lancer('migrate.js');
  lancer('seed.js');

  const db = require('../config/db');
  try {
    await db.withTransaction({ motif: 'Départ propre de démonstration' }, async (c) => {
      const q = async (text, params) => (await c.query(text, params)).rows;
      const [controle] = await q("SELECT id FROM utilisateur WHERE email = 'controle@tanjakai.local'");
      const [pole] = await q("SELECT id FROM pole WHERE code = 'BPO-01'");
      await c.query("SELECT set_config('app.user_id', $1, true)", [controle.id]);
      const axes = Object.fromEntries((await q('SELECT id, code FROM axe')).map((a) => [a.code, a.id]));
      const [grille] = await q("INSERT INTO grille_notation (version, statut) VALUES (1, 'BROUILLON') RETURNING id");
      for (const [code, poids] of Object.entries(POIDS_AXES)) {
        await c.query('INSERT INTO ponderation_axe (grille_id, axe_id, poids) VALUES ($1, $2, $3)', [grille.id, axes[code], poids]);
      }
      for (const [axe, intitule, unite, sens, poids, cible] of CRITERES) {
        const [cr] = await q(
          `INSERT INTO critere (axe_id, intitule, definition, unite, sens_optimisation, source_donnee, valide, valide_par, date_validation)
           VALUES ($1, $2, $3, $4, $5, 'Démonstration', true, $6, CURRENT_DATE) RETURNING id`,
          [axes[axe], intitule, `Indicateur « ${intitule} »`, unite, sens, controle.id]);
        const [pc] = await q('INSERT INTO ponderation_critere (grille_id, critere_id, poids) VALUES ($1, $2, $3) RETURNING id', [grille.id, cr.id, poids]);
        await c.query('INSERT INTO bareme (ponderation_critere_id, plancher, plafond) VALUES ($1, 0.5, 1.0)', [pc.id]);
        await c.query(
          'INSERT INTO cible (pole_id, critere_id, exercice, valeur_cible, date_validation, valide_par) VALUES ($1, $2, $3, $4, CURRENT_DATE, $5)',
          [pole.id, cr.id, EXERCICE_CIBLES, cible, controle.id]);
      }
      await c.query("UPDATE grille_notation SET statut = 'VALIDEE', date_validation = CURRENT_DATE, valide_par = $2 WHERE id = $1", [grille.id, controle.id]);
    });
    console.log('\nDépart propre prêt : 4 comptes, pôle BPO-01 (cibles 2027 validées), 6 critères, grille v1 validée. Aucune campagne.');
  } catch (err) {
    console.error('Échec :', err.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})().catch((e) => { console.error('Échec :', e.message); process.exitCode = 1; });
