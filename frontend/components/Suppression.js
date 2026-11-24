'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Icone } from '@/components/Icones';

/**
 * Bouton « Supprimer » avec confirmation : on demande un motif (tracé au journal d'audit) avant d'envoyer.
 * chemin : ex. `/cibles/<id>` → POST `<chemin>/supprimer` { motif }.
 */
export default function Suppression({ chemin, onFait, onErreur, libelle = 'Supprimer', avertissement }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState('');
  const [occupe, setOccupe] = useState(false);

  async function confirmer(e) {
    e.preventDefault(); onErreur && onErreur(null); setOccupe(true);
    try { await api(`${chemin}/supprimer`, { method: 'POST', body: { motif } }); setOuvert(false); setMotif(''); onFait && onFait(); } catch (err) { onErreur && onErreur(err); } finally { setOccupe(false); }
  }
  if (!ouvert) return <button type="button" className="secondaire danger" onClick={() => setOuvert(true)}><Icone nom="corbeille" taille={16} />{libelle}</button>;
  return (
    <form onSubmit={confirmer} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {avertissement && <small style={{ flexBasis: '100%' }}>{avertissement}</small>}
      <input aria-label="Motif de la suppression" placeholder="Pourquoi ? (5 caractères minimum)" value={motif} onChange={(e) => setMotif(e.target.value)} required minLength={5} style={{ minWidth: 220 }} />
      <button type="submit" className="danger" disabled={occupe || motif.trim().length < 5}>Confirmer la suppression</button>
      <button type="button" className="secondaire" onClick={() => { setOuvert(false); setMotif(''); }}>Annuler</button>
    </form>
  );
}
