'use client';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api';

/* ---------- Titres et états ---------- */
export function PageHeader({ titre, contexte, actions, retour }) {
  return (
    <header className="entete">
      <div>
        {retour && <Link className="retour" href={retour.href}>{retour.label}</Link>}
        <h1>{titre}</h1>
        {contexte && <p className="contexte">{contexte}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export const Chargement = ({ texte = 'Chargement…' }) => <p className="chargement" role="status">{texte}</p>;

export function Vide({ titre, children }) {
  return <div className="vide"><strong>{titre}</strong>{children}</div>;
}

/** Affiche une erreur d'API avec le détail utile (champs refusés, critères à corriger). */
export function ErreurApi({ erreur, action }) {
  if (!erreur) return null;
  const details = Array.isArray(erreur.details) ? erreur.details : null;
  return (
    <div className="message erreur" role="alert">
      {action ? <strong>{action} : </strong> : null}{erreur.message}
      {details && (
        <ul>
          {details.map((d, i) => (
            <li key={i}>{d.critere ? <strong>{d.critere} : </strong> : null}
              {d.message || (d.erreurs ? d.erreurs.map((e) => e.message).join(' ; ') : d.champ)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Boutons, pastilles ---------- */
export function Bouton({ variante, petit, className = '', ...props }) {
  return <button type="button" className={`btn ${variante || ''} ${petit ? 'petit' : ''} ${className}`} {...props} />;
}

export const Pastille = ({ ton, children }) => <span className={`badge ${ton || ''}`}>{children}</span>;

export function PastilleStatutCampagne({ statut }) {
  const ton = { OUVERTE: 'lagon', ROUVERTE: 'alerte', CLOTUREE: '' }[statut];
  const label = { OUVERTE: 'Ouverte', ROUVERTE: 'Rouverte', CLOTUREE: 'Clôturée' }[statut] || statut;
  return <Pastille ton={ton}>{label}</Pastille>;
}

export function PastilleStatutSaisie({ statut }) {
  if (!statut) return <Pastille>Non saisi</Pastille>;
  const ton = { BROUILLON: '', SOUMISE: 'lagon', RENVOYEE: 'alerte', VALIDEE: 'bon' }[statut];
  const label = { BROUILLON: 'Brouillon', SOUMISE: 'Soumise', RENVOYEE: 'À corriger', VALIDEE: 'Validée' }[statut] || statut;
  return <Pastille ton={ton}>{label}</Pastille>;
}

/* ---------- Champs ---------- */
export function Champ({ label, aide, children, id }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <div className="champ">
      <label htmlFor={fid}>{label}</label>
      {typeof children === 'function' ? children(fid) : children}
      {aide && <span className="aide">{aide}</span>}
    </div>
  );
}

/* ---------- Barres ---------- */
export function BarreAvancement({ valeur, total, label }) {
  const pct = total ? Math.round((valeur / total) * 100) : 0;
  return (
    <div title={label || `${valeur} sur ${total}`}>
      <div className={`avance ${total && valeur === total ? 'complet' : ''}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Avancement'}>
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EchelleScore({ score }) {
  const v = Math.max(0, Math.min(100, score ?? 0));
  return <div className="echelle" aria-hidden="true"><i style={{ width: `${v}%` }} /></div>;
}

/* ---------- Modale ---------- */
export function Modale({ titre, onClose, children, pied }) {
  const ref = useRef(null);
  useEffect(() => {
    const precedent = document.activeElement;
    const surTouche = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', surTouche);
    const premier = ref.current?.querySelector('input, select, textarea, button');
    premier?.focus();
    return () => { document.removeEventListener('keydown', surTouche); precedent?.focus?.(); };
  }, [onClose]);
  return (
    <div className="fond-modale" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modale" role="dialog" aria-modal="true" aria-label={titre} ref={ref}>
        <h2>{titre}</h2>
        {children}
        {pied && <div className="pied">{pied}</div>}
      </div>
    </div>
  );
}

/** Modale à formulaire : gère l'envoi, l'attente et l'erreur d'API. */
export function ModaleFormulaire({ titre, onClose, onSubmit, libelle = 'Enregistrer', children, danger }) {
  const [erreur, setErreur] = useState(null);
  const [attente, setAttente] = useState(false);
  const envoyer = async (e) => {
    e.preventDefault();
    setAttente(true); setErreur(null);
    try { await onSubmit(); onClose(); } catch (err) { setErreur(err instanceof ApiError ? err : new ApiError(0, 'ERROR', err.message)); } finally { setAttente(false); }
  };
  return (
    <Modale titre={titre} onClose={onClose}>
      <form onSubmit={envoyer}>
        <ErreurApi erreur={erreur} />
        {children}
        <div className="pied">
          <Bouton variante="secondaire" onClick={onClose}>Annuler</Bouton>
          <button type="submit" className={`btn ${danger ? 'danger' : ''}`} disabled={attente}>{attente ? 'Envoi…' : libelle}</button>
        </div>
      </form>
    </Modale>
  );
}

/* ---------- Notifications éphémères ---------- */
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const notifier = useCallback((message, erreur = false) => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l, { id, message, erreur }]);
    setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), erreur ? 7000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={notifier}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.erreur ? 'erreur' : ''}`}>{t.message}</div>)}
      </div>
    </ToastContext.Provider>
  );
}

/** Exécute une action d'API avec toast de succès et d'erreur. */
export function useAction() {
  const toast = useToast();
  return useCallback(async (fn, succes) => {
    try { const r = await fn(); if (succes) toast(succes); return r; } catch (e) { toast(e.message || 'Une erreur est survenue', true); return undefined; }
  }, [toast]);
}
