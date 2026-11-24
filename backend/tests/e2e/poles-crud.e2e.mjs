// Scénario « modifier / supprimer un pôle » (base RÉELLE) : modification motivée, refus de supprimer un pôle déjà utilisé,
// suppression d'un pôle jamais utilisé. Prérequis : base migrée + `npm run seed`, API démarrée (DEV_SKIP_2FA=true).
// Usage : npm run test:e2e:poles
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
for (const [k, e] of [['cg', 'controle'], ['resp', 'responsable'], ['adm', 'admin']]) {
  const r = await call(null, 'POST', '/auth/login', { email: e + '@tanjakai.local', password: SEED });
  tok[k] = r.b.accessToken; if (!tok[k]) { console.log('login KO', k, r); process.exit(1); }
}
const stamp = String(Date.now() % 100000);
let r = await call('cg', 'GET', '/poles'); const famille = r.b.data[0].familleId;

r = await call('cg', 'POST', '/poles', { code: 'CRUD' + stamp, intitule: 'Pole a modifier', familleId: famille, dateRattachement: '2027-01-01' });
check('création', r.s === 201, r); const id = r.b.id;

r = await call('cg', 'PATCH', `/poles/${id}`, { intitule: 'Pôle modifié', effectif: 12, implantation: 'Toamasina' });
check('modification sans motif refusée', r.s === 400, r);
r = await call('cg', 'PATCH', `/poles/${id}`, { motif: 'Correction de la fiche' });
check('modification vide refusée', r.s === 400, r);
r = await call('resp', 'PATCH', `/poles/${id}`, { intitule: 'X', motif: 'Tentative non autorisée' });
check('un responsable ne modifie pas un pôle', r.s === 403, r);
r = await call('cg', 'PATCH', `/poles/${id}`, { intitule: 'Pôle modifié', effectif: 12, implantation: 'Toamasina', motif: 'Correction de la fiche' });
check('modification acceptée', r.s === 200 && r.b.intitule === 'Pôle modifié' && r.b.effectif === 12 && r.b.implantation === 'Toamasina', r);
r = await call('cg', 'PATCH', `/poles/${id}`, { code: 'CRUDB' + stamp, motif: 'Code mal saisi' });
check('le code change tant que le pôle est vierge', r.s === 200 && r.b.code === 'CRUDB' + stamp, r);
r = await call('cg', 'PATCH', `/poles/${id}`, { familleId: '00000000-0000-0000-0000-000000000000', motif: 'Famille inconnue' });
check('famille inconnue refusée', r.s === 400, r);
r = await call('cg', 'PATCH', `/poles/${id}`, { effectif: null, motif: 'Effectif inconnu' });
check('effectif effaçable', r.s === 200 && r.b.effectif === null, r);

r = await call('adm', 'GET', '/audit?entite=pole&limit=5');
check('la modification est dans le journal d\'audit', r.s === 200 && JSON.stringify(r.b).includes('Modification : Code mal saisi'), r.b);

r = await call('cg', 'POST', `/poles/${id}/supprimer`, {});
check('suppression sans motif refusée', r.s === 400, r);
r = await call('resp', 'POST', `/poles/${id}/supprimer`, { motif: 'Tentative non autorisée' });
check('un responsable ne supprime pas', r.s === 403, r);
r = await call('cg', 'POST', `/poles/${id}/supprimer`, { motif: 'Pôle créé par erreur' });
check('suppression d\'un pôle vierge', r.s === 200 && r.b.supprime === true, r);
r = await call('cg', 'GET', `/poles/${id}`);
check('le pôle n\'existe plus', r.s === 404, r);
r = await call('adm', 'GET', '/audit?entite=pole&limit=5');
check('la suppression est dans le journal d\'audit', r.s === 200 && JSON.stringify(r.b).includes('Suppression : Pôle créé par erreur'), r.b);
r = await call('cg', 'POST', `/poles/${id}/supprimer`, { motif: 'Deuxième tentative' });
check('supprimer deux fois → 404', r.s === 404, r);

// un pôle déjà utilisé (le pôle du seed a une clé de service ou une campagne ?) : on le rend « utilisé » avec une clé de service
r = await call('cg', 'POST', '/poles', { code: 'USE' + stamp, intitule: 'Pole utilise', familleId: famille, dateRattachement: '2027-01-01' });
const id2 = r.b.id;
r = await call('adm', 'POST', '/cles-service', { poleId: id2, libelle: 'Clé de test' });
if (r.s === 201) {
  r = await call('cg', 'POST', `/poles/${id2}/supprimer`, { motif: 'Essai sur pôle utilisé' });
  check('un pôle avec clé de service ne se supprime pas', r.s === 409 && /clé/.test(r.b.error.message), r);
  r = await call('cg', 'PATCH', `/poles/${id2}`, { intitule: 'Pôle utilisé renommé', motif: 'Renommage autorisé' });
  check('mais il peut être renommé', r.s === 200, r);
} else console.log('skip  clé de service indisponible', r.s);

r = await call('cg', 'GET', '/poles'); const seedPole = r.b.data.find((p) => p.code === 'BPO-01');
if (seedPole) {
  r = await call('cg', 'POST', `/poles/${seedPole.id}/supprimer`, { motif: 'Test pôle du seed' });
  check('pôle du seed : suppression refusée ou acceptée proprement (jamais d\'erreur 500)', r.s === 409 || r.s === 200, r);
}
console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT EST CONFORME');
process.exit(fails ? 1 : 0);
