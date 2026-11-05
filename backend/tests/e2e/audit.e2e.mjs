// Scénario « journal d'audit » (base RÉELLE) : le journal reflète les actions faites, se filtre, et ne contient aucun secret.
// Prérequis : base migrée + `npm run seed`, API démarrée (DEV_SKIP_2FA=true). Usage : npm run test:e2e:audit
const B = process.env.API_URL || 'http://localhost:4000/api/v1';
const SEED = process.env.SEED_PASSWORD || 'ChangeMe!2026Tj';
let fails = 0; const tok = {};
async function call(who, method, path, body) {
  const h = { 'Content-Type': 'application/json' }; if (who) h.Authorization = 'Bearer ' + tok[who];
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, b: j };
}
const check = (n, c, x) => { if (!c) { fails++; console.log('FAIL', n, x ? JSON.stringify(x).slice(0, 600) : ''); } else console.log('ok  ', n); };
for (const [k, e] of [['cg', 'controle'], ['dir', 'direction'], ['resp', 'responsable'], ['adm', 'admin']]) {
  const r = await call(null, 'POST', '/auth/login', { email: e + '@tanjakai.local', password: SEED }); tok[k] = r.b.accessToken;
  if (!tok[k]) { console.log('login KO', k, r); process.exit(1); }
}
// droits
for (const who of ['resp', 'cg', 'dir']) { const r = await call(who, 'GET', '/audit'); check(`${who} ne lit pas le journal (403)`, r.s === 403, r); }
let r = await call(null, 'GET', '/audit'); check('sans jeton (401)', r.s === 401, r);

// on produit des traces : création de compte, changement de rôle motivé, création et rattachement d'un pôle
const stamp = Date.now();
r = await call('adm', 'POST', '/utilisateurs', { nom: 'Audit', prenom: 'Test', email: `e2e-audit-${stamp}@tanjakai.local`, role: 'RESPONSABLE_POLE' });
check('compte créé', r.s === 201, r); const u = r.b;
r = await call('adm', 'PATCH', `/utilisateurs/${u.id}/role`, { role: 'CONTROLE_GESTION', motif: 'Motif audit ' + stamp });
check('rôle changé', r.s === 200, r);
r = await call('cg', 'GET', '/poles'); const fam = r.b.data[0].familleId;
r = await call('cg', 'POST', '/poles', { code: 'AUD' + (stamp % 100000), intitule: 'Pôle audit', familleId: fam, dateRattachement: '2020-01-01' }); const pole = r.b.id;
r = await call('cg', 'PATCH', `/poles/${pole}/responsable`, { responsableId: null, motif: 'Rien' }); // 409 attendu, aucune trace
r = await call('adm', 'POST', '/utilisateurs', { nom: 'Audit', prenom: 'Resp', email: `e2e-audit-r-${stamp}@tanjakai.local`, role: 'RESPONSABLE_POLE' }); const resp2 = r.b;
r = await call('cg', 'PATCH', `/poles/${pole}/responsable`, { responsableId: resp2.id, motif: 'Rattachement audit ' + stamp });
check('pôle rattaché', r.s === 200, r);

// lecture
r = await call('adm', 'GET', '/audit?limit=100');
check('liste paginée, la plus récente d\'abord', r.s === 200 && r.b.pagination.total > 3 && r.b.data[0].id > r.b.data[1].id, r.b.pagination);
const brut = JSON.stringify(r.b);
check('aucun secret dans la liste', !/mot_de_passe_hash|empreinte_cle|totp_secret/.test(brut));
r = await call('adm', 'GET', `/audit?motif=${encodeURIComponent('Motif audit ' + stamp)}`);
check('filtre par motif : le changement de rôle', r.s === 200 && r.b.data.length >= 1 && r.b.data.every((a) => a.entite === 'utilisateur' && a.action === 'UPDATE'), r.b);
const chg = r.b.data[0];
check('l\'entrée dit qui, quoi et pourquoi', chg.auteur.email === 'admin@tanjakai.local' && chg.changements.some((c) => c.champ === 'role' && c.avant === 'RESPONSABLE_POLE' && c.apres === 'CONTROLE_GESTION'), chg);
check('résumé limité aux champs changés', chg.changements.length <= 4 && !chg.changements.some((c) => /hash|totp/.test(c.champ)), chg.changements);
r = await call('adm', 'GET', `/audit/${chg.id}`);
check('détail : valeurs avant et après, sans secret', r.s === 200 && r.b.ancienne.role === 'RESPONSABLE_POLE' && r.b.nouvelle.role === 'CONTROLE_GESTION' && !('mot_de_passe_hash' in r.b.nouvelle) && !('totp_secret' in r.b.nouvelle), r.b);
r = await call('adm', 'GET', '/audit/999999999'); check('entrée inconnue (404)', r.s === 404, r);
r = await call('adm', 'GET', '/audit/abc'); check('identifiant invalide (400)', r.s === 400, r);
r = await call('cg', 'GET', '/audit?entite=pole'); check('(contrôle) CG toujours refusé', r.s === 403);
r = await call('adm', 'GET', '/audit?entite=pole&utilisateur=Rabe&motif=' + encodeURIComponent('Rattachement audit ' + stamp));
check('filtres combinés : entité + auteur + motif', r.s === 200 && r.b.data.length === 1 && r.b.data[0].changements.some((c) => c.champ === 'responsable_id'), r.b);
r = await call('adm', 'GET', '/audit?action=INSERT&entite=pole&limit=100'); check('filtre action INSERT', r.s === 200 && r.b.data.length >= 1 && r.b.data.every((a) => a.action === 'INSERT'), r.b.pagination);
r = await call('adm', 'GET', '/audit?action=PIRATE'); check('action inconnue (400)', r.s === 400, r);
r = await call('adm', 'GET', '/audit?depuis=hier'); check('date invalide (400)', r.s === 400, r);
const auj = new Date().toISOString().slice(0, 10);
r = await call('adm', 'GET', `/audit?depuis=${auj}&jusqua=${auj}&limit=5`); check('période du jour', r.s === 200 && r.b.pagination.total > 0, r.b.pagination);
r = await call('adm', 'GET', '/audit?depuis=2000-01-01&jusqua=2000-01-02'); check('période ancienne : vide', r.s === 200 && r.b.data.length === 0);
r = await call('adm', 'GET', '/audit/entites'); check('liste des entités', r.s === 200 && r.b.data.some((e) => e.entite === 'utilisateur') && r.b.data.some((e) => e.entite === 'pole'), r.b);
r = await call('adm', 'GET', '/audit?utilisateur=%25'); check('le joker % saisi n\'est pas interprété comme motif de recherche global (pas d\'erreur)', r.s === 200);
console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT EST OK'); process.exit(fails ? 1 : 0);
