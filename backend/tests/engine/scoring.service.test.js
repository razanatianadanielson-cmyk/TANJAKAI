'use strict';
// Logique d'orchestration du moteur (clôture, gel, cloisonnement, vérification) avec une base simulée.
const { describe, test, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { lignesReference } = require('../fixtures/reference');

const src = (rel) => require.resolve(path.join(__dirname, '..', '..', 'src', rel));
const stub = (rel, exports) => { const id = src(rel); require.cache[id] = { id, filename: id, loaded: true, exports }; };

const appels = [];
const note = (nom) => (...args) => { appels.push(nom); return args; };
const client = { query: async () => ({ rows: [] }) };

const db = { query: async () => ({ rows: [] }), withTransaction: async (ctx, fn) => { db.dernierCtx = ctx; return fn(client); } };
const campagnesRepo = {
  verrouiller: mock.fn(async () => ({ id: 'camp1', statut: 'OUVERTE', grilleId: 'g1', exercice: 2026, trimestre: 3 })),
  cloturer: mock.fn(async () => { appels.push('cloturer'); }),
  trouver: mock.fn(async () => ({ id: 'camp1', statut: 'OUVERTE', grilleId: 'g1' })),
};
const scoringRepo = {
  chargerEntrees: mock.fn(async () => lignesReference('p1')),
  prochaineVersion: mock.fn(async () => 1),
  insererScore: mock.fn(async () => { appels.push('inserer'); return 'score1'; }),
  figer: mock.fn(async () => { appels.push('figer'); }),
  trouverScore: mock.fn(async () => null),
  listerScores: mock.fn(async () => ({ rows: [], total: 0 })),
};
const alertesDetection = { evaluerCampagne: mock.fn(async () => { appels.push('alertes'); return [{ id: 'a1', type: 'VIGILANCE', poleCode: 'BPO-01' }]; }) };
stub('config/db.js', db);
stub('modules/alertes/alertes.detection.js', alertesDetection);
stub('modules/campagnes/campagnes.repository.js', campagnesRepo);
stub('modules/scoring/scoring.repository.js', scoringRepo);

const service = require('../../src/modules/scoring/scoring.service');
const engine = require('../../src/modules/scoring/engine');
const { entreesReference } = require('../fixtures/reference');

const controle = { id: 'u-controle', role: 'CONTROLE_GESTION' };

/** Score « stocké » tel que le relirait le repository (copies historisées). */
function scoreStocke(over = {}) {
  const r = engine.calculerScorePole(entreesReference());
  return {
    id: 's1', poleId: 'p1', campagneId: 'camp1', version: 1, grilleId: 'g1', scoreConsolide: r.scoreConsolide,
    partiel: r.partiel, fige: true, poleCode: 'BPO-01', poleIntitule: 'BPO', responsableId: 'u-resp', exercice: 2026, trimestre: 3,
    axes: r.axes.map((a) => ({
      id: `sa-${a.code}`, axeId: a.axeId, code: a.code, libelle: a.code, note: a.note, poids: a.poidsNominal,
      criteres: a.criteres.map((c) => ({ critereId: c.critereId, intitule: c.intitule, unite: '%', sens: c.sens,
        valeurSaisie: c.valeurSaisie, valeurCible: c.valeurCible, tauxAtteinte: c.tauxAtteinte, note: c.note,
        poids: c.poidsNominal, plancher: c.plancher, plafond: c.plafond })),
    })),
    ...over,
  };
}

beforeEach(() => {
  appels.length = 0;
  [...Object.values(campagnesRepo), ...Object.values(scoringRepo)].forEach((m) => m.mock.resetCalls());
  campagnesRepo.verrouiller.mock.mockImplementation(async () => ({ id: 'camp1', statut: 'OUVERTE', grilleId: 'g1' }));
  scoringRepo.chargerEntrees.mock.mockImplementation(async () => lignesReference('p1'));
});

describe('Clôture de campagne', () => {
  test('clôture -> calcul -> historisation -> gel, dans cet ordre et dans une transaction auditée', async () => {
    const r = await service.cloturerEtNoter(controle, 'camp1');
    assert.deepEqual(appels, ['cloturer', 'inserer', 'figer', 'alertes']); // alertes évaluées sur les scores figés
    assert.equal(r.alertes[0].type, 'VIGILANCE');
    assert.equal(db.dernierCtx.userId, 'u-controle');
    assert.equal(r.statut, 'CLOTUREE');
    assert.equal(r.scores[0].scoreConsolide, 76);
    assert.equal(r.scores[0].version, 1);
    assert.equal(r.scores[0].partiel, false);
    const arg = scoringRepo.insererScore.mock.calls[0].arguments[1];
    assert.equal(arg.resultat.scoreConsolide, 76);
    assert.equal(arg.grilleId, 'g1');
    assert.equal(scoringRepo.figer.mock.calls[0].arguments[1], 'score1');
  });

  test('campagne déjà clôturée -> 409, aucun calcul', async () => {
    campagnesRepo.verrouiller.mock.mockImplementation(async () => ({ id: 'camp1', statut: 'CLOTUREE', grilleId: 'g1' }));
    await assert.rejects(service.cloturerEtNoter(controle, 'camp1'), { status: 409 });
    assert.equal(scoringRepo.insererScore.mock.callCount(), 0);
  });

  test('campagne introuvable -> 404', async () => {
    campagnesRepo.verrouiller.mock.mockImplementation(async () => null);
    await assert.rejects(service.cloturerEtNoter(controle, 'x'), { status: 404 });
  });

  test('donnée invalide dans la grille -> 422 explicite (la transaction est annulée)', async () => {
    const l = lignesReference('p1');
    l.criteres[0].valeurCible = 0; // cible nulle sur un critère à maximiser
    scoringRepo.chargerEntrees.mock.mockImplementation(async () => l);
    await assert.rejects(service.cloturerEtNoter(controle, 'camp1'), { status: 422, code: 'SCORING_ERROR' });
  });

  test('saisie non validée : critère non renseigné, score partiel', async () => {
    const l = lignesReference('p1');
    l.criteres.find((c) => c.critereId === 'c-marge').saisieValidee = false;
    scoringRepo.chargerEntrees.mock.mockImplementation(async () => l);
    const r = await service.cloturerEtNoter(controle, 'camp1');
    assert.equal(r.scores[0].scoreConsolide, 72.8);
    assert.equal(r.scores[0].partiel, true);
  });

  test('simulation : calcule sans rien écrire', async () => {
    const r = await service.simuler('camp1');
    assert.equal(r.simulation, true);
    assert.equal(r.scores[0].scoreConsolide, 76);
    assert.equal(scoringRepo.insererScore.mock.callCount(), 0);
    assert.equal(scoringRepo.figer.mock.callCount(), 0);
  });
});

describe('Restitution et cloisonnement', () => {
  test('un responsable ne voit que ses pôles dans la liste', async () => {
    await service.lister({ id: 'u-resp', role: 'RESPONSABLE_POLE' }, { page: 1, limit: 20 });
    assert.equal(scoringRepo.listerScores.mock.calls[0].arguments[0].responsableId, 'u-resp');
    await service.lister(controle, { page: 1, limit: 20 });
    assert.equal(scoringRepo.listerScores.mock.calls[1].arguments[0].responsableId, undefined);
  });

  test('score d\'un autre pôle -> 404', async () => {
    scoringRepo.trouverScore.mock.mockImplementation(async () => scoreStocke());
    await assert.rejects(service.detail({ id: 'u-autre', role: 'RESPONSABLE_POLE' }, 's1'), { status: 404 });
    await assert.rejects(service.verifier({ id: 'u-autre', role: 'RESPONSABLE_POLE' }, 's1'), { status: 404 });
  });

  test('détail explicable : écart à la cible, pondérations effectives, cohérence', async () => {
    scoringRepo.trouverScore.mock.mockImplementation(async () => scoreStocke());
    const d = await service.detail({ id: 'u-resp', role: 'RESPONSABLE_POLE' }, 's1');
    assert.equal(d.scoreConsolide, 76);
    assert.equal(d.verification.coherent, true);
    assert.equal(d.responsableId, undefined);
    const ca = d.axes[0].criteres.find((c) => c.intitule === 'CA réalisé');
    assert.equal(ca.ecartCible, -100);
    assert.equal(ca.poidsEffectif, 60);
    assert.equal(ca.statut, 'NOTE');
  });

  test('recalcul à partir des copies = score d\'origine', async () => {
    scoringRepo.trouverScore.mock.mockImplementation(async () => scoreStocke());
    const v = await service.verifier(controle, 's1');
    assert.equal(v.coherent, true);
    assert.equal(v.scoreStocke, 76);
    assert.equal(v.scoreRecalcule, 76);
  });

  test('une valeur altérée après coup est détectée', async () => {
    const altere = scoreStocke();
    altere.axes[0].criteres[0].valeurSaisie = 1000; // 900 -> 1000 sans recalcul des notes
    scoringRepo.trouverScore.mock.mockImplementation(async () => altere);
    const v = await service.verifier(controle, 's1');
    assert.equal(v.coherent, false);
    assert.ok(v.ecarts.some((e) => e.niveau === 'critere' && e.critere === 'CA réalisé'));
  });
});
