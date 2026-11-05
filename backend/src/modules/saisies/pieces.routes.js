const router = require('express').Router({ mergeParams: true });
const multer = require('multer');
const fs = require('fs');

const controller = require('./pieces.controller');
const { authenticate, requireRole, ROLES } = require('../../middlewares/auth');
const asyncHandler = require('../../utils/asyncHandler');
const env = require('../../config/env');

const uploadDir = env.UPLOAD_DIR;

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: env.UPLOAD_MAX_MB * 1024 * 1024,
  },
});

router.use(authenticate);

router.get(
  '/',
  asyncHandler(controller.list)
);

router.post(
  '/',
  requireRole(ROLES.RESPONSABLE_POLE),
  upload.single('piece'),
  asyncHandler(controller.upload)
);

router.get(
  '/:pieceId/fichier',
  asyncHandler(controller.telecharger)
);

// Monté sous /saisies/:saisieId/pieces
module.exports = router;
