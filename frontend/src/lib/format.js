export const ROLES = {
  RESPONSABLE_POLE: 'Responsable de pôle',
  CONTROLE_GESTION: 'Contrôle de gestion',
  DIRECTION_GENERALE: 'Direction générale',
  ADMINISTRATEUR: 'Administrateur',
};

export const AXES = { FINANCIER: 'Financier', HUMAIN: 'Humain', QUALITE: 'Qualité' };

export const STATUT_CAMPAGNE = { OUVERTE: 'Ouverte', CLOTUREE: 'Clôturée', ROUVERTE: 'Rouverte' };
export const STATUT_SAISIE = { BROUILLON: 'Brouillon', SOUMISE: 'Soumise', RENVOYEE: 'À corriger', VALIDEE: 'Validée' };

export function nombre(n, decimales = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: decimales }).format(n);
}

export function pourcent(taux, decimales = 0) {
  if (taux === null || taux === undefined) return '—';
  return `${nombre(taux * 100, decimales)} %`;
}

export function date(d) {
  if (!d) return '—';
  const x = typeof d === 'string' && d.length === 10 ? new Date(`${d}T00:00:00`) : new Date(d);
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(x);
}

export function dateHeure(d) {
  if (!d) return '—';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(d));
}

export const periode = (c) => `T${c.trimestre} ${c.exercice}`;
export const rangPeriode = (c) => c.exercice * 4 + c.trimestre;

export function telechargerCsv(nomFichier, lignes) {
  const echappe = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const contenu = `﻿${lignes.map((l) => l.map(echappe).join(';')).join('\n')}`;
  const url = URL.createObjectURL(new Blob([contenu], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nomFichier; a.click();
  URL.revokeObjectURL(url);
}

/** Taux d'atteinte (aperçu de la saisie) : même règle que le moteur du serveur. */
export function tauxAtteinte(sens, valeur, cible) {
  if (valeur === null || valeur === undefined || cible === null || cible === undefined) return null;
  if (sens === 'MAXIMISER') return cible === 0 ? null : valeur / cible;
  if (valeur === 0) return cible === 0 ? 1 : Infinity;
  return cible / valeur;
}
