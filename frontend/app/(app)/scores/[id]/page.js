'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { trimestre, nombre, pourcent, dateHeure } from '@/lib/format';
import { PageHeader, Carte, Erreur, Chargement, Etat, Message } from '@/components/ui';
import Jauge from '@/components/Jauge';

const STATUT_CRITERE = { NOTE: null, EXCLU: 'Exclu du calcul', NON_RENSEIGNE: 'Non renseigné', NON_VALIDE: 'Saisie non validée' };

export default function DetailScore() {
  const { id } = useParams();
  const { data: s, error, loading } = useAsync(() => api(`/scores/${id}`), [id]);

  if (loading) return <Chargement />;
  if (error) return <><Erreur erreur={error} /><Link href="/scores">Retour aux scores</Link></>;

  return (
    <>
      <PageHeader titre={`${s.poleCode} — ${trimestre(s)}`}
        sousTitre={`${s.poleIntitule}. Version ${s.version} du score, calculée le ${dateHeure(s.dateCalcul)}${s.fige ? ' et figée' : ''}.`}
        actions={<Link className="bouton secondaire" href="/scores">Tous les scores</Link>} />

      {s.partiel && <Message type="attention">Score partiel : certains critères ne sont pas pris en compte. Leur pondération est redistribuée dans leur axe, sans jamais estimer de valeur.</Message>}
      {s.verification && (s.verification.coherent
        ? <Message type="ok">Vérification : le recalcul à partir des données conservées restitue exactement ce score.</Message>
        : <Message type="erreur">Vérification : le recalcul diffère du score conservé ({s.verification.ecarts.length} écart(s)). Signalez-le au contrôle de gestion.</Message>)}

      <Carte>
        <div className="en-tete-score" style={{ padding: 0 }}>
          <div className="score score-grand">{nombre(s.scoreConsolide)}<small>/ 100</small></div>
          <div className="axes-resume">
            {s.axes.map((a) => (
              <div key={a.axeId}>
                <small>{a.libelle}</small>
                <div className="score">{nombre(a.note)}</div>
                <small>poids {nombre(a.poidsEffectif)} %{a.poidsEffectif !== a.poidsNominal ? ` (prévu ${nombre(a.poidsNominal)} %)` : ''}</small>
              </div>
            ))}
          </div>
        </div>
      </Carte>

      {s.axes.map((a) => (
        <Carte key={a.axeId} titre={a.libelle} sansMarge
          actions={<><small>Note de l'axe</small><span className="score score-moyen">{nombre(a.note)}</span></>}>
          <div className="defile">
            <table>
              <thead>
                <tr><th>Critère</th><th className="num">Cible</th><th className="num">Réalisé</th><th className="num">Écart</th><th>Taux d'atteinte et barème</th><th className="num">Note</th><th className="num">Poids</th></tr>
              </thead>
              <tbody>
                {a.criteres.map((c) => (
                  <tr key={c.critereId}>
                    <td><b>{c.intitule}</b><br /><small>à {c.sens === 'MINIMISER' ? 'minimiser' : 'maximiser'}</small>
                      {STATUT_CRITERE[c.statut] ? <div><Etat statut="X" libelle={STATUT_CRITERE[c.statut]} ton="attention" /></div> : null}</td>
                    <td className="num">{nombre(c.valeurCible, 4)} {c.unite}</td>
                    <td className="num">{c.valeurSaisie === null ? '—' : `${nombre(c.valeurSaisie, 4)} ${c.unite}`}</td>
                    <td className="num">{c.ecartCible === null ? '—' : `${c.ecartCible > 0 ? '+' : ''}${nombre(c.ecartCible, 4)}`}</td>
                    <td>
                      <Jauge taux={c.tauxAtteinte} plancher={c.plancher} plafond={c.plafond} note={c.note} />
                      {c.tauxAtteinte !== null && <small>taux d'atteinte {pourcent(c.tauxAtteinte)}</small>}
                    </td>
                    <td className="num"><b>{nombre(c.note)}</b></td>
                    <td className="num">{nombre(c.poidsEffectif)} %{c.poidsEffectif !== c.poidsNominal ? <><br /><small>prévu {nombre(c.poidsNominal)} %</small></> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Carte>
      ))}
      <small>Le calcul est déterministe : les mêmes valeurs et la même grille produisent toujours le même score. Plancher et plafond sont des taux d'atteinte de la cible propre au pôle ; sous le plancher la note est 0, au plafond elle est 100.</small>
    </>
  );
}
