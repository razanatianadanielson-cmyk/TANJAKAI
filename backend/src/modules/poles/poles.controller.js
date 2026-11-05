const service = require('./poles.service');

async function list(req, res) {
  res.json(await service.list(req.user, req.valid.query));
}

async function getById(req, res) {
  res.json(await service.getById(req.user, req.valid.params.id));
}

async function create(req, res) {
  const pole = await service.create(req.user, req.valid.body);
  res.status(201).location(`/api/v1/poles/${pole.id}`).json(pole);
}

async function suspendre(req, res) {
  res.status(201).json(await service.suspendre(req.user, req.valid.params.id, req.valid.body));
}

async function suspensions(req, res) {
  res.json({ data: await service.suspensions(req.user, req.valid.params.id) });
}

async function changerResponsable(req, res) {
  res.json(await service.changerResponsable(req.user, req.valid.params.id, req.valid.body));
}

module.exports = { list, getById, create, suspendre, suspensions, changerResponsable };
