/**
 * Démonstration du « SystèmeClient » : un logiciel externe (ERP du pôle) dépose les valeurs du trimestre dans la plateforme,
 * sans passer par l'écran, avec une clé de service. Ce script joue le rôle de cet ERP.
 *
 *   node src/db/demo-systeme-client.js --cle tjk_xxxxxxxx [--pole BPO-01] [--api http://localhost:4000/api/v1]
 *
 * Il utilise la clé pour DÉPOSER les valeurs (X-Service-Key). Le compte Contrôle de gestion n'est utilisé que pour LIRE
 * l'identifiant de la campagne ouverte et la liste des critères (une vraie intégration les aurait déjà reçus).
 */
const arg = (nom, defaut) => { const i = process.argv.indexOf(`--${nom}`); return i > -1 ? process.argv[i + 1] : defaut; };
const API = arg('api', process.env.API_URL || 'http://localhost:4000/api/v1');
const CLE = arg('cle');
const CODE_POLE = arg('pole', 'BPO-01');
const MDP = process.env.SEED_PASSWORD || 'ChangeMe!2026Tj';
if (!CLE) { console.error('Usage : node src/db/demo-systeme-client.js --cle <clé de service>'); process.exit(1); }

// Valeurs que l'ERP « envoie » (celles de la démonstration : elles déclenchent une alerte de vigilance)
const VALEURS = [['chiffre', 450], ['marge', 8], ['rotation', 25], ['absent', 9], ['satisfaction', 60], ['réclamation', 6]];

async function json(chemin, options = {}) {
  const r = await fetch(API + chemin, options);
  const t = await r.text(); let b; try { b = JSON.parse(t); } catch { b = t; }
  return { s: r.status, b };
}

(async () => {
  const login = await json('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'controle@tanjakai.local', password: MDP }) });
  if (!login.b.accessToken) { console.error('Connexion de lecture impossible :', JSON.stringify(login.b).slice(0, 200)); process.exit(1); }
  const H = { Authorization: `Bearer ${login.b.accessToken}` };
  const campagnes = ((await json('/campagnes?limit=50', { headers: H })).b.data || []).filter((c) => c.statut !== 'CLOTUREE');
  if (!campagnes.length) { console.error('Aucune campagne ouverte : ouvrez d\'abord le trimestre (étape 6 du tutoriel).'); process.exit(1); }
  const poles = (await json('/poles?limit=100', { headers: H })).b.data || [];
  const pole = poles.find((p) => p.code === CODE_POLE);
  if (!pole) { console.error(`Pôle ${CODE_POLE} introuvable.`); process.exit(1); }

  // On cherche, parmi les campagnes ouvertes (la plus récente d'abord), celle dont le périmètre contient ce pôle.
  campagnes.sort((x, y) => (y.exercice - x.exercice) || (y.trimestre - x.trimestre));
  let camp = null; let lignes = [];
  for (const c of campagnes) {
    const plan = (await json(`/campagnes/${c.id}/poles/${pole.id}/saisies`, { headers: H })).b;
    if (plan && (plan.lignes || []).length) { camp = c; lignes = plan.lignes; break; }
  }
  if (!camp) {
    console.error(`\nLe pôle ${pole.code} n'est dans AUCUNE campagne ouverte (${campagnes.map((c) => `T${c.trimestre} ${c.exercice}`).join(', ')}).`);
    console.error('Cause habituelle : la campagne a été ouverte avant le pôle, ou pendant une suspension. Le périmètre est figé à l\'ouverture.');
    console.error('Solution : annulez la campagne (Campagnes → Annuler la campagne, si aucune saisie) puis ouvrez-en une nouvelle.\n');
    process.exit(1);
  }
  console.log(`\nSystèmeClient → plateforme : campagne T${camp.trimestre} ${camp.exercice}, pôle ${pole.code} (${lignes.length} critères)\n`);

  let premier = null;
  for (const [mot, valeur] of VALEURS) {
    const l = lignes.find((x) => x.intitule.toLowerCase().includes(mot));
    if (!l) { console.log(`  (critère « ${mot} » absent du périmètre)`); continue; }
    const cleIdem = `demo-${camp.id}-${l.critereId}`;
    const r = await json('/service/saisies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': CLE, 'Idempotency-Key': cleIdem },
      body: JSON.stringify({ campagne_id: camp.id, critere_id: l.critereId, valeur_realisee: valeur }),
    });
    const ok = r.s === 201 || r.s === 200;
    console.log(`  ${ok ? 'OK ' : 'ERR'} ${String(r.s)}  ${l.intitule} = ${valeur}${ok ? '' : '  →  ' + (r.b.error ? r.b.error.message : JSON.stringify(r.b).slice(0, 120))}`);
    if (ok && !premier) premier = { l, valeur, cleIdem };
  }
  if (premier) {
    const r = await json('/service/saisies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': CLE, 'Idempotency-Key': premier.cleIdem },
      body: JSON.stringify({ campagne_id: camp.id, critere_id: premier.l.critereId, valeur_realisee: premier.valeur }),
    });
    console.log(`\nRenvoi du premier message (réseau instable) : ${r.s} idempotent=${r.b.idempotent} → pas de doublon.`);
  }
  console.log('\nLes valeurs sont en BROUILLON. Connectez-vous avec le responsable (Ma saisie) : elles y apparaissent, puis il les soumet.\n');
})();
