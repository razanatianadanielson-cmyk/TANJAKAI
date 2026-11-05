'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, ROLES, LIBELLE_ROLE } from '@/lib/auth';
import { api } from '@/lib/api';
import { Chargement } from '@/components/ui';
import { Icone } from '@/components/Icones';
import ThemeBascule from '@/components/ThemeBascule';

const { RESPONSABLE_POLE: RP, CONTROLE_GESTION: CG, DIRECTION_GENERALE: DG, ADMINISTRATEUR: AD } = ROLES;

const NAV = [
  { href: '/', icone: 'tableau', libelle: 'Tableau de bord', roles: [RP, CG, AD] },
  { href: '/direction', icone: 'direction', libelle: 'Vue de direction', roles: [DG, CG, AD] },
  { href: '/saisie', icone: 'saisie', libelle: 'Ma saisie', roles: [RP] },
  { href: '/controle', icone: 'controle', libelle: 'Contrôle des saisies', roles: [CG] },
  { href: '/syntheses', icone: 'syntheses', libelle: 'Synthèses', roles: [RP, CG, DG] },
  { href: '/alertes', icone: 'alertes', libelle: 'Alertes', roles: [RP, CG, DG, AD] },
  { href: '/campagnes', icone: 'campagnes', libelle: 'Campagnes', roles: [CG, AD, DG] },
  { href: '/scores', icone: 'scores', libelle: 'Scores', roles: [RP, CG, DG, AD] },
  { href: '/cibles', icone: 'cibles', libelle: 'Cibles', roles: [CG, DG, AD, RP] },
  { href: '/grilles', icone: 'grilles', libelle: 'Grilles de notation', roles: [CG, DG, AD] },
  { href: '/criteres', icone: 'criteres', libelle: 'Critères', roles: [CG, AD, DG, RP] },
  { href: '/poles', icone: 'poles', libelle: 'Pôles', roles: [CG, AD, DG, RP] },
  { href: '/administration', icone: 'administration', libelle: 'Administration', roles: [AD] },
  { href: '/compte', icone: 'compte', libelle: 'Mon compte', roles: [RP, CG, DG, AD] },
];

export default function Shell({ children }) {
  const { user, ready, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [nonLues, setNonLues] = useState(0);

  useEffect(() => { if (ready && !user) router.replace('/login'); }, [ready, user, router]);
  useEffect(() => { setOuvert(false); }, [pathname]);

  useEffect(() => {
    if (!user) return undefined;
    let vivant = true;
    const charger = () => api('/notifications', { query: { limit: 1 }, passif: true }).then((r) => { if (vivant) setNonLues(r.nonLues); }).catch(() => {});
    charger();
    const t = setInterval(charger, 60000);
    return () => { vivant = false; clearInterval(t); };
  }, [user, pathname]);

  if (!ready || !user) return <Chargement>Ouverture de la session…</Chargement>;

  const liens = user.mdpAChanger ? [] : NAV.filter((l) => l.roles.includes(user.role));
  const actif = (href) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className="coque">
      <div className="barre-mobile">
        <span>TANJAKAI</span>
        <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert}><Icone nom="menu" taille={18} />Menu</button>
      </div>
      <aside className={`menu ${ouvert ? 'ouvert' : ''}`}>
        <div className="marque">
          <strong>TANJAKAI</strong>
          <span>Notation des pôles</span>
        </div>
        <nav aria-label="Navigation principale">
          {liens.map((l) => (
            <Link key={l.href} href={l.href} aria-current={actif(l.href) ? 'page' : undefined}>
              <span className="lib"><Icone nom={l.icone} taille={18} />{l.libelle}</span>
              {l.href === '/' && nonLues > 0 ? <span className="pastille" title="Notifications non lues">{nonLues}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="pied">
          <b>{user.prenom} {user.nom}</b>
          {LIBELLE_ROLE[user.role]}
          <ThemeBascule />
          <button type="button" className="secondaire" onClick={() => logout()}><Icone nom="deconnexion" taille={16} />Se déconnecter</button>
        </div>
      </aside>
      <main className="contenu">{children}</main>
    </div>
  );
}
