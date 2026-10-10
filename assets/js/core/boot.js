/* Lit Neon v2 — boot (brief §0.3, §3.9.4, §6.1). A CLASSIC script, loaded first on every page:
     <script src="/lit-neon-preview/assets/js/core/boot.js"></script>
     <script type="module" src="/lit-neon-preview/assets/js/pages/<page>.js"></script>
   1. Handles the review-only URL overrides (?review=1 · ?now= · ?facts=confirmed · ?debug=1), persisting them in
      sessionStorage and marking <html data-review>. In customer mode every other override is ignored.
   2. Inserts the single import map every module shares (vendored engines + the core/ix/pages prefixes), so no page
      ever reaches outside V2 with ../ paths.
   3. Exposes window.LN_BOOT = { review, now, facts, debug, page } for the few places that need it synchronously.
   No DOM is rendered here; chrome.js and the page module do that. */
(function () {
  'use strict';
  var doc = document, html = doc.documentElement;
  var q = new URLSearchParams(location.search);
  var ss = null; try { ss = window.sessionStorage; ss.getItem('review'); } catch (e) { ss = null; }
  var get = function (k) { try { return ss ? ss.getItem(k) : null; } catch (e) { return null; } };
  var set = function (k, v) { try { if (!ss) return; if (v == null) ss.removeItem(k); else ss.setItem(k, v); } catch (e) {} };

  /* review mode: ?review=1 turns it on for the session, ?review=0 turns it off */
  if (q.has('review')) set('review', q.get('review') === '1' ? '1' : null);
  var review = get('review') === '1';
  if (review) {
    html.setAttribute('data-review', '1');
    if (q.has('now')) { var d = new Date(q.get('now')); set('now', isNaN(d) ? null : d.toISOString()); }
    if (q.has('facts')) set('facts', q.get('facts') === 'confirmed' ? 'confirmed' : null);
    if (q.has('debug')) set('debug', q.get('debug') === '1' ? '1' : null);
  } else {
    html.removeAttribute('data-review');
    set('now', null); set('facts', null); set('debug', null);
  }
  window.LN_BOOT = { review: review, now: review ? get('now') : null, facts: review ? get('facts') : null, debug: review && get('debug') === '1', page: (doc.body && doc.body.getAttribute('data-page')) || null };

  /* the one import map (§6.1). Bare specifiers: neon-core · rules · catalog · neon-photo; prefixes: core/ ix/ pages/ data/ */
  if (!doc.querySelector('script[type="importmap"]')) {
    var map = { imports: {
      'neon-core': '/lit-neon-preview/assets/vendor/engines/neon-core.js',
      'rules': '/lit-neon-preview/assets/vendor/engines/rules.js',
      'catalog': '/lit-neon-preview/assets/vendor/engines/catalog.js',
      'neon-photo': '/lit-neon-preview/assets/vendor/engines/neon-photo.js',
      'core/': '/lit-neon-preview/assets/js/core/',
      'ix/': '/lit-neon-preview/assets/js/ix/',
      'pages/': '/lit-neon-preview/assets/js/pages/'
    } };
    var s = doc.createElement('script'); s.type = 'importmap'; s.textContent = JSON.stringify(map);
    var me = doc.currentScript;
    if (me && me.parentNode) me.parentNode.insertBefore(s, me.nextSibling); else doc.head.appendChild(s);
  }
})();
