const db = require('../../config/db');

const run = (runner) => runner || db;

async function findByEmail(email) {
  const { rows } = await db.query(
    `SELECT id, nom, prenom, email, mot_de_passe_hash, role, actif,
            second_facteur_actif, totp_secret, totp_dernier_pas AS "totpDernierPas",
            tentatives_echec, verrouille_jusqua, mdp_a_changer
       FROM utilisateur WHERE email = $1`,
    [email],
  );
  return rows[0] || null;
}

async function findById(id, runner) {
  const { rows } = await run(runner).query(
    `SELECT id, nom, prenom, email, mot_de_passe_hash, role, actif, second_facteur_actif,
            totp_secret, totp_secret_attente, totp_dernier_pas AS "totpDernierPas",
            tentatives_echec, verrouille_jusqua, mdp_modifie_le AS "mdpModifieLe", mdp_a_changer
       FROM utilisateur WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

/** Profil public + état de sécurité (sans aucun secret). */
async function profil(id) {
  const { rows } = await db.query(
    `SELECT id, nom, prenom, email, role, actif,
            (totp_secret IS NOT NULL) AS "totpActif",
            (second_facteur_actif) AS "secondFacteurRequis",
            mdp_modifie_le AS "mdpModifieLe", mdp_a_changer AS "mdpAChanger"
       FROM utilisateur WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

/** Incrémente les échecs ; verrouille le compte au-delà du seuil. Retourne true si le compte vient d'être verrouillé. */
async function registerFailure(id, maxAttempts, lockMinutes) {
  const r = await db.query(
    `UPDATE utilisateur
        SET tentatives_echec = tentatives_echec + 1,
            verrouille_jusqua = CASE WHEN tentatives_echec + 1 >= $2
                                     THEN now() + make_interval(mins => $3::int)
                                     ELSE verrouille_jusqua END
      WHERE id = $1
  RETURNING (verrouille_jusqua IS NOT NULL AND verrouille_jusqua > now()) AS verrouille`,
    [id, maxAttempts, lockMinutes],
  );
  return !!(r && r.rows && r.rows[0] && r.rows[0].verrouille);
}

async function resetFailures(id) {
  await db.query(
    'UPDATE utilisateur SET tentatives_echec = 0, verrouille_jusqua = NULL WHERE id = $1 AND (tentatives_echec > 0 OR verrouille_jusqua IS NOT NULL)',
    [id],
  );
}

// --- Second facteur ---
async function enregistrerSecretEnAttente(runner, id, secretChiffre) {
  await run(runner).query('UPDATE utilisateur SET totp_secret_attente = $2 WHERE id = $1', [id, secretChiffre]);
}

async function activerTotp(runner, id, secretChiffre, pasTemps) {
  await run(runner).query(
    `UPDATE utilisateur SET totp_secret = $2, totp_secret_attente = NULL, totp_dernier_pas = $3, second_facteur_actif = true
      WHERE id = $1`, [id, secretChiffre, pasTemps]);
}

async function desactiverTotp(runner, id, garderObligatoire) {
  await run(runner).query(
    `UPDATE utilisateur SET totp_secret = NULL, totp_secret_attente = NULL, totp_dernier_pas = NULL,
            second_facteur_actif = $2 WHERE id = $1`, [id, garderObligatoire]);
  await run(runner).query('DELETE FROM code_secours WHERE utilisateur_id = $1', [id]);
}

/** Mémorise le pas accepté ; atomique : retourne false si ce code (ou un plus récent) a déjà été consommé (anti-rejeu). */
async function memoriserPas(id, pasTemps) {
  const { rowCount } = await db.query(
    'UPDATE utilisateur SET totp_dernier_pas = $2 WHERE id = $1 AND (totp_dernier_pas IS NULL OR totp_dernier_pas < $2)',
    [id, pasTemps]);
  return rowCount === 1;
}

async function remplacerCodesSecours(runner, id, empreintes) {
  await run(runner).query('DELETE FROM code_secours WHERE utilisateur_id = $1', [id]);
  for (const h of empreintes) {
    await run(runner).query('INSERT INTO code_secours (utilisateur_id, code_hash) VALUES ($1,$2)', [id, h]);
  }
}

/** Consomme un code de secours (usage unique). Retourne true s'il était valide. */
async function consommerCodeSecours(id, empreinte) {
  const { rowCount } = await db.query(
    'UPDATE code_secours SET utilise_le = now() WHERE utilisateur_id = $1 AND code_hash = $2 AND utilise_le IS NULL',
    [id, empreinte]);
  return rowCount === 1;
}

async function codesSecoursRestants(id) {
  const { rows } = await db.query('SELECT count(*)::int AS n FROM code_secours WHERE utilisateur_id = $1 AND utilise_le IS NULL', [id]);
  return rows[0].n;
}

async function changerMotDePasse(runner, id, hash) {
  await run(runner).query('UPDATE utilisateur SET mot_de_passe_hash = $2, mdp_modifie_le = now(), mdp_a_changer = false WHERE id = $1', [id, hash]);
}

// --- Sessions ---
async function creerSession(runner, { utilisateurId, famille, tokenHash, expireLe, ip, userAgent }) {
  const { rows } = await run(runner).query(
    `INSERT INTO session_utilisateur (utilisateur_id, famille, token_hash, expire_le, ip, user_agent)
     VALUES ($1, COALESCE($2::uuid, gen_random_uuid()), $3, $4, $5, $6) RETURNING id, famille`,
    [utilisateurId, famille || null, tokenHash, expireLe, ip, userAgent]);
  return rows[0];
}

async function sessionParEmpreinte(client, tokenHash) {
  const { rows } = await client.query(
    `SELECT id, utilisateur_id AS "utilisateurId", famille, expire_le AS "expireLe",
            derniere_activite AS "derniereActivite", revoque_le AS "revoqueLe", motif_revocation AS "motif",
            (now() - derniere_activite) AS inactivite
       FROM session_utilisateur WHERE token_hash = $1 FOR UPDATE`, [tokenHash]);
  return rows[0] || null;
}

async function revoquerSession(runner, id, motif, remplacePar) {
  await run(runner).query(
    `UPDATE session_utilisateur SET revoque_le = now(), motif_revocation = $2, remplace_par = $3
      WHERE id = $1 AND revoque_le IS NULL`, [id, motif, remplacePar || null]);
}

/** Session (ligne) actuellement active d'une famille de jetons : celle que porte la connexion en cours. */
async function sessionActiveDeFamille(famille) {
  const { rows } = await db.query(
    `SELECT id, utilisateur_id AS "utilisateurId", derniere_activite AS "derniereActivite",
            (now() - derniere_activite) > interval '60 seconds' AS "aToucher",
            (now() - derniere_activite) > make_interval(mins => $2::int) AS inactive,
            (SELECT mdp_a_changer FROM utilisateur u WHERE u.id = utilisateur_id) AS "mdpAChanger"
       FROM session_utilisateur
      WHERE famille = $1 AND revoque_le IS NULL AND expire_le > now()
      ORDER BY cree_le DESC LIMIT 1`, [famille, require('../../config/env').SESSION_IDLE_MINUTES]);
  return rows[0] || null;
}

async function toucherSession(id) {
  await db.query('UPDATE session_utilisateur SET derniere_activite = now() WHERE id = $1 AND revoque_le IS NULL', [id]);
}

async function revoquerFamille(runner, famille, motif) {
  await run(runner).query(
    'UPDATE session_utilisateur SET revoque_le = now(), motif_revocation = $2 WHERE famille = $1 AND revoque_le IS NULL', [famille, motif]);
}

/** Révoque toutes les sessions actives d'un utilisateur (sauf `sauf`, id de la session courante). */
async function revoquerSessionsUtilisateur(runner, utilisateurId, motif, sauf) {
  const r = await run(runner).query(
    `UPDATE session_utilisateur SET revoque_le = now(), motif_revocation = $2
      WHERE utilisateur_id = $1 AND revoque_le IS NULL AND ($3::uuid IS NULL OR id <> $3)`,
    [utilisateurId, motif, sauf || null]);
  return r.rowCount;
}

async function sessionsActives(utilisateurId) {
  const { rows } = await db.query(
    `SELECT id, famille, cree_le AS "creeLe", derniere_activite AS "derniereActivite", expire_le AS "expireLe", ip, user_agent AS "userAgent"
       FROM session_utilisateur WHERE utilisateur_id = $1 AND revoque_le IS NULL AND expire_le > now()
      ORDER BY derniere_activite DESC`, [utilisateurId]);
  return rows;
}

// --- Journal des connexions ---
async function journaliser({ utilisateurId = null, email = null, evenement, ip = null, userAgent = null, detail = null }) {
  try {
    await db.query(
      'INSERT INTO journal_connexion (utilisateur_id, email, evenement, ip, user_agent, detail) VALUES ($1,$2,$3,$4,$5,$6)',
      [utilisateurId, email ? String(email).slice(0, 254) : null, evenement, ip, userAgent ? String(userAgent).slice(0, 300) : null, detail]);
  } catch (err) {
    // le journal ne doit jamais empêcher une connexion légitime, mais l'échec est visible dans les logs serveur
    console.error(JSON.stringify({ level: 'error', msg: 'journal_connexion', error: err.message }));
  }
}

async function lireJournal({ utilisateurId, email, evenement, depuis, jusqua }, offset, limit) {
  const where = []; const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (utilisateurId) add('j.utilisateur_id = ?', utilisateurId);
  if (email) add('(j.email ILIKE ? OR u.email ILIKE ?)'.replace(/\?/g, `$${params.length + 1}`), `%${email}%`);
  if (evenement) add('j.evenement = ?', evenement);
  if (depuis) add('j.date >= ?::date', depuis);
  if (jusqua) add("j.date < (?::date + 1)", jusqua);
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await db.query(`SELECT count(*)::int AS n FROM journal_connexion j LEFT JOIN utilisateur u ON u.id = j.utilisateur_id ${w}`, params);
  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT j.id, j.date, j.evenement, j.detail, j.ip, j.user_agent AS "userAgent",
            COALESCE(u.email, j.email) AS email, u.nom, u.prenom, j.utilisateur_id AS "utilisateurId"
       FROM journal_connexion j LEFT JOIN utilisateur u ON u.id = j.utilisateur_id ${w}
      ORDER BY j.date DESC, j.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return { rows, total: total.rows[0].n };
}

// --- Administration des comptes ---
async function comptes() {
  const { rows } = await db.query(
    `SELECT u.id, u.nom, u.prenom, u.email, u.role, u.actif,
            (u.totp_secret IS NOT NULL) AS "totpActif", u.second_facteur_actif AS "secondFacteurRequis",
            u.tentatives_echec AS "tentativesEchec",
            (u.verrouille_jusqua IS NOT NULL AND u.verrouille_jusqua > now()) AS verrouille,
            u.verrouille_jusqua AS "verrouilleJusqua",
            (SELECT max(j.date) FROM journal_connexion j WHERE j.utilisateur_id = u.id AND j.evenement = 'CONNEXION_REUSSIE') AS "derniereConnexion",
            (SELECT count(*)::int FROM session_utilisateur s WHERE s.utilisateur_id = u.id AND s.revoque_le IS NULL AND s.expire_le > now()) AS "sessionsActives",
            COALESCE((SELECT array_agg(p.code ORDER BY p.code) FROM pole p WHERE p.responsable_id = u.id), '{}') AS poles
       FROM utilisateur u ORDER BY u.nom, u.prenom`);
  return rows;
}

async function deverrouiller(runner, id) {
  await run(runner).query('UPDATE utilisateur SET tentatives_echec = 0, verrouille_jusqua = NULL WHERE id = $1', [id]);
}

module.exports = {
  findByEmail, findById, profil, registerFailure, resetFailures,
  enregistrerSecretEnAttente, activerTotp, desactiverTotp, memoriserPas, remplacerCodesSecours,
  consommerCodeSecours, codesSecoursRestants, changerMotDePasse,
  creerSession, sessionParEmpreinte, sessionActiveDeFamille, toucherSession, revoquerSession, revoquerFamille, revoquerSessionsUtilisateur, sessionsActives,
  journaliser, lireJournal, comptes, deverrouiller,
};
