'use client';
import { messageErreur } from '@/lib/api';
import { Icone } from '@/components/Icones';

export function PageHeader({ titre, sousTitre, actions }) {
  return (
    <div className="entete">
      <div>
        <h1>{titre}</h1>
        {sousTitre ? <p>{sousTitre}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

export function Carte({ titre, actions, children, sansMarge }) {
  return (
    <section className="carte">
      {(titre || actions) && (
        <header>
          {titre ? <h2>{titre}</h2> : <span />}
          {actions ? <div className="actions">{actions}</div> : null}
        </header>
      )}
      {sansMarge ? children : <div className="corps">{children}</div>}
    </section>
  );
}

export function Message({ type = 'info', children }) {
  if (!children) return null;
  const nom = { erreur: 'erreur', ok: 'succes', info: 'info', attention: 'attention' }[type] || 'info';
  return <div className={`msg ${type}`} role={type === 'erreur' ? 'alert' : 'status'}><Icone nom={nom} taille={19} /><div className="msg-texte">{children}</div></div>;
}

export function Erreur({ erreur }) {
  return erreur ? <Message type="erreur">{messageErreur(erreur)}</Message> : null;
}

export function Chargement({ children = 'Chargement…' }) {
  return <div className="chargement" role="status">{children}</div>;
}

export function Vide({ titre, children }) {
  return (
    <div className="vide">
      <Icone nom="vide" taille={34} />
      <strong>{titre}</strong>
      {children}
    </div>
  );
}

export function Champ({ label, aide, children, id }) {
  return (
    <div className="champ">
      <label htmlFor={id}>{label}</label>
      {children}
      {aide ? <div className="aide">{aide}</div> : null}
    </div>
  );
}

const ETATS = {
  A_SAISIR: ['À saisir', 'neutre'],
  BROUILLON: ['Brouillon', 'attention'],
  SOUMISE: ['Soumise', 'attente'],
  VALIDEE: ['Validée', 'ok'],
  RENVOYEE: ['Renvoyée', 'danger'],
  OUVERTE: ['Ouverte', 'ok'],
  ROUVERTE: ['Rouverte', 'attention'],
  CLOTUREE: ['Clôturée', 'neutre'],
  VALIDEE_GRILLE: ['Validée', 'ok'],
  ACTIF: ['Actif', 'ok'],
  SUSPENDU: ['Suspendu', 'attention'],
  ACTIVE: ['À traiter', 'danger'],
  ACCUSEE: ['Prise en compte', 'attention'],
  A_FAIRE: ['À faire', 'neutre'],
  EN_COURS: ['En cours', 'attente'],
  TERMINE: ['Terminée', 'ok'],
};

export function Etat({ statut, libelle, ton }) {
  const [texte, classe] = ETATS[statut] || [statut, 'neutre'];
  const t = ton || classe;
  const nom = { ok: 'succes', attente: 'horloge', attention: 'attention', danger: 'erreur' }[t];
  return <span className={`etat ${t}${nom ? ' avec-icone' : ''}`}>{nom ? <Icone nom={nom} taille={13} /> : null}{libelle || texte}</span>;
}

/** Barre de progression d'une campagne : validées, soumises, brouillons, renvoyées sur le total attendu. */
export function Progression({ total, validees = 0, soumises = 0, brouillons = 0, renvoyees = 0 }) {
  const p = (n) => (total ? `${(n / total) * 100}%` : '0%');
  return (
    <div className="progres" role="img" aria-label={`${validees} validées, ${soumises} soumises, ${brouillons} brouillons, ${renvoyees} renvoyées sur ${total}`}>
      <i className="v" style={{ width: p(validees) }} />
      <i className="s" style={{ width: p(soumises) }} />
      <i className="b" style={{ width: p(brouillons) }} />
      <i className="r" style={{ width: p(renvoyees) }} />
    </div>
  );
}

export function LegendeProgression() {
  return (
    <div className="legende">
      <span style={{ '--c': 'var(--ok)' }}>Validées</span>
      <span style={{ '--c': '#4aa3e8' }}>Soumises</span>
      <span style={{ '--c': 'var(--alerte)' }}>Brouillons</span>
      <span style={{ '--c': 'var(--danger)' }}>Renvoyées</span>
    </div>
  );
}
