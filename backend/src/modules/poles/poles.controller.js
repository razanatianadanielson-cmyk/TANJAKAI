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

async function modifier(req, res) {
  res.json(await service.modifier(req.user, req.valid.params.id, req.valid.body));
}

async function supprimer(req, res) {
  res.json(await service.supprimer(req.user, req.valid.params.id, req.valid.body));
}

async function modifierSuspension(req, res) {
  res.json(await service.modifierSuspension(req.user, req.valid.params.id, req.valid.params.suspensionId, req.valid.body));
}

async function supprimerSuspension(req, res) {
  res.json(await service.supprimerSuspension(req.user, req.valid.params.id, req.valid.params.suspensionId, req.valid.body));
}

module.exports = { modifierSuspension, supprimerSuspension, list, getById, create, suspendre, suspensions, changerResponsable, modifier, supprimer };
