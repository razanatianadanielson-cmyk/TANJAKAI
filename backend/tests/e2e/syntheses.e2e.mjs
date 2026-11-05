// Scénario « synthèses assistées » (base RÉELLE + FAUX serveur OpenRouter local, aucune clé réelle nécessaire).
// L'API doit être démarrée ainsi (voir le script de lancement dans le LISEZMOI) :
//   OPENROUTER_API_KEY=sk-faux OPENROUTER_BASE_URL=http://localhost:4199/v1 OPENROUTER_PLAFOND_MENSUEL=0.01 OPENROUTER_TIMEOUT_MS=1500 DEV_SKIP_2FA=true
// Prérequis : base migrée + `npm run seed`. Usage : npm run test:e2e:syntheses
import http from 'node:http';
const B = process.env.API_URL || 'http://localhost:4000/api/v1';
const EX = 2031;
let fails = 0;
const tok = {};
const check = (name, cond, extra) => { if (!cond) { fails++; console.log('FAIL', name, extra ? JSON.stringify(extra).slice(0, 600) : ''); } else console.log('ok  ', name); };

// --- faux OpenRouter : mode ok | erreur | lent ; coût 0,006 $ par appel ; mémorise la dernière requête reçue ---
let mode = 'ok'; let dernier = null; let appels = 0;
const faux = http.createServer((req, res) => {
  let corps = '';
  req.on('data', (c) => { corps += c; });
  req.on('end', () => {
    appels += 1; dernier = { auth: req.headers.authorization, corps };
    if (mode === 'erreur') { res.writeHead(500); return res.end('{}'); }
    const repondre = () => { res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ model: 'faux/modele', choices: [{ message: { content: 'Le score recule de 15 points. Commentaire généré par le faux service.' } }],
        usage: { prompt_tokens: 300, completion_tokens: 80, cost: 0.006 } })); };
    if (mode === 'lent') return setTimeout(repondre, 4000);
    repondre();
  });
});
await new Promise((r) => faux.listen(4199, r));

async function call(who, method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: 'Bearer ' + tok[who] } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status, b: j };
}
try {
  for (const [k, e] of [['cg', 'controle'], ['dir', 'direction'], ['resp', 'responsable'], ['adm', 'admin']]) {
    const r = await call(null, 'POST', '/auth/login', { email: e + '@tanjakai.local', password: process.env.SEED_PASSWORD || 'ChangeMe!2026Tj' });
    tok[k] = r.b.accessToken; if (!tok[k]) { console.log('login KO', k, r); process.exit(1); }
  }
  // --- référentiel minimal ---
  let r = await call('cg', 'GET', '/axes'); const axe = Object.fromEntries(r.b.data.map((a) => [a.code, a.id]));
  const crit = {};
  for (const [a, i] of Object.entries({ FINANCIER: 'CA synthèses', HUMAIN: 'Engagement synthèses', QUALITE: 'Qualité synthèses' })) {
    r = await call('cg', 'POST', '/criteres', { axeId: axe[a], intitule: i, definition: `Indicateur ${i} mesuré chaque trimestre`, unite: '%', sensOptimisation: 'MAXIMISER', sourceDonnee: 'ERP', valeurMin: 0, valeurMax: 1000 });
    crit[a] = r.b.id; await call('cg', 'POST', `/criteres/${crit[a]}/valider`);
  }
  r = await call('cg', 'POST', '/grilles', { motif: 'Grille synthèses' });
  if (r.s === 409) { console.log('un brouillon de grille existe déjà'); process.exit(1); }
  const g = r.b.id;
  await call('cg', 'PUT', `/grilles/${g}/ponderations-axes`, { ponderations: [{ axeId: axe.FINANCIER, poids: 40 }, { axeId: axe.HUMAIN, poids: 30 }, { axeId: axe.QUALITE, poids: 30 }] });
  await call('cg', 'PUT', `/grilles/${g}/ponderations-criteres`, { ponderations: Object.values(crit).map((id) => ({ critereId: id, poids: 100, plancher: 0.5, plafond: 1 })) });
  await call('cg', 'POST', `/grilles/${g}/valider`);
  r = await call('cg', 'GET', '/poles'); const pole = r.b.data[0].id;
  for (const id of Object.values(crit)) await call('cg', 'PUT', '/cibles', { poleId: pole, critereId: id, exercice: EX, valeurCible: 100 });
  await call('dir', 'POST', '/cibles/valider-lot', { exercice: EX });

  const NOM_SECRET = 'Jean-Baptiste Randrianarisoa';
  async function ouvrir(t) { const x = await call('cg', 'POST', '/campagnes', { exercice: EX, trimestre: t, grilleId: g, dateLimite: '2035-12-31' }); check(`T${t} ouverte`, x.s === 201, x); return x.b.id; }
  async function cloturer(camp, t, valeur) {
    for (const id of Object.values(crit)) {
      const x = await call('resp', 'PUT', `/campagnes/${camp}/poles/${pole}/criteres/${id}`, { valeurRealisee: valeur, commentaire: `Dossier suivi par ${NOM_SECRET}` });
      if (x.s !== 200) check('saisie', false, x);
    }
    await call('resp', 'POST', `/campagnes/${camp}/poles/${pole}/soumettre`);
    await call('cg', 'POST', `/campagnes/${camp}/poles/${pole}/valider`);
    const x = await call('cg', 'POST', `/campagnes/${camp}/cloturer`); check(`T${t} clôturée`, x.s === 200, x);
  }
  const c1 = await ouvrir(1); await cloturer(c1, 1, 80);   // score 60
  const c2 = await ouvrir(2);
  r = await call('cg', 'POST', '/syntheses/generer', { campagneId: c2, poleId: pole });
  check('campagne non clôturée : pas de synthèse (409)', r.s === 409, r);
  await cloturer(c2, 2, 65);                                // score 30 -> recul de 30 points

  // --- droits ---
  for (const who of ['resp', 'dir', 'adm']) { r = await call(who, 'POST', '/syntheses/generer', { campagneId: c2, poleId: pole }); check(`${who} ne génère pas (403)`, r.s === 403, r); }
  r = await call('adm', 'GET', '/syntheses'); check('administrateur ne lit pas les synthèses (403)', r.s === 403, r);

  // --- génération assistée d'un pôle ---
  r = await call('cg', 'POST', '/syntheses/generer', { campagneId: c2, poleId: pole });
  const sp = r.b;
  check('synthèse de pôle générée en BROUILLON, mode assisté', r.s === 201 && sp.statut === 'BROUILLON' && sp.mode === 'ASSISTE' && sp.type === 'POLE' && sp.contenu.includes('faux service'), r);
  check('identifiée comme générée automatiquement, à relire', sp.genereeAutomatiquement === true && /générée automatiquement/.test(sp.mention) && /Ne pas diffuser/.test(sp.mention), sp);
  check('faits : score 30, précédent 60, évolution −30, trois critères en recul', sp.donnees.score.consolide === 30 && sp.donnees.score.precedent === 60 && sp.donnees.score.evolution === -30 && sp.donnees.enRecul.length === 3, sp.donnees);
  check('modèle et coût journalisés', sp.modele === 'faux/modele' && sp.cout === 0.006, sp);
  check('clé transmise au service uniquement par en-tête serveur', dernier.auth === 'Bearer sk-faux');
  check('AUCUN nom ni commentaire de saisie envoyé au service', !dernier.corps.includes('Randrianarisoa') && !dernier.corps.includes('Dossier suivi') && !/@/.test(dernier.corps), dernier.corps.slice(0, 300));
  check('les faits chiffrés sont bien envoyés', dernier.corps.includes('CA synthèses') && dernier.corps.includes('T2 2031'));

  // --- invisibilité avant validation ---
  r = await call('dir', 'GET', `/syntheses?campagneId=${c2}`); check('direction ne voit pas un brouillon', r.s === 200 && r.b.data.length === 0, r.b);
  r = await call('dir', 'GET', `/syntheses/${sp.id}`); check('direction : brouillon introuvable (404)', r.s === 404, r);
  r = await call('resp', 'GET', `/syntheses/${sp.id}`); check('responsable : brouillon introuvable (404)', r.s === 404, r);

  // --- relecture ---
  r = await call('resp', 'PATCH', `/syntheses/${sp.id}`, { contenu: 'x' }); check('responsable ne modifie pas (403)', r.s === 403, r);
  r = await call('cg', 'PATCH', `/syntheses/${sp.id}`, { contenu: '   ' }); check('commentaire vide refusé (400)', r.s === 400, r);
  r = await call('cg', 'PATCH', `/syntheses/${sp.id}`, { contenu: 'Version relue : le recul de 30 points est à examiner.' });
  check('relecture : texte corrigé, original conservé', r.s === 200 && r.b.contenu.startsWith('Version relue') && r.b.contenuOrigine.includes('faux service') && r.b.modifiee === true, r);

  // --- mode dégradé (service en panne) puis lenteur ---
  mode = 'erreur';
  r = await call('cg', 'POST', '/syntheses/generer', { campagneId: c1, poleId: pole });
  check('service en panne : synthèse chiffrée sans commentaire (mode dégradé)', r.s === 201 && r.b.mode === 'DEGRADE' && r.b.contenu === null && /500/.test(r.b.motifDegrade) && r.b.donnees.score.consolide === 60, r);
  const sDeg = r.b;
  mode = 'lent';
  r = await call('cg', 'POST', '/syntheses/generer', { campagneId: c1, poleId: pole });
  check('régénération du brouillon (même enregistrement) ; délai dépassé -> dégradé', r.s === 201 && r.b.id === sDeg.id && r.b.mode === 'DEGRADE' && /Délai/.test(r.b.motifDegrade), r);
  r = await call('cg', 'GET', '/syntheses/cout'); check('les appels en échec ne coûtent rien', r.s === 200 && Math.abs(r.b.consomme - 0.006) < 1e-9 && r.b.appels === 1, r.b);

  // --- validation du pôle ---
  mode = 'ok';
  r = await call('resp', 'POST', `/syntheses/${sp.id}/valider`); check('responsable ne valide pas (403)', r.s === 403, r);
  r = await call('dir', 'POST', `/syntheses/${sp.id}/valider`); check('direction ne valide pas (403)', r.s === 403, r);
  r = await call('cg', 'POST', `/syntheses/${sp.id}/valider`);
  check('validation par le contrôle de gestion', r.s === 200 && r.b.statut === 'VALIDEE' && r.b.validePar && /relue et validée/.test(r.b.mention), r);
  r = await call('cg', 'PATCH', `/syntheses/${sp.id}`, { contenu: 'tentative' }); check('synthèse validée : modification impossible (409)', r.s === 409, r);
  r = await call('cg', 'POST', `/syntheses/${sp.id}/valider`); check('double validation (409)', r.s === 409, r);
  r = await call('cg', 'POST', '/syntheses/generer', { campagneId: c2, poleId: pole }); check('régénération d\'une synthèse validée refusée (409)', r.s === 409, r);
  r = await call('dir', 'GET', `/syntheses?campagneId=${c2}`); check('direction voit la synthèse validée', r.s === 200 && r.b.data.length === 1 && r.b.data[0].id === sp.id && !('cout' in r.b.data[0]) && !('contenuOrigine' in r.b.data[0]), r.b);
  r = await call('resp', 'GET', `/syntheses/${sp.id}`); check('le responsable du pôle voit la sienne', r.s === 200, r);
  r = await call('resp', 'GET', '/notifications?limit=50'); check('responsable notifié', r.b.data.some((n) => /Synthèse du pôle/.test(n.message)), r.b);

  // --- comparative + plafond de dépense ---
  r = await call('cg', 'POST', '/syntheses/generer', { campagneId: c2 });
  check('synthèse comparative générée', r.s === 201 && r.b.type === 'COMPARATIVE' && r.b.mode === 'ASSISTE' && r.b.donnees.poles.length >= 1 && r.b.donnees.poles[0].evolution === -30, r);
  r = await call('cg', 'GET', '/syntheses/cout'); check('dépense cumulée 0,012 $ — plafond 0,01 $ atteint', r.s === 200 && Math.abs(r.b.consomme - 0.012) < 1e-9 && r.b.restant === 0 && r.b.appels === 2 && r.b.configure === true, r.b);
  const avant = appels;
  r = await call('cg', 'POST', '/syntheses/generer', { campagneId: c1 });
  check('plafond atteint : mode dégradé SANS appel au service', r.s === 201 && r.b.mode === 'DEGRADE' && /Plafond/.test(r.b.motifDegrade) && appels === avant, { s: r.s, m: r.b.motifDegrade, appels, avant });
  r = await call('dir', 'GET', '/syntheses/cout'); check('coûts réservés au contrôle de gestion et à l\'administrateur (403)', r.s === 403, r);
  r = await call('adm', 'GET', '/syntheses/cout'); check('administrateur voit les coûts', r.s === 200 && r.b.derniersAppels.length === 2 && r.b.derniersAppels[0].tokensEntree === 300, r.b);
  r = await call('cg', 'POST', '/syntheses/generer', { campagneId: '11111111-1111-4111-8111-111111111111' }); check('campagne inconnue (404)', r.s === 404, r);
} finally {
  faux.close();
}
console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTout est bon.'); process.exit(fails ? 1 : 0);
