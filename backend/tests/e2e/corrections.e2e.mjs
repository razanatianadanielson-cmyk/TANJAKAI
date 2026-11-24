// Scénario « corriger une erreur » (base RÉELLE) : suspensions, cibles, critères. Prérequis : base migrée + seed, API démarrée (DEV_SKIP_2FA=true).
// Usage : npm run test:e2e:corrections
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
const stamp = String(Date.now() % 100000);
let r = await call('cg', 'GET', '/poles'); const famille = r.b.data[0].familleId;
r = await call('cg', 'POST', '/poles', { code: 'COR' + stamp, intitule: 'Pole de test', familleId: famille, dateRattachement: '2027-01-01' });
const pole = r.b.id; check('pôle créé', r.s === 201, r);

// ---- Suspensions
r = await call('cg', 'POST', `/poles/${pole}/suspensions`, { motif: 'Essai', dateDebut: '2026-10-28', dateFin: '2026-11-17' });
check('suspension créée', r.s === 201, r); const susp = r.b.id;
r = await call('resp', 'PATCH', `/poles/${pole}/suspensions/${susp}`, { dateFin: '2026-11-01' });
check('un responsable ne corrige pas une suspension', r.s === 403, r);
r = await call('cg', 'PATCH', `/poles/${pole}/suspensions/${susp}`, {});
check('correction vide refusée', r.s === 400, r);
r = await call('cg', 'PATCH', `/poles/${pole}/suspensions/${susp}`, { dateFin: '2026-10-01' });
check('fin avant début refusée', r.s === 400, r);
r = await call('cg', 'PATCH', `/poles/${pole}/suspensions/${susp}`, { dateFin: '2026-11-01', motif: 'Essai corrigé' });
check('suspension raccourcie', r.s === 200 && r.b.dateFin.slice(0, 10) === '2026-11-01' && r.b.motif === 'Essai corrigé', r);
r = await call('cg', 'POST', `/poles/${pole}/suspensions/${susp}/supprimer`, { motif: 'x' });
check('suppression sans vrai motif refusée', r.s === 400, r);
r = await call('cg', 'POST', `/poles/${pole}/suspensions/${susp}/supprimer`, { motif: 'Suspension ajoutée par erreur' });
check('suspension supprimée', r.s === 200 && r.b.supprime === true, r);
r = await call('cg', 'GET', `/poles/${pole}/suspensions`);
check('plus aucune suspension', r.s === 200 && r.b.data.length === 0, r);
r = await call('cg', 'POST', `/poles/${pole}/suspensions/${susp}/supprimer`, { motif: 'Déjà supprimée' });
check('suspension inconnue : 404', r.s === 404, r);

// ---- Cibles
const base0 = { definition: 'Définition de test assez longue', unite: '%', sensOptimisation: 'MAXIMISER', sourceDonnee: 'Test' };
r = await call('cg', 'GET', '/axes'); const axe = (r.b.data || r.b)[0].id;
r = await call('cg', 'POST', '/criteres', { axeId: axe, intitule: 'Critère de base ' + stamp, ...base0 }); const critere = r.b.id;
r = await call('cg', 'PUT', '/cibles', { poleId: pole, critereId: critere, exercice: 2099, valeurCible: 100 });
check('cible créée', r.s === 200, r); const cible = r.b.id;
r = await call('resp', 'PATCH', `/cibles/${cible}`, { valeurCible: 110 });
check('un responsable ne corrige pas une cible', r.s === 403, r);
r = await call('cg', 'PATCH', `/cibles/${cible}`, { valeurCible: 110 });
check('valeur corrigée', r.s === 200 && Number(r.b.valeurCible) === 110, r);
r = await call('dg', 'POST', `/cibles/${cible}/valider`);
check('cible validée', r.s === 200, r);
r = await call('cg', 'PATCH', `/cibles/${cible}`, { valeurCible: 120 });
check('corriger une cible validée (exercice sans campagne) annule la validation', r.s === 200 && !r.b.dateValidation, r);
r = await call('cg', 'POST', `/cibles/${cible}/supprimer`, { motif: 'ab' });
check('suppression de cible sans vrai motif refusée', r.s === 400, r);
r = await call('cg', 'POST', `/cibles/${cible}/supprimer`, { motif: 'Cible saisie par erreur' });
check('cible supprimée', r.s === 200 && r.b.supprime === true, r);
r = await call('cg', 'POST', `/cibles/${cible}/supprimer`, { motif: 'Cible déjà partie' });
check('cible inconnue : 404', r.s === 404, r);

// ---- Critères
const base = { intitule: 'Critère test ' + stamp, definition: 'Définition de test assez longue', unite: '%', sensOptimisation: 'MAXIMISER', sourceDonnee: 'Test' };
r = await call('cg', 'POST', '/criteres', { axeId: axe, ...base });
check('critère créé', r.s === 201, r); const crit = r.b.id;
r = await call('cg', 'PUT', '/cibles', { poleId: pole, critereId: crit, exercice: 2099, valeurCible: 5 });
const c2 = r.b.id; check('cible sur critère non validé', r.s === 200, r);
r = await call('cg', 'POST', `/criteres/${crit}/supprimer`, { motif: 'Critère créé par erreur' });
check('critère utilisé par une cible : refusé', r.s === 409 && /cible/.test(JSON.stringify(r.b)), r);
await call('cg', 'POST', `/cibles/${c2}/supprimer`, { motif: 'Nettoyage du test' });
r = await call('resp', 'POST', `/criteres/${crit}/supprimer`, { motif: 'Critère créé par erreur' });
check('un responsable ne supprime pas un critère', r.s === 403, r);
r = await call('cg', 'POST', `/criteres/${crit}/supprimer`, { motif: 'Critère créé par erreur' });
check('critère jamais utilisé supprimé', r.s === 200 && r.b.supprime === true, r);
r = await call('cg', 'GET', `/criteres/${crit}`);
check('critère disparu', r.s === 404, r);
await call('cg', 'POST', `/criteres/${critere}/valider`);
r = await call('cg', 'POST', `/criteres/${critere}/supprimer`, { motif: 'Critère de base inutile' });
check('critère validé mais jamais utilisé : supprimable', r.s === 200, r);

// ---- Traçabilité
r = await call('cg', 'POST', `/poles/${pole}/supprimer`, { motif: 'Nettoyage du test' });
check('pôle de test nettoyé', r.s === 200, r);
console.log(fails ? `\n${fails} échec(s)` : '\nTout est OK');
process.exit(fails ? 1 : 0);
