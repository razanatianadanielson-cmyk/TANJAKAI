const router = require('express').Router();
const { z } = require('zod');
const db = require('../../config/db');
const validate = require('../../middlewares/validate');
const { authenticate, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');
const { versCsv, nombre } = require('../../utils/csv');
const { notFound } = require('../../utils/httpError');

const LIMITE = 50000;
const query = z.object({
  campagneId: z.string().uuid(),
  poleId: z.string().uuid().optional(),
  statut: z.enum(['BROUILLON', 'SOUMISE', 'RENVOYEE', 'VALIDEE']).optional(),
});

const STATUT = { BROUILLON: 'Brouillon', SOUMISE: 'Soumise', RENVOYEE: 'Renvoyée', VALIDEE: 'Validée' };
const SENS = { MAXIMISER: 'À maximiser', MINIMISER: 'À minimiser' };

const COLONNES = [
  { titre: 'Exercice', valeur: (r) => r.exercice },
  { titre: 'Trimestre', valeur: (r) => `T${r.trimestre}` },
  { titre: 'Code pôle', valeur: (r) => r.pole_code },
  { titre: 'Pôle', valeur: (r) => r.pole_intitule },
  { titre: 'Famille', valeur: (r) => r.famille },
  { titre: 'Axe', valeur: (r) => r.axe },
  { titre: 'Critère', valeur: (r) => r.critere },
  { titre: 'Unité', valeur: (r) => r.unite },
  { titre: 'Sens', valeur: (r) => SENS[r.sens] || r.sens },
  { titre: 'Cible', valeur: (r) => nombre(r.cible) },
  { titre: 'Valeur réalisée', valeur: (r) => nombre(r.valeur_realisee) },
  { titre: 'Motif de non-renseignement', valeur: (r) => r.motif_non_renseigne },
  { titre: 'Commentaire', valeur: (r) => r.commentaire },
  { titre: 'Statut', valeur: (r) => STATUT[r.statut] || r.statut },
  { titre: 'Origine', valeur: (r) => (r.source === 'API' ? `Clé de service${r.cle_libelle ? ` : ${r.cle_libelle}` : ''}` : 'Espace de saisie') },
  { titre: 'Saisi par', valeur: (r) => r.saisi_par_nom },
  { titre: 'Soumise le', valeur: (r) => r.date_soumission },
  { titre: 'Validée par', valeur: (r) => r.valide_par_nom },
  { titre: 'Validée le', valeur: (r) => r.date_validation },
];

router.use(authenticate);

/**
 * Export CSV des saisies d'une campagne. Droits : contrôle de gestion et administrateur (tout), responsable (ses pôles),
 * direction générale (saisies validées uniquement : la direction ne voit pas les brouillons).
 */
router.get('/', validate({ query }), asyncHandler(async (req, res) => {
  const { campagneId, poleId, statut } = req.valid.query;
  const { role, id } = req.user;
  const camp = await db.query('SELECT exercice, trimestre FROM campagne WHERE id = $1', [campagneId]);
  if (!camp.rows[0]) throw notFound('Campagne introuvable');

  const params = [campagneId]; const where = ['s.campagne_id = $1'];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (poleId) add('s.pole_id = ?', poleId);
  if (role === ROLES.RESPONSABLE_POLE) add('p.responsable_id = ?', id);
  if (role === ROLES.DIRECTION_GENERALE) where.push("s.statut = 'VALIDEE'");
  if (statut) add('s.statut = ?::statut_saisie', statut);

  const { rows } = await db.query(
    `SELECT c.exercice, c.trimestre, p.code AS pole_code, p.intitule AS pole_intitule, f.libelle AS famille,
            a.libelle AS axe, cr.intitule AS critere, cr.unite, cr.sens_optimisation AS sens, cc.valeur_cible AS cible,
            s.valeur_realisee, s.motif_non_renseigne, s.commentaire, s.statut, s.source, k.libelle AS cle_libelle,
            (us.prenom || ' ' || us.nom) AS saisi_par_nom, s.date_soumission,
            (uv.prenom || ' ' || uv.nom) AS valide_par_nom, s.date_validation
       FROM saisie s
       JOIN campagne c ON c.id = s.campagne_id
       JOIN pole p ON p.id = s.pole_id
       JOIN famille_activite f ON f.id = p.famille_id
       JOIN critere cr ON cr.id = s.critere_id
       JOIN axe a ON a.id = cr.axe_id
       LEFT JOIN campagne_cible cc ON cc.campagne_id = s.campagne_id AND cc.pole_id = s.pole_id AND cc.critere_id = s.critere_id
       LEFT JOIN cle_service k ON k.id = s.cle_service_id
       LEFT JOIN utilisateur us ON us.id = s.saisi_par
       LEFT JOIN utilisateur uv ON uv.id = s.valide_par
      WHERE ${where.join(' AND ')}
      ORDER BY p.code, a.code, cr.intitule
      LIMIT ${LIMITE + 1}`, params);

  const tronque = rows.length > LIMITE;
  const lignes = tronque ? rows.slice(0, LIMITE) : rows;
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="saisies-${camp.rows[0].exercice}-T${camp.rows[0].trimestre}.csv"`,
    'Cache-Control': 'no-store',
    'X-Export-Tronque': tronque ? 'oui' : 'non',
  });
  res.send(versCsv(COLONNES, lignes));
}));

module.exports = router;
