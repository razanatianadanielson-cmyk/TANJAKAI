const repo = require('./audit.repository');
const { toOffset, paginated } = require('../../utils/pagination');
const { notFound } = require('../../utils/httpError');

// Champs jamais renvoyés, même si une version antérieure du déclencheur les avait copiés
const SECRETS = ['mot_de_passe_hash', 'empreinte_cle', 'totp_secret', 'totp_secret_attente', 'totp_dernier_pas'];
const BRUIT = ['date_maj', 'updated_at'];

const propre = (o) => (o ? Object.fromEntries(Object.entries(o).filter(([k]) => !SECRETS.includes(k))) : null);
const court = (v) => {
  if (v === null || v === undefined) return null;
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
};

/** Résumé lisible : pour une modification, les seuls champs changés ; pour un ajout ou une suppression, les premiers champs renseignés. */
function resume(a) {
  const ancienne = propre(a.ancienne); const nouvelle = propre(a.nouvelle);
  if (a.action === 'UPDATE' && ancienne && nouvelle) {
    return Object.keys(nouvelle)
      .filter((k) => !BRUIT.includes(k) && JSON.stringify(ancienne[k]) !== JSON.stringify(nouvelle[k]))
      .map((champ) => ({ champ, avant: court(ancienne[champ]), apres: court(nouvelle[champ]) }));
  }
  const src = nouvelle || ancienne || {};
  return Object.entries(src).filter(([k, v]) => v !== null && k !== 'id').slice(0, 8)
    .map(([champ, v]) => ({ champ, avant: a.action === 'DELETE' ? court(v) : null, apres: a.action === 'DELETE' ? null : court(v) }));
}

const vue = (a, detail) => ({
  id: a.id, date: a.date, action: a.action, entite: a.entite, entiteId: a.entiteId, motif: a.motif, ip: a.ip,
  auteur: a.utilisateurId ? { id: a.utilisateurId, nom: `${a.prenom} ${a.nom}`, email: a.email } : null, // null : système ou clé de service
  changements: resume(a),
  ...(detail ? { ancienne: propre(a.ancienne), nouvelle: propre(a.nouvelle) } : {}),
});

async function lister(query) {
  const { page, limit, ...f } = query;
  const { rows, total } = await repo.lister(f, limit, toOffset({ page, limit }));
  return paginated(rows.map((a) => vue(a, false)), { page, limit }, total);
}

async function detail(id) {
  const a = await repo.trouver(id);
  if (!a) throw notFound('Entrée du journal introuvable');
  return vue(a, true);
}

async function entites() { return { data: await repo.entites() }; }

module.exports = { lister, detail, entites, resume };
