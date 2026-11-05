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
