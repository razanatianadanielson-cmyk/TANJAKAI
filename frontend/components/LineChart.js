const COULEURS = ['#1b8cf0', '#e08a00', '#16a870', '#e5484d', '#8b5cf6', '#0d9488', '#db2777', '#64748b'];

/** Évolution du score (0 à 100) par trimestre, une courbe par pôle, étiquetée en bout de courbe. */
export default function LineChart({ libelles, series, seuil }) {
  const L = 44; const R = 70; const T = 14; const B = 30; const W = 700; const H = 280;
  const n = libelles.length;
  const x = (i) => L + (n <= 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
  const y = (v) => T + (1 - v / 100) * (H - T - B);
  return (
    <>
      <svg className="graphique" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Évolution du score consolidé par trimestre">
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line className="grille-trait" x1={L} x2={W - R} y1={y(g)} y2={y(g)} strokeWidth="1" />
            <text x={L - 8} y={y(g) + 4} textAnchor="end">{g}</text>
          </g>
        ))}
        {seuil !== undefined && seuil !== null && (
          <g>
            <line className="seuil-trait" x1={L} x2={W - R} y1={y(seuil)} y2={y(seuil)} strokeDasharray="5 4" strokeWidth="1.5" />
            <text className="seuil-texte" x={W - R + 4} y={y(seuil) + 4}>seuil {seuil}</text>
          </g>
        )}
        {libelles.map((l, i) => (
          <text key={l} x={x(i)} y={H - 8} textAnchor="middle">{l}</text>
        ))}
        {series.map((s, k) => {
          const couleur = COULEURS[k % COULEURS.length];
          const pts = s.valeurs.map((v, i) => (v === null || v === undefined ? null : [x(i), y(v)]));
          const trace = pts.filter(Boolean);
          const d = trace.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
          const dernier = trace[trace.length - 1];
          return (
            <g key={s.nom}>
              {trace.length > 1 && <path d={d} fill="none" stroke={couleur} strokeWidth="2.5" strokeLinejoin="round" />}
              {trace.map((p) => <circle key={`${p[0]}-${p[1]}`} cx={p[0]} cy={p[1]} r="4" fill={couleur} className="point" strokeWidth="1.5" />)}
              {dernier && <text x={dernier[0] + 8} y={dernier[1] + 4} style={{ fill: couleur, fontWeight: 600 }}>{s.nom}</text>}
            </g>
          );
        })}
      </svg>
      <div className="legende-serie">
        {series.map((s, k) => <span key={s.nom} style={{ '--c': COULEURS[k % COULEURS.length] }}>{s.nom}</span>)}
      </div>
    </>
  );
}
