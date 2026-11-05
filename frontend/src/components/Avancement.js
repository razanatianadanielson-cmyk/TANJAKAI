import Link from 'next/link';
import { BarreAvancement, Vide } from '@/components/ui';

export default function Avancement({ campagneId, poles, role }) {
  if (!poles.length) return <div className="panneau"><Vide titre="Aucun pôle à afficher" /></div>;
  return (
    <div className="tableau-wrap">
      <table>
        <thead>
          <tr>
            <th>Pôle</th><th style={{ minWidth: '10rem' }}>Indicateurs saisis</th>
            <th className="nb">Brouillons</th><th className="nb">À corriger</th><th className="nb">Soumises</th><th className="nb">Validées</th><th />
          </tr>
        </thead>
        <tbody>
          {poles.map((p) => (
            <tr key={p.poleId}>
              <td><strong>{p.poleCode}</strong><div className="petit muted">{p.famille}</div></td>
              <td>
                <BarreAvancement valeur={p.saisies} total={p.total} label={`${p.saisies} indicateurs sur ${p.total}`} />
                <span className="petit muted num">{p.saisies} / {p.total}</span>
              </td>
              <td className="nb">{p.brouillons}</td>
              <td className="nb">{p.renvoyees}</td>
              <td className="nb">{p.soumises}</td>
              <td className="nb">{p.validees}</td>
              <td><Link href={`/campagnes/${campagneId}/poles/${p.poleId}`}>{role === 'RESPONSABLE_POLE' ? 'Ouvrir la feuille' : role === 'CONTROLE_GESTION' ? 'Contrôler' : 'Consulter'}</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
