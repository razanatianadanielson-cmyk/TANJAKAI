jest.mock('../src/config/db', () => ({ query: jest.fn(), ping: jest.fn(), withTransaction: jest.fn(), close: jest.fn() }));
jest.mock('../src/modules/scoring/scoring.service');
const request = require('supertest');
const service = require('../src/modules/scoring/scoring.service');
const { createApp } = require('../src/app');
const { ids, tokenFor } = require('./helpers');

const app = createApp();
const uuid = '99999999-9999-4999-8999-999999999999';
const controle = tokenFor(ids.controle, 'CONTROLE_GESTION');
const responsable = tokenFor(ids.responsable, 'RESPONSABLE_POLE');

beforeEach(() => jest.clearAllMocks());

describe('Routes du moteur de notation', () => {
  test('sans jeton -> 401', async () => {
    expect((await request(app).get('/api/v1/scores')).status).toBe(401);
    expect((await request(app).post(`/api/v1/campagnes/${uuid}/cloturer`)).status).toBe(401);
  });

  test('seul le contrôle de gestion clôture ou simule', async () => {
    expect((await request(app).post(`/api/v1/campagnes/${uuid}/cloturer`).set('Authorization', responsable)).status).toBe(403);
    expect((await request(app).post(`/api/v1/campagnes/${uuid}/simuler`).set('Authorization', responsable)).status).toBe(403);
    expect(service.cloturerEtNoter).not.toHaveBeenCalled();
  });

  test('clôture : le service reçoit l\'utilisateur authentifié', async () => {
    service.cloturerEtNoter.mockResolvedValue({ campagneId: uuid, statut: 'CLOTUREE', scores: [] });
    const res = await request(app).post(`/api/v1/campagnes/${uuid}/cloturer`).set('Authorization', controle);
    expect(res.status).toBe(200);
    expect(service.cloturerEtNoter).toHaveBeenCalledWith({ id: ids.controle, role: 'CONTROLE_GESTION' }, uuid);
  });

  test('identifiant non UUID -> 400', async () => {
    const res = await request(app).post('/api/v1/campagnes/abc/cloturer').set('Authorization', controle);
    expect(res.status).toBe(400);
  });

  test('un responsable ne peut pas lancer la vérification par recalcul', async () => {
    const res = await request(app).get(`/api/v1/scores/${uuid}/verification`).set('Authorization', responsable);
    expect(res.status).toBe(403);
  });

  test('un responsable consulte la liste et le détail (le service applique le cloisonnement)', async () => {
    service.lister.mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0 } });
    service.detail.mockResolvedValue({ id: uuid });
    expect((await request(app).get('/api/v1/scores').set('Authorization', responsable)).status).toBe(200);
    expect((await request(app).get(`/api/v1/scores/${uuid}`).set('Authorization', responsable)).status).toBe(200);
    expect(service.detail).toHaveBeenCalledWith({ id: ids.responsable, role: 'RESPONSABLE_POLE' }, uuid);
  });
});
