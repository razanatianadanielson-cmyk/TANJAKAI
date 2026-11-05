const service = require('./scoring.service');

const lister = async (req, res) => res.json(await service.lister(req.user, req.valid.query));
const detail = async (req, res) => res.json(await service.detail(req.user, req.valid.params.id));
const verifier = async (req, res) => res.json(await service.verifier(req.user, req.valid.params.id));

module.exports = { lister, detail, verifier };
