// Scénario de bout en bout (base RÉELLE) : référentiel -> grille -> cibles -> campagne -> saisies -> clôture -> réouverture.
// Prérequis : base vierge migrée + `npm run seed`, API démarrée (DEV_SKIP_2FA=true, RATE_LIMIT_PER_MIN élevé).
// Usage : API_URL=http://localhost:4000/api/v1 npm run test:e2e
const B = process.env.API_URL || 'http://localhost:4000/api/v1';
let fails = 0;
const tok = {};
async function call(who, method, path, body, headers = {}) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: 'Bearer ' + tok[who] } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status, b: j };
}
function check(name, cond, extra) { if (!cond) { fails++; console.log('FAIL', name, extra ? JSON.stringify(extra).slice(0, 400) : ''); } else console.log('ok  ', name); }
for (const [k, e] of [['cg', 'controle'], ['dir', 'direction'], ['resp', 'responsable'], ['adm', 'admin']]) {
  const r = await call(null, 'POST', '/auth/login', { email: e + '@tanjakai.local', password: 'ChangeMe!2026Tj' });
  tok[k] = r.b.accessToken; if (!tok[k]) { console.log('login KO', k, r); process.exit(1); }
}
// familles
let r = await call('cg', 'POST', '/familles', { libelle: 'Agriculture' }); check('création famille', r.s === 201, r);
const agri = r.b.id;
r = await call('resp', 'POST', '/familles', { libelle: 'X' }); check('responsable ne crée pas de famille (403)', r.s === 403, r);
r = await call('cg', 'POST', '/familles', { libelle: 'Agriculture' }); check('famille en double -> 409', r.s === 409, r);
r = await call('resp', 'GET', '/familles'); check('liste familles', r.s === 200 && r.b.data.length === 2, r);
const bpo = r.b.data.find((f) => f.libelle.startsWith('Externalisation')).id;
r = await call('cg', 'GET', '/axes'); check('3 axes', r.b.data.length === 3, r);
const axe = Object.fromEntries(r.b.data.map((a) => [a.code, a.id]));
// critères
const defs = [['FINANCIER', 'CA budgété', '%', 'MAXIMISER'], ['FINANCIER', 'Maîtrise des charges', '%', 'MINIMISER'], ['HUMAIN', 'Rotation', '%', 'MINIMISER'], ['QUALITE', 'Satisfaction client', '%', 'MAXIMISER']];
r = await call('cg', 'POST', '/criteres', { axeId: axe.FINANCIER, intitule: 'x', definition: 'court', unite: '%', sensOptimisation: 'MAXIMISER', sourceDonnee: 'ERP' });
check('définition trop courte -> 400', r.s === 400, r);
const crit = {};
for (const [a, i, u, s] of defs) {
  r = await call('cg', 'POST', '/criteres', { axeId: axe[a], intitule: i, definition: `Indicateur ${i} mesuré chaque trimestre`, unite: u, sensOptimisation: s, sourceDonnee: 'ERP', valeurMin: 0, valeurMax: 1000 });
  check('création critère ' + i, r.s === 201, r); crit[i] = r.b.id;
}
r = await call('cg', 'PATCH', `/criteres/${crit['CA budgété']}`, { unite: 'M Ar' }); check('modif critère non validé', r.s === 200 && r.b.unite === 'M Ar', r);
r = await call('adm', 'POST', `/criteres/${crit.Rotation}/valider`); check('admin ne valide pas un critère (403)', r.s === 403, r);
// grille avec critère non validé
r = await call('cg', 'POST', '/grilles', {}); check('grille v1 créée', r.s === 201 && r.b.version === 1 && r.b.statut === 'BROUILLON', r);
const g1 = r.b.id;
const pondC = (ids) => ({ ponderations: ids });
r = await call('cg', 'PUT', `/grilles/${g1}/ponderations-criteres`, pondC([{ critereId: crit.Rotation, poids: 100, plancher: 0.5, plafond: 1 }]));
check('critère non validé refusé (422)', r.s === 422 && r.b.error.code === 'CRITERE_NOT_VALIDATED', r);
for (const id of Object.values(crit)) { r = await call('cg', 'POST', `/criteres/${id}/valider`); check('validation critère', r.s === 200 && r.b.valide, r); }
r = await call('cg', 'POST', `/criteres/${crit.Rotation}/valider`); check('revalidation -> 409', r.s === 409, r);
r = await call('cg', 'PATCH', `/criteres/${crit.Rotation}`, { unite: 'x' }); check('critère validé non modifiable -> 409', r.s === 409, r);
// pondérations
r = await call('cg', 'PUT', `/grilles/${g1}/ponderations-axes`, { ponderations: [{ axeId: axe.FINANCIER, poids: 50 }, { axeId: axe.HUMAIN, poids: 30 }, { axeId: axe.QUALITE, poids: 30 }] });
check('axes somme 110 acceptés en brouillon', r.s === 200, r);
r = await call('cg', 'PUT', `/grilles/${g1}/ponderations-criteres`, pondC([
  { critereId: crit['CA budgété'], poids: 60, plancher: 0.5, plafond: 1 }, { critereId: crit['Maîtrise des charges'], poids: 40, plancher: 0.5, plafond: 1 },
  { critereId: crit.Rotation, poids: 100, plancher: 0.5, plafond: 1 }, { critereId: crit['Satisfaction client'], poids: 100, plancher: 0.5, plafond: 1 }]));
check('critères définis', r.s === 200 && r.b.ponderationsCriteres.length === 4, r);
r = await call('cg', 'POST', `/grilles/${g1}/valider`); check('validation refusée : somme axes ≠ 100 (422)', r.s === 422, r); console.log('     ', r.b.error?.message);
r = await call('cg', 'PUT', `/grilles/${g1}/ponderations-axes`, { ponderations: [{ axeId: axe.FINANCIER, poids: 40 }, { axeId: axe.HUMAIN, poids: 30 }, { axeId: axe.QUALITE, poids: 30 }] });
r = await call('cg', 'PUT', `/grilles/${g1}/ponderations-criteres`, pondC([{ critereId: crit['CA budgété'], poids: 50, plancher: 0.5, plafond: 1 }]));
r = await call('cg', 'POST', `/grilles/${g1}/valider`); check('validation refusée : critères ≠ 100 par axe (422)', r.s === 422, r); console.log('     ', r.b.error?.message);
r = await call('cg', 'PUT', `/grilles/${g1}/ponderations-criteres`, pondC([
  { critereId: crit['CA budgété'], poids: 60, plancher: 0.5, plafond: 1 }, { critereId: crit['Maîtrise des charges'], poids: 40, plancher: 0.5, plafond: 1 },
  { critereId: crit.Rotation, poids: 100, plancher: 0.5, plafond: 1 }, { critereId: crit['Satisfaction client'], poids: 100, plancher: 0.5, plafond: 1 }]));
r = await call('dir', 'POST', `/grilles/${g1}/valider`); check('direction ne valide pas la grille (403)', r.s === 403, r);
r = await call('cg', 'POST', `/grilles/${g1}/valider`); check('grille v1 validée', r.s === 200 && r.b.statut === 'VALIDEE', r);
r = await call('cg', 'PUT', `/grilles/${g1}/ponderations-axes`, { ponderations: [{ axeId: axe.FINANCIER, poids: 100 }] }); check('grille figée -> 409', r.s === 409, r);
r = await call('cg', 'POST', '/grilles', {}); check('v2 sans motif -> 422', r.s === 422, r);
r = await call('cg', 'POST', '/grilles', { motif: 'Ajustement des pondérations 2027' }); check('v2 créée par copie', r.s === 201 && r.b.version === 2 && r.b.ponderationsCriteres.length === 4 && r.b.ponderationsAxes.length === 3, r);
const g2 = r.b.id;
r = await call('cg', 'POST', '/grilles', { motif: 'autre' }); check('2e brouillon -> 409', r.s === 409, r);
r = await call('cg', 'DELETE', `/grilles/${g2}`); check('suppression brouillon', r.s === 204, r);
r = await call('cg', 'GET', `/grilles/${g1}`); check('v1 intacte avec barèmes', r.b.ponderationsCriteres.every((p) => p.plancher === 0.5 && p.plafond === 1), r);
// pondération par famille sans motif -> 400
r = await call('cg', 'POST', '/grilles', { motif: 'Pondération agricole' }); const g3 = r.b.id;
r = await call('cg', 'PUT', `/grilles/${g3}/ponderations-axes`, { ponderations: [{ axeId: axe.FINANCIER, familleId: agri, poids: 100 }] }); check('pondération famille sans motif -> 400', r.s === 400, r);
r = await call('cg', 'DELETE', `/grilles/${g3}`);
// cibles
r = await call('cg', 'GET', '/poles'); const pole = r.b.data[0].id;
const cibles = { 'CA budgété': 100, 'Maîtrise des charges': 20, Rotation: 10, 'Satisfaction client': 90 };
const cid = {};
for (const [n, v] of Object.entries(cibles)) { r = await call('cg', 'PUT', '/cibles', { poleId: pole, critereId: crit[n], exercice: 2026, valeurCible: v }); check('cible ' + n, r.s === 200 && r.b.dateValidation === null, r); cid[n] = r.b.id; }
r = await call('resp', 'PUT', '/cibles', { poleId: pole, critereId: crit.Rotation, exercice: 2026, valeurCible: 5 }); check('responsable ne fixe pas de cible (403)', r.s === 403, r);
r = await call('cg', 'POST', '/campagnes', { exercice: 2026, trimestre: 3, grilleId: g1, dateLimite: '2026-12-31' }); check('ouverture refusée : cibles non validées (422)', r.s === 422, r); console.log('     ', r.b.error?.message);
r = await call('cg', 'POST', `/cibles/${cid.Rotation}/valider`); check('CG ne valide pas une cible (403)', r.s === 403, r);
r = await call('dir', 'POST', `/cibles/${cid.Rotation}/valider`); check('direction valide une cible', r.s === 200 && r.b.dateValidation, r);
r = await call('dir', 'POST', '/cibles/valider-lot', { exercice: 2026 }); check('validation par lot (3 restantes)', r.s === 200 && r.b.validees === 3, r);
r = await call('resp', 'GET', '/cibles?exercice=2026'); check('responsable voit les cibles de son pôle', r.s === 200 && r.b.data.length === 4, r);
// campagne
r = await call('resp', 'POST', '/campagnes', { exercice: 2026, trimestre: 3, grilleId: g1, dateLimite: '2026-12-31' }); check('responsable n\'ouvre pas de campagne (403)', r.s === 403, r);
r = await call('cg', 'POST', '/campagnes', { exercice: 2026, trimestre: 3, grilleId: g1, dateLimite: '2020-01-01' }); check('date limite passée -> 422', r.s === 422, r);
r = await call('cg', 'POST', '/campagnes', { exercice: 2026, trimestre: 3, grilleId: g1, dateLimite: '2026-12-31' }); check('campagne ouverte', r.s === 201 && r.b.statut === 'OUVERTE', r);
const camp = r.b.id; console.log('      avertissements:', JSON.stringify(r.b.avertissements));
r = await call('cg', 'POST', '/campagnes', { exercice: 2026, trimestre: 3, grilleId: g1, dateLimite: '2026-12-31' }); check('doublon de campagne -> 409', r.s === 409, r);
r = await call('cg', 'PUT', '/cibles', { poleId: pole, critereId: crit.Rotation, exercice: 2026, valeurCible: 1 }); check('cible figée après ouverture -> 409', r.s === 409, r);
r = await call('cg', 'GET', `/campagnes/${camp}`); check('détail campagne', r.s === 200 && Array.isArray(r.b.reouvertures), r);
// espace de saisie du responsable
r = await call('resp', 'GET', `/campagnes/${camp}/avancement`); check('avancement : 1 pôle, 4 critères', r.s === 200 && r.b.poles.length === 1 && r.b.poles[0].total === 4, r);
r = await call('resp', 'GET', `/campagnes/${camp}/poles/${pole}/saisies`); check('plan de saisie : 4 critères avec cible rappelée', r.s === 200 && r.b.lignes.length === 4 && r.b.lignes.every((l) => l.valeurCible !== null && l.editable && l.saisieId === null), r);
check('aucune valeur préremplie', r.b.lignes.every((l) => l.valeurRealisee === null));
r = await call('cg', 'GET', `/campagnes/${camp}/poles/${pole}/saisies`); check('contrôle de gestion lit le plan (non éditable)', r.s === 200 && r.b.lignes.every((l) => !l.editable), r);
const put = (n, b) => call('resp', 'PUT', `/campagnes/${camp}/poles/${pole}/criteres/${crit[n]}`, b);
r = await put('Rotation', { valeurRealisee: 1500 }); check('valeur hors bornes physiques -> 422', r.s === 422 && r.b.error.code === 'SAISIE_INVALIDE', r);
r = await put('Rotation', { valeurRealisee: 12, motifNonRenseigne: 'x' }); check('valeur ET motif -> 422', r.s === 422, r);
r = await put('Rotation', { valeurRealisee: 12 }); check('brouillon enregistré', r.s === 200 && r.b.completion.renseignes === 1, r);
r = await put('Rotation', { valeurRealisee: 12.5, commentaire: 'Départs en retraite' }); check('brouillon remplacé (pas de doublon)', r.s === 200 && r.b.lignes.find((l) => l.intitule === 'Rotation').valeurRealisee === 12.5, r);
r = await call('resp', 'POST', `/campagnes/${camp}/poles/${pole}/soumettre`); check('soumission incomplète refusée (422) avec détail par critère', r.s === 422 && r.b.error.code === 'SOUMISSION_INCOMPLETE' && r.b.error.details.length === 3, r);
r = await call('cg', 'PUT', `/campagnes/${camp}/poles/${pole}/criteres/${crit.Rotation}`, { valeurRealisee: 1 }); check('le contrôle de gestion ne saisit pas (403)', r.s === 403, r);
r = await put('CA budgété', { valeurRealisee: 90 });
r = await put('Maîtrise des charges', { valeurRealisee: 22 });
r = await put('Satisfaction client', { motifNonRenseigne: 'Enquête non réalisée ce trimestre' }); check('critère non renseigné enregistré avec son motif', r.s === 200, r);
r = await call('resp', 'POST', `/campagnes/${camp}/poles/${pole}/soumettre`); check('soumission en une action', r.s === 200 && r.b.completion.soumis === 4, r);
r = await put('Rotation', { valeurRealisee: 1 }); check('saisie soumise non modifiable (409)', r.s === 409, r);
r = await call('resp', 'POST', `/campagnes/${camp}/poles/${pole}/valider`); check('responsable ne valide pas (403)', r.s === 403, r);
r = await call('cg', 'GET', `/campagnes/${camp}/avancement`); check('avancement : 4 soumises', r.b.poles[0].soumises === 4, r);
const lignes = (await call('cg', 'GET', `/campagnes/${camp}/poles/${pole}/saisies`)).b.lignes;
const sidSat = lignes.find((l) => l.intitule === 'Satisfaction client').saisieId;
r = await call('cg', 'POST', `/saisies/${sidSat}/renvoyer`, {}); check('renvoi sans motif -> 422', r.s === 422, r);
r = await call('cg', 'POST', `/saisies/${sidSat}/renvoyer`, { motif: 'Utiliser l\'enquête de juin' }); check('renvoi motivé', r.s === 200 && r.b.statut === 'RENVOYEE', r);
r = await call('resp', 'GET', `/campagnes/${camp}/poles/${pole}/saisies`); const lsat = r.b.lignes.find((l) => l.intitule === 'Satisfaction client');
check('le responsable voit le motif du renvoi et peut corriger', lsat.dernierRenvoi === 'Utiliser l\'enquête de juin' && lsat.editable && lsat.statut === 'RENVOYEE', lsat);
r = await put('Satisfaction client', { valeurRealisee: 85 }); check('correction après renvoi', r.s === 200, r);
r = await call('resp', 'POST', `/campagnes/${camp}/poles/${pole}/soumettre`); check('re-soumission', r.s === 200, r);
r = await call('cg', 'POST', `/campagnes/${camp}/poles/${pole}/valider`); check('validation des saisies du pôle', r.s === 200 && r.b.validees === 4, r);
r = await call('cg', 'POST', `/campagnes/${camp}/poles/${pole}/valider`); check('rien à valider -> 409', r.s === 409, r);
r = await call('resp', 'GET', `/saisies/${sidSat}/pieces`); check('liste des pièces (sans chemin serveur)', r.s === 200 && r.b.data.every((x) => !('chemin' in x)), r);
r = await call('cg', 'GET', '/campagnes/' + camp + '/avancement'); check('avancement : 4 validées', r.b.poles[0].validees === 4, r);
r = await call('cg', 'POST', `/campagnes/${camp}/rouvrir`, { motif: 'test motif' }); check('réouverture d\'une campagne ouverte -> 409', r.s === 409, r);
r = await call('cg', 'POST', `/campagnes/${camp}/cloturer`); check('clôture + scores', r.s === 200 && r.b.scores.length === 1, r); console.log('      score:', r.b.scores?.[0]?.scoreConsolide, 'partiel:', r.b.scores?.[0]?.partiel);
const scoreId = r.b.scores?.[0]?.scorePoleId;
r = await call('cg', 'POST', `/campagnes/${camp}/rouvrir`, { motif: 'a' }); check('motif trop court -> 400', r.s === 400, r);
r = await call('cg', 'POST', `/campagnes/${camp}/rouvrir`, { motif: 'Correction d\'une valeur de CA' }); check('réouverture motivée', r.s === 200 && r.b.statut === 'ROUVERTE' && r.b.reouvertures.length === 1, r);
r = await call('cg', 'GET', `/scores/${scoreId}/verification`); check('vérification du score historisé', r.s === 200, r);
r = await call('cg', 'POST', `/campagnes/${camp}/cloturer`); check('re-clôture -> nouvelle version de score', r.s === 200 && r.b.scores[0].version === 2, r);
console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT EST OK');
