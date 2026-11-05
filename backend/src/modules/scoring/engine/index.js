'use strict';
/**
 * MOTEUR DE NOTATION — calcul pur, sans accès à la base ni à l'horloge.
 *
 * Chaîne de calcul (cahier des charges, § 2.3.1) :
 *   1. valeur saisie  -> taux d'atteinte de la cible propre au pôle -> note de 0 à 100 (barème)
 *   2. notes des critères d'un axe     -> note de l'axe       (moyenne pondérée)
 *   3. notes des axes                  -> score consolidé     (moyenne pondérée)
 *
 * Règles :
 *  - jamais de note sur une valeur brute : on note le taux d'atteinte de la cible ;
 *  - sens MAXIMISER : taux = valeur / cible ; sens MINIMISER : taux = cible / valeur
 *    (une valeur inférieure à la cible améliore donc la note) ;
 *  - barème : note = 100 × (taux − plancher) / (plafond − plancher), bornée à [0 ; 100].
 *    Plancher et plafond sont des TAUX d'atteinte (ex. 0,5 et 1,0 : en dessous de 50 % de la
 *    cible la note est 0 ; à 100 % de la cible elle est de 100) ;
 *  - critère non renseigné : jamais estimé, exclu du calcul, sa pondération est redistribuée
 *    sur les autres critères du même axe ; l'axe sans aucune note est exclu de la même façon
 *    au niveau du score consolidé ; le score est alors marqué « partiel » ;
 *  - déterministe : mêmes entrées => même score (arithmétique entière sur les centièmes pour
 *    les moyennes pondérées, arrondi au centième « moitié vers le haut »).
 */

const SENS = Object.freeze({ MAXIMISER: 'MAXIMISER', MINIMISER: 'MINIMISER' });
const STATUT_CRITERE = Object.freeze({ NOTE: 'NOTE', NON_RENSEIGNE: 'NON_RENSEIGNE' });

class EngineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

/** Arrondi « moitié vers le haut » à `decimales`, robuste aux erreurs binaires (71,425 -> 71,43). */
function arrondi(x, decimales = 2) {
  const f = 10 ** decimales;
  const r = Math.round(Math.abs(x) * f + 1e-9) / f;
  return x < 0 ? -r : r;
}

/** Nombre -> entier en centièmes (poids et notes ont au plus 2 décimales). */
const enCentiemes = (x) => Math.round(x * 100 + (x >= 0 ? 1e-9 : -1e-9));

function exigerNombre(valeur, code, libelle) {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) {
    throw new EngineError(code, `${libelle} doit être un nombre fini (reçu : ${valeur})`);
  }
  return valeur;
}

function validerPoids(poids, libelle) {
  exigerNombre(poids, 'INVALID_WEIGHT', `Pondération ${libelle}`);
  if (poids < 0) throw new EngineError('INVALID_WEIGHT', `Pondération ${libelle} négative`);
  return poids;
}

function validerBareme(plancher, plafond, libelle) {
  exigerNombre(plancher, 'INVALID_SCALE', `Plancher ${libelle}`);
  exigerNombre(plafond, 'INVALID_SCALE', `Plafond ${libelle}`);
  if (plancher < 0 || plancher >= plafond) {
    throw new EngineError('INVALID_SCALE', `Barème ${libelle} invalide : 0 ≤ plancher < plafond requis`);
  }
}

/** Étape 1a — taux d'atteinte de la cible (peut valoir Infinity : valeur nulle pour un critère à minimiser). */
function tauxAtteinte(valeur, cible, sens) {
  exigerNombre(valeur, 'INVALID_VALUE', 'Valeur saisie');
  exigerNombre(cible, 'INVALID_TARGET', 'Cible');
  if (sens === SENS.MAXIMISER) {
    if (!(cible > 0)) throw new EngineError('INVALID_TARGET', 'Cible strictement positive requise (critère à maximiser)');
    return valeur / cible;
  }
  if (sens === SENS.MINIMISER) {
    if (cible < 0) throw new EngineError('INVALID_TARGET', 'Cible négative interdite (critère à minimiser)');
    if (valeur <= 0) return cible > 0 || valeur < 0 ? Infinity : 1; // meilleur que la cible, ou cible 0 atteinte
    return cible === 0 ? 0 : cible / valeur;
  }
  throw new EngineError('INVALID_SENS', `Sens d'optimisation inconnu : ${sens}`);
}

/** Étape 1b — conversion du taux en note de 0 à 100 par le barème. */
function noteDepuisTaux(taux, plancher, plafond) {
  if (taux === Infinity) return 100;
  const ratio = (taux - plancher) / (plafond - plancher);
  return arrondi(Math.min(1, Math.max(0, ratio)) * 100, 2);
}

/** Moyenne pondérée en arithmétique entière. items : [{ poidsH, noteH }] (centièmes). */
function moyennePonderee(items) {
  const sommePoidsH = items.reduce((s, i) => s + i.poidsH, 0);
  if (sommePoidsH === 0) return { noteH: null, sommePoidsH: 0 };
  const numerateur = items.reduce((s, i) => s + i.poidsH * i.noteH, 0);
  return { noteH: Math.round(numerateur / sommePoidsH), sommePoidsH };
}

function calculerCritere(c, libelleAxe) {
  const libelle = `du critère « ${c.intitule || c.critereId} » (${libelleAxe})`;
  const poidsH = enCentiemes(validerPoids(c.poids, libelle));
  validerBareme(c.plancher, c.plafond, libelle);
  exigerNombre(c.valeurCible, 'INVALID_TARGET', `Cible ${libelle}`);

  const base = {
    critereId: c.critereId,
    intitule: c.intitule ?? null,
    sens: c.sens,
    poidsNominal: poidsH / 100,
    valeurCible: c.valeurCible,
    valeurSaisie: c.valeurSaisie ?? null,
    plancher: c.plancher,
    plafond: c.plafond,
  };
  if (c.valeurSaisie === null || c.valeurSaisie === undefined) {
    return { public: { ...base, statut: STATUT_CRITERE.NON_RENSEIGNE, tauxAtteinte: null, note: null }, poidsH, noteH: null };
  }
  const taux = tauxAtteinte(c.valeurSaisie, c.valeurCible, c.sens);
  const note = noteDepuisTaux(taux, c.plancher, c.plafond);
  return { public: { ...base, statut: STATUT_CRITERE.NOTE, tauxAtteinte: taux, note }, poidsH, noteH: enCentiemes(note) };
}

/** Étape 2 — note d'un axe. */
function calculerAxe(axe) {
  const libelleAxe = `axe ${axe.code || axe.axeId}`;
  const poidsAxeH = enCentiemes(validerPoids(axe.poids, `de l'${libelleAxe}`));
  const calcules = (axe.criteres || []).map((c) => calculerCritere(c, libelleAxe));
  const notes = calcules.filter((c) => c.noteH !== null);
  const { noteH, sommePoidsH } = moyennePonderee(notes.map((c) => ({ poidsH: c.poidsH, noteH: c.noteH })));

  const criteres = calcules.map((c) => ({
    ...c.public,
    // poids réellement appliqué après redistribution (traçabilité), en % de l'axe
    poidsEffectif: c.noteH !== null && sommePoidsH > 0 ? arrondi((c.poidsH / sommePoidsH) * 100, 2) : 0,
  }));
  return {
    interne: { poidsAxeH, noteH },
    public: {
      axeId: axe.axeId,
      code: axe.code ?? null,
      poidsNominal: poidsAxeH / 100,
      note: noteH === null ? null : noteH / 100,
      partiel: calcules.length === 0 || notes.length < calcules.length || noteH === null,
      criteres,
    },
  };
}

/**
 * Étape 3 — score consolidé d'un pôle.
 * @param {{ axes: Array<{ axeId, code?, poids, criteres: Array<{ critereId, intitule?, poids, sens,
 *          valeurCible, valeurSaisie, plancher, plafond }> }> }} entree
 */
function calculerScorePole(entree) {
  if (!entree || !Array.isArray(entree.axes)) throw new EngineError('INVALID_INPUT', 'Entrée invalide : axes attendus');
  const calcules = entree.axes.map(calculerAxe);
  const notes = calcules.filter((a) => a.interne.noteH !== null);
  const { noteH, sommePoidsH } = moyennePonderee(notes.map((a) => ({ poidsH: a.interne.poidsAxeH, noteH: a.interne.noteH })));

  const axes = calcules.map((a) => ({
    ...a.public,
    poidsEffectif: a.interne.noteH !== null && sommePoidsH > 0 ? arrondi((a.interne.poidsAxeH / sommePoidsH) * 100, 2) : 0,
  }));

  const anomalies = [];
  for (const a of axes) {
    if (a.note === null) anomalies.push(`Axe ${a.code || a.axeId} sans note : exclu, pondération redistribuée sur les autres axes`);
    for (const c of a.criteres) {
      if (c.statut === STATUT_CRITERE.NON_RENSEIGNE) {
        anomalies.push(`Critère « ${c.intitule || c.critereId} » non renseigné : exclu, pondération redistribuée dans l'axe ${a.code || a.axeId}`);
      }
    }
  }
  const partiel = axes.length === 0 || axes.some((a) => a.partiel);
  if (axes.length === 0) anomalies.push('Aucun critère applicable pour ce pôle');

  return { scoreConsolide: noteH === null ? null : noteH / 100, partiel, axes, anomalies };
}

module.exports = {
  SENS, STATUT_CRITERE, EngineError,
  arrondi, tauxAtteinte, noteDepuisTaux, moyennePonderee, calculerAxe, calculerScorePole,
};
