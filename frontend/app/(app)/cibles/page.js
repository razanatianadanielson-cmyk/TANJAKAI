'use client';
import { useEffect, useState } from 'react';
import { useAuth, ROLES } from '@/lib/auth';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { nombre, date } from '@/lib/format';
import { PageHeader, Carte, Erreur, Message, Chargement, Vide, Etat, Champ } from '@/components/ui';
import { Icone } from '@/components/Icones';

export default function Cibles() {
  const { user } = useAuth();
  const propose = user.role === ROLES.CONTROLE_GESTION || user.role === ROLES.ADMINISTRATEUR;
  const direction = user.role === ROLES.DIRECTION_GENERALE;
  const [exercice, setExercice] = useState('');
  useEffect(() => { setExercice(String(new Date().getFullYear())); }, []);
  const [poleFiltre, setPoleFiltre] = useState('');
  const [form, setForm] = useState({ poleId: '', critereId: '', valeurCible: '' });
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState('');

  const poles = useAsync(() => api('/poles', { query: { limit: 100 } }), []);
  const criteres = useAsync(() => api('/criteres', { query: { limit: 100, valide: 'true' } }), [], propose);
  const cibles = useAsync(() => api('/cibles', { query: { limit: 100, exercice, poleId: poleFiltre } }), [exercice, poleFiltre], exercice !== '');

  async function definir(e) {
    e.preventDefault(); setErreur(null); setMessage('');
    try {
      await api('/cibles', { method: 'PUT', body: { poleId: form.poleId, critereId: form.critereId, exercice: Number(exercice), valeurCible: Number(String(form.valeurCible).replace(',', '.')) } });
      setMessage('Cible enregistrée. Elle doit être validée par la direction générale.');
      setForm({ ...form, valeurCible: '' }); cibles.reload();
    } catch (err) { setErreur(err); }
  }
  async function valider(c) {
    setErreur(null); setMessage('');
    try { await api(`/cibles/${c.id}/valider`, { method: 'POST' }); cibles.reload(); } catch (err) { setErreur(err); }
  }
  async function validerTout() {
    setErreur(null); setMessage('');
    try {
      const r = await api('/cibles/valider-lot', { method: 'POST', body: { exercice: Number(exercice) } });
      setMessage(`${r.validees} cible(s) validée(s) pour l'exercice ${r.exercice}.`); cibles.reload();
    } catch (err) { setErreur(err); }
  }

  const liste = (cibles.data && cibles.data.data) || [];
  const enAttente = liste.filter((c) => !c.dateValidation).length;
  const listePoles = (poles.data && poles.data.data) || [];

  return (
    <>
      <PageHeader titre="Cibles"
        sousTitre="Une cible par pôle, par critère et par exercice. Elle est proposée par le contrôle de gestion, validée par la direction, puis gelée à l'ouverture de chaque campagne."
        actions={direction ? <button type="button" onClick={validerTout} disabled={!enAttente}>Valider les {enAttente} cible(s) en attente</button> : null} />
      <Message type="ok">{message}</Message>
      <Erreur erreur={erreur || cibles.error || poles.error} />

      {propose && (
        <Carte titre={`Proposer une cible pour ${exercice}`}>
          <form onSubmit={definir}>
            <div className="grille-champs">
              <Champ label="Pôle" id="cp">
                <select id="cp" value={form.poleId} onChange={(e) => setForm({ ...form, poleId: e.target.value })} required>
                  <option value="">Choisir…</option>
                  {listePoles.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.intitule}</option>)}
                </select>
              </Champ>
              <Champ label="Critère validé" id="cc">
                <select id="cc" value={form.critereId} onChange={(e) => setForm({ ...form, critereId: e.target.value })} required>
                  <option value="">Choisir…</option>
                  {((criteres.data && criteres.data.data) || []).map((c) => <option key={c.id} value={c.id}>{c.intitule} ({c.unite})</option>)}
                </select>
              </Champ>
              <Champ label="Valeur cible" id="cv"><input id="cv" inputMode="decimal" value={form.valeurCible} onChange={(e) => setForm({ ...form, valeurCible: e.target.value })} required /></Champ>
            </div>
            <button type="submit"><Icone nom="disquette" taille={16} />Enregistrer la cible</button>
          </form>
        </Carte>
      )}

      <Carte>
        <div className="grille-champs">
          <Champ label="Exercice" id="fe"><input id="fe" type="number" min="2000" max="2100" value={exercice} onChange={(e) => setExercice(e.target.value)} /></Champ>
          <div className="champ">
            <label htmlFor="fp">Pôle</label>
            <select id="fp" value={poleFiltre} onChange={(e) => setPoleFiltre(e.target.value)}>
              <option value="">Tous les pôles</option>
              {listePoles.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}
            </select>
          </div>
        </div>
      </Carte>
      <Carte sansMarge>
        {cibles.loading ? <Chargement /> : !liste.length ? <Vide titre="Aucune cible pour cette sélection">{propose ? 'Proposez les cibles de chaque pôle avec le formulaire ci-dessus.' : "Les cibles n'ont pas encore été définies."}</Vide> : (
          <div className="defile">
            <table>
              <thead><tr><th>Pôle</th><th>Critère</th><th className="num">Cible</th><th>Validation</th>{direction && <th />}</tr></thead>
              <tbody>
                {liste.map((c) => (
                  <tr key={c.id}>
                    <td><b>{c.poleCode}</b></td>
                    <td>{c.critere}</td>
                    <td className="num"><b>{nombre(c.valeurCible, 4)}</b> {c.unite}</td>
                    <td>{c.dateValidation ? <><Etat statut="VALIDEE" /> <small>le {date(c.dateValidation)}</small></> : <Etat statut="X" libelle="En attente" ton="attention" />}</td>
                    {direction && <td>{!c.dateValidation ? <button type="button" onClick={() => valider(c)}><Icone nom="check" taille={16} />Valider</button> : null}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </>
  );
}
