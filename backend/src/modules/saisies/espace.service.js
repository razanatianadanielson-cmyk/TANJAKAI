const db = require('../../config/db');
const env = require('../../config/env');
const repo = require('./espace.repository');
const rules = require('./saisies.rules');
const { notFound, conflict, HttpError } = require('../../utils/httpError');

const CAMPAGNE_OUVERTE = ['OUVERTE', 'ROUVERTE'];

const estResponsable = (user) => user.role === 'RESPONSABLE_POLE';

/** Charge campagne + pôle du périmètre ; un responsable n'accède qu'à ses pôles (404, pas 403). */
async function contexte(user, campagneId, poleId, client) {
  const campagne = await repo.campagne(campagneId, client);
  if (!campagne) throw notFound('Campagne introuvable');
  const pole = await repo.pole(campagneId, poleId, client);
  if (!pole || (estResponsable(user) && pole.responsableId !== user.id)) throw notFound('Pôle introuvable dans cette campagne');
  return { campagne, pole };
}

function parametres(ligne, phase) {
  return {
    critere: {
      unite: ligne.unite, valeurMin: ligne.valeurMin, valeurMax: ligne.valeurMax,
      variationMaxPct: ligne.variationMaxPct, justificatifRequis: ligne.justificatifRequis,
    },
    valeur: ligne.valeurRealisee, motifNonRenseigne: ligne.motifNonRenseigne, commentaire: ligne.commentaire,
    valeurPrecedente: ligne.valeurPrecedente, nbPieces: ligne.nbPieces, source: ligne.source,
    seuilVariationDefaut: env.VARIATION_ANORMALE_PCT, phase,
  };
}

/** Espace de saisie : les seuls critères applicables au pôle, avec cible rappelée, contrôles et complétion. */
async function plan(user, campagneId, poleId, client) {
  const { campagne, pole } = await contexte(user, campagneId, poleId, client);
  const lignes = await repo.lignes(campagneId, poleId, campagne.exercice, campagne.trimestre, client);
  const pieces = await repo.pieces(lignes.map((l) => l.saisieId).filter(Boolean), client);
  const detail = lignes.map((l) => {
    const controle = l.saisieId ? rules.evaluerSaisie(parametres(l, rules.PHASE.BROUILLON), rules.PHASE.BROUILLON) : null;
    return {
      ...l,
      editable: CAMPAGNE_OUVERTE.includes(campagne.statut) && (!l.saisieId || rules.estEditable(l.statut)) && estResponsable(user),
      pieces: pieces.filter((p) => p.saisieId === l.saisieId),
      avertissements: controle ? controle.avertissements : [],
      variationAnormale: controle ? controle.variationAnormale : false,
    };
  });
  return {
    campagne, pole: { id: pole.id, code: pole.code, intitule: pole.intitule, famille: pole.famille },
    lignes: detail, completion: rules.calculerCompletion(lignes),
  };
}

/** Enregistrement progressif en brouillon : crée ou remplace la saisie du critère. Aucune valeur n'est préremplie. */
async function enregistrer(user, campagneId, poleId, critereId, body) {
  await db.withTransaction({ userId: user.id }, async (client) => {
    const { campagne } = await contexte(user, campagneId, poleId, client);
    if (!CAMPAGNE_OUVERTE.includes(campagne.statut)) throw conflict('Campagne clôturée : saisie verrouillée');
    const critere = await repo.critereDuPerimetre(client, campagneId, poleId, critereId);
    if (!critere) throw notFound('Critère non applicable à ce pôle pour cette campagne');
    const existante = await repo.trouverSaisie(client, campagneId, poleId, critereId);
    if (existante && !rules.estEditable(existante.statut)) {
      throw conflict(`Saisie ${existante.statut === 'VALIDEE' ? 'validée' : 'soumise'} : modification impossible`);
    }
    const d = {
      campagneId, poleId, critereId,
      valeurRealisee: body.valeurRealisee ?? null,
      commentaire: body.commentaire?.trim() || null,
      motifNonRenseigne: body.motifNonRenseigne?.trim() || null,
    };
    const precedent = (await repo.lignes(campagneId, poleId, campagne.exercice, campagne.trimestre, client))
      .find((l) => l.critereId === critereId);
    const verdict = rules.evaluerSaisie({
      critere, valeur: d.valeurRealisee, motifNonRenseigne: d.motifNonRenseigne, commentaire: d.commentaire,
      valeurPrecedente: precedent ? precedent.valeurPrecedente : null, nbPieces: 0,
      uniteFournie: body.uniteFournie, seuilVariationDefaut: env.VARIATION_ANORMALE_PCT,
    }, rules.PHASE.BROUILLON);
    if (verdict.erreurs.length) {
      throw new HttpError(422, 'SAISIE_INVALIDE', verdict.erreurs.map((e) => e.message).join(' ; '), verdict.erreurs);
    }
    if (existante) await repo.remplacer(client, existante.id, d);
    else await repo.inserer(client, d, user.id);
  });
  return plan(user, campagneId, poleId);
}

/** Soumission en une action : tout ou rien. Chaque critère doit porter une valeur OU un motif. */
async function soumettre(user, campagneId, poleId) {
  await db.withTransaction({ userId: user.id, motif: 'Soumission des indicateurs' }, async (client) => {
    const { campagne, pole } = await contexte(user, campagneId, poleId, client);
    if (!CAMPAGNE_OUVERTE.includes(campagne.statut)) throw conflict('Campagne clôturée : saisie verrouillée');
    const lignes = await repo.lignes(campagneId, poleId, campagne.exercice, campagne.trimestre, client);
    const problemes = [];
    const aSoumettre = [];
    for (const l of lignes) {
      if (l.saisieId && !rules.estEditable(l.statut)) continue; // déjà soumise ou validée
      const verdict = l.saisieId
        ? rules.evaluerSaisie(parametres(l, rules.PHASE.SOUMISSION), rules.PHASE.SOUMISSION)
        : { erreurs: [{ code: 'INCOMPLET', message: 'Valeur ou motif de non-renseignement obligatoire' }] };
      if (verdict.erreurs.length) problemes.push({ critereId: l.critereId, critere: l.intitule, erreurs: verdict.erreurs });
      else aSoumettre.push(l.saisieId);
    }
    if (problemes.length) {
      throw new HttpError(422, 'SOUMISSION_INCOMPLETE',
        `${problemes.length} critère(s) à corriger avant soumission`, problemes);
    }
    if (!aSoumettre.length) throw conflict('Rien à soumettre : toutes les saisies sont déjà soumises');
    await repo.soumettre(client, aSoumettre);
    await repo.notifier(client, campagneId, await repo.destinatairesControle(client),
      `Pôle ${pole.code} : ${aSoumettre.length} indicateur(s) soumis pour contrôle (T${campagne.trimestre} ${campagne.exercice}).`);
  });
  return plan(user, campagneId, poleId);
}

/**
 * Le responsable reprend ses saisies soumises (erreur découverte après « Soumettre ») : elles redeviennent modifiables.
 * Impossible une fois validées (c'est alors le contrôle de gestion qui renvoie) ou la campagne clôturée. Motif tracé.
 */
async function reprendre(user, campagneId, poleId, { motif }) {
  await db.withTransaction({ userId: user.id, motif: `Reprise des saisies : ${motif}` }, async (client) => {
    const { campagne, pole } = await contexte(user, campagneId, poleId, client);
    if (!CAMPAGNE_OUVERTE.includes(campagne.statut)) throw conflict('Campagne clôturée : saisie verrouillée');
    const n = await repo.reprendre(client, campagneId, poleId);
    if (!n) throw conflict('Aucune saisie soumise à reprendre (déjà validées ou jamais soumises)');
    await repo.notifier(client, campagneId, await repo.destinatairesControle(client),
      `Pôle ${pole.code} : ${n} indicateur(s) repris par le responsable pour correction. Motif : ${motif}`);
  });
  return plan(user, campagneId, poleId);
}

/** Efface la saisie d'un critère (brouillon ou renvoyée) : la ligne redevient vide. Pièces jointes incluses. */
async function effacer(user, campagneId, poleId, critereId) {
  await db.withTransaction({ userId: user.id, motif: 'Saisie effacée' }, async (client) => {
    const { campagne } = await contexte(user, campagneId, poleId, client);
    if (!CAMPAGNE_OUVERTE.includes(campagne.statut)) throw conflict('Campagne clôturée : saisie verrouillée');
    const existante = await repo.trouverSaisie(client, campagneId, poleId, critereId);
    if (!existante) throw notFound('Aucune saisie à effacer pour ce critère');
    if (!rules.estEditable(existante.statut)) {
      throw conflict(`Saisie ${existante.statut === 'VALIDEE' ? 'validée' : 'soumise'} : effacement impossible (reprenez-la d'abord)`);
    }
    await repo.effacer(client, existante.id);
  });
  return plan(user, campagneId, poleId);
}

/** Validation de toutes les saisies soumises d'un pôle par le contrôle de gestion (jamais par l'auteur de la saisie). */
async function validerPole(user, campagneId, poleId) {
  const nombre = await db.withTransaction({ userId: user.id, motif: 'Validation des saisies du pôle' }, async (client) => {
    await contexte(user, campagneId, poleId, client);
    const n = await repo.validerPole(client, campagneId, poleId, user.id);
    if (!n) throw conflict('Aucune saisie soumise à valider pour ce pôle');
    return n;
  });
  return { validees: nombre, ...(await plan(user, campagneId, poleId)) };
}

async function avancement(user, campagneId) {
  const campagne = await repo.campagne(campagneId);
  if (!campagne) throw notFound('Campagne introuvable');
  const poles = await repo.avancement(campagneId, estResponsable(user) ? user.id : undefined);
  return { campagne, poles };
}

module.exports = { reprendre, effacer, plan, enregistrer, soumettre, validerPole, avancement };
