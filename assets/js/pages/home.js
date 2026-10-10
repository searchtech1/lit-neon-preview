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
    const [designs, collections, faq, guides, quiz] = await Promise.all(['designs', 'collections', 'faq', 'guides', 'quiz'].map(n => loadJson(`/lit-neon-preview/data/${n}.json`)));
    return { designs: designs || { designs: [] }, collections: collections || { collections: [], homeTiles: {}, businessVerticals: [] }, faq: faq || { questions: [], homeChips: [] }, guides: guides || { guides: [] }, quiz: quiz || null };
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
$('#best-prev').innerHTML = icon('chevron-left'); $('#best-next').innerHTML = icon('chevron-right');
try { $('link[rel="canonical"]').href = location.origin + '/lit-neon-preview/'; $('meta[property="og:image"]').content = location.origin + '/lit-neon-preview/assets/img/og/index.jpg'; } catch {}

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
  const stem = '/lit-neon-preview/assets/img/' + P[variant]; const fmts = P.formats || ['jpg'];
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
const heroStage = stage.mount($('#hero-stage'), { frame: 'hero', scene: 's01-living', design, qa: 'home.hero', priority: 'high', interactive: true, pill: false });
$('#hero-stage').insertAdjacentHTML('afterend', `<span class="c-pill c-pill--rendered hero__pill" data-caption="rendered">${esc(t('pills.rendered', {}, 'Rendered preview'))}</span>`);
if (!router.design.get()) router.design.set(design, 'hero');   /* first visit: the chrome's footer capture and the sticky CTA read the store */
if (isMobile()) $('#hero-input').closest('.hero__field').appendChild($('#hero-lettering'));   /* phone: the lettering sheet button sits beside the input, swatches get the row */
heroStage.on('change', e => { design.pos = e.pos; router.design.setDebounced(design, 'hero', 300); });
/* s01's measured entry has no calib.topY, so the stage cannot keep the sofa in frame by itself on a tall landscape
   stage; anchoring the sign 33 cm above the sofa back keeps the furniture in the bottom quarter (§3.8.6). */
/* Stacked hero (phones/tablets): a long sign (a typed line, or the quiz's first pick) frames wider, the crop pins to the plate
   top and the sign rises into the copy ("Signs from …"). Lower it in small steps until it clears the copy block, measured
   with transitions off; the result is cached per words/size/viewport so the 'frame' event that each move fires cannot loop. */
let anchorKey = '', anchorY = null;
const heroAnchor = () => {
  const fi = heroStage.frameInfo(); if (!fi || hero.classList.contains('kbd')) return;
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
heroStage.ready.then(() => { heroLayout(); heroAnchor(); heroStage.on('frame', debounce(() => { heroLayout(); heroAnchor(); }, 50)); });
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
  heroStage.setDesign(design); if (strike) heroStage.strike();
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
  heroCta.href = builderLink();
  $$('#hero-swatches [data-id]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === design.colour)));
  $$('#hero-chips [data-id]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === design.font)));
  const fp = fromPrice(); $('[data-qa="home.hero.from"]').textContent = fp != null ? t('hero.fromPrice', { from: gbp(fp) }) : '';
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
  function enter() { if (on || !isTablet()) return; on = true; hero.classList.add('kbd'); heroStage.setFrame('room'); layout(); requestAnimationFrame(layout); vv && (vv.addEventListener('resize', layout), vv.addEventListener('scroll', layout)); }
  function exit() { if (!on) return; on = false; hero.classList.remove('kbd'); hero.style.removeProperty('--vv-h'); hero.style.removeProperty('--kbd-panel-h'); hero.style.removeProperty('--kbd-panel-top'); heroStage.setFrame('hero'); vv && (vv.removeEventListener('resize', layout), vv.removeEventListener('scroll', layout)); }
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
const WAYS = [{ scene: 's01-living', href: '/lit-neon-preview/create.html', qa: 'home.ways.design', font: 'soho', colour: 'pink', live: true }, { scene: 's11-shopwindow', href: '/lit-neon-preview/upload.html', qa: 'home.ways.upload', font: 'shoreditch', colour: 'red' }, { scene: 's02-bedroom', href: '/lit-neon-preview/shop.html', qa: 'home.ways.shop', font: 'brighton', colour: 'ice' }];
$('#ways-grid').innerHTML = WAYS.map((w, i) => `<article class="way"><div class="way__tile" data-i="${i}"></div><h3 class="way__title">${esc(ways[i]?.title || '')}</h3><p class="way__line">${esc(ways[i]?.line || '')}</p><a class="c-btn c-btn--ghost" href="${w.href}" data-qa="${w.qa}">${esc(ways[i]?.cta || '')}</a></article>`).join('');
const wayTiles = WAYS.map((w, i) => { const el = $(`.way__tile[data-i="${i}"]`); const n = tile(el, { scene: w.scene, text: ways[i]?.words || design.text, font: w.font, colour: w.colour, lit: !hoverable() }); const art = el.closest('.way'); art.addEventListener('pointerenter', () => n.setLit(true)); art.addEventListener('pointerleave', () => { if (hoverable()) n.setLit(false); }); art.addEventListener('focusin', () => n.setLit(true)); art.addEventListener('focusout', () => { if (hoverable()) n.setLit(false); }); return { ...w, neon: n }; });
onState(s => { const w = wayTiles[0]; w.neon.update(withState({ text: s.text, font: s.font, colour: s.colour, scene: 's01-living' })); $('[data-qa="home.ways.design"]').href = builderLink(); });
$('[data-qa="home.ways.design"]').href = builderLink();

/* ========================================================== 3 · WHERE'S IT GOING ========================================================== */
const C = data.collections; const byId = id => C.collections.find(c => c.id === id); const countFor = id => data.designs.designs.filter(d => (d.collections || []).includes(id)).length;
function tileRow(kind, id) {
  if (kind === 'business') { const v = C.businessVerticals.find(x => x.id === id); if (!v) return null; return { href: `/lit-neon-preview/business.html#${v.anchor}`, scene: v.scene, words: v.words, font: v.font, colour: v.colour, title: v.name, line: v.line, meta: t('shop.tileBusiness'), collection: `business:${v.id}` }; }
  const c = byId(id); if (!c) return null; const n = countFor(id); const d = data.designs.designs.find(x => x.id === c.prefilledDesign); const from = fromAny(d || { lines: [c.tile.words], font: c.defaults.font, colour: c.defaults.colour });
  return { href: `/lit-neon-preview/collection.html?c=${encodeURIComponent(c.id)}`, scene: c.scene, words: c.tile.words, font: c.defaults.font, colour: c.defaults.colour, title: c.name, line: c.tile.line, meta: from != null ? t(n === 1 ? 'shop.tileMetaOne' : 'shop.tileMeta', { from: gbp(from), n }) : '', collection: c.id };
}
const shopNeons = []; const shopRows = {};
for (const kind of ['room', 'occasion', 'business']) {
  const rows = shopRows[kind] = (C.homeTiles[kind] || []).map(id => tileRow(kind, id)).filter(Boolean);
  $(`#shop-panel-${kind}`).innerHTML = rows.map((r, i) => `<a class="tile" href="${r.href}" data-qa="home.shop.tile" data-collection="${esc(r.collection)}"><span class="tile__media" data-k="${kind}" data-i="${i}"></span><span class="tile__title">${esc(r.title)}</span><span class="tile__line">${esc(r.line)}</span><span class="tile__meta" data-i="${i}">${esc(r.meta)}</span></a>`).join('');
  rows.forEach((r, i) => shopNeons.push(tile($(`#shop-panel-${kind} .tile__media[data-i="${i}"]`), { scene: r.scene, text: r.words, font: r.font, colour: r.colour, fitW: .8, fitH: .55 })));
}
function paintShopMeta() { for (const kind of ['room', 'occasion', 'business']) { const rows = (C.homeTiles[kind] || []).map(id => tileRow(kind, id)).filter(Boolean); rows.forEach((r, i) => { const m = $(`#shop-panel-${kind} .tile__meta[data-i="${i}"]`); if (m) m.textContent = r.meta; }); } }
ui.tabs($('#shop-tabs'), { onChange: () => R.refitAll() });

/* ============================================================ 4 · HOW IT WORKS ============================================================ */
$('#how-list').innerHTML = (copy.get('how.steps') || []).map(s => `<li><div><h3>${esc(s.title)}</h3><p>${esc(s.line)}</p></div></li>`).join('');
const howSheet = $('#how-sheet');
const renderSheet = () => { sheetMod.render(howSheet, withState({ size: 'm' }), { lite: true }); };
new ResizeObserver(() => renderSheet()).observe(howSheet);
onState(() => { renderSheet(); $('#how-cta').href = builderLink(); });
$('#how-cta').href = builderLink();
$('#how-pdf').addEventListener('click', async e => { const b = e.currentTarget; ui.setBusy(b, true); try { await drawing.download(withState({ size: 'm' })); } finally { ui.setBusy(b, false); } });

/* =============================================================== ix loader =============================================================== */
const IX = {};
async function mountIx(name, el, opts = {}) {
  if (!el) return null;
  let mod = null;
  try { mod = await import(`ix/${name}.js`); } catch { mod = null; }
  const fn = mod && (mod.mount || (mod.default && mod.default.mount));
  let api = null;
  if (fn) {
    for (const css of ['_ix', name]) if (!document.querySelector(`link[href="/lit-neon-preview/assets/css/ix/${css}.css"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = `/lit-neon-preview/assets/css/ix/${css}.css`; document.head.appendChild(l); }
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
  /* ---------- 5.3 real-size guide ---------- */
  async 'size-guide'(el) {
    const sceneIds = (el.dataset.scenes || 's01-living,s02-bedroom,s04-homebar').split(',').map(s => s.trim()).filter(id => stage.getScene(id));
    const sizes = R.OPTIONS.sizes; let sizeI = Math.max(0, sizes.findIndex(s => s.id === design.size)); let sceneId = sceneIds[0]; let night = true, figure = false;
    el.classList.add('hx-size'); el.innerHTML = `<div class="hx-size__stage" data-qa="ix.size.stage"></div>
      <div class="hx-size__panel">
        <div class="c-chips" role="group" aria-label="${esc(t('fallback.sizeScene', {}, 'Scene'))}">${sceneIds.map(id => `<button type="button" class="c-chip" data-id="${id}" data-qa="ix.size.scene" aria-pressed="${id === sceneId}">${esc(t(`size.scenes.${id.split('-')[1] === 'living' ? 'sofa' : id.split('-')[1] === 'bedroom' ? 'bed' : id.split('-')[1] === 'homebar' ? 'bar' : 'kitchen'}`, {}, stage.getScene(id).name))}</button>`).join('')}</div>
        <div class="c-range" data-qa="ix.size.range"><label class="label" for="hx-size-range"><span>${esc(t('fallback.sizeSlider', {}, 'Size'))}</span><span class="readout"></span></label><input id="hx-size-range" type="range" min="0" max="${sizes.length - 1}" step="1" value="${sizeI}" data-qa="ix.size.slider"></div>
        <div class="hx-size__toggles">${segHtml('ix.size.daynight', [{ id: 'night', name: t('fallback.sizeNight', {}, 'Night') }, { id: 'day', name: t('fallback.sizeDay', {}, 'Day') }], 'night', 'Day or night')}<label class="c-check"><input type="checkbox" data-qa="ix.size.figure"><span>${esc(t('fallback.sizeFigure', {}, 'Show a person (175 cm)'))}</span></label></div>
        <div class="hx-size__readout" data-qa="ix.size.readout" aria-live="polite"><b class="hx-size__name"></b><span class="hx-size__dims"></span><span class="hx-size__verdict"></span><span class="hx-size__price"></span></div>
        <a class="c-btn c-btn--primary c-btn--lg" href="/lit-neon-preview/create.html" data-qa="ix.size.cta">${esc(t('fallback.sizeCta', {}, 'Design at this size'))}</a>
      </div>`;
    const head = el.closest('.size__layout')?.querySelector('.size__head'); if (head) $('.hx-size__panel', el).prepend(head);
    const st = stage.mount($('.hx-size__stage', el), { frame: 'guide', scene: sceneId, design: withState({ size: sizes[sizeI].id }), qa: 'ix.size', interactive: false });
    const fig = document.createElement('div'); fig.className = 'hx-figure'; fig.hidden = true; fig.innerHTML = `<span>${esc(t('fallback.sizeFigureLabel', {}, '175 cm'))}</span><svg viewBox="0 0 40 175" aria-hidden="true"><circle cx="20" cy="12" r="10"/><path d="M20 22v62M20 84l-12 70M20 84l12 70M20 34l-16 30M20 34l16 30"/></svg>`; $('.hx-size__stage', el).appendChild(fig);
    const range = ui.range($('.c-range', el), { ticks: sizes.map(s => s.name.replace('Extra large', 'XL')), text: v => `${sizes[v].name}: ${(() => { const c = cards()[v]; return c ? `${c.W} by ${c.H} centimetres` : ''; })()}`, onInput: v => { sizeI = v; paint(); } });
    const cards = () => pricing.sizeCards(withState({ size: sizes[sizeI].id }), st.scene || sceneId).filter(c => c.id !== 'custom');
    function placeFigure() { const fi = st.frameInfo(); const sc = st.scene; if (!fi || !sc || !figure) { fig.hidden = true; return; } const o = fi.orientation; const [, PH] = (o === 'portrait' && sc.aspect.portrait) ? sc.aspect.portrait : sc.aspect.landscape; const floorY = (sc.floorY != null ? sc.floorY : .8) * PH; const k = fi.k; const bottom = (floorY - fi.crop.y) * k; const h = 175 * fi.ppc; const box = el.querySelector('.hx-size__stage').getBoundingClientRect(); fig.hidden = false; Object.assign(fig.style, { left: Math.max(8, box.width * .08) + 'px', top: Math.min(box.height - 8, bottom) - h + 'px', height: h + 'px', width: h * 40 / 175 + 'px' }); }
    function paint() {
      const s = sizes[sizeI]; st.setDesign(withState({ size: s.id })); const c = cards()[sizeI]; range.paint();
      $('.hx-size__name', el).textContent = s.name; $('.hx-size__dims', el).textContent = c ? `${fmtDims(c.W, c.H)} (${c.inches[0]} × ${c.inches[1]} in)` : '';
      const v = $('.hx-size__verdict', el); if (c && c.quote) { v.className = 'hx-size__verdict is-quote'; v.innerHTML = `<span>${esc(t('fallback.sizeQuote'))}</span><button type="button" class="c-btn c-btn--ghost c-btn--sm" data-qa="ix.size.fix">${esc(t('fallback.sizeUseLarge', {}, 'Use Large'))}</button>`; } else { v.className = 'hx-size__verdict'; v.textContent = c ? c.verdict : ''; }
      $('.hx-size__price', el).innerHTML = c && c.payable != null ? `${gbp(c.payable)}${c.promoLine ? `<small>${esc(c.promoLine)}</small>` : ''}` : (c && !c.available ? `<small>${esc(c.reason || 'Not available in this lettering at this size')}</small>` : '');
      $('[data-qa="ix.size.cta"]', el).href = builderLink({}, { size: s.id, scene: sceneId });
      placeFigure();
    }
    st.on('frame', placeFigure);
    el.addEventListener('click', e => {
      const sc = e.target.closest('[data-qa="ix.size.scene"]'); if (sc) { sceneId = sc.dataset.id; $$('[data-qa="ix.size.scene"]', el).forEach(x => x.setAttribute('aria-pressed', String(x === sc))); st.setScene(sceneId); st.ready.then(paint); setTimeout(paint, 50); return; }
      const dn = e.target.closest('[data-qa="ix.size.daynight"]'); if (dn) { night = dn.dataset.id === 'night'; $$('[data-qa="ix.size.daynight"]', el).forEach(x => x.setAttribute('aria-pressed', String(x === dn))); st.setView({ night, on: true }); return; }
      if (e.target.closest('[data-qa="ix.size.fix"]')) { sizeI = sizes.findIndex(s => s.id === 'l'); range.set(sizeI); paint(); }
    });
    $('[data-qa="ix.size.figure"]', el).addEventListener('change', e => { figure = e.target.checked; el.querySelector('.hx-size__stage').classList.toggle('figure', figure); placeFigure(); });
    el.querySelector('input[type=range]').addEventListener('change', () => setDesign({ size: sizes[sizeI].id }, { source: 'hero' }));
    await st.ready; paint();
    return { __fallback: true, destroy: () => st.destroy(), setState: s => { if (s.size && s.size !== 'custom') { const i = sizes.findIndex(x => x.id === s.size); if (i >= 0 && i !== sizeI) { sizeI = i; range.set(i); } } paint(); } };
  },

  /* ---------- 5.1 tube jacket demo ---------- */
  async jacket(el) {
    let colour = design.colour, lit = false;
    const colourOf = id => R.colourOf(id);
    el.classList.add('hx-jacket'); el.innerHTML = `
      <div class="hx-jacket__tile"><div class="hx-jacket__stage" data-qa="ix.jacket.tile" data-jacket="white"></div><p class="hx-jacket__cap"><b>${esc(t('fallback.jacketWhite', {}, 'White jacket'))}</b><span>${esc(t('fallback.offCaption', {}, 'Looks white when off'))}</span></p></div>
      <div class="hx-jacket__tile"><div class="hx-jacket__stage" data-qa="ix.jacket.tile" data-jacket="colour"></div><p class="hx-jacket__cap"><b>${esc(t('fallback.jacketColour', {}, 'Coloured jacket'))}</b><span class="cap-on">${esc(t('fallback.onCaption', {}, 'Keeps its colour by day'))}</span></p></div>
      <div class="hx-jacket__controls">
        <div class="hx-jacket__seg">${segHtml('ix.jacket.lights', [{ id: 'off', name: t('fallback.lightsOff', {}, 'Lights off') }, { id: 'on', name: t('fallback.lightsOn', {}, 'Lights on') }], 'off', 'Lights off or on')}</div>
        <div class="c-swatches" role="group" aria-label="${esc(t('hero.colour', {}, 'Tube colour'))}">${swatchesHtml('ix.jacket.swatch', colour)}</div>
        <a class="c-btn c-btn--primary" href="/lit-neon-preview/create.html" data-qa="ix.jacket.cta">${esc(t('fallback.jacketCta', {}, 'Pick this colour in the designer'))}</a>
      </div>`;
    const mk = jacket => stage.mount($(`.hx-jacket__stage[data-jacket="${jacket}"]`, el), { frame: 'card', scene: lit ? 's00-studio-dark' : 's00-studio-light', design: withState({ jacket, colour }), view: { night: lit, on: lit }, qa: `ix.jacket.${jacket}`, interactive: false, rulers: false, relight: false });
    const A = mk('white'), B = mk('colour');
    function paint() {
      const c = colourOf(colour); const noJacket = !!c.rgb;
      for (const [s, jacket] of [[A, 'white'], [B, 'colour']]) { s.setScene(lit ? 's00-studio-dark' : 's00-studio-light'); s.setDesign(withState({ jacket: noJacket ? 'white' : jacket, colour, night: lit, on: lit })); s.el.dataset.state = lit ? 'on' : 'off'; }
      B.el.closest('.hx-jacket__tile').classList.toggle('is-unavailable', noJacket); $('.cap-on', el).textContent = noJacket ? t('fallback.whiteOnly', {}, 'White jacket only') : t('fallback.onCaption', {}, 'Keeps its colour by day');
      $$('[data-qa="ix.jacket.swatch"]', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === colour)));
      $('[data-qa="ix.jacket.cta"]', el).href = builderLink({}, { colour, jacket: noJacket ? 'white' : 'colour', colours: null });
    }
    el.addEventListener('click', e => {
      const sw = e.target.closest('[data-qa="ix.jacket.swatch"]'); if (sw) { colour = sw.dataset.id; paint(); [A, B].forEach(s => s.strike()); return; }
      const sg = e.target.closest('[data-qa="ix.jacket.lights"]'); if (sg) { lit = sg.dataset.id === 'on'; $$('[data-qa="ix.jacket.lights"]', el).forEach(x => x.setAttribute('aria-pressed', String(x === sg))); paint(); }
    });
    await Promise.all([A.ready, B.ready]); paint();
    return { __fallback: true, destroy: () => { A.destroy(); B.destroy(); }, setState: s => { if (s.colour && s.colour !== colour) colour = s.colour; paint(); } };
  },

  /* ---------- 5.4 static vs RGB effects ---------- */
  async effects(el) {
    const CYCLE = ['red', 'green', 'blue', 'ice', 'warm', 'violet', 'yellow']; const gradient = facts.has('rgbGradient'); let playing = !R.reducedMotion(), i = 0, timer = null;
    const scene = el.dataset.scene || 's12-gaming';
    const delta = () => { const a = pricing.price(withState({ colour: 'rgb', colours: null })), b = pricing.price(withState({ colour: design.colour === 'rgb' ? 'warm' : design.colour, colours: null })); return a.kind === 'price' && b.kind === 'price' ? fmtDelta(a.payable - b.payable) : ''; };
    const cards = [{ id: 'static', name: t('fallback.effectsStatic', {}, 'One colour'), line: t('fallback.effectsStaticLine'), colour: () => (design.colour === 'rgb' ? 'warm' : design.colour), d: () => fmtDelta(0) }, { id: 'changing', name: t('fallback.effectsChanging', {}, 'Colour changing'), line: t('fallback.effectsChangingLine'), colour: () => CYCLE[i % CYCLE.length], d: delta }];
    if (gradient) cards.push({ id: 'gradient', name: t('fallback.effectsGradient', {}, 'Gradient'), line: t('fallback.effectsGradientLine'), colour: () => 'rgb', d: delta });
    el.classList.add('hx-effects'); el.dataset.playing = String(playing);
    el.innerHTML = cards.map(c => `<article class="hx-effects__card" data-id="${c.id}" data-qa="ix.effects.card"><div class="hx-effects__tile">${plateHtml(scene, { w: 600 })}<div class="ln-tile"></div>${pillRendered()}</div><div class="hx-effects__head"><b>${esc(c.name)}</b><span class="hx-effects__delta" data-qa="ix.effects.delta"></span></div><p class="hx-effects__line">${esc(c.line)}</p>${c.id === 'changing' ? `<div class="hx-effects__strip" aria-hidden="true">${CYCLE.map(id => `<i style="--c:${R.colourOf(id).hex}"></i>`).join('')}</div><p class="t-caption">${esc(t('fallback.effectsOffNote'))}</p>` : ''}<a class="c-btn c-btn--ghost" href="/lit-neon-preview/create.html" data-qa="ix.effects.choose">${esc(t('fallback.effectsChoose', {}, 'Choose this'))}</a></article>`).join('')
      + `<button type="button" class="c-btn c-btn--ghost hx-effects__pause" data-qa="ix.effects.pause" aria-pressed="${!playing}">${icon(playing ? 'pause' : 'play')} <span class="label">${esc(playing ? t('fallback.effectsPause', {}, 'Pause animations') : t('fallback.effectsPlay', {}, 'Play animations'))}</span></button>`;
    const neons = cards.map((c, k) => { const n = R.mountNeon($$('.hx-effects__tile .ln-tile', el)[k], withState({ colour: c.colour(), colours: null, scene }), { fitW: .8, fitH: .55, lit: true, spill: .35 }); if (c.id === 'gradient') n.el.classList.add('hue-cycle'); return n; });
    function paint() { cards.forEach((c, k) => { neons[k].update(withState({ colour: c.colour(), colours: null, scene })); const d = $$('[data-qa="ix.effects.delta"]', el)[k]; d.textContent = t('fallback.effectsDelta', { delta: c.d(), size: R.sizeOf(design.size).name }); $$('[data-qa="ix.effects.choose"]', el)[k].href = builderLink({}, { colour: c.id === 'static' ? c.colour() : 'rgb', colours: null }); }); }
    function tick() { if (!playing) return; i++; const k = cards.findIndex(c => c.id === 'changing'); neons[k].update(withState({ colour: CYCLE[i % CYCLE.length], colours: null, scene })); }
    function setPlaying(on) { playing = on && !R.reducedMotion(); el.dataset.playing = String(playing); clearInterval(timer); if (playing) timer = setInterval(tick, 1200); const b = $('[data-qa="ix.effects.pause"]', el); b.setAttribute('aria-pressed', String(!playing)); b.innerHTML = `${icon(playing ? 'pause' : 'play')} <span class="label">${esc(playing ? t('fallback.effectsPause', {}, 'Pause animations') : t('fallback.effectsPlay', {}, 'Play animations'))}</span>`; el.querySelectorAll('.hue-cycle').forEach(x => x.style.animationPlayState = playing ? 'running' : 'paused'); }
    $('[data-qa="ix.effects.pause"]', el).addEventListener('click', () => setPlaying(!playing));
    const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) { clearInterval(timer); timer = null; } else if (playing && !timer) timer = setInterval(tick, 1200); })); io.observe(el);
    paint(); if (playing) timer = setInterval(tick, 1200);
    return { __fallback: true, destroy: () => { clearInterval(timer); io.disconnect(); neons.forEach(n => n.destroy()); }, setState: () => paint() };
  },

  /* ---------- 5.7 day vs night ---------- */
  async daynight(el) {
    const ids = (el.dataset.scenes || 's02-bedroom,s04-homebar').split(',').map(s => s.trim()).filter(id => stage.getScene(id)); let sceneId = ids[0];
    const label = id => t(`daynight.tabs.${id.split('-')[1] === 'bedroom' ? 'bedroom' : id.split('-')[1] === 'homebar' ? 'bar' : 'wedding'}`, {}, stage.getScene(id).name);
    el.classList.add('hx-daynight'); el.innerHTML = `<div class="c-tabs c-tabs--seg hx-daynight__tabs" role="tablist" aria-label="Scene">${ids.map((id, k) => `<button role="tab" id="dn-tab-${k}" aria-controls="dn-panel" aria-selected="${k === 0}" data-id="${id}" data-qa="ix.daynight.scene">${esc(label(id))}</button>`).join('')}</div>
      <div class="c-compare" id="dn-panel" role="tabpanel" aria-label="${esc(t('fallback.dayTag', {}, 'Day'))} / ${esc(t('fallback.nightTag', {}, 'Night'))}" data-qa="ix.daynight.compare" data-swept="false"><div class="a"><div class="st-day"></div></div><div class="b"><div class="st-night"></div></div><span class="tag a">${esc(t('fallback.dayTag', {}, 'Day'))}</span><span class="tag b">${esc(t('fallback.nightTag', {}, 'Night'))}</span>${pillRendered()}</div>
      <div class="hx-daynight__foot"><p class="t-caption">${esc(t('daynight.caption', {}, t('fallback.dayNightCaption')))}</p><a class="c-btn c-btn--ghost" href="/lit-neon-preview/create.html" data-qa="ix.daynight.cta">${esc(t('fallback.dayNightCta', {}, 'See it in your room'))}</a></div>`;
    const day = stage.mount($('.st-day', el), { frame: 'room', scene: sceneId, design, view: { night: false, on: false }, qa: 'ix.daynight.day', interactive: false, rulers: false, pill: false, relight: false });
    const night = stage.mount($('.st-night', el), { frame: 'room', scene: sceneId, design, view: { night: true, on: true }, qa: 'ix.daynight.night', interactive: false, rulers: false, pill: false });
    const cmp = ui.compare($('.c-compare', el), { initial: 50, labelA: t('fallback.dayTag', {}, 'Day'), labelB: t('fallback.nightTag', {}, 'Night'), onChange: () => { el.querySelector('.c-compare').dataset.dragging = '1'; } });
    const thumb = $('.c-compare .thumb', el); thumb.setAttribute('data-qa', 'ix.daynight.handle');
    const lockPos = () => { day.setPos(.5, day.pos().y); night.setPos(.5, night.pos().y); };
    function paint() { day.setDesign(withState({ night: false, on: false })); night.setDesign(withState({ night: true, on: true })); $('[data-qa="ix.daynight.cta"]', el).href = builderLink({}, { scene: sceneId }); }
    el.querySelector('.hx-daynight__tabs').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; sceneId = b.dataset.id; $$('[role=tab]', el).forEach(x => x.setAttribute('aria-selected', String(x === b))); day.setScene(sceneId); night.setScene(sceneId); paint(); });
    ui.tabs(el.querySelector('.hx-daynight__tabs'), { activate: 'manual' });
    inView(el, () => { const c = el.querySelector('.c-compare'); if (R.reducedMotion()) { c.dataset.swept = 'true'; return; } const t0 = performance.now(); const dur = 1400; const step = now => { const p = Math.min(1, (now - t0) / dur); const e = p < .5 ? 2 * p * p : -1 + (4 - 2 * p) * p; cmp.set(15 + 70 * e, false); if (p < 1 && !c.dataset.dragging) requestAnimationFrame(step); else c.dataset.swept = 'true'; }; requestAnimationFrame(step); });
    await Promise.all([day.ready, night.ready]); paint();
    return { __fallback: true, destroy: () => { day.destroy(); night.destroy(); }, setState: () => paint() };
  },

  /* ---------- 5.6 find-your-sign quiz ---------- */
  async quiz(el) {
    const Q = data.quiz; const card = el; const result = $('#quiz-result'); const examples = $('#quiz-examples');
    (copy.get('quiz.examples') || []).forEach(x => { const d = document.createElement('div'); examples.appendChild(d); R.mountNeon(d, withState({ text: x.words, font: x.font, colour: x.colour, colours: null }), { fitW: .8, fitH: .6, lit: true, spill: .3 }); });
    if (!Q) { $('#quiz-start').hidden = true; return { __fallback: true, destroy() {}, setState() {} }; }
    const steps = Q.steps; const answers = {}; let stepI = 0;
    const sheet = ui.sheet({ title: t('quiz.h2', {}, 'Not sure what to say?'), qa: 'ix.quiz.sheet', modal: true, body: '<div class="hx-quiz__steps"></div>' });
    const body = () => sheet.body().querySelector('.hx-quiz__steps');
    function renderStep() {
      const s = steps[stepI]; const sel = answers[s.id];
      body().innerHTML = `<p class="hx-quiz__step">${esc(t('fallback.quizStep', { n: stepI + 1 }, '{n} of 3'))}</p><h3 class="hx-quiz__q">${esc(s.question)}</h3>
        <div class="hx-quiz__opts" role="group" aria-label="${esc(s.question)}">${s.options.map(o => `<button type="button" class="hx-quiz__opt" data-id="${o.id}" data-qa="ix.quiz.answer" aria-pressed="${sel === o.id}"><div class="ex"></div><span>${esc(o.label)}</span></button>`).join('')}</div>
        <div class="hx-quiz__nav"><button type="button" class="c-btn c-btn--ghost" data-qa="ix.quiz.back" ${stepI === 0 ? 'disabled' : ''}>${esc(t('fallback.quizBack', {}, 'Back'))}</button><button type="button" class="c-btn c-btn--primary" data-qa="ix.quiz.next" ${sel ? '' : 'disabled'}>${esc(stepI === 2 ? t('fallback.quizResult', {}, 'Three signs for you') : t('fallback.quizNext', {}, 'Next'))}</button></div>`;
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
      result.hidden = false; result.innerHTML = `<div class="hx-quiz__picks">${p.map((x, k) => `<article class="hx-quiz__pick" data-qa="ix.quiz.pick"><span class="tile__media" data-k="${k}"></span><b>${esc(x.state.text.replace(/\n/g, ' / '))}</b><span class="from">${x.price.kind === 'price' ? `${gbp(x.price.payable)} · ${esc(R.sizeOf(x.state.size).name)}` : esc(t('price.quote', {}, 'Quote'))}</span><a class="c-btn c-btn--primary" href="${router.builderLink(x.state)}" data-qa="ix.quiz.open">${esc(t('fallback.quizOpen', {}, 'Open in the designer'))}</a></article>`).join('')}</div>
        <div class="hx-quiz__actions"><button type="button" class="c-btn c-btn--ghost" data-qa="ix.quiz.reshuffle">${esc(t('fallback.quizReshuffle', {}, 'Try different words'))}</button><button type="button" class="c-btn c-btn--ghost" data-qa="ix.quiz.restart">${esc(t('quiz.start', {}, 'Find my sign · 3 questions'))}</button>
        <form class="hx-quiz__email" novalidate data-qa="ix.quiz.email"><div class="c-field"><label class="sr-only" for="qz-email">${esc(t('save.emailLabel', {}, 'Your email'))}</label><input id="qz-email" class="c-input" name="email" type="email" inputmode="email" autocomplete="email" placeholder="${esc(t('save.emailPlaceholder', {}, 'you@example.co.uk'))}" data-qa="ix.quiz.email.input"></div><button type="submit" class="c-btn c-btn--ghost" data-qa="ix.quiz.email.submit">${esc(t('fallback.quizEmail', {}, 'Email me these three'))}</button></form></div>`;
      p.forEach((x, k) => tile(result.querySelector(`.tile__media[data-k="${k}"]`), { scene: x.scene, text: x.state.text, font: x.state.font, colour: x.state.colour, fitW: .8, fitH: .55 }));
      forms.bind(result.querySelector('form'), { kind: 'quizEmail', qa: 'ix.quiz.email', extra: () => ({ picks: p.map(x => router.shareLink(x.state)).join('\n'), page: 'home' }), onSuccess: (res, f) => { const fm = result.querySelector('form'); const d = document.createElement('div'); fm.replaceWith(d); forms.renderSuccess(d, { ref: res.ref, local: res.local, title: t('fallback.quizEmailSent', { email: f.email }), body: '', qa: 'ix.quiz.email' }); } });
      analytics.track('quiz_complete', { room: answers.room, mood: answers.mood, wall: answers.wall });
      card.classList.add('has-result'); result.scrollIntoView({ block: 'nearest', behavior: R.reducedMotion() ? 'auto' : 'smooth' });
    }
    result.addEventListener('click', e => { if (e.target.closest('[data-qa="ix.quiz.reshuffle"]')) { shuffle++; showResult(); } if (e.target.closest('[data-qa="ix.quiz.restart"]')) { stepI = 0; renderStep(); sheet.open(e.target); } });
    $('#quiz-start').addEventListener('click', e => { stepI = 0; renderStep(); sheet.open(e.currentTarget); });
    const fromHash = () => { const m = location.hash.match(/#quiz=([a-z]+)\.([a-z]+)\.([a-z]+)/); if (m) { answers.room = m[1]; answers.mood = m[2]; answers.wall = m[3]; if (steps[0].options.some(o => o.id === m[1]) && steps[1].options.some(o => o.id === m[2]) && steps[2].options.some(o => o.id === m[3])) showResult(); } };
    fromHash(); window.addEventListener('hashchange', fromHash);
    return { __fallback: true, destroy() {}, setState() {} };
  },

  /* ---------- 5.12 workshop process (paper): a five-chapter strip ---------- */
  async process(el) {
    const CH = ['drawn', 'bent', 'mounted', 'tested', 'boxed']; const files = ['01-drawn', '02-bent', '03-mounted', '04-tested', '05-boxed']; let cur = 0, playing = !R.reducedMotion(), timer = null;
    const svgs = await Promise.all(files.map(f => inlineSvg(`/lit-neon-preview/assets/img/process/${f}.svg`)));
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

  /* ---------- 5.2 anatomy: what's in the box (paper) ---------- */
  async anatomy(el) {
    const svg = await inlineSvg('/lit-neon-preview/assets/img/anatomy/flatlay.svg'); const parts = copy.get('fallback.anatomyParts') || {};
    const order = ['sign', 'psu', 'dimmer', 'cable', 'fixings', 'card']; const gated = { fixings: ['kitContents.screws', 'kitContents.chains', 'kitContents.strips', 'kitContents.stand'] };
    const show = order.filter(id => !gated[id] || gated[id].some(k => facts.has(k)) || facts.reviewMode());
    const sub = id => ({ sign: parts.sign?.sub, psu: parts.psu?.sub, dimmer: parts.dimmer?.sub, cable: facts.has('cableLengthM') ? facts.get('cableLengthM') : parts.cable?.sub, fixings: parts.fixings?.sub, card: parts.card?.sub }[id] || '');
    el.classList.add('hx-anatomy'); el.innerHTML = `<div class="hx-anatomy__art" data-qa="ix.anatomy.art">${pillIllustration()}</div><div><h3 class="t-title">${esc(t('fallback.anatomyTitle', {}, "What's in the box"))}</h3><ul class="hx-anatomy__list">${show.map((id, k) => `<li><button type="button" class="hx-anatomy__row" data-id="${id}" data-qa="ix.anatomy.row"><span class="n">${k + 1}</span><span><b>${esc(parts[id]?.name || id)}</b><small>${esc(sub(id))}</small>${id === 'fixings' && !gated.fixings.some(x => facts.has(x)) ? facts.chip('kitContents.screws') : ''}</span></button></li>`).join('')}</ul></div>
      <div class="hx-anatomy__chain">${(copy.get('fallback.anatomyChain') || []).map((n, k, a) => `<span class="node" title="${esc(n)}">${icon(['plug-uk', 'power', 'dimmer', 'drawing'][k] || 'check', 'ic--sm')}<span class="lbl">${esc(n)}</span></span>${k < a.length - 1 ? `<span class="arrow">${icon('arrow-right', 'ic--sm')}</span>` : ''}`).join('')}${facts.has('cableLengthM') ? `<span class="t-caption">${esc(facts.get('cableLengthM'))}</span>` : ''}</div>`;
    const art = $('.hx-anatomy__art', el); if (svg) { svg.classList.add('flat'); svg.querySelector('#part-fixings') && !show.includes('fixings') && (svg.querySelector('#part-fixings').style.opacity = '.25'); art.prepend(svg); }
    const pop = document.createElement('div'); pop.className = 'hx-anatomy__pop'; pop.hidden = true; pop.setAttribute('role', 'dialog'); pop.dataset.qa = 'ix.anatomy.pop'; art.appendChild(pop);
    show.forEach((id, k) => { const g = svg && svg.querySelector(`#part-${id}`); const hx = g ? +g.dataset.hx : .5, hy = g ? +g.dataset.hy : .5; const b = document.createElement('button'); b.type = 'button'; b.className = 'hx-anatomy__hot'; b.dataset.id = id; b.dataset.qa = 'ix.anatomy.hot'; b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', parts[id]?.name || id); b.style.left = hx * 100 + '%'; b.style.top = hy * 100 + '%'; b.textContent = String(k + 1); art.appendChild(b); });
    let openId = null;
    function open(id, from) { openId = id; $$('.hx-anatomy__hot', el).forEach(b => { const on = b.dataset.id === id; b.setAttribute('aria-expanded', String(on)); b.classList.toggle('is-hot', on); }); $$('.hx-anatomy__row', el).forEach(r => r.classList.toggle('is-hot', r.dataset.id === id)); if (!id) { pop.hidden = true; return; } const hot = $(`.hx-anatomy__hot[data-id="${id}"]`, el); pop.innerHTML = `<b>${esc(parts[id]?.name || id)}</b><span>${esc(sub(id))}</span>`; pop.hidden = false; const L = parseFloat(hot.style.left), T = parseFloat(hot.style.top); pop.style.left = (L > 60 ? L - 40 : L + 3) + '%'; pop.style.top = (T > 70 ? T - 28 : T + 4) + '%'; if (from === 'row' && isTablet()) art.scrollIntoView({ block: 'center', behavior: R.reducedMotion() ? 'auto' : 'smooth' }); }
    el.addEventListener('click', e => { const h = e.target.closest('.hx-anatomy__hot'); if (h) { open(openId === h.dataset.id ? null : h.dataset.id, 'hot'); return; } const r = e.target.closest('.hx-anatomy__row'); if (r) open(r.dataset.id, 'row'); });
    el.addEventListener('mouseover', e => { const r = e.target.closest('.hx-anatomy__row'); if (r) $$('.hx-anatomy__hot', el).forEach(b => b.classList.toggle('is-hot', b.dataset.id === r.dataset.id || b.dataset.id === openId)); });
    el.addEventListener('keydown', e => { if (e.key === 'Escape' && openId) { open(null); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && openId) open(null); });
    return { __fallback: true, destroy() {}, setState() {} };
  },

  /* ---------- 5.5 four ways to hang ---------- */
  async hanging(el) {
    const M = copy.get('fallback.hangMethods') || {}; const ids = ['screws', 'chains', 'strips', 'stand']; const captions = { screws: ['Mark with a level', 'Drill', 'Wall plug', 'Screw the standoff', 'Hang the sign', 'Plug in', 'Dim', 'Done'], chains: ['Two hooks', 'Clip the chains', 'Level it', 'Plug in'], strips: ['Clean the wall', 'Press on', 'Wait an hour', 'Hang'], stand: ['Unbox', 'Place', 'Plug in'] };
    let cur = 'screws'; const svgs = {}; for (const id of ids) svgs[id] = await inlineSvg(`/lit-neon-preview/assets/img/hanging/${id}.svg`);
    const kitKey = id => `kitContents.${id === 'screws' ? 'screws' : id}`;
    el.classList.add('hx-hang'); el.innerHTML = `<div class="c-tabs hx-hang__tabs" role="tablist" aria-label="Hanging method">${ids.map(id => `<button role="tab" id="hg-tab-${id}" aria-controls="hg-panel" aria-selected="${id === cur}" data-id="${id}" data-qa="ix.hang.tab">${esc(t(`hanging.tabs.${id}`, {}, M[id]?.name || id))}</button>`).join('')}</div>
      <div class="hx-hang__panel" id="hg-panel" role="tabpanel"><div class="hx-hang__art" data-qa="ix.hang.art">${pillIllustration()}<ol class="hx-hang__steps" data-qa="ix.hang.steps"></ol></div>
      <div class="hx-hang__info"><dl><dt>${esc(t('fallback.hangBestFor', {}, 'Best for'))}</dt><dd class="best"></dd><div class="kitrow" style="display:contents"><dt>${esc(t('fallback.hangKit', {}, 'In the kit'))}</dt><dd class="kit"></dd></div>${facts.has('installMinutes') ? `<dt>Time</dt><dd>${esc(facts.get('installMinutes'))}</dd>` : ''}</dl>
      <div class="hx-hang__helper"><b class="t-small">${esc(t('fallback.hangHelper', {}, 'Not sure which?'))}</b><div class="q"><span>${esc(t('fallback.hangDrill', {}, 'Can you drill?'))}</span>${segHtml('ix.hang.drill', [{ id: 'yes', name: t('fallback.hangYes', {}, 'Yes') }, { id: 'no', name: t('fallback.hangNo', {}, 'No') }], null, 'Can you drill?')}</div><div class="q"><span>${esc(t('fallback.hangBig', {}, 'How big is the sign?'))}</span>${segHtml('ix.hang.size', [{ id: 'small', name: t('fallback.hangSmall', {}, 'Small') }, { id: 'large', name: t('fallback.hangLarge', {}, 'Large') }], null, 'How big is the sign?')}</div><p class="hx-hang__reco" data-qa="ix.hang.reco" aria-live="polite"></p></div>
      <a class="c-btn c-btn--primary" href="/lit-neon-preview/create.html" data-qa="ix.hang.cta">${esc(t('fallback.hangCta', {}, 'Choose this in the designer'))}</a></div></div>`;
    const art = $('.hx-hang__art', el);
    function show(id) { cur = id; art.querySelectorAll('svg').forEach(s => s.remove()); if (svgs[id]) art.prepend(svgs[id]); $('.hx-hang__steps', el).innerHTML = (captions[id] || []).map((c, k) => `<li><b>${k + 1}</b><span>${esc(c)}</span></li>`).join(''); $('.best', el).textContent = M[id]?.bestFor || ''; const kitOk = facts.has(kitKey(id)); $('.kitrow', el).style.display = kitOk || facts.reviewMode() ? 'contents' : 'none'; $('.kit', el).innerHTML = kitOk ? esc(facts.get(kitKey(id))) : (facts.reviewMode() ? `${esc(M[id]?.kit || '')} ${facts.chip(kitKey(id))}` : ''); $$('[data-qa="ix.hang.tab"]', el).forEach(b => b.setAttribute('aria-selected', String(b.dataset.id === id))); $('[data-qa="ix.hang.cta"]', el).href = builderLink({}, id === 'stand' ? { backing: 'stand' } : { hang: id, backing: design.backing === 'stand' ? 'cut' : design.backing }); }
    const helper = { drill: null, size: null };
    function reco() { if (!helper.drill || !helper.size) return; const id = helper.drill === 'no' ? (helper.size === 'small' ? 'strips' : 'chains') : (helper.size === 'large' ? 'screws' : 'screws'); $('[data-qa="ix.hang.reco"]', el).textContent = t('fallback.hangRecommend', { method: M[id]?.name || id, why: M[id]?.why || '' }); show(id); }
    el.addEventListener('click', e => { const tb = e.target.closest('[data-qa="ix.hang.tab"]'); if (tb) { show(tb.dataset.id); return; } for (const k of ['drill', 'size']) { const b = e.target.closest(`[data-qa="ix.hang.${k}"]`); if (b) { helper[k] = b.dataset.id; $$(`[data-qa="ix.hang.${k}"]`, el).forEach(x => x.setAttribute('aria-pressed', String(x === b))); reco(); } } });
    ui.tabs($('.hx-hang__tabs', el), { activate: 'manual' }); show(cur);
    return { __fallback: true, destroy() {}, setState: () => show(cur) };
  },

  /* ---------- 5.8 running-cost calculator (only when a watts figure is confirmed) ---------- */
  async cost(el) {
    const wpm = facts.has('wattsPerMetre') ? +facts.value('wattsPerMetre') : (facts.has('wattsPerMetreTypical') ? +facts.value('wattsPerMetreTypical') : null);
    if (!wpm) return { __fallback: true, destroy() {}, setState() {} };
    const tariffDefault = facts.has('electricityPencePerKwh') ? +facts.value('electricityPencePerKwh') : 27; let tariff = tariffDefault, hours = 5, dimmed = false, size = design.size;
    const sizes = R.OPTIONS.sizes;
    el.classList.add('hx-cost'); el.innerHTML = `<div class="hx-cost__in"><div class="c-chips" role="group" aria-label="${esc(t('fallback.costSize', {}, 'Size'))}">${sizes.map(s => `<button type="button" class="c-chip" data-id="${s.id}" data-qa="ix.cost.size" aria-pressed="${s.id === size}">${esc(s.name)}</button>`).join('')}</div>
      <div class="c-range" data-qa="ix.cost.hours"><label class="label" for="hx-cost-hours"><span>${esc(t('fallback.costHours', {}, 'Hours a day'))}</span> <span class="readout"></span></label><input id="hx-cost-hours" type="range" min="1" max="24" step="1" value="5" data-qa="ix.cost.hours.input"></div>
      <label class="c-check"><input type="checkbox" data-qa="ix.cost.dimmed"><span>${esc(t('fallback.costDimmed', {}, 'Dimmed to half'))}</span></label>
      <div class="hx-cost__tariff"><label class="small" for="hx-cost-tariff">${esc(t('fallback.costTariff', {}, 'Your tariff'))}</label><input id="hx-cost-tariff" class="c-input" type="number" inputmode="decimal" min="1" max="200" step="0.1" value="${tariffDefault}" data-qa="ix.cost.tariff"><span class="t-small">p/kWh</span><button type="button" class="c-btn c-btn--text" data-qa="ix.cost.reset" hidden><span class="label">Reset</span></button></div></div>
      <div class="hx-cost__out" data-qa="ix.cost.readout"><div class="hx-cost__box"><small>${esc(t('fallback.costEvening', {}, 'Per evening'))}</small><b class="evening"></b></div><div class="hx-cost__box"><small>${esc(t('fallback.costMonth', {}, 'Per month'))}</small><b class="month"></b></div><div class="hx-cost__box"><small>${esc(t('fallback.costYear', {}, 'Per year'))}</small><b class="year"></b></div><div class="hx-cost__notes"><p class="t-small comparison"></p><p class="t-caption assumptions"></p></div></div>`;
    const money = v => v < 1 ? pence(Math.round(v * 100)) : gbp(Math.round(v * 100) / 100);
    const range = ui.range($('.c-range', el), { text: v => `${v} ${v === 1 ? 'hour' : 'hours'}`, onInput: v => { hours = v; paint(); } });
    function paint() { const res = R.resolve(withState({ size })); const metres = R.flexMetres(res); const watts = metres * wpm * (dimmed ? .55 : 1); const kwhDay = watts * hours / 1000; const cost = kwh => kwh * tariff / 100; $('.evening', el).textContent = money(cost(kwhDay)); $('.month', el).textContent = money(cost(kwhDay * 30)); $('.year', el).textContent = money(cost(kwhDay * 365)); $('.comparison', el).textContent = t('fallback.costComparison', { w: Math.max(1, Math.round(watts)) }); $('.assumptions', el).textContent = t('fallback.costAssumptions', { wpm, tariff: pence(Math.round(tariff)) }); $('[data-qa="ix.cost.reset"]', el).hidden = tariff === tariffDefault; $$('[data-qa="ix.cost.size"]', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === size))); }
    el.addEventListener('click', e => { const b = e.target.closest('[data-qa="ix.cost.size"]'); if (b) { size = b.dataset.id; paint(); } if (e.target.closest('[data-qa="ix.cost.reset"]')) { tariff = tariffDefault; $('#hx-cost-tariff', el).value = tariffDefault; paint(); } });
    $('[data-qa="ix.cost.dimmed"]', el).addEventListener('change', e => { dimmed = e.target.checked; paint(); });
    $('#hx-cost-tariff', el).addEventListener('input', e => { const v = parseFloat(e.target.value); if (v > 0) { tariff = v; paint(); } });
    paint(); range.paint();
    return { __fallback: true, destroy() {}, setState: s => { if (s.size && s.size !== 'custom') size = s.size; paint(); } };
  }
};

/* ============================================================ 5 · 6 · 10 mounts ============================================================ */
const ixMounts = Promise.all([mountIx('size-guide', $('#ix-size')), mountIx('jacket', $('#ix-jacket')), mountIx('effects', $('#ix-effects')), mountIx('daynight', $('#ix-daynight')), mountIx('quiz', $('#home-quiz')), mountIx('process', $('#ix-process'))]);

/* ============================================================== 7 · BESTSELLERS ============================================================== */
const best = data.designs.designs.filter(d => d.bestseller).sort((a, b) => (a.bestsellerRank || 99) - (b.bestsellerRank || 99)).slice(0, 8);
const rail = $('#best-rail');
rail.innerHTML = best.map((d, i) => { const from = fromAny(d); const text = (d.lines || []).join('\n') || d.name; return `<a class="c-card" href="/lit-neon-preview/product.html?id=${encodeURIComponent(d.id)}" data-qa="home.best.card" data-id="${esc(d.id)}" data-i="${i}" aria-label="${esc(d.alt || d.name)}"><span class="media" data-composite><img class="lit" src="/lit-neon-preview/assets/img/cards/${esc(d.id)}/lit-800.avif" alt="" loading="lazy" decoding="async"><img class="off" src="/lit-neon-preview/assets/img/cards/${esc(d.id)}/off-800.avif" alt="" loading="lazy" decoding="async"><span class="ln-tile"></span>${pillRendered()}${d.new ? `<span class="c-pill c-pill--new">${esc(t('pills.new', {}, 'New'))}</span>` : ''}<button type="button" class="c-btn c-btn--ghost c-btn--md quick" data-quick="${esc(d.id)}" data-qa="home.best.quick">${esc(t('best.quick', {}, 'Quick view'))}</button></span><span class="eyebrow">${esc((d.collections || [])[0] ? (byId(d.collections[0])?.name || '') : '')}</span><span class="title">${esc(d.name)}</span><span class="from" data-i="${i}">${from != null ? esc(t('best.from', { from: gbp(from) })) : ''}</span></a>`; }).join('');
function paintBestFrom() { best.forEach((d, i) => { const from = fromAny(d); const el = $(`.c-card .from[data-i="${i}"]`, rail); if (el) el.textContent = from != null ? t('best.from', { from: gbp(from) }) : ''; }); }
const bestNeons = best.map((d, i) => { const card = $(`.c-card[data-i="${i}"]`, rail); const lit = card.querySelector('img.lit'), off = card.querySelector('img.off'); let gone = 0; const fail = () => { if (++gone) { card.classList.remove('has-img'); lit.remove(); off.remove(); } }; lit.addEventListener('error', fail, { once: true }); off.addEventListener('error', fail, { once: true }); lit.addEventListener('load', () => card.classList.add('has-img'), { once: true });
  const n = R.mountNeon(card.querySelector('.ln-tile'), withState({ text: (d.lines || []).join('\n') || d.name, font: d.font, colour: d.colour, icon: d.icon || '', iconPos: d.iconPos || 'above', colours: null }), { fitW: .78, fitH: .6, lit: true, spill: .3, strike: false });
  const sc = sceneOf(d.scene); card.querySelector('.ln-tile').style.setProperty('--tile-bg', sc && sc.light === 'warm' ? 'var(--surface-2)' : 'var(--ink)');
  card.addEventListener('pointerenter', () => { if (hoverable()) n.setLit(false); }); card.addEventListener('pointerleave', () => n.setLit(true)); return n; });
const rails = { step: () => (rail.querySelector('.c-card')?.getBoundingClientRect().width || 300) + (parseFloat(getComputedStyle(rail).columnGap) || 16) };
$('#best-prev').addEventListener('click', () => rail.scrollBy({ left: -rails.step(), behavior: R.reducedMotion() ? 'auto' : 'smooth' }));
$('#best-next').addEventListener('click', () => rail.scrollBy({ left: rails.step(), behavior: R.reducedMotion() ? 'auto' : 'smooth' }));
const paintProgress = () => { const max = rail.scrollWidth - rail.clientWidth; const w = Math.max(.12, rail.clientWidth / rail.scrollWidth); const x = max > 0 ? rail.scrollLeft / max : 0; const bar = $('#best-progress'); bar.style.width = (w * 100) + '%'; bar.style.transform = `translateX(${x * (100 / w - 100)}%)`; $('#best-prev').disabled = rail.scrollLeft <= 2; $('#best-next').disabled = rail.scrollLeft >= max - 2; };
rail.addEventListener('scroll', paintProgress, { passive: true }); window.addEventListener('resize', debounce(paintProgress, 120)); paintProgress();
rail.addEventListener('click', e => { const q = e.target.closest('[data-quick]'); if (!q) return; e.preventDefault(); e.stopPropagation(); quickView(q.dataset.quick, q); });
let quickSheet = null, quickStage = null;
function quickView(id, opener) {
  const d = data.designs.designs.find(x => x.id === id); if (!d) return;
  let st = withState({ text: (d.lines || []).join('\n') || d.name, font: d.font, colour: d.colour, icon: d.icon || '', iconPos: d.iconPos || 'above', colours: null, size: 'm', scene: d.scene, backing: 'cut', board: 'clear' });
  if (!quickSheet) quickSheet = ui.sheet({ title: d.name, qa: 'home.quick', body: '<div class="hx-quick"></div>', onClose: () => { quickStage && quickStage.destroy(); quickStage = null; } });
  quickSheet.el.querySelector('.c-dialog__head h2, .c-dialog__head .title, .c-dialog__head [class*="title"]')?.replaceChildren(document.createTextNode(d.name));
  const box = quickSheet.body().querySelector('.hx-quick');
  const paint = () => {
    const p = pricing.price(st); const cards = pricing.sizeCards(st, d.scene).filter(c => c.id !== 'custom');
    box.innerHTML = `<div class="hx-quick__stage" data-qa="home.quick.stage"></div><p class="hx-quick__blurb">${esc(d.blurb || '')}</p>
      <div class="hx-quick__opts"><h4>${esc(t('best.quickSize', {}, 'Size'))}</h4><div class="c-chips" role="group" aria-label="${esc(t('best.quickSize', {}, 'Size'))}">${cards.map(c => `<button type="button" class="c-chip" data-size="${c.id}" data-qa="home.quick.size" aria-pressed="${c.id === st.size}" ${c.available ? '' : `disabled data-reason="${esc(c.reason || 'Not available at this size')}"`}>${esc(c.name)}${c.payable != null ? ` · ${gbp(c.payable)}` : ''}</button>`).join('')}</div>
      <h4>${esc(t('best.quickColour', {}, 'Colour'))}</h4><div class="c-swatches" role="group" aria-label="${esc(t('best.quickColour', {}, 'Colour'))}">${swatchesHtml('home.quick.colour', st.colour)}</div></div>
      <div class="hx-quick__row"><div class="c-price c-price--dock" data-qa="home.quick.price"><div class="amount">${p.kind === 'price' ? gbp(p.payable) : esc(t('price.quote', {}, 'Quote'))}</div>${p.kind === 'price' && p.promoLine ? `<div class="promo">${esc(p.promoLine)}</div>` : ''}<div class="reason">${p.kind === 'price' ? esc(fmtDims(p.dims.W, p.dims.H)) : esc(pricing.quoteReason(p))}</div></div><button type="button" class="c-btn c-btn--primary c-btn--lg" data-qa="home.quick.add" ${p.kind === 'price' ? '' : 'disabled'}>${esc(t('best.quickAdd', {}, 'Add to basket'))}</button></div>
      <p class="hx-quick__returns">${esc(t('best.quickReturns'))}</p>
      <div class="cluster"><a class="c-btn c-btn--ghost" href="/lit-neon-preview/product.html?id=${encodeURIComponent(d.id)}" data-qa="home.quick.open">${esc(t('best.quickOpen', {}, 'See the full page'))}</a><a class="c-btn c-btn--text" href="${router.builderLink(st)}" data-qa="home.quick.custom"><span class="label">${esc(t('best.quickCustom', {}, 'Make it custom'))}</span></a></div>`;
    quickStage && quickStage.destroy(); quickStage = stage.mount(box.querySelector('.hx-quick__stage'), { frame: 'card', scene: d.scene, design: st, qa: 'home.quick', interactive: false });
  };
  box.onclick = e => {
    const s = e.target.closest('[data-size]'); if (s && !s.disabled) { st = withState(Object.assign({}, st, { size: s.dataset.size })); paint(); return; }
    const c = e.target.closest('[data-qa="home.quick.colour"]'); if (c) { st = withState(Object.assign({}, st, { colour: c.dataset.id })); paint(); return; }
    const a = e.target.closest('[data-qa="home.quick.add"]'); if (a) { const r = basket.add({ kind: 'ready', state: st, meta: { design: d.id } }); analytics.track('builder_add_to_basket', { kind: 'ready', design: d.id }); ui.flashSuccess(a, t('ui.added', {}, 'Added ✓')); setTimeout(() => { quickSheet.close(); drawer && drawer.open(); }, 600); }
  };
  paint(); quickSheet.open(opener);
}

/* ============================================================== 8 · BUILT TO LAST ============================================================== */
(function built() {
  const ART = { tube: '<svg viewBox="0 0 100 60" aria-hidden="true"><path d="M8 40c20-30 40 30 60 0s24-10 24-10"/><path d="M8 48c20-30 40 30 60 0s24-10 24-10" opacity=".35"/></svg>', backing: '<svg viewBox="0 0 100 60" aria-hidden="true"><path d="M14 46l10-30h52l10 30z"/><path d="M24 16v-6h52v6"/><circle cx="30" cy="40" r="2"/><circle cx="70" cy="40" r="2"/></svg>', power: '<svg viewBox="0 0 100 60" aria-hidden="true"><rect x="30" y="18" width="40" height="30" rx="5"/><path d="M42 30v-9M58 30v-9M50 18v-8"/><path d="M50 48v6"/></svg>', tested: '<svg viewBox="0 0 100 60" aria-hidden="true"><circle cx="50" cy="30" r="22"/><path d="M50 30l8-12"/><path d="M50 30h-10"/><path d="M28 30h-8M72 30h8"/></svg>' };
  const cards = [
    { id: 'tube', ok: facts.has('ledLifetimeHours'), fact: facts.get('ledLifetimeHours') },
    { id: 'backing', ok: facts.has('acrylicThicknessMm'), fact: facts.get('acrylicThicknessMm') },
    { id: 'power', ok: facts.has('psuVoltage'), psuVoltage: facts.get('psuVoltage'), psuMarking: facts.has('psuMarking') ? facts.get('psuMarking') : 'with a UK plug', psuFuseA: facts.has('psuFuseA') ? `and ${facts.get('psuFuseA')}` : '' },
    { id: 'tested', ok: facts.has('warrantyYears'), fact: facts.has('benchTestHours') ? facts.get('benchTestHours') : '' }
  ].filter(c => c.ok);
  const grid = $('#built-grid'), para = $('#built-para'); const body = $('#built-body');
  grid.innerHTML = cards.map(c => `<article class="built__card" data-qa="home.built.card" data-id="${c.id}"><div class="built__art">${ART[c.id]}${pillIllustration()}</div><h3>${esc(t(`built.cards.${c.id}.title`))}</h3><p>${esc(fillD2(copy.fill(t(`built.cards.${c.id}.body`), { fact: c.fact || '', psuVoltage: c.psuVoltage || '', psuMarking: c.psuMarking || '', psuFuseA: c.psuFuseA || '' })).replace(/\s*,\s*\./g, '.').replace(/\s+\./g, '.'))}${!c.ok && facts.reviewMode() ? facts.chip(c.id) : ''}</p></article>`).join('');
  if (cards.length < 2) { para.hidden = false; para.innerHTML = `${esc(t('built.paragraph'))} <a href="/lit-neon-preview/guides/how-led-neon-is-made.html" data-qa="home.built.link">${esc(t('built.link'))}</a>`; body.classList.add('has-para'); $('#built-foot').remove(); }
})();

/* ============================================================== 9 · YOUR LOGO ============================================================== */
function logoBand() {
  if (!$('#logo-plate').firstChild) $('#logo-plate').innerHTML = plateHtml('s11-shopwindow', { w: 1600, cls: '' });
  const b = pricing.bands(); const small = b.find(x => x.size === 's' && x.from != null), large = b.find(x => x.size === 'l' && x.from != null) || b.find(x => x.size === 'xl' && x.from != null);
  const bands = copy.get('logo.bands') || []; const a = small ? gbp(small.from) : '', bb = large ? gbp(large.from) : '';
  $('#logo-bands').innerHTML = bands.map((x, i) => `<div class="band" data-qa="home.logo.band" data-i="${i}"><b class="band__range">${esc(copy.fill(x.range, { a, b: bb }))}</b><span class="band__use">${esc(x.use)}</span></div>`).join('') + `<p class="band__note">${esc(t('logo.bandsNote'))}</p>`;
}
logoBand();

/* ============================================================== 12 · MADE HERE ============================================================== */
(function made() {
  const cmp = copy.get('made.compare') || {}; const rows = cmp.rows || [];
  $('#compare-table').innerHTML = `<thead><tr><th scope="col"></th><th scope="col">${esc(cmp.colUs || 'Lit Neon')}</th><th scope="col">${esc(cmp.colThem || 'Typically')}</th></tr></thead><tbody>${rows.map(r => `<tr data-qa="home.compare.row"><td>${esc(r.label)}</td><td class="us">${esc(fillD2(r.us))}</td><td class="them">${esc(r.them)}</td></tr>`).join('')}</tbody>`;
  const lg = copy.get('made.ledGlass') || {};
  $('#made-ledglass').innerHTML = `<h3>${esc(lg.h3 || 'LED or glass?')}</h3><div class="lg-card is-us"><b>${esc(lg.led?.title || '')}</b><p>${esc(lg.led?.body || '')}</p></div><div class="lg-card"><b>${esc(lg.glass?.title || '')}</b><p>${esc(lg.glass?.body || '')}</p></div><a class="c-btn c-btn--text" href="/lit-neon-preview/guides/led-vs-glass-neon.html" data-qa="home.made.ledglass"><span class="label">${esc(lg.link || '')}</span></a>`;
})();

/* ============================================================== 13 · KIT TABS ============================================================== */
(async function kit() {
  const costOk = facts.has('wattsPerMetre') || facts.has('wattsPerMetreTypical');
  if (!costOk) { $('#kit-tab-cost').remove(); $('#kit-panel-cost').remove(); }
  const ar = copy.get('kit.arrives') || {};
  const body = copy.fill(ar.body || '', { tested: facts.has('benchTestHours') ? facts.get('benchTestHours') : '', weight: facts.has('signWeightKg') ? facts.get('signWeightKg') : '', packaging: facts.has('packaging') ? facts.get('packaging') : '' }).replace(/\s{2,}/g, ' ').trim();
  $('#kit-panel-arrives').innerHTML = `<div><h3>${esc(ar.title || 'Arrives safe')}</h3><p>${esc(body)}</p><p>${esc(ar.tracked || '')}</p><p class="damage" data-qa="home.kit.damage">${esc(facts.get('damageReportDays'))}</p></div>
    <div class="art" data-qa="home.kit.arrives.art"><svg viewBox="0 0 200 150" aria-hidden="true"><path d="M30 60l70-30 70 30-70 30z"/><path d="M30 60v50l70 30 70-30V60"/><path d="M100 90v50"/><path d="M60 72l40-18 40 18" opacity=".5"/><path d="M70 100h20M110 100h20" stroke-dasharray="3 3"/><rect x="78" y="40" width="44" height="14" rx="2" transform="rotate(-12 100 47)"/></svg>${pillIllustration()}</div>`;
  const tabs = ui.tabs($('#kit-tabs'), { onChange: (el, id) => { requestAnimationFrame(() => R.refitAll()); } });
  await Promise.all([mountIx('anatomy', $('#kit-panel-box')), mountIx('hanging', $('#kit-panel-hang')), costOk ? mountIx('cost', $('#kit-panel-cost')) : null]);
  // equal panel heights (tallest wins, no jumps)
  const equalise = () => { let h = 0; $$('.kit__panel').forEach(p => { const was = p.hidden; p.hidden = false; p.style.minHeight = ''; h = Math.max(h, p.offsetHeight); p.hidden = was; }); if (!isMobile()) $$('.kit__panel').forEach(p => { p.style.minHeight = h + 'px'; }); };
  equalise(); window.addEventListener('resize', debounce(equalise, 150));
  const DEEP = { box: 'box', hang: 'hang', cost: 'cost', arrives: 'arrives' };
  const fromHash = () => { const k = DEEP[location.hash.slice(1)]; if (k && $(`#kit-tab-${k}`)) { tabs.select(`kit-tab-${k}`); $('#kit-tabs').scrollIntoView({ block: 'start', behavior: R.reducedMotion() ? 'auto' : 'smooth' }); } };
  fromHash(); window.addEventListener('hashchange', fromHash);
})();

/* ============================================================== 14 · REVIEWS ============================================================== */
(function reviews() { const r = facts.value('reviews'); const count = r && typeof r === 'object' ? (r.count || 0) : 0; const el = $('#home-reviews'); if (count > 0) { el.hidden = false; el.className = 'section night reviews'; el.innerHTML = `<div class="wrap"><p class="t-eyebrow">Reviews</p><h2>What our first customers say</h2><p class="t-lead">${esc(facts.get('reviews'))}</p></div>`; } })();

/* ============================================================== 15 · FAQ ============================================================== */
(function faq() {
  const Q = data.faq; const qs = Q.questions.filter(q => q.showOnHome); const chips = Q.homeChips || [];
  const resolved = qs.map(q => { const v = (q.variants || []).find(x => x.when && x.when.startsWith('fact:') && facts.has(x.when.slice(5))); return { ...q, a: fillD2(v ? v.a : q.a) }; });
  $('#faq-chips').innerHTML = chips.map(c => `<button type="button" class="c-chip" data-id="${esc(c.id)}" data-qa="home.faq.chip" aria-pressed="false">${esc(c.label)}</button>`).join('');
  $('#faq-acc').innerHTML = resolved.map(q => `<details id="home-${esc(q.id)}" data-id="${esc(q.id)}" data-cat="${esc(q.category)}" data-qa="home.faq.q"><summary data-qa="home.faq.summary"><span class="label">${esc(q.q)}</span>${icon('chevron-down')}</summary><div class="c-acc__body"><p>${esc(q.a)}</p>${(q.links || []).length ? `<div class="links">${q.links.map(l => `<a href="/lit-neon-preview/${esc(l.href)}" data-qa="home.faq.link">${esc(l.label)}</a>`).join('')}</div>` : ''}<a class="deep" href="/lit-neon-preview/help.html#${esc(q.id)}" data-qa="home.faq.deep">${icon('link', 'ic--sm')} ${esc(t('faq.copyLink', {}, 'Link to this answer'))}</a></div></details>`).join('');
  ui.accordion($('#faq-acc'), { single: true, deepLink: false });
  let cat = null, query = '';
  function filter() {
    const cats = cat ? (chips.find(c => c.id === cat)?.categories || [cat]) : null; const ql = query.trim().toLowerCase(); let n = 0;
    let first = null;
    $$('#faq-acc details').forEach(d => { const q = resolved.find(x => x.id === d.dataset.id); const hay = `${q.q} ${q.a} ${(q.keywords || []).join(' ')}`.toLowerCase(); const ok = (!cats || cats.includes(d.dataset.cat)) && (!ql || hay.includes(ql)); d.hidden = !ok; if (ok) { n++; first = first || d; } if (d.open && !d.dataset.userOpened && (!ok || !ql)) d.open = false; });
    /* a search opens its best (first) match only — the accordion is single-open — unless the shopper already opened one that still matches */
    if (ql && first && !$$('#faq-acc details').some(d => !d.hidden && d.open)) first.open = true;
    $('#faq-empty').hidden = n > 0; $('#faq-empty').textContent = t('faq.empty');
  }
  /* only a real click/Enter on a summary counts as the shopper's choice (programmatic opens from search must not stick) */
  $('#faq-acc').addEventListener('click', e => { const sm = e.target.closest('summary'); if (!sm) return; const d = sm.parentElement; if (d.open) delete d.dataset.userOpened; else { $$('#faq-acc details').forEach(x => delete x.dataset.userOpened); d.dataset.userOpened = '1'; } });
  $('#faq-chips').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; cat = cat === b.dataset.id ? null : b.dataset.id; $$('#faq-chips [data-id]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.id === cat))); filter(); });
  $('#faq-search').addEventListener('input', debounce(e => { query = e.target.value; filter(); }, 80));
  // chrome.contactHref() returns { href, kind, label, icon, external } (core/chrome.js); never interpolate the object itself
  const contact = chrome.contactHref() || {}; const href = typeof contact === 'string' ? contact : (contact.href || '/lit-neon-preview/contact.html');
  const kind = contact.kind || (/wa\.me/.test(href) ? 'whatsapp' : /^mailto:/.test(href) ? 'email' : 'contact'); const ext = contact.external || /wa\.me/.test(href);
  $('#faq-ask').innerHTML = `<h3>${esc(t('faq.askTitle', {}, 'Still stuck?'))}</h3><p>${esc(t('faq.askBody'))}</p>${facts.has('supportHours') ? `<span class="hours">${esc(facts.get('supportHours'))}</span>` : ''}${facts.has('replyHours') ? `<span class="hours">${esc(facts.get('replyHours'))}</span>` : ''}<a class="c-btn c-btn--ghost" href="${esc(href)}" data-qa="home.faq.ask.cta" data-kind="${kind}"${ext ? ' target="_blank" rel="noopener"' : ''}>${icon(kind === 'whatsapp' ? 'whatsapp' : kind === 'email' ? 'mail' : 'chat')} ${esc(kind === 'whatsapp' ? t('nav.whatsapp', {}, 'Message us on WhatsApp') : kind === 'email' ? t('nav.email', {}, 'Email us') : t('faq.askCta', {}, 'Contact us'))}</a>`;
  const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: resolved.map(q => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } })) };
  const s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(ld); document.head.appendChild(s);
})();

/* ============================================================== 16 · GUIDES ============================================================== */
(function guides() {
  const g = data.guides.guides.filter(x => x.featured).sort((a, b) => (a.featuredRank || 9) - (b.featuredRank || 9)).slice(0, 3);
  const WORDS = { 'sizing-guide': 'This big?', 'led-vs-glass-neon': 'LED', 'choosing-colours-and-jackets': 'Pink or white' };
  const cats = (data.guides.categories || []); const catName = id => (cats.find(c => c.id === id) || {}).label || id;
  $('#guides-grid').innerHTML = g.map((x, i) => `<a class="gcard" href="/lit-neon-preview/${esc(x.href)}" data-qa="home.guides.card" data-slug="${esc(x.slug)}"><span class="gcard__thumb" data-i="${i}"></span><span class="gcard__eyebrow">${esc(catName(x.category))}</span><span class="gcard__title">${esc(x.title)}</span><span class="gcard__meta">${esc(t('guides.minutes', { n: x.readingMinutes || 5 }))}</span></a>`).join('');
  /* thumbnails are night plates: a lit sign on the light studio plate reads as switched off, so fall back to the guide's own room */
  const COLOURS = { 'choosing-colours-and-jackets': 'pink' };
  const thumbScene = x => (x.scene && !/light/.test(x.scene)) ? x.scene : ((x.context && x.context.scene) || 's00-studio-dark');
  g.forEach((x, i) => tile($(`.gcard__thumb[data-i="${i}"]`), { scene: thumbScene(x), text: WORDS[x.slug] || x.title.split(' ').slice(0, 2).join(' '), font: (x.context && x.context.font) || 'soho', colour: (x.context && x.context.colour) || COLOURS[x.slug] || 'warm', fitW: .7, fitH: .5, pill: true }));
})();

/* ============================================================== 17 · SAVE ============================================================== */
(function save() {
  $('#save-plate').innerHTML = plateHtml('s02-bedroom', { w: 1600, cls: '' });
  const mini = tile($('#save-mini'), { scene: 's00-studio-dark', text: design.text, font: design.font, colour: design.colour, fitW: .8, fitH: .55, strike: false });
  onState(s => { mini.update(withState({ scene: 's00-studio-dark' })); $('#save-alt').href = builderLink(); }); $('#save-alt').href = builderLink();
  const form = $('#save-form');
  forms.bind(form, { kind: 'emailDesign', qa: 'home.save', extra: () => ({ words: design.text, designLink: router.shareLink(design), page: 'home' }),
    validate: f => (!f.email || !ui.validEmail(f.email)) ? [{ field: 'email', message: t('save.emailInvalid') }] : [],
    onSuccess: (res, f) => { form.hidden = true; const d = $('#save-done'); d.hidden = false; forms.renderSuccess(d, { ref: res.ref, local: res.local, title: t('save.successTitle', { email: f.email }), body: t('save.success'), qa: 'home.save' }); } });
})();

/* ================================================================ wiring ================================================================ */
function refreshAll() { R.refitAll(); renderSheet(); paintShopMeta(); paintBestFrom(); logoBand(); }
window.addEventListener('resize', debounce(() => R.refitAll(), 120));
await ixMounts;
document.dispatchEvent(new CustomEvent('ln:home-ready'));
window.__home = { get design() { return design; }, setDesign, heroStage, ix: IX, data };
