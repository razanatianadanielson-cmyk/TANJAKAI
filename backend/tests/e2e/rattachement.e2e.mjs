// Scénario « rattachement et désactivation » (base RÉELLE) : un responsable est rattaché à un pôle, ses brouillons sont transférés,
// un compte est désactivé puis réactivé. Prérequis : base migrée + `npm run seed`, API démarrée (DEV_SKIP_2FA=true).
// Usage : npm run test:e2e:rattachement
const B = process.env.API_URL || 'http://localhost:4000/api/v1';
const SEED = process.env.SEED_PASSWORD || 'ChangeMe!2026Tj';
const EX = 2032;
let fails = 0;
const tok = {};
async function call(who, method, path, body) {
  const h = { 'Content-Type': 'application/json' };
  if (who) h.Authorization = 'Bearer ' + (tok[who] || who);
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status, b: j };
}
const check = (name, cond, extra) => { if (!cond) { fails++; console.log('FAIL', name, extra ? JSON.stringify(extra).slice(0, 500) : ''); } else console.log('ok  ', name); };
for (const [k, e] of [['cg', 'controle'], ['dir', 'direction'], ['resp', 'responsable'], ['adm', 'admin']]) {
  const r = await call(null, 'POST', '/auth/login', { email: e + '@tanjakai.local', password: SEED });
  tok[k] = r.b.accessToken; if (!tok[k]) { console.log('login KO', k, r); process.exit(1); }
}
const stamp = Date.now();

// --- référentiel minimal et campagne ouverte ---
let r = await call('cg', 'GET', '/axes'); const axe = Object.fromEntries(r.b.data.map((a) => [a.code, a.id]));
const crit = {};
for (const [a, i] of Object.entries({ FINANCIER: 'CA rattachement', HUMAIN: 'Engagement rattachement' })) {
  r = await call('cg', 'POST', '/criteres', { axeId: axe[a], intitule: i, definition: `Indicateur ${i} mesuré chaque trimestre`, unite: '%', sensOptimisation: 'MAXIMISER', sourceDonnee: 'ERP', valeurMin: 0, valeurMax: 1000 });
  crit[a] = r.b.id; await call('cg', 'POST', `/criteres/${crit[a]}/valider`);
}
r = await call('cg', 'POST', '/grilles', { motif: 'Grille rattachement' });
if (r.s === 409) { console.log('un brouillon de grille existe déjà : base non neuve'); process.exit(1); }
const g = r.b.id;
await call('cg', 'PUT', `/grilles/${g}/ponderations-axes`, { ponderations: [{ axeId: axe.FINANCIER, poids: 60 }, { axeId: axe.HUMAIN, poids: 40 }] });
await call('cg', 'PUT', `/grilles/${g}/ponderations-criteres`, { ponderations: Object.values(crit).map((id) => ({ critereId: id, poids: 100, plancher: 0.5, plafond: 1 })) });
r = await call('cg', 'POST', `/grilles/${g}/valider`); check('grille validée', r.s === 200, r);
r = await call('cg', 'GET', '/poles'); const pole = r.b.data[0].id; const famille = r.b.data[0].familleId;
check('la liste des pôles donne le nom du responsable', r.b.data[0].responsableNom === 'Responsable Rakoto', r.b.data[0]);

// un pôle créé SANS responsable : invisible pour un responsable
r = await call('cg', 'POST', '/poles', { code: 'RAT' + (stamp % 100000), intitule: 'Pôle sans responsable', familleId: famille, dateRattachement: '2020-01-01' });
check('pôle créé sans responsable', r.s === 201 && r.b.responsableId === null && r.b.responsableNom === null, r); const neuf = r.b.id; const codeNeuf = r.b.code;
r = await call('resp', 'GET', '/poles'); check('le responsable ne voit encore que son pôle', r.b.data.length === 1 && r.b.data[0].id === pole, r.b.data.map((p) => p.code));
r = await call('resp', 'GET', `/poles/${neuf}`); check('et ne peut pas lire le pôle voisin (404)', r.s === 404, r);
for (const id of Object.values(crit)) for (const p of [pole, neuf]) await call('cg', 'PUT', '/cibles', { poleId: p, critereId: id, exercice: EX, valeurCible: 100 });
await call('dir', 'POST', '/cibles/valider-lot', { exercice: EX });
r = await call('cg', 'POST', '/campagnes', { exercice: EX, trimestre: 1, grilleId: g, dateLimite: '2033-12-31' });
check('campagne ouverte', r.s === 201, r); const camp = r.b.id;

// --- comptes jetables ---
const mk = async (n, role = 'RESPONSABLE_POLE') => {
  const x = await call('adm', 'POST', '/utilisateurs', { nom: 'Rattachement', prenom: n, email: `e2e-rat-${n.toLowerCase()}-${stamp}@tanjakai.local`, role });
  check(`compte ${n} créé`, x.s === 201, x); return x.b;
};
const hery = await mk('Hery'); const cg2 = await mk('Cecile', 'CONTROLE_GESTION');

// --- droits et validation ---
const body = (id) => ({ responsableId: id, motif: 'Nouvelle affectation' });
for (const who of ['resp', 'dir']) { r = await call(who, 'PATCH', `/poles/${neuf}/responsable`, body(hery.id)); check(`${who} ne rattache pas (403)`, r.s === 403, r); }
r = await call(null, 'PATCH', `/poles/${neuf}/responsable`, body(hery.id)); check('sans jeton (401)', r.s === 401, r);
r = await call('cg', 'PATCH', `/poles/${neuf}/responsable`, { responsableId: hery.id }); check('motif obligatoire (400)', r.s === 400, r);
r = await call('cg', 'PATCH', `/poles/${neuf}/responsable`, { responsableId: 'pas-un-uuid', motif: 'Nouvelle affectation' }); check('identifiant invalide (400)', r.s === 400, r);
r = await call('cg', 'PATCH', '/poles/11111111-1111-4111-8111-111111111111/responsable', body(hery.id)); check('pôle inconnu (404)', r.s === 404, r);
r = await call('cg', 'PATCH', `/poles/${neuf}/responsable`, body(cg2.id)); check('un compte qui n\'est pas responsable de pôle est refusé (409)', r.s === 409, r);
r = await call('cg', 'PATCH', `/poles/${neuf}/responsable`, body('11111111-1111-4111-8111-111111111111')); check('compte inconnu (409)', r.s === 409, r);
r = await call('cg', 'PATCH', `/poles/${neuf}/responsable`, { responsableId: null, motif: 'Rien à détacher' }); check('détacher un pôle sans responsable (409)', r.s === 409, r);

// --- rattachement ---
r = await call('cg', 'PATCH', `/poles/${neuf}/responsable`, body(hery.id));
check('rattachement par le contrôle de gestion (200) avec le nom', r.s === 200 && r.b.responsableId === hery.id && r.b.responsableNom === 'Hery Rattachement', r);
r = await call('cg', 'PATCH', `/poles/${neuf}/responsable`, body(hery.id)); check('même responsable (409)', r.s === 409, r);
// Hery se connecte (mot de passe provisoire à changer) : on vérifie par le changement de mot de passe
let l = await call(null, 'POST', '/auth/login', { email: hery.email, password: hery.motDePasseProvisoire });
check('Hery se connecte avec son mot de passe provisoire', !!l.b.accessToken && (await call(l.b.accessToken, 'GET', '/auth/me')).b.mdpAChanger === true, l);
const NEW = 'Mot2Passe!Solide' + (stamp % 1000);
r = await call(l.b.accessToken, 'POST', '/auth/mot-de-passe', { actuel: hery.motDePasseProvisoire, nouveau: NEW });
check('mot de passe changé', r.s === 204, r);
l = await call(null, 'POST', '/auth/login', { email: hery.email, password: NEW }); tok.hery = l.b.accessToken;
r = await call('hery', 'GET', '/poles'); check('Hery voit son nouveau pôle, et lui seul', r.b.data.length === 1 && r.b.data[0].id === neuf, r);
r = await call('hery', 'GET', `/campagnes/${camp}/poles/${neuf}/saisies`); check('Hery a son plan de saisie', r.s === 200 && r.b.lignes.length === 2 && r.b.lignes.every((x) => x.editable), r);
r = await call('hery', 'GET', `/campagnes/${camp}/poles/${pole}/saisies`); check('mais pas celui du pôle de Rakoto (404)', r.s === 404 || r.s === 403, r);
r = await call('hery', 'PUT', `/campagnes/${camp}/poles/${neuf}/criteres/${crit.FINANCIER}`, { valeurRealisee: 70 }); check('Hery saisit un brouillon', r.s === 200, r);

// --- changement de responsable : le brouillon suit le pôle ---
r = await call('cg', 'PATCH', `/poles/${neuf}/responsable`, body((await call('resp', 'GET', '/auth/me')).b.id));
check('le pôle passe à Rakoto (200), 1 saisie transférée', r.s === 200 && r.b.responsableNom === 'Responsable Rakoto' && r.b.saisiesTransferees === 1, r);
r = await call('resp', 'GET', `/campagnes/${camp}/poles/${neuf}/saisies`);
const ligne = r.b.lignes.find((x) => x.valeurRealisee === 70);
check('Rakoto retrouve la valeur 70 et peut la modifier', r.s === 200 && ligne && ligne.editable, r);
r = await call('resp', 'PUT', `/campagnes/${camp}/poles/${neuf}/criteres/${crit.FINANCIER}`, { valeurRealisee: 75 }); check('Rakoto modifie le brouillon', r.s === 200, r);
r = await call('hery', 'GET', '/poles'); check('Hery ne voit plus aucun pôle', r.s === 200 && r.b.data.length === 0, r);
r = await call('hery', 'PUT', `/campagnes/${camp}/poles/${neuf}/criteres/${crit.FINANCIER}`, { valeurRealisee: 10 }); check('Hery ne peut plus saisir sur ce pôle', r.s === 403 || r.s === 404, r);
r = await call('resp', 'GET', '/poles'); check('Rakoto voit maintenant ses deux pôles', r.b.data.length === 2, r.b.data.map((p) => p.code));

// --- détacher puis désactiver ---
r = await call('adm', 'PATCH', `/poles/${neuf}/responsable`, { responsableId: null, motif: 'Pôle en attente d\'un nouveau responsable' });
check('détachement par l\'administrateur (200)', r.s === 200 && r.b.responsableId === null, r);
r = await call('resp', 'GET', '/poles'); check('Rakoto ne voit plus que son pôle d\'origine', r.b.data.length === 1 && r.b.data[0].id === pole, r);

// désactivation
for (const who of ['resp', 'cg', 'dir']) { r = await call(who, 'POST', `/utilisateurs/${hery.id}/desactiver`, { motif: 'Départ' }); check(`${who} ne désactive pas (403)`, r.s === 403, r); }
r = await call('adm', 'POST', `/utilisateurs/${hery.id}/desactiver`, {}); check('motif obligatoire (400)', r.s === 400, r);
const moi = (await call('adm', 'GET', '/auth/me')).b.id;
r = await call('adm', 'POST', `/utilisateurs/${moi}/desactiver`, { motif: 'Test auto-désactivation' }); check('on ne se désactive pas soi-même (403)', r.s === 403, r);
r = await call('adm', 'POST', '/utilisateurs/11111111-1111-4111-8111-111111111111/desactiver', { motif: 'Compte inconnu' }); check('compte inconnu (404)', r.s === 404, r);
// Hery rattaché à nouveau : on ne peut pas le désactiver
await call('cg', 'PATCH', `/poles/${neuf}/responsable`, body(hery.id));
r = await call('adm', 'POST', `/utilisateurs/${hery.id}/desactiver`, { motif: 'Départ de l\'entreprise' });
check('responsable encore rattaché : refus (409) avec le code du pôle', r.s === 409 && r.b.error.message.includes(codeNeuf), r);
r = await call('adm', 'PATCH', `/utilisateurs/${hery.id}/role`, { role: 'CONTROLE_GESTION', motif: 'Changement test' }); check('même garde-fou pour le changement de rôle (409)', r.s === 409, r);
await call('cg', 'PATCH', `/poles/${neuf}/responsable`, { responsableId: null, motif: 'Départ de Hery' });
r = await call('adm', 'POST', `/utilisateurs/${hery.id}/desactiver`, { motif: 'Départ de l\'entreprise' });
check('désactivation (200), connexions terminées', r.s === 200 && r.b.actif === false && r.b.connexionsTerminees >= 1, r);
r = await call('hery', 'GET', '/poles'); check('son ancien jeton est refusé (401)', r.s === 401, r);
l = await call(null, 'POST', '/auth/login', { email: hery.email, password: NEW }); check('il ne peut plus se connecter (401)', l.s === 401, l);
r = await call('adm', 'POST', `/utilisateurs/${hery.id}/desactiver`, { motif: 'Encore une fois' }); check('déjà désactivé (409)', r.s === 409, r);
r = await call('cg', 'PATCH', `/poles/${neuf}/responsable`, body(hery.id)); check('un compte désactivé ne peut plus être rattaché (409)', r.s === 409, r);
r = await call('adm', 'POST', `/utilisateurs/${hery.id}/reactiver`, { motif: 'Retour de congé' }); check('réactivation (200)', r.s === 200 && r.b.actif === true, r);
r = await call('adm', 'POST', `/utilisateurs/${hery.id}/reactiver`, { motif: 'Encore' }); check('déjà actif (409)', r.s === 409, r);
l = await call(null, 'POST', '/auth/login', { email: hery.email, password: NEW }); check('il se reconnecte avec son mot de passe', !!l.b.accessToken, l);

// désactiver les comptes jetables
for (const c of [hery, cg2]) await call('adm', 'POST', `/utilisateurs/${c.id}/desactiver`, { motif: 'Nettoyage du test' });
console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT EST OK');
process.exit(fails ? 1 : 0);
