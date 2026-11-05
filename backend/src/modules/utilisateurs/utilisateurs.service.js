const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../../config/db');
const env = require('../../config/env');
const repo = require('./utilisateurs.repository');
const authRepo = require('../auth/auth.repository');
const { erreursMotDePasse } = require('../auth/password-policy');
const { notFound, conflict, forbidden } = require('../../utils/httpError');

const ROLES_2FA = ['DIRECTION_GENERALE', 'ADMINISTRATEUR'];

const MAJ = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MIN = 'abcdefghijkmnopqrstuvwxyz';
const NUM = '23456789';
const SPE = '!@#$%&*+-=?';
const tirer = (alphabet) => alphabet[crypto.randomInt(alphabet.length)];

/** Mot de passe provisoire de 16 caractères, conforme à la politique de robustesse (sans caractères ambigus). */
function motDePasseProvisoire(contexte = {}) {
  for (;;) {
    const c = [tirer(MAJ), tirer(MIN), tirer(NUM), tirer(SPE)];
    const tout = MAJ + MIN + NUM + SPE;
    while (c.length < 16) c.push(tirer(tout));
    for (let i = c.length - 1; i > 0; i -= 1) { const j = crypto.randomInt(i + 1); [c[i], c[j]] = [c[j], c[i]]; }
    const mdp = c.join('');
    if (!erreursMotDePasse(mdp, contexte).length) return mdp;
  }
}

async function lister(role) { return { data: await repo.lister(role) }; }

/** Création d'un compte nominatif. Le mot de passe provisoire n'est renvoyé qu'ici, une seule fois. */
async function creer(admin, { nom, prenom, email, role }) {
  const provisoire = motDePasseProvisoire({ email, nom, prenom });
  const hash = await bcrypt.hash(provisoire, env.BCRYPT_ROUNDS);
  let compte;
  try {
    compte = await db.withTransaction({ userId: admin.id, motif: 'Création de compte' }, (client) =>
      repo.inserer(client, { nom, prenom, email, role, hash, secondFacteur: ROLES_2FA.includes(role) }));
  } catch (err) {
    if (err.code === '23505') throw conflict('Un compte existe déjà avec cette adresse e-mail');
    throw err;
  }
  return { ...compte, motDePasseProvisoire: provisoire, secondFacteurRequis: ROLES_2FA.includes(role) };
}

/**
 * Changement de rôle (dérogation motivée et tracée). Garde-fous : jamais son propre rôle, jamais un responsable encore rattaché à un pôle. Les connexions en cours sont terminées (le rôle est porté par le jeton).
 */
async function changerRole(admin, id, { role, motif }) {
  if (id === admin.id) throw forbidden('Vous ne pouvez pas modifier votre propre rôle');
  return db.withTransaction({ userId: admin.id, motif: `Changement de rôle : ${motif}` }, async (client) => {
    const cible = await repo.trouverPourMiseAJour(client, id);
    if (!cible) throw notFound('Compte introuvable');
    if (cible.role === role) throw conflict('Ce compte a déjà ce rôle');
    if (cible.role === 'RESPONSABLE_POLE') {
      const poles = await repo.polesDuResponsable(client, id);
      if (poles.length) throw conflict(`Ce responsable est encore rattaché à : ${poles.join(', ')}. Détachez-le d'abord de ces pôles.`);
    }
    // Direction et administration : second facteur obligatoire (à enrôler à la prochaine connexion). Sinon, on le garde s'il est déjà actif.
    const secondFacteur = ROLES_2FA.includes(role) || cible.totpActif;
    const maj = await repo.changerRole(client, id, role, secondFacteur);
    const n = await authRepo.revoquerSessionsUtilisateur(client, id, 'CHANGEMENT_DE_ROLE', null);
    return { ...maj, ancienRole: cible.role, secondFacteurRequis: secondFacteur, connexionsTerminees: n };
  });
}

/**
 * Désactivation d'un compte (jamais de suppression : l'historique reste attribuable). Garde-fous : pas soi-même,
 * pas un responsable encore rattaché à un pôle. Toutes ses connexions sont terminées.
 */
async function desactiver(admin, id, { motif }) {
  if (id === admin.id) throw forbidden('Vous ne pouvez pas désactiver votre propre compte');
  return db.withTransaction({ userId: admin.id, motif: `Désactivation de compte : ${motif}` }, async (client) => {
    const cible = await repo.trouverPourMiseAJour(client, id);
    if (!cible) throw notFound('Compte introuvable');
    if (!cible.actif) throw conflict('Ce compte est déjà désactivé');
    if (cible.role === 'RESPONSABLE_POLE') {
      const poles = await repo.polesDuResponsable(client, id);
      if (poles.length) throw conflict(`Ce responsable est encore rattaché à : ${poles.join(', ')}. Rattachez d'abord ces pôles à un autre responsable.`);
    }
    const maj = await repo.majActif(client, id, false);
    const n = await authRepo.revoquerSessionsUtilisateur(client, id, 'COMPTE_DESACTIVE', null);
    return { ...maj, connexionsTerminees: n };
  });
}

async function reactiver(admin, id, { motif }) {
  return db.withTransaction({ userId: admin.id, motif: `Réactivation de compte : ${motif}` }, async (client) => {
    const cible = await repo.trouverPourMiseAJour(client, id);
    if (!cible) throw notFound('Compte introuvable');
    if (cible.actif) throw conflict('Ce compte est déjà actif');
    return repo.majActif(client, id, true);
  });
}

module.exports = { lister, creer, changerRole, desactiver, reactiver, motDePasseProvisoire };
