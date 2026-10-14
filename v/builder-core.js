/* Lit Neon v2 — built-round builder prototypes, shared engine glue (D2 A and D2 B share this file).
   Real engine, no new prices: stage.js (compositor), renderer.js (fonts/colours/sizes/glow), pricing.js (THE price
   source), basket.js (lazy, on Add). This file owns: the one design state (URL hash / ?t= / saved design → stage),
   the baked-poster hand-over (no strike replay, no dark flash), the day-plate deferral (loaded only on "lights off"),
   cheap glow while typing, the step contents (Words · Style · Colour · Size), the secondary sheets (symbol, backing,
   hanging, two colours, room, more, breakdown, confirm/add), the keyboard mode and the version pill.
   Owner decisions baked in: no alignment control (every sign centred), editor icons at the BOTTOM edge of the
   preview, LED-only copy. Layout lives in builder-1.js / builder-2.js. */
import * as R from '/lit-neon-preview/assets/js/core/renderer.js';
import stage, { FRAMES } from '/lit-neon-preview/assets/js/core/stage.js';
import pricing, { gbp } from '/lit-neon-preview/assets/js/core/pricing.js';
import { parseHash, buildHash } from '/lit-neon-preview/assets/js/core/router.js';
import { fmtDims, fmtDelta, fmtLen } from '/lit-neon-preview/assets/js/core/money.js';

export const DEFAULT_WORDS = 'After dark';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const isPhone = () => matchMedia('(max-width: 767px)').matches;

/* a close-up frame (same scene, zoomed until the sign fills most of the stage) — registered here as the page builder does */
FRAMES.closeup = SW => SW < 768 ? [.82, .92] : [.78, .9];

/* ---------- inline icons (no sprite fetch: the few we need, 24-box strokes) ---------- */
const P = d => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
export const ICON = {
  power: P('M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0'), more: P('M5 12h.01M12 12h.01M19 12h.01'), back: P('M15 5l-7 7 7 7'), basket: P('M3 5h2l2.4 11h11.2L21 8H7M9 20h.01M17 20h.01'),
  close: P('M6 6l12 12M18 6 6 18'), chevron: P('M9 6l6 6-6 6'), check: P('M5 12.5l4.5 4.5L19 7'), pencil: P('M4 20l4-1 10.5-10.5a2 2 0 0 0-3-3L5 16l-1 4z'),
  ruler: P('M3 17l14-14 4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2'), drop: P('M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z'), aa: P('M3 18l5-12 5 12M5.5 13h5M14 18l3.5-8 3.5 8M15.5 15h4'),
  image: P('M4 5h16v14H4zM4 15l5-5 4 4 3-3 4 4'), share: P('M12 3v12M8 7l4-4 4 4M5 13v7h14v-7'), mail: P('M3 6h18v12H3zM3 7l9 6 9-6'), download: P('M12 3v12M7 10l5 5 5-5M4 20h16'),
  cube: P('M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM4 7.5l8 4.5 8-4.5M12 12v9'), sun: P('M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'),
  truck: P('M3 6h11v10H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'), drawing: P('M4 4h16v16H4zM8 16l3-6 2 4 2-2 3 4')
};

/* ====================================================================== state ====================================================================== */
export const S = {
  design: null,            /* the shopper's design (text may be '' → the stage shows DEFAULT_WORDS) */
  stage: null, root: null, stageEl: null, wrap: null,
  step: 'words', lastPayable: null, lastKey: '', listeners: new Set(), sheets: {}, tiles: new Map(), fontsAsked: false,
  dayReleased: false, booted: false, typingTimer: 0, priceTimer: 0, hashTimer: 0
};
export const onChange = fn => { S.listeners.add(fn); return () => S.listeners.delete(fn); };
/** the design the engine draws: the typed words, or the default words when the field is empty */
export const eff = () => { const d = R.normalise(S.design); if (!d.text.trim() && !d.icon) d.text = DEFAULT_WORDS; d.align = 'center'; return d; };

export function initialDesign() {
  const h = parseHash(location.hash); const q = new URLSearchParams(location.search);
  let d = null;
  if (h.d) d = h.d;
  else { try { const rec = JSON.parse(localStorage.getItem('design') || 'null'); if (rec && rec.state && Date.now() - (rec.updatedAt || 0) < 30 * 60 * 1000) d = rec.state; } catch {} }
  d = R.normalise(d || { ...R.DEFAULT_DESIGN, font: 'soho', colour: 'pink' });
  const t = q.get('t') || q.get('text'); if (t) d.text = R.resolve({ ...d, text: String(t).slice(0, 80) }).clean.text;
  if (!d.scene || !/^s(0[1-9]|1[0-2])-/.test(d.scene)) d.scene = 's01-living';
  d.view = 'room'; d.on = true; d.night = true; d.align = 'center';
  return d;
}
export function setDesign(patch, { typing = false } = {}) {
  Object.assign(S.design, patch); S.design = R.normalise(S.design);
  if (S.stage) S.stage.setDesign(eff());
  clearTimeout(S.priceTimer); S.priceTimer = setTimeout(() => { S.listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }, typing ? 120 : 0);
  save();
}
function save() {
  try { localStorage.setItem('design', JSON.stringify({ state: S.design, source: 'builder', updatedAt: Date.now() })); } catch {}
  clearTimeout(S.hashTimer); S.hashTimer = setTimeout(() => { try { history.replaceState(null, '', buildHash(S.design) || location.pathname + location.search); } catch {} }, 300);
}
export const price = () => pricing.price(eff());

/* ====================================================================== stage: poster hand-over, day-plate deferral, lights ====================================================================== */
/** mount the live stage under the baked poster. wrap = the box holding .v-poster + [data-stage] */
export function mountStage(wrap) {
  S.wrap = wrap; const el = S.stageEl = $('[data-stage]', wrap); const poster = $('.v-poster', wrap);
  /* phones: 1600 px plates at most (the compositor would otherwise jump to 3000 px at DPR 3) */
  stage.loadScenes().then(list => { if (innerWidth < 768) for (const s of list) { const w = s.plates && s.plates.widths; if (!w) continue; for (const k of Object.keys(w)) if (Array.isArray(w[k])) w[k] = w[k].filter(x => x <= (k === 'portraitWall' ? 1000 : 1600)); } /* the portrait wall crop stops at 1000 px: its 1600 file is 237 KB and would hold the lit sign past 1.5 s on 4G */ pricing.setScenes(list); });
  wrap.classList.add('is-booting');
  S.stage = stage.mount(el, { frame: 'room', scene: S.design.scene, design: eff(), qa: 'v.stage', priority: 'high', pill: false, view: { rulers: 'cm' } });
  S.stage.on('change', e => { S.design.pos = e.pos; save(); });
  /* the day plate is fetched only when someone switches the lights off: intercept the compositor's src assignment */
  const day = $('.ln-plate.day', el), night = $('.ln-plate.night', el);
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src'); let pending = '';
  Object.defineProperty(day, 'src', { configurable: true, get() { return S.dayReleased ? desc.get.call(this) : (pending || desc.get.call(this)); }, set(v) { if (S.dayReleased) desc.set.call(this, v); else pending = v; } });
  S.releaseDay = () => { if (S.dayReleased) return; S.dayReleased = true; if (pending) desc.set.call(day, pending); };
  /* hand-over: poster → live stage, same frame, once the night plate has decoded, the lettering face is in and a frame was drawn */
  let nightOk = false, framed = false, fontOk = false, done = false;
  const tryHandover = () => { if (done || !nightOk || !framed || !fontOk) return; done = true; wrap.classList.add('is-live'); poster && poster.classList.add('is-out'); setTimeout(() => { poster && poster.remove(); wrap.classList.remove('is-booting'); S.booted = true; performance.mark && performance.mark('v:live'); }, 450); };
  night.addEventListener('load', () => { nightOk = true; tryHandover(); });
  const unFrame = S.stage.on('frame', () => { framed = true; tryHandover(); });
  R.ensureFonts([S.design.font]).then(() => { fontOk = true; tryHandover(); refresh(); });
  R.onFonts(() => refresh());
  setTimeout(() => { if (!done) { nightOk = framed = fontOk = true; tryHandover(); } }, 6000);   /* never leave the poster up if a plate fails */
  window.__v = { get stage() { return S.stage; }, get design() { return S.design; }, S };
  return S.stage;
}
/** lights: on = night room + lit tube; off = day room + unlit tube (the jacket colour shows) */
export function setLights(on) {
  S.design.on = on; S.design.night = on; if (!on) S.releaseDay && S.releaseDay();
  S.stage.setView({ on, night: on }); $$('[data-lights]').forEach(b => { b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Lights on · tap to switch off' : 'Lights off · tap to switch on'); });
  save();
}
export function setView(v) {
  S.design.view = v; $$('[data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  const paper = $('.v-drawing', S.wrap);
  if (v === 'drawing') { S.wrap.classList.add('is-drawing'); paper.hidden = false; paintDrawing(); }
  else { S.wrap.classList.remove('is-drawing'); paper.hidden = true; S.stage.setFrame(v === 'fit' ? 'closeup' : 'room'); }
  $$('[data-lights]').forEach(b => { b.disabled = v === 'drawing'; });
}
let sheetMod = null;
async function paintDrawing() {
  const paper = $('.v-drawing', S.wrap); const el = $('.v-drawing__sheet', paper); if (!el) return;
  if (!sheetMod) { el.innerHTML = '<span class="v-skel v-skel--sheet"></span>'; sheetMod = await import('/lit-neon-preview/assets/js/core/sheet.js'); el.innerHTML = ''; }
  if (el.offsetWidth) sheetMod.render(el, eff(), { lite: true });
}
export function refresh() { S.listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); if (S.design.view === 'drawing' && sheetMod) paintDrawing(); }

/* cheap glow while typing (3 shadow layers, no contour filter); the full stack returns after a pause */
function cheapGlow() {
  const c = R.colourOf(S.design.colour); const hex = c.rgb ? '#ff5fa2' : c.hex;
  S.wrap.style.setProperty('--v-glow', `0 0 .05em ${hex}, 0 0 .18em ${hex}, 0 0 .5em ${R.rgba(hex, .55)}`);
}
export function typingPulse() { cheapGlow(); S.wrap.classList.add('is-typing'); clearTimeout(S.typingTimer); S.typingTimer = setTimeout(() => S.wrap.classList.remove('is-typing'), 420); }

/* ====================================================================== stage toolbar (bottom edge of the preview) ====================================================================== */
export function stageToolsHtml() {
  return `<span class="v-rendered" aria-hidden="true">Rendered preview</span>
  <div class="v-tools" data-qa="v.tools">
    <div class="v-seg v-seg--glass" role="tablist" aria-label="View">
      <button type="button" role="tab" data-view="room" aria-selected="true">Room</button><button type="button" role="tab" data-view="fit" aria-selected="false">Close-up</button><button type="button" role="tab" data-view="drawing" aria-selected="false">Drawing</button>
    </div>
    <div class="v-tools__icons">
      <button type="button" class="v-iconbtn" data-lights aria-pressed="true" aria-label="Lights on · tap to switch off">${ICON.power}</button>
      <button type="button" class="v-iconbtn" data-more aria-haspopup="dialog" aria-label="More">${ICON.more}</button>
    </div>
  </div>
  <div class="v-drawing" hidden><div class="v-drawing__sheet"></div></div>`;
}
export function wireStageTools(wrap) {
  wrap.addEventListener('click', e => {
    const v = e.target.closest('[data-view]'); if (v) { setView(v.dataset.view); return; }
    if (e.target.closest('[data-lights]')) { setLights(!S.design.on); return; }
    const m = e.target.closest('[data-more]'); if (m) openMore(m);
  });
}

/* ====================================================================== sheets (small, page-owned; the scrim starts under the sign) ====================================================================== */
export function makeSheet({ title, qa, cls = '' }) {
  const el = document.createElement('div'); el.className = 'v-sheet ' + cls; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.hidden = true; if (qa) el.dataset.qa = qa;
  el.innerHTML = `<div class="v-sheet__scrim" data-close></div><div class="v-sheet__panel"><div class="v-sheet__head"><h2 class="v-sheet__title" tabindex="-1">${esc(title)}</h2><button type="button" class="v-sheet__done" data-close>Done</button></div><div class="v-sheet__body"></div></div>`;
  document.body.appendChild(el);
  let opener = null, open = false;
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); api.close(); } };
  const api = {
    el, get isOpen() { return open; }, body: () => $('.v-sheet__body', el), setBody(h) { api.body().innerHTML = h; return api; }, setTitle(t) { $('.v-sheet__title', el).textContent = t; return api; },
    open(from) {
      if (open) return api; open = true; opener = from || document.activeElement;
      const top = S.stageEl ? S.stageEl.getBoundingClientRect().bottom : 0; el.style.setProperty('--scrim-top', Math.max(0, top) + 'px');
      el.hidden = false; requestAnimationFrame(() => el.classList.add('is-open')); document.addEventListener('keydown', onKey);
      setTimeout(() => { const f = $('[data-autofocus]', el) || $('.v-sheet__title', el); f && f.focus({ preventScroll: true }); }, 60);
      document.dispatchEvent(new CustomEvent('v:sheet', { detail: { open: true, el } })); return api;
    },
    close() {
      if (!open) return api; open = false; el.classList.remove('is-open'); document.removeEventListener('keydown', onKey);
      setTimeout(() => { if (!open) el.hidden = true; }, 320); if (opener && opener.focus) opener.focus({ preventScroll: true });
      document.dispatchEvent(new CustomEvent('v:sheet', { detail: { open: false, el } })); return api;
    }
  };
  el.addEventListener('click', e => { if (e.target.closest('[data-close]')) api.close(); });
  return api;
}
export function sheet(id, title, cls) { return S.sheets[id] || (S.sheets[id] = makeSheet({ title, qa: 'v.sheet.' + id, cls })); }
export function closeSheets() { Object.values(S.sheets).forEach(s => s.close()); }

/* ====================================================================== step 1 · words ====================================================================== */
const L = R.OPTIONS.limits;
export function wordsHtml() {
  return `<div class="v-field"><label class="v-label" for="v-words">What should it say?<span class="v-label__sub">Up to ${L.maxLines} lines of ${L.maxChars} characters</span></label>
    <div class="v-words"><textarea class="v-input" id="v-words" rows="2" autocomplete="off" autocapitalize="sentences" spellcheck="true" placeholder="${esc(DEFAULT_WORDS)}" aria-describedby="v-words-note" data-qa="v.words"></textarea><button type="button" class="v-words__clear" data-clear hidden aria-label="Clear the words">${ICON.close}</button></div>
    <div class="v-words__meta"><span class="v-counters" aria-live="polite"></span><span class="v-note" id="v-words-note" hidden role="status"></span></div></div>
    <div class="v-rowchips">
      <button type="button" class="v-chip" data-open="symbol" data-qa="v.words.symbol"><span class="v-chip__plus">+</span><span data-symbol-label>Add a symbol</span></button>
      <a class="v-chip v-chip--ghost" href="/lit-neon-preview/upload.html?from=builder" data-qa="v.words.logo">Have a logo?</a>
    </div>`;
}
let lastWords = '';
export function wireWords(root) {
  const ta = $('#v-words', root); ta.value = S.design.text || ''; lastWords = ta.value;
  ta.addEventListener('input', () => {
    let v = ta.value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"'); const lines = v.split('\n'); const note = $('#v-words-note', root);
    const over = lines.findIndex(l => Array.from(l).length > L.maxChars), tooMany = lines.length > L.maxLines;
    if (over >= 0 || tooMany) {
      /* typed past a limit: move the last word down when a line is free, else refuse the character (the words are never cut) */
      if (over >= 0 && !tooMany && lines.length < L.maxLines && lines[over].includes(' ')) { const l = lines[over], sp = l.lastIndexOf(' '); lines.splice(over, 1, l.slice(0, sp).trim(), l.slice(sp + 1)); v = lines.join('\n'); ta.value = v; showNote(root, `Line ${over + 1} was full, so the last word moved down.`); }
      else { ta.value = lastWords; showNote(root, tooMany ? 'Three lines is the most one sign can carry.' : `Line ${over + 1} is full. Press Enter for a new line.`); return; }
    } else note.hidden = true;
    lastWords = ta.value; typingPulse(); setDesign({ text: ta.value }, { typing: true });
  });
  ta.addEventListener('blur', () => { const clean = R.resolve(S.design).clean.text; if (S.design.text !== clean && ta.value !== clean) { ta.value = clean; lastWords = clean; setDesign({ text: clean }); } });
  $('[data-clear]', root).addEventListener('click', () => { ta.value = ''; lastWords = ''; setDesign({ text: '' }); ta.focus(); });
  $('[data-open="symbol"]', root).addEventListener('click', e => openSymbol(e.currentTarget));
  paintWords(root); onChange(() => paintWords(root));
}
function showNote(root, msg) { const n = $('#v-words-note', root); n.hidden = false; n.textContent = msg; }
export function paintWords(root) {
  const ta = $('#v-words', root); if (!ta) return;
  if (ta.value !== (S.design.text || '') && document.activeElement !== ta) { ta.value = S.design.text || ''; lastWords = ta.value; }
  $('[data-clear]', root).hidden = !S.design.text;
  const lines = S.design.text ? S.design.text.split('\n') : [];
  $('.v-counters', root).innerHTML = lines.map((l, i) => { const n = Array.from(l).length; return `<span class="v-counter${n >= L.maxChars ? ' is-full' : ''}">${lines.length > 1 ? `L${i + 1} ` : ''}${n}/${L.maxChars}</span>`; }).join('');
  const res = R.resolve(eff()); const lbl = $('[data-symbol-label]', root);
  if (res.bad.length) showNote(root, `We can’t draw ${res.bad.join(' ')} in neon tube — try a symbol instead.`);
  lbl.textContent = S.design.icon ? `Symbol · ${symbolName(S.design.icon)}` : 'Add a symbol'; lbl.closest('.v-chip').classList.toggle('is-on', !!S.design.icon);
}
const SYMBOL_NAMES = { heart: 'Heart', twohearts: 'Two hearts', ring: 'Ring', champagne: 'Champagne', moon: 'Moon', bolt: 'Bolt', cocktail: 'Cocktail', star: 'Star' };
const symbolName = id => SYMBOL_NAMES[id] || id;
export function openSymbol(opener) {
  const sh = sheet('symbol', 'Add a symbol');
  const d = eff(); const paint = () => {
    sh.setBody(`<p class="v-lede">Drawn in the same tube. The price and height change shows on each one.</p><div class="v-symbols" role="group" aria-label="Symbol">${['', ...R.OPTIONS.symbols].map(id => {
      const delta = id ? pricing.symbolDelta(d, id) : null, cm = id ? pricing.symbolHeightDelta(d, id) : 0;
      return `<button type="button" class="v-symbol" aria-pressed="${id === S.design.icon}" data-icon="${id}"><span class="v-symbol__ic">${id ? R.iconSvg(id, null, '', '') : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>'}</span><span class="v-symbol__name">${esc(id ? symbolName(id) : 'None')}</span><span class="v-symbol__delta">${id ? (delta == null ? '' : `${esc(fmtDelta(delta))} · +${cm} cm`) : 'No extra'}</span></button>`; }).join('')}</div>
      <div class="v-seg v-iconpos" role="group" aria-label="Symbol sits" ${S.design.icon ? '' : 'hidden'}><button type="button" data-pos="above" aria-pressed="${S.design.iconPos === 'above'}">Above the words</button><button type="button" data-pos="inline" aria-pressed="${S.design.iconPos === 'inline'}">Beside the words</button></div>`);
  };
  paint();
  sh.body().onclick = e => { const b = e.target.closest('[data-icon]'); if (b) { setDesign({ icon: b.dataset.icon }); S.stage.strike(); paint(); return; } const p = e.target.closest('[data-pos]'); if (p) { setDesign({ iconPos: p.dataset.pos }); paint(); } };
  sh.open(opener);
}

/* ====================================================================== step 2 · style (lettering) ====================================================================== */
export function styleHtml() {
  const faces = R.enabledFonts(); const styles = ['all', ...Array.from(new Set(faces.map(f => f.style || 'script')))];
  return `<div class="v-chips" role="group" aria-label="Style">${styles.map(s => `<button type="button" class="v-chip v-chip--sm" aria-pressed="${s === 'all'}" data-style="${s}">${esc(s[0].toUpperCase() + s.slice(1))}</button>`).join('')}</div>
    <div class="v-tiles" role="group" aria-label="Lettering">${faces.map(f => `<button type="button" class="v-tile is-loading" aria-pressed="${f.id === S.design.font}" data-font="${f.id}" data-style="${f.style || 'script'}" aria-label="${esc(f.name)} lettering"><span class="v-tile__neon" data-neon></span><span class="v-tile__name">${esc(f.name)}<small data-note></small></span></button>`).join('')}</div>`;
}
export function wireStyle(root) {
  const faces = R.enabledFonts();
  /* the tiles mount only when the step opens: drawing (or even measuring) text in a face makes the browser fetch it */
  const mountTiles = () => $$('.v-tile', root).forEach(b => { if (!S.tiles.has(b.dataset.font)) S.tiles.set(b.dataset.font, R.mountNeon($('[data-neon]', b), { ...eff(), font: b.dataset.font, colours: null }, { lit: true, strike: false, fitW: .9, fitH: .72, spill: .25, composite: false })); });
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-font]'); if (t) { setDesign({ font: t.dataset.font }); S.stage.strike(); return; }
    const c = e.target.closest('[data-style]'); if (c) { $$('[data-style]', root).forEach(x => x.setAttribute('aria-pressed', String(x === c))); $$('.v-tile', root).forEach(tl => { tl.hidden = c.dataset.style !== 'all' && tl.dataset.style !== c.dataset.style; }); R.refitAll(); }
  });
  const paint = () => {
    const res = R.resolve(eff()); const ready = S.fontsAsked;
    $$('.v-tile', root).forEach(b => { const f = R.fontOf(b.dataset.font); b.setAttribute('aria-pressed', String(f.id === S.design.font)); b.classList.toggle('is-loading', !(ready && R.fontReady(f))); const m = S.tiles.get(f.id); if (m && ready) m.update({ ...eff(), font: f.id, colours: null }); $('[data-note]', b).textContent = (f.minLetterCm || 0) > res.letterCm ? 'Thin' : ''; b.title = (f.minLetterCm || 0) > res.letterCm ? `${f.name} needs letters at least ${f.minLetterCm} cm tall` : ''; });
  };
  paint(); onChange(paint); R.onFonts(paint);
  /* the other lettering faces load now, when the step opens — not before (each tile shows its face as it arrives) */
  S.loadFaces = () => { if (S.fontsAsked) return; S.fontsAsked = true; mountTiles(); paint(); R.ensureFonts(faces.map(f => f.id)).then(() => { paint(); R.refitAll(); }); };
}

/* ====================================================================== step 3 · colour ====================================================================== */
export function colourHtml() {
  return `<div class="v-swatches" role="group" aria-label="Tube colour">${R.OPTIONS.colours.map(c => `<button type="button" class="v-swatch${c.rgb ? ' v-swatch--rgb' : ''}" aria-pressed="${c.id === S.design.colour}" aria-label="${esc(c.name)}" style="--tube:${c.hex};--core:${c.core || '#fff'}" data-colour="${c.id}"><span class="v-swatch__tube"></span></button>`).join('')}</div>
    <p class="v-colourname"><b data-colour-name></b><span data-colour-note></span></p>
    <div class="v-field"><span class="v-label">When it’s off</span><div class="v-seg" role="group" aria-label="When it’s off"><button type="button" data-jacket="white" aria-pressed="${S.design.jacket === 'white'}"><b>White jacket</b><small>White tube by day</small></button><button type="button" data-jacket="colour" aria-pressed="${S.design.jacket === 'colour'}"><b>Coloured jacket</b><small>Tinted tube by day</small></button></div></div>
    <button type="button" class="v-link" data-open="twocolours">Two colours? <span data-two-note></span>${ICON.chevron}</button>`;
}
export function wireColour(root) {
  root.addEventListener('click', e => {
    const s = e.target.closest('[data-colour]'); if (s) { const id = s.dataset.colour; const patch = { colour: id }; if (S.design.colours) patch.colours = S.design.colours.map((c, i) => (i === 0 ? id : c)); setDesign(patch); S.stage.strike(); return; }
    const j = e.target.closest('[data-jacket]'); if (j && !j.disabled) { setDesign({ jacket: j.dataset.jacket }); return; }
    if (e.target.closest('[data-open="twocolours"]')) openTwoColours(e.target.closest('[data-open]'));
  });
  const paint = () => {
    const res = R.resolve(eff()); const rules = pricing.rules().pricing;
    $$('[data-colour]', root).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.colour === S.design.colour)));
    $('[data-colour-name]', root).textContent = res.colour.name; $('[data-colour-note]', root).textContent = res.rgb ? ` · adds ${Math.round((rules.rgbMultiplier - 1) * 100)}% — the remote picks the colour` : (S.design.colour === 'warm' ? ' · the colour most people choose' : '');
    $$('[data-jacket]', root).forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.jacket === S.design.jacket)); b.disabled = res.rgb; });
    const two = $('[data-two-note]', root); two.textContent = S.design.colours ? `· ${res.distinctColours.map(c => c.name).join(' / ')}` : (res.lines.length > 1 ? `· ${fmtDelta(rules.multicolourDelta)} per extra colour` : '· needs two lines');
  };
  paint(); onChange(paint);
}
function openTwoColours(opener) {
  const sh = sheet('twocolours', 'Colour each line');
  const paint = () => {
    const res = R.resolve(eff()); const rules = pricing.rules().pricing;
    if (res.rgb) { sh.setBody('<p class="v-lede">Colour changing is one colour across the whole sign.</p>'); return; }
    if (res.lines.length < 2) { sh.setBody('<p class="v-lede">Add a second line in your words to give each line its own colour.</p>'); return; }
    const cs = S.design.colours || res.lines.map(() => S.design.colour);
    sh.setBody(`<p class="v-lede">Pick a colour for each line. Each extra colour adds ${esc(fmtDelta(rules.multicolourDelta))}.</p>${res.lines.map((l, i) => `<div class="v-line" data-line="${i}"><span class="v-line__label">Line ${i + 1} · <b>${esc(l)}</b> <em>${esc(R.colourOf(cs[i]).name)}</em></span><div class="v-swatches v-swatches--sm">${R.OPTIONS.colours.filter(x => !x.rgb).map(x => `<button type="button" class="v-swatch" aria-pressed="${cs[i] === x.id}" aria-label="${esc(x.name)}" style="--tube:${x.hex};--core:${x.core || '#fff'}" data-line-colour="${x.id}"><span class="v-swatch__tube"></span></button>`).join('')}</div></div>`).join('')}
      <button type="button" class="v-link" data-one ${S.design.colours ? '' : 'hidden'}>Back to one colour</button>`);
  };
  paint();
  sh.body().onclick = e => { const b = e.target.closest('[data-line-colour]'); if (b) { const i = +b.closest('[data-line]').dataset.line; const res = R.resolve(eff()); const cs = (S.design.colours || res.lines.map(() => S.design.colour)).slice(); cs[i] = b.dataset.lineColour; if (i === 0) S.design.colour = cs[0]; setDesign({ colours: cs }); S.stage.strike(); paint(); return; } if (e.target.closest('[data-one]')) { setDesign({ colours: null }); paint(); } };
  sh.open(opener);
}

/* ====================================================================== step 4 · size (+ backing / hanging rows) ====================================================================== */
const SHORT = { s: 'S', m: 'M', l: 'L', xl: 'XL', xxl: 'XXL' };
export function sizeHtml({ rows = true } = {}) {
  return `<div class="v-sizes" role="group" aria-label="Size"></div><p class="v-sizeline" aria-live="polite"><b data-size-name></b><span data-size-dims></span><span data-size-verdict></span></p>
    ${rows ? optionRowsHtml() : ''}`;
}
export function optionRowsHtml() {
  return `<div class="v-rows"><button type="button" class="v-row" data-open="backing"><span class="v-row__k">Backing</span><span class="v-row__v" data-backing-v></span>${ICON.chevron}</button><button type="button" class="v-row" data-open="hang"><span class="v-row__k">Hangs</span><span class="v-row__v" data-hang-v></span>${ICON.chevron}</button></div>`;
}
/** the Backing / Hangs rows on their own (version 2 keeps them under More) */
export function wireRows(root) {
  root.addEventListener('click', e => { const o = e.target.closest('[data-open]'); if (o) { if (o.dataset.open === 'backing') openBacking(o); else if (o.dataset.open === 'hang') openHang(o); } });
  paintRows(root); onChange(() => paintRows(root));
}
export function wireSize(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-size]'); if (b && !b.disabled) { setDesign({ size: b.dataset.size }); return; }
    const o = e.target.closest('[data-open]'); if (o) { if (o.dataset.open === 'backing') openBacking(o); else if (o.dataset.open === 'hang') openHang(o); }
  });
  const paint = () => {
    const scene = S.stage && S.stage.scene && !S.stage.scene.own ? S.stage.scene : S.design.scene;
    const cards = pricing.sizeCards(eff(), scene).filter(c => c.id !== 'custom'); const el = $('.v-sizes', root);
    el.innerHTML = cards.map(c => `<button type="button" class="v-size" data-size="${c.id}" aria-pressed="${c.selected}" ${c.available ? '' : 'disabled'} aria-label="${esc(c.name)}${c.W ? `, ${esc(fmtDims(c.W, c.H))}` : ''}${c.payable != null ? `, ${esc(gbp(c.payable))}` : ''}"><b>${SHORT[c.id] || c.name}</b><span>${c.payable != null ? esc(gbp(c.payable)) : (c.tooWide ? 'Quoted' : !c.available ? 'Thin' : 'Quote')}</span></button>`).join('');
    const cur = cards.find(c => c.selected) || cards[1];
    $('[data-size-name]', root).textContent = cur.name; $('[data-size-dims]', root).textContent = cur.W ? ` · ${fmtDims(cur.W, cur.H, S.design.unit)}` : ''; $('[data-size-verdict]', root).textContent = cur.tooWide ? ' · over 2 m, quoted by a designer' : (!cur.available ? ` · ${cur.reason}` : (cur.verdict ? ` · ${cur.verdict}` : ''));
    paintRows(root);
  };
  paint(); onChange(paint);
}
export function paintRows(root) {
  const res = R.resolve(eff()); const bv = $('[data-backing-v]', root), hv = $('[data-hang-v]', root);
  if (bv) bv.textContent = `${res.backing.name}${res.finish.id !== 'clear' ? ` · ${res.finish.name.toLowerCase()}` : ''}`;
  if (hv) hv.textContent = res.backing.id === 'stand' ? 'On its stand' : `${res.hang.name}${res.use.id === 'out' ? ' · outdoors' : ''}`;
}
const BACK_ICON = { cut: ICON.drawing, rect: ICON.image, stand: ICON.cube };
export function openBacking(opener) {
  const sh = sheet('backing', 'Acrylic backing'); const rules = pricing.rules().pricing;
  const paint = () => {
    const d = eff(); const deltas = pricing.deltas(d, 'backing', R.OPTIONS.backings.map(b => b.id)); const fin = pricing.deltas(d, 'board', R.OPTIONS.finishes.map(f => f.id));
    const show = v => v === 'quote' ? 'Quote' : v == null ? '' : (v === 0 ? 'Included' : fmtDelta(v));
    sh.setBody(`<p class="v-lede">Every option is drawn on the wall as you pick it.</p><div class="v-opts" role="radiogroup" aria-label="Backing">${R.OPTIONS.backings.map(b => `<button type="button" class="v-opt" role="radio" aria-checked="${b.id === S.design.backing}" data-backing="${b.id}">${BACK_ICON[b.id]}<span><b>${esc(b.name)}</b><small>${esc(b.sub)}</small></span><em>${esc(b.id === S.design.backing ? (rules.backing[b.id] ? fmtDelta(rules.backing[b.id]) : 'Included') : show(deltas[b.id]))}</em></button>`).join('')}</div>
      <span class="v-label">Acrylic finish</span><div class="v-finishes" role="group" aria-label="Acrylic finish">${R.OPTIONS.finishes.map(f => `<button type="button" class="v-finish" aria-pressed="${f.id === S.design.board}" data-finish="${f.id}"><span class="v-finish__sw" style="background:${f.swatch}"></span>${esc(f.name)}<em>${esc(f.id === S.design.board ? (rules.finish[f.id] ? fmtDelta(rules.finish[f.id]) : 'Included') : show(fin[f.id]))}</em></button>`).join('')}</div>`);
  };
  paint();
  sh.body().onclick = e => { const b = e.target.closest('[data-backing]'); if (b) { setDesign({ backing: b.dataset.backing }); paint(); return; } const f = e.target.closest('[data-finish]'); if (f) { setDesign({ board: f.dataset.finish }); paint(); } };
  sh.open(opener);
}
export function openHang(opener) {
  const sh = sheet('hang', 'How it hangs');
  const paint = () => {
    const stand = S.design.backing === 'stand';
    sh.setBody(`<div class="v-field"><span class="v-label">Where it will hang</span><div class="v-seg" role="group" aria-label="Where it will hang"><button type="button" data-use="in" aria-pressed="${S.design.use === 'in'}"><b>Indoors</b></button><button type="button" data-use="out" aria-pressed="${S.design.use === 'out'}"><b>Outdoors</b><small>Quoted by a designer</small></button></div>${S.design.use === 'out' ? '<p class="v-note is-amber">Outdoor signs get a sealed supply and a weatherproof jacket, so a designer prices them by hand.</p>' : ''}</div>
      ${stand ? '<p class="v-lede">A table stand sits on its base, so there is nothing to hang.</p>' : `<span class="v-label">How it hangs</span><div class="v-opts" role="radiogroup" aria-label="How it hangs">${R.OPTIONS.hangs.map(h => `<button type="button" class="v-opt" role="radio" aria-checked="${h.id === S.design.hang}" data-hang="${h.id}"><span><b>${esc(h.name)}</b><small>${esc(h.sub)}</small></span><em>Included</em></button>`).join('')}</div>`}
      <ul class="v-included"><li>${ICON.check}Dimmer and remote</li><li>${ICON.check}Moulded UK plug</li><li>${ICON.check}Free mainland-GB delivery</li><li>${ICON.check}Drawing approved first</li></ul>`);
  };
  paint();
  sh.body().onclick = e => { const u = e.target.closest('[data-use]'); if (u) { setDesign({ use: u.dataset.use }); paint(); return; } const h = e.target.closest('[data-hang]'); if (h) { setDesign({ hang: h.dataset.hang }); paint(); } };
  sh.open(opener);
}

/* ====================================================================== price dock / bar ====================================================================== */
const DIMS = (res, unit) => (res.dims ? fmtDims(res.dims.W, res.dims.H, unit) : '');
/** paint a price slot: .v-price__amount + .v-price__cap (+ .v-price__delta). Returns the price state. */
export function paintPrice(slot) {
  const p = price(); const amount = $('[data-amount]', slot), cap = $('[data-cap]', slot), delta = $('[data-delta]', slot);
  slot.classList.remove('is-quote', 'is-wait');
  if (p.kind === 'price') { amount.textContent = gbp(p.payable); cap.textContent = DIMS(p.res, S.design.unit); }
  else if (p.kind === 'quote') { slot.classList.add('is-quote'); amount.textContent = 'Quote'; cap.textContent = pricing.quoteReason(p); }
  else { slot.classList.add('is-wait'); amount.innerHTML = '<span class="v-skel v-skel--price"></span>'; cap.textContent = p.kind === 'bad' ? 'Remove the symbol we can’t draw' : 'Measuring your lettering…'; }
  const key = [S.design.size, S.design.icon, S.design.font, S.design.colour, (S.design.colours || []).join(), S.design.backing, S.design.board].join('|');
  if (delta) { if (p.kind === 'price' && S.lastKey && key !== S.lastKey && S.lastPayable != null) { const diff = Math.round((p.payable - S.lastPayable) * 100) / 100; delta.textContent = diff ? `${fmtDelta(diff)} · ${changeLabel(S.lastKey, key)}` : ''; delta.classList.toggle('is-ok', diff < 0); } else if (p.kind !== 'price') delta.textContent = ''; }
  if (p.kind === 'price') S.lastPayable = p.payable; S.lastKey = key;
  return p;
}
function changeLabel(prev, next) {
  const a = prev.split('|'), b = next.split('|');
  if (a[0] !== b[0]) return `${R.sizeOf(b[0]).name} size`; if (a[1] !== b[1]) return b[1] ? `${symbolName(b[1])} symbol` : 'no symbol'; if (a[2] !== b[2]) return `${R.fontOf(b[2]).name} lettering`;
  if (a[3] !== b[3]) return R.colourOf(b[3]).name; if (a[4] !== b[4]) return 'two colours'; if (a[5] !== b[5]) return R.backingOf(b[5]).name; if (a[6] !== b[6]) return `${R.finishOf(b[6]).name} acrylic`; return '';
}
export function openBreakdown(opener) {
  const sh = sheet('breakdown', 'What’s in the price'); const b = pricing.breakdown(eff());
  const label = r => r.id === 'base' ? r.label : r.id === 'symbol' ? `Symbol · ${symbolName(S.design.icon)}` : r.id === 'rgb' ? 'Colour changing' : r.id === 'colours' ? r.label : r.id === 'backing' ? `Backing · ${r.label}` : r.id === 'finish' ? `Finish · ${r.label}` : r.label;
  sh.setBody(`<div class="v-break">${b.rows.map(r => `<div><span>${esc(label(r))}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span><b>${r.amount == null ? '—' : r.id === 'base' ? esc(gbp(r.amount)) : esc(fmtDelta(r.amount, 'Included'))}</b></div>`).join('')}${b.kind === 'price' ? `<div class="total"><span>Total${b.promoNote ? `<small>${esc(b.promoNote)}</small>` : ''}</span><b>${esc(gbp(b.total))}</b></div>` : `<div class="total"><span>${esc(b.reason)}</span><b class="is-quote">Quote</b></div>`}</div>
    <p class="v-lede">Free mainland-GB delivery, a dimmer and remote and a UK plug are included. You approve a drawing before anything is made.</p>`);
  sh.open(opener);
}

/* ====================================================================== add to basket (one sheet, named progress) ====================================================================== */
export function openConfirm(opener) {
  const sh = sheet('confirm', 'Check it over'); const p = price(); const res = p.res || R.resolve(eff());
  const colourText = S.design.colours ? res.lineColours.map((c, i) => `${c.name} (line ${i + 1})`).join(' / ') : res.colour.name;
  const spec = [['Lettering', res.font.name], ['Colour', `${colourText}, ${res.jacket.name.toLowerCase()}`], ['Size', `${res.sizeId === 'custom' ? 'Custom' : R.sizeOf(res.sizeId).name} · ${DIMS(res, S.design.unit)}`], ['Backing', `${res.backing.name}, ${res.finish.name.toLowerCase()} acrylic · ${res.backing.id === 'stand' ? 'on its stand' : res.hang.name.toLowerCase()}`]];
  if (S.design.icon) spec.splice(1, 0, ['Symbol', `${symbolName(S.design.icon)}, ${S.design.iconPos === 'inline' ? 'beside the words' : 'above the words'}`]);
  const quote = p.kind === 'quote'; const pc = postcodeGet();
  sh.setBody(`<p class="v-lede">This is what we make. Read the words once more before you add it.</p>
    <div class="v-confirm__sign" data-confirm-neon role="img" aria-label="${esc(res.words)}"></div>
    <dl class="v-spec">${spec.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <div class="v-confirm__price"><span>${quote ? esc(pricing.quoteReason(p)) : 'Price'}</span><b>${quote ? 'Quoted' : esc(gbp(p.payable))}</b></div>
    <form class="v-pc" data-pc novalidate><label class="v-label" for="v-pc">Deliver to</label><div class="v-pc__row"><input class="v-input" id="v-pc" inputmode="text" autocomplete="postal-code" autocapitalize="characters" placeholder="Postcode" value="${esc(pc)}"><button type="submit" class="v-btn v-btn--ghost">Check</button></div><p class="v-pc__msg" data-pc-msg></p></form>
    <p class="v-ccr">Made to your words, so it can’t be returned for a change of mind once production starts. You approve a drawing first, and faults are covered.</p>
    ${quote ? `<a class="v-btn v-btn--primary v-btn--lg" href="/lit-neon-preview/create.html${esc(buildHash(eff()))}">Request a free quote in the full designer</a>` : `<button type="button" class="v-btn v-btn--primary v-btn--lg" data-add>Spelling checked · Add to basket ${esc(gbp(p.payable))}</button>`}`);
  const body = sh.body();
  R.mountNeon($('[data-confirm-neon]', body), { ...eff(), icon: '' }, { lit: true, strike: false, fitW: .86, fitH: .62, composite: false }); /* the words, large; the symbol is named in the spec row */
  const pcMsg = $('[data-pc-msg]', body); const paintPc = v => { const d = pricing.deliveryLine(v); pcMsg.textContent = d.status === 'empty' ? `Free delivery across mainland GB · ${d.text}` : d.text; pcMsg.classList.toggle('is-bad', d.status === 'excluded' || d.status === 'invalid'); if (d.status === 'ok' || d.status === 'excluded') postcodeSet(d.formatted); };
  paintPc(pc); $('[data-pc]', body).addEventListener('submit', e => { e.preventDefault(); paintPc($('#v-pc', body).value); });
  const add = $('[data-add]', body);
  if (add) add.addEventListener('click', async () => {
    add.disabled = true; add.setAttribute('aria-busy', 'true'); add.textContent = 'Adding…';
    try {
      const mod = await import('/lit-neon-preview/assets/js/core/basket.js'); const basket = mod.default;
      basket.add({ kind: 'custom', state: eff() }); add.textContent = 'Added ✓'; paintBasketCount();
      setTimeout(() => { sh.close(); mod.drawer && mod.drawer.open(); add.disabled = false; add.removeAttribute('aria-busy'); }, 350);
    } catch (e) { console.error(e); add.disabled = false; add.textContent = 'Try again'; }
  });
  sh.open(opener);
}
function postcodeGet() { try { return localStorage.getItem('postcode') || ''; } catch { return ''; } }
function postcodeSet(v) { try { v ? localStorage.setItem('postcode', v) : localStorage.removeItem('postcode'); } catch {} }
export function paintBasketCount() {
  let n = 0; try { n = (JSON.parse(localStorage.getItem('basket') || '[]') || []).reduce((a, l) => a + Math.max(1, +l.qty || 1), 0); } catch {}
  $$('[data-basket-count]').forEach(b => { b.textContent = String(n); b.hidden = !n; });
}

/* ====================================================================== more (⋯): room, real size, inches, share, email, drawing PDF, AR ====================================================================== */
/** the ⋯ menu list (also the body of the "More" tab in version 2) */
export function moreMenuHtml() {
  const real = S.stage && S.stage.state.frame === 'real'; const inches = S.design.unit === 'in';
  return `<div class="v-menu">
    <button type="button" class="v-menu__item" data-m="room">${ICON.image}<span>Change the room</span>${ICON.chevron}</button>
    <button type="button" class="v-menu__item" data-m="real" aria-pressed="${real}">${ICON.ruler}<span>${real ? 'Back to the room view' : 'Real size'}</span></button>
    <button type="button" class="v-menu__item" data-m="unit">${ICON.ruler}<span>${inches ? 'Show centimetres' : 'Show inches'}</span></button>
    <button type="button" class="v-menu__item" data-m="share">${ICON.share}<span>Share this design</span></button>
    <button type="button" class="v-menu__item" data-m="email">${ICON.mail}<span>Email it to me</span></button>
    <button type="button" class="v-menu__item" data-m="pdf">${ICON.download}<span>Download the drawing (PDF)</span></button>
    <button type="button" class="v-menu__item" data-m="ar">${ICON.cube}<span>See it in your room (AR)</span></button>
    <a class="v-menu__item" href="/lit-neon-preview/create.html${esc(buildHash(eff()))}">${ICON.pencil}<span>Open in the full designer</span>${ICON.chevron}</a></div>`;
}
/** wire a rendered menu; close() dismisses the host (sheet or panel) before an action that opens something else */
export function wireMoreMenu(body, { close = () => {}, opener = null } = {}) {
  body.addEventListener('click', async e => {
    const b = e.target.closest('[data-m]'); if (!b) return; const k = b.dataset.m;
    if (k === 'room') { close(); setTimeout(() => openRoom(opener), 300); return; }
    if (k === 'real') { const real = S.stage.state.frame === 'real'; S.stage.setFrame(real ? (S.design.view === 'fit' ? 'closeup' : 'room') : 'real'); b.setAttribute('aria-pressed', String(!real)); b.querySelector('span').textContent = real ? 'Real size' : 'Back to the room view'; return; }
    if (k === 'unit') { const u = S.design.unit === 'in' ? 'cm' : 'in'; S.design.unit = u; S.stage.setView({ rulers: u, unit: u }); save(); refresh(); b.querySelector('span').textContent = u === 'in' ? 'Show centimetres' : 'Show inches'; return; }
    if (k === 'share' || k === 'email') { const span = b.querySelector('span'); const was = span.textContent; span.textContent = 'Opening…'; const share = await import('/lit-neon-preview/assets/js/core/share.js'); span.textContent = was; close(); const s = share.open({ state: eff(), stage: S.stage, title: k === 'email' ? 'Email it to me' : 'Share your design', qa: 'share' }); if (k === 'email') setTimeout(() => { const t = s.el.querySelector('[data-qa="share.tab.email"]'); t && t.click(); }, 60); return; }
    if (k === 'pdf') { const span = b.querySelector('span'); span.textContent = 'Drawing your sign…'; b.disabled = true; try { const d = await import('/lit-neon-preview/assets/js/core/drawing-export.js'); await d.download(eff()); span.textContent = 'Downloaded ✓'; } catch (err) { console.error(err); span.textContent = 'Could not draw it — try again'; } b.disabled = false; return; }
    if (k === 'ar') { if (b.dataset.arMounted) return; b.dataset.arMounted = '1'; const span = b.querySelector('span'); span.textContent = 'One moment…'; try { const ar = await import('/lit-neon-preview/assets/js/core/ar.js'); ar.mount(b, { stage: S.stage, getState: () => eff(), qa: 'v.ar', onFallback: f => { span.textContent = String((f && f.message) || 'Not available on this device').replace(/<[^>]+>/g, ''); } }); span.textContent = 'See it in your room (AR)'; b.click(); } catch (err) { console.error(err); span.textContent = 'Not available on this device'; } }
  });
}
export function openMore(opener) {
  const sh = sheet('more', 'More', 'v-sheet--menu'); sh.setBody(moreMenuHtml());
  if (!sh._wired) { sh._wired = true; wireMoreMenu(sh.body(), { close: () => sh.close(), opener }); }
  sh.open(opener);
}
function openRoom(opener) {
  const sh = sheet('room', 'Where will it hang?'); const list = stage.scenesFor(null).filter(s => s.plates);
  sh.setBody(`<p class="v-lede">Every room is rendered, and your sign is drawn at true size against the furniture.</p><div class="v-rooms">${list.map(s => `<button type="button" class="v-room" aria-pressed="${s.id === S.design.scene}" data-scene="${s.id}"><img src="/lit-neon-preview/assets/img/${esc(s.plates.night)}-600.jpg" alt="" loading="lazy" width="600" height="400"><span>${esc(s.name)}</span></button>`).join('')}</div>`);
  sh.body().onclick = e => { const b = e.target.closest('[data-scene]'); if (!b) return; S.design.scene = b.dataset.scene; S.stage.setScene(b.dataset.scene); save(); refresh(); sh.close(); };
  sh.open(opener);
}

/* ====================================================================== keyboard mode + viewport height ====================================================================== */
export function wireViewport(root) {
  const vv = window.visualViewport; let baseH = innerHeight, focused = false;
  const paint = () => { const h = vv ? vv.height : innerHeight; baseH = Math.max(baseH, innerHeight); root.style.setProperty('--vvh', Math.round(h) + 'px'); root.classList.toggle('kbd', h < baseH * .78 || (focused && isPhone())); if (vv && vv.offsetTop) scrollTo(0, 0); };
  document.addEventListener('focusin', e => { focused = !!e.target.matches('textarea, input:not([type=checkbox])'); paint(); });
  document.addEventListener('focusout', () => { focused = false; setTimeout(paint, 60); });
  vv && vv.addEventListener('resize', paint); addEventListener('resize', () => { baseH = innerHeight; paint(); });
  paint();
}

/* ====================================================================== header + version pill (markup is static in the page) ====================================================================== */
export function wireHeader(root) {
  const pill = $('[data-pill]', root); try { if (sessionStorage.getItem('v.pill') === 'x') pill.hidden = true; } catch {}
  $('[data-pill-x]', root).addEventListener('click', () => { pill.hidden = true; try { sessionStorage.setItem('v.pill', 'x'); } catch {} });
  paintBasketCount(); addEventListener('storage', paintBasketCount); document.addEventListener('ln:basket', paintBasketCount);
}

/* facts (warranty, promo window, delivery dates) load in the background; prices repaint if the promo window is live */
export function loadFacts() { import('/lit-neon-preview/assets/js/core/facts.js').then(f => f.load().then(() => refresh())).catch(() => {}); }
export { R, stage, pricing, gbp, fmtDims, fmtDelta, fmtLen };
