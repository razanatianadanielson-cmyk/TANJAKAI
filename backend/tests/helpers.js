const { signAccessToken } = require('../src/modules/auth/auth.service');

const ids = {
  responsable: '11111111-1111-4111-8111-111111111111',
  autreResponsable: '22222222-2222-4222-8222-222222222222',
  controle: '33333333-3333-4333-8333-333333333333',
  pole: '44444444-4444-4444-8444-444444444444',
  famille: '55555555-5555-4555-8555-555555555555',
};

const tokenFor = (id, role) => `Bearer ${signAccessToken({ id, role })}`;

module.exports = { ids, tokenFor };
