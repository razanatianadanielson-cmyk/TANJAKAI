'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useAuth, ROLES } from '@/lib/auth';
import { trimestre, nombre, dateHeure, date } from '@/lib/format';
import { PageHeader, Carte, Erreur, Chargement, Etat, Champ, Message } from '@/components/ui';
import { TypeAlerte, Icone } from '@/components/Icones';

const PLAN_VIDE = () => ({ description: '', echeance: '' });

export default function DetailAlerte() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data: a, error, loading, reload } = useAsync(() => api(`/alertes/${id}`), [id]);
  const estResponsable = user && user.role === ROLES.RESPONSABLE_POLE;
  const estCG = user && user.role === ROLES.CONTROLE_GESTION;

  const [lignes, setLignes] = useState([PLAN_VIDE()]);
  const [action, setAction] = useState(PLAN_VIDE());
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [aujourdhui, setAujourdhui] = useState('');
  useEffect(() => { setAujourdhui(new Date().toISOString().slice(0, 10)); }, []);

  async function agir(fn, ok) {
    setErreur(null); setMessage(''); setOccupe(true);
    try { await fn(); setMessage(ok); reload(); return true; } catch (e) { setErreur(e); return false; } finally { setOccupe(false); }
  }

  const accuser = (e) => {
    e.preventDefault();
    return agir(() => api(`/alertes/${id}/accuser`, { method: 'POST', body: { plans: lignes } }),
      'Alerte prise en compte. Le contrôle de gestion en est informé.');
  };
  const ajouter = async (e) => {
    e.preventDefault();
    if (await agir(() => api(`/alertes/${id}/plans`, { method: 'POST', body: action }), 'Action ajoutée au plan.')) setAction(PLAN_VIDE());
  };
  const changer = (planId, statut) => agir(() => api(`/alertes/${id}/plans/${planId}`, { method: 'PATCH', body: { statut } }), 'Action mise à jour.');
  const cloturer = () => agir(() => api(`/alertes/${id}/cloturer`, { method: 'POST' }), 'Alerte clôturée.');
  const maj = (i, champ, v) => setLignes(lignes.map((l, k) => (k === i ? { ...l, [champ]: v } : l)));

  if (loading) return <Chargement />;
  if (error) return <><Erreur erreur={error} /><Link href="/alertes">Retour aux alertes</Link></>;

  const figee = a.statut === 'CLOTUREE';
  const peutTraiter = (estResponsable || estCG) && !figee;

  return (
    <>
      <PageHeader titre={`${a.poleCode} — ${trimestre(a)}`} sousTitre={a.poleIntitule}
        actions={<Link className="bouton secondaire" href="/alertes">Toutes les alertes</Link>} />
      <Message type="ok">{message}</Message>
      <Erreur erreur={erreur} />

      <Carte titre="Alerte" actions={<><TypeAlerte type={a.type} /> <Etat statut={a.statut} /></>}>
        <p className="alerte-texte">{a.message}</p>
        <p style={{ margin: 0 }}>
          Score consolidé <b>{nombre(a.scoreConsolide, 1)}</b> pour un seuil critique de <b>{nombre(a.seuil, 0)}</b>. Créée le {dateHeure(a.dateCreation)}.
          {a.dateAccuse ? ` Prise en compte le ${dateHeure(a.dateAccuse)}.` : ''}
        </p>
        {a.partiel && <Message type="attention">Ce score est partiel : la campagne était incomplète au moment du calcul.</Message>}
      </Carte>

      {a.statut === 'ACTIVE' && estResponsable && (
        <Carte titre="Prendre en compte l’alerte">
          <p className="alerte-texte">L’accusé de prise en compte s’accompagne d’un plan d’action : au moins une action, avec son échéance.</p>
          <form onSubmit={accuser}>
            {lignes.map((l, i) => (
              <div className="ligne-plan" key={i}>
                <Champ label={`Action ${i + 1}`} id={`d${i}`}>
                  <input id={`d${i}`} value={l.description} minLength={3} maxLength={1000} onChange={(e) => maj(i, 'description', e.target.value)} required />
                </Champ>
                <Champ label="Échéance" id={`e${i}`}>
                  <input id={`e${i}`} type="date" min={aujourdhui} value={l.echeance} onChange={(e) => maj(i, 'echeance', e.target.value)} required />
                </Champ>
                {lignes.length > 1 ? <button type="button" className="secondaire" onClick={() => setLignes(lignes.filter((_, k) => k !== i))}>Retirer</button> : <span />}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="secondaire" onClick={() => setLignes([...lignes, PLAN_VIDE()])}><Icone nom="plus" taille={16} />Ajouter une action</button>
              <button type="submit" disabled={occupe}>Accuser réception et valider le plan</button>
            </div>
          </form>
        </Carte>
      )}

      {a.statut === 'ACTIVE' && !estResponsable && (
        <Message type="info">Cette alerte attend la prise en compte du responsable du pôle.</Message>
      )}

      {a.statut !== 'ACTIVE' && (
        <Carte titre="Plan d’action" sansMarge>
          <div className="defile">
            <table>
              <thead><tr><th>Action</th><th>Échéance</th><th>État</th>{peutTraiter ? <th>Mettre à jour</th> : null}</tr></thead>
              <tbody>
                {a.plans.map((p) => (
                  <tr key={p.id}>
                    <td>{p.description}</td>
                    <td className={p.enRetard ? 'retard' : undefined}>{date(p.echeance)}{p.enRetard ? ' — en retard' : ''}</td>
                    <td><Etat statut={p.statut} /></td>
                    {peutTraiter ? (
                      <td>
                        <select aria-label={`État de l’action ${p.description}`} value={p.statut} disabled={occupe} onChange={(e) => changer(p.id, e.target.value)}>
                          <option value="A_FAIRE">À faire</option><option value="EN_COURS">En cours</option><option value="TERMINE">Terminée</option>
                        </select>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Carte>
      )}

      {a.statut === 'ACCUSEE' && peutTraiter && (
        <Carte titre="Ajouter une action">
          <form onSubmit={ajouter}>
            <div className="ligne-plan">
              <Champ label="Action" id="na"><input id="na" value={action.description} minLength={3} maxLength={1000} onChange={(e) => setAction({ ...action, description: e.target.value })} required /></Champ>
              <Champ label="Échéance" id="ne"><input id="ne" type="date" min={aujourdhui} value={action.echeance} onChange={(e) => setAction({ ...action, echeance: e.target.value })} required /></Champ>
              <button type="submit" disabled={occupe}><Icone nom="plus" taille={16} />Ajouter</button>
            </div>
          </form>
        </Carte>
      )}

      {a.statut === 'ACCUSEE' && estCG && (
        <Carte titre="Clôture">
          <p className="alerte-texte">
            {a.nbPlansOuverts ? `${a.nbPlansOuverts} action(s) restent à terminer. ` : 'Toutes les actions sont terminées. '}
            La clôture conserve l’alerte et son plan dans l’historique.
          </p>
          <button type="button" disabled={occupe} onClick={cloturer}><Icone nom="cadenas" taille={16} />Clôturer l’alerte</button>
        </Carte>
      )}
    </>
  );
}
