'use client';
import { useMemo } from 'react';
import { useApi } from '@/lib/hooks';
import { periode, rangPeriode } from '@/lib/format';
import { Chargement, ErreurApi } from '@/components/ui';
import GraphiqueEvolution from '@/components/GraphiqueEvolution';

/** Évolution des scores de tous les pôles visibles (un responsable ne reçoit que son pôle : cloisonnement serveur). */
export default function EvolutionScores({ max = 6 }) {
  const { data, error, loading } = useApi('/scores', { limit: 100 });
  const { categories, series } = useMemo(() => {
    const lignes = data?.data || [];
    const parPeriode = new Map(lignes.map((s) => [rangPeriode(s), periode(s)]));
    const categories = [...parPeriode.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    const parPole = new Map();
    lignes.forEach((s) => {
      if (!parPole.has(s.poleCode)) parPole.set(s.poleCode, []);
      parPole.get(s.poleCode).push({ x: periode(s), y: s.scoreConsolide });
    });
    return { categories, series: [...parPole.entries()].slice(0, max).map(([nom, points]) => ({ nom, points })) };
  }, [data, max]);

  if (loading) return <Chargement />;
  if (error) return <ErreurApi erreur={error} />;
  if (!categories.length) return <p className="muted">Aucun score historisé pour le moment : la courbe apparaîtra à la première clôture de campagne.</p>;
  return <GraphiqueEvolution categories={categories} series={series} />;
}
