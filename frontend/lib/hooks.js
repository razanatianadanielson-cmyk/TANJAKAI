'use client';
import { useEffect, useState, useCallback } from 'react';

/** Charge des données ; `reload()` relance l'appel. `enabled=false` suspend le chargement. */
export function useAsync(fn, deps, enabled = true) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) { setState({ data: null, error: null, loading: false }); return undefined; }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then(
      (data) => { if (alive) setState({ data, error: null, loading: false }); },
      (error) => { if (alive) setState({ data: null, error, loading: false }); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

/** Paramètres de l'URL, lus côté navigateur uniquement (évite les contraintes de rendu statique). */
export function useQueryParams() {
  const [params, setParams] = useState({});
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setParams(Object.fromEntries(p.entries()));
  }, []);
  return params;
}
