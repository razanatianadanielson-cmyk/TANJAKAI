// Scénario « clés de service et API » (base RÉELLE) : un système client dépose des valeurs par clé de service.
// Prérequis : base migrée + `npm run seed`, API démarrée (DEV_SKIP_2FA=true). Usage : npm run test:e2e:cles
const B = process.env.API_URL || 'http://localhost:4000/api/v1';
const EX = 2029;
let fails = 0;
const tok = {};
async function call(who, method, path, body, headers = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (who) h.Authorization = 'Bearer ' + tok[who];
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status, b: j, h: r.headers };
}
const check = (name, cond, extra) => { if (!cond) { fails++; console.log('FAIL', name, extra ? JSON.stringify(extra).slice(0, 500) : ''); } else console.log('ok  ', name); };
for (const [k, e] of [['cg', 'controle'], ['dir', 'direction'], ['resp', 'responsable'], ['adm', 'admin']]) {
  const r = await call(null, 'POST', '/auth/login', { email: e + '@tanjakai.local', password: process.env.SEED_PASSWORD || 'ChangeMe!2026Tj' });
  tok[k] = r.b.accessToken; if (!tok[k]) { console.log('login KO', k, r); process.exit(1); }
}

// --- documentation publique ---
let r = await call(null, 'GET', '/docs/openapi.json');
check('openapi.json public, version 3', r.s === 200 && r.b.openapi.startsWith('3.') && Object.keys(r.b.paths).length > 40, r.s);
check('spécification : route de saisie par clé de service documentée', !!r.b.paths['/service/saisies']?.post?.parameters.some((p) => p.name === 'Idempotency-Key'));
const sansSlash = await fetch(B + '/docs', { redirect: 'manual' });
check('/docs redirige vers /docs/', sansSlash.status === 301, sansSlash.status);
const page = await fetch(B + '/docs/'); const txt = await page.text();
check('console HTML servie', page.status === 200 && txt.includes('console.js'), page.status);
const js = await fetch(B + '/docs/console.js'); check('console.js servi', js.status === 200 && (await js.text()).includes('Idempotency-Key'));

// --- référentiel minimal (comme le scénario des alertes) ---
r = await call('cg', 'GET', '/axes'); const axe = Object.fromEntries(r.b.data.map((a) => [a.code, a.id]));
const crit = {};
for (const [a, i] of Object.entries({ FINANCIER: 'CA clés', HUMAIN: 'Engagement clés', QUALITE: 'Qualité clés' })) {
  r = await call('cg', 'POST', '/criteres', { axeId: axe[a], intitule: i, definition: `Indicateur ${i} mesuré chaque trimestre`, unite: '%', sensOptimisation: 'MAXIMISER', sourceDonnee: 'ERP', valeurMin: 0, valeurMax: 1000 });
  crit[a] = r.b.id; await call('cg', 'POST', `/criteres/${crit[a]}/valider`);
}
r = await call('cg', 'POST', '/grilles', { motif: 'Grille clés de service' });
if (r.s === 409) { console.log('un brouillon de grille existe déjà'); process.exit(1); }
const g = r.b.id;
await call('cg', 'PUT', `/grilles/${g}/ponderations-axes`, { ponderations: [{ axeId: axe.FINANCIER, poids: 40 }, { axeId: axe.HUMAIN, poids: 30 }, { axeId: axe.QUALITE, poids: 30 }] });
await call('cg', 'PUT', `/grilles/${g}/ponderations-criteres`, { ponderations: Object.values(crit).map((id) => ({ critereId: id, poids: 100, plancher: 0.5, plafond: 1 })) });
r = await call('cg', 'POST', `/grilles/${g}/valider`); check('grille validée', r.s === 200, r);
r = await call('cg', 'GET', '/poles'); const pole = r.b.data[0].id;
r = await call('cg', 'POST', '/poles', { code: 'CLE' + (Date.now() % 100000), intitule: 'Pôle voisin (test clés)', familleId: r.b.data[0].familleId, dateRattachement: '2020-01-01' });
check('second pôle créé', r.s === 201, r); const autrePole = r.b.id;
for (const id of Object.values(crit)) for (const p of [pole, autrePole]) await call('cg', 'PUT', '/cibles', { poleId: p, critereId: id, exercice: EX, valeurCible: 100 });
await call('dir', 'POST', '/cibles/valider-lot', { exercice: EX });
r = await call('cg', 'POST', '/campagnes', { exercice: EX, trimestre: 1, grilleId: g, dateLimite: '2030-12-31' });
check('campagne ouverte', r.s === 201, r); const camp = r.b.id;

// --- gestion des clés (administrateur uniquement) ---
for (const who of ['resp', 'cg', 'dir']) { r = await call(who, 'GET', '/cles-service'); check(`${who} ne gère pas les clés (403)`, r.s === 403, r); }
r = await call(null, 'GET', '/cles-service'); check('sans jeton (401)', r.s === 401, r);
r = await call('adm', 'POST', '/cles-service', { poleId: pole, libelle: 'x' }); check('libellé trop court -> 400', r.s === 400, r);
r = await call('adm', 'POST', '/cles-service', { poleId: '11111111-1111-4111-8111-111111111111', libelle: 'ERP inconnu' }); check('pôle inconnu -> 404', r.s === 404, r);
r = await call('adm', 'POST', '/cles-service', { poleId: pole, libelle: 'ERP production' });
check('clé créée (201) et renvoyée une fois', r.s === 201 && /^tjk_/.test(r.b.cle) && r.b.active && r.b.droits.join() === 'saisie:ecriture', r);
check('réponse non mise en cache', /no-store/.test(r.h.get('cache-control') || ''));
check('aucune empreinte exposée', !('empreinteCle' in r.b) && !('empreinte_cle' in r.b));
const cle = r.b.cle; const cleId = r.b.id;
r = await call('adm', 'GET', '/cles-service?limit=100');
const ligne = r.b.data.find((k) => k.id === cleId);
check('liste : la clé figure sans son secret', ligne && !('cle' in ligne) && ligne.prefixe === cle.slice(0, 8) && JSON.stringify(r.b).indexOf(cle) === -1, ligne);

// --- dépôt par le système client ---
const SK = { 'X-Service-Key': cle };
const corps = { campagne_id: camp, critere_id: crit.FINANCIER, valeur_realisee: 95, commentaire: 'Export ERP' };
r = await call(null, 'POST', '/service/saisies', corps, { 'Idempotency-Key': 'a1' }); check('sans clé -> 401', r.s === 401, r);
r = await call(null, 'POST', '/service/saisies', corps, { 'X-Service-Key': 'tjk_invalide', 'Idempotency-Key': 'a1' }); check('clé inconnue -> 401', r.s === 401, r);
r = await call(null, 'POST', '/service/saisies', corps, SK); check('Idempotency-Key obligatoire -> 400', r.s === 400, r);
r = await call(null, 'POST', '/service/saisies', { ...corps, valeur_realisee: 'abc' }, { ...SK, 'Idempotency-Key': 'a0' }); check('valeur non numérique -> 400', r.s === 400, r);
r = await call(null, 'POST', '/service/saisies', { ...corps, valeur_realisee: 5000 }, { ...SK, 'Idempotency-Key': 'a0' }); check('valeur hors bornes du critère -> 422', r.s === 422, r);
r = await call(null, 'POST', '/service/saisies', { ...corps, pole_id: autrePole }, { ...SK, 'Idempotency-Key': 'a0' }); check('autre pôle -> 403', r.s === 403, r);
r = await call(null, 'POST', '/service/saisies', { ...corps, critere_id: '11111111-1111-4111-8111-111111111111' }, { ...SK, 'Idempotency-Key': 'a0' }); check('critère hors périmètre -> 404', r.s === 404, r);
r = await call(null, 'POST', '/service/saisies', corps, { ...SK, 'Idempotency-Key': 'a1' });
check('dépôt accepté (201, brouillon, source API)', r.s === 201 && r.b.data.statut === 'BROUILLON' && r.b.data.source === 'API' && r.b.data.valeur_realisee === 95 && r.b.idempotent === false, r);
r = await call(null, 'POST', '/service/saisies', { ...corps, valeur_realisee: 12 }, { ...SK, 'Idempotency-Key': 'a1' });
check('renvoi avec la même Idempotency-Key : 200, pas de doublon, valeur inchangée', r.s === 200 && r.b.idempotent === true && r.b.data.valeur_realisee === 95, r);
r = await call(null, 'POST', '/service/saisies', { ...corps, valeur_realisee: 97 }, { ...SK, 'Idempotency-Key': 'a2' });
check('nouvelle correction du brouillon par la même clé : 200', r.s === 200 && r.b.data.valeur_realisee === 97 && r.b.idempotent === false, r);
r = await call(null, 'POST', '/service/saisies', corps, { ...SK, 'Idempotency-Key': 'a1' });
check('renvoi tardif de a1 : 200 et la correction (97) n\'est pas écrasée', r.s === 200 && r.b.idempotent === true && r.b.data.valeur_realisee === 97, r);
r = await call('resp', 'GET', `/campagnes/${camp}/poles/${pole}/saisies`);
const l = r.b.lignes.find((x) => x.critereId === crit.FINANCIER);
check('le responsable voit la valeur déposée par API (brouillon, source API)', r.s === 200 && l.valeurRealisee === 97 && l.source === 'API' && l.statut === 'BROUILLON', l);
// le responsable complète les autres critères puis soumet : le flux normal reprend la main
for (const a of ['HUMAIN', 'QUALITE']) await call('resp', 'PUT', `/campagnes/${camp}/poles/${pole}/criteres/${crit[a]}`, { valeurRealisee: 80 });
r = await call('resp', 'POST', `/campagnes/${camp}/poles/${pole}/soumettre`); check('soumission par le responsable', r.s === 200, r);
r = await call(null, 'POST', '/service/saisies', { ...corps, valeur_realisee: 60 }, { ...SK, 'Idempotency-Key': 'a3' });
check('saisie soumise : l\'API ne peut plus la modifier (409)', r.s === 409, r);
r = await call(null, 'POST', '/service/saisies', corps, { ...SK, 'Idempotency-Key': 'a1' });
check('rejeu ancien (a1) toujours 200 après soumission', r.s === 200 && r.b.idempotent === true, r);

// --- révocation ---
r = await call('adm', 'POST', `/cles-service/${cleId}/revoquer`); check('révocation', r.s === 200 && r.b.active === false && r.b.dateRevocation, r);
r = await call('adm', 'POST', `/cles-service/${cleId}/revoquer`); check('double révocation -> 409', r.s === 409, r);
r = await call(null, 'POST', '/service/saisies', corps, { ...SK, 'Idempotency-Key': 'a9' }); check('clé révoquée -> 401 immédiat', r.s === 401, r);
r = await call('adm', 'GET', '/cles-service?active=false'); check('filtre clés révoquées', r.b.data.some((k) => k.id === cleId) && r.b.data.every((k) => !k.active), r.b);
r = await call('adm', 'GET', '/auth/admin/journal-connexions?limit=1'); check('journal toujours lisible', r.s === 200, r.s);

console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon.'); process.exit(fails ? 1 : 0);
