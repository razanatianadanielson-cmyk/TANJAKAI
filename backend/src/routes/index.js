const router = require('express').Router();

router.use('/docs', require('../modules/docs/docs.routes'));
router.use('/health', require('../modules/health/health.routes'));
router.use('/auth', require('../modules/auth/auth.routes'));
router.use('/poles', require('../modules/poles/poles.routes'));
router.use('/notifications', require('../modules/notifications/notifications.routes'));
router.use('/alertes', require('../modules/alertes/alertes.routes'));
router.use('/seuils', require('../modules/alertes/seuils.routes'));
router.use('/utilisateurs', require('../modules/utilisateurs/utilisateurs.routes'));
router.use('/familles', require('../modules/familles/familles.routes'));
router.use('/axes', require('../modules/axes/axes.routes'));
router.use('/criteres', require('../modules/criteres/criteres.routes'));
router.use('/grilles', require('../modules/grilles/grilles.routes'));
router.use('/cibles', require('../modules/cibles/cibles.routes'));
router.use('/campagnes', require('../modules/campagnes/campagnes.routes'));
router.use('/campagnes', require('../modules/saisies/espace.routes')); // avancement, plan de saisie, soumission, validation par pôle
router.use('/cles-service', require('../modules/cles-service/cles-service.routes'));
router.use('/syntheses', require('../modules/syntheses/syntheses.routes'));
router.use('/audit', require('../modules/audit/audit.routes'));
router.use('/scores', require('../modules/scoring/scoring.routes'));

// Saisies par l'espace du responsable (JWT)
router.use('/saisies/:saisieId/pieces', require('../modules/saisies/pieces.routes'));
router.use('/saisies/export', require('../modules/saisies/export.routes')); // avant /saisies/:id
router.use('/saisies', require('../modules/saisies/saisies.routes'));

// Saisies par interface de programmation (clé de service + Idempotency-Key)
router.use('/service/saisies', require('../modules/saisies/api.routes'));

// Modules à ajouter (un dossier par module : routes / controller / service / repository / schemas) :
//   (aucun module restant dans le cahier des charges côté API ; voir la liste des étapes du projet)

module.exports = router;
