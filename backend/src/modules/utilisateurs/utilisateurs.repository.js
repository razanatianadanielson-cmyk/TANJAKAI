const db = require('../../config/db');

async function lister(role) {
  const { rows } = await db.query(
    `SELECT id, nom, prenom, email, role, actif FROM utilisateur
      WHERE ($1::role_utilisateur IS NULL OR role = $1) ORDER BY nom, prenom`, [role || null]);
  return rows;
}

async function trouverPourMiseAJour(client, id) {
  const { rows } = await client.query(
    'SELECT id, nom, prenom, email, role, actif, totp_secret IS NOT NULL AS "totpActif" FROM utilisateur WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] || null;
}

async function inserer(client, { nom, prenom, email, role, hash, secondFacteur }) {
  const { rows } = await client.query(
    `INSERT INTO utilisateur (nom, prenom, email, mot_de_passe_hash, role, second_facteur_actif, mdp_a_changer)
     VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id, nom, prenom, email, role, actif, mdp_a_changer AS "mdpAChanger"`,
    [nom, prenom, email, hash, role, secondFacteur]);
  return rows[0];
}

async function changerRole(client, id, role, secondFacteurRequis) {
  const { rows } = await client.query(
    `UPDATE utilisateur SET role = $2, second_facteur_actif = $3 WHERE id = $1
     RETURNING id, nom, prenom, email, role, actif`, [id, role, secondFacteurRequis]);
  return rows[0];
}

async function polesDuResponsable(client, id) {
  const { rows } = await client.query('SELECT code FROM pole WHERE responsable_id = $1 ORDER BY code', [id]);
  return rows.map((r) => r.code);
}

async function majActif(client, id, actif) {
  const { rows } = await client.query(
    `UPDATE utilisateur SET actif = $2, tentatives_echec = 0, verrouille_jusqua = NULL WHERE id = $1
     RETURNING id, nom, prenom, email, role, actif`, [id, actif]);
  return rows[0];
}

async function corriger(client, id, { nom, prenom, email }) {
  const { rows } = await client.query(
    `UPDATE utilisateur SET nom = COALESCE($2, nom), prenom = COALESCE($3, prenom), email = COALESCE($4, email) WHERE id = $1
     RETURNING id, nom, prenom, email, role, actif`, [id, nom ?? null, prenom ?? null, email ?? null]);
  return rows[0];
}

async function supprimer(client, id) {
  await client.query('DELETE FROM utilisateur WHERE id = $1', [id]);
}

module.exports = { corriger, supprimer, lister, trouverPourMiseAJour, inserer, changerRole, polesDuResponsable, majActif };
