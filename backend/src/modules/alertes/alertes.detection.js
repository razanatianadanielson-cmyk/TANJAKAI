const { decider } = require('./alertes.regles');
const repo = require('./alertes.repository');

/** Seuil en vigueur à une date donnée : le plus récent dont la date d'effet est atteinte. */
async function seuilEnVigueur(client, axeId, date) {
  const { rows } = await client.query(
    `SELECT id, valeur, ecart_degradation AS "ecartDegradation" FROM seuil_critique
      WHERE axe_id IS NOT DISTINCT FROM $1 AND date_effet <= $2 ORDER BY date_effet DESC LIMIT 1`, [axeId, date]);
  return rows[0] ? { ...rows[0], valeur: Number(rows[0].valeur) } : null;
}

async function seuilsAxes(client, date) {
  const { rows } = await client.query(
    `SELECT DISTINCT ON (axe_id) axe_id AS "axeId", id, valeur FROM seuil_critique
      WHERE axe_id IS NOT NULL AND date_effet <= $1 ORDER BY axe_id, date_effet DESC`, [date]);
  return new Map(rows.map((r) => [r.axeId, { id: r.id, valeur: Number(r.valeur) }]));
}

/**
 * Évalue les scores figés d'une campagne et crée les alertes correspondantes (idempotent).
 * Appelée dans la transaction de clôture : si l'évaluation échoue, la clôture est annulée.
 * Retourne la liste des alertes créées.
 */
async function evaluerCampagne(client, campagneId) {
  const { rows: [campagne] } = await client.query(
    'SELECT id, exercice, trimestre, date_ouverture::text AS "dateOuverture" FROM campagne WHERE id = $1', [campagneId]);
  if (!campagne) return [];
  const seuil = await seuilEnVigueur(client, null, campagne.dateOuverture);
  if (!seuil) return [];
  const parAxe = await seuilsAxes(client, campagne.dateOuverture);
  const rangPrecedent = campagne.exercice * 4 + campagne.trimestre - 1;

  const { rows: scores } = await client.query(
    `SELECT v.score_pole_id AS "scorePoleId", v.pole_id AS "poleId", v.pole_code AS "poleCode",
            v.score_consolide AS score, v.partiel, p.responsable_id AS "responsableId"
       FROM v_score_courant v JOIN pole p ON p.id = v.pole_id
      WHERE v.campagne_id = $1 AND v.fige`, [campagneId]);

  const [cg, dg] = await Promise.all([
    repo.utilisateursParRole(client, 'CONTROLE_GESTION'),
    repo.utilisateursParRole(client, 'DIRECTION_GENERALE'),
  ]);
  const creees = [];

  for (const s of scores) {
    // trimestre immédiatement précédent (consécutif) : dernier score figé de ce pôle
    const { rows: [prev] } = await client.query(
      `SELECT v.score_consolide AS score, c.date_ouverture::text AS "dateOuverture"
         FROM v_score_courant v JOIN campagne c ON c.id = v.campagne_id
        WHERE v.pole_id = $1 AND v.fige AND (v.exercice * 4 + v.trimestre) = $2`, [s.poleId, rangPrecedent]);
    let precedent = null;
    if (prev) {
      const seuilPrev = await seuilEnVigueur(client, null, prev.dateOuverture);
      const score = prev.score === null ? null : Number(prev.score);
      precedent = { score, sousSeuil: score !== null && seuilPrev !== null && score < seuilPrev.valeur };
    }
    const { rows: notes } = await client.query(
      `SELECT sa.axe_id AS "axeId", a.code, sa.note FROM score_axe sa JOIN axe a ON a.id = sa.axe_id
        WHERE sa.score_pole_id = $1`, [s.scorePoleId]);
    const axes = notes.map((n) => ({
      code: n.code, note: n.note === null ? null : Number(n.note), seuil: parAxe.get(n.axeId) || null,
    }));

    const decisions = decider({
      courant: { score: s.score === null ? null : Number(s.score), partiel: s.partiel }, seuil, precedent, axes,
    });

    for (const d of decisions) {
      // pas de doublon tant qu'une alerte du même type n'est pas clôturée pour ce pôle et cette campagne
      const { rowCount: existe } = await client.query(
        `SELECT 1 FROM alerte a JOIN score_pole sp ON sp.id = a.score_pole_id
          WHERE a.pole_id = $1 AND sp.campagne_id = $2 AND a.type = $3 AND a.statut <> 'CLOTUREE'`,
        [s.poleId, campagneId, d.type]);
      if (existe) continue;
      const { rows: [a] } = await client.query(
        `INSERT INTO alerte (type, pole_id, score_pole_id, seuil_id, message)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (score_pole_id, type) DO NOTHING RETURNING id`,
        [d.type, s.poleId, s.scorePoleId, d.seuilId, `Pôle ${s.poleCode} — T${campagne.trimestre} ${campagne.exercice}. ${d.message}`]);
      if (!a) continue;
      const destinataires = [...cg, ...(s.responsableId ? [s.responsableId] : []), ...(d.type === 'DIRECTION' ? dg : [])];
      await repo.notifier(client, a.id, destinataires, `Pôle ${s.poleCode} — ${d.message}`);
      creees.push({ id: a.id, type: d.type, poleCode: s.poleCode });
    }
  }
  return creees;
}

module.exports = { evaluerCampagne };
