// Client de l'API REST. Le navigateur ne parle qu'à l'API : jamais à la base, jamais à OpenRouter.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
const TOKEN_KEY = 'tjk_token';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try { token ? sessionStorage.setItem(TOKEN_KEY, token) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* stockage indisponible */ }
}

function url(path, params) {
  const u = new URL(API_URL + path);
  Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v); });
  return u.toString();
}

async function request(path, { method = 'GET', body, params, form, blob } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(url(path, params), { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Impossible de joindre le serveur. Vérifiez que l\'API est démarrée.');
  }
  if (blob && res.ok) return res.blob();
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const e = (data && data.error) || {};
    if (res.status === 401 && token && typeof window !== 'undefined') window.dispatchEvent(new Event('tjk:unauthorized'));
    throw new ApiError(res.status, e.code || 'ERROR', e.message || `Erreur ${res.status}`, e.details);
  }
  return data;
}

export const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: 'POST', body: body === undefined ? {} : body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  upload: (path, form) => request(path, { method: 'POST', form }),
  blob: (path) => request(path, { blob: true }),
};
