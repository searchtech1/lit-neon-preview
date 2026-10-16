/* Lit Neon v2 — home page (brief §4.1, §5.13). Owner: P1a.
   Mounts the chrome, the hero stage (type into the room), every section, and the P1b interactives by name
   (`ix/<name>.js` with the §0.3 mount contract). Until a module lands, a functional fallback built from the same
   engine (stage, renderer, pricing, ui) renders in its place: nothing on the page is a placeholder. */
import * as R from 'core/renderer.js';
import stage from 'core/stage.js';
import pricing from 'core/pricing.js';
import * as sheetMod from 'core/sheet.js';
import basket, { drawer } from 'core/basket.js';
import router from 'core/router.js';
import forms from 'core/forms.js';
import * as ui from 'core/ui.js';
import copy from 'core/copy.js';
import facts from 'core/facts.js';
import * as clock from 'core/clock.js';
import { gbp, fmtDims, fmtDelta, pence, cmToIn } from 'core/money.js';
import { mount as mountChrome } from 'core/chrome.js';
import * as drawing from 'core/drawing-export.js';
import analytics from 'core/analytics.js';

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = ui.esc; const icon = ui.icon;
const t = (k, v, f) => copy.t(k, v, f);
const isMobile = () => matchMedia('(max-width: 767px)').matches;
const isTablet = () => matchMedia('(max-width: 1023px)').matches;
const hoverable = () => matchMedia('(hover: hover)').matches;
const debounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };
const loadJson = async (p) => { try { const r = await fetch(p, { cache: 'no-store' }); return r.ok ? r.json() : null; } catch { return null; } };

/* ---------------------------------------------------------------- boot ---------------------------------------------------------------- */
stage.loadScenes();   /* perf audit: scenes.json + the AVIF probe start with the chrome, not after it */
const [chrome, data] = await Promise.all([
  mountChrome({ page: 'home' }),
  (async () => {
    const [designs, collections, faq, quiz] = await Promise.all(['designs', 'collections', 'faq', 'quiz'].map(n => loadJson(`/lit-neon-preview/rework/data/${n}.json`)));
    return { designs: designs || { designs: [] }, collections: collections || { collections: [], homeTiles: {}, businessVerticals: [] }, faq: faq || { questions: [], homeChips: [] }, quiz: quiz || null };
  })(),
  copy.load(['chrome', 'home']), facts.ready(), ui.ensureSprite()
]);
const scenes = await stage.loadScenes(); pricing.setScenes(scenes);
const fontsLoading = R.ensureFonts();
const sceneOf = id => stage.getScene(id) || stage.getScene('s01-living');

/* copy → static DOM (every [data-copy] node takes its string; empty copy keeps the markup text) */
$$('[data-copy]').forEach(el => { const v = copy.get(el.dataset.copy); if (typeof v === 'string' && v) el.textContent = v; });
/* a range such as "7–10 working days" never breaks at the dash (round-2 review: the 390 hero wrapped "in 7–" / "10 working days") */
$$('.hero__promise, .hero [data-copy]').forEach(el => { if (el.children.length || !/\d–\d/.test(el.textContent)) return; const txt = el.textContent; el.textContent = ''; txt.split(/(\d+–\d+ working days|\d+–\d+)/).forEach((part, i) => { if (!part) return; if (i % 2) { const s = document.createElement('span'); s.className = 'nowrap'; s.style.whiteSpace = 'nowrap'; s.textContent = part; el.appendChild(s); } else el.appendChild(document.createTextNode(part)); }); });
$$('.ic-slot[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
$('#hero-lettering .ic-wrap').innerHTML = icon('chevron-down');

try { $('link[rel="canonical"]').href = location.origin + '/lit-neon-preview/rework/'; $('meta[property="og:image"]').content = location.origin + '/lit-neon-preview/rework/assets/img/og/index.jpg'; } catch {}

/* ------------------------------------------------------- D2 typed-token resolver ------------------------------------------------------- */
function rulePath(p) { const rules = pricing.rules() || {}; return p.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), rules); }
function fillD2(str) {
  if (!str) return '';
  let s = String(str)
    .replace(/\{fact:([a-zA-Z0-9_.]+)\}/g, (_, k) => facts.get(k) || '')
    .replace(/\{value:([a-zA-Z0-9_.]+)\}/g, (_, k) => { const v = facts.value(k); return v == null ? '' : String(v); })
    .replace(/\{rule:(pricing|delivery)\.([a-zA-Z0-9_.]+)(\|money)?\}/g, (_, g, p, m) => { const v = rulePath(`${g}.${p}`); return v == null ? '' : (m ? gbp(v) : String(v)); })
    .replace(/\{price:from(?::([a-z0-9-]+))?\}/g, (_, id) => { const v = id ? pricing.fromPrice(data.designs.designs.find(d => d.id === id) || {}) : fromPrice(); return v == null ? '' : gbp(v); })
    .replace(/\{exclusions\}/g, () => (pricing.describeExclusions().short || pricing.describeExclusions().text || ''));
  return s.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
}
function fromPrice() { const all = pricing.fromPriceAll(data.designs.designs); if (all != null) return all; const b = pricing.bands(); const f = b.find(x => x.from != null); return f ? f.from : null; }
/** from-price of a design at its smallest producible size (Soho and Camden have minLetterCm above Small, so Small alone returns null) */
function fromAny(d) { for (const size of ['s', 'm', 'l']) { const v = pricing.fromPrice(d, { size }); if (v != null) return v; } return null; }

/* ------------------------------------------------------- shared home state (§5.13) ------------------------------------------------------- */
const SIX = ['pink', 'warm', 'ice', 'violet', 'red', 'green'];
const CHIP_FONTS = ['soho', 'brighton', 'shoreditch'];
let design = (() => {
  const base = Object.assign({}, R.DEFAULT_DESIGN, { text: t('hero.defaultWords', {}, 'After dark'), font: 'soho', colour: 'pink', size: 'm', scene: 's01-living' });
  const rec = router.design.get();
  if (rec && rec.state && rec.state.text && (rec.source === 'builder' || clock.now().getTime() - rec.updatedAt < router.design.STALE_MS)) {
    return R.normalise(Object.assign({}, base, rec.state, { scene: 's01-living', size: rec.state.size && rec.state.size !== 'custom' ? rec.state.size : 'm', custom: null, view: 'room', night: true, on: true }));
  }
  return R.normalise(base);
})();
const subs = new Set();
const view = () => ({ text: design.text, font: design.font, colour: design.colour, jacket: design.jacket, size: design.size, colours: design.colours || null });
function setDesign(partial, { source = 'hero', strike = false, persist = true } = {}) {
  design = R.normalise(Object.assign({}, design, partial));
  if (persist) router.design.setDebounced(design, source, 300);
  subs.forEach(fn => { try { fn(view(), { strike, partial }); } catch (e) { console.error(e); } });
}
const onState = fn => { subs.add(fn); return () => subs.delete(fn); };
const builderLink = (extra = {}, over = {}) => router.builderLink(Object.assign({}, design, over), extra);
const withState = (over = {}) => R.normalise(Object.assign({}, design, over));

/* -------------------------------------------------------------- plates -------------------------------------------------------------- */
/** <picture> (or <img> for the jpg-only placeholders) of a scene plate at a given width — used by tiles, not stages */
function plateHtml(sceneId, { variant = 'night', w = 600, cls = 'tile-plate', lazy = true } = {}) {
  const sc = sceneOf(sceneId); if (!sc || !sc.plates) return '';
  const P = sc.plates; const widths = P.widths ? P.widths.plate : (P.sizes || [1600]); const size = widths.slice().sort((a, b) => a - b).find(x => x >= w) || widths[widths.length - 1];
  const stem = '/lit-neon-preview/rework/assets/img/' + P[variant]; const fmts = P.formats || ['jpg'];
  const attrs = `class="${cls}" alt="" ${lazy ? 'loading="lazy"' : ''} decoding="async" draggable="false"`;
  if (fmts.length === 1) return `<img ${attrs} src="${stem}-${size}.${fmts[0]}">`;
  return `<picture>${fmts.filter(f => f !== 'jpg').map(f => `<source type="image/${f}" srcset="${stem}-${size}.${f}">`).join('')}<img ${attrs} src="${stem}-${size}.jpg"></picture>`;
}
/** a composited tile: plate + the words as tube (DOM render, no stage). Returns the mountNeon handle. */
function tile(el, { scene, text, font, colour, lit = true, variant = 'night', w = 600, fitW = .78, fitH = .5, pill = true, strike = false }) {
  el.innerHTML = plateHtml(scene, { variant, w }) + `<div class="ln-tile"></div>` + (pill ? `<span class="c-pill c-pill--rendered tile-pill" data-caption="rendered">${esc(t('pills.rendered', {}, 'Rendered preview'))}</span>` : '');
  el.dataset.composite = '';
  let last = withState({ text, font, colour, scene });
  const neon = R.mountNeon(el.querySelector('.ln-tile'), last, { fitW, fitH, lit: lit, strike, spill: .35 });
  if (!lit) neon.setLit(false);
  /* renderer.fit() re-scales the ink box measured at draw time; a face that loads AFTER the mount (Monoton on the
     home-bar tile) left the fallback measurement in place and the sign ran past the card. Redraw (re-measure) when a
     face lands and once all faces have settled. */
  const upd = neon.update; neon.update = s => { last = s; upd(s); };
  const redraw = () => neon.update(last); const off = R.onFonts(redraw); R.fontsReady().then(() => { off(); redraw(); });
  return neon;
}

/* ================================================================ 1 · HERO ================================================================ */
const hero = $('.hero'), heroInput = $('#hero-input'), heroCounter = $('#hero-counter'), heroNote = $('#hero-note'), heroPrice = $('#hero-price'), heroCta = $('#hero-cta');
/* world 2026-10-15: the photo hero has no stage; every stage call below is guarded so the words form, quiz and links keep working */
const heroStage = $('#hero-stage') ? stage.mount($('#hero-stage'), { frame: 'hero', scene: 's01-living', design, qa: 'home.hero', priority: 'high', interactive: true, pill: false }) : null;
if (heroStage) $('#hero-stage').insertAdjacentHTML('afterend', `<span class="c-pill c-pill--rendered hero__pill" data-caption="rendered">${esc(t('pills.rendered', {}, 'Rendered preview'))}</span>`);
if (!router.design.get()) router.design.set(design, 'hero');   /* first visit: the chrome's footer capture and the sticky CTA read the store */
if (isMobile()) $('#hero-input').closest('.hero__field').appendChild($('#hero-lettering'));   /* phone: the lettering sheet button sits beside the input, swatches get the row */
heroStage && heroStage.on('change', e => { design.pos = e.pos; router.design.setDebounced(design, 'hero', 300); });
/* s01's measured entry has no calib.topY, so the stage cannot keep the sofa in frame by itself on a tall landscape
   stage; anchoring the sign 33 cm above the sofa back keeps the furniture in the bottom quarter (§3.8.6). */
/* Stacked hero (phones/tablets): a long sign (a typed line, or the quiz's first pick) frames wider, the crop pins to the plate
   top and the sign rises into the copy ("Signs from …"). Lower it in small steps until it clears the copy block, measured
   with transitions off; the result is cached per words/size/viewport so the 'frame' event that each move fires cannot loop. */
let anchorKey = '', anchorY = null;
const heroAnchor = () => {
  if (!heroStage) return; const fi = heroStage.frameInfo(); if (!fi || hero.classList.contains('kbd')) return;
  const want = fi.orientation === 'landscape' ? .38 : .36;   /* portrait: a little lower than the measured anchor so the H1 block clears the sign at 390/360 */
  const stacked = !hero.classList.contains('is-split') && innerWidth < 1024;
  const signEl = heroStage.el.querySelector('[data-qa="home.hero.sign"]'), copyEl = $('.hero__copy');
  /* the drawn size (set on the element at once, unlike its animated box) joins the key: a face landing late re-measures */
  const key = [design.text, design.size, design.font, design.icon, design.iconPos, innerWidth, innerHeight, stacked, signEl && signEl.style.width, signEl && signEl.style.height, copyEl && Math.round(copyEl.getBoundingClientRect().height)].join('|');
  const p = heroStage.pos();
  if (key === anchorKey && anchorY != null) { if (Math.abs(p.y - anchorY) > .005 || Math.abs(p.x - .5) > .005) heroStage.setPos(.5, anchorY); return; }
  anchorKey = key; let y = want;
  if (stacked && signEl && copyEl) {
    heroStage.el.classList.add('no-anim'); heroStage.setPos(.5, y, { silent: true });
    /* lowering only helps while the crop is pinned to the plate top; once the crop follows the sign, a step no longer moves
       it on screen, so stop and keep the last step that did */
    let prevTop = null;
    for (let i = 0; i < 14; i++) { const sr = signEl.getBoundingClientRect(), cb = copyEl.getBoundingClientRect().bottom; if (!sr.height || sr.top >= cb + 12 || y >= .6) break;
      if (prevTop != null && Math.abs(sr.top - prevTop) < 1) { y = Math.round((y - .015) * 1000) / 1000; heroStage.setPos(.5, y, { silent: true }); break; }
      prevTop = sr.top; y = Math.round((y + .015) * 1000) / 1000; heroStage.setPos(.5, y, { silent: true }); }
    requestAnimationFrame(() => heroStage.el.classList.remove('no-anim'));
  }
  anchorY = y; const q = heroStage.pos(); if (Math.abs(q.y - y) > .0005 || Math.abs(p.y - y) > .005 || Math.abs(p.x - .5) > .005) heroStage.setPos(.5, y);
};
/* desktop split (≥1024): the stage frames the sign at ~40 % of its OWN width (kept = hero width so the §5.1 frame range
   holds), centred, so the stage box is slid sideways to put the sign + width bar + height ruler in clear space:
   A · right of the control card when that column is wide enough (1440), else
   B · right of the copy column and ABOVE the card (1024–1279): the box is also raised (taller, same bottom edge) until
       the sign's width bar clears the card. The box may run past the right edge (the hero clips); left of it the plate fades. */
const HERO_GAP = 40, HERO_RULER = 88, HERO_EDGE = 24, HERO_BAR = 56;
const heroVar = n => parseFloat(hero.style.getPropertyValue(n)) || 0;
function heroLayout() {
  if (!heroStage) return;
  if (isTablet() || hero.classList.contains('kbd')) { if (hero.classList.contains('is-split')) { hero.classList.remove('is-split'); ['--stage-l', '--stage-w', '--stage-t', '--stage-fade'].forEach(p => hero.style.removeProperty(p)); } return; }
  const H = hero.getBoundingClientRect(); const SW = H.width; if (!SW) return;
  const panel = $('#hero-panel').getBoundingClientRect(), copy = $('.hero__copy').getBoundingClientRect();
  const fi = heroStage.frameInfo(); const f = fi && fi.target ? (fi.target[0] + fi.target[1]) / 2 : .4;
  const signEl = heroStage.el.querySelector('[data-qa="home.hero.sign"]'); const sr = signEl && signEl.getBoundingClientRect();
  const s = sr && sr.width ? sr.width : f * SW;   /* the box only slides (width = hero width), so the measured width holds */
  const roomFrom = x => SW - HERO_EDGE - HERO_RULER - (x - H.left + HERO_GAP);
  const besideCard = roomFrom(panel.right) >= s;
  const from = (besideCard ? panel.right : Math.max(copy.right, $('.hero__h1').getBoundingClientRect().right)) - H.left + HERO_GAP;
  const room = SW - HERO_EDGE - HERO_RULER - from;
  /* centre the sign in the free space; a sign wider than that space keeps its ruler on screen and eats into the gap */
  const signLeft = from + (room >= s ? (room - s) / 2 : room - s);
  const inStage = sr && sr.width ? sr.left - heroStage.el.getBoundingClientRect().left : (SW - s) / 2;   /* where the stage drew it */
  const L = Math.round(signLeft - inStage);
  let T = besideCard ? 0 : heroVar('--stage-t');
  if (!besideCard && hero.classList.contains('is-split')) {   /* measured: raise until the width bar clears the card */
    const r = sr;
    if (r && r.height) { const need = (r.bottom + HERO_BAR) - (panel.top - 8); if (Math.abs(need) > 4) T = Math.max(0, Math.min(H.height * .6, T + need / .58)); }
  }
  T = Math.round(T);
  if (hero.classList.contains('is-split') && Math.abs(heroVar('--stage-l') - L) < 2 && Math.abs(heroVar('--stage-t') - T) < 3) return;
  hero.style.setProperty('--stage-l', L + 'px'); hero.style.setProperty('--stage-w', Math.round(SW) + 'px'); hero.style.setProperty('--stage-t', T + 'px');
  hero.style.setProperty('--stage-fade', Math.round(Math.max(.12, Math.min(.36, ((SW - s) / 2 - 24) / SW)) * 100) + '%');   /* fully opaque a little before the sign */
  hero.classList.add('is-split');
}
heroLayout();
addEventListener('resize', debounce(heroLayout, 80));
window.__home = { heroStage, heroAnchor, get design() { return design; } };   /* QA hook */
heroStage && heroStage.ready.then(() => { heroLayout(); heroAnchor(); heroStage.on('frame', debounce(() => { heroLayout(); heroAnchor(); }, 50)); });
heroInput.value = design.text;
$('#hero-swatches').innerHTML = SIX.map(id => { const c = R.colourOf(id); return `<button type="button" class="c-swatch" data-id="${id}" data-qa="home.hero.swatch" aria-pressed="${design.colour === id}" aria-label="${esc(c.name)}, ${design.jacket === 'colour' ? 'coloured' : 'white'} jacket" style="--tube:${c.hex};--core:${c.core || '#fff'}"><span class="tube"></span><span class="name">${esc(c.name)}</span></button>`; }).join('');
$('#hero-chips').innerHTML = CHIP_FONTS.map(id => { const f = R.fontOf(id); return `<button type="button" class="c-chip" data-id="${id}" data-qa="home.hero.chip" aria-pressed="${design.font === id}" aria-label="${esc(f.name)} lettering" style="font-family:'${f.family}',cursive;${f.weight ? `font-weight:${f.weight}` : ''}">${esc(f.name)}</button>`; }).join('');
const letterSheet = ui.sheet({ title: t('hero.letteringSheet', {}, 'Pick a lettering'), qa: 'home.hero.sheet', body: `<div class="hx-letter">${R.enabledFonts().map(f => `<button type="button" class="c-chip c-chip--lettering" data-id="${f.id}" data-qa="home.hero.sheet.font" aria-pressed="${design.font === f.id}" style="font-family:'${f.family}',cursive;${f.weight ? `font-weight:${f.weight}` : ''}">${esc(f.name)}</button>`).join('')}</div>`, foot: `<button type="button" class="c-btn c-btn--primary" data-close data-qa="home.hero.sheet.done">${esc(t('hero.sheetDone', {}, 'Done'))}</button>` });
letterSheet.body().addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; $$('[data-id]', letterSheet.body()).forEach(x => x.setAttribute('aria-pressed', String(x === b))); setDesign({ font: b.dataset.id }, { strike: true }); letterSheet.close(); });
$('#hero-lettering').addEventListener('click', e => letterSheet.open(e.currentTarget));
$('#hero-swatches').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; setDesign({ colour: b.dataset.id, colours: null }, { strike: true }); });
$('#hero-chips').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; setDesign({ font: b.dataset.id }, { strike: true }); });

const GLYPH_SYMBOL = [[/💍/u, 'ring', 'ring'], [/💕|💞|💑/u, 'twohearts', 'two hearts'], [/❤|♥|💗|💖|🩷|💓|💘/u, 'heart', 'heart'], [/⭐|🌟|✨|★|☆/u, 'star', 'star'], [/🌙|☾|🌛/u, 'moon', 'moon'], [/⚡/u, 'bolt', 'bolt'], [/🍸|🍹/u, 'cocktail', 'cocktail'], [/🥂|🍾/u, 'champagne', 'champagne'], [/→|➡/u, 'arrow', 'arrow']];
function autosize() { heroInput.style.height = 'auto'; heroInput.style.height = Math.min(96, heroInput.scrollHeight) + 'px'; }
function heroRender({ strike = false } = {}) {
  if (heroStage) { heroStage.setDesign(design); if (strike) heroStage.strike(); }
  const res = R.resolve(design); const p = pricing.price(design);
  // counter: longest line vs the limit
  const max = R.OPTIONS.limits.maxChars; const longest = (design.text || '').split('\n').reduce((m, l) => Math.max(m, l.length), 0);
  heroCounter.textContent = longest ? t('hero.counter', { n: longest, max }, '{n} of {max}') : ''; heroCounter.classList.toggle('is-over', longest > max);
  // notes with fix buttons
  let note = '';
  if (res.bad && res.bad.length) {
    const g = res.bad[0]; const m = GLYPH_SYMBOL.find(([re]) => re.test(g));
    note = m ? `<span>${esc(t('hero.noteUnsupported', { glyph: g, symbol: m[2] }))}</span><button type="button" class="c-btn c-btn--ghost c-btn--sm" data-fix="symbol" data-symbol="${m[1]}" data-glyph="${esc(g)}" data-qa="home.hero.fix.symbol">${esc(t('hero.noteUseSymbol', {}, 'Use it'))} →</button>`
      : `<span>${esc(t('hero.noteUnsupportedPlain', { glyph: g }))}</span><button type="button" class="c-btn c-btn--ghost c-btn--sm" data-fix="remove" data-glyph="${esc(g)}" data-qa="home.hero.fix.remove">${esc(t('hero.noteRemove', {}, 'Remove it'))} →</button>`;
  } else if (longest > max && (design.text || '').split('\n').length < R.OPTIONS.limits.maxLines) {
    note = `<span>${esc(t('hero.noteTooLong'))}</span><button type="button" class="c-btn c-btn--ghost c-btn--sm" data-fix="split" data-qa="home.hero.fix.split">${esc(t('hero.noteSplit', {}, 'Split into two lines'))} →</button>`;
  } else if (p.kind === 'quote' && p.reason === 'too-wide' && design.size !== 's') {
    const small = pricing.sizeCards(design).find(c => c.id === 's');
    if (small && small.payable != null) note = `<span>${esc(t('hero.noteFitsSmaller', { size: R.sizeOf(design.size).name, cm: fmtDims(small.W, small.H), price: gbp(small.payable) }))}</span><button type="button" class="c-btn c-btn--ghost c-btn--sm" data-fix="small" data-qa="home.hero.fix.small">${esc(t('hero.noteUseSmall', {}, 'Use Small'))} →</button>`;
  }
  heroNote.innerHTML = note; heroNote.hidden = !note; heroNote.classList.toggle('is-important', !!note);
  // price line
  if (p.kind === 'price') heroPrice.innerHTML = `<span class="amount" data-qa="home.hero.price.amount">${gbp(p.payable)}</span> <span class="reason">${esc(t('hero.priceAt', { price: '', size: R.sizeOf(design.size).name, dims: fmtDims(p.dims.W, p.dims.H) }).replace(/^\s*at/, 'at'))}</span>${p.promoLine ? `<div class="promo" data-qa="home.hero.price.promo">${esc(p.promoLine)}</div>` : ''}`;
  else if (p.kind === 'quote') heroPrice.innerHTML = `<span class="amount is-quote" data-qa="home.hero.price.amount">${esc(t('price.quote', {}, 'Quote'))}</span> <span class="reason">${esc(pricing.quoteReason(p))}</span>`;
  else if (p.kind === 'wait') heroPrice.innerHTML = `<span class="reason">${esc(t('hero.priceMeasuring'))}</span>`;
  else heroPrice.innerHTML = `<span class="reason">${esc(t('hero.priceEmpty'))}</span>`;
  heroCta.href = builderLink(); const door = $('#hero-door-design'); if (door) door.href = builderLink();
  $$('#hero-swatches [data-id]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === design.colour)));
  $$('#hero-chips [data-id]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === design.font)));
  const fp = fromPrice(); $('[data-qa="home.hero.from"]').textContent = fp != null ? t('hero.fromPrice', { from: gbp(fp) }) : ''; const tag = $('[data-qa="home.hero.tagprice"]'); if (tag) tag.textContent = fp != null ? t('hero.fromPrice', { from: gbp(fp) }).toLowerCase() : '';
}
heroNote.addEventListener('click', e => {
  const b = e.target.closest('[data-fix]'); if (!b) return;
  const fix = b.dataset.fix; let text = design.text;
  if (fix === 'symbol') { text = text.split(b.dataset.glyph).join('').replace(/\s{2,}/g, ' ').trim(); heroInput.value = text; setDesign({ text, icon: b.dataset.symbol, iconPos: 'above' }, { strike: true }); }
  else if (fix === 'remove') { text = text.split(b.dataset.glyph).join('').replace(/\s{2,}/g, ' ').trim(); heroInput.value = text; setDesign({ text }); }
  else if (fix === 'split') { const lines = text.split('\n'); const i = lines.findIndex(l => l.length > R.OPTIONS.limits.maxChars); const l = lines[i]; const cut = l.lastIndexOf(' ', Math.min(l.length - 1, R.OPTIONS.limits.maxChars)); const at = cut > 0 ? cut : Math.floor(l.length / 2); lines.splice(i, 1, l.slice(0, at).trim(), l.slice(at).trim()); heroInput.value = lines.join('\n'); autosize(); setDesign({ text: lines.join('\n') }); }
  else if (fix === 'small') setDesign({ size: 's' });
  heroInput.focus({ preventScroll: true });
});
heroInput.addEventListener('input', debounce(() => { autosize(); setDesign({ text: heroInput.value.replace(/\n{2,}/g, '\n').split('\n').slice(0, R.OPTIONS.limits.maxLines).join('\n') }); }, 60));
heroInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); heroInput.blur(); location.href = heroCta.href; }
  if (e.key === 'Enter' && e.shiftKey && heroInput.value.split('\n').length >= R.OPTIONS.limits.maxLines) e.preventDefault();
});
$('#hero-panel').addEventListener('submit', e => { e.preventDefault(); location.href = heroCta.href; });
/* keyboard mode (B43): shrink the plate to the sign and pin the panel to the visual viewport */
(function keyboardMode() {
  const vv = window.visualViewport; let on = false;
  function layout() {
    if (!on) return; const h = vv ? vv.height : innerHeight; const top = vv ? vv.offsetTop : 0; const panel = $('#hero-panel'); const ph = panel.offsetHeight;
    hero.style.setProperty('--vv-h', h + 'px'); hero.style.setProperty('--kbd-panel-h', (ph + 24) + 'px'); hero.style.setProperty('--kbd-panel-top', (top + h - ph - 12) + 'px');
    window.scrollTo({ top: hero.offsetTop, behavior: 'instant' });
  }
  function enter() { if (on || !isTablet() || !heroStage) return; on = true; hero.classList.add('kbd'); heroStage.setFrame('room'); layout(); requestAnimationFrame(layout); vv && (vv.addEventListener('resize', layout), vv.addEventListener('scroll', layout)); }
  function exit() { if (!on) return; on = false; hero.classList.remove('kbd'); hero.style.removeProperty('--vv-h'); hero.style.removeProperty('--kbd-panel-h'); hero.style.removeProperty('--kbd-panel-top'); heroStage && heroStage.setFrame('hero'); vv && (vv.removeEventListener('resize', layout), vv.removeEventListener('scroll', layout)); }
  heroInput.addEventListener('focusin', enter); heroInput.addEventListener('focusout', () => setTimeout(() => { if (!hero.contains(document.activeElement) || document.activeElement === document.body) exit(); else if (document.activeElement !== heroInput) exit(); }, 50));
  hero.addEventListener('focusout', e => { if (on && !e.relatedTarget) setTimeout(exit, 30); });
  document.addEventListener('ln:overlay', e => { if (e.detail && e.detail.open) exit(); });
})();
autosize(); heroRender();
onState((s, { strike }) => heroRender({ strike }));
/* the quiz's first pick becomes the page's design (hero, ways, sheets, ix): its words, lettering and colour, lit on the
   hero wall. Only quiz writes are followed here; the hero's own writes come back through setDesign already. */
router.design.subscribe(rec => {
  if (!rec || rec.source !== 'quiz' || !rec.state || !rec.state.text) return;
  const q = rec.state; if (q.text === design.text && q.font === design.font && q.colour === design.colour) return;
  setDesign({ text: q.text, font: q.font, colour: q.colour, colours: null, icon: q.icon || '', jacket: q.jacket || design.jacket }, { strike: true, persist: false });
  if (document.activeElement !== heroInput) { heroInput.value = design.text; autosize(); }
});
R.onFonts(() => { heroRender(); refreshAll(); });
fontsLoading.then(() => { heroRender(); refreshAll(); });

/* ============================================================ 2 · THREE WAYS ============================================================ */
const ways = copy.get('ways.cards') || [];
const WAYS = [{ scene: 's01-living', href: '/lit-neon-preview/rework/create.html', qa: 'home.ways.design', font: 'soho', colour: 'pink', live: true }, { scene: 's11-shopwindow', href: '/lit-neon-preview/rework/upload.html', qa: 'home.ways.upload', font: 'shoreditch', colour: 'red' }, { scene: 's02-bedroom', href: '/lit-neon-preview/rework/shop.html', qa: 'home.ways.shop', font: 'brighton', colour: 'ice' }];
/* world 2026-10-15: the three doors carry photos from the generated set instead of rendered tiles */
const WAY_PHOTOS = [['p8', 'Friends laughing under a pink neon sign reading last orders'], ['p10', 'A warm white neon sign reading coffee first in a café window'], ['p9', 'A pastel pink neon sign reading little dreamer above a cot']];
$('#ways-grid').innerHTML = WAYS.map((w, i) => `<article class="way"><div class="w-photo way__tile" data-i="${i}"><img src="/lit-neon-preview/rework/assets/img/photos/${WAY_PHOTOS[i][0]}-800.jpg" alt="${esc(WAY_PHOTOS[i][1])}" loading="lazy" decoding="async"></div><h3 class="way__title">${esc(ways[i]?.title || '')}</h3><p class="way__line">${esc(ways[i]?.line || '')}</p><a class="c-btn c-btn--ghost" href="${w.href}" data-qa="${w.qa}">${esc(ways[i]?.cta || '')}</a></article>`).join('');
onState(s => { $('[data-qa="home.ways.design"]').href = builderLink(); });
$('[data-qa="home.ways.design"]').href = builderLink();

/* ========================================================== 3 · WHERE'S IT GOING ========================================================== */
const C = data.collections; const byId = id => C.collections.find(c => c.id === id); const countFor = id => data.designs.designs.filter(d => (d.collections || []).includes(id)).length;
function tileRow(kind, id) {
  if (kind === 'business') { const v = C.businessVerticals.find(x => x.id === id); if (!v) return null; return { href: `/lit-neon-preview/rework/business.html#${v.anchor}`, scene: v.scene, words: v.words, font: v.font, colour: v.colour, title: v.name, line: v.line, meta: t('shop.tileBusiness'), collection: `business:${v.id}` }; }
  const c = byId(id); if (!c) return null; const n = countFor(id); const d = data.designs.designs.find(x => x.id === c.prefilledDesign); const from = fromAny(d || { lines: [c.tile.words], font: c.defaults.font, colour: c.defaults.colour });
  return { href: `/lit-neon-preview/rework/collection.html?c=${encodeURIComponent(c.id)}`, scene: c.scene, words: c.tile.words, font: c.defaults.font, colour: c.defaults.colour, title: c.name, line: c.tile.line, meta: from != null ? t(n === 1 ? 'shop.tileMetaOne' : 'shop.tileMeta', { from: gbp(from), n }) : '', collection: c.id };
}
const shopNeons = []; const shopRows = {};
for (const kind of ($('#shop-panel-room') ? ['room', 'occasion', 'business'] : [])) {   /* world round 3: photo tiles, no rendered panels */
  const rows = shopRows[kind] = (C.homeTiles[kind] || []).map(id => tileRow(kind, id)).filter(Boolean);
  $(`#shop-panel-${kind}`).innerHTML = rows.map((r, i) => `<a class="tile" href="${r.href}" data-qa="home.shop.tile" data-collection="${esc(r.collection)}"><span class="tile__media" data-k="${kind}" data-i="${i}"></span><span class="tile__title">${esc(r.title)}</span><span class="tile__line">${esc(r.line)}</span><span class="tile__meta" data-i="${i}">${esc(r.meta)}</span></a>`).join('');
  rows.forEach((r, i) => shopNeons.push(tile($(`#shop-panel-${kind} .tile__media[data-i="${i}"]`), { scene: r.scene, text: r.words, font: r.font, colour: r.colour, fitW: .8, fitH: .55 })));
}
function paintShopMeta() { if (!$('#shop-panel-room')) return; for (const kind of ['room', 'occasion', 'business']) { const rows = (C.homeTiles[kind] || []).map(id => tileRow(kind, id)).filter(Boolean); rows.forEach((r, i) => { const m = $(`#shop-panel-${kind} .tile__meta[data-i="${i}"]`); if (m) m.textContent = r.meta; }); } }
if ($('#shop-tabs')) ui.tabs($('#shop-tabs'), { onChange: () => R.refitAll() });

/* ============================================================ 4 · HOW IT WORKS ============================================================ */
const HOW_MEDIA = [
  { kind: 'shot', src: '/lit-neon-preview/rework/assets/img/how/design-800.jpg', alt: 'The designer: after dark drawn to scale on the wall, with its sizes' },
  { kind: 'photo', src: '/lit-neon-preview/rework/assets/img/photos/p41-800.jpg', alt: 'A printed proof drawing of a neon sign with its sizes marked, on a desk' },
  { kind: 'photo', src: '/lit-neon-preview/rework/assets/img/photos/p42-800.jpg', alt: 'Hands fitting white LED neon into acrylic cut to the outline of after dark' },
  { kind: 'photo', src: '/lit-neon-preview/rework/assets/img/photos/p43-800.jpg', alt: 'The finished after dark sign lit ice blue on a living room wall' }
];
$('#how-list').innerHTML = (copy.get('how.steps') || []).map((s, i) => { const m = HOW_MEDIA[i]; return `<li><span class="w-step__media${m && m.kind === 'shot' ? ' is-shot' : ''}">${m ? `<img src="${m.src}" alt="${esc(m.alt)}" loading="lazy" decoding="async">` : ''}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.line)}</p></div></li>`; }).join('');
const howSheet = $('#how-sheet');
const renderSheet = () => { if (howSheet) sheetMod.render(howSheet, withState({ size: 'm' }), { lite: true }); };
if (howSheet) new ResizeObserver(() => renderSheet()).observe(howSheet);
onState(() => { renderSheet(); $('#how-cta').href = builderLink(); });
$('#how-cta').href = builderLink();
const howPdf = $('#how-pdf'); if (howPdf) howPdf.addEventListener('click', async e => { const b = e.currentTarget; ui.setBusy(b, true); try { await drawing.download(withState({ size: 'm' })); } finally { ui.setBusy(b, false); } });

/* =============================================================== ix loader =============================================================== */
const IX = {};
async function mountIx(name, el, opts = {}) {
  if (!el) return null;
  let mod = null;
  try { mod = await import(`ix/${name}.js`); } catch { mod = null; }
  const fn = mod && (mod.mount || (mod.default && mod.default.mount));
  let api = null;
  if (fn) {
    for (const css of ['_ix', name]) if (!document.querySelector(`link[href="/lit-neon-preview/rework/assets/css/ix/${css}.css"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `/lit-neon-preview/rework/assets/css/ix/${css}.css`; document.head.appendChild(l); }
    try { api = await fn(el, Object.assign({ state: view(), design: () => design, builderLink, pricing, stage, facts, copy }, opts)); } catch (e) { console.error(`ix/${name} failed to mount`, e); api = null; }
  }
  if (!api) api = await FALLBACK[name](el, opts);
  IX[name] = api; el.dataset.ixMounted = fn && api && api.__fallback !== true ? 'module' : 'fallback';
  return api;
}
onState(s => { Object.values(IX).forEach(api => { try { api && api.setState && api.setState(s); } catch {} }); });

/* ------------------------------------------------------------ fallback helpers ------------------------------------------------------------ */
const inView = (el, fn, ratio = .35) => { const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { fn(); io.disconnect(); } }), { threshold: ratio }); io.observe(el); return io; };
const segHtml = (qa, opts, selected, label) => `<div class="c-seg" role="group" aria-label="${esc(label)}">${opts.map(o => `<button type="button" data-id="${o.id}" data-qa="${qa}" aria-pressed="${o.id === selected}">${esc(o.name)}</button>`).join('')}</div>`;
const swatchesHtml = (qa, selected, { jacket = 'white', off = false } = {}) => R.OPTIONS.colours.map(c => `<button type="button" class="c-swatch${c.rgb ? ' c-swatch--rgb' : ''}${off ? ' c-swatch--off' : ''}" data-id="${c.id}" data-qa="${qa}" aria-pressed="${c.id === selected}" aria-label="${esc(c.name)}, ${jacket === 'colour' ? 'coloured' : 'white'} jacket" style="--tube:${c.hex};--core:${c.core || '#fff'}"><span class="tube"></span><span class="name">${esc(c.name)}</span></button>`).join('');
const pillRendered = () => `<span class="c-pill c-pill--rendered tile-pill" data-caption="rendered">${esc(t('pills.rendered', {}, 'Rendered preview'))}</span>`;
const pillIllustration = () => `<span class="c-pill c-pill--illustration" data-caption="illustration">${esc(t('pills.illustration', {}, 'Illustration'))}</span>`;
async function inlineSvg(url) { try { const r = await fetch(url); if (!r.ok) return null; const txt = await r.text(); const doc = new DOMParser().parseFromString(txt, 'image/svg+xml'); const svg = doc.documentElement; if (svg.nodeName !== 'svg') return null; svg.removeAttribute('width'); svg.removeAttribute('height'); svg.setAttribute('focusable', 'false'); return document.importNode(svg, true); } catch { return null; } }

const FALLBACK = {
  /* ---------- 5.6 find-your-sign quiz ---------- */
  async quiz(el) {
    const Q = data.quiz; const card = el; const result = $('#quiz-result'); const examples = $('#quiz-examples');
    if (examples) (copy.get('quiz.examples') || []).forEach(x => { const d = document.createElement('div'); examples.appendChild(d); R.mountNeon(d, withState({ text: x.words, font: x.font, colour: x.colour, colours: null }), { fitW: .8, fitH: .6, lit: true, spill: .3 }); });
    if (!Q) { $('#quiz-start').hidden = true; return { __fallback: true, destroy() {}, setState() {} }; }
    const steps = Q.steps; const answers = {}; let stepI = 0;
    const sheet = ui.sheet({ title: t('quiz.h2', {}, 'Not sure what to say?'), qa: 'ix.quiz.sheet', modal: true, body: '<div class="hx-quiz__steps"></div>' });
    const body = () => sheet.body().querySelector('.hx-quiz__steps');
    function renderStep() {
      const s = steps[stepI]; const sel = answers[s.id];
      body().innerHTML = `<p class="hx-quiz__step">${esc(t('fallback.quizStep', { n: stepI + 1 }, '{n} of 3'))}</p><h3 class="hx-quiz__q">${esc(s.question)}</h3>
        <div class="hx-quiz__opts" role="group" aria-label="${esc(s.question)}">${s.options.map(o => `<button type="button" class="hx-quiz__opt" data-id="${o.id}" data-qa="ix.quiz.answer" aria-pressed="${sel === o.id}"><div class="ex"></div><span>${esc(o.label)}</span></button>`).join('')}</div>
        <div class="hx-quiz__nav"><button type="button" class="c-btn c-btn--ghost" data-qa="ix.quiz.back" ${stepI === 0 ? 'disabled' : ''}>${esc(t('fallback.quizBack', {}, 'Back'))}</button><button type="button" class="c-btn c-btn--primary" data-qa="ix.quiz.next" ${sel ? '' : 'disabled'}>${esc(stepI === 2 ? (result ? t('fallback.quizResult', {}, 'Three signs for you') : 'Light it up on the wall') : t('fallback.quizNext', {}, 'Next'))}</button></div>`;
      s.options.forEach((o, k) => { const ex = body().querySelectorAll('.ex')[k]; const words = (o.sample && o.sample[0]) || o.label; R.mountNeon(ex, withState({ text: words, font: s.id === 'mood' ? (Q.fonts[o.id] || [])[0] || 'soho' : 'soho', colour: s.id === 'mood' ? (Q.colours[o.id] || [])[0] || 'pink' : design.colour, colours: null }), { fitW: .8, fitH: .7, lit: true, spill: .25, strike: false }); });
    }
    body; sheet.body().addEventListener('click', e => {
      const o = e.target.closest('[data-qa="ix.quiz.answer"]'); if (o) { answers[steps[stepI].id] = o.dataset.id; $$('[data-qa="ix.quiz.answer"]', sheet.body()).forEach(x => x.setAttribute('aria-pressed', String(x === o))); $('[data-qa="ix.quiz.next"]', sheet.body()).disabled = false; return; }
      if (e.target.closest('[data-qa="ix.quiz.back"]')) { stepI = Math.max(0, stepI - 1); renderStep(); return; }
      if (e.target.closest('[data-qa="ix.quiz.next"]')) { if (stepI < 2) { stepI++; renderStep(); } else { sheet.close(); showResult(); } }
    });
    sheet.body().addEventListener('keydown', e => { if (e.key === 'Enter') { const o = e.target.closest('[data-qa="ix.quiz.answer"]'); if (o) { o.click(); $('[data-qa="ix.quiz.next"]', sheet.body()).click(); } } });
    function picks() {
      const room = answers.room, mood = answers.mood, wall = answers.wall; const bucket = (Q.words[room] && Q.words[room][mood]) || null; const wallOpt = steps[2].options.find(o => o.id === wall) || steps[2].options[1];
      const faces = ((Q.fonts[mood] || Q.fallback.fonts).filter(id => R.enabledFonts().some(f => f.id === id))).concat(Q.fallback.fonts); const cols = (Q.colours[mood] || Q.fallback.colours);
      const words = (bucket && bucket.length >= 3 ? bucket : Q.fallback.words).slice(); const scene = (steps[0].options.find(o => o.id === room) || {}).scene || 's01-living';
      return [0, 1, 2].map(i => { const w = words[(i + shuffle) % words.length]; const font = faces[i % faces.length], colour = cols[i % cols.length]; let st = withState({ text: w.join('\n'), font, colour, colours: null, scene, size: 'm' });
        const cards = pricing.sizeCards(st, scene).filter(c => c.id !== 'custom' && c.available && !c.quote); const target = wallOpt.targetCm || 100; const best = cards.reduce((b, c) => (!b || Math.abs(c.W - target) < Math.abs(b.W - target)) ? c : b, null); st = withState(Object.assign({}, st, { size: best ? best.id : (wallOpt.size || 'm') })); const p = pricing.price(st); return { state: st, price: p, scene }; });
    }
    let shuffle = 0;
    function showResult() {
      const p = picks(); const hash = `#quiz=${answers.room}.${answers.mood}.${answers.wall}`; try { history.replaceState(null, '', hash); } catch {}
      router.design.setDebounced(p[0].state, 'quiz', 300);   /* same contract as ix/quiz.js: the hero follows the first pick */
      if (!result) {   /* the quiz lives in the hero now: the first pick lights the hero wall, no separate result card */
        const f = p[0].state; heroInput.value = f.text; autosize(); setDesign({ text: f.text, font: f.font, colour: f.colour, colours: null, size: f.size }, { strike: true });
        analytics.track('quiz_complete', { room: answers.room, mood: answers.mood, wall: answers.wall });
        if (heroStage) hero.scrollIntoView({ block: 'start', behavior: R.reducedMotion() ? 'auto' : 'smooth' }); else location.href = builderLink(); return;
      }
      result.hidden = false; result.innerHTML = `<div class="hx-quiz__picks">${p.map((x, k) => `<article class="hx-quiz__pick" data-qa="ix.quiz.pick"><span class="tile__media" data-k="${k}"></span><b>${esc(x.state.text.replace(/\n/g, ' / '))}</b><span class="from">${x.price.kind === 'price' ? `${gbp(x.price.payable)} · ${esc(R.sizeOf(x.state.size).name)}` : esc(t('price.quote', {}, 'Quote'))}</span><a class="c-btn c-btn--primary" href="${router.builderLink(x.state)}" data-qa="ix.quiz.open">${esc(t('fallback.quizOpen', {}, 'Open in the designer'))}</a></article>`).join('')}</div>
        <div class="hx-quiz__actions"><button type="button" class="c-btn c-btn--ghost" data-qa="ix.quiz.reshuffle">${esc(t('fallback.quizReshuffle', {}, 'Try different words'))}</button><button type="button" class="c-btn c-btn--ghost" data-qa="ix.quiz.restart">${esc(t('quiz.start', {}, 'Find my sign · 3 questions'))}</button>
        <form class="hx-quiz__email" novalidate data-qa="ix.quiz.email"><div class="c-field"><label class="sr-only" for="qz-email">${esc(t('save.emailLabel', {}, 'Your email'))}</label><input id="qz-email" class="c-input" name="email" type="email" inputmode="email" autocomplete="email" placeholder="${esc(t('save.emailPlaceholder', {}, 'you@example.co.uk'))}" data-qa="ix.quiz.email.input"></div><button type="submit" class="c-btn c-btn--ghost" data-qa="ix.quiz.email.submit">${esc(t('fallback.quizEmail', {}, 'Email me these three'))}</button></form></div>`;
      p.forEach((x, k) => tile(result.querySelector(`.tile__media[data-k="${k}"]`), { scene: x.scene, text: x.state.text, font: x.state.font, colour: x.state.colour, fitW: .8, fitH: .55 }));
      forms.bind(result.querySelector('form'), { kind: 'quizEmail', qa: 'ix.quiz.email', extra: () => ({ picks: p.map(x => router.shareLink(x.state)).join('\n'), page: 'home' }), onSuccess: (res, f) => { const fm = result.querySelector('form'); const d = document.createElement('div'); fm.replaceWith(d); forms.renderSuccess(d, { ref: res.ref, local: res.local, title: t('fallback.quizEmailSent', { email: f.email }), body: '', qa: 'ix.quiz.email' }); } });
      analytics.track('quiz_complete', { room: answers.room, mood: answers.mood, wall: answers.wall });
      card.classList.add('has-result'); result.scrollIntoView({ block: 'nearest', behavior: R.reducedMotion() ? 'auto' : 'smooth' });
    }
    result && result.addEventListener('click', e => { if (e.target.closest('[data-qa="ix.quiz.reshuffle"]')) { shuffle++; showResult(); } if (e.target.closest('[data-qa="ix.quiz.restart"]')) { stepI = 0; renderStep(); sheet.open(e.target); } });
    $('#quiz-start').addEventListener('click', e => { stepI = 0; renderStep(); sheet.open(e.currentTarget); });
    const q2 = $('#quiz-start-2'); if (q2) q2.addEventListener('click', e => { stepI = 0; renderStep(); sheet.open(e.currentTarget); });
    const fromHash = () => { const m = location.hash.match(/#quiz=([a-z]+)\.([a-z]+)\.([a-z]+)/); if (m) { answers.room = m[1]; answers.mood = m[2]; answers.wall = m[3]; if (steps[0].options.some(o => o.id === m[1]) && steps[1].options.some(o => o.id === m[2]) && steps[2].options.some(o => o.id === m[3])) showResult(); } };
    fromHash(); window.addEventListener('hashchange', fromHash);
    return { __fallback: true, destroy() {}, setState() {} };
  },

  /* ---------- 5.12 workshop process (paper): a five-chapter strip ---------- */
  async process(el) {
    const CH = ['drawn', 'bent', 'mounted', 'tested', 'boxed']; const files = ['01-drawn', '02-bent', '03-mounted', '04-tested', '05-boxed']; let cur = 0, playing = !R.reducedMotion(), timer = null;
    const svgs = await Promise.all(files.map(f => inlineSvg(`/lit-neon-preview/rework/assets/img/process/${f}.svg`)));
    el.classList.add('hx-process'); el.innerHTML = `<div class="hx-process__bar"><p class="hx-process__label">${icon('drawing', 'ic--sm')} ${esc(t('process.label', {}, t('fallback.processLabel')))} <span class="c-pill c-pill--illustration" data-caption="illustration">${esc(t('pills.illustration', {}, 'Illustration'))}</span></p><button type="button" class="c-btn c-btn--ghost c-btn--sm" data-qa="ix.process.pause" aria-pressed="${!playing}">${icon(playing ? 'pause' : 'play')} <span class="label">${esc(playing ? t('fallback.processPause', {}, 'Pause') : t('fallback.processPlay', {}, 'Play'))}</span></button></div>
      <ol class="hx-process__strip" role="tablist" aria-label="Chapters">${CH.map((c, k) => `<li class="hx-process__chapter" data-k="${k}" role="tab" tabindex="${k === 0 ? 0 : -1}" aria-selected="${k === 0}" data-qa="ix.process.chapter"><div class="hx-process__art" data-k="${k}"></div><div class="hx-process__meta"><span class="n">${k + 1}</span><span><b>${esc(t(`process.chapters.${c}`, {}, c))}</b><small>${esc(fillD2(t(`fallback.processFacts.${c}`, { fact: facts.get('benchTestHours') || '' })))}</small></span></div></li>`).join('')}</ol>`;
    const arts = $$('.hx-process__art', el);
    function fillSlots(svg) {
      if (!svg) return; const res = R.resolve(withState({ size: 'm' })); const f = res.font; const words = (res.words || design.text || '').replace(/\n/g, ' '); const d = res.dims || { W: 60, H: 20 };
      const textEl = (cls, style) => { const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text'); txt.setAttribute('x', '190'); txt.setAttribute('y', '198'); txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-family', `'${f.family}', cursive`); if (f.weight) txt.setAttribute('font-weight', String(f.weight)); txt.setAttribute('font-size', String(Math.max(22, Math.min(64, 1500 / Math.max(8, words.length))))); txt.setAttribute('class', cls); txt.setAttribute('style', style); txt.textContent = words; return txt; };
      const put = (id, cls, style) => { const g = svg.querySelector('#' + id); if (!g) return; g.innerHTML = ''; g.appendChild(textEl(cls, style)); };
      put('slot-sign', 'ink', 'fill:none;stroke:var(--draft);stroke-width:1.4'); put('slot-tube', 'tube', 'fill:none;stroke:var(--room);stroke-width:4'); put('slot-tube-mounted', 'tube', 'fill:none;stroke:var(--room);stroke-width:4'); put('slot-tube-lit', 'tube', `fill:none;stroke:${R.coreOf(res.colour)};stroke-width:4;filter:drop-shadow(0 0 6px ${res.colour.hex})`);
      const set = (id, v) => { const n = svg.querySelector('#' + id); if (n) n.textContent = v; };
      set('slot-dim-w', `${d.W} cm`); set('slot-dim-h', `${d.H} cm`); set('slot-tb-title', words.slice(0, 22)); set('slot-tb-size', fmtDims(d.W, d.H)); set('slot-tb-led', `${(Math.round(R.flexMetres(res) * 10) / 10).toFixed(1)} m`); const w = sheetMod.wattsFor(R.flexMetres(res)); set('slot-tb-power', w != null ? `${w} W` : '—'); set('slot-tb-date', clock.format(clock.now())); set('slot-tb-by', 'Lit Neon'); set('slot-watts', w != null ? `${w} W` : '—'); set('slot-hours', facts.has('benchTestHours') ? `${facts.value('benchTestHours')} h` : '');
    }
    function paintAll() { svgs.forEach((svg, k) => { if (!svg) return; fillSlots(svg); if (!arts[k].contains(svg)) arts[k].appendChild(svg); }); }
    function show(k, { scroll = true } = {}) { cur = k; $$('.hx-process__chapter', el).forEach((c, i) => { c.setAttribute('aria-selected', String(i === k)); c.tabIndex = i === k ? 0 : -1; c.classList.toggle('is-done', i < k); c.classList.toggle('is-playing', i === k && playing); if (i === k) { const a = c.querySelector('.hx-process__art'); a.classList.remove('is-playing'); void a.offsetWidth; if (playing) a.classList.add('is-playing'); } }); if (scroll) { const c = $$('.hx-process__chapter', el)[k]; const strip = $('.hx-process__strip', el); if (strip.scrollWidth > strip.clientWidth + 1) strip.scrollTo({ left: c.offsetLeft - 16, behavior: R.reducedMotion() ? 'auto' : 'smooth' }); } }
    function setPlaying(on) { playing = on && !R.reducedMotion(); clearInterval(timer); if (playing) timer = setInterval(() => show((cur + 1) % CH.length), 3200); const b = $('[data-qa="ix.process.pause"]', el); b.setAttribute('aria-pressed', String(!playing)); b.innerHTML = `${icon(playing ? 'pause' : 'play')} <span class="label">${esc(playing ? t('fallback.processPause', {}, 'Pause') : t('fallback.processPlay', {}, 'Play'))}</span>`; el.dataset.playing = String(playing); show(cur, { scroll: false }); }
    el.addEventListener('click', e => { const c = e.target.closest('.hx-process__chapter'); if (c) { show(+c.dataset.k); if (playing) setPlaying(true); } if (e.target.closest('[data-qa="ix.process.pause"]')) setPlaying(!playing); });
    el.addEventListener('keydown', e => { const c = e.target.closest('.hx-process__chapter'); if (!c) return; if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const k = (cur + (e.key === 'ArrowRight' ? 1 : CH.length - 1)) % CH.length; show(k); $$('.hx-process__chapter', el)[k].focus(); } });
    const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) { clearInterval(timer); timer = null; } else if (playing && !timer) timer = setInterval(() => show((cur + 1) % CH.length), 3200); })); io.observe(el);
    paintAll(); show(0, { scroll: false }); el.dataset.playing = String(playing); if (playing) timer = setInterval(() => show((cur + 1) % CH.length), 3200);
    return { __fallback: true, destroy: () => { clearInterval(timer); io.disconnect(); }, setState: () => paintAll() };
  },

};

/* ============================================================ 5 · 6 · 10 mounts ============================================================ */
const ixMounts = Promise.all([FALLBACK.quiz($('#hero-panel')).then(api => { IX.quiz = api; })]);   /* world 2026-10-15: the illustrated process strip is gone */

/* ============================================================== 7 · BESTSELLERS: removed from the homepage (owner, 2026-10-16); the rail lives on /lit-neon-preview/rework/shop.html ============================================================== */

/* ============================================================== 9 · YOUR LOGO ============================================================== */
function logoBand() {
  if (!$('#logo-bands')) { if ($('#logo-plate') && !$('#logo-plate').firstChild) $('#logo-plate').innerHTML = plateHtml('s11-shopwindow', { w: 1600, cls: '' }); return; }
  if (!$('#logo-plate').firstChild) $('#logo-plate').innerHTML = plateHtml('s11-shopwindow', { w: 1600, cls: '' });
  const b = pricing.bands(); const small = b.find(x => x.size === 's' && x.from != null), large = b.find(x => x.size === 'l' && x.from != null) || b.find(x => x.size === 'xl' && x.from != null);
  const bands = copy.get('logo.bands') || []; const a = small ? gbp(small.from) : '', bb = large ? gbp(large.from) : '';
  $('#logo-bands').innerHTML = bands.map((x, i) => `<div class="band" data-qa="home.logo.band" data-i="${i}"><b class="band__range">${esc(copy.fill(x.range, { a, b: bb }))}</b><span class="band__use">${esc(x.use)}</span></div>`).join('') + `<p class="band__note">${esc(t('logo.bandsNote'))}</p>`;
}
logoBand();

/* ============================================================== 12 · MADE HERE ============================================================== */
(function made() {
  const cmp = copy.get('made.compare') || {}; const rows = cmp.rows || [];
  if (!$('#compare-table')) return;
  $('#compare-table').innerHTML = `<thead><tr><th scope="col"></th><th scope="col">${esc(cmp.colUs || 'Lit Neon')}</th><th scope="col">${esc(cmp.colThem || 'Typically')}</th></tr></thead><tbody>${rows.map(r => `<tr data-qa="home.compare.row"><td>${esc(r.label)}</td><td class="us">${esc(fillD2(r.us))}</td><td class="them">${esc(r.them)}</td></tr>`).join('')}</tbody>`;
})();

/* ============================================================== 14 · REVIEWS ============================================================== */
(function reviews() { const r = facts.value('reviews'); const count = r && typeof r === 'object' ? (r.count || 0) : 0; const el = $('#home-reviews'); if (count > 0) { el.hidden = false; el.className = 'section night reviews'; el.innerHTML = `<div class="wrap"><p class="t-eyebrow">Reviews</p><h2>What our first customers say</h2><p class="t-lead">${esc(facts.get('reviews'))}</p></div>`; } })();

/* ============================================================== 15 · FAQ ============================================================== */
let repaintFaq = () => {};
(function faq() {
  const Q = data.faq; const qs = Q.questions.filter(q => q.showOnHome).slice(0, 6);
  const raw = qs.map(q => { const v = (q.variants || []).find(x => x.when && x.when.startsWith('fact:') && facts.has(x.when.slice(5))); return v ? v.a : q.a; });
  const resolved = qs.map((q, i) => ({ ...q, a: fillD2(raw[i]) }));
  repaintFaq = () => { qs.forEach((q, i) => { const el = $(`#home-${q.id} .c-acc__body > p`); if (el) el.textContent = fillD2(raw[i]); }); };
  $('#faq-acc').innerHTML = resolved.map(q => `<details id="home-${esc(q.id)}" data-id="${esc(q.id)}" data-cat="${esc(q.category)}" data-qa="home.faq.q"><summary data-qa="home.faq.summary"><span class="label">${esc(q.q)}</span>${icon('chevron-down')}</summary><div class="c-acc__body"><p>${esc(q.a)}</p>${(q.links || []).length ? `<div class="links">${q.links.map(l => `<a href="/lit-neon-preview/rework/${esc(l.href)}" data-qa="home.faq.link">${esc(l.label)}</a>`).join('')}</div>` : ''}<a class="deep" href="/lit-neon-preview/rework/help.html#${esc(q.id)}" data-qa="home.faq.deep">${icon('link', 'ic--sm')} ${esc(t('faq.copyLink', {}, 'Link to this answer'))}</a></div></details>`).join('');
  ui.accordion($('#faq-acc'), { single: true, deepLink: false });
  // chrome.contactHref() returns { href, kind, label, icon, external } (core/chrome.js); never interpolate the object itself
  const contact = chrome.contactHref() || {}; const href = typeof contact === 'string' ? contact : (contact.href || '/lit-neon-preview/rework/contact.html');
  const kind = contact.kind || (/wa\.me/.test(href) ? 'whatsapp' : /^mailto:/.test(href) ? 'email' : 'contact'); const ext = contact.external || /wa\.me/.test(href);
  if ($('#faq-ask') && !$('#faq-ask').hidden) $('#faq-ask').innerHTML = `<h3>${esc(t('faq.askTitle', {}, 'Still stuck?'))}</h3><p>${esc(t('faq.askBody'))}</p>${facts.has('supportHours') ? `<span class="hours">${esc(facts.get('supportHours'))}</span>` : ''}${facts.has('replyHours') ? `<span class="hours">${esc(facts.get('replyHours'))}</span>` : ''}<a class="c-btn c-btn--ghost" href="${esc(href)}" data-qa="home.faq.ask.cta" data-kind="${kind}"${ext ? ' target="_blank" rel="noopener"' : ''}>${icon(kind === 'whatsapp' ? 'whatsapp' : kind === 'email' ? 'mail' : 'chat')} ${esc(kind === 'whatsapp' ? t('nav.whatsapp', {}, 'Message us on WhatsApp') : kind === 'email' ? t('nav.email', {}, 'Email us') : t('faq.askCta', {}, 'Contact us'))}</a>`;
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: resolved.map(q => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } })) };
  const s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(ld); document.head.appendChild(s);
})();

/* ================================================================ wiring ================================================================ */
function refreshAll() { R.refitAll(); renderSheet(); paintShopMeta(); logoBand(); repaintFaq(); }
window.addEventListener('resize', debounce(() => R.refitAll(), 120));
await ixMounts;
document.dispatchEvent(new CustomEvent('ln:home-ready'));
window.__home = { get design() { return design; }, setDesign, heroStage, ix: IX, data };
