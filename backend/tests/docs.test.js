const { construire, OPS } = require('../src/modules/docs/openapi');
const { genererCle } = require('../src/modules/cles-service/cles-service.service');
const { empreinteCle } = require('../src/middlewares/serviceAuth');

describe('documentation OpenAPI', () => {
  const spec = construire();

  test('spécification OpenAPI 3 avec les deux schémas de sécurité', () => {
    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.components.securitySchemes).sort()).toEqual(['cleDeService', 'jeton']);
  });

  test('chaque route est unique et chaque paramètre de chemin est déclaré', () => {
    const vus = new Set();
    for (const [method, path] of OPS) {
      const id = `${method} ${path}`;
      expect(vus.has(id)).toBe(false);
      vus.add(id);
      const attendus = [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const declares = spec.paths[path][method].parameters.filter((p) => p.in === 'path').map((p) => p.name);
      expect(declares).toEqual(attendus);
    }
  });

  test('la saisie par clé de service exige Idempotency-Key et X-Service-Key', () => {
    const op = spec.paths['/service/saisies'].post;
    expect(op.security).toEqual([{ cleDeService: [] }]);
    expect(op.parameters.some((p) => p.name === 'Idempotency-Key' && p.required)).toBe(true);
  });

  test('les routes publiques ne demandent aucune authentification', () => {
    expect(spec.paths['/auth/login'].post.security).toEqual([]);
    expect(spec.paths['/cles-service'].get.security).toEqual([{ jeton: [] }]);
  });
});

describe('clés de service', () => {
  test('clé aléatoire préfixée, jamais deux fois la même', () => {
    const a = genererCle(); const b = genererCle();
    expect(a).toMatch(/^tjk_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });
  test('empreinte SHA-256 hexadécimale stable', () => {
    expect(empreinteCle('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
