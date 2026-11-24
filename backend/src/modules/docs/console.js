(function () {
  'use strict';
  var BASE = location.pathname.replace(/\/docs\/?$/, '');
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, props, children) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === 'text') e.textContent = props[k]; else if (k === 'class') e.className = props[k]; else e.setAttribute(k, props[k]); });
    (children || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function lire() { try { return JSON.parse(sessionStorage.getItem('tj.docs') || '{}'); } catch (e) { return {}; } }
  function ecrire(o) { try { sessionStorage.setItem('tj.docs', JSON.stringify(o)); } catch (e) { /* stockage indisponible */ } }
  var memo = lire();
  $('jeton').value = memo.jeton || ''; $('cle').value = memo.cle || '';
  ['jeton', 'cle'].forEach(function (id) { $(id).addEventListener('input', function () { memo[id] = $(id).value.trim(); ecrire(memo); }); });

  function afficher(pre, statut, texte) {
    pre.textContent = '';
    pre.appendChild(el('span', { class: 'statut ' + (statut < 400 ? 'ok' : 'ko'), text: 'HTTP ' + statut + '\n' }));
    pre.appendChild(document.createTextNode(texte));
  }
  async function appeler(method, url, headers, body) {
    var r = await fetch(url, { method: method.toUpperCase(), headers: headers, body: body });
    var t = await r.text(); try { t = JSON.stringify(JSON.parse(t), null, 2); } catch (e) { /* texte brut */ }
    return { statut: r.status, texte: t };
  }

  $('connexion').addEventListener('click', async function () {
    var r = await appeler('post', BASE + '/auth/login', { 'Content-Type': 'application/json' },
      JSON.stringify({ email: $('email').value.trim(), password: $('mdp').value }));
    var j = {}; try { j = JSON.parse(r.texte); } catch (e) { /* ignore */ }
    if (j.accessToken) { $('jeton').value = j.accessToken; memo.jeton = j.accessToken; ecrire(memo); $('infoAcces').textContent = 'Jeton obtenu (valable 15 minutes).'; }
    else if (j.requiresSecondFactor) $('infoAcces').textContent = 'Second facteur requis : connectez-vous depuis l\'application, ou utilisez POST /auth/verify-2fa ci-dessous avec le challengeToken.';
    else $('infoAcces').textContent = 'Échec : ' + (j.error ? j.error.message : r.statut);
  });

  // Démonstration : un « logiciel de pôle » qui n'a que sa clé de service
  var VALEURS_DEMO = [['chiffre', 450], ['marge', 8], ['rotation', 25], ['absent', 9], ['satisfaction', 60], ['réclamation', 6]];
  $('demoEnvoi').addEventListener('click', async function () {
    var sortie = $('demoSortie'); var cle = $('cle').value.trim(); var lignes = [];
    function dire(t) { lignes.push(t); sortie.textContent = lignes.join('\n'); }
    if (!cle) { sortie.textContent = 'Collez d\'abord la clé de service dans le champ « Clé de service » en haut de la page.'; return; }
    try {
      var d = await appeler('get', BASE + '/service/saisies/attendues', { 'X-Service-Key': cle }, undefined);
      var j = {}; try { j = JSON.parse(d.texte); } catch (e) { /* ignore */ }
      if (d.statut !== 200) { dire('Clé refusée ou serveur indisponible (HTTP ' + d.statut + ') : ' + ((j.error && j.error.message) || d.texte)); return; }
      var camp = (j.campagnes || []).filter(function (c) { return c.criteres.length; })[0];
      if (!camp) { dire('Aucune campagne ouverte ne contient le pôle de cette clé.'); return; }
      dire('Campagne T' + camp.trimestre + ' ' + camp.exercice + ' — ' + camp.criteres.length + ' critères à renseigner\n');
      var premier = null;
      for (var i = 0; i < VALEURS_DEMO.length; i++) {
        var mot = VALEURS_DEMO[i][0], valeur = VALEURS_DEMO[i][1];
        var c = camp.criteres.filter(function (x) { return x.intitule.toLowerCase().indexOf(mot) > -1; })[0];
        if (!c) { dire('  (critère « ' + mot + ' » absent)'); continue; }
        var h = { 'Content-Type': 'application/json', 'X-Service-Key': cle, 'Idempotency-Key': 'demo-' + camp.campagneId + '-' + c.critereId };
        var corps = JSON.stringify({ campagne_id: camp.campagneId, critere_id: c.critereId, valeur_realisee: valeur });
        var r = await appeler('post', BASE + '/service/saisies', h, corps);
        var ok = r.statut === 200 || r.statut === 201;
        var rj = {}; try { rj = JSON.parse(r.texte); } catch (e) { /* ignore */ }
        dire('  ' + (ok ? 'OK ' : 'ERR') + ' ' + r.statut + '  ' + c.intitule + ' = ' + valeur + (ok ? '' : '  →  ' + ((rj.error && rj.error.message) || '')));
        if (ok && !premier) premier = { h: h, corps: corps };
      }
      if (premier) {
        var rr = await appeler('post', BASE + '/service/saisies', premier.h, premier.corps);
        var rrj = {}; try { rrj = JSON.parse(rr.texte); } catch (e) { /* ignore */ }
        dire('\nRenvoi du premier message (réseau instable) : HTTP ' + rr.statut + ', idempotent = ' + rrj.idempotent + ' → pas de doublon.');
      }
      dire('\nLes valeurs sont en BROUILLON : le responsable du pôle les voit dans « Ma saisie » et les soumet.');
    } catch (e) { dire('Erreur réseau : ' + e.message); }
  });

  function carte(op) {
    var champs = {};
    var resume = el('summary', {}, [el('span', { class: 'm ' + op.method, text: op.method.toUpperCase() }), el('span', { class: 'chemin', text: op.path }), el('span', { class: 'resume', text: op.summary })]);
    var corps = el('div', { class: 'corps' });
    corps.appendChild(el('div', { class: 'resume', text: op.description.replace(/\*\*/g, '') }));
    (op.parameters || []).forEach(function (p) {
      var inp = el('input', { placeholder: p.in + (p.required ? ' (obligatoire)' : '') });
      champs[p.in + ':' + p.name] = inp;
      corps.appendChild(el('label', { text: p.name + ' — ' + p.in }, [inp]));
    });
    var zone = null;
    if (op.requestBody) { zone = el('textarea', { spellcheck: 'false' }); zone.value = JSON.stringify(op.requestBody.content['application/json'].example || {}, null, 2); corps.appendChild(zone); }
    var envoyer = el('button', { text: 'Envoyer' }); var sortie = el('pre', { text: 'Aucune réponse pour le moment.' });
    envoyer.addEventListener('click', async function () {
      var url = BASE + op.path; var qs = [];
      var headers = { 'Content-Type': 'application/json' };
      Object.keys(champs).forEach(function (k) {
        var v = champs[k].value.trim(); if (!v) return; var n = k.split(':')[1];
        if (k.indexOf('path:') === 0) url = url.replace('{' + n + '}', encodeURIComponent(v));
        else if (k.indexOf('query:') === 0) qs.push(encodeURIComponent(n) + '=' + encodeURIComponent(v));
        else headers[n] = v;
      });
      if (qs.length) url += '?' + qs.join('&');
      var secu = op.security && op.security[0];
      if (secu && secu.jeton && $('jeton').value.trim()) headers.Authorization = 'Bearer ' + $('jeton').value.trim();
      if (secu && secu.cleDeService && $('cle').value.trim()) headers['X-Service-Key'] = $('cle').value.trim();
      if (secu && secu.cleDeService && !headers['Idempotency-Key']) headers['Idempotency-Key'] = 'console-' + Date.now();
      try { var r = await appeler(op.method, url, headers, zone ? zone.value : undefined); afficher(sortie, r.statut, r.texte); }
      catch (e) { sortie.textContent = 'Erreur réseau : ' + e.message; }
    });
    corps.appendChild(envoyer); corps.appendChild(sortie);
    return el('details', {}, [resume, corps]);
  }

  fetch('openapi.json').then(function (r) { return r.json(); }).then(function (spec) {
    var liste = $('liste'); liste.textContent = '';
    spec.tags.forEach(function (t) {
      liste.appendChild(el('h2', { text: t.name }));
      Object.keys(spec.paths).forEach(function (path) {
        Object.keys(spec.paths[path]).forEach(function (method) {
          var op = spec.paths[path][method];
          if (op.tags[0] === t.name) liste.appendChild(carte({ method: method, path: path, summary: op.summary, description: op.description, parameters: op.parameters, requestBody: op.requestBody, security: op.security }));
        });
      });
    });
  }).catch(function (e) { $('liste').textContent = 'Impossible de charger la spécification : ' + e.message; });
})();
