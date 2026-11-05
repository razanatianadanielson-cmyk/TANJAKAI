const db = require('../../config/db');
const repo = require('./campagnes.repository');
const { notFound, conflict } = require('../../utils/httpError');

/**
 * Ouverture : fn_ouvrir_campagne crée la campagne et gèle grille, périmètre et cibles.
 * Les responsables de pôle concernés sont notifiés dans la même transaction.
 */
async function ouvrir(user, data) {
  const { id, avertissements } = await db.withTransaction({ userId: user.id, motif: 'Ouverture de campagne' }, async (client) => {
    const campagneId = await repo.ouvrir(client, data, user.id);
    const campagne = await repo.verrouiller(client, campagneId);
    const sansCible = await repo.sansCible(client, campagneId, campagne.grilleId, data.exercice);
    const destinataires = await repo.destinataires(client, campagneId);
    await repo.notifier(client, campagneId, destinataires,
      `Campagne T${data.trimestre} ${data.exercice} ouverte : saisie des indicateurs avant le ${data.dateLimite}.`);
    return { id: campagneId, avertissements: sansCible };
  });
  const campagne = await repo.trouver(id);
  return { ...campagne, avertissements: avertissements.map((a) => ({ code: 'CIBLE_MANQUANTE', ...a })) };
}

async function trouver(id) {
  const campagne = await repo.trouver(id);
  if (!campagne) throw notFound('Campagne introuvable');
  return { ...campagne, reouvertures: await repo.reouvertures(id) };
}

/** Réouverture d'une campagne clôturée : motif obligatoire, tracé (table reouverture + audit) et notifié. */
async function rouvrir(user, id, { motif }) {
  await db.withTransaction({ userId: user.id, motif }, async (client) => {
    const campagne = await repo.verrouiller(client, id);
    if (!campagne) throw notFound('Campagne introuvable');
    if (campagne.statut !== 'CLOTUREE') throw conflict('Seule une campagne clôturée peut être rouverte');
    await repo.enregistrerReouverture(client, id, motif, user.id);
    const destinataires = await repo.destinataires(client, id);
    await repo.notifier(client, id, destinataires,
      `Campagne T${campagne.trimestre} ${campagne.exercice} rouverte. Motif : ${motif}`);
  });
  return trouver(id);
}

module.exports = { ouvrir, trouver, rouvrir };
