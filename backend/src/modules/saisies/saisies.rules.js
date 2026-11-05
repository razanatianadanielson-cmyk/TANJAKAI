'use strict';

const PHASE = Object.freeze({
  BROUILLON: 'brouillon',
  SOUMISSION: 'soumission',
});

const texteRenseigne = (t) =>
  typeof t === 'string' && t.trim() !== '';

const normaliserUnite = (u) =>
  String(u).trim().toLowerCase().replace(/\s+/g, '');

const arrondi1 = (x) =>
  Math.round(x * 10) / 10;

function variationPct(valeur, precedente) {
  if (
    precedente === null ||
    precedente === undefined ||
    precedente === 0
  ) {
    return null;
  }

  return (
    Math.abs(valeur - precedente) /
    Math.abs(precedente)
  ) * 100;
}

function evaluerSaisie(p, phase) {

  const erreurs = [];
  const avertissements = [];
  const { critere } = p;

  const aValeur =
    p.valeur !== null &&
    p.valeur !== undefined;

  const aMotif =
    texteRenseigne(p.motifNonRenseigne);

  if (aValeur && aMotif) {
    erreurs.push({
      code: 'VALEUR_ET_MOTIF',
      message:
        'Renseignez une valeur OU un motif de non-renseignement, pas les deux'
    });
  }

  if (
    p.uniteFournie !== undefined &&
    p.uniteFournie !== null &&
    p.uniteFournie !== '' &&
    normaliserUnite(p.uniteFournie) !==
      normaliserUnite(critere.unite)
  ) {
    erreurs.push({
      code: 'UNITE_INCOHERENTE',
      message:
        `Unité « ${p.uniteFournie} » incohérente : ` +
        `ce critère est exprimé en « ${critere.unite} »`
    });
  }

  let anormale = false;

  if (aValeur) {

    if (
      typeof p.valeur !== 'number' ||
      !Number.isFinite(p.valeur)
    ) {
      erreurs.push({
        code: 'VALEUR_INVALIDE',
        message: 'La valeur doit être un nombre'
      });
    } else {

      const {
        valeurMin,
        valeurMax
      } = critere;

      if (
        (valeurMin !== null &&
          valeurMin !== undefined &&
          p.valeur < valeurMin)
        ||
        (valeurMax !== null &&
          valeurMax !== undefined &&
          p.valeur > valeurMax)
      ) {
        const bornes =
          `${valeurMin ?? '−∞'} à ${valeurMax ?? '+∞'}`;

        erreurs.push({
          code: 'HORS_BORNES',
          message:
            `Valeur ${p.valeur} hors des bornes admises ` +
            `(${bornes} ${critere.unite})`
        });
      }

      const v =
        variationPct(
          p.valeur,
          p.valeurPrecedente
        );

      const seuil =
        critere.variationMaxPct ??
        p.seuilVariationDefaut;

      if (v !== null && v > seuil) {

        anormale = true;

        const message =
          `Variation de ${arrondi1(v)} % par rapport ` +
          `au trimestre précédent (seuil : ${seuil} %)`;

        if (phase === PHASE.SOUMISSION) {

          if (!texteRenseigne(p.commentaire)) {
            erreurs.push({
              code: 'JUSTIFICATION_REQUISE',
              message:
                `${message} : un commentaire d'explication est requis`
            });
          }

        } else {

          avertissements.push({
            code: 'VARIATION_ANORMALE',
            message:
              `${message} : prévoyez un commentaire`
          });
        }
      }
    }
  }

  const justificatifAttendu =
    critere.justificatifRequis &&
    aValeur &&
    (p.nbPieces || 0) === 0 &&
    p.source !== 'API';

  if (justificatifAttendu) {

    if (phase === PHASE.SOUMISSION) {

      erreurs.push({
        code: 'PIECE_MANQUANTE',
        message:
          'Une pièce justificative est requise pour ce critère'
      });

    } else {

      avertissements.push({
        code: 'PIECE_ATTENDUE',
        message:
          'Une pièce justificative sera requise à la soumission'
      });
    }
  }

  if (
    phase === PHASE.SOUMISSION &&
    !aValeur &&
    !aMotif
  ) {
    erreurs.push({
      code: 'INCOMPLET',
      message:
        'Valeur ou motif de non-renseignement obligatoire'
    });
  }

  return {
    erreurs,
    avertissements,
    variationAnormale: anormale
  };
}

function calculerCompletion(lignes) {

  const total = lignes.length;

  const renseignes = lignes.filter(
    (l) =>
      l.statut &&
      (
        l.valeurRealisee !== null &&
        l.valeurRealisee !== undefined
        ||
        texteRenseigne(l.motifNonRenseigne)
      )
  ).length;

  const soumis = lignes.filter(
    (l) =>
      l.statut === 'SOUMISE' ||
      l.statut === 'VALIDEE'
  ).length;

  const valides = lignes.filter(
    (l) => l.statut === 'VALIDEE'
  ).length;

  return {
    total,
    renseignes,
    soumis,
    valides,
    pourcentage:
      total === 0
        ? 0
        : Math.round((renseignes / total) * 100)
  };
}

const EDITABLES = Object.freeze([
  'BROUILLON',
  'RENVOYEE'
]);

const estEditable = (statut) =>
  EDITABLES.includes(statut);

module.exports = {
  PHASE,
  evaluerSaisie,
  calculerCompletion,
  variationPct,
  estEditable,
  texteRenseigne
};
