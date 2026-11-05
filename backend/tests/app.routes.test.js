const request = require('supertest');
const { createApp } = require('../src/app');
const { ids, tokenFor } = require('./helpers');

const app = createApp();

describe('Montage des routes de saisies', () => {
  test('les saisies sont sous /api/v1 et exigent une authentification', async () => {
    const res = await request(app).get('/api/v1/saisies');
    expect(res.status).toBe(401);
  });

  test('l\'ancien préfixe non versionné n\'existe plus', async () => {
    const res = await request(app).get('/api/saisies');
    expect(res.status).toBe(404);
  });

  test('les pièces sont sous /saisies/:id/pieces et exigent une authentification', async () => {
    const res = await request(app).get(`/api/v1/saisies/${ids.pole}/pieces`);
    expect(res.status).toBe(401);
  });

  test('l\'API de service exige une clé de service', async () => {
    const res = await request(app).post('/api/v1/service/saisies').send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SERVICE_KEY_REQUIRED');
  });

  test('les routes de saisies reçoivent les en-têtes de sécurité et la limitation de débit', async () => {
    const res = await request(app).get('/api/v1/saisies');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['ratelimit-limit']).toBeTruthy();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  test('messages d\'erreur correctement encodés', async () => {
    const res = await request(app).get('/api/v1/saisies').set('Authorization', 'Bearer x');
    expect(JSON.stringify(res.body)).not.toMatch(/Ã/);
  });
});
