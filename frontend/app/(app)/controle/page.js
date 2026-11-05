'use client';
import { useEffect, useState } from 'react';
import { useAuth, ROLES } from '@/lib/auth';
import { api, messageErreur, telecharger } from '@/lib/api';
import { useAsync, useQueryParams } from '@/lib/hooks';
import { trimestre, nombre, taille, AXES } from '@/lib/format';
import { PageHeader, Carte, Erreur, Message, Chargement, Vide, Etat, Progression, LegendeProgression } from '@/components/ui';
import { Icone } from '@/components/Icones';

function LigneControle({ ligne, peutAgir, onChange, onErreur }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState('');
  const [occupe, setOccupe] = useState(false);

  async function renvoyer() {
    setOccupe(true);
    try {
      await api(`/saisies/${ligne.saisieId}/renvoyer`, { method: 'POST', body: { motif } });
      setOuvert(false); setMotif(''); onChange();
    } catch (e) { onErreur(e); } finally { setOccupe(false); }
  }

  const renvoyable = peutAgir && ligne.saisieId && ['SOUMISE', 'VALIDEE'].includes(ligne.statut);
  return (
    <tr>
      <td><b>{ligne.intitule}</b>{ligne.variationAnormale ? <div className="avert">Variation anormale par rapport au trimestre précédent</div> : null}</td>
      <td className="num">{nombre(ligne.valeurCible, 4)} {ligne.unite}</td>
      <td className="num">
        {ligne.valeurRealisee !== null && ligne.valeurRealisee !== undefined ? <b>{nombre(ligne.valeurRealisee, 4)} {ligne.unite}</b> : <span className="discret">non renseigné</span>}
        {ligne.valeurPrecedente !== null && ligne.valeurPrecedente !== undefined ? <><br /><small>précédent : {nombre(ligne.valeurPrecedente, 4)}</small></> : null}
      </td>
      <td>
        {ligne.motifNonRenseigne ? <div><small>Motif de non-renseignement :</small><br />{ligne.motifNonRenseigne}</div> : null}
        {ligne.commentaire ? <div>{ligne.commentaire}</div> : null}
        <div className="pieces">
          {(ligne.pieces || []).map((pj) => (
            <span key={pj.id}>
              <button type="button" className="discret-btn" onClick={() => telecharger(`/saisies/${ligne.saisieId}/pieces/${pj.id}/fichier`, pj.nomFichier).catch(onErreur)}>{pj.nomFichier}</button>
              <small> {taille(pj.tailleOctets)}</small>
            </span>
          ))}
          {ligne.justificatifRequis && !(ligne.pieces || []).length ? <small>Justificatif requis : aucune pièce</small> : null}
        </div>
      </td>
      <td>
        <Etat statut={ligne.statut || 'A_SAISIR'} />
        {renvoyable && !ouvert ? <div style={{ marginTop: 8 }}><button type="button" className="secondaire" onClick={() => setOuvert(true)}><Icone nom="retour" taille={16} />Renvoyer</button></div> : null}
        {ouvert && (
          <div style={{ marginTop: 8, minWidth: 230 }}>
            <label htmlFor={`rm-${ligne.critereId}`}>Motif du renvoi</label>
            <textarea id={`rm-${ligne.critereId}`} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ce que le responsable doit corriger ou justifier" />
            <div className="actions" style={{ marginTop: 6 }}>
              <button type="button" className="danger" onClick={renvoyer} disabled={occupe || !motif.trim()}><Icone nom="retour" taille={16} />Renvoyer pour correction</button>
              <button type="button" className="secondaire" onClick={() => setOuvert(false)}><Icone nom="croix" taille={16} />Annuler</button>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function Controle() {
  const { user } = useAuth();
  const params = useQueryParams();
  const peutAgir = user.role === ROLES.CONTROLE_GESTION;
  const [campagneId, setCampagneId] = useState('');
  const [poleId, setPoleId] = useState('');
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState(null);

  const campagnes = useAsync(() => api('/campagnes', { query: { limit: 50 } }), []);
  useEffect(() => {
    const liste = (campagnes.data && campagnes.data.data) || [];
    if (!liste.length || campagneId) return;
    setCampagneId((liste.find((c) => c.id === params.campagne) || liste.find((c) => c.statut !== 'CLOTUREE') || liste[0]).id);
  }, [campagnes.data, params.campagne, campagneId]);

  const avancement = useAsync(() => api(`/campagnes/${campagneId}/avancement`), [campagneId], Boolean(campagneId));
  useEffect(() => {
    const poles = (avancement.data && avancement.data.poles) || [];
    if (!poleId && params.pole && poles.some((x) => x.poleId === params.pole)) setPoleId(params.pole);
  }, [avancement.data, params.pole]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = useAsync(() => api(`/campagnes/${campagneId}/poles/${poleId}/saisies`), [campagneId, poleId], Boolean(campagneId && poleId));

  async function valider() {
    setMessage(''); setErreur(null);
    try {
      const r = await api(`/campagnes/${campagneId}/poles/${poleId}/valider`, { method: 'POST' });
      setMessage(`${r.validees} saisie(s) validée(s).`);
      plan.reload(); avancement.reload();
    } catch (e) { setErreur(e); }
  }
  const rafraichir = () => { plan.reload(); avancement.reload(); };
  const p = plan.data;
  const nbSoumises = p ? p.lignes.filter((l) => l.statut === 'SOUMISE').length : 0;
  const axes = p ? [...new Set(p.lignes.map((l) => l.axe))] : [];

  async function exporterSaisies() {
    setErreur(null);
    try { await telecharger(`/saisies/export?campagneId=${campagneId}${poleId ? `&poleId=${poleId}` : ''}`, 'saisies.csv'); } catch (e) { setErreur(e); }
  }

  return (
    <>
      <PageHeader titre="Contrôle des saisies"
        sousTitre="Examinez les valeurs soumises par pôle, renvoyez celles qui doivent être corrigées (motif obligatoire), puis validez. Celui qui saisit ne peut jamais valider sa propre saisie."
        actions={<button type="button" className="secondaire" disabled={!campagneId} onClick={exporterSaisies}><Icone nom="telecharger" taille={16} />Exporter les saisies (CSV)</button>} />
      <Erreur erreur={campagnes.error || avancement.error} />
      <Carte>
        <div className="grille-champs">
          <div className="champ">
            <label htmlFor="camp">Campagne</label>
            <select id="camp" value={campagneId} onChange={(e) => { setCampagneId(e.target.value); setPoleId(''); }}>
              {((campagnes.data && campagnes.data.data) || []).map((x) => <option key={x.id} value={x.id}>{trimestre(x)} — {x.statut === 'CLOTUREE' ? 'clôturée' : 'ouverte'}</option>)}
            </select>
          </div>
        </div>
      </Carte>

      <Carte titre="Pôles de la campagne" sansMarge>
        {avancement.loading ? <Chargement /> : !(avancement.data && avancement.data.poles.length) ? <Vide titre="Aucun pôle">Aucune campagne ouverte ou aucun pôle dans son périmètre.</Vide> : (
          <div className="defile">
            <table>
              <thead><tr><th>Pôle</th><th className="num">Soumises</th><th className="num">Validées</th><th>Avancement</th></tr></thead>
              <tbody>
                {avancement.data.poles.map((x) => (
                  <tr key={x.poleId} className="cliquable" onClick={() => setPoleId(x.poleId)} aria-selected={x.poleId === poleId}
                    style={x.poleId === poleId ? { outline: '2px solid var(--safran)', outlineOffset: -2 } : undefined}>
                    <td><button type="button" className="discret-btn" onClick={() => setPoleId(x.poleId)}><b>{x.poleCode}</b> — {x.intitule}</button></td>
                    <td className="num">{x.soumises}</td>
                    <td className="num">{x.validees} / {x.total}</td>
                    <td style={{ minWidth: 180 }}><Progression total={x.total} validees={x.validees} soumises={x.soumises} brouillons={x.brouillons} renvoyees={x.renvoyees} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '0 18px 14px' }}><LegendeProgression /></div>
          </div>
        )}
      </Carte>

      <Message type="ok">{message}</Message>
      <Erreur erreur={erreur} />
      {plan.loading && poleId ? <Chargement /> : null}
      <Erreur erreur={plan.error} />
      {p && (
        <Carte titre={`${p.pole.code} — ${p.pole.intitule}`} sansMarge
          actions={peutAgir ? <button type="button" onClick={valider} disabled={!nbSoumises}>Valider les {nbSoumises} saisie(s) soumise(s)</button> : null}>
          <div className="defile">
            <table>
              <thead><tr><th>Critère</th><th className="num">Cible</th><th className="num">Réalisé</th><th>Explications et justificatifs</th><th>État</th></tr></thead>
              <tbody>
                {axes.map((axe) => (
                  <BlocAxe key={axe} axe={axe}>
                    {p.lignes.filter((l) => l.axe === axe).map((l) => (
                      <LigneControle key={l.critereId} ligne={l} peutAgir={peutAgir} onChange={rafraichir} onErreur={setErreur} />
                    ))}
                  </BlocAxe>
                ))}
              </tbody>
            </table>
          </div>
        </Carte>
      )}
    </>
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
