'use client';
import { useState } from 'react';
import { api, messageErreur } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useAuth, LIBELLE_ROLE, ROLES } from '@/lib/auth';
import { dateHeure, LIBELLE_EVENEMENT, EVENEMENTS_ALERTE } from '@/lib/format';
import { PageHeader, Carte, Erreur, Chargement, Etat, Champ, Message } from '@/components/ui';
import { Icone } from '@/components/Icones';
import ChampMdp from '@/components/MotDePasse';

const OBLIGATOIRE = [ROLES.DIRECTION_GENERALE, ROLES.ADMINISTRATEUR];
const REGLES = ['12 caractères minimum', 'une minuscule, une majuscule, un chiffre et un caractère spécial', 'ni votre nom, ni votre e-mail, ni un mot de passe courant'];

function CodesAffiches({ codes, onFermer }) {
  return (
    <div>
      <Message type="attention">Ces codes ne seront plus affichés. Chacun ne sert qu’une fois. Conservez-les hors de cet ordinateur.</Message>
      <ul className="codes-secours">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
      <button type="button" onClick={onFermer}>J’ai conservé ces codes</button>
    </div>
  );
}

function MotDePasse({ rafraichir }) {
  const [f, setF] = useState({ actuel: '', nouveau: '', confirmation: '' });
  const [erreur, setErreur] = useState('');
  const [ok, setOk] = useState('');
  const [occupe, setOccupe] = useState(false);
  async function envoyer(e) {
    e.preventDefault(); setErreur(''); setOk('');
    if (f.nouveau !== f.confirmation) { setErreur('La confirmation ne correspond pas au nouveau mot de passe.'); return; }
    setOccupe(true);
    try {
      await api('/auth/mot-de-passe', { method: 'POST', body: { actuel: f.actuel, nouveau: f.nouveau } });
      setOk('Mot de passe modifié. Vos autres connexions ont été terminées.');
      setF({ actuel: '', nouveau: '', confirmation: '' }); rafraichir();
    } catch (err) { setErreur(messageErreur(err)); } finally { setOccupe(false); }
  }
  return (
    <Carte titre="Mot de passe">
      <form onSubmit={envoyer} noValidate>
        <Message type="ok">{ok}</Message><Message type="erreur">{erreur}</Message>
        <div className="grille-champs">
          <Champ label="Mot de passe actuel" id="actuel"><ChampMdp id="actuel" autoComplete="current-password" value={f.actuel} onChange={(e) => setF({ ...f, actuel: e.target.value })} required /></Champ>
          <Champ label="Nouveau mot de passe" id="nouveau"><ChampMdp id="nouveau" autoComplete="new-password" value={f.nouveau} onChange={(e) => setF({ ...f, nouveau: e.target.value })} required /></Champ>
          <Champ label="Confirmation" id="conf"><ChampMdp id="conf" autoComplete="new-password" value={f.confirmation} onChange={(e) => setF({ ...f, confirmation: e.target.value })} required /></Champ>
        </div>
        <ul className="regles-mdp">{REGLES.map((r) => <li key={r}>{r}</li>)}</ul>
        <button type="submit" disabled={occupe || !f.actuel || !f.nouveau}><Icone nom="crayon" taille={16} />Changer le mot de passe</button>
      </form>
    </Carte>
  );
}

function SecondFacteur({ profil, rafraichir }) {
  const obligatoire = OBLIGATOIRE.includes(profil.role);
  const [configuration, setConfiguration] = useState(null);
  const [code, setCode] = useState('');
  const [mdp, setMdp] = useState('');
  const [mode, setMode] = useState(''); // '' | 'desactiver' | 'codes'
  const [codes, setCodes] = useState(null);
  const [erreur, setErreur] = useState('');
  const [ok, setOk] = useState('');
  const [occupe, setOccupe] = useState(false);

  async function agir(fn) {
    setErreur(''); setOk(''); setOccupe(true);
    try { await fn(); } catch (err) { setErreur(messageErreur(err)); } finally { setOccupe(false); }
  }
  const commencer = () => agir(async () => { setConfiguration(await api('/auth/2fa/setup', { method: 'POST' })); setCode(''); });
  const activer = (e) => { e.preventDefault(); return agir(async () => {
    const r = await api('/auth/2fa/activer', { method: 'POST', body: { code: code.trim() } });
    setConfiguration(null); setCodes(r.codesSecours); rafraichir();
  }); };
  const desactiver = (e) => { e.preventDefault(); return agir(async () => {
    await api('/auth/2fa/desactiver', { method: 'POST', body: { motDePasse: mdp, code: code.trim() } });
    setMode(''); setMdp(''); setCode(''); setOk('Vérification en deux étapes désactivée.'); rafraichir();
  }); };
  const nouveauxCodes = (e) => { e.preventDefault(); return agir(async () => {
    const r = await api('/auth/2fa/codes-secours', { method: 'POST', body: { motDePasse: mdp } });
    setMode(''); setMdp(''); setCodes(r.codesSecours); rafraichir();
  }); };

  return (
    <Carte titre="Vérification en deux étapes" actions={<Etat statut="X" libelle={profil.totpActif ? 'Activée' : 'Non activée'} ton={profil.totpActif ? 'ok' : 'attention'} />}>
      <Message type="ok">{ok}</Message><Message type="erreur">{erreur}</Message>
      {codes ? <CodesAffiches codes={codes} onFermer={() => setCodes(null)} /> : (
        <>
          {!profil.totpActif && !configuration && (
            <>
              <p className="alerte-texte">{obligatoire ? 'Cette vérification est obligatoire pour votre rôle : vous serez invité à l’activer à votre prochaine connexion.' : 'Ajoute un code temporaire, généré par votre téléphone, à votre mot de passe. Facultatif pour votre rôle, recommandé.'}</p>
              {!obligatoire && <button type="button" onClick={commencer} disabled={occupe}><Icone nom="cle" taille={16} />Activer</button>}
            </>
          )}
          {configuration && (
            <form onSubmit={activer} noValidate>
              <ol className="etapes-2fa">
                <li>Dans votre application d’authentification, choisissez « Saisir une clé de configuration ».</li>
                <li>Compte : <b>{profil.email}</b> — Clé : <code className="secret-2fa">{configuration.secret}</code> (basée sur l’heure).</li>
                <li>Ou, sur téléphone : <a href={configuration.otpauthUri}>ajouter à mon application</a>.</li>
              </ol>
              <Champ label="Code à 6 chiffres affiché" id="c2"><input id="c2" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" required /></Champ>
              <div className="actions-form">
                <button type="submit" disabled={occupe || code.length !== 6}>Confirmer l’activation</button>
                <button type="button" className="secondaire" onClick={() => setConfiguration(null)}><Icone nom="croix" taille={16} />Annuler</button>
              </div>
            </form>
          )}
          {profil.totpActif && !mode && (
            <>
              <p className="alerte-texte">Codes de secours restants : <b>{profil.codesSecoursRestants}</b>.{profil.codesSecoursRestants <= 2 ? ' Pensez à en générer de nouveaux.' : ''}</p>
              <div className="actions-form">
                <button type="button" className="secondaire" onClick={() => { setMode('codes'); setMdp(''); }}>Nouveaux codes de secours</button>
                {!obligatoire && <button type="button" className="secondaire" onClick={() => { setMode('desactiver'); setMdp(''); setCode(''); }}>Désactiver</button>}
              </div>
              {obligatoire && <p className="aide">Obligatoire pour votre rôle : en cas de perte du téléphone, un administrateur peut le réinitialiser.</p>}
            </>
          )}
          {mode === 'codes' && (
            <form onSubmit={nouveauxCodes} noValidate>
              <p className="alerte-texte">Les anciens codes seront invalidés.</p>
              <Champ label="Mot de passe" id="m1"><ChampMdp id="m1" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} required /></Champ>
              <div className="actions-form"><button type="submit" disabled={occupe || !mdp}><Icone nom="etincelle" taille={16} />Générer</button><button type="button" className="secondaire" onClick={() => setMode('')}><Icone nom="croix" taille={16} />Annuler</button></div>
            </form>
          )}
          {mode === 'desactiver' && (
            <form onSubmit={desactiver} noValidate>
              <div className="grille-champs">
                <Champ label="Mot de passe" id="m2"><ChampMdp id="m2" autoComplete="current-password" value={mdp} onChange={(e) => setMdp(e.target.value)} required /></Champ>
                <Champ label="Code de vérification" id="c3"><input id="c3" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" required /></Champ>
              </div>
              <div className="actions-form"><button type="submit" className="danger" disabled={occupe || !mdp || code.trim().length < 6}><Icone nom="bloquer" taille={16} />Désactiver</button><button type="button" className="secondaire" onClick={() => setMode('')}><Icone nom="croix" taille={16} />Annuler</button></div>
            </form>
          )}
        </>
      )}
    </Carte>
  );
}

export default function Compte() {
  const { user, rafraichirProfil } = useAuth();
  const provisoire = Boolean(user && user.mdpAChanger);
  const profil = useAsync(() => api('/auth/me'), []);
  const sessions = useAsync(() => api('/auth/sessions'), [], !provisoire);
  const journal = useAsync(() => api('/auth/journal'), [], !provisoire);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState(null);

  async function revoquer() {
    setErreur(null); setMessage('');
    try {
      const r = await api('/auth/sessions/revoquer-autres', { method: 'POST' });
      setMessage(`${r.revoquees} autre(s) connexion(s) terminée(s).`); sessions.reload(); journal.reload();
    } catch (e) { setErreur(e); }
  }

  if (profil.loading) return <Chargement />;
  if (profil.error) return <Erreur erreur={profil.error} />;
  const p = profil.data;
  const rafraichir = () => { profil.reload(); journal.reload(); sessions.reload(); rafraichirProfil(); };

  if (provisoire) {
    return (
      <>
        <PageHeader titre="Bienvenue" sousTitre={`${p.prenom} ${p.nom} · ${p.email}`} />
        <Message type="attention">Votre compte vient d’être créé avec un mot de passe provisoire. Choisissez maintenant votre mot de passe personnel : vous pourrez ensuite utiliser l’application.</Message>
        <MotDePasse rafraichir={rafraichir} />
      </>
    );
  }

  return (
    <>
      <PageHeader titre="Mon compte" sousTitre={`${p.prenom} ${p.nom} · ${p.email} · ${LIBELLE_ROLE[user.role]}`} />

      <MotDePasse rafraichir={rafraichir} />
      <SecondFacteur profil={p} rafraichir={rafraichir} />

      <Carte titre="Connexions actives" actions={<button type="button" className="secondaire" onClick={revoquer}>Déconnecter les autres appareils</button>}>
        <Message type="ok">{message}</Message><Erreur erreur={erreur || sessions.error} />
        {sessions.loading ? <Chargement /> : (
          <ul className="liste-sessions">
            {((sessions.data && sessions.data.data) || []).map((s) => (
              <li key={s.id}>
                <span>{s.courante ? <Etat statut="X" libelle="Cette connexion" ton="ok" /> : null} {s.userAgent ? s.userAgent.slice(0, 70) : 'Appareil inconnu'}<small>Adresse {s.ip || '—'} · ouverte le {dateHeure(s.creeLe)}</small></span>
                <span>Dernière activité<small>{dateHeure(s.derniereActivite)}</small></span>
              </li>
            ))}
          </ul>
        )}
        <p className="aide">Une connexion inactive plus de {p.inactiviteMinutes} minutes est fermée automatiquement.</p>
      </Carte>

      <Carte titre="Mon historique de connexion" sansMarge>
        {journal.loading ? <Chargement /> : (
          <div className="defile">
            <table>
              <thead><tr><th>Date</th><th>Événement</th><th>Adresse</th><th>Détail</th></tr></thead>
              <tbody>
                {((journal.data && journal.data.data) || []).map((e) => (
                  <tr key={e.id}>
                    <td>{dateHeure(e.date)}</td>
                    <td>{EVENEMENTS_ALERTE.includes(e.evenement) ? <Etat statut="X" libelle={LIBELLE_EVENEMENT[e.evenement] || e.evenement} ton="danger" /> : (LIBELLE_EVENEMENT[e.evenement] || e.evenement)}</td>
                    <td>{e.ip || '—'}</td>
                    <td>{e.detail || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </>
  );
}
