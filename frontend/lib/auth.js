'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { api, tokenStore } from '@/lib/api';

export const ROLES = {
  RESPONSABLE_POLE: 'RESPONSABLE_POLE',
  CONTROLE_GESTION: 'CONTROLE_GESTION',
  DIRECTION_GENERALE: 'DIRECTION_GENERALE',
  ADMINISTRATEUR: 'ADMINISTRATEUR',
};

export const LIBELLE_ROLE = {
  RESPONSABLE_POLE: 'Responsable de pôle',
  CONTROLE_GESTION: 'Contrôle de gestion',
  DIRECTION_GENERALE: 'Direction générale',
  ADMINISTRATEUR: 'Administrateur',
};

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [inactiviteMinutes, setInactiviteMinutes] = useState(30);

  useEffect(() => {
    if (!tokenStore.get()) { setReady(true); return; }
    api('/auth/me').then((u) => { setUser(u); if (u.inactiviteMinutes) setInactiviteMinutes(u.inactiviteMinutes); })
      .catch(() => tokenStore.clear()).finally(() => setReady(true));
  }, []);

  // Mot de passe provisoire (compte créé par l'administrateur) : seule la page « Mon compte » reste utilisable
  useEffect(() => {
    if (ready && user && user.mdpAChanger && pathname !== '/compte') router.replace('/compte?raison=mdp');
  }, [ready, user, pathname, router]);

  /** Relit le profil (ex. après le changement du mot de passe provisoire). */
  const rafraichirProfil = useCallback(async () => {
    const u = await api('/auth/me');
    setUser(u);
    return u;
  }, []);

  // Session terminée côté serveur (déconnexion ailleurs, inactivité, révocation) : retour à la connexion
  useEffect(() => {
    const onExpire = (e) => {
      const code = e && e.detail && e.detail.code;
      setUser(null);
      router.replace(code === 'SESSION_EXPIRED' ? '/login?raison=inactivite' : '/login?raison=session');
    };
    window.addEventListener('tj:unauthorized', onExpire);
    return () => window.removeEventListener('tj:unauthorized', onExpire);
  }, [router]);

  /** Enregistre les jetons reçus et ouvre la session dans l'application. */
  const ouvrirSession = useCallback((r) => {
    tokenStore.set(r.accessToken, r.refreshToken);
    if (r.inactiviteMinutes) setInactiviteMinutes(r.inactiviteMinutes);
    setUser(r.user);
  }, []);

  const logout = useCallback(async (raison) => {
    try { if (tokenStore.get()) await api('/auth/logout', { method: 'POST', sansRenouvellement: true }); } catch { /* la session locale est fermée dans tous les cas */ }
    tokenStore.clear();
    setUser(null);
    router.replace(raison ? `/login?raison=${raison}` : '/login');
  }, [router]);

  // Déconnexion automatique après inactivité (le serveur applique la même règle, c'est lui qui fait foi)
  useEffect(() => {
    if (!user) return undefined;
    let dernier = Date.now();
    let dernierPing = Date.now();
    const activite = () => {
      dernier = Date.now();
      // l'activité à l'écran est signalée au serveur au plus une fois par minute
      if (dernier - dernierPing > 60000) { dernierPing = dernier; api('/auth/me').catch(() => {}); }
    };
    const evts = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    evts.forEach((e) => window.addEventListener(e, activite, { passive: true }));
    const t = setInterval(() => { if (Date.now() - dernier > inactiviteMinutes * 60000) logout('inactivite'); }, 15000);
    return () => { evts.forEach((e) => window.removeEventListener(e, activite)); clearInterval(t); };
  }, [user, inactiviteMinutes, logout]);

  /**
   * Étape 1. Retourne { ok } si la session est ouverte, ou { secondFactor, enrollment, challengeToken }
   * lorsque le profil exige un second facteur.
   */
  const login = useCallback(async (email, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { email, password }, sansRenouvellement: true });
    if (r.requiresSecondFactor) return { secondFactor: true, enrollment: r.enrollment, challengeToken: r.challengeToken };
    ouvrirSession(r);
    return { ok: true };
  }, [ouvrirSession]);

  const verifier2fa = useCallback(async (challengeToken, code) => {
    ouvrirSession(await api('/auth/verify-2fa', { method: 'POST', body: { challengeToken, code }, sansRenouvellement: true }));
  }, [ouvrirSession]);

  return <Ctx.Provider value={{ user, ready, login, logout, verifier2fa, ouvrirSession, rafraichirProfil }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

/** Vrai si le rôle de l'utilisateur figure dans la liste. */
export const a = (user, ...roles) => Boolean(user && roles.includes(user.role));
