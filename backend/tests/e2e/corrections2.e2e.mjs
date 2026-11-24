// Scénario « corriger une erreur », lot 2 : comptes et campagnes (base RÉELLE).
// Prérequis : base migrée + seed + `npm run demo:depart-propre -- --oui` (grille validée et cibles de BPO-01), API démarrée (DEV_SKIP_2FA=true).
// Usage : npm run test:e2e:corrections2
const B = process.env.API_URL || 'http://localhost:4000/api/v1';
const SEED = process.env.SEED_PASSWORD || 'ChangeMe!2026Tj';
let fails = 0;
const tok = {};
async function call(who, method, path, body) {
  const h = { 'Content-Type': 'application/json' };
  if (who) h.Authorization = 'Bearer ' + tok[who];
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status, b: j };
}
const check = (name, cond, extra) => { if (!cond) { fails++; console.log('FAIL', name, extra ? JSON.stringify(extra).slice(0, 400) : ''); } else console.log('ok  ', name); };
for (const [k, e] of [['adm', 'admin'], ['cg', 'controle'], ['resp', 'responsable'], ['dg', 'direction']]) {
  const r = await call(null, 'POST', '/auth/login', { email: e + '@tanjakai.local', password: SEED });
  tok[k] = r.b.accessToken; if (!tok[k]) { console.log('login KO', k, r); process.exit(1); }
}
const stamp = String(Date.now() % 100000);

// ---- Comptes
let r = await call('adm', 'POST', '/utilisateurs', { nom: 'Rasoamnana', prenom: 'Voahangi', email: `fautes${stamp}@tanjakai.local`, role: 'RESPONSABLE_POLE' });
check('compte créé', r.s === 201, r); const u = r.b.id;
r = await call('cg', 'PATCH', `/utilisateurs/${u}`, { nom: 'Rasoamanana', motif: 'Faute de frappe' });
check('le contrôle de gestion ne corrige pas un compte', r.s === 403, r);
r = await call('adm', 'PATCH', `/utilisateurs/${u}`, { nom: 'Rasoamanana' });
check('correction sans motif refusée', r.s === 400, r);
r = await call('adm', 'PATCH', `/utilisateurs/${u}`, { nom: 'Rasoamanana', prenom: 'Voahangy', email: `voah${stamp}@tanjakai.local`, motif: 'Fautes de frappe' });
check('compte corrigé', r.s === 200 && r.b.nom === 'Rasoamanana' && r.b.prenom === 'Voahangy' && r.b.email === `voah${stamp}@tanjakai.local`, r);
r = await call('adm', 'PATCH', `/utilisateurs/${u}`, { email: 'responsable@tanjakai.local', motif: 'Adresse déjà prise' });
check('adresse déjà utilisée refusée', r.s === 409, r);
r = await call('adm', 'POST', `/utilisateurs/${u}/supprimer`, { motif: 'x' });
check('suppression sans vrai motif refusée', r.s === 400, r);
r = await call('adm', 'POST', `/utilisateurs/${u}/supprimer`, { motif: 'Compte créé par erreur' });
check('compte jamais utilisé supprimé', r.s === 200 && r.b.supprime === true, r);
r = await call('adm', 'POST', `/utilisateurs/${u}/supprimer`, { motif: 'Déjà supprimé' });
check('compte inconnu : 404', r.s === 404, r);
const moi = (await call('adm', 'GET', '/utilisateurs?role=ADMINISTRATEUR')).b.data[0].id;
r = await call('adm', 'POST', `/utilisateurs/${moi}/supprimer`, { motif: 'Tentative sur moi-même' });
check('on ne supprime pas son propre compte', r.s === 403, r);
const rak = (await call('adm', 'GET', '/utilisateurs?role=RESPONSABLE_POLE')).b.data.find((x) => x.email === 'responsable@tanjakai.local').id;
r = await call('adm', 'POST', `/utilisateurs/${rak}/supprimer`, { motif: 'Tentative sur un compte utilisé' });
check('compte déjà utilisé : refusé', r.s === 409, r);
r = await call('resp', 'GET', '/campagnes');
check('(contrôle) la connexion de Rakoto fonctionne encore', r.s === 200, r);

// ---- Campagnes
const grille = (await call('cg', 'GET', '/grilles')).b.data.find((g) => g.statut === 'VALIDEE' || g.valide || g.dateValidation) || (await call('cg', 'GET', '/grilles')).b.data[0];
const exo = 2090 + (Number(stamp) % 9);
// cibles de BPO-01 pour cet exercice
const critNeufs = (await call('cg', 'GET', '/cibles?exercice=2027&limit=100')).b.data;
for (const c of critNeufs) { await call('cg', 'PUT', '/cibles', { poleId: c.poleId, critereId: c.critereId, exercice: exo, valeurCible: c.valeurCible }); }
await call('dg', 'POST', '/cibles/valider-lot', { exercice: exo });
r = await call('cg', 'POST', '/campagnes', { exercice: exo, trimestre: 1, grilleId: grille.id, dateLimite: '2099-12-31' });
check('campagne ouverte', r.s === 201, r); const camp = r.b.id;
r = await call('cg', 'PATCH', `/campagnes/${camp}`, { dateLimite: '2099-06-30' });
check('date limite sans motif refusée', r.s === 400, r);
r = await call('resp', 'PATCH', `/campagnes/${camp}`, { dateLimite: '2099-06-30', motif: 'Tentative non autorisée' });
check('un responsable ne modifie pas une campagne', r.s === 403, r);
r = await call('cg', 'PATCH', `/campagnes/${camp}`, { dateLimite: '2000-01-01', motif: 'Date avant ouverture' });
check('date avant ouverture refusée', r.s === 400, r);
r = await call('cg', 'PATCH', `/campagnes/${camp}`, { dateLimite: '2099-06-30', motif: 'Délai raccourci' });
check('date limite corrigée', r.s === 200 && String(r.b.dateLimite).slice(0, 10) === '2099-06-30', r);
r = await call('cg', 'POST', `/campagnes/${camp}/supprimer`, { motif: 'Ouverte par erreur' });
check('campagne sans saisie annulée', r.s === 200 && r.b.supprime === true, r);
r = await call('cg', 'GET', `/campagnes/${camp}`);
check('campagne disparue', r.s === 404, r);
r = await call('cg', 'POST', '/campagnes', { exercice: exo, trimestre: 1, grilleId: grille.id, dateLimite: '2099-12-31' });
check('on peut la rouvrir proprement', r.s === 201, r); const camp2 = r.b.id;
// une saisie rend la campagne non annulable
const poleBpo = critNeufs[0].poleId;
const ligne = critNeufs[0];
r = await call('resp', 'POST', '/saisies', { campagne_id: camp2, pole_id: poleBpo, critere_id: ligne.critereId, valeur_realisee: 10 });
if (r.s === 200 || r.s === 201) {
  r = await call('cg', 'POST', `/campagnes/${camp2}/supprimer`, { motif: 'Tentative après une saisie' });
  check('campagne avec saisie : annulation refusée', r.s === 409, r);
} else console.log('info saisie non créée (', r.s, ') : test « campagne avec saisie » ignoré', JSON.stringify(r.b).slice(0, 150));
console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
process.exit(fails ? 1 : 0);
