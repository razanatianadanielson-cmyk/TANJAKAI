const env = require('../config/env');
const db = require('../config/db');

const CRITERES = [
  ['FINANCIER', 'Réalisation du chiffre d’affaires budgété', 'M Ar', 'MAXIMISER', 60, 1000, 900],
  ['FINANCIER', 'Marge', '%', 'MAXIMISER', 40, 20, 22],
  ['HUMAIN', 'Rotation du personnel', '%', 'MINIMISER', 50, 10, 12.5],
  ['HUMAIN', 'Absentéisme', '%', 'MINIMISER', 50, 4, 4],
  ['QUALITE', 'Satisfaction client', '%', 'MAXIMISER', 70, 90, 81],
  ['QUALITE', 'Taux de réclamation', '%', 'MINIMISER', 30, 2, 4],
];

const POIDS_AXES = {
  FINANCIER: 40,
  HUMAIN: 30,
  QUALITE: 30,
};

const EXERCICE = 2026;
const TRIMESTRE = 3;

(async () => {
  if (env.NODE_ENV === 'production') {
    throw new Error('Démo interdite en production');
  }

  try {
    const campagneId = await db.withTransaction({}, async (c) => {
      const q = async (text, params) => (await c.query(text, params)).rows;

      const [controle] = await q(
        `SELECT id FROM utilisateur WHERE email = 'controle@tanjakai.local'`
      );

      const [resp] = await q(
        `SELECT id FROM utilisateur
         WHERE id = (SELECT responsable_id FROM pole WHERE code = 'BPO-01')`
      );

      const [pole] = await q(
        `SELECT id FROM pole WHERE code = 'BPO-01'`
      );

      if (!controle || !resp || !pole) {
        throw new Error('Lancez d’abord : npm run seed');
      }

      const deja = await q(
        `SELECT id FROM campagne
         WHERE exercice = $1 AND trimestre = $2`,
        [EXERCICE, TRIMESTRE]
      );

      if (deja.length) {
        console.log('Démo déjà installée.');
        return deja[0].id;
      }

      await c.query(
        `SELECT set_config('app.user_id', $1, true)`,
        [controle.id]
      );

      const axes = Object.fromEntries(
        (await q(`SELECT id, code FROM axe`))
          .map((a) => [a.code, a.id])
      );

      const [{ v }] = await q(
        `SELECT COALESCE(MAX(version), 0) + 1 AS v
         FROM grille_notation`
      );

      const [grille] = await q(
        `INSERT INTO grille_notation
         (version, statut, motif_changement)
         VALUES ($1, 'BROUILLON', $2)
         RETURNING id`,
        [v, v > 1 ? 'Grille de démonstration' : null]
      );

      for (const [code, poids] of Object.entries(POIDS_AXES)) {
        await c.query(
          `INSERT INTO ponderation_axe
           (grille_id, axe_id, poids)
           VALUES ($1, $2, $3)`,
          [grille.id, axes[code], poids]
        );
      }

      for (const [axe, intitule, unite, sens, poids, cible] of CRITERES) {
        const [cr] = await q(
          `INSERT INTO critere
           (axe_id, intitule, definition, unite,
            sens_optimisation, source_donnee,
            valide, valide_par, date_validation)
           VALUES
           ($1, $2, $3, $4, $5, 'Démonstration',
            true, $6, CURRENT_DATE)
           RETURNING id`,
          [
            axes[axe],
            intitule,
            `Indicateur « ${intitule} » (démonstration)`,
            unite,
            sens,
            controle.id,
          ]
        );

        const [pc] = await q(
          `INSERT INTO ponderation_critere
           (grille_id, critere_id, poids)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [grille.id, cr.id, poids]
        );

        await c.query(
          `INSERT INTO bareme
           (ponderation_critere_id, plancher, plafond)
           VALUES ($1, 0.5, 1.0)`,
          [pc.id]
        );

        await c.query(
          `INSERT INTO cible
           (pole_id, critere_id, exercice,
            valeur_cible, date_validation, valide_par)
           VALUES ($1, $2, $3, $4, CURRENT_DATE, $5)`,
          [pole.id, cr.id, EXERCICE, cible, controle.id]
        );

        const item = CRITERES.find((x) => x[1] === intitule);
        item.critereId = cr.id;
      }

      await c.query(
        `UPDATE grille_notation
         SET statut = 'VALIDEE',
             date_validation = CURRENT_DATE,
             valide_par = $2
         WHERE id = $1`,
        [grille.id, controle.id]
      );

      // Ouverture par la fonction officielle : elle gèle la grille, le périmètre des pôles et les cibles.
      const [camp] = await q(
        `SELECT fn_ouvrir_campagne($1::integer, $2::smallint, $3::uuid, (CURRENT_DATE + 30), $4::uuid) AS id`,
        [EXERCICE, TRIMESTRE, grille.id, controle.id]
      );

      await c.query(
        `SELECT set_config('app.user_id', $1, true)`,
        [resp.id]
      );

      for (const ligne of CRITERES) {
        await c.query(
          `INSERT INTO saisie
           (campagne_id, pole_id, critere_id,
            valeur_realisee, statut, source,
            saisi_par, date_soumission,
            valide_par, date_validation)
           VALUES
           ($1, $2, $3, $4, 'VALIDEE', 'ESPACE',
            $5, now(), $6, now())`,
          [
            camp.id,
            pole.id,
            ligne.critereId,
            ligne[6],
            resp.id,
            controle.id,
          ]
        );
      }
      await c.query(
        `SELECT set_config('app.user_id', $1, true)`,
        [controle.id]
      );

      return camp.id;
    });

    console.log(
      `Démo prête. Campagne T${TRIMESTRE} ${EXERCICE} : ${campagneId}`
    );

  } catch (err) {
    console.error('Échec de la démo :', err.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();



