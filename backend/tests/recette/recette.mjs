// RECETTE — jeu de données sur deux trimestres consécutifs (2028 T1 et T2), 6 pôles de 3 familles d'activité.
// Le script monte tout par l'API réelle (comme le ferait un utilisateur), contrôle chaque point de la recette du cahier
// des charges (§ 6) et écrit un dossier de contrôle dans ./recette-sortie :
//   - fiche-controle-manuel.csv : entrées, taux d'atteinte, notes et scores recalculés indépendamment, à vérifier à la main ;
//   - rapport-recette.md        : résultat de chaque vérification.
// Prérequis : base migrée + `npm run seed`, API démarrée (DEV_SKIP_2FA=true). Usage : npm run recette
// Les données sont créées une seule fois (relancer sur une base déjà recettée s'arrête sans rien changer).
import fs from 'node:fs';

const B = process.env.API_URL || 'http://localhost:4000/api/v1';
const SEED = process.env.SEED_PASSWORD || 'ChangeMe!2026Tj';
const MDP_RECETTE = process.env.RECETTE_PASSWORD || 'Kv7#Recette-Nord2028';
const EX = 2028;
const SORTIE = process.env.RECETTE_SORTIE || './recette-sortie';
const tok = {};
const resultats = [];
let fails = 0;

async function call(who, method, path, body, headers = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (who) h.Authorization = 'Bearer ' + (tok[who] || who);
  const t0 = performance.now();
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status, b: j, ms: performance.now() - t0 };
}
function check(attendu, nom, cond, extra) {
  resultats.push({ attendu, nom, ok: Boolean(cond) });
  if (!cond) { fails++; console.log('FAIL', nom, extra ? JSON.stringify(extra).slice(0, 500) : ''); } else console.log('ok  ', nom);
}

// ---------------------------------------------------------------------------------------------------------------
// Données de la recette
// ---------------------------------------------------------------------------------------------------------------
const AXES = { FINANCIER: 40, HUMAIN: 30, QUALITE: 30 };
// [axe, intitulé, unité, sens, poids dans l'axe, plancher, plafond]
const CRITERES = [
  ['FINANCIER', 'Réalisation du CA budgété (recette)', '%', 'MAXIMISER', 60, 0.5, 1.0],
  ['FINANCIER', 'Marge (recette)', '%', 'MAXIMISER', 40, 0.6, 1.1],
  ['HUMAIN', 'Rotation du personnel (recette)', '%', 'MINIMISER', 50, 0.5, 1.0],
  ['HUMAIN', 'Absentéisme (recette)', '%', 'MINIMISER', 50, 0.5, 1.0],
  ['QUALITE', 'Satisfaction client (recette)', '%', 'MAXIMISER', 70, 0.5, 1.0],
  ['QUALITE', 'Taux de réclamation (recette)', '%', 'MINIMISER', 30, 0.5, 1.0],
];
// cibles propres à chaque famille : c'est la normalisation qui rend les pôles comparables
const FAMILLES = {
  BPO: { libelle: 'Externalisation de services (BPO)', cibles: [100, 20, 12, 4, 90, 2] },
  AGR: { libelle: 'Agriculture et agro-industrie', cibles: [100, 12, 25, 6, 85, 3] },
  COM: { libelle: 'Commerce et distribution', cibles: [100, 8, 30, 5, 88, 4] },
};
// valeurs réalisées par trimestre (null = critère non renseigné, avec motif)
const POLES = [
  { code: 'RC-BPO-1', nom: 'Pôle BPO Antsirabe', f: 'BPO', t: [[97, 19, 12.5, 4.2, 88, 2.2], [101, 20.5, 11.5, 3.9, 91, 2.0]] },
  { code: 'RC-BPO-2', nom: 'Pôle BPO Fianarantsoa', f: 'BPO', t: [[100, 20, 12, 4, 90, 2], [85, 17, 14, 4.8, 80, 2.6]] },
  { code: 'RC-AGR-1', nom: 'Pôle Agro Vakinankaratra', f: 'AGR', t: [[60, 6, 40, 10, 60, 6], [58, 5.5, 42, 11, 58, 6.5]] },
  { code: 'RC-AGR-2', nom: 'Pôle Agro Atsimo', f: 'AGR', t: [[85, 10, 28, 6.5, 78, 3.5], [92, 11.5, 26, 6.1, 83, 3.1]] },
  { code: 'RC-COM-1', nom: 'Pôle Commerce Analamanga', f: 'COM', t: [[90, 7, 33, 5.5, 80, 4.5], [88, 7.2, 31, 5.2, 84, null]] },
  { code: 'RC-COM-2', nom: 'Pôle Commerce Toamasina', f: 'COM', t: [[95, 7.5, 32, 5.2, 85, 4.2], [55, 4, 45, 8, 55, 7]] },
];

// ---------------------------------------------------------------------------------------------------------------
// Calcul « manuel » indépendant du moteur (formules du cahier des charges, écrites à part)
// ---------------------------------------------------------------------------------------------------------------
const r2 = (x) => Math.round(x * 100 + 1e-9) / 100;
function calculManuel(cibles, valeurs) {
  const detail = []; const axe = {};
  CRITERES.forEach(([a, nom, , sens, poids, pl, pf], i) => {
    const v = valeurs[i];
    if (v === null) { detail.push({ nom, a, poids, taux: null, note: null }); return; }
    const taux = sens === 'MAXIMISER' ? v / cibles[i] : cibles[i] / v;
    const note = r2(Math.min(1, Math.max(0, (taux - pl) / (pf - pl))) * 100);
    detail.push({ nom, a, poids, taux, note });
    (axe[a] ??= []).push([poids, note]);
  });
  let num = 0; let den = 0; const notesAxe = {};
  for (const a of Object.keys(axe)) {
    const sw = axe[a].reduce((s, x) => s + x[0], 0);
    notesAxe[a] = r2(axe[a].reduce((s, x) => s + x[0] * x[1], 0) / sw);
    num += AXES[a] * notesAxe[a]; den += AXES[a];
  }
  return { detail, notesAxe, score: r2(num / den) };
}

// ---------------------------------------------------------------------------------------------------------------
console.log('== Connexion');
for (const [k, e] of [['cg', 'controle'], ['dir', 'direction'], ['adm', 'admin']]) {
  const r = await call(null, 'POST', '/auth/login', { email: e + '@tanjakai.local', password: SEED });
  tok[k] = r.b.accessToken; if (!tok[k]) { console.log('Connexion impossible pour', e, r.s, r.b); process.exit(1); }
}
let r = await call('cg', 'GET', '/campagnes?limit=100');
if ((r.b.data || []).some((c) => c.exercice === EX)) { console.log(`Le jeu de recette ${EX} existe déjà : rien n'est modifié.`); process.exit(0); }

console.log('== Référentiel');
r = await call('cg', 'GET', '/familles'); const famId = {};
for (const [k, f] of Object.entries(FAMILLES)) {
  let ex = (r.b.data || []).find((x) => x.libelle === f.libelle);
  if (!ex) { const c = await call('cg', 'POST', '/familles', { libelle: f.libelle }); ex = c.b; }
  famId[k] = ex.id;
}
check(1, 'trois familles d\'activité disponibles', Object.values(famId).every(Boolean), famId);
r = await call('cg', 'GET', '/axes'); const axe = Object.fromEntries(r.b.data.map((a) => [a.code, a.id]));
const crit = [];
for (const [a, nom, unite, sens] of CRITERES) {
  const c = await call('cg', 'POST', '/criteres', { axeId: axe[a], intitule: nom, definition: `Indicateur « ${nom} » mesuré chaque trimestre pour la recette`, unite, sensOptimisation: sens, sourceDonnee: 'Recette', valeurMin: 0, valeurMax: 1000 });
  if (c.s !== 201) { console.log('Création du critère impossible', nom, c.s, c.b); process.exit(1); }
  await call('cg', 'POST', `/criteres/${c.b.id}/valider`); crit.push(c.b.id);
}
r = await call('cg', 'POST', '/grilles', { motif: 'Grille de recette' });
if (r.s !== 201) { console.log('Création de la grille impossible (un brouillon existe peut-être déjà)', r.s, r.b); process.exit(1); }
const grille = r.b.id;
await call('cg', 'PUT', `/grilles/${grille}/ponderations-axes`, { ponderations: Object.entries(AXES).map(([c, poids]) => ({ axeId: axe[c], poids })) });
await call('cg', 'PUT', `/grilles/${grille}/ponderations-criteres`, { ponderations: CRITERES.map((c, i) => ({ critereId: crit[i], poids: c[4], plancher: c[5], plafond: c[6] })) });
r = await call('cg', 'POST', `/grilles/${grille}/valider`);
check(1, 'grille de recette validée : 3 axes (40/30/30) et 6 critères', r.s === 200, r);

console.log('== Pôles, responsables, cibles');
for (const p of POLES) {
  const email = `recette.${p.code.toLowerCase()}@tanjakai.local`;
  const nomResp = p.code.replace('RC-', '');
  let c = await call('adm', 'POST', '/utilisateurs', { nom: `Recette ${nomResp}`, prenom: 'Responsable', email, role: 'RESPONSABLE_POLE' });
  if (c.s !== 201) { console.log('Création du compte impossible', email, c.s, c.b); process.exit(1); }
  const prov = c.b.motDePasseProvisoire; p.email = email; p.respId = c.b.id;
  const l = await call(null, 'POST', '/auth/login', { email, password: prov });
  const ch = await call(l.b.accessToken, 'POST', '/auth/mot-de-passe', { actuel: prov, nouveau: MDP_RECETTE });
  if (ch.s !== 204) { console.log('Changement de mot de passe impossible', ch.s, ch.b); process.exit(1); }
  const l2 = await call(null, 'POST', '/auth/login', { email, password: MDP_RECETTE }); tok[p.code] = l2.b.accessToken;
  const pole = await call('cg', 'POST', '/poles', { code: p.code, intitule: p.nom, familleId: famId[p.f], responsableId: p.respId, effectif: 40, implantation: p.nom.split(' ').pop(), dateRattachement: '2027-01-01' });
  if (pole.s !== 201) { console.log('Création du pôle impossible', p.code, pole.s, pole.b); process.exit(1); }
  p.id = pole.b.id;
  for (let i = 0; i < crit.length; i++) await call('cg', 'PUT', '/cibles', { poleId: p.id, critereId: crit[i], exercice: EX, valeurCible: FAMILLES[p.f].cibles[i] });
}
r = await call('dir', 'POST', '/cibles/valider-lot', { exercice: EX });
check(1, '36 cibles validées par la direction (cibles propres à chaque famille)', r.s === 200 && r.b.validees === 36, r.b);
check(1, 'six pôles de trois familles différentes', new Set(POLES.map((p) => p.f)).size === 3);

// clé de service pour un pôle (saisie par l'interface de programmation)
const cleCom2 = await call('adm', 'POST', '/cles-service', { poleId: POLES[5].id, libelle: 'ERP commerce Toamasina (recette)' });
check(2, 'clé de service créée pour RC-COM-2', cleCom2.s === 201 && /^tjk_/.test(cleCom2.b.cle), cleCom2.b);

// ---------------------------------------------------------------------------------------------------------------
const sorties = []; // lignes de la fiche de contrôle manuel
const syntheses = []; const campagnes = {};
const poleParId = Object.fromEntries(POLES.map((p) => [p.id, p]));
let alertesT = {};

async function trimestre(t) {
  console.log(`== Trimestre T${t} ${EX}`);
  r = await call('cg', 'POST', '/campagnes', { exercice: EX, trimestre: t, grilleId: grille, dateLimite: '2029-12-31' });
  check(2, `T${t} : campagne ouverte (périmètre, grille et cibles gelés)`, r.s === 201, r); const camp = r.b.id; campagnes[t] = camp;

  for (const p of POLES) {
    const vals = p.t[t - 1];
    const parApi = t === 1 && p.code === 'RC-COM-2';
    for (let i = 0; i < crit.length; i++) {
      let x;
      if (parApi) {
        x = await call(null, 'POST', '/service/saisies', { campagne_id: camp, critere_id: crit[i], pole_id: p.id, valeur_realisee: vals[i], commentaire: 'Export ERP' }, { 'X-Service-Key': cleCom2.b.cle, 'Idempotency-Key': `recette-${t}-${i}` });
        if (x.s !== 201) { check(2, `T${t} ${p.code} : dépôt par clé de service`, false, x); }
      } else if (vals[i] === null) {
        x = await call(p.code, 'PUT', `/campagnes/${camp}/poles/${p.id}/criteres/${crit[i]}`, { motifNonRenseigne: 'Enquête non réalisée ce trimestre' });
      } else {
        // un faux pas volontaire pour RC-AGR-2 au T1 : absentéisme saisi 65 au lieu de 6,5 (voir le renvoi plus bas)
        const v = t === 1 && p.code === 'RC-AGR-2' && i === 3 ? 65 : vals[i];
        x = await call(p.code, 'PUT', `/campagnes/${camp}/poles/${p.id}/criteres/${crit[i]}`, { valeurRealisee: v });
      }
      if (x.s !== 200 && x.s !== 201) { check(2, `T${t} ${p.code} : saisie du critère ${i + 1}`, false, x); }
    }
  }
  check(2, `T${t} : saisies déposées (5 pôles par l'espace, 1 pôle par clé de service)`, true);

  if (t === 1) {
    // cloisonnement : un responsable n'accède pas aux données d'un autre pôle
    const rBpo1 = await call('RC-BPO-1', 'GET', `/campagnes/${camp}/poles/${POLES[2].id}/saisies`);
    check(5, 'cloisonnement : RC-BPO-1 ne lit pas les saisies de RC-AGR-1', rBpo1.s === 403 || rBpo1.s === 404, rBpo1);
    const rPut = await call('RC-BPO-1', 'PUT', `/campagnes/${camp}/poles/${POLES[2].id}/criteres/${crit[0]}`, { valeurRealisee: 100 });
    check(5, 'cloisonnement : RC-BPO-1 ne saisit pas dans RC-AGR-1', rPut.s === 403 || rPut.s === 404, rPut);
    const rPoles = await call('RC-BPO-1', 'GET', '/poles');
    check(5, 'cloisonnement : RC-BPO-1 ne voit que son pôle', rPoles.s === 200 && rPoles.b.data.length === 1 && rPoles.b.data[0].code === 'RC-BPO-1', rPoles.b);
    const rApiAutre = await call(null, 'POST', '/service/saisies', { campagne_id: camp, critere_id: crit[0], pole_id: POLES[0].id, valeur_realisee: 1 }, { 'X-Service-Key': cleCom2.b.cle, 'Idempotency-Key': 'intrus-1' });
    check(5, 'cloisonnement : la clé de RC-COM-2 ne dépose pas dans RC-BPO-1', rApiAutre.s === 403, rApiAutre);
  }

  for (const p of POLES) {
    r = await call(p.code, 'POST', `/campagnes/${camp}/poles/${p.id}/soumettre`);
    if (t === 2 && p.code === 'RC-COM-2') {
      // règle de justification : une variation de plus de 50 % d'un trimestre à l'autre exige un commentaire
      check(2, 'T2 RC-COM-2 : soumission refusée sans explication des variations de plus de 50 % (JUSTIFICATION_REQUISE)', r.s === 422 && r.b.error.code === 'SOUMISSION_INCOMPLETE' && JSON.stringify(r.b.error.details).includes('JUSTIFICATION_REQUISE'), r.b);
      for (let i = 0; i < crit.length; i++) await call(p.code, 'PUT', `/campagnes/${camp}/poles/${p.id}/criteres/${crit[i]}`, { valeurRealisee: p.t[1][i], commentaire: 'Perte d\'un client majeur ce trimestre (recette)' });
      r = await call(p.code, 'POST', `/campagnes/${camp}/poles/${p.id}/soumettre`);
    }
    check(2, `T${t} ${p.code} : soumission`, r.s === 200, r);
  }
  // séparation des fonctions
  const vResp = await call(POLES[0].code, 'POST', `/campagnes/${camp}/poles/${POLES[0].id}/valider`);
  check(2, `T${t} : un responsable ne peut pas valider (même sa propre saisie)`, vResp.s === 403, vResp);
  const vDir = await call('dir', 'POST', `/campagnes/${camp}/poles/${POLES[0].id}/valider`);
  check(2, `T${t} : la direction ne valide pas`, vDir.s === 403, vDir);

  if (t === 1) {
    // renvoi pour correction : valeur aberrante
    const plan = await call('cg', 'GET', `/campagnes/${camp}/poles/${POLES[3].id}/saisies`);
    const ligne = plan.b.lignes.find((l) => l.valeurRealisee === 65);
    r = await call('cg', 'POST', `/saisies/${ligne.saisieId}/renvoyer`, { motif: 'Valeur aberrante : 65 % d\'absentéisme au lieu de 6,5 %' });
    check(2, 'T1 : renvoi motivé d\'une valeur aberrante (RC-AGR-2)', r.s === 200 && r.b.statut === 'RENVOYEE', r);
    r = await call('RC-AGR-2', 'PUT', `/campagnes/${camp}/poles/${POLES[3].id}/criteres/${crit[3]}`, { valeurRealisee: 6.5, commentaire: 'Erreur de frappe corrigée' });
    check(2, 'T1 : correction par le responsable', r.s === 200, r);
    r = await call('RC-AGR-2', 'POST', `/campagnes/${camp}/poles/${POLES[3].id}/soumettre`); check(2, 'T1 : nouvelle soumission', r.s === 200, r);
  }
  for (const p of POLES) {
    r = await call('cg', 'POST', `/campagnes/${camp}/poles/${p.id}/valider`);
    check(2, `T${t} ${p.code} : validation par le contrôle de gestion`, r.s === 200 && r.b.validees === 6, r);
  }
  r = await call('cg', 'POST', `/campagnes/${camp}/cloturer`);
  const scores = (r.b.scores || []).filter((x) => poleParId[x.poleId]); // les autres pôles de la base ne font pas partie de la recette
  check(3, `T${t} : clôture, 6 scores historisés pour les pôles de la recette`, r.s === 200 && scores.length === 6, r);
  alertesT[t] = (r.b.alertes || []).filter((a) => String(a.poleCode).startsWith('RC-'));

  for (const s of scores) {
    const p = poleParId[s.poleId]; if (!p) continue;
    const m = calculManuel(FAMILLES[p.f].cibles, p.t[t - 1]);
    const ok = Math.abs(s.scoreConsolide - m.score) <= 0.011;
    check(3, `T${t} ${p.code} : score application ${s.scoreConsolide} = calcul manuel ${m.score}`, ok, { app: s.scoreConsolide, manuel: m.score });
    const det = await call('cg', 'GET', `/scores/${s.scorePoleId}`);
    const crits = (det.b.axes || []).flatMap((a) => a.criteres);
    const verif = await call('cg', 'GET', `/scores/${s.scorePoleId}/verification`);
    check(3, `T${t} ${p.code} : recalcul du score historisé identique`, verif.s === 200 && verif.b.coherent === true && verif.b.scoreStocke === verif.b.scoreRecalcule, verif.b);
    p[`score${t}`] = s.scoreConsolide; p[`manuel${t}`] = m.score; p[`partiel${t}`] = s.partiel;
    CRITERES.forEach(([a, nom, unite, sens, poids], i) => {
      const d = m.detail[i]; const app = crits.find((c) => c.intitule === nom);
      const axeApp = (det.b.axes || []).find((x) => x.code === a);
      sorties.push({ t, p, nom, a, sens, cible: FAMILLES[p.f].cibles[i], valeur: p.t[t - 1][i], taux: d.taux, note: d.note, noteApp: app ? app.note : null, poids, noteAxe: m.notesAxe[a], noteAxeApp: axeApp ? axeApp.note : null, score: m.score, scoreApp: s.scoreConsolide });
    });
  }
}

await trimestre(1);
// alertes du T1 : seule RC-AGR-1 est sous le seuil
const typesT1 = alertesT[1].map((a) => `${a.poleCode}:${a.type}`).sort();
check(4, 'T1 : une seule alerte (vigilance sur RC-AGR-1), aucune alerte de direction', typesT1.join() === 'RC-AGR-1:VIGILANCE', typesT1);
await trimestre(2);
const typesT2 = alertesT[2].map((a) => `${a.poleCode}:${a.type}`).sort();
check(4, 'T2 : alerte de DIRECTION déclenchée pour RC-AGR-1 (sous le seuil 2 trimestres de suite)', typesT2.includes('RC-AGR-1:DIRECTION'), typesT2);
check(4, 'T2 : RC-COM-2 en vigilance mais pas en alerte de direction (T1 au-dessus du seuil)', typesT2.includes('RC-COM-2:VIGILANCE') && !typesT2.includes('RC-COM-2:DIRECTION'), typesT2);
check(4, 'T2 : RC-BPO-2 en dégradation rapide alors qu\'elle reste au-dessus du seuil', typesT2.includes('RC-BPO-2:DEGRADATION') && !typesT2.includes('RC-BPO-2:VIGILANCE'), typesT2);
check(4, 'T2 : au total 5 alertes (AGR-1 ×2, BPO-2, COM-2 ×2)', alertesT[2].length === 5, typesT2);
check(3, 'T2 : RC-COM-1 a un score partiel (critère non renseigné exclu, pondération redistribuée)', POLES[4].partiel2 === true && POLES[4].partiel1 === false);
r = await call('dir', 'GET', '/alertes?actives=true&limit=50');
check(4, 'la direction voit les 6 alertes actives de la recette', r.s === 200 && r.b.data.filter((a) => String(a.poleCode).startsWith('RC-')).length === 6, r.b.data.map((a) => a.poleCode));
r = await call('RC-AGR-1', 'GET', '/alertes?limit=50');
check(5, 'RC-AGR-1 voit ses propres alertes (3)', r.s === 200 && r.b.pagination.total === 3, r.b.pagination);
r = await call('RC-BPO-1', 'GET', '/alertes?limit=50');
check(5, 'cloisonnement : RC-BPO-1 ne voit aucune alerte (aucune sur son pôle)', r.s === 200 && r.b.pagination.total === 0, r.b.pagination);

// restitution et temps de réponse de la vue direction
const tms = [];
for (const q of [`/scores?limit=100`, `/alertes?actives=true&limit=50`, `/campagnes?limit=100`]) { const x = await call('dir', 'GET', q); tms.push(x.ms); }
check(3, `vue direction : classement, alertes et campagnes en ${Math.max(...tms).toFixed(0)} ms (objectif : moins de 2 s)`, Math.max(...tms) < 2000, tms);
r = await call('dir', 'GET', `/scores?campagneId=${campagnes[2]}&limit=100`);
const rang = (r.b.data || []).filter((x) => poleParId[x.poleId]).slice().sort((a, b) => b.scoreConsolide - a.scoreConsolide).map((s) => poleParId[s.poleId]?.code);
check(3, 'classement du T2 : RC-BPO-1 premier, RC-COM-2 en dernière position ou presque', rang[0] === 'RC-BPO-1' && rang.slice(-2).includes('RC-COM-2') && rang.length === 6, rang);

// ---------------------------------------------------------------------------------------------------------------
// Dossier de contrôle
// ---------------------------------------------------------------------------------------------------------------
fs.mkdirSync(SORTIE, { recursive: true });
const cell = (v) => { if (v === null || v === undefined) return ''; if (typeof v === 'number') return String(v).replace('.', ','); const s = String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const entete = ['Trimestre', 'Pôle', 'Famille', 'Axe', 'Critère', 'Sens', 'Cible du pôle', 'Valeur réalisée', 'Taux d\'atteinte (calcul manuel)', 'Note critère (calcul manuel)', 'Note critère (application)', 'Poids du critère dans l\'axe', 'Note axe (calcul manuel)', 'Note axe (application)', 'Score pôle (calcul manuel)', 'Score pôle (application)', 'Écart'];
const lignes = sorties.map((x) => [`T${x.t} ${EX}`, x.p.code, FAMILLES[x.p.f].libelle, x.a, x.nom, x.sens === 'MAXIMISER' ? 'À maximiser' : 'À minimiser', x.cible, x.valeur === null ? 'non renseigné' : x.valeur, x.taux === null ? '' : Math.round(x.taux * 10000) / 10000, x.note, x.noteApp, x.poids, x.noteAxe, x.noteAxeApp, x.score, x.scoreApp, Math.round((x.scoreApp - x.score) * 100) / 100]);
fs.writeFileSync(`${SORTIE}/fiche-controle-manuel.csv`, `﻿${[entete, ...lignes].map((l) => l.map(cell).join(';')).join('\r\n')}\r\n`);

const lignesRapport = resultats.map((x) => `| ${x.attendu} | ${x.nom} | ${x.ok ? 'Conforme' : '**ÉCART**'} |`).join('\n');
const synthese = POLES.map((p) => `| ${p.code} | ${FAMILLES[p.f].libelle} | ${p.score1} | ${p.manuel1} | ${p.score2} | ${p.manuel2}${p.partiel2 ? ' (partiel)' : ''} |`).join('\n');
fs.writeFileSync(`${SORTIE}/rapport-recette.md`, `# Rapport de recette — ${EX} T1 et T2\n\nRésultat : ${fails ? `${fails} écart(s)` : 'toutes les vérifications sont conformes'} (${resultats.length} contrôles).\n\n## Scores\n\n| Pôle | Famille | T1 application | T1 manuel | T2 application | T2 manuel |\n|---|---|---|---|---|---|\n${synthese}\n\n## Alertes\n\n- T1 : ${typesT1.join(', ') || 'aucune'}\n- T2 : ${typesT2.join(', ')}\n\n## Contrôles (Attendu du cahier des charges, § 6)\n\n| Attendu | Contrôle | Résultat |\n|---|---|---|\n${lignesRapport}\n\n## Comptes de recette\n\nMot de passe commun : \`${MDP_RECETTE}\` — ${POLES.map((p) => p.email).join(', ')}\n`);

console.log(`\nDossier écrit dans ${SORTIE} (fiche-controle-manuel.csv, rapport-recette.md).`);
console.log(fails ? `\n${fails} ÉCART(S)` : '\nRECETTE CONFORME');
process.exit(fails ? 1 : 0);
