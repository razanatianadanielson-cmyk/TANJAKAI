const db = require('../../config/db');
const repo = require('./campagnes.repository');
const { notFound, conflict, badRequest } = require('../../utils/httpError');

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

/** Corrige la date limite de saisie d'une campagne encore ouverte (motif obligatoire, tracé). */
async function modifierDateLimite(user, id, { dateLimite, motif }) {
  await db.withTransaction({ userId: user.id, motif: `Date limite modifiée : ${motif}` }, async (client) => {
    const campagne = await repo.verrouiller(client, id);
    if (!campagne) throw notFound('Campagne introuvable');
    if (campagne.statut !== 'OUVERTE') throw conflict('Seule une campagne ouverte peut voir sa date limite modifiée');
    const ouverture = await client.query('SELECT date_ouverture::text AS d FROM campagne WHERE id = $1', [id]);
    if (dateLimite < ouverture.rows[0].d) throw badRequest(`La date limite ne peut pas précéder la date d'ouverture (${ouverture.rows[0].d})`);
    await repo.majDateLimite(client, id, dateLimite);
  });
  return trouver(id);
}

/**
 * Annule une campagne ouverte par erreur. Refusée dès qu'une saisie, un score ou une synthèse existe :
 * l'historique ne s'efface pas. Le périmètre et les cibles gelés repartent avec elle ; les cibles elles-mêmes restent.
 */
async function supprimer(user, id, { motif }) {
  return db.withTransaction({ userId: user.id, motif: `Annulation de campagne : ${motif}` }, async (client) => {
    const campagne = await repo.verrouiller(client, id);
    if (!campagne) throw notFound('Campagne introuvable');
    const u = await repo.usage(client, id);
    const emplois = [[u.saisies, 'saisie(s)'], [u.scores, 'score(s)'], [u.syntheses, 'synthèse(s)']].filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}`);
    if (emplois.length) throw conflict(`Cette campagne a déjà servi (${emplois.join(', ')}) : elle ne peut pas être annulée.`);
    await repo.supprimer(client, id);
    return { supprime: true, exercice: campagne.exercice, trimestre: campagne.trimestre };
  });
}

module.exports = { modifierDateLimite, supprimer, ouvrir, trouver, rouvrir };
