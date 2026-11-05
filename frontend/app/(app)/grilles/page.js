'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, ROLES } from '@/lib/auth';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { date } from '@/lib/format';
import { PageHeader, Carte, Erreur, Message, Chargement, Vide, Etat, Champ } from '@/components/ui';

export default function Grilles() {
  const { user } = useAuth();
  const router = useRouter();
  const gestion = user.role === ROLES.CONTROLE_GESTION || user.role === ROLES.ADMINISTRATEUR;
  const grilles = useAsync(() => api('/grilles', { query: { limit: 50 } }), []);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState(null);

  const liste = (grilles.data && grilles.data.data) || [];
  const premiere = !grilles.loading && liste.length === 0;

  async function creer(e) {
    e.preventDefault(); setErreur(null);
    try {
      const g = await api('/grilles', { method: 'POST', body: motif.trim() ? { motif: motif.trim() } : {} });
      router.push(`/grilles/${g.id}`);
    } catch (err) { setErreur(err); }
  }

  return (
    <>
      <PageHeader titre="Grilles de notation"
        sousTitre="Une grille porte les axes, critères, pondérations et barèmes. Elle est datée, validée puis figée : toute modification crée une nouvelle version, et chaque trimestre est noté avec la version en vigueur à l'ouverture de sa campagne." />
      <Erreur erreur={erreur || grilles.error} />

      {gestion && (
        <Carte titre={premiere ? 'Créer la première grille' : 'Créer une nouvelle version'}>
          <form onSubmit={creer}>
            {!premiere && <Message type="info">La nouvelle version repart d'une copie de la dernière version validée. L'ancienne n'est jamais modifiée.</Message>}
            <Champ label={premiere ? 'Motif (facultatif pour la première version)' : 'Motif du changement'} id="mot" aide={premiere ? undefined : 'Obligatoire : il est conservé dans l’historique des versions.'}>
              <input id="mot" value={motif} onChange={(e) => setMotif(e.target.value)} required={!premiere} />
            </Champ>
            <button type="submit">{premiere ? 'Créer la grille' : 'Créer la version suivante'}</button>
          </form>
        </Carte>
      )}

      <Carte titre="Historique des versions" sansMarge>
        {grilles.loading ? <Chargement /> : !liste.length ? <Vide titre="Aucune grille">{gestion ? 'Créez la première grille ci-dessus.' : "Aucune grille n'a encore été définie."}</Vide> : (
          <div className="defile">
            <table>
              <thead><tr><th>Version</th><th>État</th><th>Validée le</th><th>Motif du changement</th><th /></tr></thead>
              <tbody>
                {liste.map((g) => (
                  <tr key={g.id}>
                    <td><b>v{g.version}</b></td>
                    <td><Etat statut={g.statut === 'VALIDEE' ? 'VALIDEE' : 'BROUILLON'} /></td>
                    <td>{date(g.dateValidation)}</td>
                    <td>{g.motifChangement || '—'}</td>
                    <td><Link className="bouton secondaire" href={`/grilles/${g.id}`}>{g.statut === 'VALIDEE' ? 'Consulter' : gestion ? 'Modifier' : 'Consulter'}</Link></td>
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
