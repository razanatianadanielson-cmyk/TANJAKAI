'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../src/modules/scoring/engine');
const { entreesReference } = require('../fixtures/reference');

const critere = (over) => ({ critereId: 'c', intitule: 'C', poids: 100, sens: 'MAXIMISER', valeurCible: 100,
  valeurSaisie: 100, plancher: 0.5, plafond: 1, ...over });
const unAxe = (criteres, over = {}) => ({ axeId: 'a', code: 'A', poids: 100, criteres, ...over });

describe('Étape 1 — taux d\'atteinte', () => {
  test('critère à maximiser : valeur / cible', () => {
    assert.equal(E.tauxAtteinte(80, 100, 'MAXIMISER'), 0.8);
  });
  test('critère à minimiser : une valeur inférieure à la cible améliore le taux', () => {
    assert.equal(E.tauxAtteinte(80, 100, 'MINIMISER'), 1.25);
    assert.equal(E.tauxAtteinte(125, 100, 'MINIMISER'), 0.8);
  });
  test('minimiser avec valeur nulle', () => {
    assert.equal(E.tauxAtteinte(0, 5, 'MINIMISER'), Infinity);
    assert.equal(E.tauxAtteinte(0, 0, 'MINIMISER'), 1);     // cible « zéro accident » atteinte
    assert.equal(E.tauxAtteinte(3, 0, 'MINIMISER'), 0);     // cible zéro dépassée
  });
  test('cible invalide et sens inconnu refusés', () => {
    assert.throws(() => E.tauxAtteinte(10, 0, 'MAXIMISER'), { code: 'INVALID_TARGET' });
    assert.throws(() => E.tauxAtteinte(10, -1, 'MINIMISER'), { code: 'INVALID_TARGET' });
    assert.throws(() => E.tauxAtteinte(10, 10, 'AUTRE'), { code: 'INVALID_SENS' });
    assert.throws(() => E.tauxAtteinte(NaN, 10, 'MAXIMISER'), { code: 'INVALID_VALUE' });
  });
});

describe('Étape 1 — barème (plancher / plafond)', () => {
  test('bornes : 0 sous le plancher, 100 au-dessus du plafond', () => {
    assert.equal(E.noteDepuisTaux(0.3, 0.5, 1), 0);
    assert.equal(E.noteDepuisTaux(0.5, 0.5, 1), 0);
    assert.equal(E.noteDepuisTaux(1, 0.5, 1), 100);
    assert.equal(E.noteDepuisTaux(1.4, 0.5, 1), 100);
    assert.equal(E.noteDepuisTaux(Infinity, 0.5, 1), 100);
  });
  test('interpolation linéaire', () => {
    assert.equal(E.noteDepuisTaux(0.75, 0.5, 1), 50);
    assert.equal(E.noteDepuisTaux(0.9, 0.5, 1), 80);
  });
  test('plafond exigeant : atteindre la cible ne donne pas 100', () => {
    assert.equal(E.noteDepuisTaux(1, 0.5, 1.2), 71.43);
  });
  test('arrondi moitié vers le haut au centième', () => {
    assert.equal(E.arrondi(71.425), 71.43);
    assert.equal(E.arrondi(0.005), 0.01);
    assert.equal(E.arrondi(2.675), 2.68); // piège classique des flottants
  });
  test('barème invalide refusé', () => {
    const entree = { axes: [unAxe([critere({ plancher: 1, plafond: 1 })])] };
    assert.throws(() => E.calculerScorePole(entree), { code: 'INVALID_SCALE' });
  });
});

describe('Étape 2 — note d\'un axe', () => {
  test('moyenne pondérée des critères', () => {
    const r = E.calculerScorePole({ axes: [unAxe([
      critere({ critereId: 'x', poids: 60, valeurSaisie: 90 }),   // taux 0,9 -> 80
      critere({ critereId: 'y', poids: 40, valeurSaisie: 75 }),   // taux 0,75 -> 50
    ])] });
    assert.equal(r.axes[0].note, 68);
    assert.equal(r.scoreConsolide, 68);
    assert.equal(r.partiel, false);
  });
  test('critère non renseigné : jamais estimé, pondération redistribuée, score partiel', () => {
    const r = E.calculerScorePole({ axes: [unAxe([
      critere({ critereId: 'x', poids: 50, valeurSaisie: 90 }),   // 80
      critere({ critereId: 'y', poids: 30, valeurSaisie: 75 }),   // 50
      critere({ critereId: 'z', poids: 20, valeurSaisie: null }), // exclu
    ])] });
    const [x, y, z] = r.axes[0].criteres;
    assert.equal(z.statut, 'NON_RENSEIGNE');
    assert.equal(z.note, null);
    assert.equal(z.poidsEffectif, 0);
    assert.equal(x.poidsEffectif, 62.5);
    assert.equal(y.poidsEffectif, 37.5);
    assert.equal(r.axes[0].note, 68.75);   // (50×80 + 30×50) / 80
    assert.equal(r.partiel, true);
    assert.equal(r.anomalies.length, 1);
  });
  test('valeur 0 à saisir est une vraie valeur (pas « non renseigné »)', () => {
    const r = E.calculerScorePole({ axes: [unAxe([critere({ valeurSaisie: 0 })])] });
    assert.equal(r.axes[0].criteres[0].statut, 'NOTE');
    assert.equal(r.axes[0].criteres[0].note, 0);
  });
});

describe('Étape 3 — score consolidé', () => {
  test('axe sans aucune note : exclu et pondération redistribuée sur les autres axes', () => {
    const r = E.calculerScorePole({ axes: [
      unAxe([critere({ valeurSaisie: 90 })], { axeId: 'a1', code: 'A1', poids: 40 }),                // 80
      unAxe([critere({ valeurSaisie: null })], { axeId: 'a2', code: 'A2', poids: 60 }),               // exclu
    ] });
    assert.equal(r.axes[1].note, null);
    assert.equal(r.axes[0].poidsEffectif, 100);
    assert.equal(r.scoreConsolide, 80);
    assert.equal(r.partiel, true);
  });
  test('aucune donnée : score nul et partiel', () => {
    const r = E.calculerScorePole({ axes: [] });
    assert.equal(r.scoreConsolide, null);
    assert.equal(r.partiel, true);
  });
});

describe('Jeu de référence (non-régression)', () => {
  test('score de référence = 76,00 avec les notes attendues', () => {
    const r = E.calculerScorePole(entreesReference());
    assert.equal(r.scoreConsolide, 76);
    assert.equal(r.partiel, false);
    assert.deepEqual(r.axes.map((a) => [a.code, a.note]), [['FINANCIER', 88], ['HUMAIN', 80], ['QUALITE', 56]]);
    const notes = r.axes.flatMap((a) => a.criteres.map((c) => c.note));
    assert.deepEqual(notes, [80, 100, 60, 100, 80, 0]);
  });
  test('variante « marge non renseignée » = 72,80 partiel', () => {
    const r = E.calculerScorePole(entreesReference({ margeRenseignee: false }));
    assert.equal(r.axes[0].note, 80);
    assert.equal(r.scoreConsolide, 72.8);
    assert.equal(r.partiel, true);
  });
  test('déterminisme : mêmes entrées, mêmes sorties', () => {
    assert.deepEqual(E.calculerScorePole(entreesReference()), E.calculerScorePole(entreesReference()));
  });
  test('le score ne dépend pas de l\'ordre des critères ni des axes', () => {
    const e = entreesReference();
    e.axes.reverse();
    e.axes.forEach((a) => a.criteres.reverse());
    assert.equal(E.calculerScorePole(e).scoreConsolide, 76);
  });
  test('recalcul à partir des copies conservées = score d\'origine', () => {
    const origine = E.calculerScorePole(entreesReference());
    // copie « historisée » : on ne garde que ce que stocke score_critere / score_axe
    const copie = { axes: origine.axes.map((a) => ({
      axeId: a.axeId, code: a.code, poids: a.poidsNominal,
      criteres: a.criteres.map((c) => ({ critereId: c.critereId, intitule: c.intitule, poids: c.poidsNominal, sens: c.sens,
        valeurCible: c.valeurCible, valeurSaisie: c.valeurSaisie, plancher: c.plancher, plafond: c.plafond })),
    })) };
    assert.deepEqual(E.calculerScorePole(copie), origine);
  });
});

describe('Validation des entrées', () => {
  test('pondération négative ou non numérique refusée', () => {
    assert.throws(() => E.calculerScorePole({ axes: [unAxe([critere({ poids: -5 })])] }), { code: 'INVALID_WEIGHT' });
    assert.throws(() => E.calculerScorePole({ axes: [unAxe([critere({ poids: '10' })])] }), { code: 'INVALID_WEIGHT' });
  });
  test('entrée absente refusée', () => {
    assert.throws(() => E.calculerScorePole(null), { code: 'INVALID_INPUT' });
  });
  test('pondérations nulles : l\'axe n\'a pas de note (pas de division par zéro)', () => {
    const r = E.calculerScorePole({ axes: [unAxe([critere({ poids: 0 })])] });
    assert.equal(r.axes[0].note, null);
    assert.equal(r.scoreConsolide, null);
  });
});
