'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { trimestre, nombre, dateHeure } from '@/lib/format';
import { PageHeader, Carte, Erreur, Chargement, Vide, Etat } from '@/components/ui';

export default function Scores() {
  const [campagneId, setCampagneId] = useState('');
  const campagnes = useAsync(() => api('/campagnes', { query: { limit: 50 } }), []);
  const scores = useAsync(() => api('/scores', { query: { limit: 100, campagneId } }), [campagneId]);
  const liste = (scores.data && scores.data.data) || [];

  return (
    <>
      <PageHeader titre="Scores" sousTitre="Chaque score est explicable : ouvrez-le pour voir sa construction critère par critère. Un score marqué « partiel » repose sur une campagne incomplète." />
      <Carte>
        <div className="grille-champs">
          <div className="champ">
            <label htmlFor="camp">Campagne</label>
            <select id="camp" value={campagneId} onChange={(e) => setCampagneId(e.target.value)}>
              <option value="">Toutes les campagnes</option>
              {((campagnes.data && campagnes.data.data) || []).map((c) => <option key={c.id} value={c.id}>{trimestre(c)}</option>)}
            </select>
          </div>
        </div>
      </Carte>
      <Erreur erreur={scores.error || campagnes.error} />
      <Carte sansMarge>
        {scores.loading ? <Chargement /> : !liste.length ? (
          <Vide titre="Aucun score pour le moment">Les scores sont calculés et figés à la clôture d'une campagne.</Vide>
        ) : (
          <div className="defile">
            <table>
              <thead><tr><th>Trimestre</th><th>Pôle</th><th>Famille</th><th className="num">Score</th><th>Version</th><th>Calculé le</th><th /></tr></thead>
              <tbody>
                {liste.map((s) => (
                  <tr key={s.id}>
                    <td>{trimestre(s)}</td>
                    <td><b>{s.poleCode}</b><br /><small>{s.poleIntitule}</small></td>
                    <td>{s.famille}</td>
                    <td className="num"><span className="score score-moyen">{nombre(s.scoreConsolide)}</span> {s.partiel ? <Etat statut="PARTIEL" libelle="Partiel" ton="attention" /> : null}</td>
                    <td>v{s.version} {s.fige ? <small>(figé)</small> : null}</td>
                    <td>{dateHeure(s.dateCalcul)}</td>
                    <td><Link className="bouton secondaire" href={`/scores/${s.id}`}>Voir le détail</Link></td>
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
