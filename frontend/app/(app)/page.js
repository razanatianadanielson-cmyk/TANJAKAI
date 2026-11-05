'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, ROLES } from '@/lib/auth';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { trimestre, date, dateHeure } from '@/lib/format';
import { PageHeader, Carte, Erreur, Chargement, Vide, Etat, Progression, LegendeProgression } from '@/components/ui';

export default function TableauDeBord() {
  const { user } = useAuth();
  const router = useRouter();
  const direction = user.role === ROLES.DIRECTION_GENERALE;
  useEffect(() => { if (direction) router.replace('/direction'); }, [direction, router]);

  const campagnes = useAsync(() => api('/campagnes', { query: { limit: 20 } }), []);
  const notifications = useAsync(() => api('/notifications', { query: { limit: 8 } }), []);

  const active = (campagnes.data?.data || []).find((c) => c.statut !== 'CLOTUREE');
  const avancement = useAsync(() => api(`/campagnes/${active.id}/avancement`), [active?.id], Boolean(active));

  if (direction) return <Chargement>Ouverture de la vue de direction…</Chargement>;
  const responsable = user.role === ROLES.RESPONSABLE_POLE;
  const controle = user.role === ROLES.CONTROLE_GESTION;

  async function toutLire() {
    await api('/notifications/lues', { method: 'POST' });
    notifications.reload();
  }

  return (
    <>
      <PageHeader titre={`Bonjour ${user.prenom}`}
        sousTitre={responsable ? 'Renseignez les indicateurs de votre pôle avant la date limite de la campagne.' : "Suivez l'avancement de la campagne en cours."} />

      <Erreur erreur={campagnes.error} />
      {campagnes.loading ? <Chargement /> : (
        <Carte titre={active ? `Campagne ${trimestre(active)}` : 'Campagne en cours'}
          actions={active ? <><Etat statut={active.statut} /><small>Date limite : {date(active.dateLimite)}</small></> : null}
          sansMarge>
          {!active ? (
            <Vide titre="Aucune campagne ouverte">
              {controle ? <p>Ouvrez la campagne du trimestre depuis <Link href="/campagnes">Campagnes</Link>.</p> : <p>Vous serez notifié à l'ouverture de la prochaine campagne.</p>}
            </Vide>
          ) : (
            <>
              <Erreur erreur={avancement.error} />
              {avancement.loading ? <Chargement /> : (
                <div className="defile">
                  <table>
                    <thead><tr><th>Pôle</th><th>Famille</th><th className="num">Indicateurs</th><th>Avancement</th><th /></tr></thead>
                    <tbody>
                      {(avancement.data?.poles || []).map((p) => (
                        <tr key={p.poleId}>
                          <td><b>{p.poleCode}</b><br /><small>{p.intitule}</small></td>
                          <td>{p.famille}</td>
                          <td className="num">{p.saisies} / {p.total}</td>
                          <td style={{ minWidth: 180 }}><Progression total={p.total} validees={p.validees} soumises={p.soumises} brouillons={p.brouillons} renvoyees={p.renvoyees} /></td>
                          <td>
                            {responsable && <Link className="bouton secondaire" href={`/saisie?campagne=${active.id}&pole=${p.poleId}`}>Saisir</Link>}
                            {controle && <Link className="bouton secondaire" href={`/controle?campagne=${active.id}&pole=${p.poleId}`}>Contrôler</Link>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ padding: '0 18px 14px' }}><LegendeProgression /></div>
                </div>
              )}
            </>
          )}
        </Carte>
      )}

      <Carte titre="Notifications" actions={notifications.data?.nonLues ? <button type="button" className="secondaire" onClick={toutLire}>Tout marquer comme lu</button> : null} sansMarge>
        <Erreur erreur={notifications.error} />
        {notifications.loading ? <Chargement /> : (notifications.data?.data || []).length === 0 ? (
          <Vide titre="Rien de nouveau">Les ouvertures de campagne, renvois et réouvertures apparaissent ici.</Vide>
        ) : (
          <table>
            <tbody>
              {notifications.data.data.map((n) => (
                <tr key={n.id}>
                  <td style={{ width: 22 }}>{!n.lue ? <span className="pastille" aria-label="Non lue" style={{ minWidth: 10, height: 10, padding: 0 }} /> : null}</td>
                  <td style={{ fontWeight: n.lue ? 400 : 600 }}>{n.message}</td>
                  <td className="discret" style={{ whiteSpace: 'nowrap' }}>{dateHeure(n.dateEnvoi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Carte>
    </>
  );
}
