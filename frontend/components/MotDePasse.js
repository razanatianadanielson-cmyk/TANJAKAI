'use client';
import { useState } from 'react';
import { Icone } from '@/components/Icones';

/** Champ de mot de passe avec un œil pour afficher ou masquer la saisie. Accepte les mêmes propriétés qu'un <input>. */
export default function MotDePasse({ className = '', ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="champ-mdp">
      <input {...props} type={visible ? 'text' : 'password'} className={className} />
      <button type="button" className="oeil" onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={visible}
        title={visible ? 'Masquer' : 'Afficher'}>
        <Icone nom={visible ? 'oeil-barre' : 'oeil'} taille={18} />
      </button>
    </div>
  );
}
