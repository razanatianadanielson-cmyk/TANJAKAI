const db = require('../../config/db');
const repo = require('./alertes.repository');
const { toOffset, paginated } = require('../../utils/pagination');
const { notFound, forbidden, conflict, badRequest } = require('../../utils/httpError');

const estResponsable = (user) => user.role === 'RESPONSABLE_POLE';

/** Un responsable ne voit et ne traite que les alertes de son pôle. */
function verifierAcces(user, alerte) {
  if (estResponsable(user) && alerte.responsableId !== user.id) throw forbidden('Cette alerte concerne un autre pôle');
}

async function lister(user, q) {
  const statuts = q.statut ? [q.statut] : (q.actives ? ['ACTIVE', 'ACCUSEE'] : undefined);
  const { rows, total } = await repo.lister(
    { statuts, type: q.type, poleId: q.poleId, exercice: q.exercice, trimestre: q.trimestre,
      responsableId: estResponsable(user) ? user.id : undefined },
    toOffset(q), q.limit);
  return paginated(rows, q, total);
}

async function detail(user, id) {
  const alerte = await repo.trouver(null, id);
  if (!alerte) throw notFound('Alerte introuvable');
  verifierAcces(user, alerte);
  return { ...alerte, plans: await repo.plans(null, id) };
}

const aujourdhui = () => new Date().toISOString().slice(0, 10);

function verifierEcheances(plans) {
  const t = aujourdhui();
  const passees = plans.filter((p) => p.echeance < t);
  if (passees.length) throw badRequest('Une échéance ne peut pas être dans le passé', passees.map((p) => ({ echeance: p.echeance })));
}

/** Accusé de prise en compte par le responsable du pôle, obligatoirement accompagné d'un plan d'action daté. */
async function accuser(user, id, { plans }) {
  verifierEcheances(plans);
  await db.withTransaction({ userId: user.id, motif: "Accusé de prise en compte d'une alerte" }, async (client) => {
    const alerte = await repo.verrouiller(client, id);
    if (!alerte) throw notFound('Alerte introuvable');
    if (alerte.responsableId !== user.id) throw forbidden("Seul le responsable du pôle accuse une alerte de son pôle");
    if (alerte.statut !== 'ACTIVE') throw conflict('Cette alerte a déjà été prise en compte');
    for (const p of plans) await repo.ajouterPlan(client, id, p);
    await repo.accuser(client, id, user.id);
    const cg = await repo.utilisateursParRole(client, 'CONTROLE_GESTION');
    await repo.notifier(client, id, cg, `Pôle ${alerte.poleCode} : alerte prise en compte, ${plans.length} action(s) planifiée(s).`);
  });
  return detail(user, id);
}

async function ajouterPlan(user, id, plan) {
  verifierEcheances([plan]);
  await db.withTransaction({ userId: user.id, motif: "Ajout d'une action au plan" }, async (client) => {
    const alerte = await repo.verrouiller(client, id);
    if (!alerte) throw notFound('Alerte introuvable');
    verifierAcces(user, alerte);
    if (alerte.statut === 'ACTIVE') throw conflict("Accusez d'abord réception de l'alerte avec un plan d'action");
    if (alerte.statut === 'CLOTUREE') throw conflict('Alerte clôturée : plan non modifiable');
    await repo.ajouterPlan(client, id, plan);
  });
  return detail(user, id);
}

async function majPlan(user, id, planId, { statut }) {
  await db.withTransaction({ userId: user.id, motif: "Suivi d'une action du plan" }, async (client) => {
    const alerte = await repo.verrouiller(client, id);
    if (!alerte) throw notFound('Alerte introuvable');
    verifierAcces(user, alerte);
    if (alerte.statut === 'CLOTUREE') throw conflict('Alerte clôturée : plan non modifiable');
    const plan = await repo.majPlan(client, id, planId, statut);
    if (!plan) throw notFound("Action introuvable pour cette alerte");
  });
  return detail(user, id);
}

/** Clôture par le contrôle de gestion, après prise en compte par le responsable. */
async function cloturer(user, id) {
  await db.withTransaction({ userId: user.id, motif: "Clôture d'une alerte" }, async (client) => {
    const alerte = await repo.verrouiller(client, id);
    if (!alerte) throw notFound('Alerte introuvable');
    if (alerte.statut === 'CLOTUREE') throw conflict('Alerte déjà clôturée');
    if (alerte.statut === 'ACTIVE') throw conflict("L'alerte n'a pas encore été prise en compte par le responsable");
    await repo.cloturer(client, id);
    if (alerte.responsableId) await repo.notifier(client, id, [alerte.responsableId], `Pôle ${alerte.poleCode} : alerte clôturée par le contrôle de gestion.`);
  });
  return detail(user, id);
}

const seuils = () => repo.seuils();

async function creerSeuil(user, data) {
  return db.withTransaction({ userId: user.id, motif: 'Paramétrage du seuil critique' }, (client) => repo.creerSeuil(client, data));
}

module.exports = { lister, detail, accuser, ajouterPlan, majPlan, cloturer, seuils, creerSeuil };
