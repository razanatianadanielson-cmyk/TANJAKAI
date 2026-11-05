'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { date, periode, rangPeriode, ROLES } from '@/lib/format';
import { Chargement, ErreurApi, PageHeader, PastilleStatutCampagne, Vide } from '@/components/ui';
import Avancement from '@/components/Avancement';
import Classement from '@/components/Classement';
import EvolutionScores from '@/components/EvolutionScores';

function joursRestants(dateLimite) {
  const j = Math.ceil((new Date(`${dateLimite}T23:59:59`) - new Date()) / 86400000);
  if (j < 0) return `échéance dépassée de ${-j} jour${-j > 1 ? 's' : ''}`;
  if (j === 0) return 'dernier jour';
  return `${j} jour${j > 1 ? 's' : ''} restant${j > 1 ? 's' : ''}`;
}

function CampagneEnCours({ campagne, role }) {
  const { data, error, loading } = useApi(`/campagnes/${campagne.id}/avancement`);
  return (
    <section className="section" aria-labelledby="h-encours">
      <div className="titre">
        <h2 id="h-encours">Campagne en cours : {periode(campagne)}</h2>
        <span className="muted">
          <PastilleStatutCampagne statut={campagne.statut} /> Échéance de saisie le {date(campagne.dateLimite)} ({joursRestants(campagne.dateLimite)})
        </span>
      </div>
      {loading && <Chargement />}
      <ErreurApi erreur={error} />
      {data && <Avancement campagneId={campagne.id} poles={data.poles} role={role} />}
    </section>
  );
}

export default function Accueil() {
  const { user } = useAuth();
  const campagnes = useApi('/campagnes', { limit: 100 });
  const liste = campagnes.data?.data || [];
  const enCours = useMemo(() => liste.filter((c) => c.statut !== 'CLOTUREE').sort((a, b) => rangPeriode(b) - rangPeriode(a))[0], [liste]);
  const derniereCloturee = useMemo(() => liste.filter((c) => c.statut === 'CLOTUREE').sort((a, b) => rangPeriode(b) - rangPeriode(a))[0], [liste]);
  const scores = useApi(derniereCloturee && user.role !== 'RESPONSABLE_POLE' ? '/scores' : null, { campagneId: derniereCloturee?.id, limit: 100 });
  const estResponsable = user.role === 'RESPONSABLE_POLE';

  return (
    <>
      <PageHeader
        titre={`Bonjour ${user.prenom}`}
        contexte={estResponsable
          ? 'Saisissez vos indicateurs du trimestre et suivez le score de votre pôle.'
          : `${ROLES[user.role]} : avancement des campagnes, classement des pôles et évolution des scores.`}
      />
      <ErreurApi erreur={campagnes.error} />
      {campagnes.loading && <Chargement />}

      {!campagnes.loading && enCours && <CampagneEnCours campagne={enCours} role={user.role} />}
      {!campagnes.loading && !enCours && !campagnes.error && (
        <section className="section">
          <div className="panneau">
            <Vide titre="Aucune campagne ouverte">
              {user.role === 'CONTROLE_GESTION'
                ? <>Ouvrez la campagne du trimestre pour que les responsables puissent saisir. <Link href="/campagnes">Aller aux campagnes</Link></>
                : 'Le contrôle de gestion ouvrira la prochaine campagne trimestrielle.'}
            </Vide>
          </div>
        </section>
      )}

      {!estResponsable && derniereCloturee && (
        <section className="section" aria-labelledby="h-classement">
          <div className="titre">
            <h2 id="h-classement">Classement {periode(derniereCloturee)}</h2>
            <Link href="/scores">Tous les scores</Link>
          </div>
          {scores.loading ? <Chargement /> : <Classement scores={scores.data?.data || []} />}
        </section>
      )}

      <section className="section" aria-labelledby="h-evolution">
        <div className="titre"><h2 id="h-evolution">{estResponsable ? 'Évolution de votre score' : 'Évolution des scores'}</h2></div>
        <div className="panneau pad"><EvolutionScores /></div>
      </section>
    </>
  );
}
