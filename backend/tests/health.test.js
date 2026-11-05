jest.mock('../src/config/db', () => ({
  query: jest.fn(), ping: jest.fn(), withTransaction: jest.fn(), close: jest.fn(),
}));
const request = require('supertest');
const db = require('../src/config/db');
const { createApp } = require('../src/app');

const app = createApp();

describe('Santé et erreurs génériques', () => {
  test('GET /health répond sans toucher la base', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(db.ping).not.toHaveBeenCalled();
  });

  test('GET /api/v1/health/ready : base disponible', async () => {
    db.ping.mockResolvedValueOnce();
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('up');
  });

  test('GET /api/v1/health/ready : base indisponible -> 503', async () => {
    db.ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.database).toBe('down');
  });

  test('route inconnue -> format d\'erreur unique', async () => {
    const res = await request(app).get('/api/v1/nimporte-quoi');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeTruthy();
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
  });

  test('JSON invalide -> 400', async () => {
    const res = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{oops');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  test('en-têtes de sécurité présents', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
