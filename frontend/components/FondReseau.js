'use client';
import { useEffect, useRef } from 'react';

/**
 * Fond animé : un réseau de points reliés qui dérivent lentement (esprit « constellation » du site TANJAKAI).
 * Décoratif seulement : ignoré par la souris et les lecteurs d'écran, figé si l'utilisateur a demandé moins d'animations,
 * et mis en pause quand l'onglet n'est pas visible.
 */
export default function FondReseau() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    const reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let largeur = 0; let hauteur = 0; let points = []; let rafId = 0; let couleur = '58, 168, 255'; let clair = false;

    const lireCouleur = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--reseau').trim();
      if (v) couleur = v;
      clair = document.documentElement.dataset.theme === 'light';
    };

    const init = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      largeur = window.innerWidth; hauteur = window.innerHeight;
      canvas.width = largeur * dpr; canvas.height = hauteur * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(24, Math.min(70, Math.round((largeur * hauteur) / 24000)));
      points = Array.from({ length: n }, () => ({
        x: Math.random() * largeur, y: Math.random() * hauteur,
        vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28, r: 1 + Math.random() * 1.4,
      }));
    };

    const dessiner = (avance) => {
      ctx.clearRect(0, 0, largeur, hauteur);
      const portee = 150;
      const alphaTrait = clair ? 0.16 : 0.2;
      const alphaPoint = clair ? 0.35 : 0.5;
      for (const p of points) {
        if (avance) {
          p.x += p.vx; p.y += p.vy;
          if (p.x < -10) p.x = largeur + 10; else if (p.x > largeur + 10) p.x = -10;
          if (p.y < -10) p.y = hauteur + 10; else if (p.y > hauteur + 10) p.y = -10;
        }
      }
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        for (let j = i + 1; j < points.length; j += 1) {
          const b = points[j];
          const dx = a.x - b.x; const dy = a.y - b.y; const d2 = dx * dx + dy * dy;
          if (d2 < portee * portee) {
            ctx.strokeStyle = `rgba(${couleur}, ${alphaTrait * (1 - Math.sqrt(d2) / portee)})`;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      ctx.fillStyle = `rgba(${couleur}, ${alphaPoint})`;
      for (const p of points) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    };

    const boucle = () => { dessiner(true); rafId = requestAnimationFrame(boucle); };
    const demarrer = () => { if (!reduit && !rafId && !document.hidden) rafId = requestAnimationFrame(boucle); };
    const arreter = () => { if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } };
    const visibilite = () => (document.hidden ? arreter() : demarrer());
    const redim = () => { init(); lireCouleur(); if (reduit) dessiner(false); };

    lireCouleur(); init();
    if (reduit) dessiner(false); else demarrer();
    window.addEventListener('resize', redim);
    document.addEventListener('visibilitychange', visibilite);
    const obs = new MutationObserver(() => { lireCouleur(); if (reduit) dessiner(false); });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { arreter(); window.removeEventListener('resize', redim); document.removeEventListener('visibilitychange', visibilite); obs.disconnect(); };
  }, []);

  return <canvas ref={ref} className="fond-reseau" aria-hidden="true" />;
}
