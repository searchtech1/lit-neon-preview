/* Lit Neon v2 — renderer (brief §6.2 WS0-B). The one place a sign's text becomes glyphs, metrics and glow.
   Ported from the fused prototype (mountNeon/fitNeon/glowOf/measure/fontReady) and extended with:
     · the design-state vocabulary (§4.2) and the option catalogue every module shares (OPTIONS, DEFAULT_DESIGN)
     · resolve(state): text rules → metrics → cm dims in one call (pricing, stage, sheet and basket all use it)
     · per-face wordSpacingEm / ampersandGapEm applied identically to the DOM and to the measurer (B44)
     · per-line colours (owner D5), icon above/inline, off-state via catalog jacketColour
     · bakeGlow(): a canvas render with the glow in the pixels (AR texture, share preview, drawing export)
   Node-safe at import: no DOM is touched until a function needs it; measure() falls back to a deterministic estimate
   when there is no canvas, so pricing can be unit-tested. Rules (text limits, glyphs, cm) stay in neon-core. */
import 'catalog';
import 'neon-core';

const LIT = globalThis.LIT, core = globalThis.LitNeonCore;
const hasDOM = () => typeof document !== 'undefined' && !!document.createElement;

/* ---------- option catalogue (ids match config/pricing-rules.json keys) ---------- */
export const OPTIONS = {
  fonts: LIT.fonts,
  colours: LIT.colours,
  sizes: LIT.sizes,
  icons: LIT.icons,
  symbols: ['heart', 'twohearts', 'ring', 'champagne', 'moon', 'bolt', 'cocktail', 'star'],
  backings: [
    { id: 'cut', name: 'Cut to shape', sub: 'Acrylic follows the outline of your letters', margin: 2.5 },
    { id: 'letter', name: 'Cut to letter', sub: 'Acrylic hugs each letter, almost invisible', margin: 1 },
    { id: 'rect', name: 'Rectangle', sub: 'A clean panel on brass standoffs', margin: 5 },
    { id: 'stand', name: 'Table stand', sub: 'Freestanding, for shelves and bars', margin: 5 }
  ],
  finishes: [
    { id: 'clear', name: 'Clear', swatch: 'linear-gradient(135deg,#f5f7f9,#cfd6dc)', fill: ['#ffffff', .08], edge: ['#ffffff', .5], panel: 'rgba(255,255,255,.07)', border: 'rgba(255,255,255,.42)', mirror: false },
    { id: 'black', name: 'Black', swatch: '#16171b', fill: ['#121316', .95], edge: ['#ffffff', .14], panel: 'rgba(18,19,22,.95)', border: 'rgba(255,255,255,.12)', mirror: false },
    { id: 'white', name: 'White', swatch: '#f6f6f4', fill: ['#f4f4f2', .95], edge: ['#000000', .08], panel: 'rgba(244,244,242,.96)', border: 'rgba(0,0,0,.08)', mirror: false },
    { id: 'gold', name: 'Gold mirror', swatch: 'linear-gradient(135deg,#8f7034,#f0d48b 45%,#9c7b3a 70%,#d9bb70)', fill: ['#b8954f', 1], edge: ['#f6dd9c', .9], panel: 'linear-gradient(135deg,#7d6230,#e2c47c 40%,#8d6f35 62%,#cfb067)', border: 'rgba(246,221,156,.6)', mirror: true },
    { id: 'silver', name: 'Silver mirror', swatch: 'linear-gradient(135deg,#8b9098,#f3f5f7 45%,#9298a1 70%,#d7dbe0)', fill: ['#a9aeb6', 1], edge: ['#f4f6f8', .9], panel: 'linear-gradient(135deg,#7f848c,#eef0f2 40%,#8b9099 62%,#cdd1d6)', border: 'rgba(244,246,248,.6)', mirror: true }
  ],
  uses: [{ id: 'in', name: 'Indoors' }, { id: 'out', name: 'Outdoors' }],
  jackets: [{ id: 'white', name: 'White jacket', sub: 'White tube when off' }, { id: 'colour', name: 'Coloured jacket', sub: 'Tinted tube when off' }],
  hangs: [
    { id: 'screws', name: 'Wall screws', sub: 'Through the acrylic, on standoffs' },
    { id: 'chains', name: 'Hanging chains', sub: 'From hooks or a picture rail' },
    { id: 'strips', name: 'Adhesive strips', sub: 'No drilling, lighter signs' }
  ],
  aligns: ['left', 'center', 'right'],
  iconPositions: ['above', 'inline'],
  views: ['room', 'fit', 'drawing'],
  units: ['cm', 'in'],
  limits: { maxLines: 3, maxChars: 24, customMinCm: 20, customMaxCm: 200, customStepCm: 5 }
};

/* §0.2 rule 7: nothing paid is pre-selected */
export const DEFAULT_DESIGN = Object.freeze({
  v: 2, text: '', align: 'center', font: 'soho', colour: 'warm', colours: null, jacket: 'white', size: 'm', custom: null,
  backing: 'cut', board: 'clear', use: 'in', hang: 'screws', icon: '', iconPos: 'above', pos: {}, scene: 's05-pub',
  view: 'room', night: true, on: true, unit: 'cm', tube: '6'
});

const byId = (arr, id) => arr.find(x => x.id === id);
export const fontOf = id => byId(OPTIONS.fonts, id) || byId(OPTIONS.fonts, DEFAULT_DESIGN.font);
export const colourOf = id => byId(OPTIONS.colours, id) || byId(OPTIONS.colours, DEFAULT_DESIGN.colour);
export const sizeOf = id => byId(OPTIONS.sizes, id) || byId(OPTIONS.sizes, DEFAULT_DESIGN.size);
export const backingOf = id => byId(OPTIONS.backings, id) || OPTIONS.backings[0];
export const finishOf = id => byId(OPTIONS.finishes, id) || OPTIONS.finishes[0];
export const hangOf = id => byId(OPTIONS.hangs, id) || OPTIONS.hangs[0];
export const useOf = id => byId(OPTIONS.uses, id) || OPTIONS.uses[0];
export const jacketOf = id => byId(OPTIONS.jackets, id) || OPTIONS.jackets[0];
export const enabledFonts = () => OPTIONS.fonts.filter(f => f.enabled !== false);

/** Fill defaults and drop anything that is not a known id. Never throws. */
export function normalise(state) {
  const s = Object.assign({}, DEFAULT_DESIGN, state || {});
  s.text = typeof s.text === 'string' ? s.text.slice(0, 200) : '';
  if (!OPTIONS.aligns.includes(s.align)) s.align = 'center';
  if (!byId(OPTIONS.fonts, s.font)) s.font = DEFAULT_DESIGN.font;
  if (!byId(OPTIONS.colours, s.colour)) s.colour = DEFAULT_DESIGN.colour;
  if (Array.isArray(s.colours)) {
    s.colours = s.colours.slice(0, OPTIONS.limits.maxLines).map(c => (byId(OPTIONS.colours, c) ? c : s.colour));
    if (colourOf(s.colour).rgb || s.colours.every(c => c === s.colour)) s.colours = null; /* RGB is one colour; identical lines = single colour */
  } else s.colours = null;
  if (!byId(OPTIONS.jackets, s.jacket)) s.jacket = 'white';
  if (!byId(OPTIONS.sizes, s.size) && s.size !== 'custom') s.size = DEFAULT_DESIGN.size;
  if (s.custom && Number.isFinite(+s.custom.letterCm)) s.custom = { letterCm: Math.max(2, Math.min(60, Math.round(+s.custom.letterCm * 2) / 2)) }; else s.custom = null;
  if (s.size === 'custom' && !s.custom) s.size = DEFAULT_DESIGN.size;
  s.tube = String(s.tube) === '8' || String(s.tube) === '12' ? '8' : '6';
  if (!byId(OPTIONS.backings, s.backing)) s.backing = 'cut';
  if (!byId(OPTIONS.finishes, s.board)) s.board = 'clear';
  if (!byId(OPTIONS.uses, s.use)) s.use = 'in';
  if (!byId(OPTIONS.hangs, s.hang)) s.hang = 'screws';
  if (!(s.icon && OPTIONS.icons[s.icon])) s.icon = '';
  if (!OPTIONS.iconPositions.includes(s.iconPos)) s.iconPos = 'above';
  if (!OPTIONS.views.includes(s.view)) s.view = 'room';
  if (!OPTIONS.units.includes(s.unit)) s.unit = 'cm';
  s.night = s.night !== false; s.on = s.on !== false;
  s.pos = s.pos && typeof s.pos === 'object' ? s.pos : {};
  return s;
}

/* ---------- colour helpers ---------- */
export function hexToRgb(h) { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
export function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
export function mix(h1, h2, t) { const a = hexToRgb(h1), b = hexToRgb(h2); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
export const coreOf = c => c.core || mix(c.hex, '#ffffff', .72);
/** the text-shadow glow stack, in em so it scales with the lettering */
export const glowOf = (c, k = 1) => { const core = coreOf(c); return `0 0 ${.02 * k}em ${core}, 0 0 ${.05 * k}em ${c.hex}, 0 0 ${.11 * k}em ${c.hex}, 0 0 ${.24 * k}em ${c.hex}, 0 0 ${.5 * k}em ${rgba(c.hex, .75)}, 0 0 ${1 * k}em ${rgba(c.hex, .45)}`; };
export const iconGlowOf = c => `drop-shadow(0 0 1px ${coreOf(c)}) drop-shadow(0 0 3px ${c.hex}) drop-shadow(0 0 8px ${c.hex}) drop-shadow(0 0 18px ${rgba(c.hex, .7)})`;
/** a UI-safe hex for --room (RGB tubes relight with a fixed pink) */
export const uiHex = c => c.rgb ? '#ff5fa2' : c.hex;
/** the unlit tube colour: white jacket → off-white; coloured jacket → the catalogue's jacketColour */
export const offTube = (c, jacket) => jacket === 'colour' && !c.rgb ? (c.jacketColour || mix(c.hex, '#e7e0d6', .45)) : '#e7e0d6';
export const inches = cm => Math.round(cm / 2.54);

/* ---------- fonts: a measurement is only trusted once the face is really loaded ---------- */
const loaded = new Set(); let settled = false; let fontsPromise = null;
export const fontReady = f => !hasDOM() || settled || loaded.has((f && f.family) || f);
export const fontsSettled = () => settled;
const fontSpec = f => `${f.weight || 400} 100px "${f.family}"`;
/** Load the enabled lettering faces (or the given ids) via the CSS Font Loading API; resolves when loaded or after 4.5 s. */
export function ensureFonts(ids) {
  if (!hasDOM() || !document.fonts) { settled = true; return Promise.resolve(); }
  const faces = (ids ? ids.map(fontOf) : enabledFonts());
  const loads = faces.map(f => document.fonts.load(fontSpec(f), 'Hgy&').then(fs => { if (fs.length) { loaded.add(f.family); mcache.clear(); notify(); } }).catch(() => {}));
  const p = Promise.race([Promise.all(loads), new Promise(r => setTimeout(r, 4500))]).then(() => { settled = settled || !ids; mcache.clear(); notify(); refitAll(); });
  if (!ids) { fontsPromise = p; document.fonts.ready.then(() => { mcache.clear(); refitAll(); }); }
  return p;
}
export const fontsReady = () => fontsPromise || ensureFonts();
const listeners = new Set();
/** subscribe to "metrics may have changed" (a face loaded) */
export function onFonts(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { listeners.forEach(fn => { try { fn(); } catch {} }); if (hasDOM()) document.dispatchEvent(new CustomEvent('ln:fonts')); }

/* ---------- measurement (canvas ink box; em units at 100px) ---------- */
let mctx = null; const mcache = new Map();
const ctx2d = () => { if (!mctx && hasDOM()) { const c = document.createElement('canvas'); mctx = c.getContext('2d'); } return mctx; };
const countOf = (s, ch) => { let n = 0; for (const x of s) if (x === ch) n++; return n; };
/** extra width a line gains from the face's word and ampersand gaps, in em */
export const gapsEm = (f, line) => countOf(line, ' ') * (f.wordSpacingEm || 0) + countOf(line, '&') * 2 * (f.ampersandGapEm || 0);

const LH = 1.15; /* line-height, em */
/** metrics for a block of lines in a face: cap, inkW, inkH (em), offsets, baselines, per-line widths. icon adds its box. */
export function measure(f, lines, align = 'center', icon = '', iconPos = 'above') {
  const Ls = (lines && lines.length ? lines : []).map(String);
  const key = f.family + '|' + (f.weight || 400) + '|' + align + '|' + (icon || '') + iconPos + '|' + Ls.join('\n') + (fontReady(f) ? '' : '|~');
  if (mcache.has(key)) return mcache.get(key);
  const ctx = ctx2d();
  let cap, fA, fD, ms;
  if (ctx) {
    ctx.font = fontSpec(f);
    cap = ctx.measureText('H').actualBoundingBoxAscent || 70;
    const fm = ctx.measureText('Hgy'); fA = fm.fontBoundingBoxAscent || 92; fD = fm.fontBoundingBoxDescent || 28;
    ms = Ls.map(t => { const m = ctx.measureText(t); const g = gapsEm(f, t) * 100; return { width: m.width + g, left: m.actualBoundingBoxLeft || 0, right: (m.actualBoundingBoxRight || m.width) + g, asc: m.actualBoundingBoxAscent || cap, desc: m.actualBoundingBoxDescent || 0 }; });
  } else { /* no canvas (Node): a deterministic estimate so logic can be tested */
    cap = 70; fA = 92; fD = 28;
    ms = Ls.map(t => { const w = Array.from(t).reduce((a, ch) => a + (ch === ' ' ? 28 : /[A-Z]/.test(ch) ? 66 : /[0-9]/.test(ch) ? 56 : 50), 0) + gapsEm(f, t) * 100; return { width: w, left: 0, right: w, asc: 72, desc: Array.from(t).some(ch => 'gjpqy'.includes(ch)) ? 24 : 2 }; });
  }
  const lh = LH * 100, half = (lh - (fA + fD)) / 2;
  const blockW = Math.max(1, ...ms.map(m => m.width));
  let minX = Infinity, maxX = -Infinity, top = Infinity, bot = -Infinity; const baselines = [];
  ms.forEach((m, i) => {
    const base = i * lh + half + fA; baselines.push(base / 100);
    if (!Ls[i].trim()) return;
    const x0 = align === 'left' ? 0 : align === 'right' ? blockW - m.width : (blockW - m.width) / 2;
    minX = Math.min(minX, x0 - m.left); maxX = Math.max(maxX, x0 + m.right);
    top = Math.min(top, base - m.asc); bot = Math.max(bot, base + m.desc);
  });
  if (!isFinite(minX)) { minX = 0; maxX = 0; top = 0; bot = 0; }
  const blockH = Ls.length * lh;
  const r = { cap: cap / 100, inkW: (maxX - minX) / 100, inkH: (bot - top) / 100, textW: (maxX - minX) / 100, textH: (bot - top) / 100,
    offX: (blockW / 2 - (minX + maxX) / 2) / 100, offY: (blockH / 2 - (top + bot) / 2) / 100, iconEm: 0, iconPos, textOffY: 0, textOffX: 0,
    blockW: blockW / 100, blockH: blockH / 100, minX: minX / 100, maxX: maxX / 100, top: top / 100, bot: bot / 100, baselines, lineWidths: ms.map(m => m.width / 100), lines: Ls.length };
  if (icon) {
    if (iconPos === 'inline' && Ls.length) { r.iconEm = 1.25 * r.cap; r.textOffX = r.iconEm * 1.2; r.inkW = r.textW + r.textOffX; r.inkH = Math.max(r.textH, r.iconEm); }
    else { r.iconEm = 1.7 * r.cap; r.inkW = Math.max(r.textW, r.iconEm); r.textOffY = Ls.length ? r.iconEm * 1.15 : 0; r.inkH = r.textH + (Ls.length ? r.iconEm * 1.15 : r.iconEm); }
  }
  if (!(r.inkW > 0)) { r.inkW = 1; r.inkH = r.inkH || .7; }
  mcache.set(key, r);
  return r;
}
/** metrics for pricing: null until the face is loaded, so the core answers "no-dimensions" rather than a wrong number */
export function metricsFor(f, lines, align, icon, iconPos) { return fontReady(f) ? measure(f, lines, align, icon, iconPos) : null; }
export const clearMetrics = () => mcache.clear();

/* ---------- resolve: state → text rules → metrics → cm ---------- */
const PLACEHOLDER_LINES = ['Your words'];
/** Everything the stage, sheet, pricing and basket need from one design state, computed once. */
export function resolve(state, opts = {}) {
  const st = normalise(state);
  const clean = core.normaliseText(st.text, { maxLines: OPTIONS.limits.maxLines, maxChars: OPTIONS.limits.maxChars });
  const bad = core.unsupportedChars(clean.text);
  const lines = clean.lines;
  const hasText = lines.length > 0 || !!st.icon;
  const drawLines = bad.length ? lines.map(l => Array.from(l).filter(ch => !bad.includes(ch)).join('').replace(/ {2,}/g, ' ').trim()).filter(Boolean) : lines;
  const linesForMetrics = drawLines.length ? drawLines : (st.icon ? [] : PLACEHOLDER_LINES);
  const f = fontOf(st.font), c = colourOf(st.colour);
  const lineColours = linesForMetrics.map((_, i) => colourOf(st.colours ? (st.colours[i] || st.colour) : st.colour));
  const distinct = Array.from(new Set((st.colours ? linesForMetrics.map((_, i) => st.colours[i] || st.colour) : [st.colour]))).map(colourOf);
  const m = measure(f, linesForMetrics, st.align, st.icon, st.iconPos);
  const ready = fontReady(f);
  const sizeId = opts.sizeId || st.size;
  const letterCm = sizeId === 'custom' ? (st.custom ? st.custom.letterCm : sizeOf('m').letterCm) : (opts.letterCm || sizeOf(sizeId).letterCm);
  const backing = backingOf(st.backing), finish = finishOf(st.board);
  const dims = core.dimsFor(m, letterCm, backing.margin);
  return {
    state: st, clean, lines, drawLines, bad, hasText, placeholder: !hasText || bad.length > 0, truncated: clean.truncated,
    font: f, colour: c, lineColours, distinctColours: distinct, rgb: !!c.rgb, jacket: jacketOf(st.jacket), m, ready, letterCm, sizeId,
    backing, finish, hang: hangOf(st.hang), use: useOf(st.use), dims, dimsReady: ready ? dims : null, icon: st.icon, iconPos: st.iconPos,
    words: lines.length ? lines.join(' / ') : (st.icon ? `${st.icon} symbol` : '')
  };
}

/* ---------- icon markup ---------- */
export const iconSvg = (id, c, cls = 'ln-neon-icon', extra = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" stroke="${c ? coreOf(c) : 'currentColor'}"${c ? ` style="filter:${iconGlowOf(c)}"` : ''}${extra}><path d="${OPTIONS.icons[id] || ''}"/></svg>`;

/** text → HTML with per-face ampersand gaps and (optionally) per-line colours. Lines joined with \n inside white-space:pre. */
export function tubeHtml(res, { perLine = true } = {}) {
  const f = res.font, ag = f.ampersandGapEm || 0;
  const line = (t, i) => {
    const html = esc(t).replace(/&amp;/g, `<span class="ln-amp" style="margin:0 ${ag}em">&amp;</span>`);
    const c = perLine && res.lineColours[i] && res.lineColours[i].id !== res.colour.id ? res.lineColours[i] : null;
    return c ? `<span class="ln-line" style="color:${coreOf(c)};text-shadow:${glowOf(c)};--off-line:${offTube(c, res.state.jacket)}">${html}</span>` : `<span class="ln-line">${html}</span>`;
  };
  const Ls = res.drawLines.length ? res.drawLines : (res.hasText ? [] : PLACEHOLDER_LINES);
  return Ls.map(line).join('\n');
}
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/* ---------- mountNeon: a lit sign fitted into a box (tiles, hero chips, drawer minis, swatch previews) ---------- */
const CSS_ID = 'ln-renderer-css';
const CSS = `
.ln-neon{position:relative;display:grid;place-items:center;overflow:hidden;isolation:isolate;--off:#e7e0d6}
.ln-neon-text{white-space:pre;line-height:${LH};text-align:center;margin:0;position:relative;z-index:2;transition:color var(--d-base,240ms),text-shadow var(--d-base,240ms),opacity var(--d-base,240ms)}
.ln-neon-icon{position:relative;z-index:2;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.5;transition:filter var(--d-base,240ms),stroke var(--d-base,240ms)}
.ln-neon-body{display:grid;justify-items:center;gap:0;position:relative;z-index:2}
.ln-neon-body.inline{grid-auto-flow:column;align-items:center}
.ln-neon.thick .ln-neon-text{-webkit-text-stroke:.04em currentColor;paint-order:stroke fill}
.ln-neon.thick .ln-neon-icon{stroke-width:2.3}
.ln-neon-spill{position:absolute;inset:-20%;z-index:1;pointer-events:none;mix-blend-mode:screen;transition:opacity var(--d-slow,480ms);opacity:0;background:radial-gradient(closest-side,var(--spill-c),transparent 70%)}
.ln-neon.lit .ln-neon-spill{opacity:1}
.ln-neon.off .ln-neon-spill{opacity:0}
.ln-neon.off .ln-neon-text,.ln-neon:not(.lit) .ln-neon-text{color:var(--off)!important;text-shadow:0 .012em 0 rgba(0,0,0,.45),0 .035em .05em rgba(0,0,0,.35)!important;opacity:.86}
.ln-neon.off .ln-neon-text .ln-line,.ln-neon:not(.lit) .ln-neon-text .ln-line{color:var(--off-line,var(--off))!important;text-shadow:inherit!important}
.ln-neon.off .ln-neon-icon,.ln-neon:not(.lit) .ln-neon-icon{stroke:var(--off)!important;filter:drop-shadow(0 1px 0 rgba(0,0,0,.45))!important;opacity:.86}
.ln-neon.rgb.lit:not(.off) .ln-neon-text,.ln-neon.rgb.lit:not(.off) .ln-neon-icon,.ln-neon.rgb.lit:not(.off) .ln-neon-spill{animation:ln-hue var(--d-hue,6s) linear infinite}
.ln-neon.strike .ln-neon-text,.ln-neon.strike .ln-neon-icon,.ln-neon.strike .ln-neon-spill{animation:ln-strike var(--d-strike,800ms) linear both}
@keyframes ln-hue{to{filter:hue-rotate(360deg)}}
@keyframes ln-strike{0%{opacity:0}8%{opacity:1}14%{opacity:0}22%{opacity:1}30%{opacity:.6}38%{opacity:1}100%{opacity:1}}
@media (prefers-reduced-motion:reduce){.ln-neon.strike .ln-neon-text,.ln-neon.strike .ln-neon-icon,.ln-neon.strike .ln-neon-spill,.ln-neon.rgb .ln-neon-text,.ln-neon.rgb .ln-neon-icon,.ln-neon.rgb .ln-neon-spill{animation:none!important}}`;
export function injectCss(id = CSS_ID, css = CSS) { if (!hasDOM() || document.getElementById(id)) return; const s = document.createElement('style'); s.id = id; s.textContent = css; document.head.appendChild(s); }

export const reducedMotion = () => hasDOM() && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const mounted = new Set();
/** Mount a sign into `el`. state = design state (text, font, colour, colours, icon, iconPos, align, jacket).
    opts: { fitW:.74, fitH:.6, lit:true|false(strike when in view), strike:true, spill:.42, maxEm, perLine:true }.
    Returns { el, update(state), fit(), setLit(bool), strike(), destroy() }. */
/** Rule 4 (§0 / §7.1): only a render sitting ON a room plate could pass for a photo, so only that is [data-composite].
    A plateless tile (lettering chips, swatch minis on flat colour) is not. opts.composite true/false forces it;
    otherwise: true when a plate image is a near neighbour (≤ 2 ancestors) and no ancestor is already marked. */
function isComposite(el, opts) {
  if (opts.composite === true || opts.composite === false) return opts.composite;
  if (el.hasAttribute && el.hasAttribute('data-composite')) return true;
  if (el.closest && el.parentElement && el.parentElement.closest('[data-composite]')) return false;   /* the stage/tile owns the label */
  for (let a = el.parentElement, i = 0; a && i < 2; a = a.parentElement, i++) {
    if (Array.from(a.querySelectorAll('img, picture, .ln-plate')).some(n => !el.contains(n))) return true;
    if (a.hasAttribute('data-qa')) break;
  }
  return false;
}
export function mountNeon(el, state, opts = {}) {
  injectCss();
  const h = { el, opts, res: null };
  function draw(st) {
    const res = resolve(st); h.res = res;
    const c = res.colour;
    el.classList.add('ln-neon'); el.classList.toggle('rgb', res.rgb); el.classList.toggle('thick', res.state.tube === '8');
    el.dataset.hex = uiHex(c); if (h.composite === undefined) { h.composite = isComposite(el, opts); if (h.composite && !el.hasAttribute('data-composite')) el.dataset.composite = ''; }
    el.style.setProperty('--spill-c', rgba(c.hex, opts.spill ?? .42)); el.style.setProperty('--off', offTube(c, res.state.jacket));
    const inline = res.icon && res.iconPos === 'inline' && res.drawLines.length;
    const text = (res.drawLines.length || !res.hasText) ? `<p class="ln-neon-text" style="font-family:'${res.font.family}',cursive;font-weight:${res.font.weight || 400};text-align:${res.state.align};word-spacing:${res.font.wordSpacingEm || 0}em;color:${coreOf(c)};text-shadow:${glowOf(c)}">${tubeHtml(res, { perLine: opts.perLine !== false })}</p>` : '';
    el.innerHTML = `<div class="ln-neon-spill"></div><div class="ln-neon-body${inline ? ' inline' : ''}">${res.icon ? iconSvg(res.icon, c) : ''}${text}</div>`;
    el.classList.toggle('placeholder', res.placeholder && !res.hasText);
    fit();
  }
  function fit() {
    const res = h.res; if (!res) return;
    const box = el.getBoundingClientRect(); if (!box.width || !box.height) return;
    const m = res.m, fw = opts.fitW ?? .74, fh = opts.fitH ?? .6;
    let em = Math.min(box.width * fw / m.inkW, box.height * fh / m.inkH);
    if (opts.maxEm) em = Math.min(em, opts.maxEm);
    const t = el.querySelector('.ln-neon-text'), ic = el.querySelector('.ln-neon-icon');
    if (t) { t.style.fontSize = em + 'px'; t.style.transform = `translate(${m.offX}em, ${res.drawLines.length ? m.offY : 0}em)`; }
    if (ic) { const s = m.iconEm * em; ic.style.width = ic.style.height = s + 'px'; ic.style.marginBottom = (res.iconPos === 'above' && res.drawLines.length) ? (-.12 * s) + 'px' : 0; ic.style.marginRight = (res.iconPos === 'inline' && res.drawLines.length) ? (.2 * s) + 'px' : 0; }
  }
  draw(state);
  if (opts.lit === true || opts.strike === false || reducedMotion()) el.classList.add('lit');
  else { el.dataset.strike = '1'; strikeObserver && strikeObserver.observe(el); }
  mounted.add(el); el._lnFit = fit;
  return { el, get res() { return h.res; }, update: st => draw(st), fit, setLit(on) { el.classList.toggle('off', !on); }, strike: () => strike(el), destroy() { mounted.delete(el); strikeObserver && strikeObserver.unobserve(el); el.innerHTML = ''; } };
}
export function refitAll() { mounted.forEach(el => el._lnFit && el._lnFit()); }

/* ---------- strike-on when in view + the room relight (--room follows the sign nearest the viewport centre) ---------- */
let roomHex = null, roomRaf = 0, strikeObserver = null; const visible = new Set();
export function relight(hex) {
  if (!hasDOM() || !hex || reducedMotion()) return;
  if (roomHex === null) roomHex = getComputedStyle(document.documentElement).getPropertyValue('--room').trim() || '#c8a04a';
  if (hex === roomHex) return; roomHex = hex; document.documentElement.style.setProperty('--room', hex);
}
export function strike(el) { if (reducedMotion()) return; el.classList.remove('strike'); void el.offsetWidth; el.classList.add('strike'); setTimeout(() => el.classList.remove('strike'), 950); }
function pickRoom() { roomRaf = 0; if (!visible.size) return; const mid = innerHeight / 2; let best = null, bd = Infinity; visible.forEach(el => { const r = el.getBoundingClientRect(); const d = Math.abs((r.top + r.bottom) / 2 - mid); if (d < bd) { bd = d; best = el; } }); if (best && !best.classList.contains('off')) relight(best.dataset.hex); }
const queueRoom = () => { if (!roomRaf) roomRaf = requestAnimationFrame(pickRoom); };
/** start the in-view strike observer (idempotent) */
export function initStrikes() {
  if (!hasDOM() || strikeObserver) return;
  if (!('IntersectionObserver' in window)) { mounted.forEach(el => el.classList.add('lit')); return; }
  strikeObserver = new IntersectionObserver(entries => {
    entries.forEach(e => { const el = e.target; if (e.isIntersecting && e.intersectionRatio >= .35) { visible.add(el); if (!el.classList.contains('lit')) { el.classList.add('lit'); strike(el); } } else visible.delete(el); });
    queueRoom();
  }, { threshold: [0, .35, .7] });
  mounted.forEach(el => { if (el.dataset.strike) strikeObserver.observe(el); });
  addEventListener('scroll', queueRoom, { passive: true });
}

/* ---------- bakeGlow: a canvas with the tube (and optionally the backing) drawn, glow in the pixels ---------- */
/** opts: { ppc: px per cm (default 12), pad: cm of transparent margin (default = backing margin + glow), on: true,
    night: true, bakeGlow: true, backing: true, transparent: true, maxPx: 2048 }. Returns { canvas, W, H, ppc, dims }. */
export function bakeGlow(state, opts = {}) {
  if (!hasDOM()) throw new Error('bakeGlow needs a canvas');
  const res = resolve(state); const d = res.dims; if (!d) return null;
  const glowCm = opts.bakeGlow === false ? 0 : Math.max(2, res.letterCm * .9);
  let ppc = opts.ppc || 12; const padCm = (opts.pad ?? glowCm);
  let W = Math.ceil((d.W + 2 * padCm) * ppc), H = Math.ceil((d.H + 2 * padCm) * ppc);
  const maxPx = opts.maxPx || 2048; const k = Math.max(W, H) > maxPx ? maxPx / Math.max(W, H) : 1; ppc *= k; W = Math.ceil(W * k); H = Math.ceil(H * k);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (opts.transparent === false) { ctx.fillStyle = opts.background || '#180E1F'; ctx.fillRect(0, 0, W, H); }
  const on = opts.on !== false, emPx = d.emCm * ppc, m = res.m, mg = res.backing.margin * ppc, pad = padCm * ppc;
  const x0 = pad, y0 = pad, bw = d.W * ppc, bh = d.H * ppc;
  /* backing */
  if (opts.backing !== false) {
    const fin = res.finish;
    if (res.backing.id === 'cut') {
      /* contour = the text stroked very thick into an OPAQUE mask (so overlapping words/letters don't stack their alpha
         into visible round blobs), smoothed by a blur + threshold so it reads as one cut piece, then tinted once:
         the finish fill inside and a thin edge line, like the stage's cut outline */
      const mask = document.createElement('canvas'); mask.width = W; mask.height = H; const mx = mask.getContext('2d');
      mx.font = `${res.font.weight || 400} ${emPx}px "${res.font.family}"`; mx.textBaseline = 'alphabetic'; mx.lineJoin = 'round'; mx.lineCap = 'round';
      mx.lineWidth = mg * 2; mx.strokeStyle = '#fff'; mx.fillStyle = '#fff';
      drawText(mx, res, x0 + mg, y0 + mg, emPx, false, null, true);
      const soft = gaussLayer(mask, Math.max(1, mg * .45));
      if (soft) { mx.clearRect(0, 0, W, H); mx.imageSmoothingEnabled = true; mx.imageSmoothingQuality = 'high'; mx.drawImage(soft, 0, 0, W, H); }
      const img = mx.getImageData(0, 0, W, H), px = img.data;
      const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
      const fc = hex(fin.fill[0]), ec = hex(fin.edge[0]); const fa = Math.min(.9, fin.fill[1] + .05), ea = fin.edge[1];
      const edgeBand = Math.max(10, Math.min(40, 255 * 1.2 / Math.max(1, mg * .45))); /* ~1 px edge line at the 50 % contour */
      for (let i = 0; i < px.length; i += 4) {
        const a = px[i + 3]; if (a < 128 - edgeBand) { px[i + 3] = 0; continue; }
        const edge = a < 128 + edgeBand ? 1 - Math.abs(a - 128) / edgeBand : 0; const inside = a >= 128 ? 1 : 0;
        const al = Math.max(edge * ea, inside * fa); const t = al > 0 ? (edge * ea) / Math.max(al, 1e-6) : 0;
        px[i] = Math.round(fc[0] + (ec[0] - fc[0]) * Math.min(1, t)); px[i + 1] = Math.round(fc[1] + (ec[1] - fc[1]) * Math.min(1, t)); px[i + 2] = Math.round(fc[2] + (ec[2] - fc[2]) * Math.min(1, t));
        px[i + 3] = Math.round(Math.min(1, al) * 255);
      }
      mx.putImageData(img, 0, 0); ctx.drawImage(mask, 0, 0);
    }
    else { ctx.save(); const r = Math.max(2, .8 * ppc); roundRect(ctx, x0, y0, bw, bh, r); ctx.fillStyle = fin.mirror ? fin.fill[0] : rgba(fin.fill[0], fin.fill[1] + (fin.id === 'clear' ? .04 : 0)); ctx.fill(); ctx.strokeStyle = fin.border; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#c8a04a'; const so = Math.max(2, 1.6 * ppc / 2), si = Math.max(3, 1.8 * ppc); [[x0 + si, y0 + si], [x0 + bw - si, y0 + si], [x0 + si, y0 + bh - si], [x0 + bw - si, y0 + bh - si]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, so, 0, 7); ctx.fill(); }); ctx.restore(); }
  }
  /* tube */
  ctx.save(); ctx.font = `${res.font.weight || 400} ${emPx}px "${res.font.family}"`; ctx.textBaseline = 'alphabetic'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const passes = on && opts.bakeGlow !== false ? [[1, .45], [.5, .75], [.24, 1], [.11, 1], [.05, 1]] : [];
  const tx = x0 + mg, ty = y0 + mg;
  if (passes.length) {
    /* the glow is a real Gaussian blur of the coloured tube (one layer per radius), not canvas shadowBlur: Chrome's large
       shadow blurs came out as stamped round blobs behind each glyph, which read as grey bubbles in the AR model.
       gaussLayer() blurs on a downscaled copy in JS (works the same in Safari, which has no ctx.filter) */
    const tube = document.createElement('canvas'); tube.width = W; tube.height = H;
    const tctx = tube.getContext('2d'); tctx.font = ctx.font; tctx.textBaseline = 'alphabetic'; tctx.lineCap = 'round'; tctx.lineJoin = 'round';
    drawText(tctx, res, tx, ty, emPx, true, { blur: 0, perLine: true, dim: 1 });
    const dim = opts.night === false ? .35 : 1;
    for (const [blurEm, a] of passes) {
      const layer = gaussLayer(tube, blurEm * emPx / 2); if (!layer) continue;
      ctx.save(); ctx.globalAlpha = a * dim; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(layer, 0, 0, W, H); ctx.restore();
    }
  }
  drawText(ctx, res, tx, ty, emPx, true, { core: true, on });
  ctx.restore();
  return { canvas, W, H, ppc, dims: d, res };
}
/** a Gaussian-blurred copy of `src` (sigma in src px), returned as a (possibly smaller) canvas to be drawn back at src size.
    Downscales so the blur runs at ~3 px sigma, then three separable box passes on premultiplied RGBA (no dark fringes). */
function gaussLayer(src, sigma) {
  const W = src.width, H = src.height; if (!W || !H || !(sigma > 0)) return null;
  const k = Math.min(1, Math.max(1 / 24, 3 / sigma)); const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k)); const sg = sigma * (w / W);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h);
  const img = x.getImageData(0, 0, w, h), d = img.data, n = w * h;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) { const a = d[i * 4 + 3] / 255; ch[3][i] = a; ch[0][i] = d[i * 4] * a; ch[1][i] = d[i * 4 + 1] * a; ch[2][i] = d[i * 4 + 2] * a; }
  /* box sizes for 3 passes approximating the Gaussian (Kovesi) */
  const wIdeal = Math.sqrt(12 * sg * sg / 3 + 1); let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--; const wu = wl + 2;
  const mIdeal = (12 * sg * sg - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4); const m = Math.round(mIdeal);
  const radii = [0, 1, 2].map(i => ((i < m ? wl : wu) - 1) / 2);
  const tmp = new Float32Array(n);
  const boxH = (a, b, r) => { const iarr = 1 / (r + r + 1); for (let y = 0; y < h; y++) { const o = y * w; let acc = 0; for (let i = -r; i <= r; i++) acc += a[o + Math.min(w - 1, Math.max(0, i))]; for (let xx = 0; xx < w; xx++) { b[o + xx] = acc * iarr; acc += a[o + Math.min(w - 1, xx + r + 1)] - a[o + Math.max(0, xx - r)]; } } };
  const boxV = (a, b, r) => { const iarr = 1 / (r + r + 1); for (let xx = 0; xx < w; xx++) { let acc = 0; for (let i = -r; i <= r; i++) acc += a[Math.min(h - 1, Math.max(0, i)) * w + xx]; for (let y = 0; y < h; y++) { b[y * w + xx] = acc * iarr; acc += a[Math.min(h - 1, y + r + 1) * w + xx] - a[Math.max(0, y - r) * w + xx]; } } };
  for (const arr of ch) for (const r of radii) { if (r < 1) continue; boxH(arr, tmp, r); boxV(tmp, arr, r); }
  for (let i = 0; i < n; i++) { const a = ch[3][i]; d[i * 4 + 3] = Math.round(Math.min(1, a) * 255); if (a > 1e-4) { d[i * 4] = Math.min(255, ch[0][i] / a); d[i * 4 + 1] = Math.min(255, ch[1][i] / a); d[i * 4 + 2] = Math.min(255, ch[2][i] / a); } else { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 0; } }
  x.putImageData(img, 0, 0); return c;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
/* draws every line (and the icon) at the metrics' positions; glow = {blur,...} draws a shadow pass, core draws the bright core */
function drawText(ctx, res, left, top, emPx, _unused, glow, contourOnly = false) {
  const m = res.m, Ls = res.drawLines.length ? res.drawLines : (res.hasText ? [] : PLACEHOLDER_LINES);
  const alignOff = i => res.state.align === 'left' ? 0 : res.state.align === 'right' ? (m.blockW - m.lineWidths[i]) : (m.blockW - m.lineWidths[i]) / 2;
  const textShiftX = (m.inkW - m.textW) / 2 - m.minX + (m.textOffX ? m.textOffX / 2 : 0);
  const f = res.font;
  const colourFor = i => (res.lineColours[i] || res.colour);
  const paintLine = (t, x, y, c) => {
    /* word gaps + ampersand gaps: draw word by word so the canvas matches the DOM */
    const parts = t.split(/( |&)/).filter(s => s !== '');
    let cx = x;
    for (const p of parts) {
      if (p === ' ') { cx += ctx.measureText(' ').width + (f.wordSpacingEm || 0) * emPx; continue; }
      if (p === '&') { cx += (f.ampersandGapEm || 0) * emPx; }
      if (contourOnly) ctx.strokeText(p, cx, y); else ctx.fillText(p, cx, y);
      cx += ctx.measureText(p).width + (p === '&' ? (f.ampersandGapEm || 0) * emPx : 0);
    }
  };
  Ls.forEach((t, i) => {
    const c = colourFor(i);
    const x = left + (textShiftX + alignOff(i)) * emPx, y = top + (m.textOffY + m.baselines[i] - m.top) * emPx;
    if (contourOnly) { paintLine(t, x, y, c); return; }
    if (glow && glow.blur != null) { ctx.shadowColor = rgba(c.hex, glow.dim ?? 1); ctx.shadowBlur = glow.blur; ctx.fillStyle = c.hex; paintLine(t, x, y, c); ctx.shadowBlur = 0; }
    else { ctx.shadowBlur = 0; ctx.fillStyle = glow && glow.on === false ? offTube(c, res.state.jacket) : coreOf(c); paintLine(t, x, y, c); }
  });
  if (res.icon && typeof Path2D !== 'undefined') {
    const s = m.iconEm * emPx, c = res.colour;
    const ix = res.iconPos === 'inline' && Ls.length ? left : left + (m.inkW - m.iconEm) / 2 * emPx;
    const iy = res.iconPos === 'inline' && Ls.length ? top + (m.inkH * emPx - s) / 2 : top;
    ctx.save(); ctx.translate(ix, iy); ctx.scale(s / 24, s / 24); ctx.lineWidth = contourOnly ? (res.backing.margin * 2 * emPx / s) * 24 / emPx * emPx / 24 : 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (glow && glow.blur != null) { ctx.shadowColor = rgba(c.hex, glow.dim ?? 1); ctx.shadowBlur = glow.blur * 24 / s; ctx.strokeStyle = c.hex; }
    else ctx.strokeStyle = contourOnly ? ctx.strokeStyle : (glow && glow.on === false ? offTube(c, res.state.jacket) : coreOf(c));
    ctx.stroke(new Path2D(OPTIONS.icons[res.icon])); ctx.restore();
  }
}

/** flex-tube estimate in metres for a resolved design: ink area / stroke width, from a canvas raster (same method as the proof sheet) */
let fctx = null; const fcache = new Map();
export function flexMetres(res) {
  const { font: f, drawLines: lines, m, dims } = res; if (!dims) return 0;
  let emLen = 0;
  const Ls = lines.length ? lines : [];
  if (Ls.length && m.textW > 0) {
    const key = f.family + '|' + res.state.align + '|' + Ls.join('\n');
    if (fcache.has(key)) emLen += fcache.get(key);
    else if (hasDOM()) {
      if (!fctx) fctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      const S = 120, W = Math.ceil(m.textW * S) + 40, H = Math.ceil(m.textH * S) + 40;
      fctx.canvas.width = W; fctx.canvas.height = H; fctx.font = `${f.weight || 400} ${S}px "${f.family}"`; fctx.clearRect(0, 0, W, H); fctx.fillStyle = '#000'; fctx.textBaseline = 'alphabetic';
      Ls.forEach((t, i) => fctx.fillText(t, 20 - m.minX * S + (res.state.align === 'left' ? 0 : res.state.align === 'right' ? (m.blockW - m.lineWidths[i]) * S : (m.blockW - m.lineWidths[i]) * S / 2), 20 + (m.baselines[i] - m.top) * S));
      const px = fctx.getImageData(0, 0, W, H).data; let area = 0; const runs = [];
      for (let y = 0; y < H; y++) { let run = 0; for (let x = 0; x < W; x++) { const on = px[(y * W + x) * 4 + 3] > 110; if (on) { area++; run++; } else if (run) { runs.push(run); run = 0; } } if (run) runs.push(run); }
      runs.sort((a, b) => a - b);
      const stroke = runs.length ? Math.max(2, runs[Math.floor(runs.length * .3)]) : 10;
      const v = area / stroke / S; if (fontReady(f)) fcache.set(key, v); emLen += v;
    } else emLen += Ls.reduce((a, t) => a + Array.from(t).length * 2.2, 0); /* Node estimate: ~2.2 em of tube per glyph */
  }
  if (res.icon) emLen += 4.2 * m.iconEm; /* a 24-box line icon is ~4 box-widths of path */
  return Math.round(emLen * dims.emCm) / 100;
}

export { esc as escapeHtml };
