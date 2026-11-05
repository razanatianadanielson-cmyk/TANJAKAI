const db = require('../../config/db');

const COLUMNS = 'f.id, f.libelle, f.description';

async function list() {
  const { rows } = await db.query(
    `SELECT ${COLUMNS}, count(p.id)::int AS "nombrePoles"
       FROM famille_activite f LEFT JOIN pole p ON p.famille_id = f.id
      GROUP BY f.id ORDER BY f.libelle`,
  );
  return rows;
}

async function insert(client, { libelle, description }) {
  const { rows } = await client.query(
    'INSERT INTO famille_activite (libelle, description) VALUES ($1, $2) RETURNING id, libelle, description',
    [libelle, description || null],
  );
  return rows[0];
}

module.exports = { list, insert };
