const { versCsv, cellule } = require('../src/utils/csv');

describe('export CSV', () => {
  test('nombre : virgule décimale ; texte : jamais modifié', () => {
    expect(cellule(87.5)).toBe('87,5');
    expect(cellule('admin@tanjakai.local')).toBe('admin@tanjakai.local');
    expect(cellule('10.5')).toBe('10.5');
  });
  test('injection de formule neutralisée', () => {
    for (const x of ['=1+1', '+cmd', '-cmd', '@SUM(A1)', '\tx']) expect(cellule(x)).toBe(`'${x}`);
  });
  test('séparateur, guillemets et retours à la ligne protégés', () => {
    expect(cellule('a;b')).toBe('"a;b"');
    expect(cellule('dit "oui"')).toBe('"dit ""oui"""');
    expect(cellule('l1\nl2')).toBe('"l1\nl2"');
  });
  test('valeurs vides et infinies', () => {
    expect(cellule(null)).toBe(''); expect(cellule(undefined)).toBe(''); expect(cellule(Infinity)).toBe('');
  });
  test('document : BOM, CRLF, en-tête', () => {
    const t = versCsv([{ titre: 'A', valeur: (l) => l.a }, { titre: 'B', valeur: (l) => l.b }], [{ a: 1.5, b: 'x' }]);
    expect(t).toBe('﻿A;B\r\n1,5;x\r\n');
  });
});
