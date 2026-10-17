/* core/chrome.js — the global chrome on every page (brief §4.0, §4.22, §3.7 consent):
   announcement bar (rotating, pausable, utility links) · header (wordmark, 6 nav items, two mega-menus, search,
   accent pill, WhatsApp/email/contact, basket with count, burger) · mobile drawer · search UI · sticky mobile CTA
   · footer (paper maker band + email-my-design + 5 columns + legal line from facts) · consent banner · review badge.

   Usage (any page):  import { mount } from './core/chrome.js';  mount({ page: 'home' });
   The page body may contain <div id="chrome-top"></div> and <div id="chrome-footer"></div>; otherwise the chrome is
   inserted at the start and end of <body>. <main id="main"> is the skip-link target.
   Optional peers (loaded if present, degraded honestly if not): core/pricing.js (promoLive, fromPrice),
   core/basket.js (count/open), core/router.js (builderLink, design store), core/search.js, core/forms.js, core/analytics.js. */

import * as copy from './copy.js';
import * as facts from './facts.js';
import * as clock from './clock.js';
import * as ui from './ui.js';
import { icon, esc, mini } from './ui.js';
import { announce as say, isTouch, trapFocus, lockScroll, unlockScroll, rememberFocus } from './a11y.js';

const ROOT = new URL('../../../', import.meta.url);
const url = p => new URL(p, ROOT).href;
const opt = async name => { try { return await import(new URL(`${name}.js`, import.meta.url).href); } catch { return null; } };

const NAV = [
  { id: 'design', href: 'create.html', pages: ['builder', 'create'] },
  { id: 'logo', href: 'business.html', pages: ['business', 'upload', 'bulk'] },
  { id: 'shop', href: 'shop.html', mega: 'shop', pages: ['shop', 'collection', 'product'] },
  { id: 'weddings', href: 'weddings.html', pages: ['weddings'] },
  { id: 'inspire', href: 'inspiration.html', mega: 'guides', pages: ['inspiration', 'guides', 'article'] },
  { id: 'help', href: 'help.html', pages: ['help', 'delivery', 'returns', 'contact'] },
];
const ROOMS = [['bedroom', 'collection.html?c=bedroom', 'bedroom'], ['kitchen', 'collection.html?c=kitchen', 'kitchen'], ['living', 'shop.html?room=living', null], ['bar', 'collection.html?c=bar', 'bar'], ['kids', 'collection.html?c=kids', 'kids'], ['gaming', 'collection.html?c=gaming', 'gaming']];
const OCCASIONS = [['wedding', 'collection.html?c=wedding', 'wedding'], ['party', 'shop.html?occasion=party', null], ['baby', 'shop.html?occasion=baby', 'kids'], ['christmas', 'collection.html?c=christmas', 'christmas', [9, 12]], ['halloween', 'collection.html?c=halloween', 'halloween', [8, 10]]];
const STYLES = [['names', 'collection.html?c=names', 'names'], ['quotes', 'shop.html?style=quotes', null], ['wall-art', 'collection.html?c=wall-art', 'wall-art'], ['love', 'shop.html?style=love', 'wedding']];
const SAMPLE = { living: ['Our happy place', 'soho', 'warm'], party: ['Cheers', 'leith', 'violet'], quotes: ['Good vibes only', 'brighton', 'pink'], love: ['Love', 'notting', 'candy'], baby: ['Oh baby', 'brighton', 'candy'] };
// Which pre-rendered card (assets/img/cards/<design>/{off,lit}-400.avif) fronts each menu row / collection tile — real
// sign-in-room renders, never a text-on-gradient placeholder. Keyed by menu row id first, then by collection id.
const TILE_DESIGN = { bedroom: 'sweet-dreams', kitchen: 'kettles-on', living: 'home-sweet-home', bar: 'the-local', kids: 'little-dreamer', gaming: 'game-on', wedding: 'happily-ever-after', party: 'cheers', baby: 'oh-baby', christmas: 'merry-and-bright', halloween: 'boo', names: 'the-patels', quotes: 'good-night-love', 'wall-art': 'moon', love: 'love-you-more', business: 'open-late', custom: 'lit' };
const cardImg = (design, frame) => url(`assets/img/cards/${design}/${frame}-400.avif`);

let state = { page: null, minimal: false, data: {}, peers: {}, promoLive: false, basketCount: 0 };
const dataCache = {};
async function data(name) {
  if (dataCache[name]) return dataCache[name];
  dataCache[name] = (async () => { try { const r = await fetch(url(`data/${name}.json`)); if (!r.ok) return []; const j = await r.json(); return Array.isArray(j) ? j : (j[name] || j.items || j.questions || j.pages || j.facts || []); } catch { return []; } })();
  return dataCache[name];
}
const pageOf = () => state.page || document.body.dataset.page || (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '').replace(/^index$/, 'home');
const sampleFor = (collections, id, fallback, designs = []) => {
  const design = TILE_DESIGN[fallback] || TILE_DESIGN[id];
  const d = design ? designs.find(x => x.id === design) : null;
  const imgs = design ? { img: cardImg(design, 'lit'), imgOff: cardImg(design, 'off') } : {}; // rest on the lit frame: an unlit sign is invisible at thumbnail size
  if (d) return { text: (d.lines || []).join(' ') || d.name, font: d.font || 'soho', colour: d.colour || 'pink', ...imgs };
  const c = collections.find(x => x.id === id); if (c) return { text: c.phrases?.[0] || c.name, font: c.defaults?.font || 'soho', colour: c.defaults?.colour || 'pink', ...imgs };
  const s = SAMPLE[fallback] || SAMPLE.living; return { text: s[0], font: s[1], colour: s[2], ...imgs };
};

/* ---- promo + basket + builder link via peers ---- */
async function promoLive() {
  const p = state.peers.pricing; if (p?.promoLive) { try { return !!p.promoLive(); } catch {} }
  const f = facts.promo(); return f.confirmed && clock.between(clock.now(), f.start, f.end);
}
function builderHref(text) {
  const r = state.peers.router;
  try { if (r?.builderLink) return r.builderLink(text ? { text } : undefined); } catch {}
  return text ? url(`create.html?text=${encodeURIComponent(text)}`) : url('create.html');
}
function basketCount() {
  const b = state.peers.basket;
  /* the badge counts SIGNS (sum of quantities), not lines: one line × 10 reads "10", like the basket's "Signs (10)" */
  const sumQty = arr => (Array.isArray(arr) ? arr : []).reduce((n, l) => n + Math.max(1, +(l && l.qty) || 1), 0);
  try { if (b?.signs) return b.signs(); if (b?.lines) return sumQty(b.lines()); if (b?.count) return b.count(); } catch {}
  try { const raw = localStorage.getItem('basket') || localStorage.getItem('litneon.basket'); if (raw) { const j = JSON.parse(raw); return sumQty(Array.isArray(j) ? j : (j.lines || j.items || [])); } } catch {}
  return 0;
}
function contactHref(text) {
  if (facts.has('whatsappNumber')) { const n = String(facts.value('whatsappNumber')).replace(/\D/g, ''); return { href: `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`, kind: 'whatsapp', label: copy.t('nav.whatsapp', {}, 'Message us on WhatsApp'), icon: 'whatsapp', external: true }; }
  if (facts.has('supportEmail')) return { href: `mailto:${facts.value('supportEmail')}${text ? `?subject=${encodeURIComponent(text)}` : ''}`, kind: 'email', label: copy.t('nav.email', {}, 'Email us'), icon: 'mail' };
  return { href: url('contact.html'), kind: 'contact', label: copy.t('nav.contact', {}, 'Contact us'), icon: 'chat' };
}
let markP = null; const wordmark = () => markP || (markP = (async () => { try { const r = await fetch(url('assets/img/brand/litneon-logo.svg') + '?v=5', { cache: 'no-cache' });   /* versioned: phones held the old mark for 10 min behind the CDN cache */ if (r.ok) return (await r.text()).replace(/<\?xml[^>]*>/, '').replace(/ width="390" height="152"/, ''); } catch {} return `<img src="${url('assets/img/brand/litneon-logo-static.svg')}" alt="Lit Neon" width="390" height="152" decoding="async">`; })()); /* world round 3: the wordmark is inlined so its glow filter and draw-on animation run on every browser (an <img> SVG loses both on iOS) */

/* =========================== announcement =========================== */
function announceBar(live) {
  const msgs = [];
  msgs.push(copy.t('announce.promo', { pct: 10, code: 'LIT10' }, '10% off your first sign · code LIT10'));   /* world 2026-10-15: the first-order code leads the bar */
  msgs.push(copy.t('announce.free', {}, 'Free delivery across mainland GB'), copy.t('announce.proof', {}, 'You approve a drawing before we make anything'));
  const el = document.createElement('div'); el.className = 'ch-announce'; el.setAttribute('data-qa', 'chrome.announce'); el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Announcements');
  const track = msgs.map(mm => `<span>${esc(mm)}</span>`).join('<i aria-hidden="true">·</i>');
  el.innerHTML = `<div class="wrap"><div class="ch-announce__rot"><div class="ch-marquee" data-qa="chrome.announce.msg" aria-label="${esc(msgs.join('. '))}"><div class="ch-marquee__track" style="--marquee-d:${Math.max(22, msgs.join(' ').length * .32)}s"><span class="ch-marquee__set">${track}</span><i aria-hidden="true">·</i><span class="ch-marquee__set" aria-hidden="true">${track}</span><i aria-hidden="true">·</i></div></div><button type="button" class="ch-announce__pause" data-qa="chrome.announce.pause" aria-pressed="false" aria-label="${esc(copy.t('announce.pause', {}, 'Pause announcements'))}">${icon('pause')}</button></div><nav class="ch-announce__util" aria-label="Utility"><a href="${url('bulk-quote.html')}" data-qa="chrome.announce.bulk">${esc(copy.t('announce.bulk', {}, 'Bulk quotes'))}</a><a href="${url('help.html')}" data-qa="chrome.announce.help">${esc(copy.t('announce.help', {}, 'Help'))}</a></nav></div>`;
  const btn = el.querySelector('.ch-announce__pause');
  let paused = ui.prefersReducedMotion();
  const paint = () => { el.classList.toggle('is-paused', paused); btn.setAttribute('aria-pressed', String(paused)); btn.setAttribute('aria-label', copy.t(paused ? 'announce.play' : 'announce.pause', {}, paused ? 'Resume' : 'Pause')); btn.innerHTML = icon(paused ? 'play' : 'pause'); };
  btn.addEventListener('click', () => { paused = !paused; paint(); });
  paint();
  return el;
}

/* =========================== header =========================== */
async function header() {
  const page = pageOf();
  const el = document.createElement('header'); el.className = 'ch-header' + (state.minimal ? ' ch-header--minimal' : ''); el.setAttribute('data-qa', 'chrome.header');
  const navHtml = NAV.map(n => {
    const current = n.pages.includes(page) ? ' aria-current="page"' : '';
    const megaAttrs = n.mega ? ` aria-haspopup="true" aria-expanded="false" aria-controls="mega-${n.mega}" data-mega="${n.mega}"` : '';
    return `<li><a class="ch-nav__link" href="${url(n.href)}" data-qa="chrome.nav.${n.id}"${current}${megaAttrs}>${esc(copy.t(`nav.${n.id}`))}${n.mega ? icon('chevron-down') : ''}</a></li>`;
  }).join('');
  const contact = contactHref();
  el.innerHTML = `<div class="wrap">
  <a class="ch-brand" href="${url('index.html')}" data-qa="chrome.brand" aria-label="Lit Neon — home">${await wordmark()}</a>
  <nav class="ch-nav-wrap" aria-label="Primary"><ul class="ch-nav">${navHtml}</ul></nav>
  <div class="ch-util">
    <div class="ch-search" data-qa="chrome.search">
      <div class="ch-search__field"><label class="sr-only" for="ch-search-input">${esc(copy.t('nav.search', {}, 'Search'))}</label><span class="ch-search__ic" aria-hidden="true">${icon('search')}</span><input id="ch-search-input" tabindex="-1" class="c-input" type="search" autocomplete="off" spellcheck="false" placeholder="${esc(copy.t('nav.searchPlaceholder', {}, 'Search'))}" data-qa="chrome.search.input" aria-controls="ch-search-results" aria-expanded="false" role="combobox" aria-autocomplete="list"></div>
      <button type="button" class="c-btn c-btn--icon ch-search__btn" data-qa="chrome.search.toggle" aria-label="${esc(copy.t('nav.search', {}, 'Search'))}" aria-expanded="false">${icon('search')}</button>
      <div id="ch-search-results" class="ch-results" role="listbox" hidden data-qa="chrome.search.results"></div>
      <div class="ch-search__idle" data-qa="chrome.search.popular"><p class="ch-search__idle-h">${esc(copy.t('search.popularLabel', {}, 'Popular searches'))}</p><div class="ch-search__chips">${(Array.isArray(copy.get('search.popular')) ? copy.get('search.popular') : []).map(q => `<button type="button" class="c-chip" data-q="${esc(q)}" data-qa="chrome.search.popular.chip">${esc(q)}</button>`).join('')}</div><p class="ch-search__idle-hint">${esc(copy.t('search.hint'))}</p></div>
    </div>
    <a class="ch-pill" href="${url('upload.html')}" data-qa="chrome.pill">${esc(copy.t('nav.pill', {}, 'Free mockup in 12h'))}</a>
    <a class="c-btn c-btn--icon ch-whatsapp" href="${contact.href}" data-qa="chrome.whatsapp" data-kind="${contact.kind}" aria-label="${esc(contact.label)}" ${contact.external ? 'target="_blank" rel="noopener"' : ''}>${icon(contact.icon)}</a>
    <button type="button" class="c-btn c-btn--icon ch-basket" data-qa="chrome.basket" aria-label="${esc(copy.t('nav.basket', {}, 'Basket'))}">${icon('basket')}<span class="ch-basket__count" data-qa="chrome.basket.count" data-count="0" aria-hidden="true">0</span></button>
    <button type="button" class="c-btn c-btn--icon ch-burger" data-qa="chrome.burger" aria-label="${esc(copy.t('nav.menu', {}, 'Menu'))}" aria-expanded="false" aria-haspopup="dialog">${icon('menu')}</button>
  </div></div>`;
  return el;
}

/* =========================== mega-menus =========================== */
function megaItem(href, label, sample, qaId, sub) {
  return `<li><a class="ch-mega__item" href="${esc(href)}" data-qa="chrome.megamenu.link" data-id="${esc(qaId)}">${mini({ ...sample, lit: false, eager: true })}<span class="meta"><span>${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</span></a></li>`;
}
async function megaShop(el) {
  const [collections, designsRaw] = await Promise.all([data('collections'), data('designs')]);
  const designs = designsRaw;
  const now = clock.now();
  const col = (title, rows, group) => `<div><h3>${esc(title)}</h3><ul>${rows.map(([id, href, cid, season]) => {
    if (season && !clock.inSeason(season[0], season[1], now)) return '';
    const s = sampleFor(collections, cid, id, designs);
    return megaItem(url(href), copy.t(`mega.${group}.${id}`, {}, id), s, `${group}.${id}`);
  }).join('')}</ul></div>`;
  const best = designs.filter(d => d.bestseller).sort((a, b) => (a.bestsellerRank || 99) - (b.bestsellerRank || 99)).slice(0, 4);
  const bestHtml = `<div><h3>${esc(copy.t('mega.best', {}, 'Bestsellers'))}</h3><div class="ch-mega__best">${best.map(d => `<a class="c-card" href="${url(`product.html?id=${encodeURIComponent(d.id)}`)}" data-qa="chrome.megamenu.best" data-id="${esc(d.id)}"><span class="media">${mini({ text: (d.lines || []).join(' ') || d.name, font: d.font, colour: d.colour, img: url(`assets/img/cards/${d.id}/lit-400.avif`), lit: true, large: true, eager: true })}</span><span class="title">${esc(d.name)}</span></a>`).join('')}</div></div>`;
  el.innerHTML = `<div class="wrap">${col(copy.t('mega.room', {}, 'By room'), ROOMS, 'rooms')}${col(copy.t('mega.occasion', {}, 'By occasion'), OCCASIONS, 'occasions')}${col(copy.t('mega.style', {}, 'By style'), STYLES, 'styles')}${bestHtml}<div class="ch-mega__foot"><a href="${url('shop.html')}" data-qa="chrome.megamenu.shop.all">${esc(copy.t('mega.all', {}, 'All designs'))} ${icon('arrow-right')}</a><span class="t-caption">${esc(facts.get('deliveryFree') ? copy.t('announce.free', {}, 'Free delivery across mainland GB') : '')}</span></div></div>`;
}
async function megaGuides(el) {
  const guides = await data('guides');
  const tiles = [['rooms', 'inspiration.html', { text: 'Stay in bed', font: 'soho', colour: 'pink', img: cardImg('stay-in-bed', 'lit'), eager: true }], ['weddings', 'inspiration.html?use=wedding', { text: 'Better together', font: 'notting', colour: 'warm', img: cardImg('better-together', 'lit'), eager: true }], ['business', 'inspiration.html?use=business', { text: 'Open late', font: 'shoreditch', colour: 'red', img: cardImg('open-late', 'lit'), eager: true }]];
  el.innerHTML = `<div class="wrap"><div><h3>${esc(copy.t('mega.gallery', {}, 'Gallery'))}</h3><div class="ch-mega__gallery">${tiles.map(([id, href, s]) => `<a href="${url(href)}" data-qa="chrome.megamenu.gallery" data-id="${id}">${mini({ ...s, lit: true })}<span>${esc(copy.t(`mega.galleryTiles.${id}`, {}, id))}</span></a>`).join('')}</div></div>
  <div><h3>${esc(copy.t('mega.guides', {}, 'Guides'))}</h3><ul class="ch-mega__guides">${guides.map(g => `<li><a href="${url(g.href || `guides/${g.slug}.html`)}" data-qa="chrome.megamenu.guide" data-id="${esc(g.slug)}">${esc(g.title)}</a></li>`).join('')}</ul></div>
  <div class="ch-mega__foot"><a href="${url('guides.html')}" data-qa="chrome.megamenu.guides.all">${esc(copy.t('mega.allGuides', {}, 'All guides'))} ${icon('arrow-right')}</a></div></div>`;
}
function wireMegas(headerEl) {
  const megas = {};
  for (const id of ['shop', 'guides']) {
    const m = document.createElement('div'); m.className = `ch-mega ch-mega--${id}`; m.id = `mega-${id}`; m.setAttribute('data-qa', `chrome.megamenu.${id}`); m.setAttribute('role', 'region'); m.setAttribute('aria-label', id === 'shop' ? copy.t('nav.shop') : copy.t('nav.inspire'));
    m.innerHTML = '<div class="wrap"></div>'; headerEl.appendChild(m); megas[id] = { el: m, filled: false, trigger: headerEl.querySelector(`[data-mega="${id}"]`) };
  }
  let openId = null, intent = null, closeTimer = null;
  async function fill(id) { const m = megas[id]; if (m.filled) return; m.filled = true; await (id === 'shop' ? megaShop(m.el) : megaGuides(m.el)); }
  async function open(id) {
    clearTimeout(closeTimer);
    if (openId && openId !== id) close(openId, false);
    await fill(id); const m = megas[id]; m.el.classList.add('is-open'); m.trigger.setAttribute('aria-expanded', 'true'); openId = id;
  }
  function close(id = openId, restore = true) { if (!id) return; const m = megas[id]; m.el.classList.remove('is-open'); m.trigger.setAttribute('aria-expanded', 'false'); if (openId === id) openId = null; if (restore && restore !== false && document.activeElement && m.el.contains(document.activeElement)) m.trigger.focus(); }
  const scheduleClose = () => { clearTimeout(closeTimer); closeTimer = setTimeout(() => close(), 180); };
  for (const [id, m] of Object.entries(megas)) {
    const t = m.trigger;
    t.addEventListener('pointerenter', e => { if (e.pointerType === 'touch') return; clearTimeout(closeTimer); fill(id); intent = setTimeout(() => open(id), 150); });
    t.addEventListener('pointerleave', () => { clearTimeout(intent); scheduleClose(); });
    m.el.addEventListener('pointerenter', () => clearTimeout(closeTimer)); m.el.addEventListener('pointerleave', scheduleClose);
    t.addEventListener('click', e => { if (openId !== id) { e.preventDefault(); open(id); } /* second click follows the link */ });
    t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); openId === id ? close(id) : open(id).then(() => m.el.querySelector('a')?.focus()); } });
    m.el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(id); } });
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && openId) close(); });
  document.addEventListener('pointerdown', e => { if (openId && !headerEl.contains(e.target)) close(openId, false); });
  document.addEventListener('focusin', e => { if (openId && !headerEl.contains(e.target)) close(openId, false); });
  return { open, close, megas };
}

/* =========================== search =========================== */
async function buildIndex() {
  const [designs, collections, guides, faq] = await Promise.all([data('designs'), data('collections'), data('guides'), data('faq')]);
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const items = [];
  designs.forEach(d => items.push({ type: 'designs', id: d.id, title: d.name, sub: ((d.lines || []).join(' / ') === d.name ? '' : (d.lines || []).join(' / ')), href: url(`product.html?id=${encodeURIComponent(d.id)}`), hay: norm([d.name, ...(d.lines || []), ...(d.collections || []), ...Object.values(d.tags || {}).flat(), d.colour, d.font].join(' ')), mini: { text: (d.lines || []).join(' ') || d.name, font: d.font, colour: d.colour } }));
  collections.filter(c => !c.redirect || c.id !== 'custom').forEach(c => items.push({ type: 'collections', id: c.id, title: c.name, sub: c.intro ? c.intro.split('. ')[0] : '', href: url(c.redirect || `collection.html?c=${c.id}`), hay: norm([c.name, c.h1, c.eyebrow, ...(c.phrases || []), c.nav].join(' ')), mini: sampleFor(collections, c.id) }));
  guides.forEach(g => items.push({ type: 'guides', id: g.slug, title: g.title, sub: g.readingMinutes ? `${g.readingMinutes} min read` : '', href: url(g.href || `guides/${g.slug}.html`), hay: norm([g.title, g.excerpt, g.category].join(' ')) }));
  /* FAQs link where they are actually rendered (search.faqHref: help.html only for help:true, else the hub page that
     shows them); a question with nowhere to land is skipped, never a dead help.html#anchor (round-2 review) */
  const fh = typeof state.peers.search?.faqHref === 'function' ? state.peers.search.faqHref : (q => (q.help ? `/lit-neon-preview/rework/help.html#${encodeURIComponent(q.id)}` : null));
  faq.forEach(q => { let h = null; try { h = fh(q); } catch {} if (!h) return; items.push({ type: 'help', id: q.id, title: q.q, sub: '', href: url(String(h).replace(/^\//, '')), hay: norm([q.q, q.a, q.category, ...(q.tags || [])].join(' ')) }); });
  return { items, norm };
}
let indexPromise = null;
async function query(q) {
  const s = state.peers.search; if (s?.query) { try { const r = await s.query(q); if (r) return r; } catch {} }
  indexPromise ||= buildIndex(); const { items, norm } = await indexPromise;
  const terms = norm(q).split(/\s+/).filter(Boolean); if (!terms.length) return { designs: [], collections: [], guides: [], help: [] };
  const score = it => terms.reduce((n, t) => n + (norm(it.title).includes(t) ? 3 : 0) + (it.hay.includes(t) ? 1 : 0), 0);
  const out = { designs: [], collections: [], guides: [], help: [] };
  items.map(it => [score(it), it]).filter(([n]) => n > 0).sort((a, b) => b[0] - a[0]).forEach(([, it]) => { if (out[it.type].length < (it.type === 'designs' ? 6 : 4)) out[it.type].push(it); });
  return out;
}
function renderResults(box, res, q) {
  const groups = ['designs', 'collections', 'guides', 'help'].filter(g => res[g]?.length);
  let html = groups.map(g => `<div class="ch-results__group"><h3>${esc(copy.t(`search.${g}`, {}, g))}</h3>${res[g].map(it => `<a class="ch-results__item" role="option" href="${esc(it.href)}" data-qa="chrome.search.result" data-type="${g}" data-id="${esc(it.id)}">${it.mini ? mini({ ...it.mini, lit: true }) : `<span class="c-mini is-off" aria-hidden="true">${icon(g === 'guides' ? 'drawing' : 'info')}</span>`}<span><span class="t">${esc(it.title)}</span>${it.sub ? `<span class="s"> · ${esc(it.sub)}</span>` : ''}</span></a>`).join('')}</div>`).join('');
  if (!groups.length) html += `<p class="ch-results__empty">${esc(copy.t('search.empty'))}</p>`;
  html += `<a class="ch-results__item ch-results__item--design-it" role="option" href="${esc(builderHref(q))}" data-qa="chrome.search.designit">${icon('pencil')}<span>${esc(copy.t('search.designIt', { query: q }, `Design “${q}” as a sign`))}</span>${icon('arrow-right')}</a>`;
  box.innerHTML = html; box.hidden = false;
}
function wireSearch(headerEl) {
  // One search field at every width (QA: the hook chrome.search.input is always the field the shopper types into).
  // ≥1024: the field expands to 320 px in the header with a results popover. <1024: the same field opens as a
  // full-screen search panel (input + close on top, popular searches, results filling the rest of the viewport).
  const wrapEl = headerEl.querySelector('.ch-search'), input = headerEl.querySelector('#ch-search-input'), btn = headerEl.querySelector('.ch-search__btn'), box = headerEl.querySelector('#ch-search-results');
  const label = copy.t('nav.search', {}, 'Search'), closeLabel = copy.t('search.close', {}, 'Close search');
  let debounce = null, active = -1, panel = null;
  const mq = matchMedia('(min-width: 1024px)');
  const desktop = () => mq.matches;
  const isOpen = () => wrapEl.classList.contains('is-open');
  const items = () => Array.from(box.querySelectorAll('[role="option"]'));
  function setActive(k) { const list = items(); list.forEach((el, i) => el.setAttribute('aria-selected', String(i === k))); active = k; if (list[k]) { input.setAttribute('aria-activedescendant', list[k].id ||= 'ch-opt-' + k); list[k].scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant'); }
  function clearResults() { box.hidden = true; box.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); wrapEl.classList.remove('has-query'); active = -1; }
  async function run(q) {
    const res = await query(q);
    if (input.value.trim() !== q) return;                       // a newer keystroke won
    renderResults(box, res, q); input.setAttribute('aria-expanded', 'true'); wrapEl.classList.add('has-query'); active = -1;
  }
  input.addEventListener('input', () => {
    if (!isOpen()) open({ focus: false });
    clearTimeout(debounce); const q = input.value.trim();
    if (!q) { clearResults(); return; }
    debounce = setTimeout(() => run(q), 120);
  });
  input.addEventListener('keydown', e => {
    const list = items();
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(list.length - 1, active + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, active - 1)); }
    else if (e.key === 'Enter') { const t = list[active] || (input.value.trim() && box.querySelector('.ch-results__item--design-it')); if (t) { e.preventDefault(); location.href = t.href; } }
  });
  wrapEl.addEventListener('keydown', e => { if (e.key !== 'Escape' || !isOpen()) return; e.preventDefault(); e.stopPropagation(); if (input.value && desktop() && document.activeElement === input) { input.value = ''; clearResults(); } else close(); });
  // focusing the field (keyboard, a programmatic focus, an autofill) always opens it, so it is never typed into unseen
  input.addEventListener('focus', () => { if (!isOpen()) open({ focus: false }); else if (input.value.trim() && box.innerHTML) box.hidden = false; });
  wrapEl.querySelectorAll('.ch-search__chips [data-q]').forEach(chip => chip.addEventListener('click', () => { input.value = chip.dataset.q; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus({ preventScroll: true }); }));
  function setBtn(openNow) {
    btn.setAttribute('aria-expanded', String(openNow));
    const asClose = openNow && !desktop();
    btn.setAttribute('aria-label', asClose ? closeLabel : label);
    btn.innerHTML = icon(asClose ? 'close' : 'search');
  }
  function open({ focus = true } = {}) {
    if (isOpen()) { if (focus) input.focus({ preventScroll: true }); return; }
    wrapEl.classList.add('is-open'); headerEl.classList.add('is-searching'); input.tabIndex = 0; setBtn(true);
    if (!desktop()) {
      const restore = rememberFocus();
      wrapEl.classList.add('is-panel'); document.documentElement.classList.add('ch-search-open');
      wrapEl.setAttribute('role', 'dialog'); wrapEl.setAttribute('aria-modal', 'true'); wrapEl.setAttribute('aria-label', copy.t('search.title', {}, 'Search'));
      lockScroll();
      const release = trapFocus(wrapEl, { initial: false });
      panel = { restore, release };
    }
    if (input.value.trim() && box.innerHTML) box.hidden = false;
    if (focus) { if (desktop()) setTimeout(() => input.focus({ preventScroll: true }), 50); else input.focus({ preventScroll: true }); }
  }
  function close({ restoreFocus = true } = {}) {
    if (!isOpen()) return;
    clearTimeout(debounce);
    wrapEl.classList.remove('is-open'); headerEl.classList.remove('is-searching'); input.tabIndex = -1; box.hidden = true; input.setAttribute('aria-expanded', 'false'); setBtn(false);
    if (panel) {
      wrapEl.classList.remove('is-panel'); document.documentElement.classList.remove('ch-search-open');
      wrapEl.removeAttribute('role'); wrapEl.removeAttribute('aria-modal'); wrapEl.removeAttribute('aria-label');
      unlockScroll(); panel.release(); const { restore } = panel; panel = null;
      if (restoreFocus) restore(); else input.blur();
    } else if (document.activeElement === input) input.blur();
  }
  btn.addEventListener('click', () => {
    if (!isOpen()) return open();
    if (!desktop()) return close();
    if (!input.value) close(); else input.focus();
  });
  // following a result closes the panel (same-page hash links would otherwise leave it covering the page)
  box.addEventListener('click', e => { if (e.target.closest('a[href]')) close({ restoreFocus: false }); });
  document.addEventListener('pointerdown', e => { if (!panel && isOpen() && !wrapEl.contains(e.target)) { if (!input.value) close({ restoreFocus: false }); else box.hidden = true; } });
  // crossing the breakpoint with search open: start again in the right mode
  mq.addEventListener('change', () => { if (isOpen()) close({ restoreFocus: false }); setBtn(false); });
  window.addEventListener('pageshow', e => { if (e.persisted && isOpen()) close({ restoreFocus: false }); });
  return { open, close };
}

/* =========================== mobile drawer =========================== */
async function navDrawer(headerEl) {
  const burger = headerEl.querySelector('.ch-burger');
  let dr = null;
  async function build() {
    const [collections, designs] = await Promise.all([data('collections'), data('designs')]);
    const now = clock.now();
    const sub = (title, rows, group) => `<h4>${esc(title)}</h4>${rows.map(([id, href, cid, season]) => (season && !clock.inSeason(season[0], season[1], now)) ? '' : `<a href="${url(href)}" data-qa="chrome.drawer.link">${mini({ ...sampleFor(collections, cid, id, designs), lit: false })}<span>${esc(copy.t(`mega.${group}.${id}`, {}, id))}</span></a>`).join('')}`;
    const guides = await data('guides');
    const contact = contactHref();
    const leadTime = facts.has('leadTimeDays') ? (() => { const v = facts.value('leadTimeDays'); return v && typeof v === 'object' ? `${v.min}–${v.max} working days` : String(v); })() : '';
    const body = `
<a class="ch-drawer__row" href="${url('create.html')}" data-qa="chrome.drawer.link">${esc(copy.t('nav.design'))}${icon('arrow-right')}</a>
<a class="ch-drawer__row" href="${url('business.html')}" data-qa="chrome.drawer.link">${esc(copy.t('nav.logo'))}${icon('arrow-right')}</a>
<details data-qa="chrome.drawer.shop"><summary class="ch-drawer__row">${esc(copy.t('nav.shop'))}${icon('chevron-down')}</summary><div class="ch-drawer__sub">${sub(copy.t('mega.room'), ROOMS, 'rooms')}${sub(copy.t('mega.occasion'), OCCASIONS, 'occasions')}${sub(copy.t('mega.style'), STYLES, 'styles')}<a href="${url('shop.html')}" data-qa="chrome.drawer.link"><strong>${esc(copy.t('mega.all'))} →</strong></a></div></details>
<a class="ch-drawer__row" href="${url('weddings.html')}" data-qa="chrome.drawer.link">${esc(copy.t('nav.weddings'))}${icon('arrow-right')}</a>
<details data-qa="chrome.drawer.inspire"><summary class="ch-drawer__row">${esc(copy.t('nav.inspire'))}${icon('chevron-down')}</summary><div class="ch-drawer__sub"><a href="${url('inspiration.html')}" data-qa="chrome.drawer.link">${esc(copy.t('mega.gallery'))}</a><h4>${esc(copy.t('mega.guides'))}</h4>${guides.map(g => `<a href="${url(g.href || `guides/${g.slug}.html`)}" data-qa="chrome.drawer.link">${esc(g.title)}</a>`).join('')}<a href="${url('guides.html')}" data-qa="chrome.drawer.link"><strong>${esc(copy.t('mega.allGuides'))} →</strong></a></div></details>
<a class="ch-drawer__row" href="${url('bulk-quote.html')}" data-qa="chrome.drawer.link">${esc(copy.t('drawer.bulk'))}${icon('arrow-right')}</a>
<a class="ch-drawer__row" href="${url('help.html')}" data-qa="chrome.drawer.link">${esc(copy.t('drawer.help'))}${icon('arrow-right')}</a>
<div class="ch-drawer__contact"><a href="${contact.href}" data-qa="chrome.drawer.contact" ${contact.external ? 'target="_blank" rel="noopener"' : ''}>${icon(contact.icon)}<span>${esc(contact.label)}${facts.has('supportHours') ? `<span class="hours">${esc(copy.t('drawer.hours', { hours: facts.get('supportHours') }))}</span>` : ''}</span></a>${facts.has('whatsappNumber') && facts.has('supportEmail') ? `<a href="mailto:${esc(facts.value('supportEmail'))}" data-qa="chrome.drawer.email">${icon('mail')}<span>${esc(facts.value('supportEmail'))}</span></a>` : ''}</div>
${facts.has('deliveryFree') ? `<p class="ch-drawer__free">${icon('truck')}<span>${esc(copy.t('drawer.free', { leadTime }).replace(/, $/, ''))}</span></p>` : ''}
<div class="ch-drawer__ctas"><a class="c-btn c-btn--primary c-btn--lg" href="${builderHref()}" data-qa="chrome.drawer.cta">${esc(copy.t('drawer.design'))}</a><a class="c-btn c-btn--ghost" href="${url('upload.html')}" data-qa="chrome.drawer.mockup">${esc(copy.t('drawer.mockup'))}</a></div>`;
    dr = ui.drawer({ title: copy.t('drawer.title', {}, 'Menu'), nav: true, qa: 'chrome.drawer', body, onOpen: () => burger.setAttribute('aria-expanded', 'true'), onClose: () => burger.setAttribute('aria-expanded', 'false') });
    dr.el.querySelector('[data-close]').setAttribute('data-qa', 'chrome.drawer.close');
    dr.el.querySelectorAll('[data-qa="chrome.drawer.link"]').forEach((a, i) => a.setAttribute('data-index', String(i)));
  }
  burger.addEventListener('click', async () => { if (!dr) await build(); dr.open(burger); });
  return { open: async () => { if (!dr) await build(); dr.open(burger); }, close: () => dr?.close() };
}

/* =========================== sticky mobile CTA =========================== */
function stickyCta() {
  const page = pageOf();
  // Pages that are themselves a journey (a form, a basket, a checkout) never get the global "Design your sign" push:
  // it would pull the shopper out of what they are doing. A page may instead opt in to its OWN sticky action with
  // <body data-sticky-cta="Request my free mockup" data-sticky-cta-target="#mockup-form"> (target = selector to scroll to, or an href).
  const own = document.body.dataset.stickyCta;
  if (!own && ['builder', 'create', 'checkout', 'gift', 'upload', 'bulk', 'bulk-quote', 'contact', 'basket'].includes(page)) return null;
  const el = document.createElement('div'); el.className = 'ch-stickycta'; el.setAttribute('data-qa', 'chrome.stickycta');
  const target = document.body.dataset.stickyCtaTarget || '';
  const node = own && target ? (() => { try { return document.querySelector(target); } catch { return null; } })() : null;
  // href is always real: an in-page anchor to the target's id, an external href, or the builder (never a bare "#")
  const ownHref = node ? `#${node.id || (node.id = 'sticky-cta-target')}` : (target || builderHref());
  el.innerHTML = own
    ? `<a class="c-btn c-btn--primary" href="${esc(ownHref)}" data-qa="chrome.stickycta.link" data-own="1">${esc(own)} ${icon('arrow-right')}</a>`
    : `<a class="c-btn c-btn--primary" href="${builderHref()}" data-qa="chrome.stickycta.link">${esc(copy.t('stickycta.label', {}, 'Design your sign'))} ${icon('arrow-right')}</a>`;
  document.body.appendChild(el);
  if (node) {
    el.querySelector('a').addEventListener('click', e => { e.preventDefault(); node.scrollIntoView({ behavior: (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'), block: 'start' }); const f = node.matches('input,textarea,select,button,a') ? node : node.querySelector('input:not([type=hidden]),textarea,select,button'); setTimeout(() => f?.focus({ preventScroll: true }), 400); });
  }
  let heroOut = false, footerNear = false, keyboard = false;
  const paint = () => { const show = heroOut && !footerNear && !keyboard && matchMedia('(max-width: 767px)').matches; el.classList.toggle('is-visible', show); document.body.classList.toggle('has-stickycta', show); };
  const hero = document.querySelector('[data-hero], .hero, main > section:first-of-type, main > :first-child');
  if (hero) new IntersectionObserver(([e]) => { heroOut = !e.isIntersecting && e.boundingClientRect.bottom < 0; paint(); }, { threshold: 0 }).observe(hero); else { heroOut = true; }
  const footer = document.querySelector('.ch-footer');
  if (footer) new IntersectionObserver(([e]) => { footerNear = e.isIntersecting; paint(); }, { rootMargin: '200px 0px 0px 0px', threshold: 0 }).observe(footer);
  const vv = window.visualViewport;
  let baseH = window.innerHeight, typing = false;
  const onVV = () => { baseH = Math.max(baseH, window.innerHeight); const h = vv ? vv.height : window.innerHeight; keyboard = typing || h < baseH * 0.75; paint(); };
  vv?.addEventListener('resize', onVV); window.addEventListener('resize', onVV);
  document.addEventListener('focusin', e => { typing = !!e.target.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, [contenteditable]'); setTimeout(onVV, 50); });
  document.addEventListener('focusout', () => { typing = false; setTimeout(onVV, 50); });
  paint();
  // the router design store may change the link (sources: hero, builder)
  document.addEventListener('ln:design', () => { el.querySelector('a').href = builderHref(); });
  return el;
}

/* =========================== footer =========================== */
let paperP = null; const paperMarkSvg = () => paperP || (paperP = Promise.resolve(`<img src="${url('assets/img/brand/litneon-logo-static.svg')}" alt="" width="390" height="152" loading="lazy" decoding="async">`));
async function footer() {
  const el = document.createElement('footer'); el.className = 'ch-footer'; el.setAttribute('data-qa', 'chrome.footer'); el.setAttribute('role', 'contentinfo');
  const paperMark = await paperMarkSvg();
  const town = facts.has('workshopTown') ? facts.value('workshopTown') : null;
  const makerLine = town ? copy.t('footer.makerIn', { town }) : copy.t('footer.maker', {}, 'Made in a UK workshop');
  const note = facts.has('founderNote') ? facts.get('founderNote') : '';
  const contact = contactHref();
  const L = (href, key, qa) => `<li><a href="${url(href)}" data-qa="chrome.footer.link" data-id="${qa || key}">${esc(copy.t(`footer.links.${key}`))}</a></li>`;
  const hours = facts.has('replyHours') ? copy.t('footer.replies', { hours: facts.get('replyHours') }) : (facts.has('supportHours') ? facts.get('supportHours') : '');
  const legalParts = { company: facts.has('companyName') ? `${facts.value('companyName')}` : '', number: facts.has('companyNumber') ? copy.t('footer.legalNumber', { number: facts.value('companyNumber') }) : '', address: facts.has('registeredAddress') ? copy.t('footer.legalAddress', { address: facts.value('registeredAddress') }) : '' };
  let legal = copy.t('footer.legal', legalParts); if (legalParts.company) legal = legal.replace(/^([^.]+?)(Prices in £)/, '$1. $2');
  const year = clock.now().getFullYear();
  el.innerHTML = `
<section class="ch-footer__maker night" aria-labelledby="ch-maker-h">
  <div class="wrap">
    <div><div class="brand" aria-hidden="true">${paperMark}</div><p class="t-eyebrow">${esc(copy.t('footer.makerEyebrow', {}, 'Made here'))}</p><h2 id="ch-maker-h">${esc(makerLine)}${facts.chip('workshopTown')}</h2>${note ? `<p>${esc(note)}${facts.chip('founderNote')}</p>` : ''}<ul class="facts" data-qa="chrome.footer.facts">${facts.has('madeInUK') ? `<li>${icon('drawing')}${esc(copy.t('announce.proof', {}, 'You approve a drawing before we make anything'))}</li>` : ''}${facts.has('warrantyYears') ? `<li>${icon('shield')}${esc(facts.get('warrantyYears'))}</li>` : ''}${facts.has('deliveryFree') ? `<li>${icon('truck')}${esc(copy.t('announce.free', {}, 'Free delivery across mainland GB'))}</li>` : ''}</ul></div>
    <div class="ch-footer__save" data-qa="chrome.footer.save">
      <p class="t-eyebrow">${esc(copy.t('footer.saveTitle', {}, 'Email me my design'))}</p>
      <div class="words" data-qa="chrome.footer.save.words" aria-live="polite"></div>
      <form novalidate data-qa="chrome.footer.save.form">
        <div class="c-field"><label class="sr-only" for="ch-save-email">${esc(copy.t('footer.saveEmail', {}, 'Your email'))}</label><input id="ch-save-email" class="c-input" type="email" inputmode="email" autocomplete="email" placeholder="${esc(copy.t('footer.saveEmail', {}, 'Your email'))}" data-qa="chrome.footer.save.email" required><p class="msg" aria-live="polite"></p></div>
        <button type="submit" class="c-btn c-btn--primary" data-qa="chrome.footer.save.submit">${esc(copy.t('footer.saveButton', {}, 'Email my design'))}</button>
        <label class="c-check"><input type="checkbox" data-qa="chrome.footer.save.consent"><span>${esc(copy.t('footer.saveConsent'))}</span></label>
      </form>
      <p class="t-caption">${esc(copy.t('footer.saveHelp'))}</p>
    </div>
  </div>
</section>
<section class="ch-footer__main" aria-label="Site links">
  <div class="wrap">
    <div class="ch-footer__cols">
      <div><h3>${esc(copy.t('footer.cols.shop'))}</h3><ul>${L('create.html', 'design')}${L('upload.html', 'logo')}${L('shop.html', 'ready')}${L('weddings.html', 'weddings')}${L('bulk-quote.html', 'bulk')}${L('gift.html', 'gift')}</ul></div>
      <div><h3>${esc(copy.t('footer.cols.help'))}</h3><ul>${L('help.html', 'helpCentre')}${L('delivery.html', 'delivery')}${L('returns.html', 'returns')}${L('guides/installation.html', 'install')}${L('legal/recycling.html', 'recycling')}${L('contact.html', 'contact')}</ul></div>
      <div><h3>${esc(copy.t('footer.cols.company'))}</h3><ul>${L('about.html', 'about')}${L('guides.html', 'guides')}${L('legal/privacy.html', 'privacy')}${L('legal/terms.html', 'terms')}${L('legal/cookies.html', 'cookies')}</ul></div>
      <div><h3>${esc(copy.t('footer.cols.contact'))}</h3><ul>
        <li><a href="${contact.href}" data-qa="chrome.footer.contact" data-kind="${contact.kind}" ${contact.external ? 'target="_blank" rel="noopener"' : ''}>${icon(contact.icon)}<span>${esc(contact.kind === 'whatsapp' ? copy.t('footer.whatsapp') : contact.kind === 'email' ? facts.value('supportEmail') : copy.t('footer.contactForm'))}${hours ? `<span class="hours">${esc(hours)}</span>` : ''}</span></a></li>
        ${contact.kind === 'whatsapp' && facts.has('supportEmail') ? `<li><a href="mailto:${esc(facts.value('supportEmail'))}" data-qa="chrome.footer.email">${icon('mail')}<span>${esc(facts.value('supportEmail'))}</span></a></li>` : ''}
        ${contact.kind !== 'contact' ? `<li><a href="${url('contact.html')}" data-qa="chrome.footer.link" data-id="contactForm">${icon('chat')}<span>${esc(copy.t('footer.contactForm'))}</span></a></li>` : ''}
      </ul></div>
      <div><h3>${esc(copy.t('footer.cols.trust'))}</h3><div class="ch-footer__pay" data-qa="chrome.footer.pay"></div><p class="ch-footer__reviews">${icon('trustpilot', 'ic--sm')}${esc(copy.t('footer.reviews'))}</p><div class="ch-footer__social" data-qa="chrome.footer.social"></div></div>
    </div>
    <div class="w-news" data-qa="chrome.footer.news">
      <div><h3>${esc(copy.t('footer.newsTitle', {}, 'New signs and offers, now and then'))}</h3><p>${esc(copy.t('footer.newsBody', {}, 'One email a month at most. Unsubscribe in one tap.'))}</p></div>
      <form novalidate data-qa="chrome.footer.news.form"><div class="c-field"><label class="sr-only" for="ch-news-email">${esc(copy.t('footer.saveEmail', {}, 'Your email'))}</label><input id="ch-news-email" class="c-input" name="email" type="email" inputmode="email" autocomplete="email" placeholder="${esc(copy.t('footer.saveEmail', {}, 'Your email'))}" data-qa="chrome.footer.news.email" required></div><button type="submit" class="c-btn c-btn--primary" data-qa="chrome.footer.news.submit">${esc(copy.t('footer.newsButton', {}, 'Join'))}</button><p class="msg" aria-live="polite"></p></form>
    </div>
    <div class="ch-footer__legal">
      <p data-qa="chrome.footer.legal">${esc(legal)}${facts.chip('companyName')}</p>
      <div class="ch-footer__copy"><span>${esc(copy.t('footer.copyright', { year }))}</span><a href="${url('legal/privacy.html')}">${esc(copy.t('footer.links.privacy'))}</a><a href="${url('legal/terms.html')}">${esc(copy.t('footer.links.terms'))}</a><a href="${url('legal/cookies.html')}">${esc(copy.t('footer.links.cookies'))}</a></div>
    </div>
  </div>
</section>`;
  ui.paymentMarks(el.querySelector('.ch-footer__pay'));
  // socials only when confirmed
  const soc = el.querySelector('.ch-footer__social');
  [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['pinterest', 'Pinterest']].forEach(([k, name]) => { if (facts.has(`social.${k}`)) soc.insertAdjacentHTML('beforeend', `<a class="c-btn c-btn--icon" href="${esc(facts.value(`social.${k}`))}" target="_blank" rel="noopener" aria-label="${name}">${icon('external')}</a>`); });
  if (!soc.children.length) soc.remove();
  wireSave(el);
  try { const FM = state.peers && state.peers.forms; const F = FM && (FM.default || FM); const nf = el.querySelector('[data-qa="chrome.footer.news.form"]'); if (F && F.bind && nf) F.bind(nf, { kind: 'newsletter', qa: 'chrome.footer.news', onSuccess: () => { const d = document.createElement('p'); d.className = 'msg'; d.textContent = copy.t('footer.newsDone', {}, 'You are on the list.'); nf.replaceWith(d); } }); } catch (e) { console.warn('newsletter form', e); }
  return el;
}
function currentWords() {
  const r = state.peers.router;
  try { const d = r?.getDesign?.() || r?.design?.get?.() || r?.current?.(); if (d) return d.text || (d.lines || []).join(' ') || ''; } catch {}
  try { const raw = localStorage.getItem('litneon.design') || localStorage.getItem('ln.design'); if (raw) { const j = JSON.parse(raw); return j.text || (j.lines || []).join(' ') || ''; } } catch {}
  return '';
}
function wireSave(footerEl) {
  const words = footerEl.querySelector('.words'), form = footerEl.querySelector('form'), field = form.querySelector('.c-field'), input = form.querySelector('input[type="email"]'), msg = form.querySelector('.msg'), btn = form.querySelector('button'), consent = form.querySelector('input[type="checkbox"]');
  /* contextual (round-2 review): on a product page the block offers THAT design, never the unrelated builder design
     saved earlier; a page may also set <body data-save-words data-save-link>; elsewhere a saved builder design is
     labelled as such, so it never reads as the page's own design */
  const eyebrow = footerEl.querySelector('.ch-footer__save .t-eyebrow');
  let src = footerEl.querySelector('.ch-footer__save .src'); if (!src) { src = document.createElement('p'); src.className = 'src t-caption'; src.setAttribute('data-qa', 'chrome.footer.save.source'); words.after(src); }
  let ctx = { words: '', link: builderHref(), kind: 'none' };
  async function saveContext() {
    const page = pageOf();
    if (page === 'product') {
      const id = new URLSearchParams(location.search).get('id');
      if (id) { const d = (await data('designs')).find(x => x && x.id === id); if (d) return { words: (d.lines || []).join(' ') || d.name, link: location.origin + location.pathname + location.search, kind: 'product' }; }
    }
    const own = document.body.dataset.saveWords; if (own) return { words: own, link: document.body.dataset.saveLink || location.href, kind: 'page' };
    const w = currentWords(); return { words: w, link: builderHref(), kind: !w ? 'none' : (['builder', 'create'].includes(page) ? 'builder' : 'saved') };
  }
  const paintWords = async () => {
    try { ctx = await saveContext(); } catch { ctx = { words: currentWords(), link: builderHref(), kind: 'saved' }; }
    const mine = ctx.kind === 'product' || ctx.kind === 'page';
    words.textContent = ctx.words; footerEl.querySelector('.ch-footer__save').dataset.kind = ctx.kind;
    eyebrow.textContent = mine ? copy.t('footer.saveTitleThis', {}, 'Email me this design') : copy.t('footer.saveTitle', {}, 'Email me my design');
    src.textContent = ctx.kind === 'saved' ? copy.t('footer.saveFromBuilder', {}, 'Your design in the builder') : '';
    src.hidden = !src.textContent;
    if (btn.dataset.qa === 'chrome.footer.save.submit') btn.textContent = mine ? copy.t('footer.saveButtonThis', {}, 'Email this design') : copy.t('footer.saveButton', {}, 'Email my design');
  };
  paintWords(); document.addEventListener('ln:design', paintWords); window.addEventListener('storage', paintWords);
  const setError = text => { field.classList.add('is-error'); field.classList.remove('is-success'); input.setAttribute('aria-invalid', 'true'); msg.innerHTML = `${icon('warning')}<span>${esc(text)}</span>`; };
  const clearError = () => { field.classList.remove('is-error'); input.removeAttribute('aria-invalid'); msg.textContent = ''; };
  input.addEventListener('input', clearError);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = input.value.trim();
    if (!ui.validEmail(email)) { setError(copy.t('footer.emailInvalid')); input.focus(); return; }
    ui.setBusy(btn, true);
    const fields = { email, words: ctx.words || currentWords(), designLink: ctx.link || builderHref(), marketingConsent: consent.checked, page: location.href };
    let res;
    const forms = state.peers.forms;
    if (forms?.submit) { try { res = await forms.submit('emailDesign', fields, []); } catch (err) { res = { ok: false, error: err }; } }
    else res = { ok: false, error: new Error('forms adapter unavailable') };
    ui.setBusy(btn, false);
    if (res?.ok) {
      const local = res.driver === 'local';
      form.replaceWith(Object.assign(document.createElement('p'), { className: 'done' + (local ? ' is-review' : ''), innerHTML: `${icon('check')}<span data-qa="chrome.footer.save.done">${esc(local ? copy.t('footer.saveLocal') : copy.t('footer.saveSent', { email }))}</span>` }));
      say(local ? copy.t('footer.saveLocal') : copy.t('footer.saveSent', { email }));
    } else {
      setError(copy.t('footer.saveError')); btn.textContent = copy.t('footer.retry', {}, 'Retry'); btn.setAttribute('data-qa', 'chrome.footer.save.retry');
    }
  });
}

/* =========================== consent =========================== */
export function consentState() { try { return JSON.parse(localStorage.getItem('consent') || 'null'); } catch { return null; } }
export function setConsent(c) {
  const v = { essential: true, analytics: !!c.analytics, marketing: !!c.marketing, at: clock.now().toISOString() };
  try { localStorage.setItem('consent', JSON.stringify(v)); } catch {}
  document.dispatchEvent(new CustomEvent('ln:consent', { detail: v })); return v;
}
function consentBanner() {
  if (consentState()) return null;
  const el = document.createElement('div'); el.className = 'c-consent'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Cookie choices'); el.setAttribute('data-qa', 'chrome.consent');
  el.innerHTML = `<div class="wrap"><p>${esc(copy.t('consent.text'))} <a href="${url('legal/cookies.html')}">${esc(copy.t('consent.learn'))}</a></p><div class="actions"><button type="button" class="c-btn c-btn--ghost" data-qa="chrome.consent.reject">${esc(copy.t('consent.reject'))}</button><button type="button" class="c-btn c-btn--ghost" data-qa="chrome.consent.accept">${esc(copy.t('consent.accept'))}</button><a class="c-btn c-btn--text" href="${url('legal/cookies.html')}" data-qa="chrome.consent.settings"><span class="label">${esc(copy.t('consent.settings'))}</span></a></div></div>`;
  const done = () => { el.classList.remove('is-open'); document.body.classList.remove('has-consent'); document.body.style.removeProperty('--consent-h'); setTimeout(() => el.remove(), 500); };
  el.querySelector('[data-qa="chrome.consent.accept"]').addEventListener('click', () => { setConsent({ analytics: true, marketing: true }); done(); });
  el.querySelector('[data-qa="chrome.consent.reject"]').addEventListener('click', () => { setConsent({ analytics: false, marketing: false }); done(); });
  document.body.appendChild(el);
  /* simplify rework: the bar waits until the first screen has been seen (first scroll, or 8 s), so it never covers the hero on arrival */
  let shown = false; const show = () => { if (shown) return; shown = true; window.removeEventListener('scroll', onScroll); clearTimeout(timer); requestAnimationFrame(() => { el.classList.add('is-open'); document.body.classList.add('has-consent'); document.body.style.setProperty('--consent-h', el.getBoundingClientRect().height + 'px'); }); };
  const onScroll = () => { if (window.scrollY > 120) show(); }; window.addEventListener('scroll', onScroll, { passive: true }); const timer = setTimeout(show, 8000);
  return el;
}

/* =========================== basket wiring =========================== */
function wireBasket(headerEl) {
  const btn = headerEl.querySelector('.ch-basket'), count = headerEl.querySelector('.ch-basket__count');
  const paint = n => { if (n == null) n = basketCount(); state.basketCount = n; count.textContent = String(n); count.setAttribute('data-count', String(n)); btn.setAttribute('aria-label', `${copy.t('nav.basket', {}, 'Basket')}${n ? `, ${n} sign${n === 1 ? '' : 's'}` : ''}`); };
  btn.addEventListener('click', () => { const b = state.peers.basket; if (b?.open) { try { return b.open(); } catch {} } location.href = url('basket.html'); });
  document.addEventListener('ln:basket', e => paint(e.detail?.count)); window.addEventListener('storage', () => paint());
  try { state.peers.basket?.subscribe?.(() => paint()); } catch {}
  paint();
  return { paint };
}

/* =========================== mount =========================== */

/* the mark draws on, ignites, holds, fades back to the unlit tube and draws again (owner 2026-10-17). A fresh copy of the
   inline SVG restarts every CSS animation on every browser; reduced motion keeps the single run. */
function startMarkLoop(head) {
  if (!head || ui.prefersReducedMotion()) return;
  const brand = head.querySelector('.ch-brand'); const first = brand && brand.querySelector('svg.ln-mark'); if (!first) return;
  const tpl = first.outerHTML; const HOLD = 2900, OUT = 400;   /* owner 2026-10-17: restart as soon as the ignition settles */
  const cycle = () => { if (document.hidden) return; const cur = brand.querySelector('svg.ln-mark'); if (!cur) return; cur.classList.add('is-out'); setTimeout(() => { const c2 = brand.querySelector('svg.ln-mark'); if (c2) c2.outerHTML = tpl; }, OUT); };
  setInterval(cycle, HOLD + OUT);
}

export async function mount(opts = {}) {
  state = { ...state, page: opts.page || null, minimal: !!opts.minimal };
  document.documentElement.classList.add('has-chrome');
  /* perf audit: the wordmarks and payment marks were fetched one after another deep inside the mount (4 round trips on a
     phone network before the footer, and pages wait for mount before drawing their hero); start them all now */
  wordmark(); if (!state.minimal) { paperMarkSvg(); try { ui.paymentsConfig && ui.paymentsConfig().catch(() => {}); } catch {} }
  const [peers] = await Promise.all([
    (async () => ({ pricing: await opt('pricing'), basket: await opt('basket'), router: await opt('router'), search: await opt('search'), forms: await opt('forms'), analytics: await opt('analytics') }))(),
    copy.load('chrome'), facts.load(), ui.ensureSprite()
  ]);
  state.peers = peers;
  state.promoLive = await promoLive();
  // skip link
  if (!document.querySelector('.skip')) document.body.insertAdjacentHTML('afterbegin', `<a class="skip" href="#main" data-qa="chrome.skip">${esc(copy.t('nav.skip', {}, 'Skip to content'))}</a>`);
  const top = document.getElementById('chrome-top') || (() => { const d = document.createElement('div'); d.id = 'chrome-top'; document.body.prepend(d); return d; })();
  /* announcement + header land in ONE frame (perf audit: two inserts were two layout shifts on every page) */
  const bar = state.minimal ? null : announceBar(state.promoLive);
  const head = await header();
  startMarkLoop(head);
  top.innerHTML = '';
  if (bar) top.appendChild(bar);
  top.appendChild(head);
  if (!state.minimal) {
    wireMegas(head); wireSearch(head); await navDrawer(head);
  } else {
    head.querySelector('.ch-util').innerHTML = `<a class="c-btn c-btn--ghost" href="${builderHref()}" data-qa="chrome.minimal.design">${esc(copy.t('nav.design'))}</a>`;
  }
  if (!state.minimal) wireBasket(head);
  // scroll shrink
  const onScroll = () => document.documentElement.classList.toggle('is-scrolled', window.scrollY > 80);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  // footer, sticky CTA, consent: below the fold, so mount() resolves once the header is in and these finish behind it
  // (perf audit: every page awaited the footer before drawing its hero; LCP waited ~1 s on a throttled phone).
  // state.ready resolves when they are done; 'ln:chrome' still fires after the footer exists.
  state.ready = (async () => {
    if (!state.minimal) {
      const bottom = document.getElementById('chrome-footer') || (() => { const d = document.createElement('div'); d.id = 'chrome-footer'; document.body.appendChild(d); return d; })();
      bottom.innerHTML = ''; bottom.appendChild(await footer());
      stickyCta();
      consentBanner();
      waFloat(); firstOrderPop();
    }
    facts.renderBadge();
    document.dispatchEvent(new CustomEvent('ln:chrome', { detail: { page: pageOf(), promoLive: state.promoLive } }));
  })().catch(e => console.error('chrome: footer failed', e));
  return { state, ready: state.ready, builderHref, contactHref, consentState, setConsent, refreshBasket: () => document.dispatchEvent(new CustomEvent('ln:basket')) };
}

/* =========================== world 2026-10-15: WhatsApp float + first-order popup =========================== */
function waFloat() {
  if (document.querySelector('.w-wa')) return;
  const c = contactHref();
  const a = document.createElement('a'); a.className = 'w-wa'; a.href = c.href; a.setAttribute('data-qa', 'chrome.wa'); a.setAttribute('aria-label', c.kind === 'whatsapp' ? copy.t('nav.whatsapp', {}, 'Message us on WhatsApp') : copy.t('footer.contactForm', {}, 'Contact us'));
  if (c.external) { a.target = '_blank'; a.rel = 'noopener'; }
  /* owner 2026-10-17: the float always wears the official WhatsApp mark (white glyph on WhatsApp green); until the number is
     set in facts / Theme settings it opens the contact page, then it opens wa.me directly */
  a.innerHTML = icon('whatsapp');
  document.body.appendChild(a);
}
function firstOrderPop() {
  let seen = false; try { seen = localStorage.getItem('ln.pop.lit10') === '1'; } catch {}
  if (seen || document.querySelector('.w-pop') || !['home', 'shop', 'collection', 'weddings', 'business', 'inspiration', 'guides', 'about'].includes(pageOf())) return;
  const show = () => {
    if (document.querySelector('.w-pop') || document.body.classList.contains('has-overlay')) return;
    const el = document.createElement('div'); el.className = 'w-pop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'w-pop-h'); el.setAttribute('data-qa', 'chrome.pop');
    el.innerHTML = `<div class="w-pop__card"><button type="button" class="c-btn c-btn--icon c-btn--ghost w-pop__close" aria-label="Close" data-qa="chrome.pop.close">${icon('close')}</button><p class="t-eyebrow">${esc(copy.t('pop.eyebrow', {}, 'First sign?'))}</p><h2 id="w-pop-h">${esc(copy.t('pop.title', {}, '10% off your first sign'))}</h2><p>${esc(copy.t('pop.body', {}, 'Use the code at checkout. Free GB delivery and a 3-year warranty come as standard.'))}</p><span class="w-pop__code" data-qa="chrome.pop.code">LIT10</span><a class="c-btn c-btn--primary c-btn--lg" href="${builderHref()}" data-qa="chrome.pop.cta">${esc(copy.t('pop.cta', {}, 'Design my sign'))}</a></div>`;
    const done = () => { el.remove(); try { localStorage.setItem('ln.pop.lit10', '1'); } catch {} };
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('.w-pop__close') || e.target.closest('.w-pop__cta')) done(); });
    el.querySelector('[data-qa="chrome.pop.cta"]').addEventListener('click', done);
    document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { done(); document.removeEventListener('keydown', onKey); } });
    document.body.appendChild(el); el.querySelector('.w-pop__close').focus({ preventScroll: true });
  };
  let fired = false; const fire = () => { if (fired) return; fired = true; show(); };
  setTimeout(fire, 8000);
  const onScroll = () => { if (window.scrollY > innerHeight * 1.2) { fire(); window.removeEventListener('scroll', onScroll); } };
  window.addEventListener('scroll', onScroll, { passive: true });
}

export const chrome = { mount, consentState, setConsent, builderHref, contactHref };
export default chrome;
