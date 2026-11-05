const { regrouper, faitsPole, faitsComparative } = require('../src/modules/syntheses/syntheses.donnees');
const prompt = require('../src/modules/syntheses/syntheses.prompt');

const ligne = (poleId, code, score, axeCode, axeNote, axePoids, critere, note, poids, extra = {}) => ({
  poleId, code, intitule: `Pôle ${code}`, famille: 'BPO', scoreConsolide: score, partiel: false,
  axeCode, axeLibelle: axeCode, axeNote, axePoids, critere, unite: '%', valeur: note, cible: 100, taux: note / 100, note, poids, ...extra,
});

const courant = regrouper([
  ligne('p1', 'P1', 60, 'FINANCIER', 70, 50, 'Marge', 80, 50),
  ligne('p1', 'P1', 60, 'FINANCIER', 70, 50, 'CA', 60, 50),
  ligne('p1', 'P1', 60, 'QUALITE', 50, 50, 'Satisfaction', 50, 100),
]);
const precedent = regrouper([
  ligne('p1', 'P1', 70, 'FINANCIER', 70, 50, 'Marge', 70, 50),
  ligne('p1', 'P1', 70, 'FINANCIER', 70, 50, 'CA', 70, 50),
  ligne('p1', 'P1', 70, 'QUALITE', 70, 50, 'Satisfaction', 70, 100),
]);
const campagne = { exercice: 2026, trimestre: 3 };

describe('faits chiffrés d\'une synthèse', () => {
  test('regroupe par pôle et par axe', () => {
    expect(courant).toHaveLength(1);
    expect(courant[0].axes.map((a) => a.code)).toEqual(['FINANCIER', 'QUALITE']);
    expect(courant[0].axes[0].criteres).toHaveLength(2);
  });

  test('évolutions, progression et recul d\'un pôle', () => {
    const f = faitsPole({ campagne, pole: courant[0], precedent: precedent[0], seuil: 1 });
    expect(f.periode.libelle).toBe('T3 2026');
    expect(f.score).toMatchObject({ consolide: 60, precedent: 70, evolution: -10 });
    expect(f.enProgression).toEqual(['Marge']);
    expect(f.enRecul.sort()).toEqual(['CA', 'Satisfaction']);
    expect(f.axes.find((a) => a.code === 'QUALITE').evolution).toBe(-20);
  });

  test('éléments déterminants : pertes pondérées', () => {
    const f = faitsPole({ campagne, pole: courant[0], precedent: null, seuil: 1 });
    // Satisfaction pèse 50 % du score avec une note de 50 : perte de 25 points
    expect(f.determinants.plusPenalisants[0]).toEqual({ intitule: 'Satisfaction', perte: 25 });
    expect(f.historiqueDisponible).toBe(false);
    expect(f.score.evolution).toBeNull();
  });

  test('un critère non renseigné est signalé, jamais estimé', () => {
    const pole = regrouper([ligne('p1', 'P1', 40, 'FINANCIER', 40, 100, 'Marge', null, 100, { valeur: null, taux: null })])[0];
    const f = faitsPole({ campagne, pole, precedent: null, seuil: 1 });
    expect(f.nonRenseignes).toEqual(['Marge']);
    expect(f.determinants.plusPenalisants).toEqual([]);
  });

  test('synthèse comparative : rangs, moyenne, évolutions', () => {
    const poles = regrouper([
      ligne('p1', 'P1', 60, 'FINANCIER', 60, 100, 'Marge', 60, 100),
      ligne('p2', 'P2', 80, 'FINANCIER', 80, 100, 'Marge', 80, 100),
    ]);
    const precs = regrouper([ligne('p1', 'P1', 70, 'FINANCIER', 70, 100, 'Marge', 70, 100)]);
    const f = faitsComparative({ campagne, poles, precedents: precs, seuil: 1 });
    expect(f.poles.map((p) => [p.rang, p.code])).toEqual([[1, 'P2'], [2, 'P1']]);
    expect(f.synthese).toMatchObject({ moyenne: 70, min: 60, max: 80, enRecul: ['P1'], enProgression: [] });
  });

  test('aucune donnée nominative : seules des clés autorisées sont transmises', () => {
    const f = faitsPole({ campagne, pole: courant[0], precedent: precedent[0], seuil: 1 });
    const texte = JSON.stringify(f);
    expect(texte).not.toMatch(/commentaire|email|nom|prenom|@/i);
    expect(Object.keys(f).sort()).toEqual(['axes', 'criteres', 'determinants', 'enProgression', 'enRecul', 'historiqueDisponible',
      'nonRenseignes', 'periode', 'pole', 'score', 'type']);
  });

  test('consignes : interdiction de décision, faits transmis comme données', () => {
    const m = prompt.messages(faitsPole({ campagne, pole: courant[0], precedent: null, seuil: 1 }));
    expect(m[0].role).toBe('system');
    expect(m[0].content).toMatch(/AUCUNE décision/);
    expect(m[1].content).toContain('"type":"POLE"');
  });
});

describe('client OpenRouter', () => {
  afterAll(() => { delete process.env.OPENROUTER_API_KEY; });
  const charger = (env) => {
    let client;
    jest.isolateModules(() => {
      Object.assign(process.env, env);
      client = require('../src/modules/syntheses/openrouter.client');
    });
    return client;
  };
  const reponse = (status, corps) => ({ ok: status < 400, status, json: async () => corps });
  const msgs = [{ role: 'user', content: 'x' }];

  test('sans clé : mode dégradé, aucun appel réseau', async () => {
    delete process.env.OPENROUTER_API_KEY;
    const c = charger({});
    const f = jest.fn();
    await expect(c.completer(msgs, { fetchImpl: f })).rejects.toThrow(/non configuré/);
    expect(f).not.toHaveBeenCalled();
  });

  test('succès : contenu, jetons et coût renvoyés par le service', async () => {
    const c = charger({ OPENROUTER_API_KEY: 'sk-test' });
    const f = jest.fn().mockResolvedValue(reponse(200, { model: 'm/x', choices: [{ message: { content: ' Bonjour ' } }],
      usage: { prompt_tokens: 120, completion_tokens: 60, cost: 0.0042 } }));
    const r = await c.completer(msgs, { fetchImpl: f });
    expect(r).toEqual({ contenu: 'Bonjour', modele: 'm/x', tokensEntree: 120, tokensSortie: 60, cout: 0.0042 });
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(opts.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(opts.body).max_tokens).toBeGreaterThan(0);
  });

  test.each([[429], [500], [402]])('HTTP %i : mode dégradé', async (status) => {
    const c = charger({ OPENROUTER_API_KEY: 'sk-test' });
    await expect(c.completer(msgs, { fetchImpl: async () => reponse(status, {}) })).rejects.toThrow(new RegExp(String(status)));
  });

  test('réponse vide ou illisible, réseau coupé : mode dégradé', async () => {
    const c = charger({ OPENROUTER_API_KEY: 'sk-test' });
    await expect(c.completer(msgs, { fetchImpl: async () => reponse(200, { choices: [{ message: { content: '  ' } }] }) })).rejects.toThrow(/vide/);
    await expect(c.completer(msgs, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('x'); } }) })).rejects.toThrow(/illisible/);
    await expect(c.completer(msgs, { fetchImpl: async () => { throw new Error('ECONNRESET'); } })).rejects.toThrow(/injoignable/);
  });

  test('la clé n\'apparaît dans aucun message d\'erreur', async () => {
    const c = charger({ OPENROUTER_API_KEY: 'sk-secret-123' });
    const err = await c.completer(msgs, { fetchImpl: async () => reponse(401, {}) }).catch((e) => e);
    expect(err.message).not.toContain('sk-secret-123');
  });
});
