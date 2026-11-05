'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { AXES, nombre, periode } from '@/lib/format';
import {
  BarreAvancement, Bouton, Champ, Chargement, ErreurApi, ModaleFormulaire, PageHeader, PastilleStatutCampagne, PastilleStatutSaisie, useToast,
} from '@/components/ui';
import Regle from '@/components/Regle';

const aTexte = (v) => (v === null || v === undefined ? '' : String(v));
const versNombre = (t) => {
  const s = String(t).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

/** État éditable d'une ligne, construit à partir de la saisie enregistrée. */
function brouillonDe(l) {
  return {
    valeur: aTexte(l.valeurRealisee),
    commentaire: aTexte(l.commentaire),
    nonRenseigne: !(l.valeurRealisee !== null && l.valeurRealisee !== undefined) && Boolean(l.motifNonRenseigne),
    motif: aTexte(l.motifNonRenseigne),
  };
}
const identique = (a, b) => a.valeur === b.valeur && a.commentaire === b.commentaire && a.nonRenseigne === b.nonRenseigne && a.motif === b.motif;

function Pieces({ ligne, modifiable, onChange }) {
  const toast = useToast();
  const champ = useRef(null);
  const [envoi, setEnvoi] = useState(false);

  const deposer = async (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    setEnvoi(true);
    try {
      const f = new FormData();
      f.append('piece', fichier);
      await api.upload(`/saisies/${ligne.saisieId}/pieces`, f);
      toast('Pièce justificative ajoutée.');
      onChange();
    } catch (err) { toast(err.message, true); } finally { setEnvoi(false); if (champ.current) champ.current.value = ''; }
  };
  const telecharger = async (p) => {
    try {
      const blob = await api.blob(`/saisies/${ligne.saisieId}/pieces/${p.id}/fichier`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = p.nomFichier; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast(err.message, true); }
  };

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <span className="etiquette" style={{ fontWeight: 600, fontSize: '0.95rem' }}>
        Pièce justificative{ligne.justificatifRequis ? ' (obligatoire pour ce critère)' : ''}
      </span>
      {ligne.pieces.length > 0 && (
        <ul className="liste-plate">
          {ligne.pieces.map((p) => (
            <li key={p.id}>
              <button type="button" className="btn discret petit" onClick={() => telecharger(p)}>{p.nomFichier}</button>
              <span className="petit muted"> {nombre(p.tailleOctets / 1024, 0)} Ko</span>
            </li>
          ))}
        </ul>
      )}
      {modifiable && (
        ligne.saisieId ? (
          <div style={{ marginTop: '0.35rem' }}>
            <input ref={champ} type="file" onChange={deposer} disabled={envoi} aria-label={`Ajouter une pièce pour ${ligne.intitule}`} />
          </div>
        ) : <p className="aide petit muted">Enregistrez d&apos;abord le brouillon pour pouvoir joindre une pièce.</p>
      )}
      {!modifiable && ligne.pieces.length === 0 && <p className="petit muted">Aucune pièce jointe.</p>}
    </div>
  );
}

function Ligne({ ligne, etat, onEdit, problemes, peutRenvoyer, onRenvoi, rechargerPieces, role }) {
  const modifiable = ligne.editable && role === 'RESPONSABLE_POLE';
  const valeurNum = etat.nonRenseigne ? null : versNombre(etat.valeur);
  const valeurAffichee = Number.isNaN(valeurNum) ? null : valeurNum;
  const hint = ligne.variationAnormale && ligne.statut !== 'VALIDEE';

  return (
    <div className={`ligne-saisie ${ligne.statut === 'RENVOYEE' ? 'a-corriger' : ''}`} id={`critere-${ligne.critereId}`}>
      <div>
        <h3>{ligne.intitule} <PastilleStatutSaisie statut={ligne.statut} /></h3>
        <p className="def">{ligne.definition}</p>
        <p className="cible">
          Cible du trimestre : <strong className="num">{nombre(ligne.valeurCible)} {ligne.unite}</strong>
          {' '}({ligne.sens === 'MINIMISER' ? 'plus bas, c\'est mieux' : 'plus haut, c\'est mieux'})
          {ligne.valeurPrecedente !== null && ligne.valeurPrecedente !== undefined && (
            <><br /><span className="muted">Trimestre précédent : <span className="num">{nombre(ligne.valeurPrecedente)} {ligne.unite}</span></span></>
          )}
        </p>
        {ligne.dernierRenvoi && (
          <div className="message avert" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
            <strong>Renvoyé pour correction :</strong> {ligne.dernierRenvoi}
          </div>
        )}
      </div>

      <div>
        {modifiable ? (
          <>
            <Champ label={`Valeur réalisée (${ligne.unite})`} id={`val-${ligne.critereId}`}>
              {(id) => (
                <div className="entree">
                  <input id={id} type="number" step="any" inputMode="decimal" disabled={etat.nonRenseigne} value={etat.nonRenseigne ? '' : etat.valeur}
                    aria-invalid={problemes.length > 0 || Number.isNaN(valeurNum)} onChange={(e) => onEdit({ valeur: e.target.value })} />
                  <span className="unite">{ligne.unite}</span>
                </div>
              )}
            </Champ>
            <div className="champ" style={{ marginBottom: '0.6rem' }}>
              <label style={{ fontWeight: 400, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="checkbox" checked={etat.nonRenseigne} onChange={(e) => onEdit({ nonRenseigne: e.target.checked, valeur: e.target.checked ? '' : etat.valeur })} />
                Je ne peux pas renseigner cet indicateur
              </label>
            </div>
            {etat.nonRenseigne && (
              <Champ label="Motif" aide="L'indicateur sera exclu de la notation ; sa pondération est redistribuée. Aucune valeur n'est estimée.">
                {(id) => <textarea id={id} value={etat.motif} onChange={(e) => onEdit({ motif: e.target.value })} />}
              </Champ>
            )}
            <details open={Boolean(etat.commentaire) || hint}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Commentaire d&apos;explication</summary>
              <div style={{ marginTop: '0.5rem' }}>
                <textarea aria-label={`Commentaire pour ${ligne.intitule}`} value={etat.commentaire} onChange={(e) => onEdit({ commentaire: e.target.value })} />
              </div>
            </details>
          </>
        ) : (
          <>
            <p className="petit muted">Valeur réalisée</p>
            <p style={{ fontSize: '1.3rem', fontFamily: 'var(--police-titre)', fontWeight: 650 }} className="num">
              {ligne.valeurRealisee !== null && ligne.valeurRealisee !== undefined ? `${nombre(ligne.valeurRealisee)} ${ligne.unite}` : <span className="muted" style={{ fontSize: '1rem', fontWeight: 400 }}>Non renseignée</span>}
            </p>
            {ligne.motifNonRenseigne && <p className="petit"><strong>Motif :</strong> {ligne.motifNonRenseigne}</p>}
            {ligne.commentaire && <p className="petit"><strong>Commentaire :</strong> {ligne.commentaire}</p>}
          </>
        )}
        {ligne.avertissements.map((a) => <p key={a.code} className="petit" style={{ color: 'var(--alerte)', marginTop: '0.4rem' }}>{a.message}</p>)}
        {problemes.length > 0 && <ul className="problemes">{problemes.map((m, i) => <li key={i}>{m}</li>)}</ul>}
        {(ligne.justificatifRequis || ligne.pieces.length > 0) && <Pieces ligne={ligne} modifiable={modifiable} onChange={rechargerPieces} />}
        {peutRenvoyer && ['SOUMISE', 'VALIDEE'].includes(ligne.statut) && (
          <div style={{ marginTop: '0.6rem' }}><Bouton variante="secondaire" petit onClick={() => onRenvoi(ligne)}>Renvoyer pour correction</Bouton></div>
        )}
      </div>

      <div>
        <p className="petit muted">Position par rapport à la cible</p>
        <Regle sens={ligne.sens} cible={ligne.valeurCible} valeur={modifiable ? valeurAffichee : ligne.valeurRealisee} unite={ligne.unite} />
      </div>
    </div>
  );
}

export default function FeuilleDeSaisie() {
  const { id, poleId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(`/campagnes/${id}/poles/${poleId}/saisies`);
  const [brouillons, setBrouillons] = useState({});
  const [problemes, setProblemes] = useState({});
  const [erreurGlobale, setErreurGlobale] = useState(null);
  const [attente, setAttente] = useState(false);
  const [renvoi, setRenvoi] = useState(null);
  const [motifRenvoi, setMotifRenvoi] = useState('');
  const initial = useRef({});

  // (Ré)initialise le brouillon local à chaque chargement de données serveur.
  useEffect(() => {
    if (!data) return;
    const b = {};
    data.lignes.forEach((l) => { b[l.critereId] = brouillonDe(l); });
    initial.current = b;
    setBrouillons(b);
  }, [data]);

  const lignes = useMemo(() => data?.lignes || [], [data]);
  const modifs = useMemo(() => lignes.filter((l) => l.editable && brouillons[l.critereId] && !identique(brouillons[l.critereId], initial.current[l.critereId] || brouillons[l.critereId])), [lignes, brouillons]);

  useEffect(() => {
    if (!modifs.length) return undefined;
    const avant = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avant);
    return () => window.removeEventListener('beforeunload', avant);
  }, [modifs.length]);

  const edit = useCallback((critereId, patch) => setBrouillons((b) => ({ ...b, [critereId]: { ...b[critereId], ...patch } })), []);

  /** Envoie les lignes modifiées ; retourne true si tout est enregistré. */
  const enregistrer = useCallback(async () => {
    const pb = {}; let ok = true;
    for (const l of modifs) {
      const b = brouillons[l.critereId];
      const valeur = b.nonRenseigne ? null : versNombre(b.valeur);
      if (Number.isNaN(valeur)) { pb[l.critereId] = ['La valeur doit être un nombre.']; ok = false; continue; }
      try {
        await api.put(`/campagnes/${id}/poles/${poleId}/criteres/${l.critereId}`, {
          valeurRealisee: valeur,
          commentaire: b.commentaire.trim() || null,
          motifNonRenseigne: b.nonRenseigne ? (b.motif.trim() || null) : null,
        });
      } catch (e) {
        ok = false;
        pb[l.critereId] = Array.isArray(e.details) && e.details.length ? e.details.map((d) => d.message) : [e.message];
      }
    }
    setProblemes(pb);
    return ok;
  }, [modifs, brouillons, id, poleId]);

  const surEnregistrer = async () => {
    setAttente(true); setErreurGlobale(null);
    const ok = await enregistrer();
    if (ok) toast(modifs.length ? 'Brouillon enregistré.' : 'Rien à enregistrer.');
    else toast('Certaines valeurs sont refusées : corrigez les lignes signalées.', true);
    await reload();
    setAttente(false);
  };

  const surSoumettre = async () => {
    setAttente(true); setErreurGlobale(null);
    if (!(await enregistrer())) {
      toast('Corrigez les lignes signalées avant de soumettre.', true);
      await reload(); setAttente(false); return;
    }
    try {
      await api.post(`/campagnes/${id}/poles/${poleId}/soumettre`);
      setProblemes({});
      toast('Indicateurs soumis au contrôle de gestion.');
    } catch (e) {
      if (e.code === 'SOUMISSION_INCOMPLETE' && Array.isArray(e.details)) {
        const pb = {};
        e.details.forEach((d) => { pb[d.critereId] = d.erreurs.map((x) => x.message); });
        setProblemes(pb);
        setErreurGlobale({ message: `${e.details.length} indicateur(s) à compléter ou corriger avant la soumission.` });
        document.getElementById(`critere-${e.details[0].critereId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else setErreurGlobale(e);
    }
    await reload();
    setAttente(false);
  };

  const validerPole = async () => {
    setAttente(true); setErreurGlobale(null);
    try { await api.post(`/campagnes/${id}/poles/${poleId}/valider`); toast('Saisies du pôle validées.'); } catch (e) { setErreurGlobale(e); }
    await reload(); setAttente(false);
  };

  const renvoyer = async () => {
    await api.post(`/saisies/${renvoi.saisieId}/renvoyer`, { motif: motifRenvoi });
    toast('Indicateur renvoyé pour correction. Le responsable est notifié.');
    setMotifRenvoi('');
    reload();
  };

  if (loading && !data) return <Chargement />;
  if (error) return <><PageHeader titre="Feuille de saisie" retour={{ href: `/campagnes/${id}`, label: '← Campagne' }} /><ErreurApi erreur={error} /></>;

  const { campagne, pole } = data;
  const estResp = user.role === 'RESPONSABLE_POLE';
  const controle = user.role === 'CONTROLE_GESTION';
  const ouverte = campagne.statut !== 'CLOTUREE';
  const total = lignes.length;
  const renseignes = lignes.filter((l) => l.statut && (l.valeurRealisee !== null || l.motifNonRenseigne)).length;
  const nb = (s) => lignes.filter((l) => l.statut === s).length;
  const editables = lignes.filter((l) => l.editable);
  const parAxe = ['FINANCIER', 'HUMAIN', 'QUALITE'].map((a) => ({ axe: a, items: lignes.filter((l) => l.axe === a) })).filter((x) => x.items.length);

  return (
    <>
      <PageHeader
        titre={`${pole.code} · ${periode(campagne)}`}
        retour={{ href: `/campagnes/${id}`, label: '← Campagne' }}
        contexte={<>{pole.intitule} · {pole.famille} <PastilleStatutCampagne statut={campagne.statut} /></>}
      />

      <dl className="sommaire">
        <div><dt>Indicateurs renseignés</dt><dd>{renseignes} / {total}</dd></div>
        <div><dt>À corriger</dt><dd>{nb('RENVOYEE')}</dd></div>
        <div><dt>Soumis</dt><dd>{nb('SOUMISE')}</dd></div>
        <div><dt>Validés</dt><dd>{nb('VALIDEE')}</dd></div>
      </dl>
      <div style={{ maxWidth: '24rem' }}><BarreAvancement valeur={renseignes} total={total} label="Complétion de la saisie" /></div>

      {!ouverte && <div className="message" style={{ marginTop: '1rem' }}>Campagne clôturée : les valeurs sont verrouillées.</div>}
      {estResp && ouverte && editables.length === 0 && <div className="message ok" style={{ marginTop: '1rem' }}>Tous vos indicateurs sont soumis. Ils ne sont plus modifiables, sauf renvoi pour correction.</div>}
      {total === 0 && <div className="message avert" style={{ marginTop: '1rem' }}>Aucun indicateur n&apos;est noté pour ce pôle dans cette campagne (aucune cible validée à l&apos;ouverture).</div>}
      <div style={{ marginTop: '1rem' }}><ErreurApi erreur={erreurGlobale} /></div>

      {parAxe.map(({ axe, items }) => (
        <section className="axe-bloc" key={axe} aria-labelledby={`axe-${axe}`}>
          <h2 id={`axe-${axe}`}>Axe {AXES[axe].toLowerCase()}</h2>
          {items.map((l) => (
            <Ligne key={l.critereId} ligne={l} etat={brouillons[l.critereId] || brouillonDe(l)} role={user.role}
              onEdit={(patch) => edit(l.critereId, patch)} problemes={problemes[l.critereId] || []}
              peutRenvoyer={controle && ouverte} onRenvoi={setRenvoi} rechargerPieces={reload} />
          ))}
        </section>
      ))}

      {(estResp && editables.length > 0 && ouverte) && (
        <div className="barre-actions">
          <span className="petit muted" role="status">{modifs.length ? `${modifs.length} modification(s) non enregistrée(s)` : 'Brouillon à jour'}</span>
          <span style={{ display: 'flex', gap: '0.5rem' }}>
            <Bouton variante="secondaire" onClick={surEnregistrer} disabled={attente || !modifs.length}>Enregistrer le brouillon</Bouton>
            <Bouton onClick={surSoumettre} disabled={attente}>Soumettre tous les indicateurs</Bouton>
          </span>
        </div>
      )}
      {controle && ouverte && nb('SOUMISE') > 0 && (
        <div className="barre-actions">
          <span className="petit muted">{nb('SOUMISE')} indicateur(s) en attente de contrôle. Renvoyez d&apos;abord ceux qui sont à corriger.</span>
          <Bouton onClick={validerPole} disabled={attente}>Valider les {nb('SOUMISE')} indicateur(s) soumis</Bouton>
        </div>
      )}

      {renvoi && (
        <ModaleFormulaire titre={`Renvoyer « ${renvoi.intitule} »`} libelle="Renvoyer pour correction" onClose={() => setRenvoi(null)} onSubmit={renvoyer}>
          <Champ label="Motif du renvoi" aide="Le responsable du pôle reçoit ce motif par notification.">
            {(fid) => <textarea id={fid} required value={motifRenvoi} onChange={(e) => setMotifRenvoi(e.target.value)} />}
          </Champ>
        </ModaleFormulaire>
      )}
    </>
  );
}
