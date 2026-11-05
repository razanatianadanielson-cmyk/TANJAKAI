const crypto = require('crypto');
const db = require('../../config/db');
const repo = require('./cles-service.repository');
const { empreinteCle } = require('../../middlewares/serviceAuth');
const { toOffset, paginated } = require('../../utils/pagination');
const { notFound, conflict } = require('../../utils/httpError');

const PREFIXE = 'tjk_';

/** Clé de 256 bits aléatoires, préfixée pour être reconnaissable (et détectable par un outil de scan de secrets). */
function genererCle() {
  return PREFIXE + crypto.randomBytes(32).toString('base64url');
}

async function lister(q) {
  const { rows, total } = await repo.lister({ poleId: q.poleId, active: q.active, limit: q.limit, offset: toOffset(q) });
  return paginated(rows, q, total);
}

/** La clé en clair n'est renvoyée qu'ici, une seule fois : seule son empreinte SHA-256 est conservée. */
async function creer(user, { poleId, libelle }) {
  const cle = genererCle();
  const id = await db.withTransaction({ userId: user.id, motif: 'Création d\'une clé de service' }, async (client) => {
    const pole = await repo.pole(client, poleId);
    if (!pole) throw notFound('Pôle introuvable');
    if (pole.statut !== 'ACTIF') throw conflict('Le pôle n\'est pas actif : aucune clé ne peut lui être délivrée');
    return repo.inserer(client, { poleId, libelle, empreinte: empreinteCle(cle), prefixe: cle.slice(0, PREFIXE.length + 4) });
  });
  return { ...(await repo.trouver(null, id)), cle };
}

async function revoquer(user, id) {
  await db.withTransaction({ userId: user.id, motif: 'Révocation d\'une clé de service' }, async (client) => {
    const existante = await repo.trouver(client, id);
    if (!existante) throw notFound('Clé introuvable');
    if (!existante.active) throw conflict('Clé déjà révoquée');
    await repo.revoquer(client, id, user.id);
  });
  return repo.trouver(null, id);
}

module.exports = { lister, creer, revoquer, genererCle };
