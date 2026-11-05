// Scénario « sécurité » (base RÉELLE) : second facteur, jetons de rafraîchissement, déconnexion, verrouillage, journal.
// Il crée ses PROPRES comptes jetables (secu-…@tanjakai.local) : les comptes de test habituels ne sont pas touchés.
// Prérequis : base migrée, API démarrée AVEC DEV_SKIP_2FA=false et DATABASE_URL accessible à ce script.
// Usage : npm run test:e2e:securite
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const totp = require('../../src/modules/auth/totp');

const B = process.env.API_URL || 'http://localhost:4000/api/v1';
const MDP = 'Vélo-Bleu-Lune-742!';
let fails = 0;
const check = (name, cond, extra) => { if (!cond) { fails++; console.log('FAIL', name, extra ? JSON.stringify(extra).slice(0, 400) : ''); } else console.log('ok  ', name); };

async function call(token, method, path, body, headers = {}) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s: r.status, b: j };
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: '-c search_path=notation,public' });
const sql = (q, p) => pool.query(q, p).then((r) => r.rows);
const tag = Date.now().toString(36);
const hash = bcrypt.hashSync(MDP, 10);
const crees = [];
async function compte(role, mfa) {
  const email = `secu-${role.toLowerCase().slice(0, 4)}-${tag}${crees.length}@tanjakai.local`;
  await sql(`INSERT INTO utilisateur (nom, prenom, email, mot_de_passe_hash, role, second_facteur_actif) VALUES ('Secu','Test',$1,$2,$3,$4)`, [email, hash, role, mfa]);
  crees.push(email); return email;
}
const login = (email, password = MDP) => call(null, 'POST', '/auth/login', { email, password });
const codeActuel = (secret, delta = 0) => totp.codePour(secret, totp.pas(Date.now() / 1000) + delta);

try {
  // ---------- connexion simple ----------
  const rp = await compte('RESPONSABLE_POLE', false);
  let r = await login(rp);
  check('connexion sans second facteur : jetons d\'accès et de rafraîchissement', r.s === 200 && r.b.accessToken && r.b.refreshToken && r.b.inactiviteMinutes > 0, r);
  const rpTok = r.b.accessToken;
  r = await call(rpTok, 'GET', '/auth/me');
  check('profil sans aucun secret', r.s === 200 && r.b.email === rp && !('mot_de_passe_hash' in r.b) && !('totp_secret' in r.b) && r.b.totpActif === false, r.b);
  r = await login(rp, 'faux'); check('mauvais mot de passe -> 401', r.s === 401, r);

  // ---------- direction : enrôlement guidé puis connexions ----------
  const dg = await compte('DIRECTION_GENERALE', true);
  r = await login(dg);
  check('direction : second facteur exigé, aucun jeton d\'accès', r.s === 202 && r.b.requiresSecondFactor && r.b.enrollment === true && !r.b.accessToken, r);
  if (r.s === 200) { console.log('\nL\'API tourne avec DEV_SKIP_2FA=true : relancez-la avec DEV_SKIP_2FA=false pour ce test.'); process.exit(2); }
  let defi = r.b.challengeToken;
  r = await call(defi, 'GET', '/auth/me'); check('un jeton de défi ne donne accès à rien (401)', r.s === 401, r);
  r = await call(null, 'POST', '/auth/2fa/enrolement/confirmer', { challengeToken: defi, code: '123456' }); check('confirmation sans secret demandé -> 409', r.s === 409, r);
  r = await call(null, 'POST', '/auth/2fa/enrolement/demarrer', { challengeToken: defi });
  check('enrôlement : secret et URI otpauth', r.s === 200 && r.b.otpauthUri.startsWith('otpauth://totp/') && /^[A-Z2-7]{32}$/.test(r.b.secretBrut), r);
  const secret = r.b.secretBrut;
  const [stocke] = await sql('SELECT totp_secret, totp_secret_attente FROM utilisateur WHERE email = $1', [dg]);
  check('secret en attente chiffré au repos (jamais en clair)', stocke.totp_secret_attente.startsWith('v1:') && !stocke.totp_secret_attente.includes(secret) && stocke.totp_secret === null, stocke);
  r = await call(null, 'POST', '/auth/2fa/enrolement/confirmer', { challengeToken: defi, code: '000000' }); check('mauvais code d\'enrôlement -> 401', r.s === 401, r);
  r = await call(null, 'POST', '/auth/2fa/enrolement/confirmer', { challengeToken: defi, code: codeActuel(secret) });
  check('enrôlement confirmé : session ouverte + 8 codes de secours', r.s === 200 && r.b.accessToken && r.b.codesSecours.length === 8, r);
  const secours = r.b.codesSecours; let dgTok = r.b.accessToken;
  r = await call(dgTok, 'GET', '/auth/me'); check('profil : second facteur actif, 8 codes restants', r.b.totpActif === true && r.b.codesSecoursRestants === 8, r.b);

  r = await call(dgTok, 'POST', '/auth/logout'); check('déconnexion (204)', r.s === 204, r);
  r = await call(dgTok, 'GET', '/auth/me'); check('jeton d\'accès inutilisable après déconnexion (401)', r.s === 401 && r.b.error.code === 'SESSION_ENDED', r);

  r = await login(dg); check('2e connexion : plus d\'enrôlement demandé', r.s === 202 && r.b.enrollment === false, r);
  defi = r.b.challengeToken;
  r = await call(null, 'POST', '/auth/verify-2fa', { challengeToken: defi, code: codeActuel(secret) }); check('code déjà utilisé refusé (anti-rejeu)', r.s === 401, r);
  r = await call(null, 'POST', '/auth/verify-2fa', { challengeToken: defi, code: codeActuel(secret, 1) });
  check('code suivant accepté', r.s === 200 && r.b.accessToken && r.b.refreshToken, r);
  let rt = r.b.refreshToken; dgTok = r.b.accessToken;

  // ---------- rotation des jetons de rafraîchissement ----------
  r = await call(null, 'POST', '/auth/refresh', { refreshToken: rt });
  check('renouvellement : nouveaux jetons', r.s === 200 && r.b.refreshToken && r.b.refreshToken !== rt, r);
  const rt2 = r.b.refreshToken; const tok2 = r.b.accessToken;
  r = await call(dgTok, 'GET', '/auth/me'); check('l\'ancien jeton d\'accès reste valable (même connexion)', r.s === 200, r);
  r = await call(null, 'POST', '/auth/refresh', { refreshToken: rt });
  check('rejeu d\'un jeton déjà remplacé -> 401', r.s === 401, r);
  r = await call(null, 'POST', '/auth/refresh', { refreshToken: rt2 }); check('…et toute la connexion est révoquée (vol possible)', r.s === 401, r);
  r = await call(tok2, 'GET', '/auth/me'); check('…y compris le jeton d\'accès', r.s === 401 && r.b.error.code === 'SESSION_ENDED', r);
  r = await call(null, 'POST', '/auth/refresh', { refreshToken: 'x'.repeat(40) }); check('jeton inconnu -> 401', r.s === 401, r);

  // ---------- code de secours ----------
  r = await login(dg); defi = r.b.challengeToken;
  r = await call(null, 'POST', '/auth/verify-2fa', { challengeToken: defi, code: secours[0] }); check('code de secours accepté', r.s === 200, r);
  dgTok = r.b.accessToken;
  r = await call(dgTok, 'GET', '/auth/me'); check('7 codes de secours restants', r.b.codesSecoursRestants === 7, r.b);
  r = await login(dg); r = await call(null, 'POST', '/auth/verify-2fa', { challengeToken: r.b.challengeToken, code: secours[0] }); check('code de secours à usage unique (401)', r.s === 401, r);

  // ---------- rôle obligatoire ----------
  r = await call(dgTok, 'POST', '/auth/2fa/desactiver', { motDePasse: MDP, code: codeActuel(secret, 2) }); check('la direction ne peut pas désactiver son second facteur (403)', r.s === 403, r);

  // ---------- inactivité ----------
  r = await call(dgTok, 'GET', '/auth/me'); check('session active', r.s === 200, r);
  await sql(`UPDATE session_utilisateur SET derniere_activite = now() - interval '5 minutes' WHERE utilisateur_id = (SELECT id FROM utilisateur WHERE email = $1) AND revoque_le IS NULL`, [dg]);
  const lire = async () => (await sql(`SELECT derniere_activite FROM session_utilisateur WHERE utilisateur_id = (SELECT id FROM utilisateur WHERE email = $1) AND revoque_le IS NULL`, [dg]))[0].derniere_activite.getTime();
  const avant = await lire();
  r = await call(dgTok, 'GET', '/auth/me', null, { 'X-TJ-Passif': '1' });
  check('requête d\'arrière-plan : ne prolonge pas la session', r.s === 200 && (await lire()) === avant, r);
  r = await call(dgTok, 'GET', '/auth/me'); check('requête de l\'utilisateur : prolonge la session', r.s === 200 && (await lire()) > avant, r);
  await sql(`UPDATE session_utilisateur SET derniere_activite = now() - interval '3 hours' WHERE utilisateur_id = (SELECT id FROM utilisateur WHERE email = $1) AND revoque_le IS NULL`, [dg]);
  r = await call(dgTok, 'GET', '/auth/me'); check('inactivité dépassée : déconnexion automatique (401)', r.s === 401 && r.b.error.code === 'SESSION_EXPIRED', r);

  // ---------- verrouillage ----------
  const cible = await compte('RESPONSABLE_POLE', false);
  for (let i = 1; i <= 4; i++) { r = await login(cible, 'faux' + i); if (r.s !== 401) check('échec ' + i + ' -> 401', false, r); }
  r = await login(cible, 'faux5'); check('5e échec : compte verrouillé (423)', r.s === 423 && r.b.error.code === 'ACCOUNT_LOCKED', r);
  r = await login(cible); check('même le bon mot de passe est refusé pendant le verrouillage (423)', r.s === 423, r);

  // ---------- administration ----------
  const adm = await compte('ADMINISTRATEUR', true);
  r = await login(adm); defi = r.b.challengeToken;
  r = await call(null, 'POST', '/auth/2fa/enrolement/demarrer', { challengeToken: defi }); const secAdm = r.b.secretBrut;
  r = await call(null, 'POST', '/auth/2fa/enrolement/confirmer', { challengeToken: defi, code: codeActuel(secAdm) }); const admTok = r.b.accessToken;
  check('administrateur connecté (second facteur)', !!admTok, r);
  r = await call(rpTok, 'GET', '/auth/admin/comptes'); check('un responsable n\'accède pas aux comptes (403)', r.s === 403, r);
  r = await call(admTok, 'GET', '/auth/admin/comptes');
  const cc = r.b.data && r.b.data.find((c) => c.email === cible);
  check('liste des comptes : compte verrouillé visible, sans secret', r.s === 200 && cc && cc.verrouille === true && cc.tentativesEchec >= 5 && !('totp_secret' in cc), cc);
  const idCible = cc.id;
  r = await call(admTok, 'POST', `/auth/admin/comptes/${idCible}/deverrouiller`); check('déverrouillage par l\'administrateur', r.s === 200, r);
  r = await login(cible); check('le compte se reconnecte', r.s === 200, r);

  r = await call(admTok, 'GET', '/auth/admin/journal-connexions?evenement=COMPTE_VERROUILLE');
  check('journal : verrouillage consigné', r.s === 200 && r.b.data.some((e) => e.email === cible), r.b);
  r = await call(admTok, 'GET', `/auth/admin/journal-connexions?email=${encodeURIComponent(cible)}&limit=50`);
  const evts = (r.b.data || []).map((e) => e.evenement);
  check('journal : échecs, verrouillage, refus, déverrouillage, réussite', ['ECHEC_MOT_DE_PASSE', 'COMPTE_VERROUILLE', 'CONNEXION_REFUSEE_VERROUILLE', 'COMPTE_DEVERROUILLE', 'CONNEXION_REUSSIE'].every((e) => evts.includes(e)), evts);
  check('journal : ip et navigateur enregistrés', r.b.data.every((e) => e.ip), r.b.data[0]);
  r = await call(admTok, 'GET', '/auth/admin/journal-connexions?evenement=REJEU_JETON'); check('journal : rejeu de jeton consigné', r.b.data.length >= 1, r.b);
  r = await call(rpTok, 'GET', '/auth/journal'); check('chacun consulte son propre journal', r.s === 200 && r.b.data.every((e) => e.email === rp), r.b);
  let refus = false; try { await sql(`UPDATE journal_connexion SET evenement = 'X' WHERE id = (SELECT max(id) FROM journal_connexion)`); } catch { refus = true; }
  check('journal des connexions immuable (modification refusée par la base)', refus);
  const [dernier] = await sql(`SELECT count(*)::int AS n FROM journal_audit WHERE entite = 'utilisateur' AND (nouvelle_valeur::text LIKE '%totp_secret%' OR nouvelle_valeur::text LIKE '%mot_de_passe_hash%')`);
  check('journal d\'audit : aucun secret recopié (mot de passe, second facteur)', dernier.n === 0, dernier);

  // ---------- réinitialisation du second facteur par l'administrateur ----------
  r = await call(admTok, 'GET', '/auth/admin/comptes'); const idDg = r.b.data.find((c) => c.email === dg).id;
  r = await login(dg); r = await call(null, 'POST', '/auth/verify-2fa', { challengeToken: r.b.challengeToken, code: secours[1] }); // un code TOTP vient d'être consommé : on utilise un code de secours
  const dgTok3 = r.b.accessToken; check('direction reconnectée', !!dgTok3, r);
  r = await call(admTok, 'POST', `/auth/admin/comptes/${idDg}/reinitialiser-2fa`); check('réinitialisation du second facteur', r.s === 200, r);
  r = await call(dgTok3, 'GET', '/auth/me'); check('ses connexions sont révoquées (401)', r.s === 401, r);
  r = await login(dg); check('à la connexion suivante : nouvel enrôlement exigé', r.s === 202 && r.b.enrollment === true, r);

  // ---------- second facteur facultatif (autres rôles) + mot de passe ----------
  const cg = await compte('CONTROLE_GESTION', false);
  r = await login(cg); const cgTok = r.b.accessToken;
  r = await call(cgTok, 'POST', '/auth/2fa/setup'); const secCg = r.b.secretBrut; check('activation volontaire : secret fourni', r.s === 200 && !!secCg, r);
  r = await call(cgTok, 'POST', '/auth/2fa/activer', { code: '000000' }); check('mauvais code d\'activation -> 422', r.s === 422, r);
  r = await call(cgTok, 'POST', '/auth/2fa/activer', { code: codeActuel(secCg) }); check('second facteur activé + codes de secours', r.s === 200 && r.b.codesSecours.length === 8, r);
  r = await login(cg); check('le compte exige désormais le second facteur', r.s === 202 && r.b.enrollment === false, r);
  r = await call(cgTok, 'POST', '/auth/2fa/desactiver', { motDePasse: 'mauvais', code: codeActuel(secCg, 1) }); check('désactivation : mot de passe exigé (422)', r.s === 422, r);
  r = await call(cgTok, 'POST', '/auth/2fa/desactiver', { motDePasse: MDP, code: codeActuel(secCg, 1) }); check('désactivation autorisée pour ce rôle', r.s === 204, r);
  r = await login(cg); check('connexion directe de nouveau possible', r.s === 200, r);
  const cgTokB = r.b.accessToken;

  r = await login(cg); const autreSession = r.b.accessToken;
  r = await call(cgTokB, 'POST', '/auth/mot-de-passe', { actuel: MDP, nouveau: 'court' }); check('mot de passe faible refusé (422) avec les règles', r.s === 422 && r.b.error.code === 'WEAK_PASSWORD' && r.b.error.details.length > 0, r);
  r = await call(cgTokB, 'POST', '/auth/mot-de-passe', { actuel: 'mauvais', nouveau: 'Cèdre-Rouge-Pluie-518!' }); check('ancien mot de passe exigé (422)', r.s === 422, r);
  r = await call(cgTokB, 'GET', '/auth/sessions'); check('liste des connexions actives', r.s === 200 && r.b.data.length >= 2 && r.b.data.filter((x) => x.courante).length === 1, r.b);
  r = await call(cgTokB, 'POST', '/auth/mot-de-passe', { actuel: MDP, nouveau: 'Cèdre-Rouge-Pluie-518!' }); check('mot de passe modifié (204)', r.s === 204, r);
  r = await call(autreSession, 'GET', '/auth/me'); check('les autres connexions sont révoquées', r.s === 401, r);
  r = await call(cgTokB, 'GET', '/auth/me'); check('la connexion courante reste ouverte', r.s === 200, r);
  r = await login(cg); check('ancien mot de passe refusé', r.s === 401, r);
  r = await login(cg, 'Cèdre-Rouge-Pluie-518!'); check('nouveau mot de passe accepté', r.s === 200, r);
} finally {
  if (crees.length) await sql(`UPDATE utilisateur SET actif = false WHERE email = ANY($1)`, [crees]).catch(() => {});
  await pool.end();
}
console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT EST OK');
console.log('Comptes jetables désactivés :', crees.length);
process.exit(fails ? 1 : 0);
