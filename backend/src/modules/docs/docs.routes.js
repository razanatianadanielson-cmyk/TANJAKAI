const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { construire } = require('./openapi');

// Documentation publique (aucune donnée métier) : spécification + console d'essai sans dépendance externe.
const spec = construire();
const html = fs.readFileSync(path.join(__dirname, 'console.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, 'console.js'), 'utf8');

router.get('/openapi.json', (req, res) => res.json(spec));
router.get('/console.js', (req, res) => res.type('application/javascript').send(js));
router.get('/', (req, res) => {
  const [chemin, requete] = req.originalUrl.split('?');
  if (!chemin.endsWith('/')) return res.redirect(301, chemin + '/' + (requete ? '?' + requete : '')); // chemins relatifs de la page
  return res.type('html').send(html);
});

module.exports = router;
