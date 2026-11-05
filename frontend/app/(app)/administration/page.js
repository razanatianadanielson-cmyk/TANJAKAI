'use client';
import { Fragment, useState } from 'react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useAuth, LIBELLE_ROLE, ROLES } from '@/lib/auth';
import { dateHeure, exporterCsv, LIBELLE_EVENEMENT, EVENEMENTS_ALERTE } from '@/lib/format';
import { PageHeader, Carte, Erreur, Chargement, Vide, Etat, Champ, Message } from '@/components/ui';
import { Icone } from '@/components/Icones';

function NouveauCompte({ onCree }) {
  const vide = { nom: '', prenom: '', email: '', role: ROLES.RESPONSABLE_POLE };
  const [f, setF] = useState(vide);
  const [erreur, setErreur] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const [cree, setCree] = useState(null); // contient le mot de passe provisoire, affiché une seule fois
  const [copie, setCopie] = useState(false);

  async function creer(e) {
    e.preventDefault(); setErreur(null); setOccupe(true); setCopie(false);
    try {
      setCree(await api('/utilisateurs', { method: 'POST', body: f }));
      setF(vide); onCree();
    } catch (err) { setErreur(err); } finally { setOccupe(false); }
  }
  async function copier() {
    try { await navigator.clipboard.writeText(cree.motDePasseProvisoire); setCopie(true); } catch { setCopie(false); }
  }

  return (
    <>
      {cree && (
        <Carte titre={`Compte créé : ${cree.prenom} ${cree.nom}`}>
          <Message type="attention">Ce mot de passe provisoire ne sera plus jamais affiché. Transmettez-le à la personne par un canal sûr : elle devra le remplacer à sa première connexion.</Message>
          <p>Identifiant : <b>{cree.email}</b> · Rôle : {LIBELLE_ROLE[cree.role]}</p>
          <div className="secret-2fa"><code>{cree.motDePasseProvisoire}</code></div>
          {cree.secondFacteurRequis && <small>Ce rôle exige la vérification en deux étapes : elle sera configurée à la première connexion.</small>}
          <div className="actions-form" style={{ marginTop: 10 }}>
            <button type="button" onClick={copier}>{copie ? 'Copié ✓' : 'Copier le mot de passe'}</button>
            <button type="button" className="secondaire" onClick={() => setCree(null)}>J’ai transmis le mot de passe</button>
          </div>
        </Carte>
      )}
      <Carte titre="Créer un compte">
        <form onSubmit={creer} noValidate>
          <Erreur erreur={erreur} />
          <div className="grille-champs">
            <Champ label="Nom" id="nc-nom"><input id="nc-nom" value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} required /></Champ>
            <Champ label="Prénom" id="nc-prenom"><input id="nc-prenom" value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })} required /></Champ>
            <Champ label="Adresse e-mail (identifiant)" id="nc-email" aide="Un compte = une personne. Aucun compte partagé."><input id="nc-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Champ>
            <Champ label="Rôle" id="nc-role">
              <select id="nc-role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                {Object.values(ROLES).map((r) => <option key={r} value={r}>{LIBELLE_ROLE[r]}</option>)}
              </select>
            </Champ>
          </div>
          <button type="submit" disabled={occupe || !f.nom || !f.prenom || !f.email}><Icone nom="plus" taille={16} />Créer le compte</button>
        </form>
      </Carte>
    </>
  );
}

function Comptes() {
  const comptes = useAsync(() => api('/auth/admin/comptes'), []);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const { user: moi } = useAuth();
  const [edition, setEdition] = useState(null); // { id, role, motif }
  const [statut, setStatut] = useState(null); // { id, action: 'desactiver' | 'reactiver', motif }

  async function changerRole(c) {
    setMessage(''); setErreur(null); setOccupe(true);
    try {
      const r = await api(`/utilisateurs/${c.id}/role`, { method: 'PATCH', body: { role: edition.role, motif: edition.motif } });
      setMessage(`${c.prenom} ${c.nom} est maintenant ${LIBELLE_ROLE[r.role].toLowerCase()}. ${r.connexionsTerminees ? 'Ses connexions en cours ont été terminées. ' : ''}${r.secondFacteurRequis && (r.role === ROLES.DIRECTION_GENERALE || r.role === ROLES.ADMINISTRATEUR) ? 'La vérification en deux étapes sera configurée à sa prochaine connexion.' : ''}`);
      setEdition(null); comptes.reload();
    } catch (e) { setErreur(e); } finally { setOccupe(false); }
  }

  async function changerStatut(c) {
    setMessage(''); setErreur(null); setOccupe(true);
    try {
      const r = await api(`/utilisateurs/${c.id}/${statut.action}`, { method: 'POST', body: { motif: statut.motif } });
      setMessage(statut.action === 'desactiver'
        ? `Le compte de ${c.prenom} ${c.nom} est désactivé. ${r.connexionsTerminees ? 'Ses connexions en cours ont été terminées.' : ''}`
        : `Le compte de ${c.prenom} ${c.nom} est réactivé : il peut se reconnecter avec son mot de passe.`);
      setStatut(null); comptes.reload();
    } catch (e) { setErreur(e); } finally { setOccupe(false); }
  }

  async function agir(chemin, texte, confirmation) {
    if (confirmation && !window.confirm(confirmation)) return;
    setMessage(''); setErreur(null); setOccupe(true);
    try { await api(chemin, { method: 'POST' }); setMessage(texte); comptes.reload(); } catch (e) { setErreur(e); } finally { setOccupe(false); }
  }
  const liste = (comptes.data && comptes.data.data) || [];
  return (
    <>
    <NouveauCompte onCree={comptes.reload} />
    <Carte titre="Comptes" sansMarge>
      <div style={{ padding: '0 16px' }}><Message type="ok">{message}</Message><Erreur erreur={erreur || comptes.error} /></div>
      {comptes.loading ? <Chargement /> : !liste.length ? <Vide titre="Aucun compte" /> : (
        <div className="defile">
          <table>
            <thead><tr><th>Compte</th><th>Rôle</th><th>Pôles</th><th>Second facteur</th><th>État</th><th>Dernière connexion</th><th className="num">Connexions</th><th>Actions</th></tr></thead>
            <tbody>
              {liste.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.prenom} {c.nom}</b><br /><small>{c.email}</small></td>
                  <td>{LIBELLE_ROLE[c.role]}</td>
                  <td>{c.poles && c.poles.length ? c.poles.join(', ') : <small>—</small>}</td>
                  <td>{c.totpActif ? <Etat statut="X" libelle="Activé" ton="ok" /> : c.secondFacteurRequis ? <Etat statut="X" libelle="À enrôler" ton="attention" /> : <small>Non activé</small>}</td>
                  <td>{!c.actif ? <Etat statut="X" libelle="Désactivé" ton="neutre" /> : c.verrouille ? <Etat statut="X" libelle={`Verrouillé (${c.tentativesEchec} échecs)`} ton="danger" /> : <Etat statut="ACTIF" />}</td>
                  <td>{c.derniereConnexion ? dateHeure(c.derniereConnexion) : '—'}</td>
                  <td className="num">{c.sessionsActives}</td>
                  <td>
                    {edition && edition.id === c.id ? (
                      <div className="actions-form" style={{ alignItems: 'flex-end' }}>
                        <select aria-label="Nouveau rôle" value={edition.role} onChange={(e) => setEdition({ ...edition, role: e.target.value })}>
                          {Object.values(ROLES).map((r) => <option key={r} value={r}>{LIBELLE_ROLE[r]}</option>)}
                        </select>
                        <input aria-label="Motif du changement" placeholder="Motif (obligatoire)" value={edition.motif} onChange={(e) => setEdition({ ...edition, motif: e.target.value })} />
                        <button type="button" disabled={occupe || edition.role === c.role || edition.motif.trim().length < 5} onClick={() => changerRole(c)}><Icone nom="check" taille={16} />Valider</button>
                        <button type="button" className="secondaire" onClick={() => setEdition(null)}><Icone nom="croix" taille={16} />Annuler</button>
                      </div>
                    ) : statut && statut.id === c.id ? (
                      <div className="actions-form" style={{ alignItems: 'flex-end' }}>
                        <input aria-label="Motif" placeholder={statut.action === 'desactiver' ? 'Motif de la désactivation (obligatoire)' : 'Motif de la réactivation (obligatoire)'} value={statut.motif} onChange={(e) => setStatut({ ...statut, motif: e.target.value })} />
                        <button type="button" disabled={occupe || statut.motif.trim().length < 5} onClick={() => changerStatut(c)}>{statut.action === 'desactiver' ? 'Désactiver' : 'Réactiver'}</button>
                        <button type="button" className="secondaire" onClick={() => setStatut(null)}><Icone nom="croix" taille={16} />Annuler</button>
                      </div>
                    ) : (
                    <div className="actions-form">
                      {moi && c.id !== moi.id && <button type="button" className="secondaire" disabled={occupe} onClick={() => setEdition({ id: c.id, role: c.role, motif: '' })}>Changer le rôle</button>}
                      {moi && c.id !== moi.id && c.actif && <button type="button" className="secondaire" disabled={occupe} onClick={() => setStatut({ id: c.id, action: 'desactiver', motif: '' })}>Désactiver</button>}
                      {!c.actif && <button type="button" disabled={occupe} onClick={() => setStatut({ id: c.id, action: 'reactiver', motif: '' })}>Réactiver</button>}
                      {c.verrouille && <button type="button" disabled={occupe} onClick={() => agir(`/auth/admin/comptes/${c.id}/deverrouiller`, 'Compte déverrouillé.')}>Déverrouiller</button>}
                      {c.sessionsActives > 0 && <button type="button" className="secondaire" disabled={occupe} onClick={() => agir(`/auth/admin/comptes/${c.id}/revoquer-sessions`, 'Connexions terminées.', `Terminer toutes les connexions de ${c.prenom} ${c.nom} ?`)}>Terminer les connexions</button>}
                      {c.totpActif && <button type="button" className="secondaire" disabled={occupe} onClick={() => agir(`/auth/admin/comptes/${c.id}/reinitialiser-2fa`, 'Second facteur réinitialisé : un nouvel enrôlement sera demandé.', `Réinitialiser le second facteur de ${c.prenom} ${c.nom} ? Ses connexions seront terminées.`)}>Réinitialiser le 2FA</button>}
                    </div>
                    )}
                  </td>
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

function Journal() {
  const [f, setF] = useState({ email: '', evenement: '', depuis: '', jusqua: '' });
  const [page, setPage] = useState(1);
  const journal = useAsync(() => api('/auth/admin/journal-connexions', { query: { ...f, page, limit: 25 } }), [f.email, f.evenement, f.depuis, f.jusqua, page]);
  const liste = (journal.data && journal.data.data) || [];
  const total = journal.data ? journal.data.pagination.total : 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const maj = (k, v) => { setF({ ...f, [k]: v }); setPage(1); };

  async function exporter() {
    const r = await api('/auth/admin/journal-connexions', { query: { ...f, page: 1, limit: 100 } });
    exporterCsv('journal-connexions.csv', [
      { titre: 'Date', valeur: (e) => dateHeure(e.date) },
      { titre: 'Compte', valeur: (e) => e.email || '' },
      { titre: 'Événement', valeur: (e) => LIBELLE_EVENEMENT[e.evenement] || e.evenement },
      { titre: 'Adresse', valeur: (e) => e.ip || '' },
      { titre: 'Navigateur', valeur: (e) => e.userAgent || '' },
      { titre: 'Détail', valeur: (e) => e.detail || '' },
    ], r.data);
  }

  return (
    <>
      <Carte titre="Journal des connexions" actions={<button type="button" className="secondaire" onClick={exporter} disabled={!liste.length}><Icone nom="telecharger" taille={16} />Exporter (100 derniers résultats)</button>}>
        <div className="grille-champs">
          <Champ label="Compte (e-mail)" id="jm"><input id="jm" value={f.email} onChange={(e) => maj('email', e.target.value)} placeholder="contient…" /></Champ>
          <Champ label="Événement" id="je">
            <select id="je" value={f.evenement} onChange={(e) => maj('evenement', e.target.value)}>
              <option value="">Tous</option>
              {Object.entries(LIBELLE_EVENEMENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Champ>
          <Champ label="Du" id="jd"><input id="jd" type="date" value={f.depuis} onChange={(e) => maj('depuis', e.target.value)} /></Champ>
          <Champ label="Au" id="ju"><input id="ju" type="date" value={f.jusqua} onChange={(e) => maj('jusqua', e.target.value)} /></Champ>
        </div>
        <p className="aide">Le journal est immuable : aucune entrée ne peut être modifiée ni supprimée.</p>
      </Carte>
      <Erreur erreur={journal.error} />
      <Carte sansMarge>
        {journal.loading ? <Chargement /> : !liste.length ? <Vide titre="Aucun événement">Aucune entrée ne correspond à ces filtres.</Vide> : (
          <div className="defile">
            <table>
              <thead><tr><th>Date</th><th>Compte</th><th>Événement</th><th>Adresse</th><th>Détail</th></tr></thead>
              <tbody>
                {liste.map((e) => (
                  <tr key={e.id}>
                    <td>{dateHeure(e.date)}</td>
                    <td>{e.email || '—'}</td>
                    <td>{EVENEMENTS_ALERTE.includes(e.evenement) ? <Etat statut="X" libelle={LIBELLE_EVENEMENT[e.evenement] || e.evenement} ton="danger" /> : (LIBELLE_EVENEMENT[e.evenement] || e.evenement)}</td>
                    <td>{e.ip || '—'}</td>
                    <td><small>{e.detail || ''}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="actions-form" style={{ padding: 12, alignItems: 'center' }}>
          <button type="button" className="secondaire" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</button>
          <span>Page {page} sur {pages} — {total} événement(s)</span>
          <button type="button" className="secondaire" disabled={page >= pages} onClick={() => setPage(page + 1)}>Suivant</button>
        </div>
      </Carte>
    </>
  );
}


const URL_DOCS = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '') + '/docs/';

function ClesService() {
  const cles = useAsync(() => api('/cles-service', { query: { limit: 100 } }), []);
  const poles = useAsync(() => api('/poles', { query: { limit: 100 } }), []);
  const [poleId, setPoleId] = useState('');
  const [libelle, setLibelle] = useState('');
  const [nouvelle, setNouvelle] = useState(null); // clé en clair, affichée une seule fois
  const [copie, setCopie] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const liste = (cles.data && cles.data.data) || [];
  const listePoles = (poles.data && poles.data.data) || [];

  async function creer(e) {
    e.preventDefault(); setErreur(null); setOccupe(true); setCopie(false);
    try {
      const r = await api('/cles-service', { method: 'POST', body: { poleId, libelle } });
      setNouvelle(r); setLibelle(''); cles.reload();
    } catch (err) { setErreur(err); } finally { setOccupe(false); }
  }
  async function revoquer(k) {
    if (!window.confirm(`Révoquer la clé « ${k.libelle} » ? Le système qui l’utilise sera refusé immédiatement.`)) return;
    setErreur(null); setOccupe(true);
    try { await api(`/cles-service/${k.id}/revoquer`, { method: 'POST' }); cles.reload(); } catch (err) { setErreur(err); } finally { setOccupe(false); }
  }
  async function copier() {
    try { await navigator.clipboard.writeText(nouvelle.cle); setCopie(true); } catch { setCopie(false); }
  }

  return (
    <>
      <PageHeader titre="Clés de service" sousTitre="Autorisent un système client (ERP, outil métier) à déposer des valeurs en brouillon pour un pôle." actions={<a className="bouton secondaire" href={URL_DOCS} target="_blank" rel="noreferrer">Documentation de l’API</a>} />
      {nouvelle && (
        <Carte titre="Nouvelle clé — à copier maintenant">
          <Message type="attention">Cette clé ne sera plus jamais affichée : seule son empreinte est conservée. Transmettez-la au système client par un canal sûr.</Message>
          <div className="secret-2fa"><code>{nouvelle.cle}</code></div>
          <div className="actions-form">
            <button type="button" onClick={copier}>{copie ? 'Copiée ✓' : 'Copier la clé'}</button>
            <button type="button" className="secondaire" onClick={() => setNouvelle(null)}>J’ai noté la clé</button>
          </div>
          <small>Utilisation : en-tête <code>X-Service-Key</code> et <code>Idempotency-Key</code> sur <code>POST /service/saisies</code>.</small>
        </Carte>
      )}
      <Carte titre="Créer une clé">
        <form onSubmit={creer} className="actions-form" style={{ alignItems: 'flex-end' }}>
          <Champ label="Pôle" id="cle-pole">
            <select id="cle-pole" value={poleId} onChange={(e) => setPoleId(e.target.value)} required>
              <option value="">Choisir un pôle…</option>
              {listePoles.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.intitule}</option>)}
            </select>
          </Champ>
          <Champ label="Libellé (système client)" id="cle-libelle">
            <input id="cle-libelle" value={libelle} onChange={(e) => setLibelle(e.target.value)} minLength={3} maxLength={120} required placeholder="ERP production" />
          </Champ>
          <button type="submit" disabled={occupe || !poleId}><Icone nom="plus" taille={16} />Créer la clé</button>
        </form>
        <Erreur erreur={erreur || cles.error} />
      </Carte>
      <Carte titre="Clés existantes" sansMarge>
        {cles.loading ? <Chargement /> : !liste.length ? <Vide titre="Aucune clé">Aucun système client n’est encore autorisé.</Vide> : (
          <div className="defile">
            <table>
              <thead><tr><th>Libellé</th><th>Pôle</th><th>Repère</th><th>État</th><th className="num">Saisies reçues</th><th>Créée le</th><th>Action</th></tr></thead>
              <tbody>
                {liste.map((k) => (
                  <tr key={k.id}>
                    <td><b>{k.libelle}</b></td>
                    <td>{k.poleCode} — {k.poleIntitule}</td>
                    <td><code>{k.prefixe}…</code></td>
                    <td>{k.active ? <Etat statut="ACTIF" /> : <Etat statut="X" libelle="Révoquée" ton="neutre" />}</td>
                    <td className="num">{k.nbSaisies}</td>
                    <td>{dateHeure(k.dateCreation)}</td>
                    <td>{k.active && <button type="button" className="secondaire" disabled={occupe} onClick={() => revoquer(k)}>Révoquer</button>}</td>
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

const LIBELLE_ENTITE = {
  utilisateur: 'Comptes', pole: 'Pôles', famille_activite: 'Familles d’activité', axe: 'Axes', critere: 'Critères',
  grille_notation: 'Grilles de notation', ponderation_axe: 'Pondérations des axes', ponderation_critere: 'Pondérations des critères',
  cible: 'Cibles', campagne: 'Campagnes', campagne_pole: 'Pôles des campagnes', saisie: 'Saisies', renvoi_correction: 'Renvois en correction',
  score_pole: 'Scores', seuil_critique: 'Seuils critiques', alerte: 'Alertes', plan_action: 'Plans d’action',
  suspension_pole: 'Suspensions de notation', cle_service: 'Clés de service', synthese_trimestrielle: 'Synthèses',
};
const LIBELLE_ACTION = { INSERT: 'Création', UPDATE: 'Modification', DELETE: 'Suppression' };
const TON_ACTION = { INSERT: 'ok', UPDATE: 'attention', DELETE: 'danger' };
const nomEntite = (e) => LIBELLE_ENTITE[e] || e;

function JournalAudit() {
  const [f, setF] = useState({ entite: '', action: '', utilisateur: '', motif: '', depuis: '', jusqua: '' });
  const [page, setPage] = useState(1);
  const [ouvert, setOuvert] = useState(null);
  const entites = useAsync(() => api('/audit/entites'), []);
  const journal = useAsync(() => api('/audit', { query: { ...f, page, limit: 25 } }), [f.entite, f.action, f.utilisateur, f.motif, f.depuis, f.jusqua, page]);
  const detail = useAsync(() => (ouvert ? api(`/audit/${ouvert}`) : Promise.resolve(null)), [ouvert]);
  const liste = (journal.data && journal.data.data) || [];
  const total = journal.data ? journal.data.pagination.total : 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const maj = (k, v) => { setF({ ...f, [k]: v }); setPage(1); setOuvert(null); };
  const resume = (a) => (a.changements || []).slice(0, 3).map((c) => (a.action === 'UPDATE' ? `${c.champ} : ${c.avant ?? '∅'} → ${c.apres ?? '∅'}` : `${c.champ} : ${c.apres ?? c.avant}`)).join(' · ');

  async function exporter() {
    const r = await api('/audit', { query: { ...f, page: 1, limit: 100 } });
    exporterCsv('journal-audit.csv', [
      { titre: 'Date', valeur: (a) => dateHeure(a.date) },
      { titre: 'Auteur', valeur: (a) => (a.auteur ? `${a.auteur.nom} <${a.auteur.email}>` : 'Système ou clé de service') },
      { titre: 'Action', valeur: (a) => LIBELLE_ACTION[a.action] || a.action },
      { titre: 'Objet', valeur: (a) => nomEntite(a.entite) },
      { titre: 'Identifiant', valeur: (a) => a.entiteId || '' },
      { titre: 'Motif', valeur: (a) => a.motif || '' },
      { titre: 'Changements', valeur: (a) => (a.changements || []).map((c) => `${c.champ}: ${c.avant ?? ''} -> ${c.apres ?? ''}`).join(' | ') },
    ], r.data);
  }

  return (
    <>
      <Carte titre="Journal d’audit" actions={<button type="button" className="secondaire" onClick={exporter} disabled={!liste.length}><Icone nom="telecharger" taille={16} />Exporter (100 derniers résultats)</button>}>
        <div className="grille-champs">
          <Champ label="Objet" id="ae">
            <select id="ae" value={f.entite} onChange={(e) => maj('entite', e.target.value)}>
              <option value="">Tous</option>
              {((entites.data && entites.data.data) || []).map((e) => <option key={e.entite} value={e.entite}>{nomEntite(e.entite)} ({e.n})</option>)}
            </select>
          </Champ>
          <Champ label="Action" id="aa">
            <select id="aa" value={f.action} onChange={(e) => maj('action', e.target.value)}>
              <option value="">Toutes</option>
              {Object.entries(LIBELLE_ACTION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Champ>
          <Champ label="Auteur (nom ou e-mail)" id="au"><input id="au" value={f.utilisateur} onChange={(e) => maj('utilisateur', e.target.value)} placeholder="contient…" /></Champ>
          <Champ label="Motif" id="am"><input id="am" value={f.motif} onChange={(e) => maj('motif', e.target.value)} placeholder="contient…" /></Champ>
          <Champ label="Du" id="ad"><input id="ad" type="date" value={f.depuis} onChange={(e) => maj('depuis', e.target.value)} /></Champ>
          <Champ label="Au" id="aj"><input id="aj" type="date" value={f.jusqua} onChange={(e) => maj('jusqua', e.target.value)} /></Champ>
        </div>
        <p className="aide">Chaque modification de donnée y est inscrite automatiquement : qui, quand, quoi, pourquoi. Le journal ne peut être ni modifié ni effacé, pas même par l’administrateur. Les mots de passe et secrets n’y figurent jamais.</p>
      </Carte>
      <Erreur erreur={journal.error || entites.error} />
      <Carte sansMarge>
        {journal.loading ? <Chargement /> : !liste.length ? <Vide titre="Aucune entrée">Aucune entrée ne correspond à ces filtres.</Vide> : (
          <div className="defile">
            <table>
              <thead><tr><th>Date</th><th>Auteur</th><th>Action</th><th>Objet</th><th>Changements</th><th>Motif</th><th /></tr></thead>
              <tbody>
                {liste.map((a) => (
                  <Fragment key={a.id}>
                    <tr>
                      <td>{dateHeure(a.date)}</td>
                      <td>{a.auteur ? <>{a.auteur.nom}<br /><small>{a.auteur.email}</small></> : <small>Système ou clé de service</small>}</td>
                      <td><Etat statut="X" libelle={LIBELLE_ACTION[a.action] || a.action} ton={TON_ACTION[a.action]} /></td>
                      <td>{nomEntite(a.entite)}</td>
                      <td><small>{resume(a) || '—'}</small></td>
                      <td><small>{a.motif || '—'}</small></td>
                      <td><button type="button" className="secondaire" aria-expanded={ouvert === a.id} onClick={() => setOuvert(ouvert === a.id ? null : a.id)}>Détail</button></td>
                    </tr>
                    {ouvert === a.id && (
                      <tr><td colSpan={7}>
                        {detail.loading || !detail.data ? <Chargement /> : (
                          <div className="grille-champs">
                            <div><b>Avant</b><pre className="json">{detail.data.ancienne ? JSON.stringify(detail.data.ancienne, null, 2) : '—'}</pre></div>
                            <div><b>Après</b><pre className="json">{detail.data.nouvelle ? JSON.stringify(detail.data.nouvelle, null, 2) : '—'}</pre></div>
                          </div>
                        )}
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="actions-form" style={{ padding: 12, alignItems: 'center' }}>
          <button type="button" className="secondaire" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</button>
          <span>Page {page} sur {pages} — {total} entrée(s)</span>
          <button type="button" className="secondaire" disabled={page >= pages} onClick={() => setPage(page + 1)}>Suivant</button>
        </div>
      </Carte>
    </>
  );
}

export default function Administration() {
  const { user } = useAuth();
  if (!user || user.role !== ROLES.ADMINISTRATEUR) return <Message type="erreur">Cette page est réservée à l’administrateur.</Message>;
  const [onglet, setOnglet] = useState('comptes');
  const ONGLETS = [['comptes', 'Comptes'], ['audit', 'Journal d’audit'], ['connexions', 'Journal des connexions'], ['cles', 'Clés de service']];
  return (
    <>
      <PageHeader titre="Administration" sousTitre="Comptes, rôles, journal d’audit, connexions et clés de service." />
      <div className="actions-form" role="tablist" aria-label="Sections de l’administration" style={{ marginBottom: 14 }}>
        {ONGLETS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={onglet === k} className={onglet === k ? '' : 'secondaire'} onClick={() => setOnglet(k)}>{l}</button>
        ))}
      </div>
      {onglet === 'comptes' && <Comptes />}
      {onglet === 'audit' && <JournalAudit />}
      {onglet === 'connexions' && <Journal />}
      {onglet === 'cles' && <ClesService />}
    </>
  );
}
