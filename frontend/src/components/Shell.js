'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { ROLES, dateHeure } from '@/lib/format';

const TOUS = ['RESPONSABLE_POLE', 'CONTROLE_GESTION', 'DIRECTION_GENERALE', 'ADMINISTRATEUR'];
const GESTION = ['CONTROLE_GESTION', 'DIRECTION_GENERALE', 'ADMINISTRATEUR'];

const MENU = [
  { href: '/', label: () => 'Accueil', roles: TOUS },
  { href: '/campagnes', label: (r) => (r === 'RESPONSABLE_POLE' ? 'Ma saisie' : 'Campagnes'), roles: TOUS },
  { href: '/scores', label: (r) => (r === 'RESPONSABLE_POLE' ? 'Mes scores' : 'Scores et classement'), roles: TOUS },
  { groupe: 'Référentiel', roles: TOUS },
  { href: '/poles', label: () => 'Pôles', roles: GESTION },
  { href: '/referentiel/criteres', label: () => 'Critères', roles: GESTION },
  { href: '/referentiel/grilles', label: () => 'Grilles de notation', roles: GESTION },
  { href: '/referentiel/cibles', label: (r) => (r === 'RESPONSABLE_POLE' ? 'Mes cibles' : 'Cibles'), roles: TOUS },
  { href: '/referentiel/familles', label: () => 'Familles d\'activité', roles: GESTION },
];

function actif(pathname, href) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function Cloche() {
  const [ouvert, setOuvert] = useState(false);
  const [etat, setEtat] = useState({ data: [], nonLues: 0 });
  const zone = useRef(null);

  const charger = useCallback(async () => {
    try { setEtat(await api.get('/notifications', { limit: 20 })); } catch { /* silencieux : la cloche n'est pas critique */ }
  }, []);

  useEffect(() => {
    charger();
    const t = setInterval(charger, 60000);
    return () => clearInterval(t);
  }, [charger]);

  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (zone.current && !zone.current.contains(e.target)) setOuvert(false); };
    const echap = (e) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', dehors);
    document.addEventListener('keydown', echap);
    return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', echap); };
  }, [ouvert]);

  const toutLire = async () => { await api.post('/notifications/lues'); charger(); };

  return (
    <div className="cloche" ref={zone}>
      <button type="button" aria-expanded={ouvert} aria-haspopup="true" onClick={() => { setOuvert((o) => !o); charger(); }}>
        Notifications{etat.nonLues > 0 && <span className="compteur" aria-label={`${etat.nonLues} non lues`}>{etat.nonLues}</span>}
      </button>
      {ouvert && (
        <div className="tiroir">
          <div className="tete">
            <span>Notifications</span>
            {etat.nonLues > 0 && <button type="button" className="btn discret petit" onClick={toutLire}>Tout marquer comme lu</button>}
          </div>
          {etat.data.length === 0 ? (
            <p className="vide">Rien de nouveau pour le moment.</p>
          ) : (
            <ul className="liste-plate">
              {etat.data.map((n) => (
                <li key={n.id} className={n.lue ? '' : 'non-lue'}>
                  {n.campagneId ? <Link href={`/campagnes/${n.campagneId}`} onClick={() => setOuvert(false)}>{n.message}</Link> : n.message}
                  <time dateTime={n.dateEnvoi}>{dateHeure(n.dateEnvoi)}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function Shell({ children }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);

  useEffect(() => { setMenu(false); }, [pathname]);

  return (
    <div className="shell">
      <aside className={`rail ${menu ? 'ouvert' : ''}`} aria-label="Navigation principale">
        <div className="marque"><strong>Tanjakai</strong><span>Notation des pôles</span></div>
        <nav>
          {MENU.filter((m) => m.roles.includes(user.role)).map((m, i) => (m.groupe
            ? <p className="rail-groupe" key={`g${i}`}>{m.groupe}</p>
            : (
              <Link key={m.href} href={m.href} className="lien" aria-current={actif(pathname, m.href) ? 'page' : undefined}>
                {m.label(user.role)}
              </Link>
            )))}
        </nav>
        <div className="rail-bas">
          <div className="nom">{user.prenom} {user.nom}</div>
          <div>{ROLES[user.role]}</div>
          <button type="button" onClick={logout}>Se déconnecter</button>
        </div>
      </aside>
      <div className="principal">
        <div className="barre-haut">
          <button type="button" className="btn secondaire petit menu-mobile" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>Menu</button>
          <Cloche />
        </div>
        <main className="contenu">{children}</main>
      </div>
    </div>
  );
}
