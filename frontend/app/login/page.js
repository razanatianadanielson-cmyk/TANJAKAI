'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api, messageErreur } from '@/lib/api';
import { useQueryParams } from '@/lib/hooks';
import { Message, Champ } from '@/components/ui';
import { Icone } from '@/components/Icones';
import MotDePasse from '@/components/MotDePasse';
import ThemeBascule from '@/components/ThemeBascule';

const RAISONS = {
  inactivite: 'Vous avez été déconnecté après une période d’inactivité. Reconnectez-vous pour continuer.',
  session: 'Votre session est terminée. Reconnectez-vous pour continuer.',
};

/** Codes de secours : affichés une seule fois, à conserver hors de l'application. */
function CodesSecours({ codes, onTermine }) {
  const [vu, setVu] = useState(false);
  return (
    <div>
      <h2>Codes de secours</h2>
      <Message type="attention">Ces 8 codes ne seront plus jamais affichés. Chacun ne sert qu’une fois, si vous perdez votre téléphone. Conservez-les hors de cet ordinateur.</Message>
      <ul className="codes-secours" aria-label="Codes de secours">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
      <div className="ligne-case">
        <input id="vu" type="checkbox" checked={vu} onChange={(e) => setVu(e.target.checked)} />
        <label htmlFor="vu">J’ai conservé ces codes en lieu sûr</label>
      </div>
      <button type="button" disabled={!vu} onClick={onTermine}>Accéder à l’application</button>
    </div>
  );
}

export default function Connexion() {
  const { user, ready, login, verifier2fa, ouvrirSession } = useAuth();
  const router = useRouter();
  const params = useQueryParams();
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [etape, setEtape] = useState('identifiants'); // identifiants | code | enrolement | secours
  const [defi, setDefi] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState(null);
  const [secours, setSecours] = useState(null);
  const [sessionEnAttente, setSessionEnAttente] = useState(null);

  // Pendant l'affichage des codes de secours, la session n'est pas encore ouverte : pas de redirection
  useEffect(() => { if (ready && user && etape !== 'secours') router.replace('/'); }, [ready, user, router, etape]);

  async function executer(fn) {
    setErreur(''); setEnvoi(true);
    try { await fn(); } catch (err) { setErreur(messageErreur(err)); } finally { setEnvoi(false); }
  }

  const soumettre = (e) => { e.preventDefault(); return executer(async () => {
    const r = await login(email.trim(), motDePasse);
    if (!r.secondFactor) return;
    setDefi(r.challengeToken); setCode('');
    if (r.enrollment) {
      setSecret(await api('/auth/2fa/enrolement/demarrer', { method: 'POST', body: { challengeToken: r.challengeToken }, sansRenouvellement: true }));
      setEtape('enrolement');
    } else setEtape('code');
  }); };

  const verifier = (e) => { e.preventDefault(); return executer(() => verifier2fa(defi, code.trim())); };

  const confirmer = (e) => { e.preventDefault(); return executer(async () => {
    const r = await api('/auth/2fa/enrolement/confirmer', { method: 'POST', body: { challengeToken: defi, code: code.trim() }, sansRenouvellement: true });
    setSessionEnAttente(r); setSecours(r.codesSecours); setEtape('secours');
  }); };

  function recommencer() { setEtape('identifiants'); setDefi(''); setCode(''); setSecret(null); setErreur(''); setMotDePasse(''); }

  return (
    <div className="connexion">
      <ThemeBascule className="bascule-connexion" />
      <div className="gauche">
        <div>
          <span className="etiquette">Notation des pôles · TANJAKAI</span>
          <h1>Chaque pôle, noté sur <em className="accent">ses propres engagements.</em></h1>
          <p>Un restaurant, une exploitation agricole et un centre d'appels se comparent sur la même grille : le score mesure la tenue des objectifs de chacun, pas la taille de son activité.</p>
        </div>
      </div>
      <div className="droite">
        {etape === 'identifiants' && (
          <form onSubmit={soumettre} noValidate>
            <h2>Connexion</h2>
            <Message type="info">{params.raison ? RAISONS[params.raison] : ''}</Message>
            <Message type="erreur">{erreur}</Message>
            <Champ label="Adresse e-mail" id="email">
              <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Champ>
            <Champ label="Mot de passe" id="mdp">
              <MotDePasse id="mdp" autoComplete="current-password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} required />
            </Champ>
            <button type="submit" disabled={envoi || !email || !motDePasse}>{envoi ? 'Connexion…' : <><Icone nom="connexion" taille={16} />Se connecter</>}</button>
          </form>
        )}

        {etape === 'code' && (
          <form onSubmit={verifier} noValidate>
            <h2>Vérification en deux étapes</h2>
            <p>Saisissez le code à 6 chiffres affiché par votre application d’authentification, ou l’un de vos codes de secours.</p>
            <Message type="erreur">{erreur}</Message>
            <Champ label="Code de vérification" id="code" aide="Exemple : 123456, ou un code de secours de la forme ABCDE-FGHJK.">
              <input id="code" inputMode="text" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} required />
            </Champ>
            <div className="actions-form">
              <button type="submit" disabled={envoi || code.trim().length < 6}>{envoi ? 'Vérification…' : 'Valider'}</button>
              <button type="button" className="secondaire" onClick={recommencer}>Retour</button>
            </div>
          </form>
        )}

        {etape === 'enrolement' && secret && (
          <form onSubmit={confirmer} noValidate>
            <h2>Activer la vérification en deux étapes</h2>
            <p>Votre rôle l’exige. Ajoutez TANJAKAI dans une application d’authentification (Google Authenticator, Microsoft Authenticator, FreeOTP…), puis saisissez le code qu’elle affiche.</p>
            <Message type="erreur">{erreur}</Message>
            <ol className="etapes-2fa">
              <li>Dans l’application, choisissez « Ajouter un compte » puis « Saisir une clé de configuration ».</li>
              <li>Compte : <b>{email.trim()}</b> — Clé : <code className="secret-2fa">{secret.secret}</code> (type : basé sur l’heure).</li>
              <li>Sur téléphone, ce lien ouvre directement l’application : <a href={secret.otpauthUri}>ajouter à mon application</a>.</li>
            </ol>
            <Champ label="Code à 6 chiffres affiché par l’application" id="code">
              <input id="code" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
            </Champ>
            <div className="actions-form">
              <button type="submit" disabled={envoi || code.length !== 6}>{envoi ? 'Vérification…' : 'Activer et me connecter'}</button>
              <button type="button" className="secondaire" onClick={recommencer}><Icone nom="croix" taille={16} />Annuler</button>
            </div>
          </form>
        )}

        {etape === 'secours' && secours && <CodesSecours codes={secours} onTermine={() => ouvrirSession(sessionEnAttente)} />}
      </div>
    </div>
  );
}
