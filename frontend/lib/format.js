export const trimestre = (c) => (c ? `T${c.trimestre} ${c.exercice}` : '');

export function nombre(n, decimales = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: decimales });
}

export function pourcent(taux, decimales = 1) {
  if (taux === null || taux === undefined) return '—';
  return `${nombre(Number(taux) * 100, decimales)} %`;
}

export function date(d) {
  if (!d) return '—';
  const s = String(d).slice(0, 10);
  const [y, m, j] = s.split('-');
  return y && m && j ? `${j}/${m}/${y}` : s;
}

export function dateHeure(d) {
  if (!d) return '—';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '—' : x.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export const taille = (o) => (o > 1048576 ? `${nombre(o / 1048576, 1)} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);

export const AXES = { FINANCIER: 'Objectifs financiers', HUMAIN: 'Objectifs humains', QUALITE: 'Objectifs de qualité' };

/** Ligne CSV compatible tableur français (séparateur « ; », BOM UTF-8 pour Excel). */
export function exporterCsv(nomFichier, colonnes, lignes) {
  const esc = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (typeof v === 'number' || /^-?\d+(\.\d+)?$/.test(s)) s = s.replace('.', ','); // décimale à la française, seulement pour un nombre
    else if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // protection contre l'injection de formule dans un tableur
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const texte = [colonnes.map((c) => esc(c.titre)).join(';'), ...lignes.map((l) => colonnes.map((c) => esc(c.valeur(l))).join(';'))].join('\r\n');
  const blob = new Blob([`﻿${texte}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomFichier;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const LIBELLE_EVENEMENT = {
  CONNEXION_REUSSIE: 'Connexion réussie',
  ECHEC_CONNEXION: 'Identifiant inconnu ou compte désactivé',
  ECHEC_MOT_DE_PASSE: 'Mot de passe incorrect',
  ECHEC_2FA: 'Code de vérification incorrect',
  COMPTE_VERROUILLE: 'Compte verrouillé',
  CONNEXION_REFUSEE_VERROUILLE: 'Connexion refusée (compte verrouillé)',
  COMPTE_DEVERROUILLE: 'Compte déverrouillé',
  DECONNEXION: 'Déconnexion',
  SESSION_EXPIREE: 'Session expirée (inactivité)',
  REJEU_JETON: 'Jeton réutilisé : connexion révoquée',
  TOTP_ACTIVE: 'Second facteur activé',
  TOTP_DESACTIVE: 'Second facteur désactivé',
  TOTP_REINITIALISE: 'Second facteur réinitialisé',
  CODE_SECOURS_UTILISE: 'Code de secours utilisé',
  CODES_SECOURS_RENOUVELES: 'Codes de secours renouvelés',
  MOT_DE_PASSE_MODIFIE: 'Mot de passe modifié',
  SESSIONS_REVOQUEES: 'Connexions terminées',
};
// Événements à surveiller : tentatives d'intrusion possibles
export const EVENEMENTS_ALERTE = ['ECHEC_CONNEXION', 'ECHEC_MOT_DE_PASSE', 'ECHEC_2FA', 'COMPTE_VERROUILLE', 'CONNEXION_REFUSEE_VERROUILLE', 'REJEU_JETON'];
