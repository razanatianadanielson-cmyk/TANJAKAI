'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth, ROLES } from '@/lib/auth';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { date, nombre, AXES } from '@/lib/format';
import { PageHeader, Carte, Erreur, Message, Chargement, Etat } from '@/components/ui';
import { Icone } from '@/components/Icones';

const somme = (rows, cle) => Math.round(rows.reduce((t, r) => t + (Number(r.poids) || 0), 0) * 100) / 100;

function Total({ libelle, valeur }) {
  const ok = valeur === 100;
  return <span className={`etat ${ok ? 'ok' : 'danger'}`} style={{ marginRight: 8 }}>{libelle} : {nombre(valeur)} %{ok ? '' : ' (doit faire 100 %)'}</span>;
}

export default function Grille() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const gestion = user.role === ROLES.CONTROLE_GESTION || user.role === ROLES.ADMINISTRATEUR;
  const cg = user.role === ROLES.CONTROLE_GESTION;
  const grille = useAsync(() => api(`/grilles/${id}`), [id]);
  const axes = useAsync(() => api('/axes'), []);
  const familles = useAsync(() => api('/familles'), []);
  const criteres = useAsync(() => api('/criteres', { query: { limit: 100, valide: 'true' } }), []);

  const g = grille.data;
  const editable = Boolean(g && g.statut === 'BROUILLON' && gestion);
  const [rowsAxes, setRowsAxes] = useState([]);
  const [rowsCrit, setRowsCrit] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    if (!g) return;
    setRowsAxes(g.ponderationsAxes.map((p) => ({ axeId: p.axeId, familleId: p.familleId || '', poids: p.poids, motif: p.motif || '' })));
    setRowsCrit(g.ponderationsCriteres.map((p) => ({
      critereId: p.critereId, familleId: p.familleId || '', poids: p.poids, applicable: p.applicable, motif: p.motif || '',
      plancher: p.plancher === null || p.plancher === undefined ? '' : Math.round(p.plancher * 10000) / 100,
      plafond: p.plafond === null || p.plafond === undefined ? '' : Math.round(p.plafond * 10000) / 100,
    })));
  }, [g]);

  const listeAxes = (axes.data && axes.data.data) || [];
  const listeFamilles = (familles.data && familles.data.data) || [];
  const listeCriteres = (criteres.data && criteres.data.data) || [];
  const critereDe = (cid) => listeCriteres.find((c) => c.id === cid);
  const nomFamille = (fid) => (fid ? (listeFamilles.find((f) => f.id === fid) || {}).libelle || 'Famille' : 'Par défaut');

  // Somme par périmètre (défaut ou famille) pour les axes ; par périmètre et par axe pour les critères
  const totauxAxes = useMemo(() => {
    const m = new Map();
    rowsAxes.forEach((r) => m.set(r.familleId, [...(m.get(r.familleId) || []), r]));
    return [...m.entries()].map(([f, rows]) => ({ cle: f || 'defaut', libelle: `Axes — ${nomFamille(f)}`, valeur: somme(rows) }));
  }, [rowsAxes, listeFamilles]); // eslint-disable-line react-hooks/exhaustive-deps
  const totauxCrit = useMemo(() => {
    const m = new Map();
    rowsCrit.filter((r) => r.applicable).forEach((r) => {
      const c = critereDe(r.critereId);
      const cle = `${r.familleId}|${c ? c.axe : '?'}`;
      m.set(cle, { f: r.familleId, axe: c ? c.axe : '?', rows: [...((m.get(cle) || {}).rows || []), r] });
    });
    return [...m.entries()].map(([cle, v]) => ({ cle, libelle: `${AXES[v.axe] || v.axe} — ${nomFamille(v.f)}`, valeur: somme(v.rows) }));
  }, [rowsCrit, listeCriteres, listeFamilles]); // eslint-disable-line react-hooks/exhaustive-deps

  const majAxe = (i, patch) => setRowsAxes(rowsAxes.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const majCrit = (i, patch) => setRowsCrit(rowsCrit.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const nb = (v) => Number(String(v).replace(',', '.'));

  async function agir(fn, ok) {
    setErreur(null); setMessage(''); setOccupe(true);
    try { await fn(); if (ok) setMessage(ok); } catch (e) { setErreur(e); } finally { setOccupe(false); }
  }

  const enregistrerAxes = () => agir(async () => {
    await api(`/grilles/${id}/ponderations-axes`, { method: 'PUT', body: { ponderations: rowsAxes.map((r) => ({ axeId: r.axeId, familleId: r.familleId || null, poids: nb(r.poids), ...(r.motif ? { motif: r.motif } : {}) })) } });
    grille.reload();
  }, "Pondérations des axes enregistrées.");

  const enregistrerCriteres = () => agir(async () => {
    await api(`/grilles/${id}/ponderations-criteres`, {
      method: 'PUT',
      body: {
        ponderations: rowsCrit.map((r) => ({
          critereId: r.critereId, familleId: r.familleId || null, poids: nb(r.poids), applicable: r.applicable, ...(r.motif ? { motif: r.motif } : {}),
          ...(r.applicable ? { plancher: nb(r.plancher) / 100, plafond: nb(r.plafond) / 100 } : {}),
        })),
      },
    });
    grille.reload();
  }, 'Critères, pondérations et barèmes enregistrés.');

  const valider = () => {
    if (!window.confirm(`Valider la version ${g.version} ? Elle sera figée : toute modification ultérieure créera une nouvelle version.`)) return;
    return agir(async () => { await api(`/grilles/${id}/valider`, { method: 'POST' }); grille.reload(); }, `Grille v${g.version} validée et figée.`);
  };
  const supprimer = () => {
    if (!window.confirm('Supprimer ce brouillon ?')) return;
    return agir(async () => { await api(`/grilles/${id}`, { method: 'DELETE' }); router.push('/grilles'); });
  };

  if (grille.loading) return <Chargement />;
  if (grille.error) return <><Erreur erreur={grille.error} /><Link href="/grilles">Retour aux grilles</Link></>;

  const axesPresents = listeAxes;
  return (
    <>
      <PageHeader titre={`Grille de notation v${g.version}`}
        sousTitre={g.motifChangement ? `Motif du changement : ${g.motifChangement}` : 'Version initiale'}
        actions={<><Etat statut={g.statut === 'VALIDEE' ? 'VALIDEE' : 'BROUILLON'} />{g.dateValidation ? <small>le {date(g.dateValidation)}</small> : null}<Link className="bouton secondaire" href="/grilles">Toutes les versions</Link></>} />
      <Message type="ok">{message}</Message>
      <Erreur erreur={erreur || axes.error || criteres.error} />
      {editable && <Message type="info">Brouillon : la validation vérifie que les axes totalisent 100 %, que les critères applicables de chaque axe totalisent 100 % et que chacun a un barème. Plancher et plafond s'expriment en % de la cible : sous le plancher la note est 0, au plafond elle est 100.</Message>}

      <Carte titre="Pondération des axes" sansMarge
        actions={editable ? <button type="button" onClick={enregistrerAxes} disabled={occupe}><Icone nom="disquette" taille={16} />Enregistrer les axes</button> : null}>
        <div className="defile">
          <table>
            <thead><tr><th>Axe</th><th>Périmètre</th><th className="num">Poids (%)</th><th>Motif de la différenciation</th>{editable && <th />}</tr></thead>
            <tbody>
              {rowsAxes.map((r, i) => (
                <tr key={`${r.axeId}-${r.familleId}-${i}`}>
                  <td>{editable ? (
                    <select aria-label="Axe" value={r.axeId} onChange={(e) => majAxe(i, { axeId: e.target.value })}>
                      <option value="">Choisir…</option>{axesPresents.map((a) => <option key={a.id} value={a.id}>{a.libelle}</option>)}
                    </select>) : <b>{(axesPresents.find((a) => a.id === r.axeId) || {}).libelle || '—'}</b>}</td>
                  <td>{editable ? (
                    <select aria-label="Famille" value={r.familleId} onChange={(e) => majAxe(i, { familleId: e.target.value })}>
                      <option value="">Par défaut (toutes les familles)</option>{listeFamilles.map((f) => <option key={f.id} value={f.id}>{f.libelle}</option>)}
                    </select>) : nomFamille(r.familleId)}</td>
                  <td className="num">{editable ? <input aria-label="Poids de l'axe" style={{ width: 90 }} inputMode="decimal" value={r.poids} onChange={(e) => majAxe(i, { poids: e.target.value })} /> : nombre(r.poids)}</td>
                  <td>{editable ? <input aria-label="Motif" value={r.motif} disabled={!r.familleId} placeholder={r.familleId ? 'Obligatoire pour une famille' : ''} onChange={(e) => majAxe(i, { motif: e.target.value })} /> : (r.motif || '—')}</td>
                  {editable && <td><button type="button" className="secondaire" onClick={() => setRowsAxes(rowsAxes.filter((_, k) => k !== i))}>Retirer</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '10px 18px 14px' }}>
            {totauxAxes.map((t) => <Total key={t.cle} libelle={t.libelle} valeur={t.valeur} />)}
            {editable && <button type="button" className="secondaire" onClick={() => setRowsAxes([...rowsAxes, { axeId: '', familleId: '', poids: '', motif: '' }])}>Ajouter une pondération d'axe</button>}
          </div>
        </div>
      </Carte>

      <Carte titre="Critères, pondérations et barèmes" sansMarge
        actions={editable ? <button type="button" onClick={enregistrerCriteres} disabled={occupe}><Icone nom="disquette" taille={16} />Enregistrer les critères</button> : null}>
        <div className="defile">
          <table>
            <thead><tr><th>Critère</th><th>Périmètre</th><th className="num">Poids dans l'axe (%)</th><th>Applicable</th><th className="num">Plancher (% cible)</th><th className="num">Plafond (% cible)</th><th>Motif</th>{editable && <th />}</tr></thead>
            <tbody>
              {rowsCrit.map((r, i) => {
                const c = critereDe(r.critereId);
                const nom = (g.ponderationsCriteres.find((p) => p.critereId === r.critereId) || {}).intitule;
                return (
                  <tr key={`${r.critereId}-${r.familleId}-${i}`}>
                    <td>{editable ? (
                      <select aria-label="Critère" value={r.critereId} onChange={(e) => majCrit(i, { critereId: e.target.value })}>
                        <option value="">Choisir…</option>{listeCriteres.map((x) => <option key={x.id} value={x.id}>{AXES[x.axe] ? `${x.intitule}` : x.intitule} ({x.unite})</option>)}
                      </select>) : <b>{nom || (c && c.intitule) || '—'}</b>}
                      {c ? <><br /><small>{AXES[c.axe]}</small></> : null}</td>
                    <td>{editable ? (
                      <select aria-label="Famille" value={r.familleId} onChange={(e) => majCrit(i, { familleId: e.target.value })}>
                        <option value="">Par défaut</option>{listeFamilles.map((f) => <option key={f.id} value={f.id}>{f.libelle}</option>)}
                      </select>) : nomFamille(r.familleId)}</td>
                    <td className="num">{editable ? <input aria-label="Poids du critère" style={{ width: 90 }} inputMode="decimal" value={r.poids} onChange={(e) => majCrit(i, { poids: e.target.value })} /> : nombre(r.poids)}</td>
                    <td>{editable ? <input type="checkbox" aria-label="Applicable" checked={r.applicable} onChange={(e) => majCrit(i, { applicable: e.target.checked })} /> : (r.applicable ? 'Oui' : 'Non')}</td>
                    <td className="num">{editable ? <input aria-label="Plancher" style={{ width: 90 }} inputMode="decimal" value={r.plancher} disabled={!r.applicable} onChange={(e) => majCrit(i, { plancher: e.target.value })} /> : (r.plancher === '' ? '—' : nombre(r.plancher))}</td>
                    <td className="num">{editable ? <input aria-label="Plafond" style={{ width: 90 }} inputMode="decimal" value={r.plafond} disabled={!r.applicable} onChange={(e) => majCrit(i, { plafond: e.target.value })} /> : (r.plafond === '' ? '—' : nombre(r.plafond))}</td>
                    <td>{editable ? <input aria-label="Motif" value={r.motif} placeholder={!r.applicable || r.familleId ? 'Obligatoire' : ''} onChange={(e) => majCrit(i, { motif: e.target.value })} /> : (r.motif || '—')}</td>
                    {editable && <td><button type="button" className="secondaire" onClick={() => setRowsCrit(rowsCrit.filter((_, k) => k !== i))}>Retirer</button></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '10px 18px 14px' }}>
            {totauxCrit.map((t) => <Total key={t.cle} libelle={t.libelle} valeur={t.valeur} />)}
            {editable && <button type="button" className="secondaire" onClick={() => setRowsCrit([...rowsCrit, { critereId: '', familleId: '', poids: '', applicable: true, motif: '', plancher: 50, plafond: 100 }])}>Ajouter un critère</button>}
          </div>
        </div>
      </Carte>

      {editable && (
        <div className="actions">
          {cg && <button type="button" onClick={valider} disabled={occupe}><Icone nom="check" taille={16} />Valider et figer la grille</button>}
          <button type="button" className="danger" onClick={supprimer} disabled={occupe}>Supprimer le brouillon</button>
          {!cg && <small>La validation est réservée au contrôle de gestion.</small>}
        </div>
      )}
    </>
  );
}
