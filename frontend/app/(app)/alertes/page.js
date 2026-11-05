'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useAuth, ROLES } from '@/lib/auth';
import { trimestre, nombre, dateHeure, date } from '@/lib/format';
import { PageHeader, Carte, Erreur, Chargement, Vide, Etat, Champ, Message } from '@/components/ui';
import { TypeAlerte, LIBELLE_TYPE, Icone } from '@/components/Icones';

export default function Alertes() {
  const { user } = useAuth();
  const peutParametrer = user && [ROLES.CONTROLE_GESTION, ROLES.ADMINISTRATEUR].includes(user.role);
  const voitSeuils = user && user.role !== ROLES.RESPONSABLE_POLE;
  const [vue, setVue] = useState('actives');
  const [type, setType] = useState('');
  const alertes = useAsync(() => api('/alertes', {
    query: { limit: 100, type, ...(vue === 'actives' ? { actives: true } : vue === 'cloturees' ? { statut: 'CLOTUREE' } : {}) },
  }), [vue, type]);
  const seuils = useAsync(() => api('/seuils'), [], !!voitSeuils);
  const liste = (alertes.data && alertes.data.data) || [];

  const [form, setForm] = useState({ valeur: '50', ecartDegradation: '15', dateEffet: '' });
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);

  async function creerSeuil(e) {
    e.preventDefault();
    setErreur(null); setMessage(''); setOccupe(true);
    try {
      await api('/seuils', { method: 'POST', body: {
        valeur: Number(form.valeur),
        ecartDegradation: form.ecartDegradation === '' ? null : Number(form.ecartDegradation),
        dateEffet: form.dateEffet,
      } });
      setMessage('Nouveau seuil enregistré. Il s’applique aux campagnes ouvertes à partir de sa date d’effet ; l’historique est conservé.');
      seuils.reload();
    } catch (err) { setErreur(err); } finally { setOccupe(false); }
  }

  return (
    <>
      <PageHeader titre="Alertes et suivi de trajectoire"
        sousTitre="Une alerte de vigilance dès le premier trimestre sous le seuil critique ; une alerte de direction au second trimestre consécutif ; une alerte de dégradation en cas de chute rapide du score." />

      <Carte>
        <div className="grille-champs">
          <Champ label="Affichage" id="vue">
            <select id="vue" value={vue} onChange={(e) => setVue(e.target.value)}>
              <option value="actives">Alertes en cours (à traiter ou prises en compte)</option>
              <option value="cloturees">Historique des alertes clôturées</option>
              <option value="toutes">Toutes les alertes</option>
            </select>
          </Champ>
          <Champ label="Type" id="type">
            <select id="type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Tous les types</option>
              {Object.entries(LIBELLE_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Champ>
        </div>
      </Carte>

      <Erreur erreur={alertes.error} />
      <Carte titre="Alertes" sansMarge>
        {alertes.loading ? <Chargement /> : !liste.length ? (
          <Vide titre={vue === 'actives' ? 'Aucune alerte en cours' : 'Aucune alerte'}>
            Les alertes sont créées automatiquement à la clôture d’une campagne, à partir des scores figés.
          </Vide>
        ) : (
          <div className="defile">
            <table>
              <thead><tr><th>Type</th><th>Pôle</th><th>Trimestre</th><th className="num">Score</th><th>État</th><th>Créée le</th><th>Plan d’action</th><th /></tr></thead>
              <tbody>
                {liste.map((a) => (
                  <tr key={a.id}>
                    <td><TypeAlerte type={a.type} /></td>
                    <td><b>{a.poleCode}</b><br /><small>{a.poleIntitule}</small></td>
                    <td>{trimestre(a)}</td>
                    <td className="num">{nombre(a.scoreConsolide, 1)} <small>/ seuil {nombre(a.seuil, 0)}</small>{a.partiel ? <> <Etat statut="PARTIEL" libelle="Partiel" ton="attention" /></> : null}</td>
                    <td><Etat statut={a.statut} /></td>
                    <td>{dateHeure(a.dateCreation)}</td>
                    <td>{a.nbPlans ? `${a.nbPlans - a.nbPlansOuverts}/${a.nbPlans} terminée(s)` : '—'}</td>
                    <td><Link className="bouton secondaire" href={`/alertes/${a.id}`}>{a.statut === 'ACTIVE' && user && user.role === ROLES.RESPONSABLE_POLE ? 'Traiter' : 'Ouvrir'}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      {voitSeuils && (
        <Carte titre="Seuils critiques">
          <Message type="ok">{message}</Message>
          <Erreur erreur={erreur || seuils.error} />
          {seuils.loading ? <Chargement /> : (
            <div className="defile">
              <table>
                <thead><tr><th>Périmètre</th><th className="num">Seuil</th><th className="num">Chute tolérée</th><th>Date d’effet</th><th>État</th></tr></thead>
                <tbody>
                  {((seuils.data && seuils.data.data) || []).map((s) => (
                    <tr key={s.id}>
                      <td>{s.axeCode || 'Global (score consolidé)'}</td>
                      <td className="num">{nombre(s.valeur, 0)}</td>
                      <td className="num">{s.ecartDegradation === null ? '—' : `${nombre(s.ecartDegradation, 0)} points`}</td>
                      <td>{date(s.dateEffet)}</td>
                      <td>{s.enVigueur ? <Etat statut="OK" libelle="En vigueur" ton="ok" /> : <Etat statut="X" libelle={s.dateEffet > new Date().toISOString().slice(0, 10) ? 'À venir' : 'Remplacé'} ton="neutre" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {peutParametrer && (
            <form onSubmit={creerSeuil} style={{ marginTop: 16 }}>
              <div className="grille-champs">
                <Champ label="Seuil critique (sur 100)" id="sv"><input id="sv" type="number" min="0" max="100" step="0.5" value={form.valeur} onChange={(e) => setForm({ ...form, valeur: e.target.value })} required /></Champ>
                <Champ label="Chute tolérée (points)" id="se" aide="Vide = pas d’alerte de dégradation."><input id="se" type="number" min="1" max="100" step="0.5" value={form.ecartDegradation} onChange={(e) => setForm({ ...form, ecartDegradation: e.target.value })} /></Champ>
                <Champ label="Date d’effet" id="sd"><input id="sd" type="date" value={form.dateEffet} onChange={(e) => setForm({ ...form, dateEffet: e.target.value })} required /></Champ>
              </div>
              <button type="submit" disabled={occupe}><Icone nom="disquette" taille={16} />Enregistrer un nouveau seuil</button>
            </form>
          )}
        </Carte>
      )}
    </>
  );
}
