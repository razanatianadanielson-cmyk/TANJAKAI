// Jeu de données de DÉVELOPPEMENT : 1 utilisateur par rôle, 1 famille, 1 pôle. Ne jamais lancer en production.
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const db = require('../config/db');

(async () => {
  if (env.NODE_ENV === 'production') throw new Error('Seed interdit en production');
  const password = process.env.SEED_PASSWORD || 'ChangeMe!2026Tj';
  const hash = bcrypt.hashSync(password, 12);
  const users = [
    ['Rakoto', 'Responsable', 'responsable@tanjakai.local', 'RESPONSABLE_POLE', false],
    ['Rabe', 'Controle', 'controle@tanjakai.local', 'CONTROLE_GESTION', false],
    ['Rasoa', 'Direction', 'direction@tanjakai.local', 'DIRECTION_GENERALE', true],
    ['Admin', 'Systeme', 'admin@tanjakai.local', 'ADMINISTRATEUR', true],
  ];
  try {
    for (const [nom, prenom, email, role, mfa] of users) {
      await db.query(
        `INSERT INTO utilisateur (nom, prenom, email, mot_de_passe_hash, role, second_facteur_actif)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (email) DO NOTHING`,
        [nom, prenom, email, hash, role, mfa],
      );
    }
    await db.query(`INSERT INTO famille_activite (libelle) VALUES ('Externalisation de services (BPO)') ON CONFLICT (libelle) DO NOTHING`);
    await db.query(
      `INSERT INTO pole (code, intitule, famille_id, responsable_id, date_rattachement)
       SELECT 'BPO-01', 'Pôle BPO Antananarivo', f.id, u.id, CURRENT_DATE
         FROM famille_activite f, utilisateur u
        WHERE f.libelle = 'Externalisation de services (BPO)' AND u.email = 'responsable@tanjakai.local'
       ON CONFLICT (code) DO NOTHING`,
    );
    console.log(`Seed terminé. Mot de passe des comptes de test : ${password}`);
  } catch (err) {
    console.error('Échec du seed :', err.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();
