/* Lit Neon v2 — shop page (brief §4.4, owner P4) and the shop kit the collection and product pages reuse:
   design cards composited on the design's scene (lit ↔ off), the facet engine (URL-synced, counts per value,
   within-group OR / across-group AND), the browse grid with sort, active pills, empty state and the mobile filter
   sheet, and the quick-view sheet (live stage, size × colour × backing, add to basket as kind 'ready').
   Prices are never typed or stored: every number comes from pricing.js (one payable price, §3.7a), every date from
   clock/facts. Every control carries data-qa="<page>.<area>.<control>" and is listed in qa/matrix/<page>.json.

   Card imagery: the brief's pre-rendered card images (img/cards/**, WS0-C's prerender) do not exist yet, so a card is
   the scene's portrait plate (night; the day plate fades in for the honest off state) with the sign drawn by
   renderer.mountNeon — DOM and CSS, no canvas, no stage per card. Scenes still on placeholder plates are skipped in
   favour of the design's next delivered scene, so the grid shows photographic rooms; they switch automatically when
   IMG delivers (scenes.json placeholder:false). Decision logged in INTEGRATION.md. */
import * as R from 'core/renderer.js';
import stage from 'core/stage.js';
import pricing from 'core/pricing.js';
import basket, { drawer } from 'core/basket.js';
import router from 'core/router.js';
import * as ui from 'core/ui.js';
import * as copy from 'core/copy.js';
import * as facts from 'core/facts.js';
import { gbp, fmtDims, esc } from 'core/money.js';
import { mount as mountChrome } from 'core/chrome.js';
import { track } from 'core/analytics.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const t = (k, v, f) => copy.t(k, v, f);
export const icon = ui.icon;
export { esc, gbp };
const SIZE_ORDER = ['s', 'm', 'l', 'xl', 'xxl'];
const GROUP_ORDER = ['room', 'occasion', 'style', 'colour', 'size', 'price'];
const isHover = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ============================================================ data ============================================================ */
let DATA = null, dataPromise = null;
export function loadData() {
  if (dataPromise) return dataPromise;
  const get = u => fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
  dataPromise = Promise.all([get('/lit-neon-preview/rework/data/designs.json'), get('/lit-neon-preview/rework/data/collections.json'), get('/lit-neon-preview/rework/data/faq.json'), stage.loadScenes()]).then(([d, c, f]) => {
    pricing.setScenes(stage.scenes());
    DATA = { designs: (d && d.designs) || [], facets: (d && d.facets) || {}, defaults: (d && d.defaults) || {}, collections: (c && c.collections) || [], faq: f || { questions: [] } };
    return DATA;
  });
  return dataPromise;
}
export const data = () => DATA;
export const designById = id => (DATA ? DATA.designs.find(d => d.id === id) : null) || null;
export const collectionById = id => (DATA ? DATA.collections.find(c => c.id === id) : null) || null;
export const facetLabel = (group, id) => ((DATA && DATA.facets[group]) || []).find(f => f.id === id)?.label || id;
export const colourName = id => (R.OPTIONS.colours.find(c => c.id === id) || {}).name || id;

/** Boot shared by the three P4 pages: copy, facts, sprite, chrome, data, fonts. */
export async function bootPage(page, extraCopy = []) {
  const dataP = loadData();   /* perf audit: designs/collections/scenes load alongside the copy, not after it */
  await Promise.all([copy.load(['chrome', 'shop', ...extraCopy]), facts.load(), ui.ensureSprite()]);
  mountChrome({ page }).catch(() => {});
  await dataP;
  R.initStrikes();
  window.__p4 = { designById, collectionById, data: () => DATA };
  return DATA;
}

/* ============================================================ design state, scenes, prices ============================================================ */
const isDelivered = id => { const s = stage.getScene(id); return !!s && !s.placeholder; };
/** The scene a design is shown on: its own scene once IMG delivers it; otherwise the least-used of its delivered
    alternatives (rooms or the dark studio), so the grid never repeats one room down the page. Computed once per load. */
let sceneMap = null;
function buildSceneMap() {
  sceneMap = new Map(); const use = new Map(); const bump = id => use.set(id, (use.get(id) || 0) + 1);
  const designs = (DATA && DATA.designs) || [];
  designs.forEach(d => { if (isDelivered(d.scene)) { sceneMap.set(d.id, d.scene); bump(d.scene); } });
  designs.forEach(d => {
    if (sceneMap.has(d.id)) return;
    const cands = Array.from(new Set([...(d.altScenes || []), 's00-studio-dark'])).filter(isDelivered);
    const pick = cands.sort((a, b) => (use.get(a) || 0) - (use.get(b) || 0) || cands.indexOf(a) - cands.indexOf(b))[0] || 's00-studio-dark';
    sceneMap.set(d.id, pick); bump(pick);
  });
}
export function sceneFor(d) {
  if (!sceneMap && DATA) buildSceneMap();
  return (sceneMap && sceneMap.get(d.id)) || (isDelivered(d.scene) ? d.scene : 's00-studio-dark');
}
/** Up to `n` delivered scenes for a design's gallery: its own first, then generic delivered rooms. */
export function galleryScenes(d, n = 3) {
  const own = [d.scene, ...(d.altScenes || [])].filter(id => id && isDelivered(id) && !/studio/.test(id));
  const extra = ['s01-living', 's02-bedroom', 's04-homebar'].filter(id => isDelivered(id));
  return Array.from(new Set([...own, ...extra])).slice(0, n);
}
export function stateFor(d, o = {}) {
  return R.normalise({ text: (d.lines || []).join('\n'), font: d.font, colour: d.colour, icon: d.icon || '', iconPos: d.iconPos || 'above',
    size: 'm', backing: 'cut', board: 'clear', hang: 'screws', use: 'in', jacket: 'white', scene: sceneFor(d), ...o });
}
const sizeCache = new Map();
/** size cards for a design in its own colour (cached until fonts land): [{ id, name, available, payable, everyday, W, H, … }] */
export function sizesFor(d) {
  const k = d.id + '|' + (R.fontsSettled && R.fontsSettled() ? 1 : 0);
  if (!sizeCache.has(k)) sizeCache.set(k, pricing.sizeCards(stateFor(d), stage.getScene(sceneFor(d))));
  return sizeCache.get(k);
}
/** cheapest producible size (optionally within `allowed`): { size, name, payable, everyday } | null */
export function cheapest(d, allowed) {
  const cards = sizesFor(d);
  for (const id of SIZE_ORDER) {
    if (allowed && allowed.size && !allowed.has(id)) continue;
    const c = cards.find(x => x.id === id);
    if (c && c.available && c.kind === 'price' && c.payable != null) return { size: id, name: c.name, payable: c.payable, everyday: c.everyday };
  }
  return null;
}
export const availableSizes = d => sizesFor(d).filter(c => c.available && c.kind === 'price').map(c => c.id);
/** default size for a ready-made design: Medium (rule 7) when it can be made, else the smallest that can */
export function defaultSize(d) { const a = availableSizes(d); return a.includes('m') ? 'm' : (a[0] || 'm'); }
export function promoInfo() { const p = facts.promo(); return { live: pricing.promoLive(), end: p.end, pct: p.pct }; }

/* ============================================================ plates ============================================================ */
/** <picture> sources for a scene plate. portrait = the 4:5 plate (cards, quick view on phones); landscape otherwise. */
export function plate(sceneId, { night = true, portrait = true, max = 1000 } = {}) {
  const s = stage.getScene(sceneId); if (!s) return null;
  const P = s.plates || {}, tod = night ? 'night' : 'day';
  if (!s.placeholder && P.portrait && P.widths) {
    const stem = portrait ? P.portrait[tod] : P[tod];
    const ws = (portrait ? P.widths.portrait : P.widths.plate).filter(w => w <= max);
    const fmts = P.formats || ['jpg'];
    return { sources: fmts.filter(f => f !== 'jpg').map(f => ({ type: 'image/' + f, srcset: ws.map(w => `/lit-neon-preview/rework/assets/img/${stem}-${w}.${f} ${w}w`).join(', ') })), srcset: ws.map(w => `/lit-neon-preview/rework/assets/img/${stem}-${w}.jpg ${w}w`).join(', '), src: `/lit-neon-preview/rework/assets/img/${stem}-${ws[ws.length - 1]}.jpg` };
  }
  const stem = P[tod]; const w = portrait ? ((P.portraitSizes || [1000])[0]) : ((P.sizes || [1600])[0]);
  const src = `/lit-neon-preview/rework/assets/img/${stem}${portrait ? '-portrait' : ''}-${w}.jpg`;
  return { sources: [], srcset: '', src };
}
export function pictureHtml(sceneId, { night = true, portrait = true, cls = '', sizes = '(max-width: 768px) 50vw, 25vw', lazy = true, defer = false, max } = {}) {
  const p = plate(sceneId, { night, portrait, max }); if (!p) return '';
  const a = defer ? 'data-' : '';
  return `<picture class="${cls}">${p.sources.map(s => `<source type="${s.type}" ${a}srcset="${s.srcset}" sizes="${sizes}">`).join('')}<img ${a}src="${p.src}"${p.srcset ? ` ${a}srcset="${p.srcset}" sizes="${sizes}"` : ''} alt="" ${lazy ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async" width="${portrait ? 800 : 1200}" height="${portrait ? 1000 : 800}"></picture>`;
}
const undefer = pic => { if (!pic) return; pic.querySelectorAll('[data-srcset]').forEach(e => { e.srcset = e.dataset.srcset; e.removeAttribute('data-srcset'); }); const i = pic.querySelector('img[data-src]'); if (i) { i.src = i.dataset.src; i.removeAttribute('data-src'); } };

/* ============================================================ cards ============================================================ */
const handles = new Map();           // card element → mountNeon handle
let cardObserver = null;
export function cardHtml(d, { qa = 'shop', priceText = '', lazy = true, tag = 'h3' } = {}) {
  const sc = stage.getScene(sceneFor(d)) || {};
  const a = (sc.portrait && sc.portrait.anchor) || sc.anchor || { x: .5, y: .32 };
  const col = collectionById((d.collections || [])[0]);
  const name = d.name;
  return `<article class="c-card sh-card" data-qa="${qa}.card" data-id="${esc(d.id)}" data-collection="${esc((d.collections || []).join(' '))}">
  <div class="media" data-composite style="--ax:${(a.x * 100).toFixed(1)}%;--ay:${(a.y * 100).toFixed(1)}%">
    ${pictureHtml(sceneFor(d), { cls: 'plate night', lazy })}
    ${pictureHtml(sceneFor(d), { night: false, cls: 'plate day', defer: true })}
    <div class="sign" aria-hidden="true"></div>
    <span class="pills">${ui.pill('rendered')}${d.new ? `<span class="c-pill c-pill--new">${esc(t('pills.new', {}, 'New'))}</span>` : ''}</span>
    <button type="button" class="c-btn c-btn--icon sh-light" data-qa="${qa}.card.light" data-id="${esc(d.id)}" aria-pressed="true" aria-label="${esc(t('shop.card.lightOff', { name }))}">${icon('power')}</button>
    <button type="button" class="c-btn c-btn--ghost quick" data-qa="${qa}.card.quick" data-id="${esc(d.id)}" aria-haspopup="dialog" aria-label="${esc(t('shop.card.quickLabel', { name }))}">${icon('eye')}<span class="label">${esc(t('shop.quickView'))}</span></button>
  </div>
  <div class="meta"><span class="eyebrow">${esc(col ? col.name : '')}</span><${tag} class="title"><a href="/lit-neon-preview/rework/product.html?id=${encodeURIComponent(d.id)}" data-qa="${qa}.card.link" data-id="${esc(d.id)}">${esc(name)}</a></${tag}></div>
  <span class="from" data-qa="${qa}.card.price" data-id="${esc(d.id)}">${priceText}</span>
</article>`;
}
export function priceTextFor(d, allowed) {
  const c = cheapest(d, allowed);
  if (!c) return R.fontsSettled && !R.fontsSettled() ? '' : t('shop.card.quote');
  return allowed && allowed.size ? t('shop.card.fromSize', { size: c.name, price: gbp(c.payable) }) : t('shop.card.from', { price: gbp(c.payable) });
}
function setCardLit(card, on) {
  const h = handles.get(card); card.classList.toggle('is-off', !on);
  if (!on) undefer(card.querySelector('.plate.day'));
  if (h) h.setLit(on);
  const b = card.querySelector('.sh-light'); const d = designById(card.dataset.id);
  if (b && d) { b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', t(on ? 'shop.card.lightOff' : 'shop.card.lightOn', { name: d.name })); }
}
function mountSign(card) {
  if (handles.has(card)) return;
  const d = designById(card.dataset.id); if (!d) return;
  const el = card.querySelector('.sign');
  const h = R.mountNeon(el, stateFor(d), { fitW: .92, fitH: .92, spill: .5 });
  handles.set(card, h);
  if (card.classList.contains('is-off')) h.setLit(false);
}
/** Wire every card under root: lazy sign mount, hover off-state (fine pointers), light toggle, quick view. */
export function hydrateCards(root, { qa = 'shop' } = {}) {
  if (!cardObserver) cardObserver = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { mountSign(e.target); cardObserver.unobserve(e.target); } }), { rootMargin: '400px 0px' });
  $$('.sh-card', root).forEach(card => {
    if (card.dataset.wired) return; card.dataset.wired = '1';
    cardObserver.observe(card);
    card.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && isHover() && !card.dataset.pinned) setCardLit(card, false); });
    card.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && isHover() && !card.dataset.pinned) setCardLit(card, true); });
  });
  if (root.dataset.cardsWired) return; root.dataset.cardsWired = '1';
  root.addEventListener('click', e => {
    const l = e.target.closest('.sh-light');
    if (l) { e.preventDefault(); const card = l.closest('.sh-card'); const on = card.classList.contains('is-off'); card.dataset.pinned = on ? '' : '1'; if (on) delete card.dataset.pinned; setCardLit(card, on); return; }
    const q = e.target.closest('.sh-card .quick');
    if (q) { e.preventDefault(); openQuick(q.dataset.id, q, { qa: `${qa}.quick` }); }
  });
}
/** re-measure every mounted sign (fonts landed, layout changed) */
export function refreshSigns() {
  sizeCache.clear();
  handles.forEach((h, card) => { const d = designById(card.dataset.id); if (d && card.isConnected) h.update(stateFor(d)); if (card.classList.contains('is-off')) h.setLit(false); });
  /* cards outside a browse grid (related rail) re-price themselves; a grid re-prices through its own refresh() */
  $$('.sh-card').forEach(card => { if (card.closest('.sh-grid')) return; const d = designById(card.dataset.id); const p = card.querySelector('.from'); if (d && p) p.textContent = priceTextFor(d); });
}

/* ============================================================ facet engine ============================================================ */
/** Price bands from the catalogue's from-prices: quartiles rounded to £10 (designs.json priceBands; no literals). */
export function priceBands(designs) {
  const vals = designs.map(d => cheapest(d)?.payable).filter(v => v != null).sort((a, b) => a - b);
  if (vals.length < 4) return [];
  const q = p => Math.round(vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] / 10) * 10;
  const cuts = Array.from(new Set([q(.25), q(.5), q(.75)])).filter(c => c > vals[0]);
  const bands = []; let lo = 0;
  cuts.forEach((c, i) => { bands.push({ id: 'p' + (i + 1), min: lo, max: c, label: i === 0 ? t('shop.bands.under', { b: gbp(c) }) : t('shop.bands.between', { a: gbp(lo), b: gbp(c) }) }); lo = c; });
  bands.push({ id: 'p' + (cuts.length + 1), min: lo, max: Infinity, label: t('shop.bands.over', { a: gbp(lo) }) });
  return bands;
}
export function createFacets(designs, { groups = GROUP_ORDER } = {}) {
  let bands = priceBands(designs);   /* recomputed by rebuild() once the lettering faces have loaded and prices are real */
  const sel = Object.fromEntries(GROUP_ORDER.map(g => [g, new Set()]));
  let sort = 'featured';
  const values = g => {
    if (g === 'colour') return R.OPTIONS.colours.map(c => ({ id: c.id, label: c.name }));
    if (g === 'price') return bands.map(b => ({ id: b.id, label: b.label }));
    return (DATA.facets[g] || []).map(f => ({ id: f.id, label: f.label }));
  };
  const priceOf = d => cheapest(d, sel.size.size ? sel.size : null)?.payable ?? null;
  function test(d, g, id) {
    if (g === 'colour') return d.colour === id;
    if (g === 'size') return availableSizes(d).includes(id);
    if (g === 'price') { const b = bands.find(x => x.id === id); const p = priceOf(d); return !!b && p != null && p >= b.min && p < b.max; }
    return ((d.tags && d.tags[g]) || []).includes(id);
  }
  const passes = (d, except) => groups.every(g => g === except || !sel[g].size || Array.from(sel[g]).some(id => test(d, g, id)));
  /* a room facet is a promise about the picture: with Bedroom on, designs drawn IN the bedroom come first, then those
     that can be shown there, then the rest tagged bedroom (a wedding sign tagged bedroom still in its barn reads as a
     broken filter if it leads). Only for the default order; an explicit price/newest sort is respected as chosen. */
  const ROOM_SCENE = { living: 's01-living', bedroom: 's02-bedroom', kitchen: 's03-kitchen', bar: 's04-homebar', kids: 's09-kids', gaming: 's12-gaming', office: 's10-office' };
  const roomRank = d => { if (!sel.room || !sel.room.size) return 0; const want = Array.from(sel.room).map(r => ROOM_SCENE[r]).filter(Boolean); if (!want.length) return 0;
    if (want.includes(d.scene)) return 0; if (want.includes(sceneFor(d))) return 1; if ((d.altScenes || []).some(x => want.includes(x))) return 2; return 3; };
  function results() {
    const list = designs.filter(d => passes(d));
    const idx = d => designs.indexOf(d);
    const by = {
      featured: (a, b) => roomRank(a) - roomRank(b) || (a.bestsellerRank || 99) - (b.bestsellerRank || 99) || idx(a) - idx(b),
      'price-asc': (a, b) => (priceOf(a) ?? 1e9) - (priceOf(b) ?? 1e9) || idx(a) - idx(b),
      'price-desc': (a, b) => (priceOf(b) ?? -1) - (priceOf(a) ?? -1) || idx(a) - idx(b),
      newest: (a, b) => (b.new ? 1 : 0) - (a.new ? 1 : 0) || idx(a) - idx(b)
    };
    return list.sort(by[sort] || by.featured);
  }
  const count = (g, id) => designs.filter(d => passes(d, g) && test(d, g, id)).length;
  const active = () => groups.flatMap(g => Array.from(sel[g]).map(id => ({ group: g, id, label: (values(g).find(v => v.id === id) || {}).label || id })));
  /** the facet whose removal frees the most designs (the empty state's one-tap fix) */
  function mostRestrictive() {
    let best = null, bestN = -1;
    active().forEach(a => { sel[a.group].delete(a.id); const n = designs.filter(d => passes(d)).length; sel[a.group].add(a.id); if (n > bestN) { bestN = n; best = a; } });
    return bestN > 0 ? best : null; /* never offer a "fix" that still shows nothing: then Clear all is the one CTA */
  }
  return {
    groups, sel, get bands() { return bands; }, values, count, results, active, mostRestrictive, priceOf, test,
    rebuild() { const keep = Array.from(sel.price); bands = priceBands(designs); sel.price = new Set(keep.filter(id => bands.some(b => b.id === id))); },
    get sort() { return sort; }, set sort(v) { sort = v; },
    toggle(g, id) { if (sel[g].has(id)) sel[g].delete(id); else sel[g].add(id); },
    remove(g, id) { sel[g].delete(id); },
    clear(g) { (g ? [g] : groups).forEach(x => sel[x].clear()); },
    fromParams(params) { groups.forEach(g => { sel[g].clear(); params.getAll(g).forEach(v => String(v).split(',').forEach(id => { if (values(g).some(x => x.id === id)) sel[g].add(id); })); }); const s = params.get('sort'); if (s && (DATA.facets.sort || []).some(x => x.id === s)) sort = s; },
    toParams(params) { groups.forEach(g => { params.delete(g); Array.from(sel[g]).forEach(id => params.append(g, id)); }); params.delete('sort'); if (sort !== 'featured') params.set('sort', sort); return params; },
    sizeFilter: () => (sel.size.size ? sel.size : null)
  };
}

/* ============================================================ browse grid (shop + collection) ============================================================ */
/** Mounts toolbar · facets (sidebar or compact row) · active pills · grid · empty state into `root`.
    opts: { designs, groups, qa, layout: 'sidebar'|'compact', keepParams: [], headingTag } → { refresh(), facets } */
export function createBrowse(root, { designs, groups = GROUP_ORDER, qa = 'shop', layout = 'sidebar', keepParams = [], headingTag = 'h3', onChange } = {}) {
  const F = createFacets(designs, { groups });
  F.fromParams(new URLSearchParams(location.search));
  const sortOpts = (DATA.facets.sort || []).map(s => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('');
  root.classList.add('sh-browse', `sh-browse--${layout}`);
  root.innerHTML = `
  <div class="sh-toolbar" data-qa="${qa}.toolbar">
    <p class="sh-count" data-qa="${qa}.count" aria-live="polite"></p>
    <div class="sh-tools">
      ${layout === 'sidebar' ? `<button type="button" class="c-btn c-btn--ghost sh-filterbtn" data-qa="${qa}.filter.open" aria-haspopup="dialog">${icon('filter')}<span class="label"></span></button>` : ''}
      <label class="sh-sort"><span class="sr-only">${esc(t('shop.sort'))}</span><span class="sh-sort__k" aria-hidden="true">${esc(t('shop.sort'))}</span>
        <select class="c-input" data-qa="${qa}.sort">${sortOpts}</select>${icon('chevron-down')}</label>
    </div>
  </div>
  <div class="sh-layout">
    ${layout === 'sidebar' ? `<aside class="sh-side" aria-label="${esc(t('shop.filter'))}"><div class="sh-side__slot"></div></aside>` : ''}
    <div class="sh-main">
      ${layout === 'compact' ? `<div class="sh-compact" data-qa="${qa}.facets" role="group" aria-label="${esc(t('collection.facetsLabel', {}, t('shop.filter')))}"></div>` : ''}
      <div class="sh-active" data-qa="${qa}.active" hidden></div>
      <div class="c-card-grid sh-grid" data-qa="${qa}.grid"></div>
      <div class="sh-empty" data-qa="${qa}.empty" hidden></div>
    </div>
  </div>`;
  const grid = $('.sh-grid', root), countEl = $('.sh-count', root), sortEl = $('select', root), activeEl = $('.sh-active', root), emptyEl = $('.sh-empty', root);
  sortEl.value = F.sort;
  const cards = new Map();
  designs.forEach((d, i) => { const w = document.createElement('div'); w.innerHTML = cardHtml(d, { qa, tag: headingTag, lazy: i >= 4 }); cards.set(d.id, w.firstElementChild); });   /* the first row loads eagerly (perf audit: LCP) */

  /* facet panel (sidebar layout): one element, moved between the sidebar and the mobile sheet so data-qa stays unique */
  let panel = null, sheet = null;
  if (layout === 'sidebar') {
    panel = document.createElement('div'); panel.className = 'sh-facets'; panel.setAttribute('data-qa', `${qa}.facets`);
    $('.sh-side__slot', root).appendChild(panel);
    sheet = ui.sheet({ title: t('shop.filtersTitle'), qa: `${qa}.filter.sheet`, body: '', foot: `<button type="button" class="c-btn c-btn--primary c-btn--lg c-btn--block" data-qa="${qa}.filter.show"></button><button type="button" class="c-btn c-btn--text" data-qa="${qa}.filter.clear"><span class="label">${esc(t('shop.clearAll'))}</span></button>`,
      onOpen: () => sheet.body().appendChild(panel), onClose: () => $('.sh-side__slot', root).appendChild(panel) });
    sheet.el.querySelector(`[data-qa="${qa}.filter.show"]`).addEventListener('click', () => sheet.close('button'));
    sheet.el.querySelector(`[data-qa="${qa}.filter.clear"]`).addEventListener('click', () => { F.clear(); apply(); });
    $('.sh-filterbtn', root).addEventListener('click', e => sheet.open(e.currentTarget));
    matchMedia('(min-width: 1024px)').addEventListener('change', m => { if (m.matches && sheet.isOpen) sheet.close('resize'); });
  }
  const groupOpen = new Set(groups);   /* every group open by default; each summary still collapses it (remembered across re-renders) */
  if (panel) panel.addEventListener('toggle', e => { const dt = e.target; if (!dt.matches || !dt.matches('details.sh-group')) return; if (dt.open) groupOpen.add(dt.dataset.group); else if (!F.sel[dt.dataset.group].size) groupOpen.delete(dt.dataset.group); }, true);
  function chipFor(g, v, n) {
    const on = F.sel[g].has(v.id);
    if (g === 'colour') {
      const c = R.OPTIONS.colours.find(x => x.id === v.id) || {};
      return `<button type="button" class="c-swatch${c.rgb ? ' c-swatch--rgb' : ''}" style="--tube:${c.hex};--core:${c.core || c.hex}" data-qa="${qa}.facet.colour" data-id="${esc(v.id)}" aria-pressed="${on}" ${!n && !on ? 'disabled' : ''} aria-label="${esc(v.label)}, ${n}"><span class="tube"></span><span class="name">${esc(v.label)} <span class="n">${n}</span></span></button>`;
    }
    return `<button type="button" class="c-chip" data-qa="${qa}.facet.${g}" data-id="${esc(v.id)}" aria-pressed="${on}" ${!n && !on ? `disabled data-reason="${esc(t('shop.emptyTitle'))}"` : ''}>${esc(v.label)}<span class="n" aria-label="${n} designs">${n}</span></button>`;
  }
  function renderPanel() {
    if (!panel) return;
    panel.innerHTML = groups.map(g => {
      const vals = F.values(g); if (!vals.length) return '';
      const n = F.sel[g].size; const open = groupOpen.has(g) || n > 0;
      return `<details class="sh-group" data-group="${g}" ${open ? 'open' : ''}><summary data-qa="${qa}.group.${g}"><span class="label">${esc(t('shop.facets.' + g))}${n ? ` <span class="sel">(${n})</span>` : ''}</span>${icon('chevron-down')}</summary>
        ${t('shop.facetHelp.' + g, {}, '') ? `<p class="sh-help">${esc(t('shop.facetHelp.' + g))}</p>` : ''}
        <div class="${g === 'colour' ? 'c-swatches sh-swatches' : 'c-chips'}" role="group" aria-label="${esc(t('shop.facets.' + g))}">${vals.map(v => chipFor(g, v, F.count(g, v.id))).join('')}</div>
        ${n ? `<button type="button" class="c-btn c-btn--text sh-clear-group" data-qa="${qa}.group.clear" data-group="${g}"><span class="label">${esc(t('shop.clearGroup'))} ${esc(t('shop.facets.' + g).toLowerCase())}</span></button>` : ''}</details>`;
    }).join('');
  }
  function renderCompact() {
    const box = $('.sh-compact', root); if (!box) return;
    const items = groups.flatMap(g => F.values(g).map(v => ({ g, v, n: F.count(g, v.id) }))).filter(x => (x.n > 0 && x.n < designs.length) || F.sel[x.g].has(x.v.id));
    box.innerHTML = items.length ? `<div class="sh-compact__row">${items.map(x => x.g === 'colour' ? chipFor('colour', x.v, x.n) : chipFor(x.g, x.v, x.n)).join('')}</div>` : '';
    box.hidden = !items.length;
  }
  function renderActive() {
    const act = F.active();
    activeEl.hidden = !act.length;
    activeEl.innerHTML = act.map(a => `<button type="button" class="c-chip c-chip--filter is-selected" data-qa="${qa}.active.pill" data-group="${a.group}" data-id="${esc(a.id)}" aria-label="${esc(t('shop.removeFilter', { label: a.label }))}">${esc(a.label)}<span class="x">${icon('close')}</span></button>`).join('') +
      (act.length ? `<button type="button" class="c-btn c-btn--text" data-qa="${qa}.clear"><span class="label">${esc(t('shop.clearAll'))}</span></button>` : '');
  }
  function apply({ write = true, animate = true } = {}) {
    const list = F.results(); const sf = F.sizeFilter();
    const doit = () => {
      const frag = document.createDocumentFragment();
      list.forEach(d => { const c = cards.get(d.id); const p = c.querySelector('.from'); const txt = priceTextFor(d, sf); if (p.textContent !== txt) p.textContent = txt; frag.appendChild(c); });
      grid.replaceChildren(frag);
      hydrateCards(grid, { qa });
    };
    if (animate && document.startViewTransition && !ui.prefersReducedMotion() && grid.isConnected && grid.children.length) document.startViewTransition(doit); else doit();
    const n = list.length;
    countEl.textContent = n === 1 ? t('shop.countOne') : (n ? t('shop.count', { n }) : t('shop.countNone'));
    const fb = $('.sh-filterbtn .label', root); const na = F.active().length;
    if (fb) fb.textContent = na ? t('shop.filterOpenCount', { n: na }) : t('shop.filterOpen');
    if (sheet) { const b = sheet.el.querySelector(`[data-qa="${qa}.filter.show"]`); b.textContent = n === 1 ? t('shop.showOne') : (n ? t('shop.show', { n }) : t('shop.showNone')); }
    emptyEl.hidden = !!n; grid.hidden = !n;
    if (!n) {
      const mr = F.mostRestrictive();
      emptyEl.innerHTML = `<img src="/lit-neon-preview/rework/assets/img/empty/filters.svg" alt="" width="160" height="120"><p class="t-title">${esc(t('shop.emptyTitle'))}</p><div class="cluster">` +
        (mr ? `<button type="button" class="c-btn c-btn--primary" data-qa="${qa}.empty.fix" data-group="${mr.group}" data-id="${esc(mr.id)}">${esc(t('shop.emptyCta', { facet: mr.label.toLowerCase() }))}</button>` : '') +
        `<button type="button" class="c-btn ${mr ? 'c-btn--ghost' : 'c-btn--primary'}" data-qa="${qa}.empty.clear">${esc(t('shop.emptyClearAll'))}</button><a class="c-btn c-btn--text" href="/lit-neon-preview/rework/create.html" data-qa="${qa}.empty.custom"><span class="label">${esc(t('shop.emptyCustom'))}</span></a></div>`;
    }
    renderPanel(); renderCompact(); renderActive();
    if (write) { const p = new URLSearchParams(location.search); F.toParams(p); const keep = new URLSearchParams(); keepParams.forEach(k => { if (p.get(k)) keep.set(k, p.get(k)); }); F.toParams(keep); const qs = keep.toString(); history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash); }
    onChange?.(list, F);
  }
  root.addEventListener('click', e => {
    const f = e.target.closest('[data-qa^="' + qa + '.facet."]');
    if (f && !f.disabled) { const g = f.getAttribute('data-qa').split('.').pop(); F.toggle(g, f.dataset.id); apply(); const again = root.ownerDocument.querySelector(`[data-qa="${qa}.facet.${g}"][data-id="${CSS.escape(f.dataset.id)}"]`); again && again.focus({ preventScroll: true }); return; }
    const pill = e.target.closest(`[data-qa="${qa}.active.pill"]`); if (pill) { F.remove(pill.dataset.group, pill.dataset.id); apply(); (activeEl.querySelector('button') || sortEl).focus({ preventScroll: true }); return; }
    if (e.target.closest(`[data-qa="${qa}.clear"], [data-qa="${qa}.empty.clear"]`)) { F.clear(); apply(); sortEl.focus({ preventScroll: true }); return; }
    const gc = e.target.closest(`[data-qa="${qa}.group.clear"]`); if (gc) { F.clear(gc.dataset.group); apply(); return; }
    const fix = e.target.closest(`[data-qa="${qa}.empty.fix"]`); if (fix) { F.remove(fix.dataset.group, fix.dataset.id); apply(); }
  });
  /* the panel lives in the sheet on phones: the sheet gets its own delegate */
  if (sheet) sheet.el.addEventListener('click', e => {
    const f = e.target.closest('[data-qa^="' + qa + '.facet."]'); if (f && !f.disabled) { const g = f.getAttribute('data-qa').split('.').pop(); F.toggle(g, f.dataset.id); apply(); const again = sheet.el.querySelector(`[data-qa="${qa}.facet.${g}"][data-id="${CSS.escape(f.dataset.id)}"]`); again && again.focus({ preventScroll: true }); return; }
    const gc = e.target.closest(`[data-qa="${qa}.group.clear"]`); if (gc) { F.clear(gc.dataset.group); apply(); }
  });
  sortEl.addEventListener('change', () => { F.sort = sortEl.value; apply(); });
  window.addEventListener('popstate', () => { F.fromParams(new URLSearchParams(location.search)); sortEl.value = F.sort; apply({ write: false }); });
  apply({ write: false, animate: false });
  return { facets: F, refresh: () => { F.rebuild(); F.fromParams(new URLSearchParams(location.search)); apply({ write: false, animate: false }); }, cards };
}

/* ============================================================ quick view ============================================================ */
let quick = null, quickStage = null;
export function openQuick(id, opener, { qa = 'shop.quick' } = {}) {
  const d = designById(id); if (!d) return;
  if (!quick) quick = ui.sheet({ title: d.name, qa, body: '<div class="sh-quick"></div>', onClose: () => { quickStage && quickStage.destroy(); quickStage = null; } });
  quick.el.setAttribute('data-qa', qa);
  quick.el.querySelector('.c-dialog__head .title').textContent = d.name;
  const box = quick.body().querySelector('.sh-quick');
  let st = stateFor(d, { size: defaultSize(d) });
  const finishes = R.OPTIONS.finishes;
  function paint(first = false) {
    const p = pricing.price(st); const cards = pricing.sizeCards(st, stage.getScene(sceneFor(d)));
    const bd = pricing.deltas(st, 'backing', ['cut', 'rect']);
    const col = collectionById((d.collections || [])[0]);
    box.innerHTML = `
      <div class="sh-quick__stage" data-qa="${qa}.stage"></div>
      <div class="c-seg sh-quick__light" role="group" aria-label="${esc(t('shop.quick.light'))}"><button type="button" data-qa="${qa}.on" aria-pressed="${st.on !== false}">${icon('power')}${esc(t('shop.quick.on'))}</button><button type="button" data-qa="${qa}.off" aria-pressed="${st.on === false}">${esc(t('shop.quick.off'))}</button></div>
      <p class="sh-quick__eyebrow">${esc(col ? col.name : '')}</p>
      <p class="sh-quick__blurb">${esc(d.blurb || '')}</p>
      <h3 class="sh-quick__h">${esc(t('shop.quick.sizes'))}</h3>
      <div class="c-chips" role="group" aria-label="${esc(t('shop.quick.sizes'))}">${cards.filter(c => c.id !== 'custom').map(c => `<button type="button" class="c-chip" data-qa="${qa}.size" data-id="${c.id}" aria-pressed="${c.id === st.size}" ${c.available && c.kind === 'price' ? '' : `disabled data-reason="${esc(c.reason || t('shop.quick.unavailable'))}"`}>${esc(c.name)}${c.kind === 'price' && c.available ? ` · ${gbp(c.payable)}` : ''}</button>`).join('')}</div>
      <h3 class="sh-quick__h">${esc(t('shop.quick.colour'))} <span class="sub">${esc(colourName(st.colour))}</span></h3>
      <div class="c-swatches sh-quick__swatches" role="group" aria-label="${esc(t('shop.quick.colour'))}">${R.OPTIONS.colours.map(c => `<button type="button" class="c-swatch${c.rgb ? ' c-swatch--rgb' : ''}" style="--tube:${c.hex};--core:${c.core || c.hex}" data-qa="${qa}.colour" data-id="${c.id}" aria-pressed="${c.id === st.colour}" aria-label="${esc(c.name)}"><span class="tube"></span><span class="name">${esc(c.name)}</span></button>`).join('')}</div>
      <h3 class="sh-quick__h">${esc(t('shop.quick.backing'))}</h3>
      <div class="c-seg" role="group" aria-label="${esc(t('shop.quick.backing'))}">${R.OPTIONS.backings.filter(b => b.id !== 'stand').map(b => `<button type="button" data-qa="${qa}.backing" data-id="${b.id}" aria-pressed="${b.id === st.backing}">${esc(b.name)}<span class="delta">${esc(bd[b.id] ? '+' + gbp(bd[b.id]) : t('pills.included', {}, 'Included'))}</span></button>`).join('')}</div>
      <div class="sh-quick__buy">
        <div class="sh-quick__price"></div>
        <button type="button" class="c-btn c-btn--primary c-btn--lg" data-qa="${qa}.add" ${p.kind === 'price' ? '' : 'disabled'}>${esc(t('shop.quick.add'))}</button>
      </div>
      <p class="sh-quick__returns">${icon('check')}<span>${esc(t('shop.quick.returns', { returns: facts.get('readyMadeReturnsDays'), delivery: facts.get('deliveryFree') }))}</span></p>
      <div class="sh-quick__links">
        <a class="c-btn c-btn--ghost" href="${esc(router.builderLink({ ...st, view: 'room' }))}" data-qa="${qa}.customise">${icon('pencil')}${esc(t('shop.quick.customise'))}</a>
        <a class="c-btn c-btn--text" href="/lit-neon-preview/rework/product.html?id=${encodeURIComponent(d.id)}${router.buildHash(st)}" data-qa="${qa}.details"><span class="label">${esc(t('shop.quick.details'))}</span>${icon('arrow-right')}</a>
      </div>`;
    const priceEl = box.querySelector('.sh-quick__price');
    if (p.kind === 'price') ui.price(priceEl, { payable: p.payable, everyday: p.everyday, promo: promoInfo(), variant: 'dock', qa: `${qa}.price`, reason: p.res && p.res.dims ? t('shop.quick.dims', { dims: fmtDims(p.res.dims.W, p.res.dims.H), letter: `${p.res.letterCm} cm` }) : '', reasonOk: true });
    else ui.price(priceEl, { quote: true, quoteReason: pricing.quoteReason(p), variant: 'dock', qa: `${qa}.price` });
    const sEl = box.querySelector('.sh-quick__stage');
    if (quickStage) quickStage.destroy();
    quickStage = stage.mount(sEl, { frame: 'card', scene: sceneFor(d), design: st, interactive: false, qa: `${qa}.stage`, view: { on: st.on !== false, rulers: 'off' } });
  }
  box.onclick = e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const q = b.getAttribute('data-qa') || '';
    if (q === `${qa}.size`) { st = { ...st, size: b.dataset.id }; paint(); }
    else if (q === `${qa}.colour`) { st = R.normalise({ ...st, colour: b.dataset.id, jacket: b.dataset.id === 'rgb' ? 'white' : st.jacket }); paint(); }
    else if (q === `${qa}.backing`) { st = { ...st, backing: b.dataset.id }; paint(); }
    else if (q === `${qa}.on` || q === `${qa}.off`) { st = { ...st, on: q === `${qa}.on` }; quickStage && quickStage.setDesign({ on: st.on }); box.querySelectorAll(`[data-qa="${qa}.on"],[data-qa="${qa}.off"]`).forEach(x => x.setAttribute('aria-pressed', String(x === b))); return; }
    else if (q === `${qa}.add`) {
      const { on, view, ...spec } = st;
      basket.add({ kind: 'ready', state: R.normalise({ ...spec, on: true }), meta: { design: d.id } });
      track('builder_add_to_basket', { kind: 'ready', design: d.id, source: 'quick' });
      ui.flashSuccess(b, t('ui.added', {}, 'Added ✓'));
      setTimeout(() => { quick.close('added'); drawer && drawer.open(); }, 650);
      return;
    } else return;
    const again = box.querySelector(`[data-qa="${q}"]${b.dataset.id ? `[data-id="${b.dataset.id}"]` : ''}`); again && again.focus({ preventScroll: true });
  };
  paint(true);
  quick.open(opener);
}

/* ============================================================ D2 token resolver (FAQ answers, collection intros) ============================================================ */
function rulePath(p) { const rules = pricing.rules() || {}; return p.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), rules); }
export function fillD2(str) {
  if (!str) return '';
  const s = String(str)
    .replace(/\{fact:([a-zA-Z0-9_.]+)\}/g, (_, k) => facts.get(k) || '')
    .replace(/\{value:([a-zA-Z0-9_.]+)\}/g, (_, k) => { const v = facts.value(k); return v == null ? '' : String(v); })
    .replace(/\{rule:(pricing|delivery)\.([a-zA-Z0-9_.]+)(\|money)?\}/g, (_, g, p, m) => { const v = rulePath(`${g}.${p}`); return v == null ? '' : (m ? gbp(v) : String(v)); })
    .replace(/\{price:from(?::([a-z0-9-]+))?\}/g, (_, id) => { const v = id ? cheapest(designById(id) || {})?.payable : Math.min(...DATA.designs.map(d => cheapest(d)?.payable).filter(x => x != null)); return v == null || !isFinite(v) ? '' : gbp(v); })
    .replace(/\{exclusions\}/g, () => { const x = pricing.describeExclusions(); return x.short || x.text || ''; });
  return s.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
}
/** FAQ accordion items (c-acc details) for question ids, with variants and links; ids are help.html anchors. */
/** FAQ accordion items for `ids`. Every answer carries a permalink: help:true questions link to their answer on
    help.html (the only questions help.html renders); help:false ones link to the answer on this page (`self`, default
    the current path + query), which the page's accordion opens from the hash, so no link lands on a missing id. */
export function faqHtml(ids, { qa, self } = {}) {
  const qs = ids.map(id => DATA.faq.questions.find(q => q.id === id)).filter(Boolean);
  const here = self || (location.pathname + location.search);
  return qs.map(q => {
    const v = (q.variants || []).find(x => x.when && x.when.startsWith('fact:') && facts.has(x.when.slice(5)));
    const a = fillD2(v ? v.a : q.a);
    const onHelp = !!q.help;
    const href = onHelp ? `/lit-neon-preview/rework/help.html#${q.id}` : `${here}#${q.id}`;
    const label = onHelp ? t('shop.faq.helpLink', {}, 'Open in Help') : t('shop.faq.selfLink', {}, 'Link to this answer');
    return `<details id="${esc(q.id)}"><summary data-qa="${qa}.q" data-id="${esc(q.id)}"><span class="label">${esc(q.q)}</span>${icon('chevron-down')}</summary><div class="c-acc__body prose"><p>${esc(a)}</p>` +
      `${(q.links || []).length ? `<p class="sh-faq__links">${q.links.map(l => `<a href="/lit-neon-preview/rework/${esc(l.href.replace(/^\//, ''))}">${esc(l.label)}</a>`).join(' · ')}</p>` : ''}<p class="sh-faq__links"><a href="${esc(href)}" data-qa="${qa}.deeplink" data-id="${esc(q.id)}" data-help="${onHelp}"${onHelp ? '' : ' data-self="true"'}>${icon('link', 'ic--sm')}<span>${esc(label)}</span></a></p></div></details>`;
  }).join('');
}

/* ============================================================ page: shop.html ============================================================ */
async function initShop() {
  await bootPage('shop');
  const d = DATA;
  $('[data-copy="lede"]').textContent = t('shop.lede', { returns: facts.get('readyMadeReturnsDays') });
  /* collection strip: real collection landings (custom → builder, business → hub are their own pages) */
  $('#sh-collections').innerHTML = d.collections.filter(c => !c.redirect).map(c => `<a class="c-chip sh-colchip" href="/lit-neon-preview/rework/collection.html?c=${encodeURIComponent(c.id)}" data-qa="shop.collection" data-id="${esc(c.id)}">${esc(c.name)}</a>`).join('') +
    `<a class="c-chip sh-colchip" href="/lit-neon-preview/rework/business.html" data-qa="shop.collection" data-id="business">${esc((collectionById('business') || {}).name || 'Business')}</a>`;
  const browse = createBrowse($('#sh-browse'), { designs: d.designs, qa: 'shop' });
  /* SEO block below the grid (collapsed accordion) */
  $('#sh-seo-body').innerHTML = (copy.get('shop.seoBody') || []).map(p => `<p>${esc(copy.fill(p, { warranty: facts.get('warrantyYears') }))}</p>`).join('');
  ui.accordion($('#sh-seo'), { deepLink: false });
  /* fonts land → measure the lettering for real, then re-price and redraw */
  R.ensureFonts().then(() => { sizeCache.clear(); browse.refresh(); refreshSigns(); });
  R.onFonts(() => { sizeCache.clear(); browse.refresh(); refreshSigns(); });
  absoluteMeta('shop');
  window.__shop = { browse, data: d };
}
export function absoluteMeta(page) {
  try {
    const canon = document.querySelector('link[rel="canonical"]'); const og = document.querySelector('meta[property="og:image"]');
    if (canon) canon.href = new URL(canon.getAttribute('href'), location.origin).href;
    if (og) og.content = new URL(og.getAttribute('content'), location.origin).href;
    const ou = document.querySelector('meta[property="og:url"]'); if (ou && canon) ou.content = canon.href;
  } catch {}
}
if (document.body && document.body.dataset.page === 'shop') initShop();
