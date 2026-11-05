const env = require('../../config/env');

/** Le service d'assistance est indisponible ou refusé : l'appelant bascule en mode dégradé. `raison` est lisible et journalisable. */
class AssistanceIndisponible extends Error {
  constructor(raison) { super(raison); this.raison = raison; }
}

const enAttente = (v) => (v === undefined || v === null ? 0 : Number(v));

/**
 * Appel à OpenRouter (compatible chat/completions). Exécuté UNIQUEMENT côté serveur : la clé ne quitte jamais le serveur.
 * Renvoie { contenu, modele, tokensEntree, tokensSortie, cout }.
 */
async function completer(messages, { fetchImpl = fetch } = {}) {
  if (!env.OPENROUTER_API_KEY) throw new AssistanceIndisponible('Service d\'assistance non configuré (clé absente)');
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), env.OPENROUTER_TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(`${env.OPENROUTER_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'TANJAKAI',
      },
      body: JSON.stringify({ model: env.OPENROUTER_MODEL, messages, max_tokens: env.OPENROUTER_MAX_TOKENS, temperature: 0.2 }),
    });
  } catch (err) {
    throw new AssistanceIndisponible(err.name === 'AbortError' ? 'Délai dépassé' : 'Service injoignable');
  } finally {
    clearTimeout(minuteur);
  }
  if (!res.ok) throw new AssistanceIndisponible(`Réponse HTTP ${res.status} du service d'assistance`);
  let json;
  try { json = await res.json(); } catch { throw new AssistanceIndisponible('Réponse illisible'); }
  const contenu = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (typeof contenu !== 'string' || !contenu.trim()) throw new AssistanceIndisponible('Réponse vide');
  const u = json.usage || {};
  return {
    contenu: contenu.trim(),
    modele: json.model || env.OPENROUTER_MODEL,
    tokensEntree: Math.round(enAttente(u.prompt_tokens)),
    tokensSortie: Math.round(enAttente(u.completion_tokens)),
    cout: enAttente(u.cost), // coût facturé, renvoyé par OpenRouter dans chaque réponse
  };
}

module.exports = { completer, AssistanceIndisponible };
