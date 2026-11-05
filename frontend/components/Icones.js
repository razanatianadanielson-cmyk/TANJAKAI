// Icônes SVG légères (aucune dépendance) : trait de 1,8 px, couleur héritée du texte.
const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false };

export const IconeVigilance = (p) => (
  <svg {...base} {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const IconeDirection = (p) => (
  <svg {...base} {...p}><path d="M5 21V4" /><path d="M5 4h12l-2.5 4L17 12H5" /></svg>
);
export const IconeDegradation = (p) => (
  <svg {...base} {...p}><path d="M3 6l6 6 4-4 8 8" /><path d="M15 16h6v-6" /></svg>
);
export const IconeCloche = (p) => (
  <svg {...base} {...p}><path d="M6 17V11a6 6 0 1 1 12 0v6l2 2H4z" /><path d="M10 21a2 2 0 0 0 4 0" /></svg>
);

const PAR_TYPE = { VIGILANCE: IconeVigilance, DIRECTION: IconeDirection, DEGRADATION: IconeDegradation };
export const LIBELLE_TYPE = { VIGILANCE: 'Vigilance', DIRECTION: 'Direction', DEGRADATION: 'Dégradation rapide' };

/** Pastille de type d'alerte : icône + libellé. */
export function TypeAlerte({ type }) {
  const Icone = PAR_TYPE[type] || IconeCloche;
  const ton = type === 'DIRECTION' ? 'danger' : type === 'DEGRADATION' ? 'attention' : 'attente';
  return <span className={`etat ${ton} avec-icone`}><Icone width={15} height={15} />{LIBELLE_TYPE[type] || type}</span>;
}

// ---------- Jeu d'icônes général (dessinées pour TANJAKAI, aucune dépendance) ----------
const TRACES = {
  tableau: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  direction: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
  saisie: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  controle: <><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>,
  syntheses: <><path d="M6 3h8l5 5v13H6z" /><path d="M14 3v5h5" /><path d="M9 13h7M9 17h5" /></>,
  alertes: <><path d="M6 17V11a6 6 0 1 1 12 0v6l2 2H4z" /><path d="M10 21a2 2 0 0 0 4 0" /></>,
  campagnes: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  scores: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-6" /><circle cx="12" cy="18" r="1.2" /></>,
  cibles: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>,
  grilles: <><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17" /></>,
  criteres: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  poles: <><path d="M4 21V8l8-4 8 4v13" /><path d="M2.5 21h19" /><path d="M9 21v-6h6v6" /><path d="M9 11h.01M15 11h.01" /></>,
  administration: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  compte: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></>,
  deconnexion: <><path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9" /><path d="M15 8l4 4-4 4M19 12H9" /></>,
  connexion: <><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" /><path d="M10 8l4 4-4 4M14 12H4" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  telecharger: <><path d="M12 4v11" /><path d="M7.5 11L12 15.5 16.5 11" /><path d="M4 20h16" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  disquette: <><path d="M5 3.5h11l3.5 3.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5z" /><path d="M7.5 3.5v5h7v-5M7.5 20.5v-6h9v6" /></>,
  check: <><path d="M5 12.5l4.5 4.5L19 7.5" /></>,
  envoyer: <><path d="M21 3L10 14" /><path d="M21 3l-7 18-4-7-7-4z" /></>,
  retour: <><path d="M9 8L4 13l5 5" /><path d="M4 13h10a6 6 0 0 1 6 6" /></>,
  cadenas: <><rect x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  deverrouiller: <><rect x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-1.8" /></>,
  calcul: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" /></>,
  bloquer: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  horloge: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  loupe: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  etincelle: <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 17v4M17 19h4" /></>,
  crayon: <><path d="M4 20h4L19 9l-4-4L4 16z" /></>,
  copier: <><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" /><path d="M15.5 8.5V6A2 2 0 0 0 13.5 4H6A2 2 0 0 0 4 6v7.5A2 2 0 0 0 6 15.5h2.5" /></>,
  drapeau: <><path d="M5 21V4" /><path d="M5 4h12l-2.5 4L17 12H5" /></>,
  croix: <><path d="M6 6l12 12M18 6L6 18" /></>,
  cle: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></>,
  fleche: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  succes: <><circle cx="12" cy="12" r="9" /><path d="M8 12.5l3 3 5-6" /></>,
  erreur: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5h.01" /></>,
  attention: <><path d="M12 3.5L2.5 20h19z" /><path d="M12 10v4.5M12 17.5h.01" /></>,
  vide: <><path d="M4 13l3-8h10l3 8" /><path d="M4 13v6a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-6h-5a3 3 0 0 1-6 0z" /></>,
  utilisateurs: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18.5 14.4c1.8.8 3 2.6 3 5.6" /></>,
  oeil: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  'oeil-barre': <><path d="M3 3l18 18" /><path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.7 6.8A16.6 16.6 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.2-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  soleil: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" /></>,
  lune: <><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></>,
  journal: <><path d="M6 3.5h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
};

/** Icône du jeu général : <Icone nom="alertes" />. Décorative (aria-hidden) : le libellé reste dans le texte voisin. */
export function Icone({ nom, taille = 18, ...reste }) {
  const trace = TRACES[nom];
  if (!trace) return null;
  return <svg {...base} width={taille} height={taille} className="icone" {...reste}>{trace}</svg>;
}
