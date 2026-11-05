/**
 * Second facteur TOTP (RFC 6238 / RFC 4226) avec le seul module `crypto` de Node :
 * aucun paquet externe, donc aucune dépendance à auditer.
 * Compatible avec Google Authenticator, Microsoft Authenticator, FreeOTP, Aegis…
 */
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIODE = 30; // secondes
const CHIFFRES = 6;

function base32Encode(buf) {
  let bits = 0; let valeur = 0; let sortie = '';
  for (const octet of buf) {
    valeur = (valeur << 8) | octet; bits += 8;
    while (bits >= 5) { sortie += ALPHABET[(valeur >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) sortie += ALPHABET[(valeur << (5 - bits)) & 31];
  return sortie;
}

function base32Decode(texte) {
  const propre = String(texte).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0; let valeur = 0; const octets = [];
  for (const c of propre) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error('Secret base32 invalide');
    valeur = (valeur << 5) | i; bits += 5;
    if (bits >= 8) { octets.push((valeur >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(octets);
}

/** Nouveau secret aléatoire de 160 bits (taille recommandée), encodé en base32. */
const genererSecret = () => base32Encode(crypto.randomBytes(20));

function hotp(cle, compteur, chiffres = CHIFFRES) {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(compteur));
  const h = crypto.createHmac('sha1', cle).update(c).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** chiffres).padStart(chiffres, '0');
}

/** Pas de temps (30 s) correspondant à un instant (en secondes depuis 1970). */
const pas = (tSecondes) => Math.floor(tSecondes / PERIODE);

/** Code attendu pour un secret et un pas donnés. */
const codePour = (secretBase32, pasTemps) => hotp(base32Decode(secretBase32), pasTemps);

const egal = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Vérifie un code saisi (tolérance ±1 pas pour la dérive d'horloge).
 * `dernierPas` : pas du dernier code accepté ; un code déjà utilisé (pas <= dernierPas) est refusé,
 * ce qui empêche le rejeu d'un code intercepté.
 * Retourne le pas accepté, ou null.
 */
function verifier(secretBase32, code, { dernierPas = null, maintenant = Date.now() / 1000, fenetre = 1 } = {}) {
  if (!/^\d{6}$/.test(String(code))) return null;
  const cle = base32Decode(secretBase32);
  const courant = pas(maintenant);
  for (let d = -fenetre; d <= fenetre; d += 1) {
    const p = courant + d;
    if (dernierPas !== null && dernierPas !== undefined && p <= Number(dernierPas)) continue;
    if (egal(hotp(cle, p), String(code))) return p;
  }
  return null;
}

/** URI « otpauth » : lisible par toute application d'authentification (saisie manuelle ou QR code). */
function uriOtpauth({ compte, secret, emetteur }) {
  const label = `${encodeURIComponent(emetteur)}:${encodeURIComponent(compte)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(emetteur)}&algorithm=SHA1&digits=${CHIFFRES}&period=${PERIODE}`;
}

// --- Chiffrement du secret au repos (AES-256-GCM) ---
function cleChiffrement(env) {
  if (env.TOTP_ENC_KEY) return Buffer.from(env.TOTP_ENC_KEY, 'hex');
  return crypto.createHash('sha256').update(`tanjakai-totp:${env.JWT_SECRET}`).digest();
}

function chiffrer(secret, env) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cleChiffrement(env), iv);
  const ct = Buffer.concat([c.update(secret, 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${ct.toString('base64')}`;
}

function dechiffrer(valeur, env) {
  const [version, reste] = String(valeur).split(':');
  if (version !== 'v1' || !reste) throw new Error('Secret chiffré illisible');
  const [iv, tag, ct] = reste.split('.').map((x) => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', cleChiffrement(env), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

// --- Codes de secours ---
/** 8 codes de 10 caractères (sans caractères ambigus), affichés une seule fois. */
function genererCodesSecours(n = 8) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: n }, () => {
    const b = crypto.randomBytes(10);
    const c = Array.from(b, (x) => a[x % a.length]).join('');
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  });
}
const normaliserCodeSecours = (c) => String(c).toUpperCase().replace(/[^A-Z0-9]/g, '');
const empreinte = (c) => crypto.createHash('sha256').update(normaliserCodeSecours(c)).digest('hex');
const ressembleCodeSecours = (c) => /^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/.test(String(c).trim());

module.exports = {
  base32Encode, base32Decode, genererSecret, hotp, pas, codePour, verifier, uriOtpauth,
  chiffrer, dechiffrer, genererCodesSecours, empreinte, ressembleCodeSecours, PERIODE,
};
