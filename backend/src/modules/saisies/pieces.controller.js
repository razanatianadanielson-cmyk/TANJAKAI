const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const pool = require('../../db/pool');
const env = require('../../config/env');
const { HttpError } = require('../../utils/httpError');

async function verifierAccesSaisie(req, saisieId, { modification = true } = {}) {
  const result = await pool.query(
    `
    SELECT
      s.id,
      s.statut,
      s.pole_id,
      p.responsable_id
    FROM saisie s
    JOIN pole p ON p.id = s.pole_id
    WHERE s.id = $1
    `,
    [saisieId]
  );

  if (result.rowCount === 0) {
    throw new HttpError(404, 'NOT_FOUND', 'Saisie introuvable');
  }

  const saisie = result.rows[0];

  if (
    req.user.role === 'RESPONSABLE_POLE' &&
    saisie.responsable_id !== req.user.id
  ) {
    throw new HttpError(
      403,
      'POLE_FORBIDDEN',
      'Vous ne pouvez pas accéder à cette saisie'
    );
  }

  if (modification && ['SOUMISE', 'VALIDEE'].includes(saisie.statut)) {
    throw new HttpError(
      409,
      'PIECE_NOT_EDITABLE',
      'Les pièces justificatives ne peuvent plus être modifiées après soumission'
    );
  }

  return saisie;
}

async function upload(req, res) {
  if (!req.file) {
    throw new HttpError(
      422,
      'FILE_REQUIRED',
      'Une pièce justificative est obligatoire'
    );
  }

  const saisie = await verifierAccesSaisie(req, req.params.saisieId);

  const uploadDir = path.resolve(env.UPLOAD_DIR);

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const extension = path.extname(req.file.originalname);
  const nomStockage = `${crypto.randomUUID()}${extension}`;
  const chemin = path.join(uploadDir, nomStockage);

  fs.renameSync(req.file.path, chemin);

  const result = await pool.query(
    `
    INSERT INTO piece_justificative (
      saisie_id,
      nom_fichier,
      type_mime,
      chemin,
      taille_octets,
      depose_par,
      depose_le
    )
    VALUES ($1, $2, $3, $4, $5, $6, now())
    RETURNING *
    `,
    [
      saisie.id,
      req.file.originalname,
      req.file.mimetype,
      chemin,
      req.file.size,
      req.user.id
    ]
  );

  const { chemin: _chemin, ...piece } = result.rows[0]; // le chemin serveur n'est jamais exposé
  res.status(201).json(piece);
}

async function list(req, res) {
  await verifierAccesSaisie(req, req.params.saisieId, { modification: false });

  const result = await pool.query(
    `
    SELECT
      id,
      saisie_id,
      nom_fichier,
      type_mime,
      taille_octets,
      depose_par,
      depose_le
    FROM piece_justificative
    WHERE saisie_id = $1
    ORDER BY depose_le DESC
    `,
    [req.params.saisieId]
  );

  res.json({
    data: result.rows,
    count: result.rowCount
  });
}

async function telecharger(req, res) {
  await verifierAccesSaisie(req, req.params.saisieId, { modification: false });

  const result = await pool.query(
    'SELECT nom_fichier, type_mime, chemin FROM piece_justificative WHERE id = $1 AND saisie_id = $2',
    [req.params.pieceId, req.params.saisieId]
  );

  if (result.rowCount === 0 || !fs.existsSync(result.rows[0].chemin)) {
    throw new HttpError(404, 'NOT_FOUND', 'Pièce introuvable');
  }

  const piece = result.rows[0];
  res.setHeader('Content-Type', piece.type_mime);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(piece.nom_fichier)}`);
  res.sendFile(path.resolve(piece.chemin));
}

module.exports = {
  upload,
  list,
  telecharger
};
