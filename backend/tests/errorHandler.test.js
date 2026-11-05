const { errorHandler } = require('../src/middlewares/errorHandler');

function run(err) {
  const res = { statusCode: 0, body: null, status(s) { this.statusCode = s; return this; }, json(b) { this.body = b; return this; } };
  errorHandler(err, { id: 'req-1' }, res, () => {});
  return res;
}

describe('Traduction des erreurs PostgreSQL', () => {
  test('violation de règle métier (trigger) -> 422 avec le message de la règle', () => {
    const res = run(Object.assign(new Error('Campagne clôturée : saisie verrouillée'), { code: '23514' }));
    expect(res.statusCode).toBe(422);
    expect(res.body.error.message).toBe('Campagne clôturée : saisie verrouillée');
  });

  test('unicité -> 409', () => {
    const res = run(Object.assign(new Error('dup'), { code: '23505', constraint: 'uq_saisie_pole_critere_campagne' }));
    expect(res.statusCode).toBe(409);
    expect(res.body.error.details.contrainte).toBe('uq_saisie_pole_critere_campagne');
  });

  test('droits insuffisants (séparation des fonctions) -> 403', () => {
    const res = run(Object.assign(new Error('Seul le contrôle de gestion valide une saisie'), { code: '42501' }));
    expect(res.statusCode).toBe(403);
  });

  test('erreur inconnue -> 500 sans fuite en production', () => {
    const res = run(new Error('secret interne'));
    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });
});
