// Repart d'un tableau d'alertes vide (DÉMONSTRATION UNIQUEMENT). Les alertes sont une trace d'audit : l'application ne les
// supprime jamais. Ce script retire les alertes, leurs plans d'action et leurs notifications ; les scores, eux, ne changent pas.
// Les alertes se recréeront à la prochaine clôture de campagne si un seuil est franchi. Usage : npm run demo:reset-alertes
const env = require('../config/env');
const db = require('../config/db');

(async () => {
  if (env.NODE_ENV === 'production') throw new Error('Interdit en production : les alertes sont une trace d\'audit');
  try {
    const r = await db.withTransaction({ motif: 'Remise à zéro des alertes de démonstration' }, async (c) => {
      const n = await c.query('DELETE FROM notification WHERE alerte_id IS NOT NULL');
      const a = await c.query('DELETE FROM alerte'); // les plans d'action partent en cascade
      return { notifications: n.rowCount, alertes: a.rowCount };
    });
    console.log(`Terminé : ${r.alertes} alerte(s) et ${r.notifications} notification(s) supprimée(s).`);
  } catch (err) {
    console.error('Échec :', err.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();
