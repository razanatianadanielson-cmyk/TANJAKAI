// Spécification OpenAPI 3.0 de l'API TANJAKAI (§2.6.1). Générée à partir d'un tableau d'opérations : une ligne = une route.
const CG = 'CONTROLE_GESTION', DG = 'DIRECTION_GENERALE', AD = 'ADMINISTRATEUR', RP = 'RESPONSABLE_POLE';
const TOUS = 'tous les rôles connectés';

const UUID = { type: 'string', format: 'uuid' };
const STR = { type: 'string' };
const PAGE = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];
const q = (name, schema, description) => ({ name, in: 'query', schema, description });

// [méthode, chemin, tag, résumé, rôles, { query, body, public, service }]
const OPS = [
  ['post', '/auth/login', 'Authentification', 'Connexion (e-mail + mot de passe). Renvoie 202 + challengeToken si le second facteur est requis.', 'public', { public: true, body: { email: 'responsable@tanjakai.local', password: '********' } }],
  ['post', '/auth/verify-2fa', 'Authentification', 'Second facteur : code TOTP ou code de secours.', 'public', { public: true, body: { challengeToken: '…', code: '123456' } }],
  ['post', '/auth/refresh', 'Authentification', 'Renouvelle le jeton d\'accès (rotation du jeton de rafraîchissement).', 'public', { public: true, body: { refreshToken: '…' } }],
  ['post', '/auth/logout', 'Authentification', 'Déconnexion : révoque la session.', TOUS, {}],
  ['get', '/auth/me', 'Authentification', 'Profil de l\'utilisateur connecté.', TOUS, {}],
  ['get', '/auth/sessions', 'Authentification', 'Sessions actives de l\'utilisateur.', TOUS, {}],
  ['get', '/auth/journal', 'Authentification', 'Journal de ses propres connexions.', TOUS, {}],
  ['post', '/auth/mot-de-passe', 'Authentification', 'Changement de mot de passe.', TOUS, { body: { motDePasseActuel: '…', nouveauMotDePasse: '…' } }],
  ['get', '/auth/admin/comptes', 'Administration', 'Comptes et état de sécurité.', AD, { query: PAGE }],
  ['get', '/auth/admin/journal-connexions', 'Administration', 'Journal des connexions (filtrable).', AD, { query: PAGE }],
  ['post', '/auth/admin/comptes/{id}/deverrouiller', 'Administration', 'Déverrouille un compte.', AD, {}],
  ['post', '/auth/admin/comptes/{id}/reinitialiser-2fa', 'Administration', 'Réinitialise le second facteur.', AD, {}],
  ['post', '/auth/admin/comptes/{id}/revoquer-sessions', 'Administration', 'Révoque toutes les sessions du compte.', AD, {}],
  ['get', '/cles-service', 'Administration', 'Clés de service (sans la clé ni son empreinte).', AD, { query: [...PAGE, q('poleId', UUID), q('active', { type: 'boolean' })] }],
  ['post', '/cles-service', 'Administration', 'Crée une clé de service pour un pôle. La clé en clair n\'est renvoyée qu\'une seule fois.', AD, { body: { poleId: '00000000-0000-0000-0000-000000000000', libelle: 'ERP production' } }],
  ['post', '/cles-service/{id}/revoquer', 'Administration', 'Révoque une clé de service (immédiat, irréversible).', AD, {}],
  ['post', '/utilisateurs', 'Administration', 'Crée un compte nominatif. Le mot de passe provisoire n\'est renvoyé qu\'une fois ; il doit être changé à la première connexion.', AD, { body: { nom: 'Rakotomalala', prenom: 'Hery', email: 'hery.rakotomalala@tanjakai.mg', role: 'RESPONSABLE_POLE' } }],
  ['patch', '/utilisateurs/{id}/role', 'Administration', 'Change le rôle d\'un compte (motif obligatoire, connexions en cours terminées). Refusé pour son propre compte ou pour un responsable encore rattaché à un pôle.', AD, { body: { role: 'CONTROLE_GESTION', motif: 'Affectation au contrôle de gestion' } }],
  ['post', '/utilisateurs/{id}/desactiver', 'Administration', 'Désactive un compte (jamais de suppression). Motif obligatoire, connexions en cours terminées. Refusé pour soi-même ou pour un responsable encore rattaché à un pôle.', AD, { body: { motif: 'Départ de l\'entreprise' } }],
  ['post', '/utilisateurs/{id}/reactiver', 'Administration', 'Réactive un compte désactivé (motif obligatoire).', AD, { body: { motif: 'Retour de congé long' } }],
  ['patch', '/poles/{id}/responsable', 'Référentiel', 'Rattache un responsable à un pôle (ou le détache avec responsableId = null). Motif obligatoire ; les saisies non validées d\'une campagne en cours passent au nouveau responsable.', `${CG}, ${AD}`, { body: { responsableId: '00000000-0000-0000-0000-000000000000', motif: 'Nouvelle affectation' } }],
  ['get', '/saisies/export', 'Saisies', 'Export CSV (séparateur « ; », BOM UTF-8) des saisies d\'une campagne. Responsable : ses pôles ; direction : saisies validées seulement ; contrôle de gestion et administrateur : tout.', TOUS, { query: [q('campagneId', UUID), q('poleId', UUID), q('statut', STR)] }],
  ['get', '/audit', 'Administration', 'Journal d\'audit (lecture seule, en ajout seul côté base) : qui a modifié quoi, quand, pourquoi. Filtres : entité, action, utilisateur, motif, dates.', AD, { query: [...PAGE, q('entite', STR), q('action', STR), q('utilisateur', STR), q('motif', STR), q('depuis', STR), q('jusqua', STR)] }],
  ['get', '/audit/entites', 'Administration', 'Liste des entités présentes dans le journal d\'audit (pour le filtre).', AD, {}],
  ['get', '/audit/{id}', 'Administration', 'Détail d\'une entrée : valeurs avant et après (sans secrets).', AD, {}],
  ['get', '/utilisateurs', 'Administration', 'Liste des utilisateurs.', `${CG}, ${AD}`, { query: PAGE }],

  ['get', '/poles', 'Référentiel', 'Pôles (un responsable ne voit que le sien).', TOUS, { query: [...PAGE, q('familleId', UUID)] }],
  ['get', '/poles/{id}', 'Référentiel', 'Détail d\'un pôle.', TOUS, {}],
  ['post', '/poles', 'Référentiel', 'Crée un pôle.', `${CG}, ${AD}`, { body: { code: 'P09', intitule: 'Nouveau pôle', familleId: '…', responsableId: '…' } }],
  ['get', '/poles/{id}/suspensions', 'Référentiel', 'Historique des suspensions.', TOUS, {}],
  ['post', '/poles/{id}/suspensions', 'Référentiel', 'Suspend un pôle (motif obligatoire).', `${CG}, ${AD}`, { body: { motif: '…', dateDebut: '2027-01-01' } }],
  ['get', '/familles', 'Référentiel', 'Familles d\'activité.', TOUS, {}],
  ['get', '/axes', 'Référentiel', 'Axes de notation (financier, humain, qualité).', TOUS, {}],
  ['get', '/criteres', 'Référentiel', 'Critères.', TOUS, { query: PAGE }],
  ['get', '/criteres/{id}', 'Référentiel', 'Détail d\'un critère.', TOUS, {}],
  ['post', '/criteres', 'Référentiel', 'Crée un critère (non utilisable tant qu\'il n\'est pas validé).', `${CG}, ${AD}`, { body: { axeId: '…', intitule: 'Chiffre d\'affaires', definition: '…', unite: 'EUR', sensOptimisation: 'MAXIMISER', sourceDonnee: 'ERP' } }],
  ['patch', '/criteres/{id}', 'Référentiel', 'Modifie un critère non validé.', `${CG}, ${AD}`, { body: { intitule: '…' } }],
  ['post', '/criteres/{id}/valider', 'Référentiel', 'Valide un critère.', CG, {}],
  ['get', '/grilles', 'Grille de notation', 'Versions de la grille.', `${CG}, ${DG}, ${AD}`, { query: PAGE }],
  ['get', '/grilles/{id}', 'Grille de notation', 'Détail d\'une version (pondérations, barèmes).', `${CG}, ${DG}, ${AD}`, {}],
  ['post', '/grilles', 'Grille de notation', 'Crée un brouillon de nouvelle version (motif obligatoire).', `${CG}, ${AD}`, { body: { motif: 'Révision annuelle' } }],
  ['put', '/grilles/{id}/ponderations-axes', 'Grille de notation', 'Pondérations des axes (total 100).', `${CG}, ${AD}`, { body: { ponderations: [{ axeId: '…', poids: 40 }] } }],
  ['put', '/grilles/{id}/ponderations-criteres', 'Grille de notation', 'Pondérations, plancher et plafond des critères.', `${CG}, ${AD}`, { body: { ponderations: [{ critereId: '…', poids: 100, plancher: 0.5, plafond: 1 }] } }],
  ['post', '/grilles/{id}/valider', 'Grille de notation', 'Valide et fige une version (immuable ensuite).', CG, {}],
  ['delete', '/grilles/{id}', 'Grille de notation', 'Supprime un brouillon.', `${CG}, ${AD}`, {}],
  ['get', '/cibles', 'Cibles', 'Cibles par pôle, critère et exercice.', TOUS, { query: [...PAGE, q('exercice', { type: 'integer' }), q('poleId', UUID)] }],
  ['put', '/cibles', 'Cibles', 'Propose ou modifie une cible.', `${CG}, ${AD}`, { body: { poleId: '…', critereId: '…', exercice: 2027, valeurCible: 100 } }],
  ['post', '/cibles/{id}/valider', 'Cibles', 'Valide une cible.', DG, {}],
  ['post', '/cibles/valider-lot', 'Cibles', 'Valide toutes les cibles d\'un exercice.', DG, { body: { exercice: 2027 } }],

  ['get', '/campagnes', 'Campagnes et saisie', 'Campagnes trimestrielles.', TOUS, { query: PAGE }],
  ['get', '/campagnes/{id}', 'Campagnes et saisie', 'Détail d\'une campagne.', TOUS, {}],
  ['post', '/campagnes', 'Campagnes et saisie', 'Ouvre une campagne : gèle grille, périmètre et cibles.', CG, { body: { exercice: 2027, trimestre: 1, grilleId: '…', dateLimite: '2027-04-30' } }],
  ['get', '/campagnes/{id}/avancement', 'Campagnes et saisie', 'Avancement de la saisie par pôle.', TOUS, {}],
  ['get', '/campagnes/{id}/poles/{poleId}/saisies', 'Campagnes et saisie', 'Espace de saisie d\'un pôle : critères, cibles, contrôles, complétion.', TOUS, {}],
  ['put', '/campagnes/{id}/poles/{poleId}/criteres/{critereId}', 'Campagnes et saisie', 'Enregistre un brouillon de saisie.', RP, { body: { valeurRealisee: 98.5, commentaire: '…' } }],
  ['post', '/campagnes/{id}/poles/{poleId}/soumettre', 'Campagnes et saisie', 'Soumet toutes les saisies du pôle (tout ou rien).', RP, {}],
  ['post', '/campagnes/{id}/poles/{poleId}/valider', 'Campagnes et saisie', 'Valide les saisies soumises du pôle.', CG, {}],
  ['post', '/campagnes/{id}/simuler', 'Campagnes et saisie', 'Simule la notation sans rien enregistrer.', CG, {}],
  ['post', '/campagnes/{id}/cloturer', 'Campagnes et saisie', 'Clôture : calcule, fige les scores et évalue les alertes.', CG, {}],
  ['post', '/campagnes/{id}/rouvrir', 'Campagnes et saisie', 'Rouvre une campagne (motif obligatoire, nouvelle version de score à la reclôture).', `${CG}, ${AD}`, { body: { motif: '…' } }],
  ['post', '/service/saisies', 'Saisie par API (clé de service)', 'Dépose une valeur pour un critère du pôle de la clé. Reste en brouillon. Idempotent.', 'clé de service (droit saisie:ecriture)', { service: true, body: { campagne_id: '…', critere_id: '…', valeur_realisee: 98.5, commentaire: 'Export ERP du 30/06' } }],

  ['get', '/scores', 'Scores et classements', 'Scores par pôle et campagne (version courante).', `${CG}, ${DG}, ${AD}, ${RP} (son pôle)`, { query: PAGE }],
  ['get', '/scores/{id}', 'Scores et classements', 'Détail d\'un score : axes, critères, contribution.', TOUS, {}],
  ['get', '/scores/{id}/verification', 'Scores et classements', 'Recalcul de contrôle d\'un score.', `${CG}, ${DG}, ${AD}`, {}],
  ['get', '/alertes', 'Alertes', 'Alertes (un responsable ne voit que celles de son pôle).', TOUS, { query: [...PAGE, q('actives', { type: 'boolean' }), q('type', { type: 'string', enum: ['VIGILANCE', 'DIRECTION', 'DEGRADATION'] })] }],
  ['get', '/alertes/{id}', 'Alertes', 'Détail d\'une alerte et de ses plans d\'action.', TOUS, {}],
  ['post', '/alertes/{id}/accuser', 'Alertes', 'Accusé de prise en compte avec plan d\'action daté.', RP, { body: { plans: [{ description: '…', echeance: '2027-12-31' }] } }],
  ['post', '/alertes/{id}/plans', 'Alertes', 'Ajoute une action.', `${RP}, ${CG}`, { body: { description: '…', echeance: '2027-12-31' } }],
  ['patch', '/alertes/{id}/plans/{planId}', 'Alertes', 'Fait avancer une action.', `${RP}, ${CG}`, { body: { statut: 'EN_COURS' } }],
  ['post', '/alertes/{id}/cloturer', 'Alertes', 'Clôture une alerte accusée.', CG, {}],
  ['get', '/seuils', 'Alertes', 'Seuils critiques (historique et en vigueur).', `${CG}, ${DG}, ${AD}`, {}],
  ['post', '/seuils', 'Alertes', 'Nouveau seuil à une date d\'effet (jamais de modification en place).', `${CG}, ${AD}`, { body: { valeur: 50, ecartDegradation: 15, dateEffet: '2027-01-01' } }],
  ['get', '/syntheses', 'Synthèses assistées', 'Synthèses : le contrôle de gestion voit tout ; la direction et les responsables ne voient que les synthèses validées.', `${CG}, ${DG}, ${RP} (validées de son pôle)`, { query: [...PAGE, q('campagneId', UUID), q('poleId', UUID), q('statut', { type: 'string', enum: ['BROUILLON', 'VALIDEE'] }), q('type', { type: 'string', enum: ['POLE', 'COMPARATIVE'] })] }],
  ['get', '/syntheses/{id}', 'Synthèses assistées', 'Détail : texte, mention « générée automatiquement », faits chiffrés transmis, mode (assisté ou dégradé).', `${CG}, ${DG}, ${RP}`, {}],
  ['post', '/syntheses/generer', 'Synthèses assistées', 'Génère un brouillon pour une campagne clôturée (sans poleId : synthèse comparative). Service indisponible, non configuré ou plafond atteint : mode dégradé, chiffres sans commentaire.', CG, { body: { campagneId: '…', poleId: '…' } }],
  ['patch', '/syntheses/{id}', 'Synthèses assistées', 'Relecture : corrige le commentaire d\'un brouillon (le texte original est conservé).', CG, { body: { contenu: 'Texte relu…' } }],
  ['post', '/syntheses/{id}/valider', 'Synthèses assistées', 'Valide après relecture : seule action qui rend la synthèse visible de la direction et du pôle.', CG, {}],
  ['get', '/syntheses/cout', 'Synthèses assistées', 'Dépense du mois, plafond, modèle et journal des derniers appels.', `${CG}, ${AD}`, {}],
  ['get', '/notifications', 'Notifications', 'Notifications de l\'utilisateur.', TOUS, { query: PAGE }],
  ['post', '/notifications/lues', 'Notifications', 'Marque toutes les notifications comme lues.', TOUS, {}],
  ['post', '/notifications/{id}/lue', 'Notifications', 'Marque une notification comme lue.', TOUS, {}],
  ['get', '/health/ready', 'Supervision', 'Disponibilité (base de données comprise).', 'public', { public: true }],
];

const ERREUR = (description) => ({ description, content: { 'application/json': { schema: { $ref: '#/components/schemas/Erreur' } } } });

function construire() {
  const paths = {};
  for (const [method, path, tag, summary, roles, o] of OPS) {
    const params = [...(o.query || [])];
    for (const m of path.matchAll(/\{(\w+)\}/g)) params.push({ name: m[1], in: 'path', required: true, schema: UUID });
    if (o.service) params.push({ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', maxLength: 255 },
      description: 'Identifiant unique de l\'envoi : un renvoi avec la même clé ne crée pas de doublon (200 au lieu de 201).' });
    const op = {
      tags: [tag], summary, description: `**Rôles autorisés :** ${roles}.`, parameters: params,
      security: o.public ? [] : o.service ? [{ cleDeService: [] }] : [{ jeton: [] }],
      responses: {
        200: { description: 'Succès' },
        400: ERREUR('Données invalides'),
        ...(o.public ? {} : { 401: ERREUR('Non authentifié') }),
        ...(o.public ? {} : { 403: ERREUR('Rôle insuffisant') }),
        404: ERREUR('Ressource introuvable'),
        409: ERREUR('Conflit d\'état (campagne clôturée, doublon, saisie déjà soumise…)'),
        422: ERREUR('Règle métier non respectée'),
      },
    };
    if (o.service) { op.responses[201] = { description: 'Saisie créée (brouillon)' }; }
    if (o.body) op.requestBody = { required: true, content: { 'application/json': { schema: { type: 'object' }, example: o.body } } };
    (paths[path] ||= {})[method] = op;
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'API TANJAKAI — Suivi et notation pondérée des pôles',
      version: '1.0.0',
      description: [
        'API REST versionnée (`/api/v1`). Toutes les réponses sont en JSON.',
        '',
        '**Authentification utilisateur** : `POST /auth/login` → jeton d\'accès (15 min) à envoyer en `Authorization: Bearer …`, renouvelable par `POST /auth/refresh`. Second facteur (TOTP) obligatoire pour la direction générale et l\'administrateur.',
        '',
        '**Authentification d\'un système client** : en-tête `X-Service-Key` (clé créée par l\'administrateur, liée à un pôle). Elle n\'autorise que l\'écriture de saisies en brouillon pour ce pôle.',
        '',
        '**Pagination** : `?page=1&limit=20` → `{ data: [...], pagination: { page, limit, total } }`.',
        '',
        '**Erreurs** : `{ error: { code, message, details?, requestId } }`. Le `requestId` figure aussi dans les journaux serveur.',
      ].join('\n'),
    },
    servers: [{ url: '/api/v1' }],
    tags: [...new Set(OPS.map((o) => o[2]))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        jeton: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        cleDeService: { type: 'apiKey', in: 'header', name: 'X-Service-Key' },
      },
      schemas: {
        Erreur: {
          type: 'object',
          properties: { error: { type: 'object', properties: {
            code: { type: 'string', example: 'VALIDATION_ERROR' }, message: { type: 'string' },
            details: {}, requestId: { type: 'string' } } } },
        },
      },
    },
  };
}

module.exports = { construire, OPS };
