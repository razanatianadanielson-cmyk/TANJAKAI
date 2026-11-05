// CSV pour tableur français : séparateur « ; », décimale « , », fins de ligne CRLF, BOM UTF-8 (Excel).
// Un nombre (type number) reçoit la virgule décimale. Une chaîne est du texte : si elle commence par = + - @ (ou
// tabulation / retour chariot), elle est préfixée par « ' » pour qu'un tableur ne l'exécute jamais comme une formule.

function cellule(v) {
  if (v === null || v === undefined) return '';
  let s;
  if (typeof v === 'number') s = Number.isFinite(v) ? String(v).replace('.', ',') : '';
  else if (v instanceof Date) s = v.toISOString();
  else {
    s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  }
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** colonnes : [{ titre, valeur: (ligne) => … }] */
function versCsv(colonnes, lignes) {
  const corps = [colonnes.map((c) => cellule(c.titre)).join(';'), ...lignes.map((l) => colonnes.map((c) => cellule(c.valeur(l))).join(';'))].join('\r\n');
  return `﻿${corps}\r\n`;
}

const nombre = (v) => (v === null || v === undefined ? null : Number(v));

module.exports = { versCsv, cellule, nombre };
