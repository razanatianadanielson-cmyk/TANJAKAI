'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth, ROLES } from '@/lib/auth';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { trimestre, date, dateHeure, nombre } from '@/lib/format';
import { PageHeader, Carte, Erreur, Message, Chargement, Vide, Etat, Champ } from '@/components/ui';
import { Icone } from '@/components/Icones';
import BoutonSupprimer from '@/components/Suppression';

export default function Campagnes() {
  const { user } = useAuth();
  const cg = user.role === ROLES.CONTROLE_GESTION;
  const peutRouvrir = cg || user.role === ROLES.ADMINISTRATEUR;
  const campagnes = useAsync(() => api('/campagnes', { query: { limit: 50 } }), []);
  const grilles = useAsync(() => api('/grilles', { query: { limit: 50 } }), [], user.role !== ROLES.RESPONSABLE_POLE);
  const [form, setForm] = useState({ exercice: '', trimestre: 1, grilleId: '', dateLimite: '' });
  // L'heure courante n'est lue qu'après l'affichage (compatible avec le rendu statique de Next 16)
  useEffect(() => {
    const maintenant = new Date();
    setForm((f) => ({ ...f, exercice: maintenant.getFullYear(), trimestre: Math.floor(maintenant.getMonth() / 3) + 1 }));
  }, []);
  const [message, setMessage] = useState(null);
  const [avertissements, setAvertissements] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [selection, setSelection] = useState(null); // { id, mode: 'simuler' | 'detail' | 'rouvrir' }
  const [resultat, setResultat] = useState(null);
  const [motif, setMotif] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [dl, setDl] = useState(null); // { id, dateLimite, motif }

  const validees = ((grilles.data && grilles.data.data) || []).filter((g) => g.statut === 'VALIDEE');
  const versionDe = (id) => { const g = ((grilles.data && grilles.data.data) || []).find((x) => x.id === id); return g ? `v${g.version}` : '—'; };

  async function agir(fn, ok) {
    setErreur(null); setMessage(null); setOccupe(true);
    try { const r = await fn(); if (ok) setMessage(typeof ok === 'function' ? ok(r) : ok); campagnes.reload(); return r; } catch (e) { setErreur(e); return null; } finally { setOccupe(false); }
  }

  async function corrigerDate(e) {
    e.preventDefault();
    const ok = await agir(() => api(`/campagnes/${dl.id}`, { method: 'PATCH', body: { dateLimite: dl.dateLimite, motif: dl.motif } }), 'Date limite corrigée.');
    if (ok) setDl(null);
  }
  async function ouvrir(e) {
    e.preventDefault();
    setAvertissements([]);
    const r = await agir(() => api('/campagnes', { method: 'POST', body: { exercice: Number(form.exercice), trimestre: Number(form.trimestre), grilleId: form.grilleId, dateLimite: form.dateLimite } }),
      (c) => `Campagne ${trimestre(c)} ouverte : grille, périmètre et cibles sont gelés. Les responsables ont été notifiés.`);
    if (r && r.avertissements) setAvertissements(r.avertissements);
  }

  async function simuler(c) {
    setSelection({ id: c.id, mode: 'simuler' }); setResultat(null);
    const r = await agir(() => api(`/campagnes/${c.id}/simuler`, { method: 'POST' }));
    if (r) setResultat(r);
  }

  async function cloturer(c) {
    if (!window.confirm(`Clôturer la campagne ${trimestre(c)} ? Les valeurs seront verrouillées et les scores figés.`)) return;
    await agir(() => api(`/campagnes/${c.id}/cloturer`, { method: 'POST' }), `Campagne ${trimestre(c)} clôturée : scores calculés et figés.`);
  }

  async function detail(c) {
    setSelection({ id: c.id, mode: 'detail' }); setResultat(null);
    const r = await agir(() => api(`/campagnes/${c.id}`));
    if (r) setResultat(r);
  }

  async function rouvrir(c) {
    const r = await agir(() => api(`/campagnes/${c.id}/rouvrir`, { method: 'POST', body: { motif } }), `Campagne ${trimestre(c)} rouverte. La réouverture est tracée et notifiée.`);
    if (r) { setSelection(null); setMotif(''); }
  }

  const liste = (campagnes.data && campagnes.data.data) || [];
  const courante = selection ? liste.find((c) => c.id === selection.id) : null;

  return (
    <>
      <PageHeader titre="Campagnes" sousTitre="Une campagne par trimestre. À l'ouverture, la version de la grille, le périmètre des pôles et les cibles sont gelés." />
      <Message type="ok">{message}</Message>
      <Erreur erreur={erreur || campagnes.error} />
      {avertissements.length > 0 && (
        <Message type="attention">
          Des critères n'ont pas de cible pour certains pôles : ils seront exclus de leur notation.
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{avertissements.map((a) => <li key={`${a.poleCode}-${a.critere}`}>{a.poleCode} — {a.critere}</li>)}</ul>
        </Message>
      )}

      {cg && (
        <Carte titre="Ouvrir une campagne">
          <form onSubmit={ouvrir}>
            <div className="grille-champs">
              <Champ label="Exercice" id="ex"><input id="ex" type="number" min="2000" max="2100" value={form.exercice} onChange={(e) => setForm({ ...form, exercice: e.target.value })} required /></Champ>
              <Champ label="Trimestre" id="tr">
                <select id="tr" value={form.trimestre} onChange={(e) => setForm({ ...form, trimestre: e.target.value })}>{[1, 2, 3, 4].map((t) => <option key={t} value={t}>T{t}</option>)}</select>
              </Champ>
              <Champ label="Grille de notation" id="gr" aide="Seules les grilles validées sont proposées.">
                <select id="gr" value={form.grilleId} onChange={(e) => setForm({ ...form, grilleId: e.target.value })} required>
                  <option value="">Choisir…</option>
                  {validees.map((g) => <option key={g.id} value={g.id}>Version {g.version}</option>)}
                </select>
              </Champ>
              <Champ label="Date limite de saisie" id="dl"><input id="dl" type="date" value={form.dateLimite} onChange={(e) => setForm({ ...form, dateLimite: e.target.value })} required /></Champ>
            </div>
            <button type="submit" disabled={occupe}><Icone nom="drapeau" taille={16} />Ouvrir la campagne</button>
          </form>
        </Carte>
      )}

      <Carte titre="Toutes les campagnes" sansMarge>
        {campagnes.loading ? <Chargement /> : !liste.length ? <Vide titre="Aucune campagne">{cg ? "Ouvrez la première campagne avec le formulaire ci-dessus." : "Aucune campagne n'a encore été ouverte."}</Vide> : (
          <div className="defile">
            <table>
              <thead><tr><th>Trimestre</th><th>État</th><th>Grille</th><th>Ouverture</th><th>Date limite</th><th>Clôture</th><th /></tr></thead>
              <tbody>
                {liste.map((c) => (
                  <tr key={c.id}>
                    <td><b>{trimestre(c)}</b></td>
                    <td><Etat statut={c.statut} /></td>
                    <td>{grilles.data ? versionDe(c.grilleId) : '—'}</td>
                    <td>{date(c.dateOuverture)}</td>
                    <td>{date(c.dateLimite)}</td>
                    <td>{c.dateCloture ? dateHeure(c.dateCloture) : '—'}</td>
                    <td>
                      <div className="actions">
                        <button type="button" className="secondaire" onClick={() => detail(c)}><Icone nom="horloge" taille={16} />Historique</button>
                        {cg && c.statut !== 'CLOTUREE' && <button type="button" className="secondaire" onClick={() => simuler(c)} disabled={occupe}><Icone nom="calcul" taille={16} />Simuler</button>}
                        {cg && c.statut !== 'CLOTUREE' && <button type="button" onClick={() => cloturer(c)} disabled={occupe}><Icone nom="cadenas" taille={16} />Clôturer</button>}
                        {peutRouvrir && c.statut === 'CLOTUREE' && <button type="button" className="secondaire" onClick={() => { setSelection({ id: c.id, mode: 'rouvrir' }); setResultat(null); }}>Rouvrir</button>}
                        {cg && <Link className="bouton secondaire" href={`/controle?campagne=${c.id}`}>Contrôler</Link>}
                        {cg && c.statut === 'OUVERTE' && !(dl && dl.id === c.id) && <button type="button" className="secondaire" onClick={() => setDl({ id: c.id, dateLimite: String(c.dateLimite).slice(0, 10), motif: '' })}><Icone nom="crayon" taille={16} />Date limite</button>}
                        {cg && c.statut === 'OUVERTE' && <BoutonSupprimer libelle="Annuler la campagne" chemin={`/campagnes/${c.id}`} onFait={() => { setMessage('Campagne annulée.'); campagnes.reload(); }} onErreur={setErreur} avertissement="Possible seulement si aucune saisie n'a été faite. Les cibles restent, vous pourrez ouvrir à nouveau." />}
                        {cg && dl && dl.id === c.id && (
                          <form onSubmit={corrigerDate} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <input aria-label="Nouvelle date limite" type="date" value={dl.dateLimite} onChange={(e) => setDl({ ...dl, dateLimite: e.target.value })} required />
                            <input aria-label="Motif" placeholder="Motif (5 caractères minimum)" value={dl.motif} onChange={(e) => setDl({ ...dl, motif: e.target.value })} required minLength={5} />
                            <button type="submit" disabled={occupe || dl.motif.trim().length < 5}>Enregistrer</button>
                            <button type="button" className="secondaire" onClick={() => setDl(null)}>Annuler</button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>

      {selection && courante && selection.mode === 'rouvrir' && (
        <Carte titre={`Rouvrir la campagne ${trimestre(courante)}`}>
          <Message type="attention">Une réouverture est tracée dans le journal d'audit et notifiée aux responsables. Le score clôturé reste consultable : la nouvelle clôture produira une nouvelle version.</Message>
          <Champ label="Motif de la réouverture" id="mo" aide="Obligatoire, 5 caractères au minimum.">
            <textarea id="mo" value={motif} onChange={(e) => setMotif(e.target.value)} />
          </Champ>
          <div className="actions">
            <button type="button" onClick={() => rouvrir(courante)} disabled={occupe || motif.trim().length < 5}><Icone nom="deverrouiller" taille={16} />Rouvrir la campagne</button>
            <button type="button" className="secondaire" onClick={() => setSelection(null)}><Icone nom="croix" taille={16} />Annuler</button>
          </div>
        </Carte>
      )}

      {selection && courante && selection.mode === 'simuler' && (
        <Carte titre={`Simulation ${trimestre(courante)} (rien n'est enregistré)`} sansMarge>
          {!resultat ? <Chargement>Calcul en cours…</Chargement> : (
            <table>
              <thead><tr><th>Pôle</th><th className="num">Score</th><th>Remarques</th></tr></thead>
              <tbody>
                {resultat.scores.map((s) => (
                  <tr key={s.poleId}>
                    <td><b>{s.poleCode}</b></td>
                    <td className="num"><b>{nombre(s.scoreConsolide)}</b></td>
                    <td>{s.partiel ? <Etat statut="PARTIEL" libelle="Score partiel" ton="attention" /> : null} {(s.anomalies || []).map((a) => <small key={a.message || a}>{a.message || String(a)} </small>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Carte>
      )}

      {selection && courante && selection.mode === 'detail' && (
        <Carte titre={`Historique des réouvertures — ${trimestre(courante)}`} sansMarge>
          {!resultat ? <Chargement /> : !(resultat.reouvertures || []).length ? <Vide titre="Jamais rouverte">Cette campagne n'a fait l'objet d'aucune réouverture.</Vide> : (
            <table>
              <thead><tr><th>Date</th><th>Motif</th></tr></thead>
              <tbody>{resultat.reouvertures.map((r) => <tr key={r.id}><td style={{ whiteSpace: 'nowrap' }}>{dateHeure(r.date)}</td><td>{r.motif}</td></tr>)}</tbody>
            </table>
          )}
        </Carte>
      )}
    </>
  );
}
