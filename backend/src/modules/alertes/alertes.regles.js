/**
 * Règles d'alerte (fonctions pures, testables sans base) — cahier des charges 2.4.
 *
 *  - VIGILANCE   : dès le premier trimestre sous le seuil critique (global, ou par axe si un seuil d'axe existe).
 *  - DIRECTION   : sous le seuil critique deux trimestres CONSÉCUTIFS (règle centrale).
 *  - DEGRADATION : chute du score consolidé supérieure à l'écart paramétré, même au-dessus du seuil.
 *
 * Entrée :
 *   courant   { score, partiel }                       score consolidé du trimestre (null = non calculable)
 *   seuil     { id, valeur, ecartDegradation }         seuil global en vigueur
 *   precedent { score, sousSeuil } | null              trimestre immédiatement précédent (null = absent ou non consécutif)
 *   axes      [{ code, note, seuil: { id, valeur } }]  notes d'axe et seuils d'axe éventuels
 * Sortie : liste de { type, seuilId, message }.
 */
const f = (n) => Number(n).toFixed(1).replace('.', ',');

function decider({ courant, seuil, precedent, axes = [] }) {
  if (!seuil || courant.score === null || courant.score === undefined) return [];
  const suffixe = courant.partiel ? ' (score partiel : campagne incomplète)' : '';
  const alertes = [];
  const sous = courant.score < seuil.valeur;

  const axesSous = axes.filter((a) => a.seuil && a.note !== null && a.note !== undefined && a.note < a.seuil.valeur);
  if (sous || axesSous.length) {
    const parts = [];
    if (sous) parts.push(`score consolidé ${f(courant.score)} sous le seuil critique de ${f(seuil.valeur)}`);
    axesSous.forEach((a) => parts.push(`axe ${a.code} : ${f(a.note)} sous son seuil de ${f(a.seuil.valeur)}`));
    alertes.push({
      type: 'VIGILANCE',
      seuilId: sous ? seuil.id : axesSous[0].seuil.id,
      message: `Vigilance : ${parts.join(' ; ')}${suffixe}.`,
    });
  }

  if (sous && precedent && precedent.sousSeuil) {
    alertes.push({
      type: 'DIRECTION',
      seuilId: seuil.id,
      message: `Alerte de direction : sous le seuil critique de ${f(seuil.valeur)} deux trimestres consécutifs `
        + `(${f(precedent.score)} puis ${f(courant.score)})${suffixe}.`,
    });
  }

  if (precedent && precedent.score !== null && seuil.ecartDegradation !== null && seuil.ecartDegradation !== undefined) {
    const chute = precedent.score - courant.score;
    if (chute > seuil.ecartDegradation) {
      alertes.push({
        type: 'DEGRADATION',
        seuilId: seuil.id,
        message: `Dégradation rapide : le score passe de ${f(precedent.score)} à ${f(courant.score)} `
          + `(−${f(chute)} points, écart toléré ${f(seuil.ecartDegradation)})${suffixe}.`,
      });
    }
  }
  return alertes;
}

module.exports = { decider };
