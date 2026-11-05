import { nombre, pourcent, tauxAtteinte } from '@/lib/format';

/**
 * « Règle de notation » : le taux d'atteinte de la cible sur une échelle graduée.
 * Zone claire = barème (plancher -> plafond : la note monte de 0 à 100) ; trait épais = cible ; repère = valeur du pôle.
 * Sans barème (écran de saisie), seule la cible sert de référence.
 */
export default function Regle({ sens, cible, valeur, plancher, plafond, unite }) {
  const taux = tauxAtteinte(sens, valeur, cible);
  const aBareme = plancher !== null && plancher !== undefined && plafond !== null && plafond !== undefined;
  const max = Math.max(1.25, aBareme ? plafond * 1.2 : 0, Number.isFinite(taux) ? Math.min(taux, 3) * 1.1 : 0);
  const pos = (t) => `${Math.max(0, Math.min(100, (t / max) * 100))}%`;
  const hors = taux === null || !Number.isFinite(taux) || taux > max;
  const libelle = taux === null
    ? 'Aucune valeur saisie'
    : `Taux d'atteinte ${Number.isFinite(taux) ? pourcent(taux) : 'très supérieur à la cible'}`;

  return (
    <div className={`regle ${hors && taux !== null ? 'hors' : ''}`} role="img" aria-label={libelle}>
      <div className="piste" />
      {aBareme && <div className="zone" style={{ left: pos(plancher), width: `calc(${pos(plafond)} - ${pos(plancher)})` }} />}
      {aBareme && <div className="repere" style={{ left: pos(plancher) }} />}
      <div className="repere cible" style={{ left: pos(1) }} />
      {aBareme && <span className="legende" style={{ left: pos(plancher) }}>{pourcent(plancher)}</span>}
      <span className="legende" style={{ left: pos(1) }}>cible {nombre(cible, 2)}{unite ? ` ${unite}` : ''}</span>
      {aBareme && plafond !== 1 && <span className="legende" style={{ left: pos(plafond) }}>{pourcent(plafond)}</span>}
      {taux !== null && (
        <div className="marqueur" style={{ left: pos(Number.isFinite(taux) ? Math.min(taux, max) : max) }}>
          <span>{nombre(valeur, 2)}</span>
        </div>
      )}
    </div>
  );
}
