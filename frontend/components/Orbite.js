const POLES = ['Agriculture', 'Réservation', 'Logistique', 'Tourisme', 'Emploi', 'Restauration', 'Externalisation', 'Informatique'];
const C = 260; const R = 190;

/** Orbite animée de la page de connexion : le groupe au centre, ses pôles autour. Décorative (aria-hidden). */
export default function Orbite() {
  const noeuds = POLES.map((nom, i) => {
    const a = (-90 + i * 45) * (Math.PI / 180);
    const x = C + R * Math.cos(a); const y = C + R * Math.sin(a);
    const cos = Math.cos(a); const sin = Math.sin(a);
    let ancre = 'middle'; let dx = 0; let dy = 0;
    if (cos > 0.3) { ancre = 'start'; dx = 16; dy = 5; } else if (cos < -0.3) { ancre = 'end'; dx = -16; dy = 5; } else { dy = sin < 0 ? -18 : 28; }
    return { nom, x, y, ancre, dx, dy, n: String(i + 1).padStart(2, '0') };
  });
  return (
    <svg className="orbite" viewBox="-130 -20 780 560" aria-hidden="true" focusable="false">
      <circle className="anneau" cx={C} cy={C} r={R} />
      <circle className="anneau pointille" cx={C} cy={C} r={R - 55} />
      <circle className="anneau" cx={C} cy={C} r={R - 110} />
      <g className="tourne"><circle className="satellite" cx={C} cy={C - R + 55} r="3.5" /></g>
      <g className="tourne inverse"><circle className="satellite" cx={C + R} cy={C} r="3" /></g>
      {noeuds.map((p, i) => (
        <g key={p.nom}>
          <circle className="noeud-pulse" cx={p.x} cy={p.y} r="9" style={{ animationDelay: `${i * 0.4}s` }} />
          <circle className="noeud" cx={p.x} cy={p.y} r="9" />
          <text className="etq" x={p.x + p.dx + (p.ancre === 'start' ? 22 : p.ancre === 'end' ? -22 : 0)} y={p.y + p.dy} textAnchor={p.ancre}>{p.nom}</text>
        </g>
      ))}
      <circle className="coeur" cx={C} cy={C} r="68" />
      <text className="coeur-titre" x={C} y={C + 2}>TANJAKAI</text>
      <text className="coeur-sous" x={C} y={C + 24}>08 PÔLES</text>
    </svg>
  );
}
