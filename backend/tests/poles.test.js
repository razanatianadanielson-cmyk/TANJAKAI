jest.mock('../src/config/db', () => ({ query: jest.fn(), ping: jest.fn(), withTransaction: jest.fn(), close: jest.fn() }));
jest.mock('../src/modules/poles/poles.repository');
const request = require('supertest');
const db = require('../src/config/db');
const repo = require('../src/modules/poles/poles.repository');
const { createApp } = require('../src/app');
const { ids, tokenFor } = require('./helpers');

const app = createApp();
const pole = { id: ids.pole, code: 'BPO-01', intitule: 'BPO', responsableId: ids.responsable };

beforeEach(() => {
  jest.clearAllMocks();
  repo.list.mockResolvedValue({ rows: [pole], total: 1 });
});

describe('Habilitations et cloisonnement des pôles', () => {
  test('sans jeton -> 401', async () => {
    const res = await request(app).get('/api/v1/poles');
    expect(res.status).toBe(401);
  });

  test('jeton falsifié -> 401', async () => {
    const res = await request(app).get('/api/v1/poles').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  test('un responsable ne liste que ses pôles', async () => {
    const res = await request(app).get('/api/v1/poles').set('Authorization', tokenFor(ids.responsable, 'RESPONSABLE_POLE'));
    expect(res.status).toBe(200);
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ responsableId: ids.responsable }));
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 1 });
  });

  test('le contrôle de gestion voit tous les pôles', async () => {
    await request(app).get('/api/v1/poles').set('Authorization', tokenFor(ids.controle, 'CONTROLE_GESTION'));
    expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ responsableId: undefined }));
  });

  test('un responsable ne peut pas lire le pôle d\'un autre -> 404', async () => {
    repo.findById.mockResolvedValue(pole);
    const res = await request(app).get(`/api/v1/poles/${ids.pole}`)
      .set('Authorization', tokenFor(ids.autreResponsable, 'RESPONSABLE_POLE'));
    expect(res.status).toBe(404);
  });

  test('un responsable lit son propre pôle', async () => {
    repo.findById.mockResolvedValue(pole);
    const res = await request(app).get(`/api/v1/poles/${ids.pole}`)
      .set('Authorization', tokenFor(ids.responsable, 'RESPONSABLE_POLE'));
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('BPO-01');
  });

  test('identifiant non UUID -> 400', async () => {
    const res = await request(app).get('/api/v1/poles/123').set('Authorization', tokenFor(ids.controle, 'CONTROLE_GESTION'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('un responsable ne peut pas créer de pôle -> 403', async () => {
    const res = await request(app).post('/api/v1/poles')
      .set('Authorization', tokenFor(ids.responsable, 'RESPONSABLE_POLE')).send({});
    expect(res.status).toBe(403);
  });

  test('création : validation des entrées -> 400', async () => {
    const res = await request(app).post('/api/v1/poles')
      .set('Authorization', tokenFor(ids.controle, 'CONTROLE_GESTION')).send({ code: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  test('création : 201 et audit via withTransaction', async () => {
    db.withTransaction.mockImplementation((ctx, fn) => fn({}));
    repo.insert.mockResolvedValue(ids.pole);
    repo.findById.mockResolvedValue(pole);
    const res = await request(app).post('/api/v1/poles')
      .set('Authorization', tokenFor(ids.controle, 'CONTROLE_GESTION'))
      .send({ code: 'BPO-01', intitule: 'BPO', familleId: ids.famille, dateRattachement: '2026-01-01' });
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/poles/${ids.pole}`);
    expect(db.withTransaction).toHaveBeenCalledWith({ userId: ids.controle }, expect.any(Function));
  });
});
