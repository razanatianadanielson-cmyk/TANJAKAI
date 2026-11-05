const db = require('../../config/db');
const env = require('../../config/env');
const repo = require('./espace.repository');
const rules = require('./saisies.rules');
const { notFound, conflict, forbidden, HttpError } = require('../../utils/httpError');

const CAMPAGNE_OUVERTE = ['OUVERTE', 'ROUVERTE'];

const SORTIE = 'id, campagne_id, pole_id, critere_id, valeur_realisee, commentaire, motif_non_renseigne, statut, source';
const SORTIE_S = SORTIE.split(', ').map((c) => `s.${c}`).join(', ');

async function memoriser(client, cleId, cleIdempotence, saisieId) {
  await client.query('INSERT INTO idempotence_service (cle_service_id, cle_idempotence, saisie_id) VALUES ($1,$2,$3)',
    [cleId, cleIdempotence, saisieId]);
}

/**
 * Dépôt d'une valeur par un système client (clé de service). Mêmes règles que l'espace de saisie :
 * campagne ouverte, critère du périmètre gelé, contrôles de plausibilité, aucune valeur estimée.
 * La saisie reste en BROUILLON : le responsable du pôle la soumet, le contrôle de gestion la valide.
 * Idempotence : un renvoi avec la même Idempotency-Key renvoie la saisie déjà enregistrée (200) sans la modifier.
 */
async function deposer(cle, cleIdempotence, body) {
  const poleId = body.pole_id || cle.pole_id;
  if (poleId !== cle.pole_id) throw forbidden('Cette clé ne peut pas écrire pour ce pôle');

  return db.withTransaction({ motif: 'Dépôt de saisie par interface de programmation' }, async (client) => {
    const rejeu = await client.query(
      `SELECT ${SORTIE_S} FROM idempotence_service i JOIN saisie s ON s.id = i.saisie_id
        WHERE i.cle_service_id = $1 AND i.cle_idempotence = $2`, [cle.id, cleIdempotence]);
    if (rejeu.rows[0]) return { statut: 200, saisie: rejeu.rows[0], idempotent: true };

    const campagne = await repo.campagne(body.campagne_id, client);
    if (!campagne) throw notFound('Campagne introuvable');
    if (!CAMPAGNE_OUVERTE.includes(campagne.statut)) throw conflict('Campagne clôturée : saisie verrouillée');
    if (!(await repo.pole(body.campagne_id, poleId, client))) throw notFound('Pôle absent du périmètre de cette campagne');
    const critere = await repo.critereDuPerimetre(client, body.campagne_id, poleId, body.critere_id);
    if (!critere) throw notFound('Critère non applicable à ce pôle pour cette campagne');

    const d = {
      campagneId: body.campagne_id, poleId, critereId: body.critere_id,
      valeurRealisee: body.valeur_realisee ?? null,
      commentaire: body.commentaire?.trim() || null,
      motifNonRenseigne: body.motif_non_renseigne?.trim() || null,
    };
    const precedent = (await repo.lignes(d.campagneId, poleId, campagne.exercice, campagne.trimestre, client))
      .find((l) => l.critereId === d.critereId);
    const verdict = rules.evaluerSaisie({
      critere, valeur: d.valeurRealisee, motifNonRenseigne: d.motifNonRenseigne, commentaire: d.commentaire,
      valeurPrecedente: precedent ? precedent.valeurPrecedente : null, nbPieces: 0,
      uniteFournie: body.unite, seuilVariationDefaut: env.VARIATION_ANORMALE_PCT,
    }, rules.PHASE.BROUILLON);
    if (verdict.erreurs.length) {
      throw new HttpError(422, 'SAISIE_INVALIDE', verdict.erreurs.map((e) => e.message).join(' ; '), verdict.erreurs);
    }

    const existante = (await client.query(
      `SELECT id, statut, cle_service_id FROM saisie
        WHERE campagne_id = $1 AND pole_id = $2 AND critere_id = $3 FOR UPDATE`,
      [d.campagneId, poleId, d.critereId])).rows[0];

    if (existante) {
      // une saisie déjà présente n'est remplaçable que par la même clé, tant qu'elle n'est pas soumise
      if (existante.cle_service_id !== cle.id) throw conflict('Une saisie existe déjà pour ce critère (autre origine)');
      if (!rules.estEditable(existante.statut)) throw conflict('Saisie soumise ou validée : modification impossible');
      const { rows } = await client.query(
        `UPDATE saisie SET valeur_realisee = $2, commentaire = $3, motif_non_renseigne = $4
          WHERE id = $1 RETURNING ${SORTIE}`,
        [existante.id, d.valeurRealisee, d.commentaire, d.motifNonRenseigne]);
      await memoriser(client, cle.id, cleIdempotence, existante.id);
      return { statut: 200, saisie: rows[0], idempotent: false, avertissements: verdict.avertissements };
    }

    const { rows } = await client.query(
      `INSERT INTO saisie (campagne_id, pole_id, critere_id, valeur_realisee, commentaire, motif_non_renseigne,
                           statut, source, cle_idempotence, cle_service_id)
       VALUES ($1,$2,$3,$4,$5,$6,'BROUILLON','API',$7,$8) RETURNING ${SORTIE}`,
      [d.campagneId, poleId, d.critereId, d.valeurRealisee, d.commentaire, d.motifNonRenseigne, cleIdempotence, cle.id]);
    await memoriser(client, cle.id, cleIdempotence, rows[0].id);
    return { statut: 201, saisie: rows[0], idempotent: false, avertissements: verdict.avertissements };
  });
}

module.exports = { deposer };
