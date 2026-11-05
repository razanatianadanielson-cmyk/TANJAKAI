// Lecture seule : explique pourquoi un responsable ne voit pas un pôle dans « Ma saisie ». Usage : npm run diagnostic:saisie
// Optionnel : npm run diagnostic:saisie -- voahangy@tanjakai.local
const env = require('../config/env');
const db = require('../config/db');

(async () => {
  const email = process.argv[2];
  try {
    const { rows: users } = await db.query(
      `SELECT id, prenom, nom, email, actif FROM utilisateur WHERE role = 'RESPONSABLE_POLE' AND ($1::text IS NULL OR email = $1) ORDER BY email`, [email || null]);
    for (const u of users) {
      console.log(`\n=== ${u.prenom} ${u.nom} <${u.email}> ${u.actif ? '' : '(DÉSACTIVÉ)'}`);
      const { rows: poles } = await db.query(
        'SELECT id, code, intitule, statut FROM pole WHERE responsable_id = $1 ORDER BY code', [u.id]);
      if (!poles.length) { console.log('  Aucun pôle rattaché à ce compte.'); continue; }
      for (const p of poles) {
        console.log(`  Pôle ${p.code} (${p.intitule}) : statut ${p.statut}`);
        const { rows: susp } = await db.query('SELECT motif, date_debut, date_fin FROM suspension_pole WHERE pole_id = $1', [p.id]);
        susp.forEach((s) => console.log(`    Suspension : ${String(s.date_debut).slice(0, 10)} → ${String(s.date_fin).slice(0, 10)} (${s.motif})`));
        const { rows: camps } = await db.query(
          `SELECT c.exercice, c.trimestre, c.statut,
                  EXISTS (SELECT 1 FROM campagne_pole cp WHERE cp.campagne_id = c.id AND cp.pole_id = $1) AS dedans,
                  (SELECT count(*) FROM campagne_cible cc WHERE cc.campagne_id = c.id AND cc.pole_id = $1)::int AS cibles
             FROM campagne c ORDER BY c.exercice DESC, c.trimestre DESC LIMIT 12`, [p.id]);
        camps.forEach((c) => console.log(`    ${c.trimestre} ${c.exercice} [${c.statut}] : pôle ${c.dedans ? 'DANS' : 'ABSENT DE'} la campagne, ${c.cibles} cible(s) gelée(s)`));
      }
    }
    console.log('\nLecture : « ABSENT DE » = la campagne a été ouverte quand le pôle n\'existait pas, était suspendu ou inactif. Ouvrez une nouvelle campagne.');
  } catch (err) {
    console.error('Échec :', err.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();
