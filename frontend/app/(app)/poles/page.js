'use client';
import { Fragment, useState } from 'react';
import { useAuth, ROLES } from '@/lib/auth';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { date } from '@/lib/format';
import { PageHeader, Carte, Erreur, Message, Chargement, Vide, Etat, Champ } from '@/components/ui';
import { Icone } from '@/components/Icones';

function Suspensions({ pole, gestion }) {
  const liste = useAsync(() => api(`/poles/${pole.id}/suspensions`), [pole.id]);
  const [form, setForm] = useState({ motif: '', dateDebut: '', dateFin: '' });
  const [erreur, setErreur] = useState(null);

  async function ajouter(e) {
    e.preventDefault(); setErreur(null);
    try { await api(`/poles/${pole.id}/suspensions`, { method: 'POST', body: form }); setForm({ motif: '', dateDebut: '', dateFin: '' }); liste.reload(); } catch (err) { setErreur(err); }
  }
  const items = (liste.data && liste.data.data) || [];
  return (
    <div style={{ padding: '4px 0 8px' }}>
      <Erreur erreur={erreur || liste.error} />
      {!items.length ? <small>Aucune suspension de notation.</small> : (
        <ul style={{ margin: '0 0 10px', paddingLeft: 18 }}>
          {items.map((s) => <li key={s.id}>Du {date(s.dateDebut)} au {date(s.dateFin)} — {s.motif}</li>)}
        </ul>
      )}
      {gestion && (
        <form onSubmit={ajouter} className="grille-champs">
          <Champ label="Motif de la suspension" id={`sm-${pole.id}`}><input id={`sm-${pole.id}`} value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} required /></Champ>
          <Champ label="Du" id={`sd-${pole.id}`}><input id={`sd-${pole.id}`} type="date" value={form.dateDebut} onChange={(e) => setForm({ ...form, dateDebut: e.target.value })} required /></Champ>
          <Champ label="Au" id={`sf-${pole.id}`}><input id={`sf-${pole.id}`} type="date" value={form.dateFin} onChange={(e) => setForm({ ...form, dateFin: e.target.value })} required /></Champ>
          <div className="champ" style={{ alignSelf: 'end' }}><button type="submit"><Icone nom="bloquer" taille={16} />Suspendre la notation</button></div>
        </form>
      )}
    </div>
  );
}

function Rattachement({ pole, responsables, onFait }) {
  const [choix, setChoix] = useState(pole.responsableId || '');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState(null);
  const [occupe, setOccupe] = useState(false);
  const inchange = (pole.responsableId || '') === choix;

  async function valider(e) {
    e.preventDefault(); setErreur(null); setOccupe(true);
    try {
      const r = await api(`/poles/${pole.id}/responsable`, { method: 'PATCH', body: { responsableId: choix || null, motif } });
      onFait(choix
        ? `${pole.code} est rattaché à ${r.responsableNom}.${r.saisiesTransferees ? ` ${r.saisiesTransferees} saisie(s) en cours lui ont été transmises.` : ''}`
        : `${pole.code} n'a plus de responsable.`);
    } catch (err) { setErreur(err); } finally { setOccupe(false); }
  }
  return (
    <form onSubmit={valider} className="grille-champs" style={{ padding: '4px 0 8px' }}>
      <div style={{ gridColumn: '1 / -1' }}><Erreur erreur={erreur} /></div>
      <Champ label="Responsable du pôle" id={`rr-${pole.id}`}>
        <select id={`rr-${pole.id}`} value={choix} onChange={(e) => setChoix(e.target.value)}>
          <option value="">Aucun responsable</option>
          {responsables.map((u) => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
        </select>
      </Champ>
      <Champ label="Motif (obligatoire)" id={`rm-${pole.id}`}><input id={`rm-${pole.id}`} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : nouvelle affectation" /></Champ>
      <div className="champ" style={{ alignSelf: 'end' }}><button type="submit" disabled={occupe || inchange || motif.trim().length < 5}><Icone nom="disquette" taille={16} />Enregistrer le rattachement</button></div>
    </form>
  );
}

export default function Poles() {
  const { user } = useAuth();
  const gestion = user.role === ROLES.CONTROLE_GESTION || user.role === ROLES.ADMINISTRATEUR;
  const poles = useAsync(() => api('/poles', { query: { limit: 100 } }), []);
  const familles = useAsync(() => api('/familles'), []);
  const responsables = useAsync(() => api('/utilisateurs', { query: { role: 'RESPONSABLE_POLE' } }), [], gestion);
  const [ouvert, setOuvert] = useState(false);
  const [detail, setDetail] = useState('');
  const [ratt, setRatt] = useState('');
  const [form, setForm] = useState({ code: '', intitule: '', familleId: '', responsableId: '', effectif: '', implantation: '', dateRattachement: '' });
  const [nouvelleFamille, setNouvelleFamille] = useState('');
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState('');

  async function creer(e) {
    e.preventDefault(); setErreur(null); setMessage('');
    try {
      const body = { code: form.code, intitule: form.intitule, familleId: form.familleId, dateRattachement: form.dateRattachement };
      if (form.responsableId) body.responsableId = form.responsableId;
      if (form.effectif !== '') body.effectif = Number(form.effectif);
      if (form.implantation) body.implantation = form.implantation;
      await api('/poles', { method: 'POST', body });
      setMessage('Pôle créé.'); setOuvert(false);
      setForm({ code: '', intitule: '', familleId: '', responsableId: '', effectif: '', implantation: '', dateRattachement: '' });
      poles.reload();
    } catch (err) { setErreur(err); }
  }

  async function creerFamille(e) {
    e.preventDefault(); setErreur(null);
    try { await api('/familles', { method: 'POST', body: { libelle: nouvelleFamille } }); setNouvelleFamille(''); familles.reload(); } catch (err) { setErreur(err); }
  }

  const liste = (poles.data && poles.data.data) || [];
  const listeFamilles = (familles.data && familles.data.data) || [];
  const listeResponsables = ((responsables.data && responsables.data.data) || []).filter((u) => u.actif);
  return (
    <>
      <PageHeader titre="Pôles"
        sousTitre="Chaque pôle appartient à une famille d'activité, ce qui permet de comparer des pôles de nature voisine. Une suspension de notation écarte un pôle récent ou en restructuration de la campagne."
        actions={gestion ? <button type="button" onClick={() => setOuvert((o) => !o)}>{ouvert ? 'Fermer le formulaire' : 'Nouveau pôle'}</button> : null} />
      <Message type="ok">{message}</Message>
      <Erreur erreur={erreur || poles.error || familles.error} />

      {ouvert && (
        <>
          <Carte titre="Nouveau pôle">
            <form onSubmit={creer}>
              <div className="grille-champs">
                <Champ label="Code" id="pc"><input id="pc" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></Champ>
                <Champ label="Intitulé" id="pi"><input id="pi" value={form.intitule} onChange={(e) => setForm({ ...form, intitule: e.target.value })} required /></Champ>
                <Champ label="Famille d'activité" id="pf">
                  <select id="pf" value={form.familleId} onChange={(e) => setForm({ ...form, familleId: e.target.value })} required>
                    <option value="">Choisir…</option>
                    {listeFamilles.map((f) => <option key={f.id} value={f.id}>{f.libelle}</option>)}
                  </select>
                </Champ>
                <Champ label="Responsable" id="pr">
                  <select id="pr" value={form.responsableId} onChange={(e) => setForm({ ...form, responsableId: e.target.value })}>
                    <option value="">Aucun pour l'instant</option>
                    {listeResponsables.map((u) => <option key={u.id} value={u.id}>{u.prenom} {u.nom}</option>)}
                  </select>
                </Champ>
                <Champ label="Effectif" id="pe"><input id="pe" type="number" min="0" value={form.effectif} onChange={(e) => setForm({ ...form, effectif: e.target.value })} /></Champ>
                <Champ label="Implantation" id="pl"><input id="pl" value={form.implantation} onChange={(e) => setForm({ ...form, implantation: e.target.value })} /></Champ>
                <Champ label="Date de rattachement" id="pd"><input id="pd" type="date" value={form.dateRattachement} onChange={(e) => setForm({ ...form, dateRattachement: e.target.value })} required /></Champ>
              </div>
              <button type="submit"><Icone nom="plus" taille={16} />Créer le pôle</button>
            </form>
          </Carte>
          <Carte titre="Ajouter une famille d'activité">
            <form onSubmit={creerFamille} className="actions" style={{ alignItems: 'flex-end' }}>
              <Champ label="Libellé" id="nf"><input id="nf" value={nouvelleFamille} onChange={(e) => setNouvelleFamille(e.target.value)} required /></Champ>
              <div className="champ"><button type="submit"><Icone nom="plus" taille={16} />Ajouter la famille</button></div>
            </form>
          </Carte>
        </>
      )}

      <Carte sansMarge>
        {poles.loading ? <Chargement /> : !liste.length ? <Vide titre="Aucun pôle">{gestion ? 'Créez le premier pôle avec « Nouveau pôle ».' : "Aucun pôle ne vous est rattaché."}</Vide> : (
          <div className="defile">
            <table>
              <thead><tr><th>Pôle</th><th>Famille</th><th>Responsable</th><th className="num">Effectif</th><th>Implantation</th><th>Rattaché le</th><th>Statut</th><th /></tr></thead>
              <tbody>
                {liste.map((p) => (
                  <Fragment key={p.id}>
                    <tr>
                      <td><b>{p.code}</b><br /><small>{p.intitule}</small></td>
                      <td>{p.famille}</td>
                      <td>{p.responsableNom || <Etat statut="X" libelle="Aucun responsable" ton="attention" />}</td>
                      <td className="num">{p.effectif ?? '—'}</td>
                      <td>{p.implantation || '—'}</td>
                      <td>{date(p.dateRattachement)}</td>
                      <td><Etat statut={p.statut} /></td>
                      <td>
                        <div className="actions-form">
                          {gestion && <button type="button" className="secondaire" onClick={() => setRatt(ratt === p.id ? '' : p.id)} aria-expanded={ratt === p.id}>Responsable</button>}
                          <button type="button" className="secondaire" onClick={() => setDetail(detail === p.id ? '' : p.id)} aria-expanded={detail === p.id}><Icone nom="horloge" taille={16} />Suspensions</button>
                        </div>
                      </td>
                    </tr>
                    {ratt === p.id && gestion && <tr><td colSpan={8}><Rattachement pole={p} responsables={listeResponsables} onFait={(m) => { setMessage(m); setRatt(''); poles.reload(); }} /></td></tr>}
                    {detail === p.id && <tr><td colSpan={8}><Suspensions pole={p} gestion={gestion} /></td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Carte>
    </>
  );
}
