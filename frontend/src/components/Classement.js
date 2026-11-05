import Link from 'next/link';
import { nombre } from '@/lib/format';
import { EchelleScore, Pastille, Vide } from '@/components/ui';

/** Ajoute le rang global et le rang au sein de la famille d'activité (égalités : même rang). */
export function classer(scores) {
  const tries = [...scores].sort((a, b) => (b.scoreConsolide ?? -1) - (a.scoreConsolide ?? -1));
  const rang = (liste, s) => 1 + liste.filter((x) => (x.scoreConsolide ?? -1) > (s.scoreConsolide ?? -1)).length;
  return tries.map((s) => ({
    ...s,
    rangGlobal: rang(tries, s),
    rangFamille: rang(tries.filter((x) => x.familleId === s.familleId), s),
  }));
}

export default function Classement({ scores, masquerFamille = false }) {
  if (!scores.length) {
    return <div className="panneau"><Vide titre="Aucun score pour cette période">Les scores sont calculés à la clôture de la campagne.</Vide></div>;
  }
  const lignes = classer(scores);
  return (
    <div className="tableau-wrap">
      <table>
        <thead>
          <tr>
            <th className="nb">Rang</th><th>Pôle</th>
            {!masquerFamille && <th>Famille d&apos;activité</th>}
            {!masquerFamille && <th className="nb">Rang famille</th>}
            <th>Score consolidé</th><th />
          </tr>
        </thead>
        <tbody>
          {lignes.map((s) => (
            <tr key={s.id}>
              <td className="nb"><span className="rang">{s.rangGlobal}</span></td>
              <td><strong>{s.poleCode}</strong><div className="petit muted">{s.poleIntitule}</div></td>
              {!masquerFamille && <td>{s.famille}</td>}
              {!masquerFamille && <td className="nb">{s.rangFamille}</td>}
              <td style={{ minWidth: '12rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <strong className="num" style={{ minWidth: '3.2rem' }}>{nombre(s.scoreConsolide, 2)}</strong>
                  <div style={{ flex: 1 }}><EchelleScore score={s.scoreConsolide} /></div>
                </div>
                {(s.partiel || s.version > 1) && (
                  <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.35rem' }}>
                    {s.partiel && <Pastille ton="alerte">Partiel</Pastille>}
                    {s.version > 1 && <Pastille>Version {s.version}</Pastille>}
                  </div>
                )}
              </td>
              <td><Link href={`/scores/${s.id}`}>Voir le détail</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
