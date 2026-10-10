/* Lit Neon v2 — help centre (brief §4.12; owner P6). The 20 help:true questions from data/faq.json are in the HTML
   (crawlable, each with its #q-<id> anchor); this module re-resolves every answer against the live registry (facts,
   rules, from-price, variants), then runs: live search across all categories with highlighted matches, topic chips
   that wrap on phones, a match count in a live region, an honest empty state that routes the query to us, deep links
   (help.html#q-id opens and scrolls; ?s= prefills), a copy-link button on every answer, popular shortcuts, the
   "Still stuck?" contact card (channels that exist only) and the FAQPage JSON-LD for all 20. data-qa="help.*". */
import { bootContent, applyTokens, answerOf, faqJsonLd, contactCard, copyLink, whenFonts, paintPrices, jsonLd, askHref, $, $$, t, esc, DATA, copy } from 'pages/info.js';

const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

(async function boot() {
  await bootContent('help', ['info', 'help'], { data: ['faq', 'designs'] });
  const qs = (DATA.faq.questions || []).filter(q => q.help);
  /* answers: live variant + live facts, written into the same data-t the generator rendered */
  qs.forEach(q => { const p = document.querySelector(`#${CSS.escape(q.id)} .cn-q__a`); if (p) p.dataset.t = answerOf(q); });
  applyTokens($('#hp-list'));
  $('#hp-contact').innerHTML = contactCard({ qa: 'help.contact', text: t('help.askText') });
  popular(qs);
  const search = searchUi(qs);
  bindCopy();
  deepLink(search);
  window.addEventListener('hashchange', () => deepLink(search));
  const ld = () => jsonLd(faqJsonLd(qs), 'ld-faq');
  ld(); whenFonts(() => { paintPrices(); ld(); search.refreshIndex(); });
  document.documentElement.dataset.ready = 'help';
})();

function popular(qs) {
  const ids = copy.get('help.popularIds') || [];
  const box = $('#hp-popular');
  box.insertAdjacentHTML('beforeend', ids.map(id => qs.find(q => q.id === id)).filter(Boolean).map(q => `<a class="c-chip c-chip--tag hp-pop" href="#${esc(q.id)}" data-qa="help.popular.link" data-id="${esc(q.id)}">${esc(q.q)}</a>`).join(''));
}

function searchUi(qs) {
  const input = $('#hp-q'); const clear = $('#hp-clear'); const chips = $$('.hp-chips [data-cat]');
  const count = $('#hp-count'); const empty = $('#hp-empty'); const groups = $$('.hp-group');
  const items = $$('#hp-list details.cn-q');
  const total = items.length;
  /* original HTML per item so highlights never stack */
  const orig = new Map(items.map(d => [d, { label: d.querySelector('summary .label').innerHTML, body: d.querySelector('.cn-q .prose').innerHTML }]));
  let index = new Map();
  const refreshIndex = () => {
    index = new Map(items.map(d => { const q = qs.find(x => x.id === d.id) || {}; return [d, norm([d.querySelector('summary .label').textContent, d.querySelector('.cn-q__a').textContent, (q.keywords || []).join(' '), (q.tags || []).join(' ')].join(' '))]; }));
    items.forEach(d => { orig.get(d).body = d.querySelector('.prose').innerHTML.replace(/<mark>|<\/mark>/g, ''); });
  };
  refreshIndex();
  let cat = 'all';
  chips.forEach(c => { const n = c.dataset.cat === 'all' ? total : items.filter(d => d.dataset.cat === c.dataset.cat).length; c.insertAdjacentHTML('beforeend', ` <span class="hp-chip__n">${n}</span>`); });
  const q0 = new URLSearchParams(location.search).get('s'); if (q0) input.value = q0.slice(0, 80);
  function highlight(el, terms) {
    if (!terms.length) return;
    const re = new RegExp(`(${terms.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const nodes = []; let n; while ((n = walk.nextNode())) nodes.push(n);
    nodes.forEach(node => {
      if (!re.test(node.nodeValue)) return; re.lastIndex = 0;
      const span = document.createElement('span'); span.innerHTML = esc(node.nodeValue).replace(re, '<mark>$1</mark>');
      node.replaceWith(...span.childNodes);
    });
  }
  function apply({ fromUser = true } = {}) {
    const raw = input.value.trim(); const terms = norm(raw).split(' ').filter(w => w.length > 1);
    clear.hidden = !raw;
    let n = 0;
    items.forEach(d => {
      const o = orig.get(d); d.querySelector('summary .label').innerHTML = o.label; d.querySelector('.prose').innerHTML = o.body;
      const inCat = cat === 'all' || d.dataset.cat === cat;
      const hay = index.get(d) || '';
      const ok = inCat && terms.every(w => hay.includes(w));
      d.hidden = !ok; if (ok) n++;
      if (ok && terms.length) { highlight(d.querySelector('summary .label'), terms); highlight(d.querySelector('.prose'), terms); }
    });
    /* a search opens the best matches so the answer is visible without a click; clearing closes them again */
    if (fromUser) items.forEach(d => { if (terms.length) d.open = !d.hidden && n <= 3; else if (!d.dataset.keep) d.open = false; });
    groups.forEach(g => { g.hidden = !g.querySelector('details.cn-q:not([hidden])'); });
    chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.cat === cat)));
    empty.hidden = n > 0;
    if (!n) {
      $('#hp-empty-t').textContent = raw ? t('help.emptyTitle', { q: raw }) : t('help.emptyTitle', { q: '' });
      const ask = $('#hp-empty-ask'); ask.href = askHref(`${t('help.askText')} ${raw}`.trim()); ask.textContent = raw ? t('help.emptyAsk', { q: raw.slice(0, 40) }) : t('common.form');
    }
    count.textContent = terms.length ? (n === 1 ? t('help.countMatchOne', { total, q: raw }) : t('help.countMatch', { n, total, q: raw })) : (n === 1 ? t('help.countOne') : t('help.count', { n }));
    const u = new URL(location.href); raw ? u.searchParams.set('s', raw) : u.searchParams.delete('s'); history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
  input.addEventListener('input', () => apply());
  input.addEventListener('keydown', e => { if (e.key === 'Escape' && input.value) { input.value = ''; apply(); } });
  $('#hp-search').addEventListener('submit', e => { e.preventDefault(); apply(); const first = items.find(d => !d.hidden); if (first) { first.open = true; first.querySelector('summary').focus(); } });
  clear.addEventListener('click', () => { input.value = ''; apply(); input.focus(); });
  $('#hp-empty-clear').addEventListener('click', () => { input.value = ''; cat = 'all'; apply(); input.focus(); });
  chips.forEach(c => c.addEventListener('click', () => { cat = c.dataset.cat; apply(); }));
  apply({ fromUser: !!q0 });
  return { reset() { input.value = ''; cat = 'all'; apply({ fromUser: false }); }, refreshIndex() { refreshIndex(); apply({ fromUser: false }); } };
}

function bindCopy() {
  $('#hp-list').addEventListener('click', e => {
    const b = e.target.closest('[data-copy-link]'); if (!b) return; e.preventDefault();
    const id = b.dataset.copyLink; copyLink(b, `/lit-neon-preview/help.html#${id}`);
    history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
  });
}

/* help.html#q-id: clear any filter that would hide it, open it, scroll it into view, mark it briefly */
function deepLink(search) {
  const id = decodeURIComponent(location.hash.slice(1)); if (!/^q-[\w-]+$/.test(id)) return;
  const d = document.getElementById(id); if (!d || !d.matches('details.cn-q')) return;
  if (d.hidden) search.reset();
  d.open = true; d.dataset.keep = '1'; d.classList.add('is-target');
  requestAnimationFrame(() => { d.scrollIntoView({ block: 'center' }); d.querySelector('summary').focus({ preventScroll: true }); });
  setTimeout(() => d.classList.remove('is-target'), 2400);
}
