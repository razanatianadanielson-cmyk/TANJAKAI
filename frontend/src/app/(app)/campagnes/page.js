'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { date, periode } from '@/lib/format';
import { Bouton, Champ, Chargement, ErreurApi, ModaleFormulaire, PageHeader, PastilleStatutCampagne, Vide, useToast } from '@/components/ui';

function OuvrirCampagne({ onClose }) {
  const router = useRouter();
  const toast = useToast();
  const grilles = useApi('/grilles', { limit: 100 });
  const validees = (grilles.data?.data || []).filter((g) => g.statut === 'VALIDEE');
  const maintenant = new Date();
  const [f, setF] = useState({
    exercice: maintenant.getFullYear(), trimestre: Math.floor(maintenant.getMonth() / 3) + 1, grilleId: '', dateLimite: '',
  });
  const grilleId = f.grilleId || validees[0]?.id || '';
  const maj = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const envoyer = async () => {
    const c = await api.post('/campagnes', {
      exercice: Number(f.exercice), trimestre: Number(f.trimestre), grilleId, dateLimite: f.dateLimite,
    });
    const manquantes = c.avertissements?.length || 0;
    toast(manquantes ? `Campagne ${periode(c)} ouverte. ${manquantes} critère(s) sans cible sont exclus de la notation.` : `Campagne ${periode(c)} ouverte : les responsables sont notifiés.`);
    router.push(`/campagnes/${c.id}`);
  };

  return (
    <ModaleFormulaire titre="Ouvrir une campagne" libelle="Ouvrir la campagne" onClose={onClose} onSubmit={envoyer}>
      <p className="muted petit" style={{ marginBottom: '1rem' }}>
        À l&apos;ouverture, la grille, la liste des pôles et leurs cibles sont figées pour ce trimestre. Les cibles retenues doivent être validées par la direction.
      </p>
      <div className="grille-form">
        <Champ label="Exercice">{(id) => <input id={id} type="number" min="2000" max="2100" required value={f.exercice} onChange={maj('exercice')} />}</Champ>
        <Champ label="Trimestre">
          {(id) => <select id={id} value={f.trimestre} onChange={maj('trimestre')}>{[1, 2, 3, 4].map((t) => <option key={t} value={t}>T{t}</option>)}</select>}
        </Champ>
      </div>
      <Champ label="Version de la grille" aide={validees.length ? 'Seules les grilles validées peuvent être utilisées.' : 'Aucune grille validée : validez une grille avant d\'ouvrir une campagne.'}>
        {(id) => (
          <select id={id} value={grilleId} onChange={maj('grilleId')} required>
            {validees.map((g) => <option key={g.id} value={g.id}>Version {g.version} (validée le {date(g.dateValidation)})</option>)}
          </select>
        )}
      </Champ>
      <Champ label="Date limite de saisie et de validation">{(id) => <input id={id} type="date" required value={f.dateLimite} onChange={maj('dateLimite')} />}</Champ>
    </ModaleFormulaire>
  );
}

export default function Campagnes() {
  const { user } = useAuth();
  const { data, error, loading } = useApi('/campagnes', { limit: 100 });
  const [ouvrir, setOuvrir] = useState(false);
  const estResp = user.role === 'RESPONSABLE_POLE';

  return (
    <>
      <PageHeader
        titre={estResp ? 'Ma saisie' : 'Campagnes'}
        contexte={estResp ? 'Choisissez la campagne ouverte pour saisir les indicateurs de votre pôle.' : 'Une campagne par trimestre : saisie, contrôle, clôture et calcul des scores.'}
        actions={user.role === 'CONTROLE_GESTION' && <Bouton onClick={() => setOuvrir(true)}>Ouvrir une campagne</Bouton>}
      />
      <ErreurApi erreur={error} />
      {loading && <Chargement />}
      {data && (data.data.length === 0 ? (
        <div className="panneau"><Vide titre="Aucune campagne pour le moment">{user.role === 'CONTROLE_GESTION' ? 'Ouvrez la première campagne pour lancer la saisie.' : 'Le contrôle de gestion ouvrira la première campagne.'}</Vide></div>
      ) : (
        <div className="tableau-wrap">
          <table>
            <thead><tr><th>Période</th><th>Statut</th><th>Ouverte le</th><th>Échéance</th><th>Clôturée le</th><th /></tr></thead>
            <tbody>
              {data.data.map((c) => (
                <tr key={c.id}>
                  <td><strong>{periode(c)}</strong></td>
                  <td><PastilleStatutCampagne statut={c.statut} /></td>
                  <td>{date(c.dateOuverture)}</td><td>{date(c.dateLimite)}</td><td>{c.dateCloture ? date(c.dateCloture) : '—'}</td>
                  <td><Link href={`/campagnes/${c.id}`}>{estResp && c.statut !== 'CLOTUREE' ? 'Saisir' : 'Ouvrir'}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {ouvrir && <OuvrirCampagne onClose={() => setOuvrir(false)} />}
    </>
  );
}
