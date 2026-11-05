jest.mock('../src/config/db', () => ({ query: jest.fn(), ping: jest.fn(), withTransaction: jest.fn(), close: jest.fn() }));
jest.mock('../src/modules/familles/familles.service');
jest.mock('../src/modules/criteres/criteres.service');
jest.mock('../src/modules/grilles/grilles.service');
jest.mock('../src/modules/cibles/cibles.service');
jest.mock('../src/modules/campagnes/campagnes.service');
const request = require('supertest');
const { createApp } = require('../src/app');
const { ids, tokenFor } = require('./helpers');
const grilles = require('../src/modules/grilles/grilles.service');
const criteres = require('../src/modules/criteres/criteres.service');
const cibles = require('../src/modules/cibles/cibles.service');
const campagnes = require('../src/modules/campagnes/campagnes.service');

const app = createApp();
const uuid = ids.pole;
const as = (role) => tokenFor(ids.controle, role);
const CG = as('CONTROLE_GESTION');
const DIR = as('DIRECTION_GENERALE');
const ADM = as('ADMINISTRATEUR');
const RESP = tokenFor(ids.responsable, 'RESPONSABLE_POLE');

beforeEach(() => jest.clearAllMocks());

describe('Habilitations du référentiel', () => {
  test.each([
    ['get', '/api/v1/familles'], ['get', '/api/v1/axes'], ['get', '/api/v1/criteres'], ['get', '/api/v1/grilles'],
    ['get', '/api/v1/cibles'], ['post', '/api/v1/campagnes'],
  ])('%s %s sans jeton -> 401', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
  });

  test('un responsable ne peut ni créer un critère, ni lire les grilles', async () => {
    expect((await request(app).post('/api/v1/criteres').set('Authorization', RESP).send({})).status).toBe(403);
    expect((await request(app).get('/api/v1/grilles').set('Authorization', RESP)).status).toBe(403);
    expect(grilles.list).not.toHaveBeenCalled();
  });

  test('validation d\'un critère ou d\'une grille : contrôle de gestion uniquement', async () => {
    for (const url of [`/api/v1/criteres/${uuid}/valider`, `/api/v1/grilles/${uuid}/valider`]) {
      expect((await request(app).post(url).set('Authorization', ADM)).status).toBe(403);
      expect((await request(app).post(url).set('Authorization', DIR)).status).toBe(403);
    }
    expect(criteres.valider).not.toHaveBeenCalled();
    expect(grilles.valider).not.toHaveBeenCalled();
  });

  test('validation d\'une cible : direction générale uniquement', async () => {
    cibles.valider.mockResolvedValue({ id: uuid });
    expect((await request(app).post(`/api/v1/cibles/${uuid}/valider`).set('Authorization', CG)).status).toBe(403);
    expect((await request(app).post(`/api/v1/cibles/${uuid}/valider`).set('Authorization', DIR)).status).toBe(200);
  });

  test('proposition de cible : refusée au responsable', async () => {
    const body = { poleId: uuid, critereId: uuid, exercice: 2026, valeurCible: 10 };
    expect((await request(app).put('/api/v1/cibles').set('Authorization', RESP).send(body)).status).toBe(403);
  });

  test('ouverture de campagne : contrôle de gestion uniquement', async () => {
    const body = { exercice: 2026, trimestre: 3, grilleId: uuid, dateLimite: '2026-12-31' };
    campagnes.ouvrir.mockResolvedValue({ id: uuid });
    expect((await request(app).post('/api/v1/campagnes').set('Authorization', ADM).send(body)).status).toBe(403);
    expect((await request(app).post('/api/v1/campagnes').set('Authorization', CG).send(body)).status).toBe(201);
  });

  test('réouverture : contrôle de gestion ou administrateur, jamais un responsable', async () => {
    campagnes.rouvrir.mockResolvedValue({ id: uuid });
    const url = `/api/v1/campagnes/${uuid}/rouvrir`;
    expect((await request(app).post(url).set('Authorization', RESP).send({ motif: 'Correction' })).status).toBe(403);
    expect((await request(app).post(url).set('Authorization', ADM).send({ motif: 'Correction' })).status).toBe(200);
  });
});

describe('Validation des entrées du référentiel', () => {
  const post = (url, token, body) => request(app).post(url).set('Authorization', token).send(body);

  test('critère : définition précise obligatoire et bornes cohérentes', async () => {
    const base = { axeId: uuid, intitule: 'Marge', unite: '%', sensOptimisation: 'MAXIMISER', sourceDonnee: 'ERP' };
    expect((await post('/api/v1/criteres', CG, { ...base, definition: 'court' })).status).toBe(400);
    expect((await post('/api/v1/criteres', CG, { ...base, definition: 'Marge nette sur chiffre d\'affaires', valeurMin: 10, valeurMax: 5 })).status).toBe(400);
    criteres.create.mockResolvedValue({ id: uuid });
    expect((await post('/api/v1/criteres', CG, { ...base, definition: 'Marge nette sur chiffre d\'affaires' })).status).toBe(201);
  });

  test('pondération par famille sans motif -> 400', async () => {
    const res = await request(app).put(`/api/v1/grilles/${uuid}/ponderations-axes`).set('Authorization', CG)
      .send({ ponderations: [{ axeId: uuid, familleId: uuid, poids: 100 }] });
    expect(res.status).toBe(400);
    expect(grilles.definirPonderationsAxes).not.toHaveBeenCalled();
  });

  test('critère applicable sans barème, plancher >= plafond, doublons -> 400', async () => {
    const put = (ponderations) => request(app).put(`/api/v1/grilles/${uuid}/ponderations-criteres`).set('Authorization', CG).send({ ponderations });
    expect((await put([{ critereId: uuid, poids: 100 }])).status).toBe(400);
    expect((await put([{ critereId: uuid, poids: 100, plancher: 1, plafond: 0.5 }])).status).toBe(400);
    const ok = { critereId: uuid, poids: 50, plancher: 0.5, plafond: 1 };
    expect((await put([ok, ok])).status).toBe(400);
    expect((await put([{ critereId: uuid, poids: 0, applicable: false, plancher: 0.5, plafond: 1 }])).status).toBe(400); // non applicable sans motif
    grilles.definirPonderationsCriteres.mockResolvedValue({});
    expect((await put([{ ...ok, poids: 100 }])).status).toBe(200);
  });

  test('poids avec plus de deux décimales ou supérieur à 100 -> 400', async () => {
    const put = (poids) => request(app).put(`/api/v1/grilles/${uuid}/ponderations-axes`).set('Authorization', CG)
      .send({ ponderations: [{ axeId: uuid, poids }] });
    expect((await put(33.333)).status).toBe(400);
    expect((await put(120)).status).toBe(400);
  });

  test('campagne : date au mauvais format, trimestre hors bornes -> 400 ; réouverture sans motif -> 400', async () => {
    const base = { exercice: 2026, trimestre: 3, grilleId: uuid, dateLimite: '2026-12-31' };
    expect((await post('/api/v1/campagnes', CG, { ...base, dateLimite: '31/12/2026' })).status).toBe(400);
    expect((await post('/api/v1/campagnes', CG, { ...base, trimestre: 5 })).status).toBe(400);
    expect((await post(`/api/v1/campagnes/${uuid}/rouvrir`, CG, { motif: 'a' })).status).toBe(400);
    expect(campagnes.rouvrir).not.toHaveBeenCalled();
  });

  test('cible : valeur non numérique ou exercice hors bornes -> 400', async () => {
    const put = (b) => request(app).put('/api/v1/cibles').set('Authorization', CG).send(b);
    expect((await put({ poleId: uuid, critereId: uuid, exercice: 2026, valeurCible: '10' })).status).toBe(400);
    expect((await put({ poleId: uuid, critereId: uuid, exercice: 1999, valeurCible: 10 })).status).toBe(400);
  });
});
