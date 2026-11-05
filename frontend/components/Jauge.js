import { pourcent, nombre } from '@/lib/format';

/**
 * Jauge de barème : montre où se situe le taux d'atteinte du pôle entre le plancher (note 0)
 * et le plafond (note 100). C'est la normalisation du cahier des charges (§ 2.1.4) rendue visible :
 * un restaurant et un centre d'appels se lisent sur la même échelle.
 */
export default function Jauge({ taux, plancher, plafond, note }) {
  if (taux === null || taux === undefined) {
    return <div className="jauge"><small>Non renseigné : critère exclu du calcul</small></div>;
  }
  const max = Math.max(1.3, plafond * 1.2, taux * 1.05);
  const x = (v) => Math.max(0, Math.min(300, (v / max) * 300));
  const couleur = note >= 75 ? 'var(--ok)' : note >= 50 ? 'var(--alerte)' : 'var(--danger)';
  return (
    <div className="jauge">
      <svg viewBox="0 0 300 40" role="img"
        aria-label={`Taux d'atteinte ${pourcent(taux)} ; note ${nombre(note)} sur 100 ; plancher ${pourcent(plancher)}, plafond ${pourcent(plafond)}`}>
        <rect className="jauge-fond" x="0" y="17" width="300" height="8" rx="4" />
        <rect className="jauge-zone" x={x(plancher)} y="17" width={Math.max(2, x(plafond) - x(plancher))} height="8" />
        <line className="jauge-cible" x1={x(1)} x2={x(1)} y1="9" y2="33" strokeWidth="2" />
        <line className="jauge-plancher" x1={x(plancher)} x2={x(plancher)} y1="13" y2="29" strokeWidth="1.5" />
        <circle className="jauge-pastille" cx={x(taux)} cy="21" r="7" fill={couleur} strokeWidth="2" />
      </svg>
      <div className="jauge-legende">
        <span>plancher {pourcent(plancher, 0)}</span>
        <span>cible 100 %</span>
        <span>plafond {pourcent(plafond, 0)}</span>
      </div>
    </div>
  );
}
