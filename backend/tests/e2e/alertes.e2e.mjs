// Scénario « alertes » (base RÉELLE) : 4 trimestres d'un même pôle, clôturés l'un après l'autre.
//   T1 = 80 (score 60) -> rien · T2 = 72,5 (score 45) -> vigilance · T3 = 65 (score 30) -> vigilance + direction (2 trimestres de suite)
//   T4 = 55 (score 10) -> vigilance + direction + dégradation (chute de 20 points ; les chutes de 15 points de T2 et T3 sont tolérées)
// Prérequis : base vierge migrée + `npm run seed`, API démarrée (DEV_SKIP_2FA=true). Usage : npm run test:e2e:alertes
const B = process.env.API_URL || 'http://localhost:4000/api/v1';
const EX = 2027;
let fails = 0;
const tok = {};
async function call(who, method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: 'Bearer ' + tok[who] } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status, b: j };
}
function check(name, cond, extra) { if (!cond) { fails++; console.log('FAIL', name, extra ? JSON.stringify(extra).slice(0, 500) : ''); } else console.log('ok  ', name); }
for (const [k, e] of [['cg', 'controle'], ['dir', 'direction'], ['resp', 'responsable'], ['adm', 'admin']]) {
  const r = await call(null, 'POST', '/auth/login', { email: e + '@tanjakai.local', password: process.env.SEED_PASSWORD || 'ChangeMe!2026Tj' });
  tok[k] = r.b.accessToken; if (!tok[k]) { console.log('login KO', k, r); process.exit(1); }
}
// --- référentiel minimal : 1 critère par axe, grille validée, cibles validées ---
let r = await call('cg', 'GET', '/axes'); const axe = Object.fromEntries(r.b.data.map((a) => [a.code, a.id]));
const defs = { FINANCIER: 'Chiffre d\'affaires alertes', HUMAIN: 'Engagement alertes', QUALITE: 'Qualité alertes' };
const crit = {};
for (const [a, i] of Object.entries(defs)) {
  r = await call('cg', 'POST', '/criteres', { axeId: axe[a], intitule: i, definition: `Indicateur ${i} mesuré chaque trimestre`, unite: '%', sensOptimisation: 'MAXIMISER', sourceDonnee: 'ERP', valeurMin: 0, valeurMax: 1000 });
  check('critère ' + a, r.s === 201, r); crit[a] = r.b.id;
  r = await call('cg', 'POST', `/criteres/${crit[a]}/valider`); check('critère validé', r.s === 200, r);
}
r = await call('cg', 'POST', '/grilles', { motif: 'Grille des alertes' });
if (r.s === 409) { console.log('un brouillon existe déjà : base non vierge'); process.exit(1); }
const g = r.b.id;
await call('cg', 'PUT', `/grilles/${g}/ponderations-axes`, { ponderations: [{ axeId: axe.FINANCIER, poids: 40 }, { axeId: axe.HUMAIN, poids: 30 }, { axeId: axe.QUALITE, poids: 30 }] });
await call('cg', 'PUT', `/grilles/${g}/ponderations-criteres`, { ponderations: Object.values(crit).map((id) => ({ critereId: id, poids: 100, plancher: 0.5, plafond: 1 })) });
r = await call('cg', 'POST', `/grilles/${g}/valider`); check('grille validée', r.s === 200, r);
r = await call('cg', 'GET', '/poles'); const pole = r.b.data[0].id;
for (const id of Object.values(crit)) await call('cg', 'PUT', '/cibles', { poleId: pole, critereId: id, exercice: EX, valeurCible: 100 });
r = await call('dir', 'POST', '/cibles/valider-lot', { exercice: EX }); check('cibles validées', r.s === 200 && r.b.validees === 3, r);

// --- seuils ---
r = await call('cg', 'GET', '/seuils'); check('seuil global par défaut 50 / écart 15', r.s === 200 && r.b.data.some((x) => !x.axeId && x.valeur === 50 && x.ecartDegradation === 15 && x.enVigueur), r);
r = await call('resp', 'GET', '/seuils'); check('responsable ne consulte pas les seuils (403)', r.s === 403, r);
r = await call('resp', 'POST', '/seuils', { valeur: 10, dateEffet: '2030-01-01' }); check('responsable ne fixe pas de seuil (403)', r.s === 403, r);
r = await call('cg', 'POST', '/seuils', { valeur: 150, dateEffet: '2030-01-01' }); check('seuil > 100 -> 400', r.s === 400, r);
r = await call('cg', 'POST', '/seuils', { valeur: 50, dateEffet: '2020-01-01' }); check('seuil en double (même date) -> 409', r.s === 409, r);

// --- trimestres ---
async function trimestre(t, valeur) {
  r = await call('cg', 'POST', '/campagnes', { exercice: EX, trimestre: t, grilleId: g, dateLimite: '2030-12-31' });
  check(`T${t} ouverte`, r.s === 201, r); const camp = r.b.id;
  for (const id of Object.values(crit)) {
    const x = await call('resp', 'PUT', `/campagnes/${camp}/poles/${pole}/criteres/${id}`, { valeurRealisee: valeur });
    if (x.s !== 200) check('saisie', false, x);
  }
  r = await call('resp', 'POST', `/campagnes/${camp}/poles/${pole}/soumettre`); check(`T${t} soumise`, r.s === 200, r);
  r = await call('cg', 'POST', `/campagnes/${camp}/poles/${pole}/valider`); check(`T${t} validée`, r.s === 200, r);
  r = await call('cg', 'POST', `/campagnes/${camp}/cloturer`); check(`T${t} clôturée`, r.s === 200, r);
  console.log(`      T${t} score ${r.b.scores?.[0]?.scoreConsolide} · alertes : ${(r.b.alertes || []).map((a) => a.type).join(', ') || 'aucune'}`);
  return { camp, score: r.b.scores?.[0]?.scoreConsolide, types: (r.b.alertes || []).map((a) => a.type).sort() };
}
const t1 = await trimestre(1, 80); check('T1 : score 60, aucune alerte', t1.score === 60 && t1.types.length === 0, t1);
const t2 = await trimestre(2, 72.5);  check('T2 : score 45, vigilance seule', t2.score === 45 && t2.types.join() === 'VIGILANCE', t2);
r = await call('dir', 'GET', '/alertes?actives=true'); check('direction : pas encore d\'alerte de direction', r.s === 200 && r.b.data.every((a) => a.type !== 'DIRECTION'), r);
const t3 = await trimestre(3, 65);  check('T3 : score 30, vigilance + direction (2 trimestres consécutifs)', t3.score === 30 && t3.types.join() === 'DIRECTION,VIGILANCE', t3);
const t4 = await trimestre(4, 55);  check('T4 : score 10, vigilance + direction + dégradation (−20)', t4.score === 10 && t4.types.join() === 'DEGRADATION,DIRECTION,VIGILANCE', t4);

// --- lecture et droits ---
r = await call('dir', 'GET', '/alertes?actives=true&limit=50'); check('direction voit 6 alertes actives', r.s === 200 && r.b.pagination.total === 6, r.b.pagination);
r = await call('resp', 'GET', '/alertes?type=DIRECTION'); check('responsable voit les alertes de son pôle', r.s === 200 && r.b.pagination.total === 2, r.b.pagination);
r = await call('dir', 'GET', `/alertes?type=DEGRADATION`); const deg = r.b.data[0];
check('dégradation : message et contexte', deg && deg.message.includes('Dégradation rapide') && deg.trimestre === 4 && deg.scoreConsolide === 10 && deg.seuil === 50, deg);
r = await call('dir', 'GET', '/alertes?type=VIGILANCE&exercice=' + EX + '&trimestre=2'); const vig = r.b.data[0]; check('filtre exercice/trimestre', r.b.data.length === 1 && vig.trimestre === 2, r.b);
// notifications
r = await call('dir', 'GET', '/notifications?limit=50'); check('direction notifiée (alertes de direction)', r.b.data.length === 2 && r.b.data.every((n) => n.alerteId), r.b);
r = await call('resp', 'GET', '/notifications?limit=50'); check('responsable notifié de chaque alerte', r.b.data.filter((n) => n.alerteId).length === 6, r.b.data.length);

// --- accusé + plan d'action ---
r = await call('cg', 'POST', `/alertes/${vig.id}/accuser`, { plans: [{ description: 'Plan de redressement', echeance: '2030-01-01' }] }); check('contrôle de gestion n\'accuse pas (403)', r.s === 403, r);
r = await call('resp', 'POST', `/alertes/${vig.id}/accuser`, { plans: [] }); check('accusé sans plan -> 400', r.s === 400, r);
r = await call('resp', 'POST', `/alertes/${vig.id}/accuser`, { plans: [{ description: 'Plan de redressement', echeance: '2020-01-01' }] }); check('échéance passée -> 400', r.s === 400, r);
r = await call('cg', 'POST', `/alertes/${vig.id}/cloturer`); check('clôture avant accusé -> 409', r.s === 409, r);
r = await call('resp', 'POST', `/alertes/${vig.id}/plans`, { description: 'x action', echeance: '2030-01-01' }); check('plan avant accusé -> 409', r.s === 409, r);
r = await call('resp', 'POST', `/alertes/${vig.id}/accuser`, { plans: [{ description: 'Renégocier les contrats clients', echeance: '2030-03-31' }, { description: 'Recruter un commercial', echeance: '2030-06-30' }] });
check('accusé avec 2 actions datées', r.s === 200 && r.b.statut === 'ACCUSEE' && r.b.plans.length === 2 && r.b.accusePar, r);
r = await call('resp', 'POST', `/alertes/${vig.id}/accuser`, { plans: [{ description: 'Encore', echeance: '2030-01-01' }] }); check('double accusé -> 409', r.s === 409, r);
const plan = r.b?.plans?.[0];
r = await call('resp', 'GET', `/alertes/${vig.id}`); const p1 = r.b.plans[0]; check('détail avec plans', r.s === 200 && r.b.plans.length === 2 && r.b.nbPlansOuverts === 2, r.b);
r = await call('resp', 'PATCH', `/alertes/${vig.id}/plans/${p1.id}`, { statut: 'TERMINE' }); check('action terminée', r.s === 200 && r.b.plans.find((x) => x.id === p1.id).statut === 'TERMINE' && r.b.nbPlansOuverts === 1, r.b);
r = await call('resp', 'POST', `/alertes/${vig.id}/plans`, { description: 'Revue mensuelle', echeance: '2030-02-01' }); check('action ajoutée', r.s === 201 && r.b.plans.length === 3, r);
r = await call('cg', 'GET', '/notifications?limit=50'); check('contrôle de gestion notifié de l\'accusé', r.b.data.some((n) => n.message.includes('prise en compte')), r.b.data.map((n) => n.message));
r = await call('dir', 'POST', `/alertes/${vig.id}/cloturer`); check('direction ne clôture pas (403)', r.s === 403, r);
r = await call('cg', 'POST', `/alertes/${vig.id}/cloturer`); check('clôture par le contrôle de gestion', r.s === 200 && r.b.statut === 'CLOTUREE', r);
r = await call('resp', 'PATCH', `/alertes/${vig.id}/plans/${p1.id}`, { statut: 'A_FAIRE' }); check('plan d\'une alerte clôturée figé -> 409', r.s === 409, r);
r = await call('dir', 'GET', '/alertes?actives=true&limit=50'); check('alerte clôturée sort des actives (5 restantes)', r.b.pagination.total === 5, r.b.pagination);
r = await call('dir', 'GET', '/alertes?statut=CLOTUREE'); check('historique conservé', r.b.pagination.total === 1, r.b.pagination);
r = await call('dir', 'POST', `/alertes/${deg.id}/accuser`, { plans: [{ description: 'Plan', echeance: '2030-01-01' }] }); check('direction n\'accuse pas (403)', r.s === 403, r);

// --- nouveau seuil : l'historique est conservé ---
r = await call('cg', 'POST', '/seuils', { valeur: 60, ecartDegradation: 10, dateEffet: '2031-01-01' }); check('nouveau seuil futur créé', r.s === 201, r);
r = await call('cg', 'GET', '/seuils'); check('2 seuils : ancien en vigueur, nouveau à venir', r.b.data.length === 2 && r.b.data.filter((x) => x.enVigueur).length === 1 && r.b.data.find((x) => x.enVigueur).valeur === 50, r.b);
console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT EST OK');
process.exit(fails ? 1 : 0);
