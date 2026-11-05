'use client';
import { useEffect, useState } from 'react';
import { Icone } from '@/components/Icones';

const CLE = 'tanjakai-theme';

/** Bouton clair / sombre. Le choix est mémorisé dans le navigateur ; le thème sombre est le thème par défaut. */
export default function ThemeBascule({ className = '' }) {
  const [theme, setTheme] = useState('dark');

  useEffect(() => { setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'); }, []);

  function basculer() {
    const suivant = theme === 'light' ? 'dark' : 'light';
    setTheme(suivant);
    document.documentElement.dataset.theme = suivant;
    try { window.localStorage.setItem(CLE, suivant); } catch (e) { /* stockage indisponible : le choix vaut pour cette page */ }
  }

  const versClair = theme !== 'light';
  return (
    <button type="button" className={`secondaire bascule-theme ${className}`} onClick={basculer}
      aria-label={versClair ? 'Passer au thème clair' : 'Passer au thème sombre'} title={versClair ? 'Thème clair' : 'Thème sombre'}>
      <Icone nom={versClair ? 'soleil' : 'lune'} taille={18} />
    </button>
  );
}
