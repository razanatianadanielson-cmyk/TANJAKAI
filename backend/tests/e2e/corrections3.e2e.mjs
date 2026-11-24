// Scénario « corriger une erreur », lot 3 : saisies des résultats (base RÉELLE).
// Prérequis : base migrée + seed + `npm run demo:depart-propre -- --oui`, API démarrée (DEV_SKIP_2FA=true).
// Usage : npm run test:e2e:corrections3
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
for (const [k, e] of [['cg', 'controle'], ['resp', 'responsable'], ['dg', 'direction']]) {
  const r = await call(null, 'POST', '/auth/login', { email: e + '@tanjakai.local', password: SEED });
  tok[k] = r.b.accessToken; if (!tok[k]) { console.log('login KO', k, r); process.exit(1); }
}
const grille = (await call('cg', 'GET', '/grilles')).b.data[0];
const exo = 2080 + (Date.now() % 9);
const cibles = (await call('cg', 'GET', '/cibles?exercice=2027&limit=100')).b.data;
for (const c of cibles) await call('cg', 'PUT', '/cibles', { poleId: c.poleId, critereId: c.critereId, exercice: exo, valeurCible: c.valeurCible });
await call('dg', 'POST', '/cibles/valider-lot', { exercice: exo });
let r = await call('cg', 'POST', '/campagnes', { exercice: exo, trimestre: 2, grilleId: grille.id, dateLimite: '2099-12-31' });
check('campagne ouverte', r.s === 201, r); const camp = r.b.id;
const pole = cibles[0].poleId;
const base = `/campagnes/${camp}/poles/${pole}`;
const val = (c, v) => call('resp', 'PUT', `${base}/criteres/${c.critereId}`, { valeurRealisee: v });

for (const c of cibles) { r = await val(c, 10); if (r.s !== 200) break; }
check('6 valeurs saisies', r.s === 200, r);
r = await call('resp', 'POST', `${base}/soumettre`);
check('soumission', r.s === 200, r);
r = await val(cibles[0], 11);
check('saisie soumise : modification refusée', r.s === 409, r);
r = await call('resp', 'POST', `${base}/reprendre`, { motif: 'x' });
check('reprise sans vrai motif refusée', r.s === 400, r);
r = await call('cg', 'POST', `${base}/reprendre`, { motif: 'Tentative du contrôle de gestion' });
check('seul le responsable reprend ses saisies', r.s === 403, r);
r = await call('resp', 'POST', `${base}/reprendre`, { motif: 'Erreur de frappe sur une valeur' });
check('reprise des saisies soumises', r.s === 200, r);
r = await val(cibles[0], 11);
check('valeur corrigée après reprise', r.s === 200, r);
r = await call('resp', 'DELETE', `${base}/criteres/${cibles[1].critereId}`);
check('saisie effacée', r.s === 200, r);
r = await call('resp', 'POST', `${base}/soumettre`);
check('soumission incomplète refusée (une ligne effacée)', r.s === 422, r);
r = await val(cibles[1], 12);
r = await call('resp', 'POST', `${base}/soumettre`);
check('nouvelle soumission', r.s === 200, r);
r = await call('resp', 'DELETE', `${base}/criteres/${cibles[2].critereId}`);
check('effacer une saisie soumise refusé', r.s === 409, r);
r = await call('cg', 'POST', `${base}/valider`);
check('validation par le contrôle de gestion', r.s === 200, r);
r = await call('resp', 'POST', `${base}/reprendre`, { motif: 'Tentative après validation' });
check('reprise après validation refusée', r.s === 409, r);
const lignes = (await call('cg', 'GET', `${base}/saisies`)).b;
const l = (lignes.lignes || lignes.data || lignes.criteres || [])[0];
const sid = l && (l.saisieId || l.id);
if (sid) {
  r = await call('cg', 'POST', `/saisies/${sid}/renvoyer`, { motif: 'Valeur à revérifier' });
  check('le contrôle de gestion renvoie une saisie validée', r.s === 200 && r.b.statut === 'RENVOYEE', r);
  r = await val({ critereId: l.critereId }, 13);
  check('le responsable corrige la saisie renvoyée', r.s === 200, r);
} else console.log('info : identifiant de saisie introuvable', JSON.stringify(lignes).slice(0, 200));
await call('cg', 'POST', `/campagnes/${camp}/cloturer`);
r = await call('resp', 'POST', `${base}/reprendre`, { motif: 'Tentative après clôture' });
check('campagne clôturée : reprise refusée', r.s === 409, r);
console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
process.exit(fails ? 1 : 0);
