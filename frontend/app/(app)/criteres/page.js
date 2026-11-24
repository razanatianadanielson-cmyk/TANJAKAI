'use client';
import { useState } from 'react';
import { useAuth, ROLES } from '@/lib/auth';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { nombre, AXES } from '@/lib/format';
import { PageHeader, Carte, Erreur, Message, Chargement, Vide, Etat, Champ } from '@/components/ui';
import { Icone } from '@/components/Icones';
import Suppression from '@/components/Suppression';

const VIDE = { axeId: '', intitule: '', definition: '', unite: '%', sensOptimisation: 'MAXIMISER', sourceDonnee: '', justificatifRequis: false, valeurMin: '', valeurMax: '', variationMaxPct: '' };

export default function Criteres() {
  const { user } = useAuth();
  const gestion = user.role === ROLES.CONTROLE_GESTION || user.role === ROLES.ADMINISTRATEUR;
  const cg = user.role === ROLES.CONTROLE_GESTION;
  const [axeId, setAxeId] = useState('');
  const axes = useAsync(() => api('/axes'), []);
  const criteres = useAsync(() => api('/criteres', { query: { limit: 100, axeId } }), [axeId]);
  const [form, setForm] = useState(VIDE);
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState('');
  const [edit, setEdit] = useState(null); // critère en cours de correction

  const num = (v) => (v === '' ? null : Number(String(v).replace(',', '.')));

  async function creer(e) {
    e.preventDefault(); setErreur(null); setMessage('');
    try {
      await api('/criteres', { method: 'POST', body: { ...form, valeurMin: num(form.valeurMin), valeurMax: num(form.valeurMax), variationMaxPct: num(form.variationMaxPct) } });
      setMessage('Critère créé. Il doit être validé par le contrôle de gestion avant d\'entrer dans une grille.');
      setForm(VIDE); setOuvert(false); criteres.reload();
    } catch (err) { setErreur(err); }
  }

  async function corriger(e) {
    e.preventDefault(); setErreur(null); setMessage('');
    try {
      const { intitule, definition, unite, sourceDonnee } = edit;
      await api(`/criteres/${edit.id}`, { method: 'PATCH', body: { intitule, definition, unite, sourceDonnee } });
      setMessage('Critère corrigé.'); setEdit(null); criteres.reload();
    } catch (err) { setErreur(err); }
  }
  async function valider(c) {
    setErreur(null); setMessage('');
    try { await api(`/criteres/${c.id}/valider`, { method: 'POST' }); setMessage(`Critère « ${c.intitule} » validé.`); criteres.reload(); } catch (err) { setErreur(err); }
  }

  const liste = (criteres.data && criteres.data.data) || [];
  return (
    <>
      <PageHeader titre="Critères"
        sousTitre="Chaque critère est mesuré par un indicateur unique et défini. Un critère mal défini produit une note fausse : le contrôle de gestion valide sa définition avant activation."
        actions={gestion ? <button type="button" onClick={() => setOuvert((o) => !o)}>{ouvert ? 'Fermer le formulaire' : 'Nouveau critère'}</button> : null} />
      <Message type="ok">{message}</Message>
      <Erreur erreur={erreur || criteres.error || axes.error} />

      {ouvert && (
        <Carte titre="Nouveau critère">
          <form onSubmit={creer}>
            <div className="grille-champs">
              <Champ label="Axe" id="axe">
                <select id="axe" value={form.axeId} onChange={(e) => setForm({ ...form, axeId: e.target.value })} required>
                  <option value="">Choisir…</option>
                  {((axes.data && axes.data.data) || []).map((a) => <option key={a.id} value={a.id}>{a.libelle}</option>)}
                </select>
              </Champ>
              <Champ label="Intitulé" id="int"><input id="int" value={form.intitule} onChange={(e) => setForm({ ...form, intitule: e.target.value })} required /></Champ>
              <Champ label="Unité" id="un" aide="Exemples : %, M Ar, heures, jours"><input id="un" value={form.unite} onChange={(e) => setForm({ ...form, unite: e.target.value })} required /></Champ>
              <Champ label="Sens d'optimisation" id="sens">
                <select id="sens" value={form.sensOptimisation} onChange={(e) => setForm({ ...form, sensOptimisation: e.target.value })}>
                  <option value="MAXIMISER">À maximiser (plus c'est haut, mieux c'est)</option>
                  <option value="MINIMISER">À minimiser (plus c'est bas, mieux c'est)</option>
                </select>
              </Champ>
              <Champ label="Source de la donnée" id="src"><input id="src" value={form.sourceDonnee} onChange={(e) => setForm({ ...form, sourceDonnee: e.target.value })} required /></Champ>
            </div>
            <Champ label="Définition précise" id="def" aide="Comment la valeur est calculée, sur quelle période, avec quel périmètre (10 caractères minimum).">
              <textarea id="def" value={form.definition} onChange={(e) => setForm({ ...form, definition: e.target.value })} required />
            </Champ>
            <div className="grille-champs">
              <Champ label="Valeur minimale admise" id="vmin" aide="Borne physique : en dessous, la saisie est refusée."><input id="vmin" inputMode="decimal" value={form.valeurMin} onChange={(e) => setForm({ ...form, valeurMin: e.target.value })} /></Champ>
              <Champ label="Valeur maximale admise" id="vmax"><input id="vmax" inputMode="decimal" value={form.valeurMax} onChange={(e) => setForm({ ...form, valeurMax: e.target.value })} /></Champ>
              <Champ label="Variation anormale (%)" id="var" aide="Écart au trimestre précédent au-delà duquel un commentaire est exigé."><input id="var" inputMode="decimal" value={form.variationMaxPct} onChange={(e) => setForm({ ...form, variationMaxPct: e.target.value })} /></Champ>
            </div>
            <div className="ligne-case" style={{ marginBottom: 14 }}>
              <input id="just" type="checkbox" checked={form.justificatifRequis} onChange={(e) => setForm({ ...form, justificatifRequis: e.target.checked })} />
              <label htmlFor="just">Une pièce justificative est exigée à la saisie</label>
            </div>
            <button type="submit"><Icone nom="plus" taille={16} />Créer le critère</button>
          </form>
        </Carte>
      )}

      <Carte>
        <div className="grille-champs">
          <div className="champ">
            <label htmlFor="fa">Axe</label>
            <select id="fa" value={axeId} onChange={(e) => setAxeId(e.target.value)}>
              <option value="">Tous les axes</option>
              {((axes.data && axes.data.data) || []).map((a) => <option key={a.id} value={a.id}>{a.libelle}</option>)}
            </select>
          </div>
        </div>
      </Carte>
      <Carte sansMarge>
        {criteres.loading ? <Chargement /> : !liste.length ? <Vide titre="Aucun critère">{gestion ? 'Créez le premier critère avec « Nouveau critère ».' : "Le contrôle de gestion n'a pas encore défini de critère."}</Vide> : (
          <div className="defile">
            <table>
              <thead><tr><th>Critère</th><th>Axe</th><th>Unité</th><th>Sens</th><th>Bornes</th><th>État</th><th /></tr></thead>
              <tbody>
                {liste.map((c) => (
                  <tr key={c.id}>
                    <td>{edit && edit.id === c.id ? (
                      <form onSubmit={corriger}>
                        <Champ label="Intitulé" id={`ei-${c.id}`}><input id={`ei-${c.id}`} value={edit.intitule} onChange={(e) => setEdit({ ...edit, intitule: e.target.value })} required /></Champ>
                        <Champ label="Définition" id={`ed-${c.id}`}><textarea id={`ed-${c.id}`} value={edit.definition} onChange={(e) => setEdit({ ...edit, definition: e.target.value })} required /></Champ>
                        <Champ label="Unité" id={`eu-${c.id}`}><input id={`eu-${c.id}`} value={edit.unite} onChange={(e) => setEdit({ ...edit, unite: e.target.value })} required /></Champ>
                        <Champ label="Source" id={`es-${c.id}`}><input id={`es-${c.id}`} value={edit.sourceDonnee} onChange={(e) => setEdit({ ...edit, sourceDonnee: e.target.value })} required /></Champ>
                        <div style={{ display: 'flex', gap: 8 }}><button type="submit">Enregistrer</button><button type="button" className="secondaire" onClick={() => setEdit(null)}>Annuler</button></div>
                      </form>
                    ) : <><b>{c.intitule}</b><br /><small>{c.definition}</small><br /><small>Source : {c.sourceDonnee}{c.justificatifRequis ? ' · justificatif exigé' : ''}</small></>}</td>
                    <td>{AXES[c.axe] || c.axe}</td>
                    <td>{c.unite}</td>
                    <td>{c.sensOptimisation === 'MINIMISER' ? 'À minimiser' : 'À maximiser'}</td>
                    <td>{c.valeurMin !== null || c.valeurMax !== null ? `${c.valeurMin !== null ? nombre(c.valeurMin) : '−∞'} à ${c.valeurMax !== null ? nombre(c.valeurMax) : '+∞'}` : '—'}</td>
                    <td>{c.valide ? <Etat statut="VALIDEE" /> : <Etat statut="X" libelle="À valider" ton="attention" />}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {cg && !c.valide ? <button type="button" onClick={() => valider(c)}><Icone nom="check" taille={16} />Valider la définition</button> : null}
                        {gestion && !c.valide && !(edit && edit.id === c.id) ? <button type="button" className="secondaire" onClick={() => setEdit({ id: c.id, intitule: c.intitule, definition: c.definition, unite: c.unite, sourceDonnee: c.sourceDonnee })}><Icone nom="crayon" taille={16} />Modifier</button> : null}
                        {gestion ? <Suppression chemin={`/criteres/${c.id}`} onFait={() => { setMessage('Critère supprimé.'); criteres.reload(); }} onErreur={setErreur} avertissement="Possible seulement si le critère n'a jamais servi (aucune cible, grille, campagne ni saisie)." /> : null}
                      </div>
                    </td>
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
