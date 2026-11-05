'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useAuth, ROLES } from '@/lib/auth';
import { trimestre, nombre, dateHeure } from '@/lib/format';
import { PageHeader, Carte, Erreur, Chargement, Vide, Etat, Champ, Message } from '@/components/ui';
import { Icone } from '@/components/Icones';

const signe = (n) => (n === null || n === undefined ? '—' : `${n > 0 ? '+' : ''}${nombre(n, 1)}`);

function Faits({ s }) {
  const f = s.donnees;
  if (!f) return null;
  if (f.type === 'COMPARATIVE') {
    return (
      <div className="defile">
        <table>
          <thead><tr><th className="num">Rang</th><th>Pôle</th><th>Famille</th><th className="num">Score</th><th className="num">Évolution</th></tr></thead>
          <tbody>
            {f.poles.map((p) => (
              <tr key={p.code}><td className="num">{p.rang}</td><td><b>{p.code}</b> — {p.intitule}</td><td>{p.famille}</td>
                <td className="num">{nombre(p.score, 1)}</td><td className="num">{signe(p.evolution)}</td></tr>
            ))}
          </tbody>
        </table>
        <small>Moyenne {nombre(f.synthese.moyenne, 1)} · {f.synthese.nombrePoles} pôle(s){f.historiqueDisponible ? '' : ' · pas de trimestre précédent clôturé'}</small>
      </div>
    );
  }
  return (
    <div className="defile">
      <table>
        <thead><tr><th>Critère</th><th className="num">Valeur</th><th className="num">Cible</th><th className="num">Note</th><th className="num">Évolution</th><th className="num">Poids</th></tr></thead>
        <tbody>
          {f.criteres.map((c) => (
            <tr key={c.intitule}><td>{c.intitule}</td><td className="num">{c.valeur === null ? '—' : `${nombre(c.valeur)} ${c.unite}`}</td>
              <td className="num">{nombre(c.cible)} {c.unite}</td><td className="num">{c.note === null ? 'Non renseigné' : nombre(c.note, 1)}</td>
              <td className="num">{signe(c.evolution)}</td><td className="num">{nombre(c.poidsEffectif, 1)} %</td></tr>
          ))}
        </tbody>
      </table>
      <small>Score {nombre(f.score.consolide, 1)}{f.score.precedent !== null ? ` (trimestre précédent ${nombre(f.score.precedent, 1)}, ${signe(f.score.evolution)} point(s))` : ' · pas de trimestre précédent clôturé'}</small>
    </div>
  );
}

function Synthese({ s, peutRelire, onChange }) {
  const [texte, setTexte] = useState(s.contenu || '');
  const [erreur, setErreur] = useState(null);
  const [occupe, setOccupe] = useState(false);
  useEffect(() => { setTexte(s.contenu || ''); }, [s.id, s.contenu]);
  const editable = peutRelire && s.statut === 'BROUILLON';

  async function agir(fn) {
    setErreur(null); setOccupe(true);
    try { await fn(); onChange(); } catch (e) { setErreur(e); } finally { setOccupe(false); }
  }
  const enregistrer = () => agir(() => api(`/syntheses/${s.id}`, { method: 'PATCH', body: { contenu: texte } }));
  const valider = () => agir(async () => {
    if (texte !== (s.contenu || '') && texte.trim()) await api(`/syntheses/${s.id}`, { method: 'PATCH', body: { contenu: texte } });
    await api(`/syntheses/${s.id}/valider`, { method: 'POST' });
  });

  const titre = s.type === 'POLE' ? `${s.poleCode} — ${s.poleIntitule}` : 'Synthèse comparative — comité de direction';
  return (
    <Carte titre={titre} actions={<Etat statut={s.statut} />}>
      <Message type={s.statut === 'VALIDEE' ? 'ok' : 'attention'}>{s.mention}</Message>
      {s.mode === 'DEGRADE' && (
        <Message type="info">Mode dégradé : les chiffres ci-dessous sont produits, sans commentaire rédigé{s.motifDegrade ? ` (${s.motifDegrade})` : ''}. {editable ? 'Vous pouvez rédiger le commentaire vous-même avant validation.' : ''}</Message>
      )}
      {editable ? (
        <Champ label="Commentaire d’analyse (à relire et corriger avant validation)" id={`txt-${s.id}`}>
          <textarea id={`txt-${s.id}`} rows={8} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Aucun commentaire pour le moment" />
        </Champ>
      ) : (
        s.contenu ? <p style={{ whiteSpace: 'pre-wrap' }}>{s.contenu}</p> : <small>Aucun commentaire rédigé : seule la restitution chiffrée est disponible.</small>
      )}
      <Erreur erreur={erreur} />
      {editable && (
        <div className="actions-form">
          <button type="button" className="secondaire" disabled={occupe || !texte.trim() || texte === (s.contenu || '')} onClick={enregistrer}><Icone nom="disquette" taille={16} />Enregistrer la relecture</button>
          <button type="button" disabled={occupe} onClick={valider}>J’ai relu : valider la synthèse</button>
        </div>
      )}
      <details style={{ marginTop: 12 }}>
        <summary>Chiffres sur lesquels s’appuie la synthèse</summary>
        <Faits s={s} />
      </details>
      <small>
        {s.modifiee ? 'Texte corrigé par le contrôle de gestion. ' : ''}
        {s.statut === 'VALIDEE' ? `Validée le ${dateHeure(s.dateValidation)}.` : `Créée le ${dateHeure(s.creeLe)}.`}
        {peutRelire && s.modele ? ` Modèle : ${s.modele} · coût ${nombre(s.cout, 4)} $.` : ''}
      </small>
    </Carte>
  );
}

export default function Syntheses() {
  const { user } = useAuth();
  const estCG = user && user.role === ROLES.CONTROLE_GESTION;
  const campagnes = useAsync(() => api('/campagnes', { query: { limit: 50 } }), []);
  const cloturees = ((campagnes.data && campagnes.data.data) || []).filter((c) => c.statut === 'CLOTUREE');
  const [campagneId, setCampagneId] = useState('');
  useEffect(() => { if (!campagneId && cloturees.length) setCampagneId(cloturees[0].id); }, [cloturees, campagneId]);

  const syntheses = useAsync(() => api('/syntheses', { query: { campagneId, limit: 100 } }), [campagneId], Boolean(campagneId));
  const cout = useAsync(() => api('/syntheses/cout'), [], Boolean(estCG));
  const avancement = useAsync(() => api(`/campagnes/${campagneId}/avancement`), [campagneId], Boolean(campagneId && estCG));
  const liste = (syntheses.data && syntheses.data.data) || [];
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);

  function recharger() { syntheses.reload(); if (estCG) cout.reload(); }

  async function generer(poleIds) {
    setErreur(null); setMessage(''); setOccupe(true);
    try {
      for (const poleId of poleIds) {
        await api('/syntheses/generer', { method: 'POST', body: poleId ? { campagneId, poleId } : { campagneId } });
      }
      setMessage(poleIds.length > 1 ? `${poleIds.length} synthèses générées en brouillon.` : 'Synthèse générée en brouillon.');
      recharger();
    } catch (e) { setErreur(e); recharger(); } finally { setOccupe(false); }
  }
  const poles = (avancement.data && avancement.data.poles) || [];
  const existePole = (id) => liste.some((s) => s.type === 'POLE' && s.poleId === id);
  const c = cout.data;

  return (
    <>
      <PageHeader titre="Synthèses trimestrielles" sousTitre="Commentaires d’analyse générés automatiquement à partir des seuls scores, relus et validés par le contrôle de gestion avant toute diffusion." />
      <Carte>
        <Champ label="Campagne clôturée" id="camp-synth">
          <select id="camp-synth" value={campagneId} onChange={(e) => setCampagneId(e.target.value)}>
            {!cloturees.length && <option value="">Aucune campagne clôturée</option>}
            {cloturees.map((x) => <option key={x.id} value={x.id}>{trimestre(x)}</option>)}
          </select>
        </Champ>
        {estCG && campagneId && (
          <div className="actions-form">
            <button type="button" disabled={occupe} onClick={() => generer([null])}><Icone nom="etincelle" taille={16} />Générer la synthèse comparative</button>
            <button type="button" className="secondaire" disabled={occupe || !poles.length}
              onClick={() => generer(poles.filter((p) => !existePole(p.poleId)).map((p) => p.poleId))}>
              Générer les synthèses des pôles manquantes
            </button>
          </div>
        )}
        {estCG && c && (
          <small>
            {c.configure ? `Modèle ${c.modele}` : 'Service d’assistance non configuré (mode dégradé)'} · dépense du mois {nombre(c.consomme, 4)} $ sur {nombre(c.plafond, 2)} $ ({c.appels} appel(s)).
            {c.restant <= 0 ? ' Plafond atteint : mode dégradé jusqu’au mois prochain.' : ''}
          </small>
        )}
        <Message type="ok">{message}</Message>
        <Erreur erreur={erreur || syntheses.error || campagnes.error} />
      </Carte>
      {syntheses.loading ? <Chargement /> : !liste.length ? (
        <Vide titre="Aucune synthèse">
          {estCG ? 'Générez la synthèse comparative ou celles des pôles : elles apparaissent ici en brouillon.' : 'Aucune synthèse validée pour cette campagne.'}
        </Vide>
      ) : liste.map((s) => <Synthese key={s.id} s={s} peutRelire={Boolean(estCG)} onChange={recharger} />)}
    </>
  );
}
