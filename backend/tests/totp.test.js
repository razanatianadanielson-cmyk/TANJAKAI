const totp = require('../src/modules/auth/totp');
const { erreursMotDePasse } = require('../src/modules/auth/password-policy');

// Secret de test de la RFC 6238 : ASCII « 12345678901234567890 »
const SECRET = totp.base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  test('vecteurs officiels de la RFC 6238 (SHA-1, 6 chiffres)', () => {
    // la RFC publie 8 chiffres ; les 6 derniers sont ceux d'une application d'authentification
    const attendus = { 59: '287082', 1111111109: '081804', 1111111111: '050471', 1234567890: '005924', 2000000000: '279037' };
    for (const [t, code] of Object.entries(attendus)) expect(totp.codePour(SECRET, totp.pas(Number(t)))).toBe(code);
  });

  test('base32 : aller-retour', () => {
    const buf = Buffer.from('tanjakai-secret-123');
    expect(totp.base32Decode(totp.base32Encode(buf)).equals(buf)).toBe(true);
    expect(() => totp.base32Decode('!!!')).toThrow();
  });

  test('un code correct est accepté, un mauvais code est refusé', () => {
    const t = 1700000000;
    const bon = totp.codePour(SECRET, totp.pas(t));
    expect(totp.verifier(SECRET, bon, { maintenant: t })).toBe(totp.pas(t));
    const faux = bon === '000000' ? '000001' : '000000';
    expect(totp.verifier(SECRET, faux, { maintenant: t })).toBeNull();
    expect(totp.verifier(SECRET, 'abcdef', { maintenant: t })).toBeNull();
    expect(totp.verifier(SECRET, '12345', { maintenant: t })).toBeNull();
  });

  test('tolérance de ±1 pas (dérive d\'horloge), pas davantage', () => {
    const t = 1700000000;
    expect(totp.verifier(SECRET, totp.codePour(SECRET, totp.pas(t) - 1), { maintenant: t })).toBe(totp.pas(t) - 1);
    expect(totp.verifier(SECRET, totp.codePour(SECRET, totp.pas(t) + 1), { maintenant: t })).toBe(totp.pas(t) + 1);
    expect(totp.verifier(SECRET, totp.codePour(SECRET, totp.pas(t) - 2), { maintenant: t })).toBeNull();
  });

  test('anti-rejeu : un code déjà utilisé (ou plus ancien) est refusé', () => {
    const t = 1700000000;
    const p = totp.pas(t);
    const code = totp.codePour(SECRET, p);
    expect(totp.verifier(SECRET, code, { maintenant: t, dernierPas: p })).toBeNull();
    expect(totp.verifier(SECRET, totp.codePour(SECRET, p - 1), { maintenant: t, dernierPas: p })).toBeNull();
    expect(totp.verifier(SECRET, totp.codePour(SECRET, p + 1), { maintenant: t, dernierPas: p })).toBe(p + 1);
  });

  test('le secret est chiffré au repos (AES-256-GCM) et illisible sans la clé', () => {
    const env = { JWT_SECRET: 'x'.repeat(40) };
    const secret = totp.genererSecret();
    const c = totp.chiffrer(secret, env);
    expect(c.startsWith('v1:')).toBe(true);
    expect(c).not.toContain(secret);
    expect(totp.dechiffrer(c, env)).toBe(secret);
    expect(() => totp.dechiffrer(c, { JWT_SECRET: 'y'.repeat(40) })).toThrow();
    expect(() => totp.dechiffrer(c.slice(0, -4) + 'AAAA', env)).toThrow(); // altération détectée
    expect(totp.chiffrer(secret, env)).not.toBe(c); // IV aléatoire
  });

  test('URI otpauth lisible par les applications', () => {
    const u = totp.uriOtpauth({ compte: 'dir@tanjakai.local', secret: SECRET, emetteur: 'TANJAKAI' });
    expect(u).toMatch(/^otpauth:\/\/totp\/TANJAKAI:dir%40tanjakai\.local\?secret=/);
    expect(u).toContain('issuer=TANJAKAI');
  });

  test('codes de secours : 8 codes uniques, reconnus quelle que soit la casse ou le tiret', () => {
    const codes = totp.genererCodesSecours();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    codes.forEach((c) => expect(totp.ressembleCodeSecours(c)).toBe(true));
    expect(totp.empreinte(codes[0])).toBe(totp.empreinte(codes[0].toLowerCase().replace('-', ' ')));
    expect(totp.empreinte(codes[0])).not.toBe(totp.empreinte(codes[1]));
    expect(totp.ressembleCodeSecours('123456')).toBe(false); // un code TOTP n'est pas un code de secours
  });
});

describe('politique de mot de passe', () => {
  test('refuse les mots de passe faibles et indique les règles', () => {
    expect(erreursMotDePasse('court')).toEqual(expect.arrayContaining(['12 caractères minimum']));
    expect(erreursMotDePasse('motdepasse2026!A').join()).toContain('trop courant');
    expect(erreursMotDePasse('Rabe-Controle-2026!', { email: 'controle@tanjakai.local', nom: 'Rabe', prenom: 'Controle' }).join())
      .toMatch(/e-mail|nom/);
    expect(erreursMotDePasse('Aaaaaaaa1!bcdef').join()).toContain('3 caractères identiques');
  });

  test('accepte un mot de passe robuste', () => {
    expect(erreursMotDePasse('Vélo-Bleu-Lune-742!')).toEqual([]);
  });
});
