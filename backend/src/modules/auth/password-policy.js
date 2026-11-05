/** Politique de robustesse des mots de passe (cahier des charges 2.6.2). Retourne la liste des règles non respectées. */
const COURANTS = ['motdepasse', 'password', 'azerty', 'qwerty', 'tanjakai', 'changeme', '123456789', 'administrateur'];

function erreursMotDePasse(mdp, { email = '', nom = '', prenom = '' } = {}) {
  const e = [];
  const m = String(mdp || '');
  if (m.length < 12) e.push('12 caractères minimum');
  if (m.length > 128) e.push('128 caractères maximum');
  if (!/[a-z]/.test(m)) e.push('au moins une minuscule');
  if (!/[A-Z]/.test(m)) e.push('au moins une majuscule');
  if (!/\d/.test(m)) e.push('au moins un chiffre');
  if (!/[^A-Za-z0-9]/.test(m)) e.push('au moins un caractère spécial');
  const bas = m.toLowerCase();
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 3 && bas.includes(local)) e.push("ne doit pas contenir l'identifiant de l'e-mail");
  for (const part of [nom, prenom]) if (String(part).length >= 4 && bas.includes(String(part).toLowerCase())) { e.push('ne doit pas contenir votre nom ou prénom'); break; }
  if (COURANTS.some((c) => bas.includes(c))) e.push('mot de passe trop courant');
  if (/(.)\1{3,}/.test(m)) e.push('pas plus de 3 caractères identiques à la suite');
  return e;
}

module.exports = { erreursMotDePasse };
