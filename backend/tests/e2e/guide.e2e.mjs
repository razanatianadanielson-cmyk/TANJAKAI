// Scénario du GUIDE PAS À PAS (base RÉELLE) : rejoue exactement l'exemple du mode d'emploi, avec les mêmes textes et les mêmes chiffres,
// pour garantir que ce qui est écrit dans le guide produit bien ce qui y est annoncé (score de 76,96 au T1, alerte au T2).
// Prérequis : base migrée + `npm run seed` + `npm run seed:demo`, API démarrée (DEV_SKIP_2FA=true). Usage : npm run test:e2e:guide
const B = process.env.API_URL || 'http://localhost:4000/api/v1';
const SEED = process.env.SEED_PASSWORD || 'ChangeMe!2026Tj';
let fails = 0; const tok = {};
async function call(who, method, path, body) {
  const h = { 'Content-Type': 'application/json' }; if (who) h.Authorization = 'Bearer ' + (tok[who] || who);
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, b: j };
}
const check = (n, c, x) => { if (!c) { fails++; console.log('FAIL', n, x ? JSON.stringify(x).slice(0, 600) : ''); } else console.log('ok  ', n); };
for (const [k, e] of [['cg', 'controle'], ['dir', 'direction'], ['adm', 'admin']]) {
  const r = await call(null, 'POST', '/auth/login', { email: e + '@tanjakai.local', password: SEED }); tok[k] = r.b.accessToken;
  if (!tok[k]) { console.log('login KO', k, r); process.exit(1); }
}
const EX = 2029;
let r = await call('cg', 'GET', '/campagnes?limit=100');
if ((r.b.data || []).some((c) => c.exercice === EX)) { console.log(`L'exercice ${EX} existe déjà : scénario du guide déjà joué.`); process.exit(0); }

// 3. compte du responsable (Administration)
r = await call('adm', 'POST', '/utilisateurs', { nom: 'Rakotomalala', prenom: 'Hery', email: 'hery.rakotomalala@tanjakai.local', role: 'RESPONSABLE_POLE' });
if (r.s === 409) { console.log('Le compte de Hery existe déjà : base déjà utilisée pour le guide.'); process.exit(0); }
check('compte de Hery créé, mot de passe provisoire affiché une fois', r.s === 201 && r.b.motDePasseProvisoire.length === 16, r);
const prov = r.b.motDePasseProvisoire; const heryId = r.b.id;
// 4. première connexion : changement obligatoire
let l = await call(null, 'POST', '/auth/login', { email: 'hery.rakotomalala@tanjakai.local', password: prov });
const t0 = l.b.accessToken;
r = await call(t0, 'GET', '/poles'); check('avant changement du mot de passe, les écrans sont bloqués (403)', r.s === 403, r);
r = await call(t0, 'POST', '/auth/mot-de-passe', { actuel: prov, nouveau: 'Soleil-Tamatave#2029' }); check('mot de passe « Soleil-Tamatave#2029 » accepté', r.s === 204, r);
l = await call(null, 'POST', '/auth/login', { email: 'hery.rakotomalala@tanjakai.local', password: 'Soleil-Tamatave#2029' }); tok.hery = l.b.accessToken; check('Hery se reconnecte', !!tok.hery, l);

// 5. le pôle
r = await call('cg', 'GET', '/familles'); const fam = r.b.data.find((f) => f.libelle.startsWith('Externalisation'));
check('la famille « Externalisation de services (BPO) » existe', !!fam, r.b);
r = await call('cg', 'POST', '/poles', { code: 'BPO-02', intitule: 'Pôle BPO Toamasina', familleId: fam.id, responsableId: heryId, effectif: 45, implantation: 'Toamasina', dateRattachement: '2026-10-01' });
check('pôle BPO-02 créé et rattaché à Hery', r.s === 201 && r.b.responsableNom === 'Hery Rakotomalala', r); const pole = r.b.id;
r = await call('hery', 'GET', '/poles'); check('Hery voit son pôle (et seulement lui)', r.b.data.length === 1 && r.b.data[0].code === 'BPO-02', r.b);

// 6. critères et grille existants
r = await call('cg', 'GET', '/criteres?limit=100&valide=true');
const NOMS = ['Réalisation du chiffre d’affaires budgété', 'Marge', 'Rotation du personnel', 'Absentéisme', 'Satisfaction client', 'Taux de réclamation'];
const crit = NOMS.map((n) => r.b.data.find((c) => c.intitule === n && c.definition.includes('démonstration')));
check('les 6 critères « démonstration » existent et sont validés', crit.every(Boolean), r.b.data.map((c) => c.intitule));
// 7. cibles
const CIBLES = [1000, 20, 10, 4, 90, 2];
for (let i = 0; i < 6; i++) { r = await call('cg', 'PUT', '/cibles', { poleId: pole, critereId: crit[i].id, exercice: EX, valeurCible: CIBLES[i] }); if (r.s !== 200 && r.s !== 201) check('cible ' + NOMS[i], false, r); }
r = await call('cg', 'GET', `/cibles?exercice=${EX}&poleId=${pole}&limit=100`); check('6 cibles en attente de validation', r.b.data.length === 6 && r.b.data.every((c) => !c.dateValidation), r.b);
// 8. validation par la direction
r = await call('cg', 'POST', '/cibles/valider-lot', { exercice: EX }); check('le contrôle de gestion ne valide pas les cibles (403)', r.s === 403, r);
r = await call('dir', 'POST', '/cibles/valider-lot', { exercice: EX }); check('la direction valide les 6 cibles', r.s === 200 && r.b.validees === 6, r);
// 9. campagne : « Version 2 » = la grille de la démo
r = await call('cg', 'GET', '/grilles?limit=100'); const grilles = r.b.data.filter((g) => g.statut === 'VALIDEE').sort((a, b) => a.version - b.version);
const g = grilles.find((x) => x.version === 2) || grilles[grilles.length - 1];
console.log('      grille utilisée : version', g.version);
r = await call('cg', 'POST', '/campagnes', { exercice: EX, trimestre: 1, grilleId: g.id, dateLimite: '2029-04-30' });
check('campagne T1 2029 ouverte', r.s === 201, r); const camp1 = r.b.id;
// 10. saisie
const V1 = [900, 22, 12.5, 4, 81, 4];
for (let i = 0; i < 6; i++) { r = await call('hery', 'PUT', `/campagnes/${camp1}/poles/${pole}/criteres/${crit[i].id}`, { valeurRealisee: V1[i] }); if (r.s !== 200) check('saisie ' + NOMS[i], false, r); }
r = await call('hery', 'POST', `/campagnes/${camp1}/poles/${pole}/soumettre`); check('soumission', r.s === 200, r);
r = await call('hery', 'PUT', `/campagnes/${camp1}/poles/${pole}/criteres/${crit[0].id}`, { valeurRealisee: 1 }); check('après soumission, plus de modification (409)', r.s === 409, r);
// 11. validation
r = await call('hery', 'POST', `/campagnes/${camp1}/poles/${pole}/valider`); check('Hery ne valide pas (403)', r.s === 403, r);
r = await call('cg', 'POST', `/campagnes/${camp1}/poles/${pole}/valider`); check('contrôle de gestion valide les 6 saisies', r.s === 200 && r.b.validees === 6, r);
// 12. simulation puis clôture
r = await call('cg', 'POST', `/campagnes/${camp1}/simuler`); const sim = (r.b.scores || r.b.simulation || []).find?.((x) => x.poleCode === 'BPO-02');
check('simulation : score 76,96', r.s === 200 && sim && sim.scoreConsolide === 76.96, r.b);
r = await call('cg', 'POST', `/campagnes/${camp1}/cloturer`); const s1 = (r.b.scores || []).find((x) => x.poleCode === 'BPO-02');
check('T1 clôturé : score 76,96, aucune alerte pour BPO-02', r.s === 200 && s1.scoreConsolide === 76.96 && !(r.b.alertes || []).some((a) => a.poleCode === 'BPO-02'), r.b.alertes);
// 13. résultats
r = await call('hery', 'GET', '/scores'); check('Hery voit son score', r.b.data.length >= 1 && r.b.data.every((s) => s.poleCode === 'BPO-02'), r.b.data.map((s) => s.poleCode));
// 14. deuxième trimestre : mauvaises valeurs
r = await call('cg', 'POST', '/campagnes', { exercice: EX, trimestre: 2, grilleId: g.id, dateLimite: '2029-07-31' }); check('campagne T2 2029 ouverte (mêmes cibles, rien à ressaisir)', r.s === 201, r); const camp2 = r.b.id;
const V2 = [450, 8, 22, 9, 55, 7];
for (let i = 0; i < 6; i++) { r = await call('hery', 'PUT', `/campagnes/${camp2}/poles/${pole}/criteres/${crit[i].id}`, { valeurRealisee: V2[i] }); if (r.s !== 200) check('saisie T2 ' + NOMS[i], false, r); }
r = await call('hery', 'POST', `/campagnes/${camp2}/poles/${pole}/soumettre`);
check('T2 : soumission refusée sans explication des fortes variations', r.s === 422 && JSON.stringify(r.b.error.details).includes('JUSTIFICATION_REQUISE'), r.b);
const lignes = (await call('hery', 'GET', `/campagnes/${camp2}/poles/${pole}/saisies`)).b.lignes;
for (let i = 0; i < 6; i++) await call('hery', 'PUT', `/campagnes/${camp2}/poles/${pole}/criteres/${crit[i].id}`, { valeurRealisee: V2[i], commentaire: 'Perte d\'un client majeur ce trimestre' });
r = await call('hery', 'POST', `/campagnes/${camp2}/poles/${pole}/soumettre`); check('T2 : soumission acceptée avec le commentaire', r.s === 200, r.b);
await call('cg', 'POST', `/campagnes/${camp2}/poles/${pole}/valider`);
r = await call('cg', 'POST', `/campagnes/${camp2}/simuler`); const sim2 = (r.b.scores || r.b.simulation || []).find?.((x) => x.poleCode === 'BPO-02'); console.log('      simulation T2 :', sim2 && sim2.scoreConsolide);
r = await call('cg', 'POST', `/campagnes/${camp2}/cloturer`); const s2 = (r.b.scores || []).find((x) => x.poleCode === 'BPO-02'); const al = (r.b.alertes || []).filter((a) => a.poleCode === 'BPO-02').map((a) => a.type).sort();
console.log('      T2 score', s2.scoreConsolide, 'alertes', al.join(','));
check('T2 : alertes Vigilance et Dégradation', al.join() === 'DEGRADATION,VIGILANCE', al);
r = await call('hery', 'GET', '/alertes?limit=50'); const vig = r.b.data.find((a) => a.type === 'VIGILANCE'); check('Hery voit ses alertes', r.b.data.length === 2 && !!vig, r.b);
r = await call('hery', 'POST', `/alertes/${vig.id}/accuser`, { plans: [{ description: 'Renégocier le contrat avec le client principal', echeance: '2029-09-30' }] }); check('Hery prend en compte l\'alerte avec une action datée', r.s === 200 && r.b.statut === 'ACCUSEE', r);
r = await call('cg', 'POST', `/alertes/${vig.id}/cloturer`); check('le contrôle de gestion clôture l\'alerte', r.s === 200 && r.b.statut === 'CLOTUREE', r);
r = await call('dir', 'GET', '/scores?limit=100'); const rang = r.b.data.filter((s) => s.poleCode === 'BPO-02').length; check('la direction voit les scores de BPO-02', rang >= 2, rang);
await call('adm', 'POST', `/utilisateurs/${heryId}/desactiver`, { motif: 'Nettoyage du test' }).catch(() => {});
console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT EST OK'); process.exit(fails ? 1 : 0);
