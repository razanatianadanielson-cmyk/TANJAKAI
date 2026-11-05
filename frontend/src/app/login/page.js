'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Champ } from '@/components/ui';

export default function Connexion() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState(null);
  const [info, setInfo] = useState(null);
  const [attente, setAttente] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('expire')) setInfo('Votre session a expiré. Reconnectez-vous pour continuer.');
  }, []);
  useEffect(() => { if (!loading && user) router.replace('/'); }, [loading, user, router]);

  const envoyer = async (e) => {
    e.preventDefault();
    setErreur(null); setInfo(null); setAttente(true);
    try {
      const r = await login(email.trim(), motDePasse);
      if (r.secondFactor) setInfo('Ce compte exige un second facteur d\'authentification. Il n\'est pas encore disponible sur le serveur : contactez l\'administrateur.');
      else router.replace('/');
    } catch (err) {
      setErreur(err.status === 401 ? 'Adresse e-mail ou mot de passe incorrect.' : err.message);
    } finally { setAttente(false); }
  };

  return (
    <div className="connexion">
      <section className="gauche">
        <strong style={{ fontFamily: 'var(--police-titre)', fontSize: '1.4rem' }}>Tanjakai</strong>
        <div>
          <h1>Une même grille pour tous les pôles.</h1>
          <p>Saisissez vos indicateurs du trimestre, suivez votre score et comparez-vous à vos propres objectifs.</p>
        </div>
        <span className="petit" style={{ color: '#8aa1aa' }}>Direction Générale et Contrôle de Gestion</span>
      </section>
      <section className="droite">
        <form onSubmit={envoyer} noValidate>
          <h2>Se connecter</h2>
          {info && <div className="message" role="status">{info}</div>}
          {erreur && <div className="message erreur" role="alert">{erreur}</div>}
          <Champ label="Adresse e-mail">
            {(id) => <input id={id} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(erreur)} />}
          </Champ>
          <Champ label="Mot de passe">
            {(id) => <input id={id} type="password" autoComplete="current-password" required value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} aria-invalid={Boolean(erreur)} />}
          </Champ>
          <button type="submit" className="btn" style={{ width: '100%' }} disabled={attente || !email || !motDePasse}>{attente ? 'Connexion…' : 'Se connecter'}</button>
        </form>
      </section>
    </div>
  );
}
