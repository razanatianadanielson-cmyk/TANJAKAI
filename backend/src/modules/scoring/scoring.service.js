const db = require('../../config/db');
const repo = require('./scoring.repository');
const campagnesRepo = require('../campagnes/campagnes.repository');
const alertes = require('../alertes/alertes.detection');
const engine = require('./engine');
const { assemblerEntrees } = require('./engine/assembler');
const { toOffset, paginated } = require('../../utils/pagination');
const { HttpError, notFound, conflict } = require('../../utils/httpError');

/** Les erreurs de données du moteur (barème invalide, cible nulle…) deviennent des 422 explicites. */
function enHttpError(err) {
  if (err instanceof engine.EngineError) return new HttpError(422, 'SCORING_ERROR', err.message, { code: err.code });
  return err;
}

/**
 * Calcule le score de chaque pôle du périmètre gelé d'une campagne.
 * `persister` : écrit une nouvelle version de score (copie complète) ; `figer` : verrouille cette version.
 */
async function calculerCampagne(runner, campagne, { persister, figer }) {
  try {
    const donnees = await repo.chargerEntrees(runner, campagne.id, campagne.grilleId);
    const sorties = [];
    for (const entree of assemblerEntrees(donnees)) {
      const resultat = engine.calculerScorePole({ axes: entree.axes });
      let scorePoleId = null;
      let version = null;
      if (persister) {
        version = await repo.prochaineVersion(runner, entree.poleId, campagne.id);
        scorePoleId = await repo.insererScore(runner, {
          poleId: entree.poleId, campagneId: campagne.id, grilleId: campagne.grilleId, version, resultat,
        });
        if (figer) await repo.figer(runner, scorePoleId);
      }
      sorties.push({
        scorePoleId, poleId: entree.poleId, poleCode: entree.poleCode, version,
        scoreConsolide: resultat.scoreConsolide, partiel: resultat.partiel,
        anomalies: resultat.anomalies, ...(persister ? {} : { axes: resultat.axes }),
      });
    }
    return sorties;
  } catch (err) {
    throw enHttpError(err);
  }
}

/** Clôture de campagne : verrouille les saisies, calcule et FIGE les scores — le tout dans une transaction. */
async function cloturerEtNoter(user, campagneId) {
  return db.withTransaction({ userId: user.id, motif: 'Clôture de campagne' }, async (client) => {
    const campagne = await campagnesRepo.verrouiller(client, campagneId);
    if (!campagne) throw notFound('Campagne introuvable');
    if (campagne.statut === 'CLOTUREE') throw conflict('Campagne déjà clôturée');
    await campagnesRepo.cloturer(client, campagneId); // triggers : aucune saisie « soumise » en attente
    const scores = await calculerCampagne(client, campagne, { persister: true, figer: true });
    // alertes de vigilance / direction / dégradation, dans la même transaction que le gel des scores
    const alertesCreees = await alertes.evaluerCampagne(client, campagneId);
    return { campagneId, statut: 'CLOTUREE', scores, alertes: alertesCreees };
  });
}

/** Calcul « à blanc » (rien n'est écrit) : permet au contrôle de gestion de vérifier avant de clôturer. */
async function simuler(campagneId) {
  const campagne = await campagnesRepo.trouver(campagneId);
  if (!campagne) throw notFound('Campagne introuvable');
  return { campagneId, simulation: true, scores: await calculerCampagne(null, campagne, { persister: false, figer: false }) };
}

async function lister(user, query) {
  const { page, limit, campagneId, poleId } = query;
  const responsableId = user.role === 'RESPONSABLE_POLE' ? user.id : undefined; // cloisonnement
  const { rows, total } = await repo.listerScores({ campagneId, poleId, responsableId }, { limit, offset: toOffset(query) });
  return paginated(rows, { page, limit }, total);
}

/** Entrées du moteur reconstruites UNIQUEMENT à partir des copies historisées. */
function entreesDepuisCopies(stored) {
  return {
    axes: stored.axes.map((a) => ({
      axeId: a.axeId, code: a.code, poids: a.poids,
      criteres: a.criteres.map((c) => ({
        critereId: c.critereId, intitule: c.intitule, poids: c.poids, sens: c.sens,
        valeurCible: c.valeurCible, valeurSaisie: c.valeurSaisie, plancher: c.plancher, plafond: c.plafond,
      })),
    })),
  };
}

const memeNombre = (a, b) => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9);

/** Compare le score historisé au recalcul : doit être identique au centième. */
function comparer(stored, recalcul) {
  const ecarts = [];
  if (!memeNombre(stored.scoreConsolide, recalcul.scoreConsolide)) {
    ecarts.push({ niveau: 'score', stocke: stored.scoreConsolide, recalcule: recalcul.scoreConsolide });
  }
  if (stored.partiel !== recalcul.partiel) ecarts.push({ niveau: 'partiel', stocke: stored.partiel, recalcule: recalcul.partiel });
  stored.axes.forEach((a, i) => {
    const r = recalcul.axes[i];
    if (!memeNombre(a.note, r.note)) ecarts.push({ niveau: 'axe', axe: a.code, stocke: a.note, recalcule: r.note });
    a.criteres.forEach((c, j) => {
      if (!memeNombre(c.note, r.criteres[j].note)) {
        ecarts.push({ niveau: 'critere', critere: c.intitule, stocke: c.note, recalcule: r.criteres[j].note });
      }
    });
  });
  return { coherent: ecarts.length === 0, ecarts };
}

async function chargerAutorise(user, id) {
  const stored = await repo.trouverScore(id);
  // 404 (et non 403) : on ne révèle pas l'existence du score d'un autre pôle
  if (!stored || (user.role === 'RESPONSABLE_POLE' && stored.responsableId !== user.id)) throw notFound('Score introuvable');
  return stored;
}

/** Score explicable : décomposition par axe puis par critère, écart à la cible, pondérations effectives. */
async function detail(user, id) {
  const stored = await chargerAutorise(user, id);
  let recalcul;
  try { recalcul = engine.calculerScorePole(entreesDepuisCopies(stored)); } catch (err) { throw enHttpError(err); }
  const { responsableId, ...score } = stored;
  return {
    ...score,
    axes: stored.axes.map((a, i) => ({
      axeId: a.axeId, code: a.code, libelle: a.libelle, note: a.note,
      poidsNominal: a.poids, poidsEffectif: recalcul.axes[i].poidsEffectif,
      criteres: a.criteres.map((c, j) => ({
        critereId: c.critereId, intitule: c.intitule, unite: c.unite, sens: c.sens,
        valeurSaisie: c.valeurSaisie, valeurCible: c.valeurCible,
        ecartCible: c.valeurSaisie === null ? null : engine.arrondi(c.valeurSaisie - c.valeurCible, 4),
        tauxAtteinte: c.tauxAtteinte, plancher: c.plancher, plafond: c.plafond, note: c.note,
        poidsNominal: c.poids, poidsEffectif: recalcul.axes[i].criteres[j].poidsEffectif,
        statut: recalcul.axes[i].criteres[j].statut,
      })),
    })),
    anomalies: recalcul.anomalies,
    verification: comparer(stored, recalcul),
  };
}

/** Recalcule le score à partir des seules données conservées : doit restituer exactement le score d'origine. */
async function verifier(user, id) {
  const stored = await chargerAutorise(user, id);
  try {
    const recalcul = engine.calculerScorePole(entreesDepuisCopies(stored));
    return { scoreId: id, scoreStocke: stored.scoreConsolide, scoreRecalcule: recalcul.scoreConsolide, ...comparer(stored, recalcul) };
  } catch (err) { throw enHttpError(err); }
}

module.exports = { cloturerEtNoter, simuler, lister, detail, verifier, calculerCampagne, comparer, entreesDepuisCopies };
