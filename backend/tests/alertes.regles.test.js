const { decider } = require('../src/modules/alertes/alertes.regles');

const seuil = { id: 's1', valeur: 50, ecartDegradation: 15 };
const types = (r) => r.map((a) => a.type).sort();

describe('règles d\'alerte (2.4)', () => {
  test('score au-dessus du seuil, sans historique : aucune alerte', () => {
    expect(decider({ courant: { score: 70 }, seuil, precedent: null })).toEqual([]);
  });

  test('premier trimestre sous le seuil : vigilance seule', () => {
    expect(types(decider({ courant: { score: 45 }, seuil, precedent: null }))).toEqual(['VIGILANCE']);
  });

  test('égal au seuil : pas sous le seuil', () => {
    expect(decider({ courant: { score: 50 }, seuil, precedent: null })).toEqual([]);
  });

  test('deux trimestres consécutifs sous le seuil : vigilance + direction', () => {
    const r = decider({ courant: { score: 44 }, seuil, precedent: { score: 46, sousSeuil: true } });
    expect(types(r)).toEqual(['DIRECTION', 'VIGILANCE']);
  });

  test('trimestre précédent au-dessus du seuil : pas d\'alerte de direction', () => {
    const r = decider({ courant: { score: 44 }, seuil, precedent: { score: 55, sousSeuil: false } });
    expect(types(r)).toEqual(['VIGILANCE']);
  });

  test('chute de 16 points sous le seuil : vigilance + dégradation', () => {
    const r = decider({ courant: { score: 44 }, seuil, precedent: { score: 60, sousSeuil: false } });
    expect(types(r)).toEqual(['DEGRADATION', 'VIGILANCE']);
  });

  test('précédent absent (trimestre non consécutif) : pas d\'alerte de direction', () => {
    expect(types(decider({ courant: { score: 30 }, seuil, precedent: null }))).toEqual(['VIGILANCE']);
  });

  test('dégradation rapide même au-dessus du seuil', () => {
    const r = decider({ courant: { score: 62 }, seuil, precedent: { score: 80, sousSeuil: false } });
    expect(types(r)).toEqual(['DEGRADATION']);
    expect(r[0].message).toContain('−18,0');
  });

  test('chute égale à l\'écart toléré : pas de dégradation', () => {
    expect(decider({ courant: { score: 65 }, seuil, precedent: { score: 80, sousSeuil: false } })).toEqual([]);
  });

  test('sans écart paramétré : jamais de dégradation', () => {
    const s = { ...seuil, ecartDegradation: null };
    expect(decider({ courant: { score: 20 }, seuil: s, precedent: { score: 90, sousSeuil: false } }).map((a) => a.type)).toEqual(['VIGILANCE']);
  });

  test('seuil d\'axe : vigilance même si le score consolidé est correct', () => {
    const r = decider({
      courant: { score: 70 }, seuil, precedent: null,
      axes: [{ code: 'HUMAIN', note: 30, seuil: { id: 'sa', valeur: 40 } }, { code: 'FINANCIER', note: 90, seuil: null }],
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: 'VIGILANCE', seuilId: 'sa' });
    expect(r[0].message).toContain('HUMAIN');
  });

  test('score partiel signalé dans le message', () => {
    const r = decider({ courant: { score: 40, partiel: true }, seuil, precedent: null });
    expect(r[0].message).toContain('score partiel');
  });

  test('score non calculable ou seuil absent : rien', () => {
    expect(decider({ courant: { score: null }, seuil, precedent: null })).toEqual([]);
    expect(decider({ courant: { score: 10 }, seuil: null, precedent: null })).toEqual([]);
  });
});
