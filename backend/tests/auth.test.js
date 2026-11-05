jest.mock('../src/config/db', () => ({ query: jest.fn(), ping: jest.fn(), withTransaction: jest.fn(), close: jest.fn() }));
jest.mock('../src/modules/auth/auth.repository');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const repo = require('../src/modules/auth/auth.repository');
const { createApp } = require('../src/app');
const { ids } = require('./helpers');

const app = createApp();
const hash = bcrypt.hashSync('Secret!2026', 4);
const user = (over = {}) => ({
  id: ids.controle, nom: 'Rabe', prenom: 'Controle', email: 'c@t.mg', mot_de_passe_hash: hash,
  role: 'CONTROLE_GESTION', actif: true, second_facteur_actif: false, tentatives_echec: 0, verrouille_jusqua: null, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  repo.creerSession.mockResolvedValue({ id: 'sess-1', famille: 'fam-1' });
});

describe('POST /api/v1/auth/login', () => {
  test('corps invalide -> 400', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'pas-un-mail' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('succès : jeton signé avec le rôle', async () => {
    repo.findByEmail.mockResolvedValue(user());
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'c@t.mg', password: 'Secret!2026' });
    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.accessToken, process.env.JWT_SECRET);
    expect(payload.sub).toBe(ids.controle);
    expect(payload.role).toBe('CONTROLE_GESTION');
    expect(payload.sid).toBe('fam-1');
    expect(res.body.refreshToken).toBeTruthy();
    expect(repo.resetFailures).toHaveBeenCalledWith(ids.controle);
    // le jeton de rafraîchissement n'est conservé que sous forme d'empreinte
    const stocke = repo.creerSession.mock.calls[0][1];
    expect(stocke.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stocke.tokenHash).not.toBe(res.body.refreshToken);
    expect(repo.journaliser).toHaveBeenCalledWith(expect.objectContaining({ utilisateurId: ids.controle, evenement: 'CONNEXION_REUSSIE' }));
  });

  test('mauvais mot de passe -> 401 et échec enregistré', async () => {
    repo.findByEmail.mockResolvedValue(user());
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'c@t.mg', password: 'faux' });
    expect(res.status).toBe(401);
    expect(repo.registerFailure).toHaveBeenCalledWith(ids.controle, 5, 15);
    expect(repo.journaliser).toHaveBeenCalledWith(expect.objectContaining({ evenement: 'ECHEC_MOT_DE_PASSE' }));
  });

  test('e-mail inconnu -> même réponse 401 (pas de fuite)', async () => {
    repo.findByEmail.mockResolvedValue(null);
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'x@t.mg', password: 'Secret!2026' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Identifiants invalides');
  });

  test('compte verrouillé -> 423', async () => {
    repo.findByEmail.mockResolvedValue(user({ verrouille_jusqua: new Date(Date.now() + 600000) }));
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'c@t.mg', password: 'Secret!2026' });
    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  test('direction : second facteur exigé, aucun jeton délivré', async () => {
    repo.findByEmail.mockResolvedValue(user({ role: 'DIRECTION_GENERALE', second_facteur_actif: true }));
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'c@t.mg', password: 'Secret!2026' });
    expect(res.status).toBe(202);
    expect(res.body.requiresSecondFactor).toBe(true);
    expect(res.body.enrollment).toBe(true); // aucun secret enrôlé : enrôlement guidé
    expect(res.body.accessToken).toBeUndefined();
    expect(repo.creerSession).not.toHaveBeenCalled();
    // le compteur d'échecs n'est pas remis à zéro tant que le second facteur n'est pas validé
    expect(repo.resetFailures).not.toHaveBeenCalled();
    // un jeton de défi ne donne accès à aucune ressource
    const protege = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.challengeToken}`);
    expect(protege.status).toBe(401);
  });

  test('direction avec application enrôlée : pas d\'enrôlement demandé', async () => {
    repo.findByEmail.mockResolvedValue(user({ role: 'DIRECTION_GENERALE', second_facteur_actif: true, totp_secret: 'v1:x' }));
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'c@t.mg', password: 'Secret!2026' });
    expect(res.status).toBe(202);
    expect(res.body.enrollment).toBe(false);
  });
});
