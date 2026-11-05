const { z } = require('zod');

const ROLES = ['RESPONSABLE_POLE', 'CONTROLE_GESTION', 'DIRECTION_GENERALE', 'ADMINISTRATEUR'];

const idParams = z.object({ id: z.string().uuid() });

const listQuery = z.object({ role: z.enum(ROLES).optional() });

// Comptes strictement nominatifs : un compte = une personne
const creerBody = z.object({
  nom: z.string().trim().min(2, 'Nom obligatoire').max(80),
  prenom: z.string().trim().min(2, 'Prénom obligatoire').max(80),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(160),
  role: z.enum(ROLES),
});

// Changer un rôle est une dérogation : le motif est obligatoire et tracé
const modifierBody = z.object({
  role: z.enum(ROLES),
  motif: z.string().trim().min(5, 'Motif obligatoire (5 caractères minimum)').max(500),
});

// Désactiver un compte est tracé : motif obligatoire
const desactiverBody = z.object({
  motif: z.string().trim().min(5, 'Motif obligatoire (5 caractères minimum)').max(500),
});

module.exports = { ROLES, idParams, listQuery, creerBody, modifierBody, desactiverBody };
