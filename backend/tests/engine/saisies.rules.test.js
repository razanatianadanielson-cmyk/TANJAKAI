'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const R =
  require('../../src/modules/saisies/saisies.rules');

const critere = {
  unite: '%',
  valeurMin: 0,
  valeurMax: 100,
  variationMaxPct: null,
  justificatifRequis: false
};

const base = (over = {}) => ({
  critere,
  valeur: 50,
  motifNonRenseigne: null,
  commentaire: null,
  valeurPrecedente: null,
  nbPieces: 0,
  seuilVariationDefaut: 50,
  ...over
});

const codes = (r) =>
  r.erreurs.map((e) => e.code);

describe('Contrôles à la saisie', () => {

  test('saisie correcte : aucune erreur', () => {
    const r =
      R.evaluerSaisie(
        base(),
        'soumission'
      );

    assert.deepEqual(r.erreurs, []);
    assert.deepEqual(r.avertissements, []);
  });

  test('valeur hors bornes physiques', () => {

    assert.deepEqual(
      codes(
        R.evaluerSaisie(
          base({ valeur: 120 }),
          'brouillon'
        )
      ),
      ['HORS_BORNES']
    );

    assert.deepEqual(
      codes(
        R.evaluerSaisie(
          base({ valeur: -1 }),
          'brouillon'
        )
      ),
      ['HORS_BORNES']
    );
  });

  test('critère sans bornes', () => {

    const c = {
      ...critere,
      valeurMin: null,
      valeurMax: null
    };

    assert.deepEqual(
      R.evaluerSaisie(
        base({
          critere: c,
          valeur: 99999
        }),
        'brouillon'
      ).erreurs,
      []
    );
  });

  test('unité incohérente', () => {

    assert.deepEqual(
      codes(
        R.evaluerSaisie(
          base({ uniteFournie: 'MGA' }),
          'brouillon'
        )
      ),
      ['UNITE_INCOHERENTE']
    );

    assert.deepEqual(
      R.evaluerSaisie(
        base({ uniteFournie: ' % ' }),
        'brouillon'
      ).erreurs,
      []
    );
  });

  test('valeur non numérique', () => {

    assert.deepEqual(
      codes(
        R.evaluerSaisie(
          base({ valeur: NaN }),
          'brouillon'
        )
      ),
      ['VALEUR_INVALIDE']
    );

    assert.deepEqual(
      codes(
        R.evaluerSaisie(
          base({ valeur: '12' }),
          'brouillon'
        )
      ),
      ['VALEUR_INVALIDE']
    );
  });

  test('valeur et motif', () => {

    assert.deepEqual(
      codes(
        R.evaluerSaisie(
          base({
            motifNonRenseigne: 'Pas de données'
          }),
          'brouillon'
        )
      ),
      ['VALEUR_ET_MOTIF']
    );
  });

  test('motif de non-renseignement', () => {

    const r =
      R.evaluerSaisie(
        base({
          valeur: null,
          motifNonRenseigne:
            'Système indisponible'
        }),
        'soumission'
      );

    assert.deepEqual(r.erreurs, []);
  });

  test('soumission sans valeur ni motif', () => {

    assert.deepEqual(
      codes(
        R.evaluerSaisie(
          base({ valeur: null }),
          'soumission'
        )
      ),
      ['INCOMPLET']
    );

    assert.deepEqual(
      R.evaluerSaisie(
        base({ valeur: null }),
        'brouillon'
      ).erreurs,
      []
    );
  });
});

describe('Variation', () => {

  test('variation anormale', () => {

    const p =
      base({
        valeur: 80,
        valeurPrecedente: 40
      });

    const brouillon =
      R.evaluerSaisie(
        p,
        'brouillon'
      );

    assert.deepEqual(
      brouillon.erreurs,
      []
    );

    assert.equal(
      brouillon.avertissements[0].code,
      'VARIATION_ANORMALE'
    );

    assert.deepEqual(
      codes(
        R.evaluerSaisie(
          p,
          'soumission'
        )
      ),
      ['JUSTIFICATION_REQUISE']
    );

    assert.deepEqual(
      R.evaluerSaisie(
        {
          ...p,
          commentaire:
            'Nouveau client majeur'
        },
        'soumission'
      ).erreurs,
      []
    );
  });

  test('variation dans le seuil', () => {

    assert.deepEqual(
      R.evaluerSaisie(
        base({
          valeur: 55,
          valeurPrecedente: 50
        }),
        'soumission'
      ).erreurs,
      []
    );
  });

  test('seuil propre au critère', () => {

    const c = {
      ...critere,
      variationMaxPct: 10
    };

    assert.deepEqual(
      codes(
        R.evaluerSaisie(
          base({
            critere: c,
            valeur: 60,
            valeurPrecedente: 50
          }),
          'soumission'
        )
      ),
      ['JUSTIFICATION_REQUISE']
    );
  });

  test('valeur précédente nulle', () => {

    assert.equal(
      R.variationPct(10, 0),
      null
    );

    assert.equal(
      R.variationPct(10, null),
      null
    );

    assert.deepEqual(
      R.evaluerSaisie(
        base({
          valeur: 90,
          valeurPrecedente: 0
        }),
        'soumission'
      ).erreurs,
      []
    );
  });
});

describe('Pièce justificative', () => {

  const c = {
    ...critere,
    justificatifRequis: true
  };

  test('pièce exigée', () => {

    assert.deepEqual(
      codes(
        R.evaluerSaisie(
          base({ critere: c }),
          'soumission'
        )
      ),
      ['PIECE_MANQUANTE']
    );

    assert.equal(
      R.evaluerSaisie(
        base({ critere: c }),
        'brouillon'
      ).avertissements[0].code,
      'PIECE_ATTENDUE'
    );

    assert.deepEqual(
      R.evaluerSaisie(
        base({
          critere: c,
          nbPieces: 1
        }),
        'soumission'
      ).erreurs,
      []
    );
  });

  test('API', () => {

    assert.deepEqual(
      R.evaluerSaisie(
        base({
          critere: c,
          source: 'API'
        }),
        'soumission'
      ).erreurs,
      []
    );
  });

  test('non renseigné', () => {

    assert.deepEqual(
      R.evaluerSaisie(
        base({
          critere: c,
          valeur: null,
          motifNonRenseigne: 'N/A'
        }),
        'soumission'
      ).erreurs,
      []
    );
  });
});

describe('Complétion et statuts', () => {

  test('indicateur de complétion', () => {

    const lignes = [
      {
        statut: 'VALIDEE',
        valeurRealisee: 10,
        motifNonRenseigne: null
      },
      {
        statut: 'SOUMISE',
        valeurRealisee: null,
        motifNonRenseigne: 'N/A'
      },
      {
        statut: 'BROUILLON',
        valeurRealisee: 5,
        motifNonRenseigne: null
      },
      {
        statut: 'BROUILLON',
        valeurRealisee: null,
        motifNonRenseigne: null
      },
      {
        statut: null,
        valeurRealisee: null,
        motifNonRenseigne: null
      }
    ];

    assert.deepEqual(
      R.calculerCompletion(lignes),
      {
        total: 5,
        renseignes: 3,
        soumis: 2,
        valides: 1,
        pourcentage: 60
      }
    );

    assert.deepEqual(
      R.calculerCompletion([]),
      {
        total: 0,
        renseignes: 0,
        soumis: 0,
        valides: 0,
        pourcentage: 0
      }
    );
  });

  test('statuts modifiables', () => {

    assert.equal(
      R.estEditable('BROUILLON'),
      true
    );

    assert.equal(
      R.estEditable('RENVOYEE'),
      true
    );

    assert.equal(
      R.estEditable('SOUMISE'),
      false
    );

    assert.equal(
      R.estEditable('VALIDEE'),
      false
    );
  });
});
