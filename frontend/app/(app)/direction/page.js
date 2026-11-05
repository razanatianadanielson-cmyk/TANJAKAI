'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api, telecharger } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { trimestre, nombre, exporterCsv, AXES } from '@/lib/format';
import { PageHeader, Carte, Erreur, Chargement, Vide, Etat } from '@/components/ui';
import LineChart from '@/components/LineChart';
import { TypeAlerte, Icone } from '@/components/Icones';

export default function VueDirection() {
  const [campagneId, setCampagneId] = useState('');
  const [familleId, setFamilleId] = useState('');
  const [erreurExport, setErreurExport] = useState(null);
  const campagnes = useAsync(() => api('/campagnes', { query: { limit: 50 } }), []);
  const familles = useAsync(() => api('/familles'), []);
  const tous = useAsync(() => api('/scores', { query: { limit: 100 } }), []);
  const alertes = useAsync(() => api('/alertes', { query: { actives: true, limit: 8 } }), []);

  const clotures = useMemo(() => ((campagnes.data && campagnes.data.data) || []).filter((c) => c.statut === 'CLOTUREE'), [campagnes.data]);
  useEffect(() => {
    if (!campagneId && clotures.length) setCampagneId(clotures[0].id);
  }, [clotures, campagneId]);

  const scores = useMemo(() => (tous.data && tous.data.data) || [], [tous.data]);
  const courants = useMemo(
    () => scores.filter((s) => s.campagneId === campagneId && (!familleId || s.familleId === familleId)).sort((a, b) => (b.scoreConsolide ?? -1) - (a.scoreConsolide ?? -1)),
    [scores, campagneId, familleId],
  );

  // Profil par axe : une lecture de détail par score affiché (le nombre de pôles reste modeste)
  const profils = useAsync(
    () => Promise.all(courants.map((s) => api(`/scores/${s.id}`).then((d) => [s.id, d]).catch(() => [s.id, null]))).then(Object.fromEntries),
    [courants.map((s) => s.id).join(',')], courants.length > 0,
  );
  const noteAxe = (scoreId, code) => {
    const d = profils.data && profils.data[scoreId];
    const a = d && d.axes.find((x) => x.code === code);
    return a ? a.note : null;
  };

  // Évolution : toutes les campagnes closes, une courbe par pôle
  const periodes = useMemo(() => {
    const m = new Map();
    scores.forEach((s) => m.set(s.exercice * 4 + s.trimestre, trimestre(s)));
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [scores]);
  const series = useMemo(() => {
    const poles = new Map();
    scores.filter((s) => !familleId || s.familleId === familleId).forEach((s) => {
      if (!poles.has(s.poleId)) poles.set(s.poleId, { nom: s.poleCode, valeurs: periodes.map(() => null) });
      const i = periodes.findIndex((p) => p[0] === s.exercice * 4 + s.trimestre);
      poles.get(s.poleId).valeurs[i] = s.scoreConsolide;
    });
    return [...poles.values()];
  }, [scores, periodes, familleId]);

  function exporter() {
    const c = clotures.find((x) => x.id === campagneId);
    exporterCsv(`scores-${c ? `${c.exercice}-T${c.trimestre}` : 'export'}.csv`, [
      { titre: 'Rang', valeur: (s) => courants.indexOf(s) + 1 },
      { titre: 'Pôle', valeur: (s) => s.poleCode },
      { titre: 'Intitulé', valeur: (s) => s.poleIntitule },
      { titre: 'Famille', valeur: (s) => s.famille },
      { titre: 'Score consolidé', valeur: (s) => s.scoreConsolide },
      { titre: 'Partiel', valeur: (s) => (s.partiel ? 'oui' : 'non') },
      ...Object.entries(AXES).map(([code, lib]) => ({ titre: lib, valeur: (s) => noteAxe(s.id, code) })),
    ], courants);
  }

  async function exporterSaisies() {
    setErreurExport(null);
    try { await telecharger(`/saisies/export?campagneId=${campagneId}`, 'saisies-validees.csv'); } catch (e) { setErreurExport(e); }
  }

  const chargement = campagnes.loading || tous.loading;
  return (
    <>
      <PageHeader titre="Vue de direction"
        sousTitre="Classement des pôles par score consolidé et dérive dans le temps. Un score reflète la tenue des engagements de chaque pôle, pas la taille ni la rentabilité de son activité."
        actions={<div className="actions-form"><button type="button" className="secondaire" onClick={exporter} disabled={!courants.length}><Icone nom="telecharger" taille={16} />Exporter en CSV</button><button type="button" className="secondaire" onClick={exporterSaisies} disabled={!campagneId}><Icone nom="telecharger" taille={16} />Exporter les saisies validées</button></div>} />
      <Erreur erreur={campagnes.error || tous.error || erreurExport} />
      {alertes.data && alertes.data.data.length > 0 && (
        <Carte titre={`Alertes en cours (${alertes.data.pagination.total})`} actions={<Link className="bouton secondaire" href="/alertes">Tout voir</Link>} sansMarge>
          <div className="defile">
            <table>
              <thead><tr><th>Type</th><th>Pôle</th><th>Trimestre</th><th className="num">Score</th><th>Plan d’action</th></tr></thead>
              <tbody>
                {alertes.data.data.map((a) => (
                  <tr key={a.id}>
                    <td><TypeAlerte type={a.type} /></td>
                    <td><Link href={`/alertes/${a.id}`}><b>{a.poleCode}</b></Link></td>
                    <td>{trimestre(a)}</td>
                    <td className="num">{nombre(a.scoreConsolide, 1)}</td>
                    <td>{a.statut === 'ACTIVE' ? 'Pas encore pris en compte' : `${a.nbPlans - a.nbPlansOuverts}/${a.nbPlans} action(s) terminée(s)`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Carte>
      )}
      <Carte>
        <div className="grille-champs">
          <div className="champ">
            <label htmlFor="camp">Campagne clôturée</label>
            <select id="camp" value={campagneId} onChange={(e) => setCampagneId(e.target.value)}>
              {clotures.map((c) => <option key={c.id} value={c.id}>{trimestre(c)}</option>)}
            </select>
          </div>
          <div className="champ">
            <label htmlFor="fam">Famille d'activité</label>
            <select id="fam" value={familleId} onChange={(e) => setFamilleId(e.target.value)}>
              <option value="">Toutes les familles</option>
              {((familles.data && familles.data.data) || []).map((f) => <option key={f.id} value={f.id}>{f.libelle}</option>)}
            </select>
          </div>
        </div>
      </Carte>

      {chargement ? <Chargement /> : !clotures.length ? (
        <Vide titre="Aucune campagne clôturée">Les scores apparaissent ici dès que le contrôle de gestion clôture un trimestre.</Vide>
      ) : (
        <>
          <Carte titre="Classement" sansMarge>
            {!courants.length ? <Vide titre="Aucun pôle dans cette sélection">Changez de famille ou de campagne.</Vide> : (
              <div className="defile">
                <table>
                  <thead>
                    <tr>
                      <th className="num">Rang</th><th>Pôle</th><th>Famille</th><th className="num">Score</th>
                      {Object.values(AXES).map((l) => <th className="num" key={l}>{l}</th>)}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {courants.map((s, i) => (
                      <tr key={s.id}>
                        <td className="num"><b>{i + 1}</b></td>
                        <td><b>{s.poleCode}</b><br /><small>{s.poleIntitule}</small></td>
                        <td>{s.famille}</td>
                        <td className="num"><span className="score score-moyen">{nombre(s.scoreConsolide)}</span> {s.partiel ? <Etat statut="PARTIEL" libelle="Partiel" ton="attention" /> : null}</td>
                        {Object.keys(AXES).map((code) => <td className="num" key={code}>{profils.loading ? '…' : nombre(noteAxe(s.id, code))}</td>)}
                        <td><Link className="bouton secondaire" href={`/scores/${s.id}`}>Détail</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Carte>
          <Carte titre="Évolution trimestre par trimestre" sansMarge>
            {periodes.length ? <div style={{ padding: '14px 18px 0' }}><LineChart libelles={periodes.map((p) => p[1])} series={series} /></div> : <Vide titre="Pas encore d'historique" />}
          </Carte>
        </>
      )}
    </>
  );
}
