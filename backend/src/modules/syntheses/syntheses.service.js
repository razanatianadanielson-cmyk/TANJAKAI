const db = require('../../config/db');
const env = require('../../config/env');
const repo = require('./syntheses.repository');
const donnees = require('./syntheses.donnees');
const prompt = require('./syntheses.prompt');
const openrouter = require('./openrouter.client');
const { toOffset, paginated } = require('../../utils/pagination');
const { notFound, conflict, forbidden, HttpError } = require('../../utils/httpError');

const MENTION_BROUILLON = 'Synthèse générée automatiquement — en attente de relecture par le contrôle de gestion. Ne pas diffuser.';

function enrichir(s, user) {
  if (!s) return s;
  const mention = s.statut === 'VALIDEE'
    ? `Synthèse générée automatiquement, relue et validée par le contrôle de gestion le ${new Date(s.dateValidation).toISOString().slice(0, 10)}.`
    : MENTION_BROUILLON;
  const sortie = { ...s, mention, modifiee: s.contenu !== s.contenuOrigine, cout: Number(s.cout) };
  if (user.role !== 'CONTROLE_GESTION') { delete sortie.contenuOrigine; delete sortie.motifDegrade; delete sortie.cout; delete sortie.modele; }
  delete sortie.responsableId;
  return sortie;
}

/** Lecture : le contrôle de gestion voit tout ; la direction et les responsables ne voient que les synthèses VALIDÉES. */
function portee(user) {
  if (user.role === 'CONTROLE_GESTION') return {};
  if (user.role === 'DIRECTION_GENERALE') return { seulementValidees: true };
  if (user.role === 'RESPONSABLE_POLE') return { seulementValidees: true, responsableId: user.id };
  throw forbidden();
}

async function lister(user, q) {
  const { rows, total } = await repo.lister({ ...portee(user), campagneId: q.campagneId, poleId: q.poleId, statut: q.statut, type: q.type,
    limit: q.limit, offset: toOffset(q) });
  return paginated(rows.map((r) => enrichir(r, user)), q, total);
}

async function detail(user, id) {
  const s = await repo.trouver(id);
  const p = portee(user);
  const visible = s && (!p.seulementValidees || s.statut === 'VALIDEE')
    && (!p.responsableId || (s.type === 'POLE' && s.responsableId === p.responsableId));
  if (!visible) throw notFound('Synthèse introuvable');
  return enrichir(s, user);
}

/** Dépense restante avant le plafond mensuel (dollars). */
async function budget() {
  const { consomme, appels } = await repo.coutDuMois();
  return { plafond: env.OPENROUTER_PLAFOND_MENSUEL, consomme, restant: Math.max(0, env.OPENROUTER_PLAFOND_MENSUEL - consomme), appels };
}

async function cout() {
  const b = await budget();
  return { ...b, mois: new Date().toISOString().slice(0, 7), modele: env.OPENROUTER_MODEL,
    configure: Boolean(env.OPENROUTER_API_KEY), derniersAppels: await repo.derniersAppels(20) };
}

async function chargerFaits(campagne, type, poleId) {
  const lignes = await repo.lignesScores(campagne.id, poleId);
  const poles = donnees.regrouper(lignes);
  if (!poles.length) throw conflict(type === 'POLE' ? 'Aucun score calculé pour ce pôle dans cette campagne' : 'Aucun score calculé pour cette campagne');
  const precId = await repo.campagnePrecedenteCloturee(campagne.exercice, campagne.trimestre);
  const precedents = precId ? donnees.regrouper(await repo.lignesScores(precId, poleId)) : [];
  const seuil = env.SYNTHESE_SEUIL_EVOLUTION;
  if (type === 'POLE') return donnees.faitsPole({ campagne, pole: poles[0], precedent: precedents[0] || null, seuil });
  return donnees.faitsComparative({ campagne, poles, precedents, seuil });
}

/** Tente la rédaction assistée ; en cas d'impossibilité, renvoie le motif (mode dégradé : chiffres sans commentaire). */
async function rediger(faits) {
  if (!env.OPENROUTER_API_KEY) return { degrade: 'Service d\'assistance non configuré' };
  const b = await budget();
  if (b.restant <= 0) return { degrade: `Plafond de dépense mensuel atteint (${b.plafond} $)` };
  try {
    return { reponse: await openrouter.completer(prompt.messages(faits)) };
  } catch (err) {
    if (err instanceof openrouter.AssistanceIndisponible) return { degrade: err.raison };
    throw err;
  }
}

/**
 * Génère (ou régénère tant qu'elle est en brouillon) la synthèse d'un pôle ou la synthèse comparative d'une campagne CLÔTURÉE.
 * Le résultat est toujours un BROUILLON : aucune diffusion sans relecture et validation du contrôle de gestion.
 */
async function generer(user, { campagneId, poleId }) {
  const type = poleId ? 'POLE' : 'COMPARATIVE';
  const campagne = await repo.campagne(campagneId);
  if (!campagne) throw notFound('Campagne introuvable');
  if (campagne.statut !== 'CLOTUREE') throw conflict('La synthèse s\'appuie sur des scores figés : la campagne doit être clôturée');
  const deja = await db.withTransaction({}, (client) => repo.existante(client, campagneId, type, poleId || null));
  if (deja && deja.statut === 'VALIDEE') throw conflict('Une synthèse validée existe déjà pour cette campagne : elle n\'est plus modifiable');

  const faits = await chargerFaits(campagne, type, poleId || null);
  const { reponse, degrade } = await rediger(faits);

  const id = await db.withTransaction({ userId: user.id, motif: 'Génération d\'une synthèse trimestrielle' }, async (client) => {
    const d = { campagneId, poleId: poleId || null, type, userId: user.id, donnees: faits,
      contenu: reponse ? reponse.contenu : null, mode: reponse ? 'ASSISTE' : 'DEGRADE', motifDegrade: degrade || null,
      modele: reponse ? reponse.modele : null };
    const existante = await repo.existante(client, campagneId, type, poleId || null);
    if (existante && existante.statut === 'VALIDEE') throw conflict('Une synthèse validée existe déjà');
    let syntheseId;
    if (existante) { await repo.regenerer(client, existante.id, d); syntheseId = existante.id; } else syntheseId = await repo.inserer(client, d);
    if (reponse) await repo.journaliserCout(client, syntheseId, reponse);
    return syntheseId;
  });
  return enrichir(await repo.trouver(id), user);
}

async function modifier(user, id, { contenu }) {
  await db.withTransaction({ userId: user.id, motif: 'Relecture d\'une synthèse' }, async (client) => {
    const s = await repo.trouver(id, client);
    if (!s) throw notFound('Synthèse introuvable');
    if (s.statut === 'VALIDEE') throw conflict('Synthèse validée : modification impossible');
    await repo.modifierContenu(client, id, contenu, user.id);
  });
  return enrichir(await repo.trouver(id), user);
}

/** Validation = relecture faite par le contrôle de gestion ; seule action qui rend la synthèse visible de la direction et du pôle. */
async function valider(user, id) {
  await db.withTransaction({ userId: user.id, motif: 'Validation d\'une synthèse après relecture' }, async (client) => {
    const s = await repo.trouver(id, client);
    if (!s) throw notFound('Synthèse introuvable');
    if (s.statut === 'VALIDEE') throw conflict('Synthèse déjà validée');
    if (s.mode === 'ASSISTE' && !(s.contenu && s.contenu.trim())) throw new HttpError(422, 'SYNTHESE_VIDE', 'Le commentaire ne peut pas être vide');
    await repo.valider(client, id, user.id);
    const libelle = s.type === 'POLE' ? `du pôle ${s.poleCode}` : 'comparative';
    await repo.notifier(client, s.campagneId, await repo.destinataires(client, { poleId: s.poleId }),
      `Synthèse ${libelle} validée pour T${s.trimestre} ${s.exercice}.`);
  });
  return enrichir(await repo.trouver(id), user);
}

module.exports = { lister, detail, generer, modifier, valider, cout, budget, chargerFaits };
