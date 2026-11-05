// Scénario « export CSV des saisies » (base RÉELLE) : contenu, droits par rôle, protection contre l'injection de formule.
// Prérequis : base migrée + `npm run seed`, API démarrée (DEV_SKIP_2FA=true). Usage : npm run test:e2e:export
const B = process.env.API_URL || 'http://localhost:4000/api/v1';
const SEED = process.env.SEED_PASSWORD || 'ChangeMe!2026Tj';
const EX = 2034;
let fails = 0; const tok = {};
async function call(who, method, path, body) {
  const h = { 'Content-Type': 'application/json' }; if (who) h.Authorization = 'Bearer ' + (tok[who] || who);
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, b: j, h: r.headers, t };
}
const check = (n, c, x) => { if (!c) { fails++; console.log('FAIL', n, x ? JSON.stringify(x).slice(0, 700) : ''); } else console.log('ok  ', n); };
for (const [k, e] of [['cg', 'controle'], ['dir', 'direction'], ['resp', 'responsable'], ['adm', 'admin']]) {
  const r = await call(null, 'POST', '/auth/login', { email: e + '@tanjakai.local', password: SEED }); tok[k] = r.b.accessToken;
  if (!tok[k]) { console.log('login KO', k, r); process.exit(1); }
}
const stamp = Date.now();
const lignesCsv = (t) => t.replace(/^﻿/, '').split('\r\n').filter(Boolean);

// référentiel : 2 critères, 2 pôles (Rakoto et un autre responsable)
let r = await call('cg', 'GET', '/axes'); const axe = Object.fromEntries(r.b.data.map((a) => [a.code, a.id]));
const crit = {};
for (const [a, i] of Object.entries({ FINANCIER: 'CA export', HUMAIN: 'Engagement export' })) {
  r = await call('cg', 'POST', '/criteres', { axeId: axe[a], intitule: i, definition: `Indicateur ${i} mesuré chaque trimestre`, unite: '%', sensOptimisation: 'MAXIMISER', sourceDonnee: 'ERP', valeurMin: 0, valeurMax: 1000 });
  crit[a] = r.b.id; await call('cg', 'POST', `/criteres/${crit[a]}/valider`);
}
r = await call('cg', 'POST', '/grilles', { motif: 'Grille export' }); if (r.s === 409) { console.log('base non neuve'); process.exit(1); }
const g = r.b.id;
await call('cg', 'PUT', `/grilles/${g}/ponderations-axes`, { ponderations: [{ axeId: axe.FINANCIER, poids: 60 }, { axeId: axe.HUMAIN, poids: 40 }] });
await call('cg', 'PUT', `/grilles/${g}/ponderations-criteres`, { ponderations: Object.values(crit).map((id) => ({ critereId: id, poids: 100, plancher: 0.5, plafond: 1 })) });
await call('cg', 'POST', `/grilles/${g}/valider`);
r = await call('cg', 'GET', '/poles'); const pole1 = r.b.data[0].id; const code1 = r.b.data[0].code; const fam = r.b.data[0].familleId;
r = await call('adm', 'POST', '/utilisateurs', { nom: 'Export', prenom: 'Hery', email: `e2e-exp-${stamp}@tanjakai.local`, role: 'RESPONSABLE_POLE' }); const hery = r.b;
r = await call('cg', 'POST', '/poles', { code: 'EXP' + (stamp % 100000), intitule: 'Pôle export', familleId: fam, responsableId: hery.id, dateRattachement: '2020-01-01' }); const pole2 = r.b.id; const code2 = r.b.code;
for (const id of Object.values(crit)) for (const p of [pole1, pole2]) await call('cg', 'PUT', '/cibles', { poleId: p, critereId: id, exercice: EX, valeurCible: 100 });
await call('dir', 'POST', '/cibles/valider-lot', { exercice: EX });
r = await call('cg', 'POST', '/campagnes', { exercice: EX, trimestre: 1, grilleId: g, dateLimite: '2035-12-31' }); check('campagne ouverte', r.s === 201, r); const camp = r.b.id;

// Hery : mot de passe changé puis saisie
let l = await call(null, 'POST', '/auth/login', { email: hery.email, password: hery.motDePasseProvisoire });
const NEW = 'Mot2Passe!Solide' + (stamp % 1000);
await call(l.b.accessToken, 'POST', '/auth/mot-de-passe', { actuel: hery.motDePasseProvisoire, nouveau: NEW });
l = await call(null, 'POST', '/auth/login', { email: hery.email, password: NEW }); tok.hery = l.b.accessToken;

// Rakoto saisit (valeur décimale + commentaire piégé), Hery saisit
const put = (who, p, c, b) => call(who, 'PUT', `/campagnes/${camp}/poles/${p}/criteres/${crit[c]}`, b);
r = await put('resp', pole1, 'FINANCIER', { valeurRealisee: 87.5, commentaire: '=HYPERLINK("http://exemple.test";"cliquez")' }); check('saisie Rakoto 87,5', r.s === 200, r);
r = await put('resp', pole1, 'HUMAIN', { valeurRealisee: 40, commentaire: 'Texte; avec point-virgule et "guillemets"' }); check('saisie Rakoto 40', r.s === 200, r);
r = await put('hery', pole2, 'FINANCIER', { valeurRealisee: 55 }); check('saisie Hery', r.s === 200, r);

// droits et validation de la requête
const url = (q) => `/saisies/export?${q}`;
r = await call(null, 'GET', url(`campagneId=${camp}`)); check('sans jeton (401)', r.s === 401, r);
r = await call('cg', 'GET', '/saisies/export'); check('campagneId obligatoire (400)', r.s === 400, r);
r = await call('cg', 'GET', url('campagneId=pas-un-uuid')); check('identifiant invalide (400)', r.s === 400, r);
r = await call('cg', 'GET', url('campagneId=11111111-1111-4111-8111-111111111111')); check('campagne inconnue (404)', r.s === 404, r);
r = await call('cg', 'GET', url(`campagneId=${camp}&statut=PIRATE`)); check('statut inconnu (400)', r.s === 400, r);

// contenu pour le contrôle de gestion
r = await call('cg', 'GET', url(`campagneId=${camp}`));
check('CSV : type, pièce jointe, BOM, pas de cache', r.s === 200 && /text\/csv/.test(r.h.get('content-type')) && /saisies-2034-T1\.csv/.test(r.h.get('content-disposition')) && /no-store/.test(r.h.get('cache-control')), { h: [...r.h.entries()] });
const octets = new Uint8Array(await (await fetch(B + url(`campagneId=${camp}`), { headers: { Authorization: 'Bearer ' + tok.cg } })).arrayBuffer());
check('BOM UTF-8 en tête (Excel)', octets[0] === 0xEF && octets[1] === 0xBB && octets[2] === 0xBF);
let L = lignesCsv(r.t);
check('en-tête et 3 lignes', L[0].startsWith('Exercice;Trimestre;Code pôle;') && L.length === 4, L);
const ligneCa = L.find((x) => x.includes(code1) && x.includes('CA export'));
check('décimale française et cible', ligneCa && ligneCa.includes(';100;87,5;'), ligneCa);
check('formule neutralisée (préfixe apostrophe)', L.some((x) => x.includes(`'=HYPERLINK`)) && !L.some((x) => /;=HYPERLINK/.test(x)), L);
check('point-virgule et guillemets protégés', L.some((x) => x.includes('"Texte; avec point-virgule et ""guillemets"""')), L);
check('statut et origine en clair', ligneCa.includes(';Brouillon;Espace de saisie;Responsable Rakoto;'), ligneCa);
r = await call('cg', 'GET', url(`campagneId=${camp}&poleId=${pole2}`)); L = lignesCsv(r.t); check('filtre par pôle', L.length === 2 && L[1].includes(code2), L);
r = await call('cg', 'GET', url(`campagneId=${camp}&statut=VALIDEE`)); check('filtre par statut : aucun pour l\'instant', lignesCsv(r.t).length === 1);
r = await call('adm', 'GET', url(`campagneId=${camp}`)); check('administrateur : tout', lignesCsv(r.t).length === 4);

// cloisonnement
r = await call('resp', 'GET', url(`campagneId=${camp}`)); L = lignesCsv(r.t);
check('responsable : seulement son pôle', L.length === 3 && L.slice(1).every((x) => x.includes(code1)) && !r.t.includes(code2), L);
r = await call('resp', 'GET', url(`campagneId=${camp}&poleId=${pole2}`)); check('responsable : le pôle d\'un autre donne un fichier vide', lignesCsv(r.t).length === 1);
r = await call('hery', 'GET', url(`campagneId=${camp}`)); check('Hery : seulement le sien', lignesCsv(r.t).length === 2 && r.t.includes(code2) && !r.t.includes(code1));
r = await call('dir', 'GET', url(`campagneId=${camp}`)); check('direction : aucun brouillon', lignesCsv(r.t).length === 1, r.t);

// soumission puis validation : la direction voit alors les saisies validées
await put('hery', pole2, 'HUMAIN', { valeurRealisee: 60 });
await call('resp', 'POST', `/campagnes/${camp}/poles/${pole1}/soumettre`); await call('hery', 'POST', `/campagnes/${camp}/poles/${pole2}/soumettre`);
r = await call('cg', 'POST', `/campagnes/${camp}/poles/${pole1}/valider`); check('pôle 1 validé', r.s === 200, r);
r = await call('dir', 'GET', url(`campagneId=${camp}`)); L = lignesCsv(r.t);
check('direction : uniquement les saisies validées (pôle 1)', L.length === 3 && L.slice(1).every((x) => x.includes(code1) && x.includes(';Validée;Espace de saisie;')) && L[1].includes('Rabe'), L);
r = await call('cg', 'GET', url(`campagneId=${camp}&statut=SOUMISE`)); check('CG : soumises (pôle 2)', lignesCsv(r.t).length === 3 && r.t.includes(code2) && !r.t.includes(`${code1};`), r.t);

await call('adm', 'POST', `/utilisateurs/${hery.id}/desactiver`, { motif: 'Nettoyage' }).catch(() => {});
console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT EST OK'); process.exit(fails ? 1 : 0);
