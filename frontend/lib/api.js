// Client unique de l'API. Aucun accès direct à la base : tout passe par ces appels.
const BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');
const KEY = 'tanjakai.token';
const KEY_REFRESH = 'tanjakai.refresh';

// Les jetons restent dans sessionStorage : ils disparaissent à la fermeture de l'onglet.
export const tokenStore = {
  get() { try { return window.sessionStorage.getItem(KEY); } catch { return null; } },
  getRefresh() { try { return window.sessionStorage.getItem(KEY_REFRESH); } catch { return null; } },
  set(access, refresh) {
    try {
      window.sessionStorage.setItem(KEY, access);
      if (refresh) window.sessionStorage.setItem(KEY_REFRESH, refresh);
    } catch { /* stockage indisponible */ }
  },
  clear() { try { window.sessionStorage.removeItem(KEY); window.sessionStorage.removeItem(KEY_REFRESH); } catch { /* stockage indisponible */ } },
};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function qs(query) {
  if (!query) return '';
  const p = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : '';
}

let renouvellement = null; // un seul renouvellement à la fois : le jeton de rafraîchissement est à usage unique

/** Échange le jeton de rafraîchissement contre de nouveaux jetons. Retourne true si la session continue. */
function renouveler() {
  if (renouvellement) return renouvellement;
  const refresh = tokenStore.getRefresh();
  if (!refresh) return Promise.resolve(false);
  renouvellement = fetch(`${BASE}/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }),
  }).then(async (res) => {
    if (!res.ok) {
      let e = {};
      try { e = ((await res.json()) || {}).error || {}; } catch { /* corps vide */ }
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent('tj:unauthorized', { detail: { code: e.code } }));
      return false;
    }
    const r = await res.json();
    tokenStore.set(r.accessToken, r.refreshToken);
    return true;
  }).catch(() => false).finally(() => { renouvellement = null; });
  return renouvellement;
}

/**
 * Appel de l'API. `passif` : requête d'arrière-plan qui ne compte pas comme activité de l'utilisateur
 * (sinon la relève des notifications empêcherait toute déconnexion pour inactivité).
 * `sansRenouvellement` : appels d'ouverture de session (aucun jeton à renouveler).
 */
export async function api(path, { method = 'GET', body, query, form, raw, passif, sansRenouvellement, _reessai } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (passif) headers['X-TJ-Passif'] = '1';
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  let res;
  try {
    res = await fetch(`${BASE}${path}${qs(query)}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, 'NETWORK', "Serveur injoignable. Vérifiez que l'API est démarrée.");
  }
  if (raw && res.ok) return res;
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* corps vide */ }
  if (!res.ok) {
    if (res.status === 401 && token) {
      const code = data && data.error && data.error.code;
      // jeton d'accès expiré : on le renouvelle une seule fois, puis on rejoue la requête
      if (code === 'INVALID_TOKEN' && !sansRenouvellement && !_reessai && tokenStore.getRefresh()) {
        if (await renouveler()) return api(path, { method, body, query, form, raw, passif, _reessai: true });
        throw new ApiError(401, 'SESSION_ENDED', 'Session terminée : reconnectez-vous');
      }
      if (!sansRenouvellement) {
        // session terminée côté serveur (déconnexion, inactivité, révocation)
        tokenStore.clear();
        window.dispatchEvent(new CustomEvent('tj:unauthorized', { detail: { code } }));
      }
    }
    const e = (data && data.error) || {};
    throw new ApiError(res.status, e.code || 'ERROR', e.message || `Erreur ${res.status}`, e.details);
  }
  return data;
}

/** Message lisible pour l'utilisateur, avec le détail des contrôles qui ont échoué. */
export function messageErreur(err) {
  if (!err) return '';
  const d = err.details;
  if (Array.isArray(d) && d.length) {
    const lignes = d.map((x) => {
      if (x.critere && Array.isArray(x.erreurs)) return `${x.critere} : ${x.erreurs.map((e) => e.message).join(', ')}`;
      if (x.champ) return `${x.champ} : ${x.message}`;
      return x.message || '';
    }).filter(Boolean);
    if (lignes.length) return `${err.message} — ${lignes.join(' ; ')}`;
  }
  return err.message || 'Une erreur est survenue';
}

/** Télécharge un fichier protégé (en-tête Authorization) puis l'ouvre dans le navigateur. */
export async function telecharger(path, nomFichier) {
  const res = await api(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
