'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { assemblerEntrees } = require('../../src/modules/scoring/engine/assembler');
const { calculerScorePole } = require('../../src/modules/scoring/engine');

const poles = [{ poleId: 'p1', poleCode: 'BPO-01' }, { poleId: 'p2', poleCode: 'AGR-01' }];
const ligne = (over) => ({ poleId: 'p1', axeId: 'ax1', axeCode: 'FINANCIER', critereId: 'c1', intitule: 'CA',
  sens: 'MAXIMISER', valeurCible: 100, poidsCritere: 100, plancher: 0.5, plafond: 1,
  valeurRealisee: 90, saisieValidee: true, ...over });

describe('Assemblage des entrées du moteur', () => {
  test('une entrée par pôle du périmètre, même sans critère', () => {
    const r = assemblerEntrees({ poles, criteres: [ligne()], axes: [{ poleId: 'p1', axeId: 'ax1', poids: 100 }] });
    assert.equal(r.length, 2);
    assert.equal(r[1].axes.length, 0);
    assert.equal(calculerScorePole(r[1]).scoreConsolide, null);
  });

  test('seule une saisie VALIDÉE est prise en compte', () => {
    const r = assemblerEntrees({ poles: [poles[0]], criteres: [ligne({ saisieValidee: false })],
      axes: [{ poleId: 'p1', axeId: 'ax1', poids: 100 }] });
    assert.equal(r[0].axes[0].criteres[0].valeurSaisie, null);
  });

  test('valeur réalisée absente (motif de non-renseignement) -> non renseigné', () => {
    const r = assemblerEntrees({ poles: [poles[0]], criteres: [ligne({ valeurRealisee: null })],
      axes: [{ poleId: 'p1', axeId: 'ax1', poids: 100 }] });
    assert.equal(r[0].axes[0].criteres[0].valeurSaisie, null);
  });

  test('pondération d\'axe manquante -> erreur explicite', () => {
    assert.throws(() => assemblerEntrees({ poles: [poles[0]], criteres: [ligne()], axes: [] }), { code: 'MISSING_AXIS_WEIGHT' });
  });

  test('ordre des lignes SQL sans effet sur le résultat', () => {
    const a = ligne({ critereId: 'c1', intitule: 'CA', poidsCritere: 60, valeurRealisee: 90 });
    const b = ligne({ critereId: 'c2', intitule: 'Marge', poidsCritere: 40, valeurRealisee: 75 });
    const axes = [{ poleId: 'p1', axeId: 'ax1', poids: 100 }];
    const s1 = calculerScorePole(assemblerEntrees({ poles: [poles[0]], criteres: [a, b], axes })[0]);
    const s2 = calculerScorePole(assemblerEntrees({ poles: [poles[0]], criteres: [b, a], axes })[0]);
    assert.deepEqual(s1, s2);
    assert.equal(s1.scoreConsolide, 68);
  });
});
