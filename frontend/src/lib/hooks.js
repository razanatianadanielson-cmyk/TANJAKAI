'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/** Charge une ressource GET ; `path` null = ne rien charger. Retourne { data, error, loading, reload }. */
export function useApi(path, params) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const cle = path ? path + JSON.stringify(params || {}) : null;
  const compteur = useRef(0);

  const charger = useCallback(async () => {
    if (!path) { setState({ data: null, error: null, loading: false }); return; }
    const mon = ++compteur.current;
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await api.get(path, params);
      if (mon === compteur.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (mon === compteur.current) setState({ data: null, error, loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  useEffect(() => { charger(); }, [charger]);
  return { ...state, reload: charger };
}
