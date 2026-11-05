'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { date, dateHeure, nombre, periode } from '@/lib/format';
import {
  Bouton, Champ, Chargement, ErreurApi, Modale, ModaleFormulaire, PageHeader, Pastille, PastilleStatutCampagne, useToast,
} from '@/components/ui';
import Avancement from '@/components/Avancement';
import Classement from '@/components/Classement';

/** Calcul à blanc : POST /simuler ne modifie rien ; lancé une fois à l'ouverture de la modale. */
function SimulationContenu({ id, onClose }) {
  const [etat, setEtat] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    let annule = false;
    api.post(`/campagnes/${id}/simuler`)
      .then((data) => { if (!annule) setEtat({ data, error: null, loading: false }); })
      .catch((error) => { if (!annule) setEtat({ data: null, error, loading: false }); });
    return () => { annule = true; };
  }, [id]);
  return (
    <Modale titre="Simulation du calcul (rien n'est enregistré)" onClose={onClose} pied={<Bouton variante="secondaire" onClick={onClose}>Fermer</Bouton>}>
      {etat.loading && <Chargement texte="Calcul en cours…" />}
      <ErreurApi erreur={etat.error} />
      {etat.data && (
        <div className="tableau-wrap">
          <table>
            <thead><tr><th>Pôle</th><th className="nb">Score</th><th>Remarques</th></tr></thead>
            <tbody>
              {etat.data.scores.map((s) => (
                <tr key={s.poleId}>
                  <td><strong>{s.poleCode}</strong></td>
                  <td className="nb"><strong>{nombre(s.scoreConsolide, 2)}</strong></td>
                  <td>
                    {s.partiel ? <Pastille ton="alerte">Score partiel</Pastille> : <Pastille ton="bon">Complet</Pastille>}
                    {(s.anomalies || []).map((a, i) => <div key={i} className="petit muted">{typeof a === 'string' ? a : a.message}</div>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modale>
  );
}

export default function DetailCampagne() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const campagne = useApi(`/campagnes/${id}`);
  const avancement = useApi(`/campagnes/${id}/avancement`);
  const c = campagne.data;
  const scores = useApi(c?.statut === 'CLOTUREE' ? '/scores' : null, { campagneId: id, limit: 100 });
  const [modale, setModale] = useState(null); // 'simuler' | 'cloturer' | 'rouvrir'
  const [motif, setMotif] = useState('');
  const recharger = () => { campagne.reload(); avancement.reload(); scores.reload(); };

  if (campagne.loading) return <Chargement />;
  if (campagne.error) return <><PageHeader titre="Campagne" retour={{ href: '/campagnes', label: '← Toutes les campagnes' }} /><ErreurApi erreur={campagne.error} /></>;

  const controle = user.role === 'CONTROLE_GESTION';
  const ouverte = c.statut !== 'CLOTUREE';

  const cloturer = async () => {
    const r = await api.post(`/campagnes/${id}/cloturer`);
    toast(`Campagne clôturée : ${r.scores.length} score(s) calculé(s) et figé(s).`);
    recharger();
  };
  const rouvrir = async () => {
    await api.post(`/campagnes/${id}/rouvrir`, { motif });
    toast('Campagne rouverte. Les responsables sont notifiés.');
    setMotif('');
    recharger();
  };

  return (
    <>
      <PageHeader
        titre={`Campagne ${periode(c)}`}
        retour={{ href: '/campagnes', label: '← Toutes les campagnes' }}
        contexte={<><PastilleStatutCampagne statut={c.statut} /> Ouverte le {date(c.dateOuverture)}, échéance le {date(c.dateLimite)}{c.dateCloture ? `, clôturée le ${date(c.dateCloture)}` : ''}.</>}
        actions={(
          <>
            {controle && ouverte && <Bouton variante="secondaire" onClick={() => setModale('simuler')}>Simuler le calcul</Bouton>}
            {controle && ouverte && <Bouton onClick={() => setModale('cloturer')}>Clôturer la campagne</Bouton>}
            {(controle || user.role === 'ADMINISTRATEUR') && !ouverte && <Bouton variante="secondaire" onClick={() => setModale('rouvrir')}>Rouvrir…</Bouton>}
          </>
        )}
      />

      {c.statut === 'ROUVERTE' && (
        <div className="message avert">Cette campagne a été rouverte. Une nouvelle clôture produira une nouvelle version des scores ; l&apos;ancienne reste consultable.</div>
      )}

      <section className="section">
        <div className="titre"><h2>Avancement de la saisie</h2></div>
        {avancement.loading && <Chargement />}
        <ErreurApi erreur={avancement.error} />
        {avancement.data && <Avancement campagneId={id} poles={avancement.data.poles} role={user.role} />}
      </section>

      {c.statut === 'CLOTUREE' && (
        <section className="section">
          <div className="titre"><h2>Scores de la campagne</h2></div>
          {scores.loading ? <Chargement /> : <Classement scores={scores.data?.data || []} />}
        </section>
      )}

      {c.reouvertures?.length > 0 && (
        <section className="section">
          <div className="titre"><h2>Réouvertures</h2></div>
          <div className="tableau-wrap">
            <table>
              <thead><tr><th>Date</th><th>Motif</th></tr></thead>
              <tbody>{c.reouvertures.map((r) => <tr key={r.id}><td style={{ whiteSpace: 'nowrap' }}>{dateHeure(r.date)}</td><td>{r.motif}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      )}

      {modale === 'simuler' && <SimulationContenu id={id} onClose={() => setModale(null)} />}
      {modale === 'cloturer' && (
        <ModaleFormulaire titre="Clôturer la campagne" libelle="Clôturer et calculer" onClose={() => setModale(null)} onSubmit={cloturer}>
          <p>La clôture verrouille toutes les saisies, calcule les scores et les fige avec les valeurs, cibles et pondérations utilisées.</p>
          <p className="muted" style={{ marginTop: '0.5rem' }}>Toutes les saisies soumises doivent d&apos;abord être validées ou renvoyées.</p>
        </ModaleFormulaire>
      )}
      {modale === 'rouvrir' && (
        <ModaleFormulaire titre="Rouvrir la campagne" libelle="Rouvrir" onClose={() => setModale(null)} onSubmit={rouvrir}>
          <Champ label="Motif de la réouverture" aide="Le motif est conservé, tracé dans le journal d'audit et envoyé aux responsables.">
            {(fid) => <textarea id={fid} required minLength={5} value={motif} onChange={(e) => setMotif(e.target.value)} />}
          </Champ>
        </ModaleFormulaire>
      )}
    </>
  );
}
