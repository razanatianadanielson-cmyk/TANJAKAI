'use strict';
// Jeu de données de RÉFÉRENCE (test de non-régression du calcul) — résultats calculés à la main.
//
//  FINANCIER (40 %)  CA réalisé    MAX 60 %  cible 1000  valeur 900   taux 0,90 -> note  80
//                    Marge         MAX 40 %  cible 20    valeur 22    taux 1,10 -> note 100   => axe = 88,00
//  HUMAIN    (30 %)  Rotation      MIN 50 %  cible 10    valeur 12,5  taux 0,80 -> note  60
//                    Absentéisme   MIN 50 %  cible 4     valeur 4     taux 1,00 -> note 100   => axe = 80,00
//  QUALITÉ   (30 %)  Satisfaction  MAX 70 %  cible 90    valeur 81    taux 0,90 -> note  80
//                    Réclamations  MIN 30 %  cible 2     valeur 4     taux 0,50 -> note   0   => axe = 56,00
//  Score consolidé = (40×88 + 30×80 + 30×56) / 100 = 76,00
//
//  Variante « Marge non renseignée » : axe financier = 80,00 -> score = 72,80 (partiel)

const bareme = { plancher: 0.5, plafond: 1.0 };
const critere = (critereId, intitule, poids, sens, valeurCible, valeurSaisie) =>
  ({ critereId, intitule, poids, sens, valeurCible, valeurSaisie, ...bareme });

function entreesReference({ margeRenseignee = true } = {}) {
  return {
    axes: [
      { axeId: 'ax-fin', code: 'FINANCIER', poids: 40, criteres: [
        critere('c-ca', 'CA réalisé', 60, 'MAXIMISER', 1000, 900),
        critere('c-marge', 'Marge', 40, 'MAXIMISER', 20, margeRenseignee ? 22 : null),
      ] },
      { axeId: 'ax-hum', code: 'HUMAIN', poids: 30, criteres: [
        critere('c-rot', 'Rotation du personnel', 50, 'MINIMISER', 10, 12.5),
        critere('c-abs', 'Absentéisme', 50, 'MINIMISER', 4, 4),
      ] },
      { axeId: 'ax-qua', code: 'QUALITE', poids: 30, criteres: [
        critere('c-sat', 'Satisfaction client', 70, 'MAXIMISER', 90, 81),
        critere('c-rec', 'Taux de réclamation', 30, 'MINIMISER', 2, 4),
      ] },
    ],
  };
}

module.exports = { entreesReference };

/** Même jeu de référence, sous la forme des lignes SQL que lit le repository (pour l'assembleur). */
function lignesReference(poleId = 'p1') {
  const e = entreesReference();
  const lignes = { poles: [{ poleId, poleCode: 'BPO-01' }], criteres: [], axes: [] };
  for (const a of e.axes) {
    lignes.axes.push({ poleId, axeId: a.axeId, poids: a.poids });
    for (const c of a.criteres) {
      lignes.criteres.push({ poleId, axeId: a.axeId, axeCode: a.code, critereId: c.critereId, intitule: c.intitule,
        sens: c.sens, valeurCible: c.valeurCible, poidsCritere: c.poids, plancher: c.plancher, plafond: c.plafond,
        valeurRealisee: c.valeurSaisie, saisieValidee: true });
    }
  }
  return lignes;
}

module.exports.lignesReference = lignesReference;
