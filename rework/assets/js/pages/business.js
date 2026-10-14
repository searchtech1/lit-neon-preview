/* Lit Neon v2 — business hub (brief §4.7, owner P5) and the small hub kit the weddings, inspiration and about pages
   import by name (bootHub, fillCopy, sceneOr, tiles, contact route, FAQ + JSON-LD, typed-text normalising).

   business.html: split hero (copy + a "your business name" panel | live stage on the shopfront scene, or the nearest
   delivered room until IMG lands it) · a sticky sub-nav of the seven anchors with scroll-spy · seven vertical cards
   (bar & pub feature + six), each a composited tile that relights with the visitor's business name, three facts and
   two CTAs (builder prefilled · send our logo) · "what changes the price" on paper with live sample prices from
   pricing.js and the price bands · the made-here comparison (compact) · the bulk band · five business FAQs with
   FAQPage JSON-LD. No case studies, no logo wall, no VAT wording (rule 5, §4.7). Every control: data-qa="business.*". */
import * as R from 'core/renderer.js';
import stage from 'core/stage.js';
import pricing from 'core/pricing.js';
import router from 'core/router.js';
import * as ui from 'core/ui.js';
import * as copy from 'core/copy.js';
import * as facts from 'core/facts.js';
import { gbp, fmtDims, esc } from 'core/money.js';
import { mount as mountChrome } from 'core/chrome.js';
import { loadData, data, pictureHtml, faqHtml, fillD2 } from 'pages/shop.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const t = (k, v, f) => copy.t(k, v, f);
export const icon = ui.icon;
export { esc, gbp, fillD2 };

/* ============================================================ hub kit ============================================================ */
/** copy + facts + sprite + chrome + data (designs, collections, faq, scenes). Resolves with data(). */
export async function bootHub(page, extraCopy = []) {
  const dataP = loadData();   /* perf audit: data + scenes load alongside the copy, not after it */
  await Promise.all([copy.load(['chrome', page, ...extraCopy]), facts.load(), ui.ensureSprite()]);
  mountChrome({ page }).catch(() => {});
  await dataP;
  try { await pricing.loadAreas?.(); } catch {}
  R.initStrikes();
  fillCopy();
  absoluteHead();
  return data();
}
/** [data-copy="key"] → text (only when the key resolves to a non-empty string, so the HTML default stays otherwise) */
export function fillCopy(root = document) {
  $$('[data-copy]', root).forEach(el => { const v = copy.get(el.dataset.copy); if (typeof v === 'string' && v) el.textContent = v; });
}
function absoluteHead() {
  try {
    const canon = document.querySelector('link[rel="canonical"]'); const og = document.querySelector('meta[property="og:image"]'); const ou = document.querySelector('meta[property="og:url"]');
    if (canon) canon.href = new URL(canon.getAttribute('href'), location.origin).href;
    if (og) og.content = new URL(og.getAttribute('content'), location.origin).href;
    if (ou && canon) ou.content = canon.href;
  } catch {}
}
export const isDelivered = id => { const s = stage.getScene(id); return !!s && !s.placeholder; };
/** the wanted scene once IMG delivers it, else the first delivered fallback (never a placeholder plate, P4's rule) */
export function sceneOr(id, fallbacks = []) { return [id, ...fallbacks, 's00-studio-dark'].find(isDelivered) || 's00-studio-dark'; }

/** Remove glyphs the tube can't draw (whole clusters, so an emoji's surrogate halves never survive), tidy spaces. */
export function stripGlyphs(text, bad = []) {
  return bad.reduce((s, g) => s.split(g).join(''), String(text || '')).replace(/[ \t]{2,}/g, ' ').replace(/ *\n */g, '\n').trim();
}
/** Typed text → the renderer's clean text (curly quotes normalised to the face, trailing spaces/blank lines trimmed). */
export function cleanText(raw, font = 'soho') {
  const res = R.resolve(R.normalise({ text: String(raw || ''), font }));
  return { text: res.clean ? res.clean.text : String(raw || '').trim(), bad: res.bad || [], res };
}

/** A composited tile: the scene plate (night; day fades in for the honest off state) + a DOM sign on the scene anchor.
    No stage, no canvas (≤ 1 live stage per page, §7.4). The pill sits beside the sign (§7.1 rendered-preview rule). */
export function tileHtml({ scene, words, font, colour, icon: ic = '', qa, id = '', portrait = false, cls = '', lazy = true, sizes, day = false } = {}) {
  const sc = stage.getScene(scene) || {};
  const a = (portrait ? (sc.portrait && sc.portrait.anchor) : sc.anchor) || { x: .5, y: .32 };
  return `<div class="hub-tile ${cls}${day ? ' is-day' : ''}" data-qa="${qa}" data-id="${esc(id)}" style="--ax:${(a.x * 100).toFixed(1)}%;--ay:${(a.y * 100).toFixed(1)}%">
    ${pictureHtml(scene, { cls: 'plate night', portrait, lazy, sizes: sizes || (portrait ? '(max-width: 768px) 50vw, 25vw' : '(max-width: 768px) 92vw, 50vw') })}
    ${pictureHtml(scene, { cls: 'plate day', portrait, night: false, lazy: true, sizes: sizes || (portrait ? '(max-width: 768px) 50vw, 25vw' : '(max-width: 768px) 92vw, 50vw') })}
    <div class="sign" aria-hidden="true" data-words="${esc(words)}" data-font="${esc(font)}" data-colour="${esc(colour)}" data-icon="${esc(ic)}"></div>
    <span class="hub-tile__pill">${ui.pill('rendered')}</span>
  </div>`;
}
const tileHandles = new Map();
/** mount the DOM sign in every .hub-tile under root (lazy, in view); returns { update(el, partial), refit() } */
export function hydrateTiles(root = document, { fitW = .92, fitH = .9, margin = '300px 0px' } = {}) {
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { mountTile(e.target); io.unobserve(e.target); } }), { rootMargin: margin }) : null;
  function mountTile(tile) {
    if (tileHandles.has(tile)) return;
    const el = tile.querySelector('.sign'); if (!el) return;
    const st = R.normalise({ text: el.dataset.words, font: el.dataset.font, colour: el.dataset.colour, icon: el.dataset.icon || '' });
    const h = R.mountNeon(el, st, { fitW, fitH, spill: .45 });
    tileHandles.set(tile, h);
    if (tile.classList.contains('is-off')) h.setLit(false);
  }
  $$('.hub-tile', root).forEach(tile => (io ? io.observe(tile) : mountTile(tile)));
  return {
    update(tile, partial) {
      const el = tile.querySelector('.sign'); if (!el) return;
      Object.entries(partial).forEach(([k, v]) => { if (v != null) el.dataset[k] = v; });
      const h = tileHandles.get(tile); if (!h) return;
      h.update(R.normalise({ text: el.dataset.words, font: el.dataset.font, colour: el.dataset.colour, icon: el.dataset.icon || '' }));
      if (tile.classList.contains('is-off')) h.setLit(false);
    },
    setLit(tile, on) { tile.classList.toggle('is-off', !on); const h = tileHandles.get(tile); if (h) h.setLit(on); },
    refit() { tileHandles.forEach((h, tile) => { if (tile.isConnected) { const el = tile.querySelector('.sign'); h.update(R.normalise({ text: el.dataset.words, font: el.dataset.font, colour: el.dataset.colour, icon: el.dataset.icon || '' })); if (tile.classList.contains('is-off')) h.setLit(false); } }); },
    mount: mountTile
  };
}

/** WhatsApp → email → contact form (never #), prefilled with a message (§3.9.2 chain, same as the chrome) */
export function contactRoute(text, topic = 'design') {
  if (facts.has('whatsappNumber')) { const n = String(facts.value('whatsappNumber')).replace(/\D/g, ''); return { href: `https://wa.me/${n}?text=${encodeURIComponent(text)}`, kind: 'whatsapp', external: true }; }
  if (facts.has('supportEmail')) return { href: `mailto:${facts.value('supportEmail')}?subject=${encodeURIComponent('Lit Neon')}&body=${encodeURIComponent(text)}`, kind: 'email', external: true };
  return { href: `/lit-neon-preview/rework/contact.html?topic=${encodeURIComponent(topic)}&text=${encodeURIComponent(text)}`, kind: 'contact', external: false };
}

/** FAQ accordion for the questions tagged with this page (faq.json `pages`), plus FAQPage JSON-LD */
export function renderFaq(el, page, qa) {
  const D = data(); const ids = (D.faq.questions || []).filter(q => (q.pages || []).includes(page)).map(q => q.id);
  el.innerHTML = faqHtml(ids, { qa });
  const qs = ids.map(id => D.faq.questions.find(q => q.id === id)).filter(Boolean);
  /* the kit links every answer to help.html#id, but help.html only renders the help:true questions. A page-only
     question links to its own answer here instead (a permalink that opens it), so no link lands on a missing id. */
  const here = location.pathname.replace(/^\/?/, '/');
  const linkLabel = t(`${page}.faq.selfLink`, {}, 'Link to this answer');
  $$(`[data-qa="${qa}.deeplink"]`, el).forEach(a => {
    const q = qs.find(x => x.id === a.dataset.id); const onHelp = !!(q && q.help);
    a.dataset.help = String(onHelp);
    if (onHelp) return;
    a.setAttribute('href', `${here}#${a.dataset.id}`); a.dataset.self = 'true';
    a.innerHTML = `${icon('link', 'ic--sm')}<span>${esc(linkLabel)}</span>`;
  });
  el.addEventListener('click', e => {
    const a = e.target.closest(`[data-qa="${qa}.deeplink"][data-self="true"]`); if (!a) return;
    const url = new URL(a.getAttribute('href'), location.origin).href;
    try { navigator.clipboard?.writeText(url).then(() => ui.toast(t(`${page}.faq.copied`, {}, 'Link copied'), { kind: 'ok' }), () => {}); } catch {}
  });
  ui.accordion(el, { single: false, deepLink: true });
  /* arriving on <page>#q-…: the FAQ is near the foot and the stages, grids and images above it are still growing,
     so keep the opened answer centred while the layout settles (2.5 s), and let go the moment the visitor scrolls */
  const target = (() => { try { const id = decodeURIComponent(location.hash.slice(1)); return id ? el.querySelector(`details#${CSS.escape(id)}`) : null; } catch { return null; } })();
  if (target && 'ResizeObserver' in window) {
    const pin = () => target.scrollIntoView({ block: 'center', behavior: 'instant' });
    const ro = new ResizeObserver(pin); ro.observe(document.body);
    const stop = () => { ro.disconnect(); ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => removeEventListener(ev, stop, true)); };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => addEventListener(ev, stop, { capture: true, passive: true }));
    setTimeout(stop, 2500); requestAnimationFrame(pin);
  }
  const ld = document.createElement('script'); ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: qs.map(q => {
    const v = (q.variants || []).find(x => x.when && x.when.startsWith('fact:') && facts.has(x.when.slice(5)));
    return { '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: fillD2(v ? v.a : q.a) } };
  }) });
  document.head.appendChild(ld);
  return ids;
}
/** the four-item trust strip (strings from the page copy; numbers already words) */
export function trustHtml(items, qa) {
  const ICONS = ['drawing', 'shield', 'box', 'check'];
  return items.map((s, i) => `<li data-qa="${qa}.item" data-i="${i}">${icon(ICONS[i % ICONS.length])}<span>${esc(s)}</span></li>`).join('');
}
/** scroll-spy: highlights the link whose target is in the band [top, 40%] of the viewport */
export function scrollSpy(links, { offset = 140, onActive } = {}) {
  const targets = links.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  let current = null, pinned = null;
  const pick = () => {
    const y = offset; const tops = targets.map(tg => ({ tg, top: tg.getBoundingClientRect().top }));
    const passed = tops.filter(x => x.top - y <= 0);
    let best = targets[0];
    if (passed.length) { const max = Math.max(...passed.map(x => x.top)); const tied = passed.filter(x => Math.abs(x.top - max) < 4).map(x => x.tg); best = tied.includes(pinned) ? pinned : tied[0]; }
    if (targets.length && tops[0].top - y > window.innerHeight * .4) best = null;
    const id = best ? best.id : null;
    if (id === current) return; current = id;
    links.forEach(a => { const on = a.getAttribute('href') === '#' + id; a.classList.toggle('is-active', on); if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    onActive?.(id, links.find(a => a.getAttribute('href') === '#' + id));
  };
  let raf = 0; const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(pick); };
  addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); pick();
  /* two cards side by side share a top: the one the visitor jumped to wins the tie */
  links.forEach(a => a.addEventListener('click', () => { pinned = document.getElementById(a.getAttribute('href').slice(1)); }));
  return { refresh: pick, pin: el => { pinned = el; pick(); } };
}
export const reduced = () => R.reducedMotion();

/* ============================================================ page: business.html ============================================================ */
/* delivered fallbacks until IMG lands each vertical's own scene (the tile switches automatically when scenes.json flips) */
const FALLBACK = { 's05-pub': ['s04-homebar'], 's07-cafe': ['s00-studio-light'], 's08-salon': ['s00-studio-light'], 's10-office': ['s00-studio-light'], 's11-shopwindow': ['s00-studio-dark'], 's06-wedding': ['s00-studio-dark'] };
const HERO = { scene: 's11-shopwindow', fallbacks: ['s00-studio-dark'], words: 'Open late', font: 'shoreditch', colour: 'red' };

async function initBusiness() {
  const D = await bootHub('business');
  const verticals = ((await fetch('/lit-neon-preview/rework/data/collections.json').then(r => r.json()).catch(() => ({}))).businessVerticals) || [];
  let name = '';

  /* ---------- hero: trust strip, stage, business-name panel ---------- */
  $('#bz-trust').innerHTML = trustHtml(copy.get('business.hero.trust') || [], 'business.hero.trust');
  const heroScene = sceneOr(HERO.scene, HERO.fallbacks);
  const heroState = () => R.normalise({ text: name || HERO.words, font: HERO.font, colour: HERO.colour, size: 'm', scene: heroScene });
  const heroStage = stage.mount($('#bz-stage'), { frame: 'hero', scene: heroScene, design: heroState(), interactive: false, qa: 'business.hero.stage', priority: 'high', view: { night: true, on: true, rulers: 'off' }, rulers: false });

  const input = $('#bz-name-input'), note = $('#bz-name-note'), priceEl = $('#bz-name-price'), open = $('#bz-name-open'), clear = $('#bz-name-clear');
  input.placeholder = t('business.hero.namePlaceholder');
  function paintName() {
    const raw = input.value; const c = cleanText(raw, HERO.font);
    name = raw.trim() ? stripGlyphs(c.text, c.bad) : '';   /* price and preview what can be drawn; the note says what can't */
    clear.hidden = !raw;
    note.hidden = !c.bad.length;
    if (c.bad.length) note.innerHTML = `${icon('warning', 'ic--sm')}<span>${esc(t('business.hero.nameBad', { glyphs: c.bad.join(' ') }))}</span>`;
    const st = heroState(); heroStage.setDesign(st);
    const p = pricing.price(st);
    priceEl.textContent = p.kind === 'price' ? t('business.hero.namePrice', { price: gbp(p.payable), dims: fmtDims(p.res.dims.W, p.res.dims.H) }) : p.kind === 'quote' ? t('business.hero.nameQuote') : p.kind === 'wait' ? t('business.hero.nameWait') : '';
    open.href = router.builderLink({ ...st, view: 'room' });
    if (name) router.design.setDebounced(st, 'collection', 300);
    paintVerticals();
  }
  let timer = 0;
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(paintName, 60); });
  input.addEventListener('blur', () => { const v = input.value.replace(/\s+$/g, ''); if (v !== input.value) { input.value = v; paintName(); } });
  clear.addEventListener('click', () => { input.value = ''; paintName(); input.focus(); });
  $('#bz-name').addEventListener('submit', e => { e.preventDefault(); input.blur(); });
  open.addEventListener('click', () => { if (name) { router.design.flush(); router.design.set(heroState(), 'collection'); } });

  /* ---------- sub-nav (7 anchors + pricing + bulk) ---------- */
  const navItems = [...verticals.map(v => ({ href: '#' + v.anchor, label: v.name, id: v.id })), { href: '#pricing', label: t('business.subnav.price'), id: 'pricing' }, { href: '#bulk', label: t('business.subnav.bulk'), id: 'bulk' }];
  $('#bz-subnav').setAttribute('aria-label', t('business.subnav.label'));
  $('#bz-subnav-track').innerHTML = navItems.map(n => `<a class="bz-subnav__link" href="${n.href}" data-qa="business.subnav.link" data-id="${esc(n.id)}">${esc(n.label)}</a>`).join('');
  const track = $('#bz-subnav-track');
  track.addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return; const tg = document.getElementById(a.getAttribute('href').slice(1)); if (!tg) return; e.preventDefault(); tg.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); history.replaceState(null, '', a.getAttribute('href')); tg.focus?.({ preventScroll: true }); });

  /* ---------- verticals ---------- */
  $('#bz-vgrid').innerHTML = verticals.map((v, i) => {
    const scene = sceneOr(v.scene, FALLBACK[v.scene] || []);
    const bullets = copy.get(`business.verticals.items.${v.id}.bullets`) || [];
    return `<article class="bz-v${i === 0 ? ' bz-v--feature' : ''}" id="${esc(v.anchor)}" tabindex="-1" data-qa="business.vertical" data-id="${esc(v.id)}" aria-labelledby="bz-v-${esc(v.id)}">
      ${tileHtml({ scene, words: v.words, font: v.font, colour: v.colour, qa: 'business.vertical.tile', id: v.id, cls: 'bz-v__tile', day: /studio-light/.test(scene) })}
      <div class="bz-v__body">
        <h3 class="bz-v__name" id="bz-v-${esc(v.id)}">${esc(v.name)}</h3>
        <p class="bz-v__line">${esc(v.line)}</p>
        <ul class="hub-ticks bz-v__bullets">${bullets.map(b => `<li>${icon('check')}<span>${esc(b)}</span></li>`).join('')}</ul>
        <div class="cluster bz-v__ctas">
          <a class="c-btn c-btn--primary" href="/lit-neon-preview/rework/create.html" data-qa="business.vertical.design" data-id="${esc(v.id)}">${esc(t('business.verticals.design'))}</a>
          <a class="c-btn c-btn--ghost" href="/lit-neon-preview/rework/upload.html#logo" data-qa="business.vertical.logo" data-id="${esc(v.id)}">${icon('upload')}<span>${esc(t('business.verticals.logo'))}</span></a>
        </div>
      </div>
    </article>`;
  }).join('');
  const tiles = hydrateTiles($('#bz-vgrid'));
  /* scroll-spy once every anchor exists */
  scrollSpy($$('.bz-subnav__link'), { offset: 180, onActive: (id, a) => { if (!a) return; const l = a.offsetLeft - track.clientWidth / 2 + a.offsetWidth / 2; track.scrollTo({ left: l, behavior: reduced() ? 'auto' : 'smooth' }); } });
  function paintVerticals() {
    verticals.forEach(v => {
      const card = document.getElementById(v.anchor); if (!card) return;
      const words = name || v.words;
      tiles.update($('.hub-tile', card), { words });
      const scene = sceneOr(v.scene, FALLBACK[v.scene] || []);
      $('[data-qa="business.vertical.design"]', card).href = router.builderLink(R.normalise({ text: words, font: v.font, colour: v.colour, size: 'm', scene, view: 'room' }));
    });
  }
  paintVerticals();

  /* ---------- price explainer (live sample numbers) + bands ---------- */
  function paintPrice() {
    const base = R.normalise({ text: 'Open late', font: 'shoreditch', colour: 'warm', size: 'm', backing: 'cut', board: 'clear' });
    const P = st => { const p = pricing.price(R.normalise(st)); return p.kind === 'price' ? p.payable : null; };
    const fmt = v => (v == null ? t('business.price.quote') : gbp(v));
    const delta = (a, b) => (a == null || b == null ? t('business.price.quote') : (b - a <= 0 ? t('business.price.included') : '+' + gbp(Math.round((b - a) * 100) / 100)));
    const m = P(base);
    const two = R.normalise({ ...base, text: 'Open\nlate', colours: ['warm', 'pink'] });
    const nums = [
      { a: fmt(P({ ...base, size: 's' })), b: fmt(P({ ...base, size: 'l' })) },
      { short: 'Bar', long: 'Welcome to the Local', a: fmt(P({ ...base, text: 'Bar' })), b: fmt(P({ ...base, text: 'Welcome to the Local' })) },
      { a: delta(P({ ...base, text: 'Open\nlate' }), P(two)), b: delta(m, P({ ...base, colour: 'rgb' })) },
      { a: delta(m, P({ ...base, backing: 'rect' })), b: delta(m, P({ ...base, board: 'gold' })) }
    ];
    const art = ['size', 'tube', 'colours', 'backing'];
    $('#bz-pcards').innerHTML = (copy.get('business.price.cards') || []).map((c, i) => `<article class="bz-pcard" data-qa="business.price.card" data-i="${i}">
      <div class="bz-pcard__art" aria-hidden="true">${ART[art[i]]}</div>
      <h3 class="bz-pcard__title">${esc(c.title)}</h3><p class="bz-pcard__body">${esc(c.body)}</p>
      <p class="bz-pcard__line" data-qa="business.price.card.line" data-i="${i}">${esc(copy.fill(c.line, nums[i]))}</p></article>`).join('');
    const b = pricing.bands(); const small = b.find(x => x.size === 's' && x.from != null), large = b.find(x => x.size === 'l' && x.from != null) || b.find(x => x.size === 'xl' && x.from != null);
    const a = small ? gbp(small.from) : '', bb = large ? gbp(large.from) : '';
    $('#bz-bands').innerHTML = (copy.get('business.price.bands') || []).map((x, i) => `<div class="bz-band" data-qa="business.price.band" data-i="${i}"><b>${esc(copy.fill(x.range, { a, b: bb }))}</b><span>${esc(x.use)}</span></div>`).join('');
  }
  paintPrice();

  /* ---------- comparison, bulk, FAQ ---------- */
  const cmp = copy.get('business.compare') || {};
  $('#bz-compare').innerHTML = `<caption class="sr-only">${esc(cmp.h2 || '')}</caption><thead><tr><th scope="col"><span class="sr-only">${esc(cmp.h2 || '')}</span></th><th scope="col">${esc(cmp.colUs)}</th><th scope="col">${esc(cmp.colThem)}</th></tr></thead><tbody>${(cmp.rows || []).map(r => `<tr data-qa="business.compare.row"><th scope="row">${esc(r.label)}</th><td class="us">${esc(copy.fill(r.us, { warranty: facts.get('warrantyYears') }))}</td><td class="them">${esc(r.them)}</td></tr>`).join('')}</tbody>`;
  $('#bz-bulk-points').innerHTML = (copy.get('business.bulk.points') || []).map(p => `<li>${icon('check')}<span>${esc(p)}</span></li>`).join('');
  renderFaq($('#bz-faq'), 'business', 'business.faq');

  /* fonts land → measure for real, re-price, redraw */
  const refresh = () => { tiles.refit(); paintName(); paintPrice(); };
  R.ensureFonts().then(refresh); R.onFonts(refresh);
  /* deep link to an anchor on load (#cafe …): the grid is rendered by script, so scroll once it exists */
  if (location.hash && document.getElementById(location.hash.slice(1))) requestAnimationFrame(() => document.getElementById(location.hash.slice(1)).scrollIntoView({ block: 'start' }));
  document.documentElement.dataset.ready = 'business';
  window.__business = { verticals, stage: heroStage, name: () => name };
}

/* drafting illustrations for the price cards (paper: draft-blue lines, no glow) */
const S = 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
const ART = {
  size: `<svg viewBox="0 0 200 96" ${S}><rect x="14" y="52" width="56" height="26" rx="5"/><rect x="92" y="22" width="96" height="56" rx="7"/><path d="M14 88h56M14 85v6M70 85v6M92 88h96M92 85v6M188 85v6" opacity=".7"/><path d="M28 66c6-8 10 8 16 0s10 6 14 0M110 50c10-16 18 14 28 0s16 12 26 0" stroke-width="2.2"/></svg>`,
  tube: `<svg viewBox="0 0 200 96" ${S}><path d="M18 60c8-22 16 18 26 0" stroke-width="2.2"/><path d="M70 64c6-28 14 20 22 0s12-24 20 0 12 22 20 0 12-20 20 0 12 18 22 0" stroke-width="2.2"/><path d="M18 80h26M70 80h108" opacity=".7"/><path d="M18 77v6M44 77v6M70 77v6M178 77v6" opacity=".7"/></svg>`,
  colours: `<svg viewBox="0 0 200 96" ${S}><path d="M20 40c10-18 20 14 30 0s18 10 28 0" stroke-width="2.2"/><path d="M20 70c10-18 20 14 30 0s18 10 28 0" stroke-width="2.2" stroke-dasharray="1 5"/><circle cx="140" cy="54" r="26"/><path d="M140 28v52M114 54h52M122 36l36 36M158 36l-36 36" opacity=".55"/></svg>`,
  backing: `<svg viewBox="0 0 200 96" ${S}><path d="M14 58c0-14 10-22 22-18s20-10 30-2 8 22-2 26-36 8-46 2-4-8-4-8Z"/><rect x="82" y="34" width="50" height="34" rx="4"/><path d="M150 30h38v34h-38zM158 64l-6 18h44l-6-18"/><circle cx="88" cy="40" r="2"/><circle cx="126" cy="40" r="2"/><circle cx="88" cy="62" r="2"/><circle cx="126" cy="62" r="2"/></svg>`
};

if (document.body && document.body.dataset.page === 'business') initBusiness();
