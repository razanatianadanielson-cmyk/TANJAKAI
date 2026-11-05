'use client';
import { useEffect, useState } from 'react';
import { useAuth, ROLES } from '@/lib/auth';
import { api, messageErreur, telecharger } from '@/lib/api';
import { useAsync, useQueryParams } from '@/lib/hooks';
import { trimestre, date, nombre, taille, AXES } from '@/lib/format';
import { PageHeader, Carte, Erreur, Message, Chargement, Vide, Etat, Progression, LegendeProgression } from '@/components/ui';
import { Icone } from '@/components/Icones';

function Ligne({ ligne, campagneId, poleId, peutEditer, onChange }) {
  const [valeur, setValeur] = useState(ligne.valeurRealisee ?? '');
  const [commentaire, setCommentaire] = useState(ligne.commentaire ?? '');
  const [nonRenseigne, setNonRenseigne] = useState(Boolean(ligne.motifNonRenseigne));
  const [motif, setMotif] = useState(ligne.motifNonRenseigne ?? '');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const editable = peutEditer && ligne.editable;

  useEffect(() => {
    setValeur(ligne.valeurRealisee ?? ''); setCommentaire(ligne.commentaire ?? '');
    setNonRenseigne(Boolean(ligne.motifNonRenseigne)); setMotif(ligne.motifNonRenseigne ?? '');
  }, [ligne.valeurRealisee, ligne.commentaire, ligne.motifNonRenseigne, ligne.statut]);

  async function enregistrer() {
    setErreur(''); setOccupe(true);
    try {
      const nombreSaisi = valeur === '' ? null : Number(String(valeur).replace(',', '.'));
      if (!nonRenseigne && nombreSaisi !== null && Number.isNaN(nombreSaisi)) throw new Error('La valeur doit être un nombre');
      const body = nonRenseigne
        ? { valeurRealisee: null, motifNonRenseigne: motif, commentaire: commentaire || null }
        : { valeurRealisee: nombreSaisi, motifNonRenseigne: null, commentaire: commentaire || null };
      await api(`/campagnes/${campagneId}/poles/${poleId}/criteres/${ligne.critereId}`, { method: 'PUT', body });
      onChange();
    } catch (e) { setErreur(messageErreur(e)); } finally { setOccupe(false); }
  }

  async function deposer(ev) {
    const fichier = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!fichier) return;
    setErreur(''); setOccupe(true);
    try {
      if (!ligne.saisieId) throw new Error("Enregistrez d'abord la valeur, puis ajoutez la pièce justificative.");
      const form = new FormData();
      form.append('piece', fichier);
      await api(`/saisies/${ligne.saisieId}/pieces`, { method: 'POST', form });
      onChange();
    } catch (e) { setErreur(messageErreur(e)); } finally { setOccupe(false); }
  }

  const id = `v-${ligne.critereId}`;
  return (
    <tr className="ligne-saisie">
      <td className="intitule">
        <b>{ligne.intitule}</b>
        <small>{ligne.definition}</small>
        {ligne.dernierRenvoi && ligne.statut === 'RENVOYEE' ? <div className="renvoi"><b>Renvoyée pour correction :</b> {ligne.dernierRenvoi}</div> : null}
        {(ligne.avertissements || []).map((a) => <div className="avert" key={a.code}>{a.message}</div>)}
      </td>
      <td className="num" style={{ whiteSpace: 'nowrap' }}>
        <b>{nombre(ligne.valeurCible, 4)}</b> {ligne.unite}
        <br /><small>à {ligne.sens === 'MINIMISER' ? 'minimiser' : 'maximiser'}</small>
        {ligne.valeurPrecedente !== null && ligne.valeurPrecedente !== undefined ? <><br /><small>trimestre précédent : {nombre(ligne.valeurPrecedente, 4)}</small></> : null}
      </td>
      <td>
        <div className="entrees">
          {!nonRenseigne ? (
            <div>
              <label htmlFor={id} className="sr-only">Valeur réalisée en {ligne.unite}</label>
              <input id={id} inputMode="decimal" value={valeur} disabled={!editable} placeholder={`Valeur en ${ligne.unite}`} onChange={(e) => setValeur(e.target.value)} />
            </div>
          ) : (
            <div>
              <label htmlFor={`m-${ligne.critereId}`} className="sr-only">Motif de non-renseignement</label>
              <input id={`m-${ligne.critereId}`} value={motif} disabled={!editable} placeholder="Motif : pourquoi ce critère n'est pas renseigné" onChange={(e) => setMotif(e.target.value)} />
            </div>
          )}
          <textarea aria-label="Commentaire d'explication" value={commentaire} disabled={!editable} placeholder="Commentaire (obligatoire en cas de variation anormale)" onChange={(e) => setCommentaire(e.target.value)} rows={2} />
          {editable && (
            <div className="ligne-case">
              <input id={`n-${ligne.critereId}`} type="checkbox" checked={nonRenseigne} onChange={(e) => setNonRenseigne(e.target.checked)} />
              <label htmlFor={`n-${ligne.critereId}`}>Je ne peux pas renseigner ce critère</label>
            </div>
          )}
          <Erreur erreur={erreur ? { message: erreur } : null} />
        </div>
      </td>
      <td>
        <div className="pieces">
          {(ligne.pieces || []).map((pj) => (
            <span key={pj.id}>
              <button type="button" className="discret-btn" onClick={() => telecharger(`/saisies/${ligne.saisieId}/pieces/${pj.id}/fichier`, pj.nomFichier).catch((e) => setErreur(messageErreur(e)))}>{pj.nomFichier}</button>
              <small> {taille(pj.tailleOctets)}</small>
            </span>
          ))}
          {ligne.justificatifRequis && !(ligne.pieces || []).length ? <small>Pièce justificative requise</small> : null}
          {editable && ligne.saisieId ? (
            <label className="bouton secondaire" style={{ marginBottom: 0, fontSize: 13.5 }}>
              Ajouter une pièce
              <input type="file" className="sr-only" onChange={deposer} />
            </label>
          ) : null}
        </div>
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <Etat statut={ligne.statut || 'A_SAISIR'} />
        {editable ? <div style={{ marginTop: 8 }}><button type="button" onClick={enregistrer} disabled={occupe}><Icone nom="disquette" taille={16} />Enregistrer</button></div> : null}
      </td>
    </tr>
  );
}

function BlocAxe({ axe, children }) {
  return (
    <>
      <tr className="sous-titre"><td colSpan={5}>{AXES[axe] || axe}</td></tr>
      {children}
    </>
  );
}

export default function Saisie() {
  const { user } = useAuth();
  const params = useQueryParams();
  const responsable = user.role === ROLES.RESPONSABLE_POLE;
  const [campagneId, setCampagneId] = useState('');
  const [poleId, setPoleId] = useState('');
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const campagnes = useAsync(() => api('/campagnes', { query: { limit: 50 } }), []);
  useEffect(() => {
    const liste = (campagnes.data && campagnes.data.data) || [];
    if (!liste.length || campagneId) return;
    const choisie = liste.find((c) => c.id === params.campagne) || liste.find((c) => c.statut !== 'CLOTUREE') || liste[0];
    setCampagneId(choisie.id);
  }, [campagnes.data, params.campagne, campagneId]);

  const avancement = useAsync(() => api(`/campagnes/${campagneId}/avancement`), [campagneId], Boolean(campagneId));
  useEffect(() => {
    const poles = (avancement.data && avancement.data.poles) || [];
    if (!poles.length) { setPoleId(''); return; }
    if (!poles.some((x) => x.poleId === poleId)) setPoleId((poles.find((x) => x.poleId === params.pole) || poles[0]).poleId);
  }, [avancement.data, params.pole]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = useAsync(() => api(`/campagnes/${campagneId}/poles/${poleId}/saisies`), [campagneId, poleId], Boolean(campagneId && poleId));

  async function soumettre() {
    setMessage(''); setErreur(null); setEnvoi(true);
    try {
      await api(`/campagnes/${campagneId}/poles/${poleId}/soumettre`, { method: 'POST' });
      setMessage('Indicateurs soumis au contrôle de gestion.');
      plan.reload(); avancement.reload();
    } catch (e) { setErreur(e); } finally { setEnvoi(false); }
  }

  const p = plan.data;
  const c = p && p.completion;
  const modifiable = Boolean(p && responsable && ['OUVERTE', 'ROUVERTE'].includes(p.campagne.statut));
  const aSoumettre = p ? p.lignes.filter((l) => l.editable && l.saisieId).length : 0;
  const axes = p ? [...new Set(p.lignes.map((l) => l.axe))] : [];

  async function exporterSaisies() {
    setErreur(null);
    try { await telecharger(`/saisies/export?campagneId=${campagneId}${poleId ? `&poleId=${poleId}` : ''}`, 'mes-saisies.csv'); } catch (e) { setErreur(e); }
  }

  return (
    <>
      <PageHeader titre="Ma saisie"
        sousTitre="Seuls les critères applicables à votre pôle apparaissent, avec leur cible. Aucune valeur n'est préremplie : un critère non renseigné doit être justifié."
        actions={<button type="button" className="secondaire" disabled={!campagneId} onClick={exporterSaisies}><Icone nom="telecharger" taille={16} />Exporter mes saisies (CSV)</button>} />
      <Erreur erreur={campagnes.error || avancement.error} />
      <Carte>
        <div className="grille-champs">
          <div className="champ">
            <label htmlFor="camp">Campagne</label>
            <select id="camp" value={campagneId} onChange={(e) => { setCampagneId(e.target.value); setPoleId(''); }}>
              {((campagnes.data && campagnes.data.data) || []).map((x) => <option key={x.id} value={x.id}>{trimestre(x)} — {x.statut === 'CLOTUREE' ? 'clôturée' : 'ouverte'}</option>)}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="pole">Pôle</label>
            <select id="pole" value={poleId} onChange={(e) => setPoleId(e.target.value)}>
              {((avancement.data && avancement.data.poles) || []).map((x) => <option key={x.poleId} value={x.poleId}>{x.poleCode} — {x.intitule}</option>)}
            </select>
          </div>
        </div>
      </Carte>

      <Message type="ok">{message}</Message>
      <Erreur erreur={erreur} />
      {plan.loading && campagneId && poleId ? <Chargement /> : null}
      <Erreur erreur={plan.error} />
      {!campagnes.loading && !((campagnes.data && campagnes.data.data) || []).length ? <Vide titre="Aucune campagne">Le contrôle de gestion n'a pas encore ouvert de campagne.</Vide> : null}
      {avancement.data && !(avancement.data.poles || []).length ? <Vide titre="Aucun pôle à saisir">Aucun pôle ne vous est rattaché dans cette campagne.</Vide> : null}

      {p && (
        <>
          <Carte>
            <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div className="score score-moyen">{c.pourcentage} %</div>
                <small>{c.renseignes} sur {c.total} indicateurs renseignés</small>
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Progression total={c.total} validees={c.valides} soumises={c.soumis - c.valides} brouillons={Math.max(0, c.renseignes - c.soumis)} />
                <LegendeProgression />
              </div>
              <div>
                <small>Date limite : {date(p.campagne.dateLimite)}</small><br />
                <Etat statut={p.campagne.statut} />
              </div>
              {modifiable && <button type="button" onClick={soumettre} disabled={envoi || !aSoumettre}><Icone nom="envoyer" taille={16} />Soumettre tout au contrôle</button>}
            </div>
          </Carte>

          <Carte titre={`${p.pole.code} — ${p.pole.intitule}`} sansMarge>
            <div className="defile">
              <table>
                <thead><tr><th>Critère</th><th className="num">Cible</th><th>Valeur réalisée</th><th>Justificatif</th><th>État</th></tr></thead>
                <tbody>
                  {axes.map((axe) => (
                    <BlocAxe key={axe} axe={axe}>
                      {p.lignes.filter((l) => l.axe === axe).map((l) => (
                        <Ligne key={l.critereId} ligne={l} campagneId={campagneId} poleId={poleId} peutEditer={modifiable}
                          onChange={() => { plan.reload(); avancement.reload(); }} />
                      ))}
                    </BlocAxe>
                  ))}
                </tbody>
              </table>
            </div>
          </Carte>
        </>
      )}
    </>
  );
}
