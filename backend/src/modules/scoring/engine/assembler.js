'use strict';
const { EngineError } = require('./index');

/**
 * Assemble les lignes issues de la base en entrées du moteur, une par pôle du périmètre.
 *  - poles    : [{ poleId, poleCode }]
 *  - criteres : [{ poleId, axeId, axeCode, critereId, intitule, sens, valeurCible, poidsCritere,
 *                  plancher, plafond, valeurRealisee, saisieValidee }]
 *  - axes     : [{ poleId, axeId, poids }]   (pondération d'axe effective du pôle)
 * Seule une saisie VALIDÉE est prise en compte ; sinon le critère est « non renseigné ».
 */
function assemblerEntrees({ poles, criteres, axes }) {
  const poidsAxe = new Map(axes.map((a) => [`${a.poleId}|${a.axeId}`, a.poids]));
  return poles.map((pole) => {
    const parAxe = new Map();
    for (const c of criteres.filter((x) => x.poleId === pole.poleId)) {
      if (!parAxe.has(c.axeId)) {
        const poids = poidsAxe.get(`${pole.poleId}|${c.axeId}`);
        if (poids === undefined) {
          throw new EngineError('MISSING_AXIS_WEIGHT', `Pondération d'axe absente (pôle ${pole.poleCode}, axe ${c.axeCode})`);
        }
        parAxe.set(c.axeId, { axeId: c.axeId, code: c.axeCode, poids, criteres: [] });
      }
      parAxe.get(c.axeId).criteres.push({
        critereId: c.critereId,
        intitule: c.intitule,
        poids: c.poidsCritere,
        sens: c.sens,
        valeurCible: c.valeurCible,
        valeurSaisie: c.saisieValidee && c.valeurRealisee !== null && c.valeurRealisee !== undefined ? c.valeurRealisee : null,
        plancher: c.plancher,
        plafond: c.plafond,
      });
    }
    // ordre stable : résultat identique quel que soit l'ordre des lignes SQL
    const axesTries = [...parAxe.values()].sort((a, b) => String(a.code).localeCompare(String(b.code)));
    axesTries.forEach((a) => a.criteres.sort((x, y) => String(x.intitule).localeCompare(String(y.intitule))));
    return { poleId: pole.poleId, poleCode: pole.poleCode, axes: axesTries };
  });
}

module.exports = { assemblerEntrees };
