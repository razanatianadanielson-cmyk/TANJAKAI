// Construction des FAITS CHIFFRÉS d'une synthèse : fonctions pures, sans accès à la base ni au réseau.
// Seules ces données quittent le serveur vers le service d'assistance (4.3) : intitulés de pôle et de critère, notes, écarts,
// évolutions. Jamais de nom de salarié, ni de commentaire de saisie (texte libre pouvant être nominatif).

const arrondi = (n, d = 2) => (n === null || n === undefined || Number.isNaN(Number(n)) ? null : Math.round(Number(n) * 10 ** d) / 10 ** d);
const ecart = (a, b) => (a === null || a === undefined || b === null || b === undefined ? null : arrondi(a - b));

/** Regroupe les lignes à plat (une par critère) en une structure par pôle. */
function regrouper(lignes) {
  const poles = new Map();
  for (const l of lignes) {
    if (!poles.has(l.poleId)) {
      poles.set(l.poleId, { poleId: l.poleId, code: l.code, intitule: l.intitule, famille: l.famille,
        score: l.scoreConsolide, partiel: Boolean(l.partiel), axes: new Map() });
    }
    const p = poles.get(l.poleId);
    if (!p.axes.has(l.axeCode)) p.axes.set(l.axeCode, { code: l.axeCode, libelle: l.axeLibelle, note: l.axeNote, poids: l.axePoids, criteres: [] });
    if (l.critere) {
      p.axes.get(l.axeCode).criteres.push({ intitule: l.critere, unite: l.unite, valeur: l.valeur, cible: l.cible,
        taux: l.taux, note: l.note, poids: l.poids });
    }
  }
  return [...poles.values()].map((p) => ({ ...p, axes: [...p.axes.values()] }));
}

/** Poids effectif d'un critère dans le score consolidé (en % du total), les poids d'un axe étant normalisés. */
function poidsEffectifs(pole) {
  const total = pole.axes.reduce((s, a) => s + (a.poids || 0), 0) || 1;
  const res = [];
  for (const a of pole.axes) {
    const somme = a.criteres.reduce((s, c) => s + (c.poids || 0), 0) || 1;
    for (const c of a.criteres) res.push({ axe: a.code, critere: c, poidsEffectif: ((a.poids || 0) / total) * ((c.poids || 0) / somme) * 100 });
  }
  return res;
}

function faitsPole({ campagne, pole, precedent, seuil }) {
  const prevCrit = new Map();
  const prevAxe = new Map();
  if (precedent) {
    for (const a of precedent.axes) { prevAxe.set(a.code, a.note); for (const c of a.criteres) prevCrit.set(c.intitule, c.note); }
  }
  const effectifs = poidsEffectifs(pole);
  const criteres = effectifs.map(({ axe, critere: c, poidsEffectif }) => {
    const prev = prevCrit.has(c.intitule) ? prevCrit.get(c.intitule) : null;
    return {
      axe, intitule: c.intitule, unite: c.unite, valeur: arrondi(c.valeur, 4), cible: arrondi(c.cible, 4),
      tauxAtteinte: arrondi(c.taux, 4), note: arrondi(c.note), notePrecedente: arrondi(prev),
      evolution: ecart(c.note, prev), poidsEffectif: arrondi(poidsEffectif, 1), renseigne: c.note !== null && c.note !== undefined,
    };
  });
  const avecEvolution = criteres.filter((c) => c.evolution !== null);
  const pertes = criteres.filter((c) => c.renseigne)
    .map((c) => ({ intitule: c.intitule, perte: arrondi((c.poidsEffectif / 100) * (100 - c.note)) }))
    .sort((a, b) => b.perte - a.perte);
  const contributions = criteres.filter((c) => c.renseigne)
    .map((c) => ({ intitule: c.intitule, contribution: arrondi((c.poidsEffectif / 100) * c.note) }))
    .sort((a, b) => b.contribution - a.contribution);
  return {
    type: 'POLE',
    periode: { exercice: campagne.exercice, trimestre: campagne.trimestre, libelle: `T${campagne.trimestre} ${campagne.exercice}` },
    pole: { code: pole.code, intitule: pole.intitule, famille: pole.famille },
    score: { consolide: arrondi(pole.score), precedent: precedent ? arrondi(precedent.score) : null, evolution: precedent ? ecart(pole.score, precedent.score) : null, partiel: pole.partiel },
    axes: pole.axes.map((a) => ({ code: a.code, libelle: a.libelle, note: arrondi(a.note), poids: arrondi(a.poids, 1),
      notePrecedente: prevAxe.has(a.code) ? arrondi(prevAxe.get(a.code)) : null,
      evolution: prevAxe.has(a.code) ? ecart(a.note, prevAxe.get(a.code)) : null })),
    criteres,
    enProgression: avecEvolution.filter((c) => c.evolution >= seuil).map((c) => c.intitule),
    enRecul: avecEvolution.filter((c) => c.evolution <= -seuil).map((c) => c.intitule),
    nonRenseignes: criteres.filter((c) => !c.renseigne).map((c) => c.intitule),
    determinants: { plusPenalisants: pertes.slice(0, 3), plusContributeurs: contributions.slice(0, 3) },
    historiqueDisponible: Boolean(precedent),
  };
}

function faitsComparative({ campagne, poles, precedents, seuil }) {
  const prev = new Map(precedents.map((p) => [p.poleId, p]));
  const lignes = poles.map((p) => {
    const pr = prev.get(p.poleId);
    return {
      code: p.code, intitule: p.intitule, famille: p.famille, score: arrondi(p.score), partiel: p.partiel,
      scorePrecedent: pr ? arrondi(pr.score) : null, evolution: pr ? ecart(p.score, pr.score) : null,
      axes: p.axes.map((a) => ({ code: a.code, note: arrondi(a.note),
        evolution: pr && pr.axes.find((x) => x.code === a.code) ? ecart(a.note, pr.axes.find((x) => x.code === a.code).note) : null })),
    };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((l, i) => ({ rang: i + 1, ...l }));
  const scores = lignes.map((l) => l.score).filter((s) => s !== null);
  return {
    type: 'COMPARATIVE',
    periode: { exercice: campagne.exercice, trimestre: campagne.trimestre, libelle: `T${campagne.trimestre} ${campagne.exercice}` },
    poles: lignes,
    synthese: {
      nombrePoles: lignes.length,
      moyenne: scores.length ? arrondi(scores.reduce((s, x) => s + x, 0) / scores.length) : null,
      min: scores.length ? Math.min(...scores) : null,
      max: scores.length ? Math.max(...scores) : null,
      enProgression: lignes.filter((l) => l.evolution !== null && l.evolution >= seuil).map((l) => l.code),
      enRecul: lignes.filter((l) => l.evolution !== null && l.evolution <= -seuil).map((l) => l.code),
    },
    historiqueDisponible: precedents.length > 0,
  };
}

module.exports = { regrouper, faitsPole, faitsComparative, arrondi };
