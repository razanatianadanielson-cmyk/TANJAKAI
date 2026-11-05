const repo = require('./campagnes.repository');
const scoring = require('../scoring/scoring.service');
const service = require('./campagnes.service');
const { toOffset, paginated } = require('../../utils/pagination');

async function lister(req, res) {
  const q = req.valid.query;
  const { rows, total } = await repo.lister({ limit: q.limit, offset: toOffset(q) });
  res.json(paginated(rows, q, total));
}
const simuler = async (req, res) => res.json(await scoring.simuler(req.valid.params.id));
const cloturer = async (req, res) => res.json(await scoring.cloturerEtNoter(req.user, req.valid.params.id));

const detail = async (req, res) => res.json(await service.trouver(req.valid.params.id));
const ouvrir = async (req, res) => {
  const campagne = await service.ouvrir(req.user, req.valid.body);
  res.status(201).location(`/api/v1/campagnes/${campagne.id}`).json(campagne);
};
const rouvrir = async (req, res) => res.json(await service.rouvrir(req.user, req.valid.params.id, req.valid.body));

module.exports = { lister, simuler, cloturer, detail, ouvrir, rouvrir };
