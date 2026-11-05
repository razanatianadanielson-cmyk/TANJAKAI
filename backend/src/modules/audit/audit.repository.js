const db = require('../../config/db');

function filtres({ entite, action, utilisateur, motif, depuis, jusqua }) {
  const where = []; const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace(/\?/g, `$${params.length}`)); };
  if (entite) add('a.entite = ?', entite);
  if (action) add('a.action = ?', action);
  if (utilisateur) add("(u.email ILIKE ? OR u.nom ILIKE ? OR u.prenom ILIKE ? OR (u.prenom || ' ' || u.nom) ILIKE ?)", `%${utilisateur}%`);
  if (motif) add('a.motif ILIKE ?', `%${motif}%`);
  if (depuis) add('a.date >= ?::date', depuis);
  if (jusqua) add('a.date < (?::date + 1)', jusqua);
  return { w: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const SELECT = `SELECT a.id, a.date, a.action, a.entite, a.entite_id AS "entiteId", a.motif, host(a.adresse_ip) AS ip,
       a.ancienne_valeur AS ancienne, a.nouvelle_valeur AS nouvelle,
       a.utilisateur_id AS "utilisateurId", u.email, u.nom, u.prenom
  FROM journal_audit a LEFT JOIN utilisateur u ON u.id = a.utilisateur_id`;

async function lister(f, limit, offset) {
  const { w, params } = filtres(f);
  const total = await db.query(`SELECT count(*)::int AS n FROM journal_audit a LEFT JOIN utilisateur u ON u.id = a.utilisateur_id ${w}`, params);
  const { rows } = await db.query(`${SELECT} ${w} ORDER BY a.date DESC, a.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
  return { rows, total: total.rows[0].n };
}

async function trouver(id) {
  const { rows } = await db.query(`${SELECT} WHERE a.id = $1`, [id]);
  return rows[0] || null;
}

async function entites() {
  const { rows } = await db.query('SELECT entite, count(*)::int AS n FROM journal_audit GROUP BY entite ORDER BY entite');
  return rows;
}

module.exports = { lister, trouver, entites };
