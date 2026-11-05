import { nombre } from '@/lib/format';

const COULEURS = ['#0e6b73', '#c4561a', '#4b5fc4', '#7a8f1f', '#a33f78', '#5a6b75'];

/**
 * Évolution du score trimestre par trimestre.
 * series : [{ nom, points: [{ x: 'T1 2026', y: 72.5 | null }] }] — categories : étiquettes de l'axe horizontal, dans l'ordre.
 */
export default function GraphiqueEvolution({ categories, series, hauteur = 260 }) {
  const L = 640; const H = hauteur;
  const m = { g: 44, d: 16, h: 14, b: 34 };
  const w = L - m.g - m.d; const h = H - m.h - m.b;
  const x = (i) => m.g + (categories.length <= 1 ? w / 2 : (i / (categories.length - 1)) * w);
  const y = (v) => m.h + h - (v / 100) * h;

  return (
    <div>
      <svg className="graphique" viewBox={`0 0 ${L} ${H}`} role="img" aria-label="Évolution du score consolidé par trimestre">
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={m.g} x2={L - m.d} y1={y(t)} y2={y(t)} stroke="#dce1dc" strokeWidth="1" />
            <text x={m.g - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill="#5f6f7a">{t}</text>
          </g>
        ))}
        {categories.map((c, i) => (
          <text key={c} x={x(i)} y={H - 10} textAnchor="middle" fontSize="12" fill="#5f6f7a">{c}</text>
        ))}
        {series.map((s, si) => {
          const couleur = COULEURS[si % COULEURS.length];
          const pts = categories.map((c, i) => {
            const p = s.points.find((q) => q.x === c);
            return p && p.y !== null && p.y !== undefined ? { i, v: p.y } : null;
          });
          // segments continus uniquement : un trimestre sans score interrompt la ligne
          const segments = []; let cur = [];
          pts.forEach((p) => { if (p) cur.push(p); else if (cur.length) { segments.push(cur); cur = []; } });
          if (cur.length) segments.push(cur);
          return (
            <g key={s.nom}>
              {segments.map((seg, k) => (
                <polyline key={k} fill="none" stroke={couleur} strokeWidth="2.5" strokeLinejoin="round"
                  points={seg.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} />
              ))}
              {pts.filter(Boolean).map((p) => (
                <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="4.5" fill="#fff" stroke={couleur} strokeWidth="2.5">
                  <title>{`${s.nom} — ${categories[p.i]} : ${nombre(p.v, 2)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <div className="legende-graphique">
          {series.map((s, si) => <span key={s.nom}><i style={{ background: COULEURS[si % COULEURS.length] }} />{s.nom}</span>)}
        </div>
      )}
    </div>
  );
}
