// Scénario « comptes » (base RÉELLE) : création d'un compte, mot de passe provisoire, changement de rôle.
// Il crée ses propres comptes jetables (e2e-comptes-…@tanjakai.local), désactivés à la fin si DATABASE_URL est accessible.
// Prérequis : base migrée + `npm run seed`, API démarrée (DEV_SKIP_2FA=true). Usage : npm run test:e2e:comptes
import 'dotenv/config';
import pg from 'pg';
const B = process.env.API_URL || 'http://localhost:4000/api/v1';
const SEED = process.env.SEED_PASSWORD || 'ChangeMe!2026Tj';
let fails = 0;
const check = (name, cond, extra) => { if (!cond) { fails++; console.log('FAIL', name, extra ? JSON.stringify(extra).slice(0, 500) : ''); } else console.log('ok  ', name); };
async function call(token, method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status, b: j, h: r.headers };
}
const login = (email, password) => call(null, 'POST', '/auth/login', { email, password });
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, options: '-c search_path=notation,public' }) : null;
const crees = [];
const stamp = Date.now();
const email = (n) => { const e = `e2e-comptes-${n}-${stamp}@tanjakai.local`; crees.push(e); return e; };

try {
  const tok = {};
  for (const [k, e] of [['cg', 'controle'], ['dir', 'direction'], ['resp', 'responsable'], ['adm', 'admin']]) {
    const r = await login(e + '@tanjakai.local', SEED); tok[k] = r.b.accessToken;
    if (!tok[k]) { console.log('login KO', k, r); process.exit(1); }
  }

  // --- droits et validation ---
  for (const who of ['resp', 'cg', 'dir']) {
    const r = await call(tok[who], 'POST', '/utilisateurs', { nom: 'Test', prenom: 'Test', email: email('x'), role: 'CONTROLE_GESTION' });
    check(`${who} ne crée pas de compte (403)`, r.s === 403, r);
  }
  let r = await call(tok.adm, 'POST', '/utilisateurs', { nom: 'Rakotomalala', prenom: 'Hery', email: 'pas-un-email', role: 'CONTROLE_GESTION' }); check('e-mail invalide (400)', r.s === 400, r);
  r = await call(tok.adm, 'POST', '/utilisateurs', { nom: 'Rakotomalala', prenom: 'Hery', email: email('r'), role: 'PIRATE' }); check('rôle inconnu (400)', r.s === 400, r);
  r = await call(tok.adm, 'POST', '/utilisateurs', { nom: 'R', prenom: 'Hery', email: email('r'), role: 'CONTROLE_GESTION' }); check('nom trop court (400)', r.s === 400, r);

  // --- création d'un responsable ---
  const mail = email('resp');
  r = await call(tok.adm, 'POST', '/utilisateurs', { nom: 'Rakotomalala', prenom: 'Hery', email: mail.toUpperCase(), role: 'RESPONSABLE_POLE' });
  check('compte créé (201), e-mail normalisé, mot de passe provisoire renvoyé une fois', r.s === 201 && r.b.email === mail && r.b.role === 'RESPONSABLE_POLE' && r.b.actif && r.b.motDePasseProvisoire.length === 16 && r.b.mdpAChanger === true, r);
  check('réponse non mise en cache', /no-store/.test(r.h.get('cache-control') || ''));
  check('aucun hash exposé', !JSON.stringify(r.b).includes('$2'));
  const nouveau = r.b; const provisoire = r.b.motDePasseProvisoire;
  r = await call(tok.adm, 'POST', '/utilisateurs', { nom: 'Autre', prenom: 'Personne', email: mail, role: 'CONTROLE_GESTION' }); check('e-mail déjà utilisé (409)', r.s === 409, r);
  r = await call(tok.adm, 'GET', '/utilisateurs'); const ligne = r.b.data.find((u) => u.id === nouveau.id);
  check('le compte figure dans la liste, sans secret', ligne && !('motDePasseProvisoire' in ligne) && !('mot_de_passe_hash' in ligne), ligne);

  // --- première connexion : changement de mot de passe obligatoire ---
  r = await login(mail, provisoire); check('connexion avec le mot de passe provisoire', r.s === 200 && r.b.accessToken, r);
  const t1 = r.b.accessToken;
  r = await call(t1, 'GET', '/auth/me'); check('profil accessible, changement exigé', r.s === 200 && r.b.mdpAChanger === true, r);
  r = await call(t1, 'GET', '/poles'); check('autres routes bloquées (403 PASSWORD_CHANGE_REQUIRED)', r.s === 403 && r.b.error.code === 'PASSWORD_CHANGE_REQUIRED', r);
  r = await call(t1, 'POST', '/auth/mot-de-passe', { actuel: provisoire, nouveau: 'court' }); check('mot de passe faible refusé (422)', r.s === 422, r);
  const MDP = 'Lagon-Bleu-Soleil-472!';
  r = await call(t1, 'POST', '/auth/mot-de-passe', { actuel: provisoire, nouveau: MDP }); check('mot de passe changé', r.s === 204, r);
  r = await call(t1, 'GET', '/poles'); check('accès rétabli après le changement', r.s === 200, r);
  r = await call(t1, 'GET', '/auth/me'); check('indicateur levé', r.b.mdpAChanger === false, r.b);
  r = await login(mail, provisoire); check('le mot de passe provisoire ne fonctionne plus (401)', r.s === 401, r);

  // --- changement de rôle ---
  r = await call(tok.resp, 'PATCH', `/utilisateurs/${nouveau.id}/role`, { role: 'CONTROLE_GESTION', motif: 'Tentative' }); check('responsable ne change pas de rôle (403)', r.s === 403, r);
  r = await call(tok.adm, 'PATCH', `/utilisateurs/${nouveau.id}/role`, { role: 'CONTROLE_GESTION' }); check('motif obligatoire (400)', r.s === 400, r);
  r = await call(tok.adm, 'PATCH', `/utilisateurs/${nouveau.id}/role`, { role: 'CONTROLE_GESTION', motif: 'ok' }); check('motif trop court (400)', r.s === 400, r);
  r = await call(tok.adm, 'PATCH', `/utilisateurs/${nouveau.id}/role`, { role: 'RESPONSABLE_POLE', motif: 'Même rôle demandé' }); check('même rôle (409)', r.s === 409, r);
  r = await call(tok.adm, 'PATCH', '/utilisateurs/11111111-1111-4111-8111-111111111111/role', { role: 'CONTROLE_GESTION', motif: 'Compte inconnu' }); check('compte inconnu (404)', r.s === 404, r);
  const moi = (await call(tok.adm, 'GET', '/auth/me')).b;
  r = await call(tok.adm, 'PATCH', `/utilisateurs/${moi.id}/role`, { role: 'CONTROLE_GESTION', motif: 'Je me rétrograde' }); check('on ne change pas son propre rôle (403)', r.s === 403, r);
  const resp = (await call(tok.adm, 'GET', '/utilisateurs?role=RESPONSABLE_POLE')).b.data.find((u) => u.email === 'responsable@tanjakai.local');
  r = await call(tok.adm, 'PATCH', `/utilisateurs/${resp.id}/role`, { role: 'CONTROLE_GESTION', motif: 'Responsable encore rattaché' });
  check('responsable rattaché à un pôle : changement refusé (409)', r.s === 409 && /rattaché/.test(r.b.error.message), r);

  r = await call(tok.adm, 'PATCH', `/utilisateurs/${nouveau.id}/role`, { role: 'CONTROLE_GESTION', motif: 'Affectation au contrôle de gestion' });
  check('rôle changé : ancien rôle et connexions terminées indiqués', r.s === 200 && r.b.role === 'CONTROLE_GESTION' && r.b.ancienRole === 'RESPONSABLE_POLE' && r.b.connexionsTerminees >= 1, r);
  r = await call(t1, 'GET', '/poles'); check('ancien jeton refusé immédiatement (401)', r.s === 401, r);
  r = await login(mail, MDP); const t2 = r.b.accessToken; check('reconnexion', r.s === 200 && t2, r);
  r = await call(t2, 'GET', '/auth/me'); check('nouveau rôle effectif', r.b.role === 'CONTROLE_GESTION', r.b);
  r = await call(t2, 'GET', '/seuils'); check('droits du contrôle de gestion', r.s === 200, r);
  r = await call(t2, 'POST', '/utilisateurs', { nom: 'Nope', prenom: 'Nope', email: email('n'), role: 'CONTROLE_GESTION' }); check('et pas ceux de l\'administrateur (403)', r.s === 403, r);

  // --- direction : second facteur exigé ---
  const mailDir = email('dir');
  r = await call(tok.adm, 'POST', '/utilisateurs', { nom: 'Andrianarivo', prenom: 'Lala', email: mailDir, role: 'DIRECTION_GENERALE' });
  check('direction : second facteur obligatoire dès la création', r.s === 201 && r.b.secondFacteurRequis === true, r);
  const idDir = r.b.id;
  r = await call(tok.adm, 'PATCH', `/utilisateurs/${idDir}/role`, { role: 'CONTROLE_GESTION', motif: 'Erreur de saisie du rôle' });
  check('direction -> contrôle de gestion : second facteur plus exigé', r.s === 200 && r.b.secondFacteurRequis === false, r);
  r = await call(tok.adm, 'PATCH', `/utilisateurs/${idDir}/role`, { role: 'ADMINISTRATEUR', motif: 'Nouvel administrateur' });
  check('contrôle de gestion -> administrateur : second facteur exigé', r.s === 200 && r.b.secondFacteurRequis === true, r);
  if (pool) {
    const { rows } = await pool.query('SELECT role, second_facteur_actif, totp_secret IS NULL AS sans_secret FROM utilisateur WHERE id = $1', [idDir]);
    check('base : rôle et second facteur cohérents (contrainte respectée)', rows[0].role === 'ADMINISTRATEUR' && rows[0].second_facteur_actif && rows[0].sans_secret, rows[0]);
    const a = await pool.query(`SELECT count(*)::int AS n FROM journal_audit WHERE entite = 'utilisateur' AND entite_id = $1 AND motif LIKE 'Changement de rôle%'`, [idDir]);
    check('journal d\'audit : 2 changements de rôle motivés', a.rows[0].n === 2, a.rows[0]);
    const h = await pool.query(`SELECT count(*)::int AS n FROM journal_audit WHERE entite = 'utilisateur' AND entite_id = $1 AND (nouvelle_valeur::text LIKE '%mot_de_passe_hash%' OR nouvelle_valeur::text LIKE '%$2a$%' OR nouvelle_valeur::text LIKE '%$2b$%')`, [idDir]);
    check('journal d\'audit : aucun hash de mot de passe', h.rows[0].n === 0, h.rows[0]);
  }
} finally {
  if (pool) { if (crees.length) await pool.query('UPDATE utilisateur SET actif = false WHERE email = ANY($1)', [crees]).catch(() => {}); await pool.end(); }
}
console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT EST OK');
console.log(pool ? `Comptes jetables désactivés : ${crees.length}` : 'Comptes jetables créés (non désactivés : DATABASE_URL absent) : e2e-comptes-…@tanjakai.local');
process.exit(fails ? 1 : 0);
