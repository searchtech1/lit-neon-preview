/* Lit Neon — fused design (After Dark room + Workshop drawing). One file for both mockup pages:
   shared engine, preview stage, proof-sheet renderer, homepage interactives, builder.
   Every rule (text, glyphs, cm, price, delivery, postcodes) comes from lib/neon-core.js + build/rules.js. */

/* SAMPLE launch-promo end date: 14 days from build day (2026-10-08). The live store reads this from a theme setting. */
const LIT_PROMO_END = new Date(2026, 9, 22, 23, 59); // local time, so it reads 22 Oct wherever the mockup is opened
const LIT_PROMO_PCT = 0.20;

/* build/rules.js is generated (npm run build:rules) and git-ignored, so a fresh checkout doesn't have it.
   Without it there are no prices: say so on the page instead of dying on a blank one. */
if (!(window.LIT_RULES && window.LIT_RULES.pricing && window.LIT_RULES.delivery)) {
  const note = document.createElement('div');
  note.className = 'rules-missing'; note.setAttribute('role', 'alert');
  note.innerHTML = '<b>No prices yet: the pricing rules haven\'t been generated.</b> Run <code>npm run build:rules</code> to generate the pricing rules, then reload this page.';
  (document.body || document.documentElement).prepend(note);
  throw new Error('Lit Neon: build/rules.js is missing. Run `npm run build:rules` to generate the pricing rules.');
}

window.LN = (() => {
"use strict";
const L = window.LIT, core = window.LitNeonCore, RULES = window.LIT_RULES;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- catalogue ---------- */
const FONTS = L.fonts, COLOURS = L.colours, SIZES = L.sizes.map(s => ({ id: s.id, name: s.name, letter: s.letterCm }));
const BACKINGS = [
  { id: 'cut', name: 'Cut to shape', desc: 'Acrylic follows the outline of your letters', margin: 2.5 },
  { id: 'rect', name: 'Rectangle', desc: 'A clean panel on brass standoffs', margin: 5 },
  { id: 'stand', name: 'Table stand', desc: 'Freestanding, for shelves and bars', margin: 5 }
];
const BOARDS = [
  { id: 'clear', name: 'Clear', swatch: 'linear-gradient(135deg,#f5f7f9,#cfd6dc)', fill: ['#ffffff', .08], edge: ['#ffffff', .5], rect: 'rgba(255,255,255,.07)', border: 'rgba(255,255,255,.42)' },
  { id: 'black', name: 'Black', swatch: '#16171b', fill: ['#121316', .95], edge: ['#ffffff', .14], rect: 'rgba(18,19,22,.95)', border: 'rgba(255,255,255,.12)' },
  { id: 'white', name: 'White', swatch: '#f6f6f4', fill: ['#f4f4f2', .95], edge: ['#000000', .08], rect: 'rgba(244,244,242,.96)', border: 'rgba(0,0,0,.08)' },
  { id: 'gold', name: 'Gold mirror', swatch: 'linear-gradient(135deg,#8f7034,#f0d48b 45%,#9c7b3a 70%,#d9bb70)', fill: ['#b8954f', 1], edge: ['#f6dd9c', .9], rect: 'linear-gradient(135deg,#7d6230,#e2c47c 40%,#8d6f35 62%,#cfb067)', border: 'rgba(246,221,156,.6)' },
  { id: 'silver', name: 'Silver mirror', swatch: 'linear-gradient(135deg,#8b9098,#f3f5f7 45%,#9298a1 70%,#d7dbe0)', fill: ['#a9aeb6', 1], edge: ['#f4f6f8', .9], rect: 'linear-gradient(135deg,#7f848c,#eef0f2 40%,#8b9099 62%,#cdd1d6)', border: 'rgba(244,246,248,.6)' }
];
const USES = [{ id: 'in', name: 'Indoors', sub: 'Included' }, { id: 'out', name: 'Outdoors', sub: 'Quote only' }];
const JACKETS = [{ id: 'white', name: 'White jacket', sub: 'White tube when off' }, { id: 'colour', name: 'Coloured jacket', sub: 'Tinted tube when off' }];
const HANGS = [
  { id: 'screws', name: 'Wall screws', sub: 'Through the acrylic, on standoffs' },
  { id: 'chains', name: 'Hanging chains', sub: 'From hooks or a picture rail' },
  { id: 'strips', name: 'Adhesive strips', sub: 'No drilling, lighter signs' }
];
const MAXLINES = 3, MAXLINE = 24;
const EXCLUDED_MSG = 'We deliver to mainland GB for now. Message us on WhatsApp about Northern Ireland and the islands.';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const byId = (arr, id) => arr.find(x => x.id === id) || arr[0];
const gbp = n => '£' + (Number.isInteger(n) ? n.toLocaleString('en-GB') : n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const gbp2 = n => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function hexToRgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function mix(h1, h2, t) { const a = hexToRgb(h1), b = hexToRgb(h2); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
const fontOf = id => byId(FONTS, id), colourOf = id => byId(COLOURS, id);
const coreOf = c => c.core || mix(c.hex, '#ffffff', .72);
const glowOf = c => { const core = coreOf(c); return `0 0 .02em ${core}, 0 0 .05em ${c.hex}, 0 0 .11em ${c.hex}, 0 0 .24em ${c.hex}, 0 0 .5em ${rgba(c.hex, .75)}, 0 0 1em ${rgba(c.hex, .45)}`; };
const iconGlowOf = c => `drop-shadow(0 0 1px ${coreOf(c)}) drop-shadow(0 0 3px ${c.hex}) drop-shadow(0 0 8px ${c.hex}) drop-shadow(0 0 18px ${rgba(c.hex, .7)})`;
const uiHex = c => c.rgb ? '#ff5fa2' : c.hex;
const offTube = (c, jacket) => jacket === 'colour' && !c.rgb ? mix(c.hex, '#e7e0d6', .45) : '#e7e0d6';
const inches = cm => Math.round(cm / 2.54);
const fmtDay = d => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/* ---------- fonts: measurement is only trusted once the face is really loaded ---------- */
const loaded = new Set(); let settled = false;
const fontReady = f => settled || loaded.has(f.family);

/* ---------- measurement (canvas ink box; em units at 100px) ---------- */
const mctx = document.createElement('canvas').getContext('2d');
const mcache = new Map();
function measure(f, lines, align = 'center', icon) {
  const Ls = lines && lines.length ? lines : [];
  const key = f.family + '|' + align + '|' + (icon || '') + '|' + Ls.join('\n');
  if (mcache.has(key)) return mcache.get(key);
  mctx.font = `${f.weight || 400} 100px "${f.family}"`;
  const LH = 115;
  const cap = (mctx.measureText('H').actualBoundingBoxAscent || 70);
  const fm = mctx.measureText('Hgy');
  const fA = fm.fontBoundingBoxAscent || 92, fD = fm.fontBoundingBoxDescent || 28;
  const half = (LH - (fA + fD)) / 2;
  const ms = Ls.map(t => mctx.measureText(t));
  const blockW = Math.max(1, ...ms.map(m => m.width));
  let minX = Infinity, maxX = -Infinity, top = Infinity, bot = -Infinity; const baselines = [];
  ms.forEach((m, i) => {
    const base = i * LH + half + fA; baselines.push(base / 100);
    if (!Ls[i].trim()) return;
    const x0 = align === 'left' ? 0 : align === 'right' ? blockW - m.width : (blockW - m.width) / 2;
    minX = Math.min(minX, x0 - m.actualBoundingBoxLeft); maxX = Math.max(maxX, x0 + m.actualBoundingBoxRight);
    top = Math.min(top, base - m.actualBoundingBoxAscent); bot = Math.max(bot, base + m.actualBoundingBoxDescent);
  });
  if (!isFinite(minX)) { minX = 0; maxX = 0; top = 0; bot = 0; }
  const blockH = Ls.length * LH;
  const r = { cap: cap / 100, inkW: (maxX - minX) / 100, inkH: (bot - top) / 100, offX: (blockW / 2 - (minX + maxX) / 2) / 100, offY: (blockH / 2 - (top + bot) / 2) / 100,
    iconEm: 0, textOffY: 0, blockW: blockW / 100, blockH: blockH / 100, minX: minX / 100, maxX: maxX / 100, top: top / 100, bot: bot / 100, baselines, lineWidths: ms.map(m => m.width / 100), textW: (maxX - minX) / 100 };
  if (icon) { r.iconEm = 1.7 * r.cap; r.inkW = Math.max(r.inkW, r.iconEm); r.textOffY = Ls.length ? r.iconEm * 1.15 : 0; r.inkH = r.inkH + (Ls.length ? r.iconEm * 1.15 : r.iconEm); }
  if (!r.inkW) { r.inkW = 1; r.inkH = r.inkH || .7; }
  mcache.set(key, r);
  return r;
}
/* metrics for pricing: null until the face is loaded, so the core answers "no-dimensions" rather than a wrong number */
function metricsFor(f, lines, align, icon) { return fontReady(f) ? measure(f, lines, align, icon) : null; }

/* ---------- the rules (all from LitNeonCore + LIT_RULES) ---------- */
const P = RULES.pricing, D = RULES.delivery;
function dimsFor(sizeId, m, backingId) { return core.dimsFor(m, byId(SIZES, sizeId).letter, byId(BACKINGS, backingId).margin); }
function priceFor(d, st) { return core.priceFor(d, { backing: st.backing, finish: st.board, rgb: !!colourOf(st.colour).rgb }, P); }
const addOf = (kind, id) => P[kind][id] || 0;
const promoLive = () => Date.now() < LIT_PROMO_END.getTime();
const promoFor = total => Math.round(total * (1 - LIT_PROMO_PCT) * 100) / 100;
const promoLine = total => promoLive() ? `${gbp(total)} → ${gbp(promoFor(total))} launch price, ends ${fmtDay(LIT_PROMO_END)}` : null;
function deliveryText(from = new Date()) {
  const w = core.deliveryWindow(from, D, D.bankHolidays);
  const f = (d, withMonth) => d.toLocaleDateString('en-GB', withMonth ? { weekday: 'short', day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' });
  return w.from.getMonth() === w.to.getMonth() ? `${f(w.from, false)} to ${f(w.to, true)}` : `${f(w.from, true)} to ${f(w.to, true)}`;
}
const postcode = raw => core.postcodeStatus(raw, D);
/* Builder and hero text: the core does all the cleaning (NFC, quotes, dashes, whitespace, limits) and the glyph check */
function cleanText(raw) {
  const n = core.normaliseText(raw, { maxLines: MAXLINES, maxChars: MAXLINE });
  return Object.assign(n, { bad: core.unsupportedChars(n.text) });
}

/* ---------- design state in the URL hash ---------- */
function b64e(s) { return btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64d(s) { return new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))); }
const LISTS = { font: FONTS, colour: COLOURS, size: SIZES, backing: BACKINGS, board: BOARDS, use: USES, jacket: JACKETS, hang: HANGS };
function decodeDesign(hash = location.hash) {
  try {
    const h = hash.match(/d=([\w-]+)/); if (!h) return {};
    const o = JSON.parse(b64d(h[1])), out = {};
    if (typeof o.text === 'string') out.text = o.text.slice(0, 80);
    if (['left', 'center', 'right'].includes(o.align)) out.align = o.align;
    for (const k in LISTS) if (LISTS[k].some(x => x.id === o[k])) out[k] = o[k];
    if (typeof o.icon === 'string' && L.icons[o.icon]) out.icon = o.icon;
    return out;
  } catch (e) { return {}; }
}
const encodeDesign = st => '#d=' + b64e(JSON.stringify(st));
const builderLink = st => 'create.html' + encodeDesign(st);

/* ---------- wall textures ---------- */
const svgUrl = s => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
const NOISE = svgUrl("<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .5 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>");
const NOISE_SOFT = NOISE.replace('.5 0', '.16 0');
function brickSvg(shades, mortar) {
  const bw = 21.5, bh = 6.5, m = 1, cols = 4, rows = 4, W = cols * (bw + m), H = rows * (bh + m);
  let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => shades[Math.floor(rnd() * shades.length)]));
  let s = `<svg xmlns='http://www.w3.org/2000/svg' width='${W * 10}' height='${H * 10}' viewBox='0 0 ${W} ${H}'><rect width='100%' height='100%' fill='${mortar}'/>`;
  for (let r = 0; r < rows; r++) { const off = r % 2 ? (bw + m) / 2 : 0;
    for (let c = -1; c <= cols; c++) { const x = c * (bw + m) + off + m / 2, y = r * (bh + m) + m / 2; const col = grid[r][((c % cols) + cols) % cols];
      s += `<rect x='${x.toFixed(2)}' y='${y}' width='${bw}' height='${bh}' rx='.5' fill='${col}'/><rect x='${x.toFixed(2)}' y='${y}' width='${bw}' height='1.2' fill='rgba(255,255,255,.06)'/>`; } }
  return { url: svgUrl(s + '</svg>'), W, H };
}
const BRICK = brickSvg(['#7b4836', '#86523c', '#6e4131', '#91593f', '#774535', '#9b6345', '#6a3e2f', '#835040', '#a06a4b'], '#b9ad9c');
const BRICK_DARK = brickSvg(['#4a2a28', '#54302c', '#3f2422', '#5b3630', '#472926', '#633b33', '#3a2120', '#50302d', '#6b4238'], '#5a4a46');
const TILE = svgUrl("<svg xmlns='http://www.w3.org/2000/svg' width='120' height='60' viewBox='0 0 120 60'><rect width='120' height='60' fill='#0c1226'/><rect x='1' y='1' width='58' height='28' rx='1.5' fill='#141d3d'/><rect x='61' y='1' width='58' height='28' rx='1.5' fill='#121a38'/><rect x='-29' y='31' width='58' height='28' rx='1.5' fill='#131b3a'/><rect x='31' y='31' width='58' height='28' rx='1.5' fill='#151f40'/><rect x='91' y='31' width='58' height='28' rx='1.5' fill='#121a38'/><path d='M3 3h30' stroke='rgba(255,255,255,.07)' stroke-width='2'/><path d='M63 3h30' stroke='rgba(255,255,255,.07)' stroke-width='2'/><path d='M33 33h30' stroke='rgba(255,255,255,.07)' stroke-width='2'/><path d='M93 33h24' stroke='rgba(255,255,255,.07)' stroke-width='2'/></svg>");
const WALLS = {
  velvet: { color: '#2a1630', img: `${NOISE}, repeating-linear-gradient(115deg, rgba(255,255,255,.035) 0 2px, transparent 2px 9px)`, size: '260px 260px, 100% 100%' },
  oxblood: { color: '#3b1222', img: `${NOISE}, radial-gradient(ellipse at 30% 20%, rgba(255,255,255,.07), transparent 60%)`, size: '260px 260px, 100% 100%' },
  ink: { color: '#0e1430', img: `${NOISE}, radial-gradient(ellipse at 70% 80%, rgba(120,140,255,.08), transparent 60%)`, size: '260px 260px, 100% 100%' },
  brick: { color: '#4b2c28', img: `${NOISE}, ${BRICK_DARK.url}`, size: `260px 260px, ${BRICK_DARK.W * 3}px ${BRICK_DARK.H * 3}px` },
  tile: { color: '#0c1226', img: `${NOISE_SOFT}, ${TILE}`, size: '260px 260px, 120px 60px' },
  plaster: { color: '#3a2b2e', img: `${NOISE_SOFT}, radial-gradient(ellipse at 30% 20%, rgba(255,255,255,.1), transparent 60%)`, size: '260px 260px, 100% 100%' },
  daylight: { color: '#cfc3b5', img: `${NOISE_SOFT}, radial-gradient(ellipse at 30% 20%, rgba(255,255,255,.3), transparent 60%)`, size: '260px 260px, 100% 100%' }
};
function wallStyle(kind) { const w = WALLS[kind] || WALLS.velvet; return `background-color:${w.color};--wall-img:${w.img};--wall-size:${w.size}`; }
const WALL_FOR_CAT = { weddings: 'plaster', home: 'velvet', bars: 'brick', business: 'tile', kids: 'oxblood', gaming: 'ink' };

/* ---------- neon rendering (tiles, hero, drawer) ---------- */
const iconSvg = (id, c, cls = 'neon-icon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" stroke="${coreOf(c)}" style="filter:${iconGlowOf(c)}"><path d="${L.icons[id]}"/></svg>`;
const neonSigns = new Set();
/* design = {lines, font, colour, icon, align, jacket}. opts = {fitW:.74, fitH:.6, lit:false, strike:true, maxEm, spill} */
function mountNeon(el, design, opts = {}) {
  const f = fontOf(design.font), c = colourOf(design.colour);
  const lines = (design.lines || []).filter((l, i, a) => l.trim() || i < a.length - 1);
  el.classList.add('neon');
  el.classList.toggle('rgb', !!c.rgb);
  el.dataset.hex = uiHex(c);
  el.style.setProperty('--spill-c', rgba(c.hex, opts.spill ?? .42));
  el.style.setProperty('--off', offTube(c, design.jacket));
  el.innerHTML = `<div class="neon-spill"></div><div class="neon-body" style="display:grid;justify-items:center;gap:0;position:relative;z-index:2">${design.icon ? iconSvg(design.icon, c) : ''}${lines.length ? `<p class="neon-text" style="font-family:'${f.family}',cursive;font-weight:${f.weight || 400};text-align:${design.align || 'center'};color:${coreOf(c)};text-shadow:${glowOf(c)}">${esc(lines.join('\n'))}</p>` : ''}</div>`;
  el._neon = { design, opts, lines, f, c };
  fitNeon(el);
  if (opts.lit === true || reduced || opts.strike === false) el.classList.add('lit');
  else { el.dataset.strike = '1'; neonSigns.add(el); strikeObserver && strikeObserver.observe(el); }
  return el;
}
function fitNeon(el) {
  const n = el._neon; if (!n) return;
  const box = el.getBoundingClientRect(); if (!box.width || !box.height) return;
  const m = measure(n.f, n.lines, n.design.align || 'center', n.design.icon);
  const fw = n.opts.fitW ?? .74, fh = n.opts.fitH ?? .6;
  let em = Math.min(box.width * fw / m.inkW, box.height * fh / m.inkH);
  if (n.opts.maxEm) em = Math.min(em, n.opts.maxEm);
  const t = $('.neon-text', el), ic = $('.neon-icon', el);
  if (t) { t.style.fontSize = em + 'px'; t.style.transform = `translate(${m.offX}em, ${n.lines.length ? m.offY : 0}em)`; }
  if (ic) { const s = m.iconEm * em; ic.style.width = ic.style.height = s + 'px'; ic.style.marginBottom = n.lines.length ? (-.12 * s) + 'px' : 0; }
}
function refitAll() { mcache.clear(); $$('.neon').forEach(fitNeon); }

/* ---------- scroll strike + room light ---------- */
let roomHex = getComputedStyle(document.documentElement).getPropertyValue('--room').trim() || '#c8a04a';
function setRoom(hex) { if (reduced || !hex || hex === roomHex) return; roomHex = hex; document.documentElement.style.setProperty('--room', hex); }
const visible = new Set(); let strikeObserver = null, roomRaf = 0;
function pickRoom() {
  roomRaf = 0; if (!visible.size) return;
  const mid = innerHeight / 2; let best = null, bd = Infinity;
  visible.forEach(el => { const r = el.getBoundingClientRect(); const d = Math.abs((r.top + r.bottom) / 2 - mid); if (d < bd) { bd = d; best = el; } });
  if (best && !best.classList.contains('off')) setRoom(best.dataset.hex);
}
function queueRoom() { if (!roomRaf) roomRaf = requestAnimationFrame(pickRoom); }
function initStrikes() {
  if (!('IntersectionObserver' in window)) { $$('.neon[data-strike]').forEach(el => el.classList.add('lit')); return; }
  strikeObserver = new IntersectionObserver(entries => {
    entries.forEach(e => { const el = e.target;
      if (e.isIntersecting && e.intersectionRatio >= .35) { visible.add(el);
        if (!el.classList.contains('lit')) { el.classList.add('lit'); if (!reduced) { el.classList.add('strike'); setTimeout(() => el.classList.remove('strike'), 950); } }
      } else visible.delete(el); });
    queueRoom();
  }, { threshold: [0, .35, .7] });
  neonSigns.forEach(el => strikeObserver.observe(el));
  addEventListener('scroll', queueRoom, { passive: true });
}
function strike(el) { if (reduced) return; el.classList.remove('strike'); void el.offsetWidth; el.classList.add('strike'); setTimeout(() => el.classList.remove('strike'), 950); }

/* ---------- fonts ---------- */
function ensureFonts() {
  if (!document.querySelector(`link[href="${L.googleFontsHref}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = L.googleFontsHref; document.head.appendChild(l); }
  const loads = FONTS.map(f => document.fonts.load(`${f.weight || 400} 100px "${f.family}"`, 'Hgy').then(faces => { if (faces.length) { loaded.add(f.family); mcache.clear(); } }).catch(() => {}));
  const done = Promise.race([Promise.all(loads), new Promise(r => setTimeout(r, 4500))]).then(() => { settled = true; refitAll(); });
  document.fonts.ready.then(refitAll);
  return done;
}

return { L, core, RULES, reduced, FONTS, COLOURS, SIZES, BACKINGS, BOARDS, USES, JACKETS, HANGS, MAXLINES, MAXLINE, EXCLUDED_MSG, BRICK, NOISE, NOISE_SOFT, WALLS,
  $, $$, byId, gbp, gbp2, esc, hexToRgb, rgba, mix, fontOf, colourOf, coreOf, glowOf, iconGlowOf, uiHex, offTube, inches, fmtDay,
  fontReady, measure, metricsFor, dimsFor, priceFor, addOf, promoLive, promoFor, promoLine, deliveryText, postcode, cleanText,
  decodeDesign, encodeDesign, builderLink, wallStyle, WALL_FOR_CAT, iconSvg, mountNeon, fitNeon, refitAll, setRoom, strike, initStrikes, ensureFonts,
  get fontsSettled() { return settled; } };
})();

/* =====================================================================
   Basket (localStorage) + site chrome (announcement, header, footer, drawer, toast)
   ===================================================================== */
Object.assign(LN, (() => {
"use strict";
const { $, $$, L, byId, gbp, gbp2, esc, fontOf, colourOf, SIZES, BACKINGS, BOARDS, USES, HANGS, mountNeon, wallStyle, promoLive, promoFor, fmtDay } = LN;
const KEY = 'litneon.fused.basket';
function loadBasket() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
let basket = loadBasket();
function saveBasket() { try { localStorage.setItem(KEY, JSON.stringify(basket)); } catch (e) {} updateCount(); }
function addToBasket(item) { item.uid = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); basket.push(item); saveBasket(); renderBasket(); openDrawer(); toast('Added to your basket'); }
function removeFromBasket(uid) { basket = basket.filter(i => i.uid !== uid); saveBasket(); renderBasket(); }
function updateCount() { $$('[data-count]').forEach(el => { el.textContent = basket.length; el.dataset.n = basket.length; }); }
function specFor(it) {
  return { v: 3, kind: it.kind, lines: it.lines, align: it.align, icon: it.icon || null, font_family: fontOf(it.font).family, colour: colourOf(it.colour).name, colour_hex: colourOf(it.colour).hex, jacket: it.jacket,
    letter_height_cm: byId(SIZES, it.size).letter, width_cm: it.W, height_cm: it.H, backing: it.backing, finish: it.board, hang: it.hang, use: it.use, plug: 'UK', price_gbp: it.price, promo_price_gbp: it.promo ?? null };
}
function payloadFor(it) {
  const pp = LN.core.pricePointFor(it.price, LN.RULES.pricing); /* null = no variant for this total, so it must go through a quote */
  return { items: [{ id: pp ? 'price-point:' + pp.key : 'quote-required', quantity: 1, properties: {
    'Words': it.lines.join(' / ') || (it.icon ? `${it.icon} symbol` : ''), 'Lettering': fontOf(it.font).name, 'Colour': colourOf(it.colour).name,
    'Size': `${byId(SIZES, it.size).name}, ${it.W} × ${it.H} cm`, 'Backing': `${byId(BACKINGS, it.backing).name}, ${byId(BOARDS, it.board).name.toLowerCase()}`,
    'Hangs': byId(HANGS, it.hang).name, 'Plug': 'UK', '_spec': JSON.stringify(specFor(it)) } }] };
}
function renderBasket() {
  const body = $('#dbody'), foot = $('#dfoot'); if (!body) return;
  if (!basket.length) {
    body.innerHTML = `<div class="empty"><p>Your basket is empty.</p><p>Design a sign in the builder, or pick a ready-made one from the shop.</p><div class="actions"><a class="btn ghost sm" href="create.html">Design a sign</a><a class="btn ghost sm" href="index.html#shop">Shop signs</a></div></div>`;
    foot.hidden = true; return;
  }
  body.innerHTML = basket.map(it => `<div class="item">
    <div class="mini wall-tile" style="${wallStyle('velvet')}"><div class="neon" data-mini="${it.uid}" style="position:absolute;inset:0"></div></div>
    <dl>
      <dt>Words</dt><dd>${esc(it.lines.join(' / ')) || (it.icon ? esc(it.icon) + ' symbol' : '')}</dd>
      <dt>Lettering</dt><dd>${esc(fontOf(it.font).name)}</dd>
      <dt>Colour</dt><dd>${esc(colourOf(it.colour).name)}</dd>
      <dt>Size</dt><dd>${byId(SIZES, it.size).name}, <span class="mono">${it.W} × ${it.H} cm</span></dd>
      <dt>Backing</dt><dd>${byId(BACKINGS, it.backing).name}, ${byId(BOARDS, it.board).name.toLowerCase()}</dd>
      <dt>Hangs</dt><dd>${byId(HANGS, it.hang).name}, UK plug</dd>
    </dl>
    <div class="ifoot"><button class="textlink" data-remove="${it.uid}">Remove</button><b>${it.promo != null ? `<s>${gbp(it.price)}</s>` : ''}${gbp(it.promo ?? it.price)}</b></div>
  </div>`).join('');
  basket.forEach(it => { const el = $(`[data-mini="${it.uid}"]`); if (el) mountNeon(el, { lines: it.lines, font: it.font, colour: it.colour, icon: it.icon, align: it.align, jacket: it.jacket }, { lit: true, fitW: .7, fitH: .55 }); });
  foot.hidden = false;
  const full = basket.reduce((a, b) => a + b.price, 0), pay = basket.reduce((a, b) => a + (b.promo ?? b.price), 0);
  $('#subtotal').textContent = gbp(pay);
  $('#klarnaLine').innerHTML = `${pay < full ? `Launch offer saves you ${gbp(full - pay)}. ` : ''}Free delivery across mainland GB. Pay in 3 with Klarna or Clearpay at checkout: <b>${gbp2(pay / 3)}</b> a time.`;
  $('#payload').textContent = JSON.stringify(payloadFor(basket[basket.length - 1]), null, 2);
}

/* ---------- chrome ---------- */
const NAV = [['create.html', 'Design your sign'], ['index.html#business', 'Logo & business'], ['index.html#shop', 'Shop signs'], ['index.html#shop-occasion', 'Weddings & events'], ['index.html#guides', 'Inspiration & guides'], ['index.html#faq', 'Help']];
const here = (location.pathname.split('/').pop() || 'index.html');
const navHtml = () => NAV.map(([h, t]) => `<a href="${h}"${h === here ? ' aria-current="page"' : ''}>${t}</a>`).join('');
const basketSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>';
const waSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1.3-3.8A8.5 8.5 0 1 1 8.6 19L4 20Z"/><path d="M9.5 9.5c0 3 2 5 5 5l1-1.5-2-1-1 1a4 4 0 0 1-1.5-1.5l1-1-1-2-1.5 1Z"/></svg>';
const userSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
const xSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
function countdownText(end) {
  const ms = end.getTime() - Date.now(); if (ms <= 0) return null;
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  const p = n => String(n).padStart(2, '0');
  return `${d}d ${p(h)}h ${p(m)}m ${p(sec)}s`;
}
function mountChrome() {
  const ann = $('#ln-announce');
  if (ann) {
    const live = promoLive();
    ann.outerHTML = `<div class="announce" role="region" aria-label="Launch offer"><div class="wrap">
      ${live ? `<span><b>Launch offer: 20% off every sign</b> until ${fmtDay(LIT_PROMO_END)}.</span><span>Ends in <span class="tick" id="tick" aria-live="off">${countdownText(LIT_PROMO_END)}</span></span>` : `<span><b>Launch offer has ended.</b> Prices shown are our everyday prices.</span>`}
      <span>Free delivery across mainland GB.</span><span class="sample" title="The real date is set in the theme editor">sample end date</span></div></div>`;
    if (live) setInterval(() => { const t = $('#tick'); if (!t) return; const v = countdownText(LIT_PROMO_END); t.textContent = v || 'ended'; }, 1000);
  }
  const head = $('#ln-header');
  if (head) head.outerHTML = `<header class="site-head"><div class="wrap">
    <a class="logo" href="index.html" aria-label="Lit Neon home">Lit Neon</a>
    <nav class="nav" aria-label="Main">${navHtml()}</nav>
    <div class="head-right">
      <a class="util text" href="create.html#quote=bulk">Bulk quotes</a>
      <a class="util icon" href="#" data-soon="WhatsApp chat" aria-label="Message us on WhatsApp">${waSvg}</a>
      <a class="util icon" href="#" data-soon="Your account" aria-label="Your account">${userSvg}</a>
      <button class="basket-btn" id="basketBtn" aria-label="Open basket">${basketSvg}<span class="lbl">Basket</span><span class="count" data-count data-n="0">0</span></button>
      <button class="burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="mobileNav"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    </div></div></header>
    <div class="mobile-nav" id="mobileNav" aria-hidden="true"><div class="top"><span class="logo" style="font-size:30px">Lit Neon</span><button class="x" id="mobileClose" aria-label="Close menu">${xSvg}</button></div>
      <nav aria-label="Main menu">${navHtml()}<a href="create.html#quote=bulk">Bulk quotes</a></nav>
      <div class="foot"><span>Free delivery across mainland GB. You approve a drawing before we make anything.</span><span>Pay in 3 with Klarna or Clearpay.</span></div></div>`;
  const foot = $('#ln-footer');
  if (foot && foot.hidden) foot.remove();
  else if (foot) foot.outerHTML = `<footer class="site-foot"><div class="wrap">
    <div class="cols">
      <div class="brand"><a class="logo" href="index.html" aria-label="Lit Neon home">Lit Neon</a><p>Custom LED neon signs, drawn to your words and made in our own UK workshop, for homes, bars, weddings and businesses across mainland GB.</p></div>
      <div><h4>Shop</h4><ul><li><a href="create.html">Design your sign</a></li><li><a href="index.html#business">Logo & business</a></li><li><a href="index.html#shop">Shop signs</a></li><li><a href="index.html#shop-occasion">Weddings & events</a></li><li><a href="create.html#quote=bulk">Bulk quotes</a></li></ul></div>
      <div><h4>Help</h4><ul><li><a href="index.html#faq">Delivery</a></li><li><a href="index.html#faq">Returns and warranty</a></li><li><a href="index.html#hanging">Installation</a></li><li><a href="index.html#guides">Guides</a></li><li><a href="#" data-soon="Recycling (WEEE and batteries)">Recycling</a></li></ul></div>
      <div><h4>Company</h4><ul><li><a href="index.html#workshop">Our UK workshop</a></li><li><a href="#" data-soon="Contact">Contact</a></li><li><a href="#" data-soon="Privacy policy">Privacy policy</a></li><li><a href="#" data-soon="Terms of sale">Terms of sale</a></li><li><a href="#" data-soon="Cookie settings">Cookies</a></li></ul></div>
    </div>
    <div class="legal"><p>Lit Neon Ltd (placeholder), registered in England and Wales. Prices in £. Custom signs are made to order and can't be returned for a change of mind; your statutory rights are not affected. Prices and inclusions are placeholders until the workshop confirms them.</p><span>© 2026 Lit Neon</span></div>
  </div></footer>`;
  document.body.insertAdjacentHTML('beforeend', `<div class="scrim" id="scrim"></div>
  <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="dTitle" aria-hidden="true">
    <div class="dhead"><h2 id="dTitle">Your basket</h2><button class="x" data-close aria-label="Close basket">${xSvg}</button></div>
    <div class="dbody" id="dbody"></div>
    <div class="dfoot" id="dfoot" hidden>
      <div class="total"><span>Subtotal</span><b id="subtotal">£0</b></div>
      <p class="note" id="klarnaLine"></p>
      <button class="btn primary" id="checkoutBtn">Go to checkout</button>
      <details class="dev"><summary>What Shopify receives</summary><p>Each line points at a hidden "Custom neon sign" price-point variant (every ${gbp(LN.RULES.pricing.step)} from ${gbp(LN.RULES.pricing.minPrice)} to ${gbp(LN.RULES.pricing.maxPrice)}) and carries the full design as order details for the workshop.</p><pre id="payload"></pre></details>
    </div>
  </aside>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`);
  updateCount();
  $('#basketBtn')?.addEventListener('click', () => { renderBasket(); openDrawer(); });
  $('#drawer')?.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeDrawer(); const r = e.target.closest('[data-remove]'); if (r) removeFromBasket(r.dataset.remove); });
  $('#scrim')?.addEventListener('click', closeDrawer);
  $('#checkoutBtn')?.addEventListener('click', () => toast("Prototype: in the live store this opens Shopify's secure checkout."));
  $('#burger')?.addEventListener('click', openNav);
  $('#mobileClose')?.addEventListener('click', closeNav);
  document.addEventListener('click', e => { const a = e.target.closest('[data-soon]'); if (a) { e.preventDefault(); toast(`${a.dataset.soon} comes with the live store.`); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); closeNav(); } });
}
let lastFocus = null;
function openDrawer() { const d = $('#drawer'); if (!d) return; lastFocus = document.activeElement; d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('show'); $('[data-close]', d).focus(); }
function closeDrawer() { const d = $('#drawer'); if (!d || !d.classList.contains('open')) return; d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); $('#scrim').classList.remove('show'); if (lastFocus) lastFocus.focus(); }
function openNav() { const n = $('#mobileNav'); n.classList.add('open'); n.setAttribute('aria-hidden', 'false'); $('#burger').setAttribute('aria-expanded', 'true'); $('#mobileClose').focus(); }
function closeNav() { const n = $('#mobileNav'); if (!n || !n.classList.contains('open')) return; n.classList.remove('open'); n.setAttribute('aria-hidden', 'true'); $('#burger').setAttribute('aria-expanded', 'false'); $('#burger').focus(); }
let toastT = 0;
function toast(msg) { const t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3400); }
return { get basket() { return basket; }, addToBasket, removeFromBasket, renderBasket, payloadFor, mountChrome, openDrawer, closeDrawer, toast, countdownText };
})());

/* =====================================================================
   Stage: real-scale room (sofa, bed or bar), close-up, wall scenes, on/off, evening/day,
   backings incl. cut-to-shape contour, measurements, light spill. Ported from After Dark.
   ===================================================================== */
LN.Stage = (() => {
"use strict";
const { $, rgba, NOISE, NOISE_SOFT, BRICK, coreOf, glowOf, iconGlowOf, offTube, L } = LN;
let uid = 0;
const SCENES = {
  velvet:  { name: 'Velvet', sw: '#3a1d42', light: false, skirt: '#2a1a2e', paint() { return { backgroundColor: '#2c1733', backgroundImage: `${NOISE}, repeating-linear-gradient(115deg, rgba(255,255,255,.035) 0 2px, transparent 2px 9px), radial-gradient(ellipse at 50% 30%, rgba(255,255,255,.05), transparent 60%)`, backgroundSize: '260px 260px, 100% 100%, 100% 100%' }; } },
  brick:   { name: 'London brick', sw: '#8a553d', light: false, skirt: '#d8d2c8', paint(ppc) { return { backgroundColor: '#7a4a37', backgroundImage: `${NOISE}, ${BRICK.url}`, backgroundSize: `260px 260px, ${BRICK.W * ppc}px ${BRICK.H * ppc}px` }; } },
  plaster: { name: 'Plaster', sw: '#cdc2b5', light: true, skirt: '#ece8e1', paint() { return { backgroundColor: '#d3c9bc', backgroundImage: `${NOISE_SOFT}, radial-gradient(ellipse at 30% 20%, rgba(255,255,255,.18), transparent 60%), radial-gradient(ellipse at 80% 70%, rgba(120,100,80,.12), transparent 55%)`, backgroundSize: '260px 260px, 100% 100%, 100% 100%' }; } },
  oxblood: { name: 'Oxblood', sw: '#3b1222', light: false, skirt: '#2a1016', paint() { return { backgroundColor: '#3b1222', backgroundImage: `${NOISE}, radial-gradient(ellipse at 30% 20%, rgba(255,255,255,.07), transparent 60%)`, backgroundSize: '260px 260px, 100% 100%' }; } },
  tile:    { name: 'Bar tile', sw: '#17204a', light: false, skirt: '#111733', paint(ppc) { const t = 15 * ppc, g = .5 * ppc; return { backgroundColor: '#1a2250', backgroundImage: `${NOISE_SOFT}, linear-gradient(rgba(255,255,255,.08), transparent 30%), repeating-linear-gradient(90deg, rgba(0,0,0,.55) 0 ${g}px, transparent ${g}px ${t * 2}px), repeating-linear-gradient(rgba(0,0,0,.55) 0 ${g}px, transparent ${g}px ${t}px)`, backgroundSize: `260px 260px, ${t * 2}px ${t}px, auto, auto` }; } },
  concrete:{ name: 'Concrete', sw: '#8f8e8a', light: true, skirt: '#6f6e6a', paint(ppc) { return { backgroundColor: '#8f8e8a', backgroundImage: `${NOISE_SOFT}, radial-gradient(circle, rgba(40,40,38,.5) ${0.7 * ppc}px, transparent ${0.9 * ppc}px), linear-gradient(90deg, rgba(0,0,0,.09) 1px, transparent 1px), linear-gradient(rgba(0,0,0,.07) 1px, transparent 1px)`, backgroundSize: `260px 260px, ${60 * ppc}px ${45 * ppc}px, ${120 * ppc}px ${90 * ppc}px, ${120 * ppc}px ${90 * ppc}px`, backgroundPosition: `0 0, ${30 * ppc}px ${22 * ppc}px, 0 0, 0 0` }; } },
  own:     { name: 'Your wall', sw: '#222', light: false, skirt: 'transparent', paint(ppc, view) { return { backgroundColor: '#222', backgroundImage: view.ownUrl ? `url("${view.ownUrl}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }; } }
};
/* furniture, drawn in cm: w × h (h = top of the piece to the floor), gap = clearance under the sign */
const FURN = {
  sofa: { w: 210, h: 84, gap: 24, svg: id => `<svg viewBox="0 0 210 84" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a2f3a"/><stop offset="1" stop-color="#3a1d26"/></linearGradient><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6a3845"/><stop offset="1" stop-color="#45232d"/></linearGradient></defs><rect x="19" y="76" width="3" height="8" rx="1" fill="#17181c"/><rect x="188" y="76" width="3" height="8" rx="1" fill="#17181c"/><rect x="10" y="10" width="190" height="44" rx="11" fill="url(#${id}f)"/><rect x="2" y="46" width="206" height="32" rx="7" fill="url(#${id}f)"/><rect x="19" y="43" width="85.5" height="13" rx="5" fill="url(#${id}s)"/><rect x="105.5" y="43" width="85.5" height="13" rx="5" fill="url(#${id}s)"/><rect x="0" y="32" width="21" height="46" rx="9" fill="#4a2531"/><rect x="189" y="32" width="21" height="46" rx="9" fill="#4a2531"/></svg>` },
  bed:  { w: 160, h: 100, gap: 18, svg: id => `<svg viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3326"/><stop offset="1" stop-color="#2e1f18"/></linearGradient><linearGradient id="${id}d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a2f44"/><stop offset="1" stop-color="#3c1e2e"/></linearGradient></defs><rect x="4" y="0" width="152" height="62" rx="5" fill="url(#${id}h)"/><rect x="6" y="92" width="4" height="8" fill="#17181c"/><rect x="150" y="92" width="4" height="8" fill="#17181c"/><rect x="0" y="58" width="160" height="36" rx="4" fill="#3a2a2e"/><rect x="3" y="56" width="154" height="16" rx="3" fill="#d9cfc2"/><rect x="14" y="46" width="60" height="16" rx="5" fill="#eae2d6"/><rect x="86" y="46" width="60" height="16" rx="5" fill="#eae2d6"/><rect x="3" y="66" width="154" height="24" rx="4" fill="url(#${id}d)"/></svg>` },
  bar:  { w: 240, h: 110, gap: 28, svg: id => `<svg viewBox="0 0 240 110" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1a22"/><stop offset="1" stop-color="#1c1018"/></linearGradient><linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a5a3a"/><stop offset="1" stop-color="#4a3422"/></linearGradient></defs><rect x="6" y="8" width="228" height="98" fill="url(#${id}c)"/><g fill="rgba(255,255,255,.06)"><rect x="18" y="14" width="2" height="86"/><rect x="48" y="14" width="2" height="86"/><rect x="78" y="14" width="2" height="86"/><rect x="108" y="14" width="2" height="86"/><rect x="138" y="14" width="2" height="86"/><rect x="168" y="14" width="2" height="86"/><rect x="198" y="14" width="2" height="86"/><rect x="222" y="14" width="2" height="86"/></g><rect x="0" y="0" width="240" height="9" rx="2" fill="url(#${id}t)"/><rect x="6" y="88" width="228" height="3" fill="#c8a04a" opacity=".75"/><g fill="#1a1a1e"><rect x="56" y="70" width="4" height="40"/><rect x="176" y="70" width="4" height="40"/></g><rect x="44" y="64" width="28" height="8" rx="4" fill="#5a2f3a"/><rect x="164" y="64" width="28" height="8" rx="4" fill="#5a2f3a"/></svg>` }
};
const CSS = `
.stage{position:relative;overflow:hidden;background:#241a28;isolation:isolate;user-select:none}
.stage .wall,.stage .floor,.stage .skirting,.stage .furn,.stage .dim,.stage .spill,.stage .wash{position:absolute;pointer-events:none}
.stage .wall{inset:0;background-repeat:repeat;transition:filter .5s}
.stage .floor{left:0;right:0;bottom:0}
.stage .skirting{left:0;right:0}
.stage .furn svg{width:100%;height:100%}
.stage .dim{inset:0;background:rgba(7,4,12,.74);transition:background .6s}
.stage.day .dim{background:rgba(255,248,238,0)}
.stage:not(.day).signoff .dim{background:rgba(5,3,10,.86)}
.stage .wash{inset:0;mix-blend-mode:screen;transition:opacity .5s}
.stage .spill{border-radius:50%;mix-blend-mode:screen;transition:opacity .45s}
.stage .sign{position:absolute}
.stage .board{position:absolute;inset:0;display:none}
.stage .board i{position:absolute;width:var(--so);height:var(--so);border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff 0,#e8d9a8 30%,#a8853d 70%,#6b5322 100%);box-shadow:0 1px 2px rgba(0,0,0,.4)}
.stage .board i:nth-child(1){left:var(--soi);top:var(--soi)}.stage .board i:nth-child(2){right:var(--soi);top:var(--soi)}.stage .board i:nth-child(3){left:var(--soi);bottom:var(--soi)}.stage .board i:nth-child(4){right:var(--soi);bottom:var(--soi)}
.stage .standbase{position:absolute;left:18%;right:18%;top:100%;display:none;border-radius:0 0 4px 4px}
.stage .sbody{position:absolute;left:50%;top:50%;display:grid;justify-items:center;white-space:pre;line-height:1.15;margin:0}
.stage .sbody p{margin:0;white-space:pre;line-height:1.15}
.stage .sbody svg{fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.5;width:var(--ic);height:var(--ic);margin-bottom:calc(var(--ic) * -.1)}
.stage .contour{color:#fff}
.stage .contour svg{stroke:#fff;stroke-width:2.2}
.stage:not(.day) .board,.stage:not(.day) .standbase{filter:brightness(.62)}
.stage .tube{transition:color .35s,text-shadow .35s}
.stage .tube.off p{color:var(--off,#ebe6dd)!important;text-shadow:0 .012em 0 rgba(0,0,0,.38),0 .035em .05em rgba(0,0,0,.32)!important}
.stage .tube.off svg{stroke:var(--off,#ebe6dd)!important;filter:drop-shadow(0 1px 0 rgba(0,0,0,.4))!important}
.stage .tube.placeholder{opacity:.38}
.stage .rgb .tube:not(.off),.stage .rgb.spill,.stage .rgb.wash{animation:hue 6s linear infinite}
.stage .strike{animation:strike .8s linear}
.stage .meas{position:absolute;pointer-events:none;color:rgba(255,255,255,.85);font-size:11.5px;font-family:var(--mono);font-variant-numeric:tabular-nums}
.stage .meas.h{height:9px;border-left:1px solid currentColor;border-right:1px solid currentColor}
.stage .meas.h::before{content:"";position:absolute;left:0;right:0;top:4px;border-top:1px solid currentColor;opacity:.75}
.stage .meas.h span{position:absolute;left:50%;top:12px;transform:translateX(-50%);white-space:nowrap}
.stage .meas.v{width:9px;border-top:1px solid currentColor;border-bottom:1px solid currentColor}
.stage .meas.v::before{content:"";position:absolute;top:0;bottom:0;left:4px;border-left:1px solid currentColor;opacity:.75}
.stage .meas.v span{position:absolute;left:15px;top:50%;transform:translateY(-50%);white-space:nowrap}
.stage .meas.v.flip span{left:auto;right:15px}
.stage.lightwall .meas{color:rgba(29,31,38,.8)}
@media (prefers-reduced-motion:reduce){.stage .strike,.stage .rgb .tube:not(.off),.stage .rgb.spill,.stage .rgb.wash{animation:none!important}}`;

function mount(container, opts = {}) {
  if (!document.getElementById('stage-css')) { const s = document.createElement('style'); s.id = 'stage-css'; s.textContent = CSS; document.head.appendChild(s); }
  const id = 'cf' + (++uid);
  container.classList.add('stage');
  container.innerHTML = `
    <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
      <filter id="${id}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius="10" result="d"/><feGaussianBlur in="d" stdDeviation="4" result="b"/>
        <feComponentTransfer in="b" result="shape"><feFuncA type="linear" slope="24" intercept="-11"/></feComponentTransfer>
        <feMorphology in="shape" operator="erode" radius="1.3" result="inner"/><feComposite in="shape" in2="inner" operator="out" result="edge"/>
        <feFlood class="cfFill" flood-color="#ffffff" flood-opacity=".08"/><feComposite in2="shape" operator="in" result="fill"/>
        <feFlood class="cfEdge" flood-color="#ffffff" flood-opacity=".45"/><feComposite in2="edge" operator="in" result="edgeC"/>
        <feMerge><feMergeNode in="fill"/><feMergeNode in="edgeC"/></feMerge>
      </filter>
    </svg>
    <div class="wall"></div><div class="skirting"></div><div class="floor"></div><div class="furn" data-furn=""></div>
    <div class="dim"></div><div class="wash"></div><div class="spill"></div>
    <div class="sign"><div class="board"><i></i><i></i><i></i><i></i></div><div class="sbody contour" aria-hidden="true" style="filter:url(#${id})"></div><div class="sbody tube"></div><div class="standbase"></div></div>
    <div class="meas h"><span></span></div><div class="meas v"><span></span></div>`;
  const el = { filter: container.querySelector('filter'), wall: $('.wall', container), floor: $('.floor', container), skirting: $('.skirting', container), furn: $('.furn', container),
    sign: $('.sign', container), tube: $('.tube', container), contour: $('.contour', container), board: $('.board', container), standbase: $('.standbase', container),
    spill: $('.spill', container), wash: $('.wash', container), measH: $('.meas.h', container), measV: $('.meas.v', container) };
  const view = Object.assign({ scene: opts.scene || 'velvet', on: false, night: true, mode: opts.mode || (innerWidth > 900 ? 'room' : 'fit'), dims: opts.dims !== false, ownUrl: null, furn: opts.furn || 'sofa' }, opts.view || {});
  let last = null;
  function setFilter(R, b) {
    const ms = el.filter.querySelectorAll('feMorphology');
    ms[0].setAttribute('radius', (R * .9).toFixed(2)); el.filter.querySelector('feGaussianBlur').setAttribute('stdDeviation', Math.max(1, R * .32).toFixed(2)); ms[1].setAttribute('radius', Math.max(.8, R * .045).toFixed(2));
    const fill = el.filter.querySelector('.cfFill'), edge = el.filter.querySelector('.cfEdge');
    fill.setAttribute('flood-color', b.fill[0]); fill.setAttribute('flood-opacity', b.fill[1]); edge.setAttribute('flood-color', b.edge[0]); edge.setAttribute('flood-opacity', b.edge[1]);
  }
  /* s = {lines[], align, font, colour, m, d, backing, board, icon, placeholder, jacket} */
  function render(s) {
    if (s) last = s; else s = last; if (!s || !s.d) return;
    const { lines, align, font: f, colour: c, m, d, backing: bk, board: bd } = s;
    const sc = SCENES[view.scene] || SCENES.velvet;
    const R = container.getBoundingClientRect(), SW = R.width, SH = R.height; if (!SW || !SH) return;
    const room = view.mode === 'room' && view.scene !== 'own';
    const fu = FURN[view.furn] || FURN.sofa;
    let ppc;
    if (room) ppc = Math.min(SW / Math.max(340, fu.w + 120, d.W + 110), SH / Math.max(fu.h + fu.gap + 70 + d.H, 255)); /* d.W + 110: room for the dimension labels either side */
    else ppc = Math.min(SW * (SW < 600 ? .6 : .7) / d.W, SH * .48 / d.H, 14);
    const w = d.W * ppc, h = d.H * ppc;
    const floorY = SH - 34 * ppc;
    const top = room ? Math.max(60, floorY - (fu.h + fu.gap) * ppc - h) : SH * .47 - h / 2;
    const left = SW / 2 - w / 2;
    container.classList.toggle('day', !view.night); container.classList.toggle('signoff', !view.on); container.classList.toggle('lightwall', !view.night && sc.light);
    Object.assign(el.wall.style, { backgroundImage: '', backgroundSize: '', backgroundPosition: '' }, sc.paint(ppc, view));
    [el.floor, el.skirting, el.furn].forEach(x => x.style.display = room ? 'block' : 'none');
    if (room) {
      Object.assign(el.floor.style, { top: floorY + 'px', background: `linear-gradient(rgba(0,0,0,.25), rgba(0,0,0,.55)), repeating-linear-gradient(90deg, #5a4030 0, #5a4030 ${14 * ppc - 1}px, #33231a ${14 * ppc - 1}px, #33231a ${14 * ppc}px)` });
      Object.assign(el.skirting.style, { top: (floorY - 11 * ppc) + 'px', height: 11 * ppc + 'px', background: `linear-gradient(${sc.skirt}, ${sc.skirt} 82%, rgba(0,0,0,.25))` });
      if (el.furn.dataset.furn !== view.furn) { el.furn.innerHTML = fu.svg(id); el.furn.dataset.furn = view.furn; }
      Object.assign(el.furn.style, { width: fu.w * ppc + 'px', height: fu.h * ppc + 'px', left: (SW / 2 - fu.w / 2 * ppc) + 'px', top: (floorY - fu.h * ppc + 2 * ppc) + 'px' });
    }
    Object.assign(el.sign.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
    const emPx = d.emCm * ppc, txt = lines.join('\n');
    const textShare = lines.length ? (m.inkH - (m.iconEm ? m.iconEm * 1.15 : 0)) / m.inkH : 0;
    const iconHtml = s.icon ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${L.icons[s.icon]}"/></svg>` : '';
    [el.tube, el.contour].forEach(x => {
      const html = iconHtml + (lines.length ? `<p>${LN.esc(txt)}</p>` : '');
      if (x.dataset.html !== html) { x.innerHTML = html; x.dataset.html = html; }
      x.style.fontFamily = `"${f.family}", cursive`; x.style.fontWeight = f.weight || 400; x.style.fontSize = emPx + 'px'; x.style.setProperty('--ic', (m.iconEm || 0) + 'em');
      const p = x.querySelector('p'); if (p) p.style.textAlign = align;
      x.style.transform = `translate(-50%,-50%) translate(${m.offX}em, ${m.offY * textShare}em)`;
    });
    el.tube.classList.toggle('placeholder', !!s.placeholder); el.tube.classList.toggle('off', !view.on);
    el.tube.style.setProperty('--off', offTube(c, s.jacket));
    const core = coreOf(c);
    const tp = el.tube.querySelector('p'); if (tp) { tp.style.color = core; tp.style.textShadow = glowOf(c); }
    const ti = el.tube.querySelector('svg'); if (ti) { ti.style.stroke = core; ti.style.filter = iconGlowOf(c); }
    el.sign.classList.toggle('rgb', !!c.rgb);
    const R2 = bk.margin * ppc;
    if (bk.id === 'cut') {
      el.contour.style.display = 'grid'; el.board.style.display = 'none'; el.standbase.style.display = 'none';
      el.contour.style.padding = (R2 * 1.4) + 'px'; el.contour.style.filter = view.night ? `url(#${id}) brightness(.62)` : `url(#${id})`; setFilter(R2, bd);
    } else {
      el.contour.style.display = 'none'; el.board.style.display = 'block';
      Object.assign(el.board.style, { background: bd.rect, border: `1px solid ${bd.border}`, borderRadius: Math.max(3, .8 * ppc) + 'px', boxShadow: `0 ${1.2 * ppc}px ${2.4 * ppc}px rgba(0,0,0,.35)` });
      el.board.style.setProperty('--so', Math.max(4, 1.6 * ppc) + 'px'); el.board.style.setProperty('--soi', Math.max(3, 1.8 * ppc) + 'px');
      el.standbase.style.display = bk.id === 'stand' ? 'block' : 'none';
      Object.assign(el.standbase.style, { height: 5 * ppc + 'px', background: bd.id === 'clear' ? 'linear-gradient(rgba(255,255,255,.18),rgba(255,255,255,.06))' : bd.rect, border: `1px solid ${bd.border}` });
    }
    const cx = left + w / 2, cy = top + h / 2;
    const sw = Math.min(w * 1.5 + 70 * ppc, SW * 1.3), sh = Math.min(h * 2.1 + 70 * ppc, SH * 1.1);
    Object.assign(el.spill.style, { left: (cx - sw / 2) + 'px', top: (cy - sh / 2) + 'px', width: sw + 'px', height: sh + 'px', background: `radial-gradient(closest-side, ${rgba(c.hex, .46)}, ${rgba(c.hex, .16)} 45%, transparent 100%)`, opacity: view.on ? (view.night ? 1 : .35) : 0 });
    el.wash.style.background = `radial-gradient(circle at ${cx}px ${cy}px, ${rgba(c.hex, .1)}, transparent ${Math.max(SW, SH) * .55}px)`;
    el.wash.style.opacity = view.on && view.night ? 1 : 0;
    el.spill.classList.toggle('rgb', !!c.rgb); el.wash.classList.toggle('rgb', !!c.rgb);
    const showDims = view.dims && !s.placeholder;
    el.measH.style.display = el.measV.style.display = showDims ? 'block' : 'none';
    if (showDims) {
      const extra = bk.id === 'stand' ? 5 * ppc : 0;
      Object.assign(el.measH.style, { left: left + 'px', top: (top + h + extra + 12) + 'px', width: w + 'px' });
      const vLeft = left + w + 12 + 64 > SW; el.measV.classList.toggle('flip', vLeft);
      Object.assign(el.measV.style, { left: (vLeft ? left - 21 : left + w + 12) + 'px', top: top + 'px', height: h + 'px' });
      el.measH.firstElementChild.textContent = `${d.W} cm`; el.measV.firstElementChild.textContent = `${d.H} cm`;
    }
    if (view.on && !s.noRoom) LN.setRoom(LN.uiHex(c));
  }
  function strike() { if (!view.on || LN.reduced) return; [el.tube, el.spill].forEach(x => { x.classList.remove('strike'); void x.offsetWidth; x.classList.add('strike'); }); }
  function setOwnWall(file) { if (view.ownUrl) URL.revokeObjectURL(view.ownUrl); view.ownUrl = URL.createObjectURL(file); view.scene = 'own'; render(); }
  new ResizeObserver(() => render()).observe(container);
  return { view, render, strike, setOwnWall, SCENES, FURN, el: container };
}
return { mount, SCENES, FURN };
})();

/* =====================================================================
   Proof sheet: the Workshop drawing you approve. Drafting-blue outline lettering, backing outline,
   dimension lines, cap-height mark, title block, construction notes, "For approval" stamp.
   One renderer for how-it-works, the builder's Proof drawing view and the Review card.
   ===================================================================== */
LN.Sheet = (() => {
"use strict";
const { $, L, esc, inches, byId, USES, HANGS, JACKETS } = LN;
let uid = 0;
/* LED flex estimate (metres), measured from the lettering itself: ink area / stroke width */
const fctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const fcache = new Map(); let iconPath = null;
function flexMetres(f, lines, align, icon, m, emCm) {
  let emLen = 0;
  if (lines.length && m.textW > 0) {
    const key = f.family + '|' + align + '|' + lines.join('\n');
    if (!fcache.has(key)) {
      const S = 120, W = Math.ceil(m.textW * S) + 40, H = Math.ceil(m.blockH * S) + 40;
      fctx.canvas.width = W; fctx.canvas.height = H;
      fctx.font = `${f.weight || 400} ${S}px "${f.family}"`; fctx.clearRect(0, 0, W, H); fctx.fillStyle = '#000'; fctx.textBaseline = 'alphabetic';
      lines.forEach((t, i) => fctx.fillText(t, 20 - m.minX * S + (align === 'left' ? 0 : align === 'right' ? (m.blockW - m.lineWidths[i]) * S : (m.blockW - m.lineWidths[i]) * S / 2), 20 + (m.baselines[i] - m.top) * S));
      const px = fctx.getImageData(0, 0, W, H).data; let area = 0; const runs = [];
      for (let y = 0; y < H; y++) { let run = 0; for (let x = 0; x < W; x++) { const on = px[(y * W + x) * 4 + 3] > 110; if (on) { area++; run++; } else if (run) { runs.push(run); run = 0; } } if (run) runs.push(run); }
      runs.sort((a, b) => a - b);
      const stroke = runs.length ? Math.max(2, runs[Math.floor(runs.length * .3)]) : 10;
      const v = area / stroke / S; if (LN.fontReady(f)) fcache.set(key, v); emLen += v;
    } else emLen += fcache.get(key);
  }
  if (icon) { if (!iconPath) iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); iconPath.setAttribute('d', L.icons[icon]); let len = 24; try { len = iconPath.getTotalLength(); } catch (e) {} emLen += len / 24 * m.iconEm; }
  return Math.round(emLen * emCm) / 100;
}
const dimH = (left, top, width, label, cls = '') => `<div class="dim h ${cls}" style="left:${left}px;top:${top}px;width:${width}px"><i></i><span>${label}</span></div>`;
const dimV = (left, top, height, label, cls = '') => `<div class="dim v ${cls}" style="left:${left}px;top:${top}px;height:${height}px"><i></i><span>${label}</span></div>`;

function ensure(container) {
  if (container.dataset.sheet) return container.dataset.sheet;
  const id = 'sheetF' + (++uid); container.dataset.sheet = id;
  container.innerHTML = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="${id}" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
      <feMorphology in="SourceAlpha" operator="dilate" radius="10" result="d"/><feGaussianBlur in="d" stdDeviation="4" result="b"/>
      <feComponentTransfer in="b" result="shape"><feFuncA type="linear" slope="24" intercept="-11"/></feComponentTransfer>
      <feMorphology in="shape" operator="erode" radius="1.2" result="inner"/><feComposite in="shape" in2="inner" operator="out" result="edge"/>
      <feFlood flood-color="#2F5D8A" flood-opacity=".9"/><feComposite in2="edge" operator="in"/></filter></svg>
    <div class="frame"></div><div class="sh-title"></div><div class="sh-sub"></div>
    <div class="stamp">For approval<small>nothing is made until you say yes</small></div>
    <div class="drawing"></div><div class="dims"></div><div class="notes"></div><div class="tb"></div>`;
  return id;
}
/* spec = {lines, align, f, c, m, d, bk, bd, icon, jacket, use, hang, letterCm}; opts = {compact} */
function render(container, spec, opts = {}) {
  const id = ensure(container);
  const { lines, align, f, c, m, d, bk, bd, icon } = spec;
  if (!d || !m) return null;
  const compact = !!opts.compact; container.classList.toggle('compact', compact);
  const R = container.getBoundingClientRect(), SW = R.width, SH = R.height; if (!SW || !SH) return null;
  const narrow = SW < 600 || compact;
  const lite = compact || !!opts.lite || SH < 640; /* small sheets: short title block, no notes, so the drawing keeps the room */
  container.classList.toggle('lite', lite && !compact);
  const flex = (lines.length || icon) ? flexMetres(f, lines, align, icon, m, d.emCm) : 0;
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const words = lines.length ? lines.join(' / ') : (icon ? `${icon} symbol` : '—');
  $('.sh-title', container).textContent = compact ? 'Proof drawing' : 'Custom neon sign, drawing 1';
  $('.sh-sub', container).textContent = `${lines.length} line${lines.length === 1 ? '' : 's'}, ${spec.letterCm} cm letters, about ${flex.toFixed(1)} m of LED flex. Not to scale.`;
  const rows = compact
    ? [['Words', esc(words), 'name'], ['Lettering', `${esc(f.name)}, ${esc(c.name)}`], ['Overall', `${d.W} × ${d.H} cm`], ['Letter height', `${spec.letterCm} cm`]]
    : lite
    ? [['Words', esc(words), 'name'], ['Lettering', `${esc(f.name)}, ${esc(c.name)}`], ['Letter height', `${spec.letterCm} cm`], ['Overall', `${d.W} × ${d.H} cm (${inches(d.W)} × ${inches(d.H)} in)`], ['LED flex, est.', `${flex.toFixed(1)} m`], ['Backing', `${bk.name}, ${bd.name.toLowerCase()} acrylic`]]
    : [['Words', esc(words) + (icon ? ` + ${icon}` : ''), 'name'], ['Lettering', `${esc(f.name)} (${esc(f.family)})`], ['Colour', `${esc(c.name)}${c.rgb ? '' : ' ' + c.hex}`], ['Tube', byId(JACKETS, spec.jacket).name.toLowerCase()],
      ['Letter height', `${spec.letterCm} cm`], ['Overall', `${d.W} × ${d.H} cm (${inches(d.W)} × ${inches(d.H)} in)`], ['LED flex, est.', `${flex.toFixed(1)} m`], ['Backing', `${bk.name}, ${bd.name.toLowerCase()} acrylic`],
      ['Hangs', `${byId(USES, spec.use).name.toLowerCase()}, ${bk.id === 'stand' ? 'on its stand' : byId(HANGS, spec.hang).name.toLowerCase()}`], ['Power', '12 V supply <span class="cf">[CONFIRM]</span>, UK plug, dimmer and remote'], ['Drawn', `${today}, sheet 1 of 1`]];
  $('.tb', container).innerHTML = `<table>${rows.map(([k, v, cls]) => `<tr><td>${k}</td><td${cls ? ` class="${cls}"` : ''}>${v}</td></tr>`).join('')}</table>`;
  $('.notes', container).innerHTML = lite ? '' : `<h4>Construction notes</h4><ol>
    <li>Tube path follows the centreline of each letter${icon ? ' and the symbol' : ''}.</li>
    <li>${bk.id === 'cut' ? `Acrylic cut ${bk.margin} cm outside the lettering.` : `Acrylic panel with ${bk.margin} cm clearance, four brass standoffs.`}</li>
    <li>Lines ${align === 'center' ? 'centred' : 'aligned ' + align}. Cable exits bottom right, 2 m clear <span class="cf">[CONFIRM]</span>.</li>
    <li>Made in our UK workshop, delivered in 7 to 10 working days.</li></ol>`;
  const tbH = $('.tb', container).offsetHeight || 0;
  const capPad = (!narrow && lines.length) ? 58 : 0; /* room for the cap-height mark on the left */
  const areaL = SW * .07 + capPad, areaT = compact ? 60 : narrow ? 92 : 118, areaW = SW * .86 - capPad, areaH = SH - areaT - (tbH ? tbH + (compact ? 24 : 30) + (compact ? 44 : 56) : 48);
  const ppc = Math.max(.3, Math.min((areaW - (narrow ? 40 : 120)) / d.W, (areaH - (narrow ? 40 : 56)) / d.H));
  const w = d.W * ppc, h = d.H * ppc, left = areaL + (areaW - w) / 2, top = areaT + (areaH - h) / 2 - 6;
  const mg = bk.margin * ppc, emPx = d.emCm * ppc;
  const dr = $('.drawing', container); Object.assign(dr.style, { left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
  const s = 100, iw = m.inkW * emPx, ih = m.inkH * emPx;
  const textShiftX = (m.inkW - m.textW) / 2 - m.minX;
  const alignOff = li => align === 'left' ? 0 : align === 'right' ? (m.blockW - m.lineWidths[li]) : (m.blockW - m.lineWidths[li]) / 2;
  let svg = `<svg viewBox="0 0 ${m.inkW * s} ${m.inkH * s}" style="left:${mg}px;top:${mg}px;width:${iw}px;height:${ih}px">`;
  if (icon) svg += `<g transform="translate(${(m.inkW - m.iconEm) / 2 * s} 0) scale(${m.iconEm * s / 24})"><path d="${L.icons[icon]}" style="stroke-width:${(1.7 * 24 / (m.iconEm * s)).toFixed(3)}"/></g>`;
  lines.forEach((line, li) => { svg += `<text x="${((textShiftX + alignOff(li)) * s).toFixed(1)}" y="${((m.textOffY + m.baselines[li] - m.top) * s).toFixed(1)}" style="font-family:'${f.family}';font-weight:${f.weight || 400};font-size:100px">${esc(line)}</text>`; });
  svg += '</svg>';
  let back = '';
  if (bk.id === 'cut') {
    const fl = container.querySelector('filter'), ms = fl.querySelectorAll('feMorphology');
    ms[0].setAttribute('radius', (mg * .9).toFixed(2)); fl.querySelector('feGaussianBlur').setAttribute('stdDeviation', Math.max(1, mg * .32).toFixed(2));
    const pad = mg * 1.4;
    const iconH = icon ? `<svg viewBox="0 0 24 24" style="left:${(m.inkW - m.iconEm) / 2 * emPx}px;top:0;width:${m.iconEm * emPx}px;height:${m.iconEm * emPx}px"><path d="${L.icons[icon]}"/></svg>` : '';
    const textH = lines.length ? `<p class="c-text" style="left:${textShiftX * emPx}px;top:${(m.textOffY - m.top) * emPx}px;width:${m.blockW * emPx}px;font-family:'${f.family}',cursive;font-weight:${f.weight || 400};font-size:${emPx}px;line-height:1.15;text-align:${align}">${esc(lines.join('\n'))}</p>` : '';
    back = `<div class="contourL" style="left:${mg - pad}px;top:${mg - pad}px;width:${iw + 2 * pad}px;height:${ih + 2 * pad}px;filter:url(#${id})"><div style="position:absolute;left:${pad}px;top:${pad}px;width:${iw}px;height:${ih}px">${iconH}${textH}</div></div>`;
  } else {
    back = `<div class="rectL" style="left:0;top:0;width:${w}px;height:${h}px"><i></i><i></i><i></i><i></i></div>` + (bk.id === 'stand' ? `<div class="rectL" style="left:${w * .18}px;top:${h}px;width:${w * .64}px;height:${5 * ppc}px;border-style:solid"></div>` : '');
  }
  dr.innerHTML = back + svg;
  let dims = narrow
    ? dimH(left, top + h + 20, w, `${d.W} × ${d.H} cm`, 'below')
    : dimH(left, top + h + 22, w, `${d.W} cm`, 'below') + dimV(left + w + 22, top, h, `${d.H} cm`);
  if (lines.length && !narrow) {
    const base = top + mg + (m.textOffY + m.baselines[0] - m.top) * emPx, capTop = base - m.cap * emPx;
    dims += dimV(left - 22, capTop, base - capTop, `${spec.letterCm} cm`, 'flip') + `<div class="capline" style="left:${left - 30}px;width:${mg + 30}px;top:${capTop}px"></div><div class="capline" style="left:${left - 30}px;width:${mg + 30}px;top:${base}px"></div>`;
  }
  $('.dims', container).innerHTML = dims;
  return { flex, ppc };
}
return { render, flexMetres, dimH, dimV };
})();

/* =====================================================================
   Homepage
   ===================================================================== */
LN.initHome = function () {
"use strict";
const { $, $$, L, byId, gbp, esc, fontOf, colourOf, uiHex, SIZES, BACKINGS, BOARDS, mountNeon, wallStyle, WALL_FOR_CAT, builderLink, metricsFor, measure, dimsFor, priceFor, promoLive, promoFor, fmtDay, setRoom, strike, toast } = LN;
const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>';
const designOf = id => { const d = L.designs.find(x => x.id === id); return { lines: d.lines, font: d.font, colour: d.colour, icon: d.icon, align: 'center', name: d.name, category: d.category, id }; };
const pricing = { backing: 'cut', board: 'clear' };

/* ---------- hero: type to light ---------- */
const hero = { text: 'After dark', font: 'soho', colour: 'pink' };
$('#scene').setAttribute('style', wallStyle('velvet'));
const heroNeon = $('#heroNeon');
/* the hero reads text exactly as the builder does (NFC, dashes, tabs, normaliseText, unsupportedChars), so both agree */
const heroClean = () => LN.cleanText(hero.text);
const heroLines = () => { const n = heroClean(); const ls = n.lines.map(l => Array.from(l).filter(ch => !n.bad.includes(ch)).join('').replace(/ {2,}/g, ' ').trim()).filter(Boolean); return ls.length ? ls : ['After dark']; };
function drawHero(restrike) {
  mountNeon(heroNeon, { lines: heroLines(), font: hero.font, colour: hero.colour }, { fitW: .78, fitH: .5, spill: .5, lit: heroNeon.classList.contains('lit') });
  if (restrike) strike(heroNeon);
  if (heroNeon.classList.contains('lit')) setRoom(uiHex(colourOf(hero.colour)));
  heroLive(); howSheet(); sizeGuide(); wireCtas();
}
function heroLive() {
  const el = $('#heroLive'), f = fontOf(hero.font), n = heroClean();
  if (n.bad.length) { el.innerHTML = `We can't draw ${n.bad.map(ch => `<b>${esc(ch)}</b>`).join(' ')} in neon tube yet. Letters, numbers and the usual punctuation are all fine.`; return; }
  const m = metricsFor(f, heroLines(), 'center');
  if (!m) { el.textContent = 'Working out your price…'; return; }
  const d = dimsFor('m', m, 'cut'), p = priceFor(d, Object.assign({ colour: hero.colour }, pricing));
  if (p.quote) { el.innerHTML = `At medium size this is <span class="mono">${d.W} cm</span> wide, so we'd quote it (anything over 2 m is drawn by hand first).`; return; }
  el.innerHTML = `At medium size, <span class="mono">${d.W} × ${d.H} cm</span>, <b>${gbp(p.total)}</b>${promoLive() ? `, or <b>${gbp(promoFor(p.total))}</b> in the launch offer` : ''}.`;
}
const heroState = (extra = {}) => Object.assign({ text: heroLines().join('\n'), font: hero.font, colour: hero.colour, size: 'm' }, extra);
function wireCtas() { ['heroDesign', 'howCta', 'saveCta'].forEach(id => { const a = $('#' + id); if (a) a.href = builderLink(heroState()); }); }
const HERO_COLOURS = ['pink', 'warm', 'ice', 'violet', 'red', 'green'];
$('#heroDots').innerHTML = HERO_COLOURS.map(id => { const c = colourOf(id); return `<button type="button" class="dot" data-colour="${id}" style="--c:${c.hex}" aria-label="${esc(c.name)}" aria-pressed="${id === hero.colour}"></button>`; }).join('');
$('#heroDots').addEventListener('click', e => { const b = e.target.closest('[data-colour]'); if (!b) return; hero.colour = b.dataset.colour; $$('#heroDots .dot').forEach(x => x.setAttribute('aria-pressed', String(x === b))); drawHero(true); });
const HERO_FONTS = ['soho', 'camden', 'brighton', 'shoreditch'];
$('#heroFonts').innerHTML = HERO_FONTS.map(id => { const f = fontOf(id); return `<button type="button" class="chip" data-font="${id}" style="font-family:'${f.family}';font-weight:${f.weight || 400}" aria-pressed="${id === hero.font}">${esc(f.name)}</button>`; }).join('');
$('#heroFonts').addEventListener('click', e => { const b = e.target.closest('[data-font]'); if (!b) return; hero.font = b.dataset.font; $$('#heroFonts .chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); drawHero(true); });
let typeT = 0;
$('#heroWords').addEventListener('input', e => { hero.text = e.target.value.slice(0, 24); clearTimeout(typeT); typeT = setTimeout(() => drawHero(false), 60); });
$('#typer').addEventListener('submit', e => { e.preventDefault(); location.href = builderLink(heroState()); });

/* ---------- trust strip ---------- */
$('#trust').innerHTML = ['Free mockup in 12h', '2-year warranty', 'Dimmer & remote included', 'Free mainland GB delivery', 'Klarna and Clearpay at checkout'].map(t => `<span>${check}${t}</span>`).join('');

/* ---------- shop by room, occasion, business ---------- */
const SHOP = {
  room: [['Bedroom', 'Soft light for the wall above the bed.', 'sweet-dreams'], ['Kitchen and hallway', 'The line everyone reads on the way in.', 'home-sweet-home'], ['Home bar', 'Behind the bottles, lit till last orders.', 'fancy-a-pint'], ['Gaming room', 'Bold lettering that looks good on camera.', 'game-on']],
  occasion: [['Weddings', 'Your names or a line from the vows, kept for the hallway after.', 'mr-and-mrs'], ['Kids and nursery', 'Gentle colours, dimmed right down at bedtime.', 'oh-baby'], ['Parties and birthdays', 'One word that does the whole room.', 'cheers'], ['Anniversaries', 'The thing you said, in light.', 'happily-ever-after']],
  business: [['Shopfront', 'Seen from the street after dark.', 'open-late'], ['Café', 'Over the machine or in the window.', 'cuppa-first'], ['Salon and barber', 'Short, bright, photographed daily.', 'lit'], ['Office and studio', 'The team wall, or reception.', 'better-together']]
};
for (const [kind, rows] of Object.entries(SHOP)) {
  const grid = $(`[data-shop="${kind}"]`);
  grid.innerHTML = rows.map(([title, copy, id]) => { const d = designOf(id); return `<a class="occasion" href="${builderLink({ text: d.lines.join('\n'), font: d.font, colour: d.colour, icon: d.icon || '', size: 'm' })}"><div class="wall-tile" style="${wallStyle(WALL_FOR_CAT[d.category])}"><div class="neon" data-design="${id}"></div></div><h3>${esc(title)}</h3><p>${esc(copy)}</p></a>`; }).join('');
  $$('.neon', grid).forEach(el => mountNeon(el, designOf(el.dataset.design), { fitW: .72, fitH: .5 }));
}

/* ---------- how it works: the live proof sheet ---------- */
function howSheet() {
  const f = fontOf(hero.font), c = colourOf(hero.colour), lines = heroLines();
  const m = measure(f, lines, 'center'), d = dimsFor('m', m, 'cut');
  const r = LN.Sheet.render($('#howSheet'), { lines, align: 'center', f, c, m, d, bk: byId(BACKINGS, 'cut'), bd: byId(BOARDS, 'clear'), icon: '', jacket: 'white', use: 'in', hang: 'screws', letterCm: byId(SIZES, 'm').letter }, { lite: true });
  $('#howCaption').textContent = d ? `${d.W} × ${d.H} cm` : '';
  return r;
}

/* ---------- real-size guide ---------- */
const sizeStage = LN.Stage.mount($('#sizeStage'), { scene: 'velvet', mode: 'room', furn: 'sofa', dims: true });
sizeStage.view.on = true;
let sizeIx = 1;
function sizeGuide() {
  const sz = SIZES[sizeIx], f = fontOf(hero.font), c = colourOf(hero.colour), lines = heroLines();
  const m = measure(f, lines, 'center'), d = dimsFor(sz.id, m, 'cut');
  sizeStage.render({ lines, align: 'center', font: f, colour: c, m, d, backing: byId(BACKINGS, 'cut'), board: byId(BOARDS, 'clear'), icon: null, jacket: 'white', noRoom: true });
  $('#sizeReadout').innerHTML = `${esc(sz.name)}<small>${d.W} × ${d.H} cm, ${sz.letter} cm letters</small>`;
  const r = $('#sizeRange'); r.setAttribute('aria-valuetext', sz.name); r.style.setProperty('--pct', (sizeIx / 4 * 100) + '%');
  const mm = metricsFor(f, lines, 'center'), pe = $('#sizePrice');
  if (!mm) pe.textContent = 'Working out your price…';
  else { const p = priceFor(dimsFor(sz.id, mm, 'cut'), Object.assign({ colour: hero.colour }, pricing)); pe.innerHTML = p.quote ? `Over 2 m wide at this size, so it's a quote. <a href="${builderLink(heroState({ size: sz.id }))}">Ask for one</a>.` : `${gbp(p.total)} at this size with a clear cut-to-shape backing${promoLive() ? `, <b style="color:var(--bone)">${gbp(promoFor(p.total))}</b> in the launch offer` : ''}.`; }
  $('#sizeCta').href = builderLink(heroState({ size: sz.id }));
}
$('#sizeRange').addEventListener('input', e => { sizeIx = +e.target.value; sizeGuide(); });
$('#sizeFurn').addEventListener('click', e => { const b = e.target.closest('[data-furn]'); if (!b) return; $$('#sizeFurn .chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); sizeStage.view.furn = b.dataset.furn; sizeGuide(); });

/* ---------- tube colour demo ---------- */
const tube = { colour: 'red', on: true, rgb: false };
const TUBE_COLOURS = ['red', 'pink', 'ice', 'warm', 'green', 'violet'];
$('#tubeDots').innerHTML = TUBE_COLOURS.map(id => { const c = colourOf(id); return `<button type="button" class="dot" data-colour="${id}" style="--c:${c.hex}" aria-label="${esc(c.name)}" aria-pressed="${id === tube.colour}"></button>`; }).join('');
function drawTubes() {
  const colour = tube.rgb ? 'rgb' : tube.colour;
  [['#tubeWhite', 'white'], ['#tubeColour', 'colour']].forEach(([sel, jacket]) => {
    const tile = $(sel); tile.setAttribute('style', wallStyle('plaster')); tile.classList.toggle('day', !tube.on);
    const el = $('.neon', tile); mountNeon(el, { lines: ['Open late'], font: 'shoreditch', colour, jacket }, { lit: true, fitW: .7, fitH: .45 }); el.classList.toggle('off', !tube.on);
  });
  $$('#tubeDots .dot').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.colour === tube.colour)));
  $$('#tubePower button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.on === '1') === tube.on)));
  $$('#tubeMode button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.rgb === '1') === tube.rgb)));
  if (tube.on) setRoom(uiHex(colourOf(colour)));
}
$('#tubePower').addEventListener('click', e => { const b = e.target.closest('[data-on]'); if (!b) return; tube.on = b.dataset.on === '1'; drawTubes(); });
$('#tubeMode').addEventListener('click', e => { const b = e.target.closest('[data-rgb]'); if (!b) return; tube.rgb = b.dataset.rgb === '1'; drawTubes(); });
$('#tubeDots').addEventListener('click', e => { const b = e.target.closest('[data-colour]'); if (!b) return; tube.colour = b.dataset.colour; tube.rgb = false; drawTubes(); });
drawTubes();

/* ---------- bestsellers (prices from the core, small size, clear cut-to-shape) ---------- */
const BEST = ['lets-stay-in', 'fancy-a-pint', 'better-together', 'sweet-dreams', 'game-on', 'cheers', 'open-late', 'home-sweet-home'];
$('#bestRail').innerHTML = BEST.map(id => { const d = designOf(id), cat = L.categories.find(c => c.id === d.category);
  return `<a class="tile" href="${builderLink({ text: d.lines.join('\n'), font: d.font, colour: d.colour, icon: d.icon || '', size: 's' })}" style="--tile-c:${colourOf(d.colour).hex}"><div class="wall-tile" style="${wallStyle(WALL_FOR_CAT[d.category])}"><div class="neon" data-design="${id}"></div></div><div class="meta"><b>${esc(d.name)}</b><span data-from="${id}">from …</span></div><span class="cat">${esc(cat.name)}</span></a>`; }).join('');
$$('#bestRail .neon').forEach(el => mountNeon(el, designOf(el.dataset.design)));
function bestPrices() {
  $$('[data-from]').forEach(el => { const d = designOf(el.dataset.from), f = fontOf(d.font), m = metricsFor(f, d.lines, 'center', d.icon);
    if (!m) { el.textContent = 'from …'; return; }
    const p = priceFor(dimsFor('s', m, 'cut'), { colour: d.colour, backing: 'cut', board: 'clear' });
    /* like the builder: the everyday price first, the launch price under it and labelled as such */
    el.innerHTML = p.quote ? 'quote' : `from ${gbp(p.total)}${promoLive() ? `<small>${gbp(promoFor(p.total))} launch price</small>` : ''}`; });
}

/* ---------- what's in the box: drawn anatomy, hotspots are visual only ---------- */
const box = $('#anatomyBox'); box.setAttribute('style', wallStyle('ink'));
box.innerHTML = `<svg viewBox="0 0 400 300" fill="none" stroke="#f2e9df" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="48" y="40" width="200" height="110" rx="6" stroke="rgba(242,233,223,.45)" stroke-dasharray="4 4"/>
  <text x="148" y="110" text-anchor="middle" style="font-family:'Neonderthaw',cursive;font-size:54px;fill:none;stroke:#ff8fcf;stroke-width:1.6;paint-order:stroke">Lit</text>
  <path d="M232 128c10 0 16 8 16 18v40" stroke="rgba(242,233,223,.7)"/>
  <rect x="236" y="186" width="44" height="26" rx="4"/><path d="M258 212v14M248 226h20"/>
  <rect x="300" y="60" width="26" height="70" rx="5"/><circle cx="313" cy="74" r="2.2"/><path d="M307 88h12M307 97h12M307 106h12"/>
  <rect x="296" y="180" width="60" height="40" rx="5"/><path d="M312 188v8M340 188v8M326 220v22M318 242h16"/>
  <g stroke="#c8a04a"><circle cx="70" cy="214" r="5"/><circle cx="92" cy="214" r="5"/><path d="M114 208v12M126 208v12M138 208v12M150 208v12"/><path d="M114 220l4 8M126 220l4 8M138 220l4 8M150 220l4 8"/></g>
  <path d="M60 262c40-18 90 18 130 0s90-18 130 0" stroke="rgba(242,233,223,.55)"/>
</svg>
<span class="hot" style="left:37%;top:36%" aria-hidden="true">1</span><span class="hot" style="left:78%;top:31%" aria-hidden="true">2</span><span class="hot" style="left:81%;top:66%" aria-hidden="true">3</span><span class="hot" style="left:27%;top:72%" aria-hidden="true">4</span><span class="hot" style="left:47%;top:88%" aria-hidden="true">5</span>`;

/* ---------- logo band mini neon ---------- */
const biz = $('#bizNeon'); biz.parentElement.setAttribute('style', wallStyle('tile') + ';border:0'); mountNeon(biz, { lines: ['Your', 'logo'], font: 'shoreditch', colour: 'warm' }, { lit: true, fitW: .7, fitH: .6 });

/* ---------- day vs night ---------- */
const dn = designOf('home-sweet-home');
$('#dayTile').setAttribute('style', wallStyle('daylight')); $('#nightTile').setAttribute('style', wallStyle('plaster'));
mountNeon($('#dayTile .neon'), Object.assign({}, dn, { jacket: 'white' }), { lit: true, fitW: .5, fitH: .5 }).classList.add('off');
mountNeon($('#nightTile .neon'), dn, { lit: true, fitW: .5, fitH: .5, spill: .5 });

/* ---------- hanging methods + running costs ---------- */
$('#hangrow').innerHTML = [
  ['Wall screws', 'Through the acrylic on standoffs. The firmest fix, for plaster or brick.', '<path d="M8 10h40v24H8z"/><circle cx="14" cy="16" r="2"/><circle cx="42" cy="16" r="2"/><circle cx="14" cy="28" r="2"/><circle cx="42" cy="28" r="2"/>'],
  ['Chains', 'Two chains from hooks or a picture rail. Easy to move house with.', '<path d="M12 4v10M44 4v10"/><path d="M10 14h36v22H10z"/><path d="M12 4a2 2 0 1 0 0 .1M44 4a2 2 0 1 0 0 .1"/>'],
  ['Adhesive strips', 'No drilling, for lighter signs on smooth walls. Rented flat friendly.', '<path d="M8 12h40v22H8z"/><path d="M14 12v-4h10v4M32 12v-4h10v4" stroke-dasharray="2 2"/>'],
  ['Table stand', 'Freestanding on a shelf, bar or bedside table. Pick the stand backing.', '<path d="M10 6h36v24H10z"/><path d="M18 40h20l-3-10H21z"/>']
].map(([n, s, svg]) => `<div><svg viewBox="0 0 56 44" aria-hidden="true">${svg}</svg><b>${n}</b><span>${s}</span></div>`).join('');
const WATTS = { s: 6, m: 10, l: 16, xl: 24, xxl: 36 }; /* placeholder watts per size [CONFIRM] */
const RATE = 0.245; let costSize = 'm';
$('#costSize').innerHTML = SIZES.map(s => `<button class="chip" data-cost="${s.id}" aria-pressed="${s.id === costSize}">${esc(s.name)}</button>`).join('');
function cost() {
  const hrs = +$('#costHours').value, w = WATTS[costSize], year = w / 1000 * hrs * 365 * RATE;
  $('#costOut').innerHTML = `${gbp(Math.round(year * 100) / 100)}<small>a year, on ${hrs} hour${hrs === 1 ? '' : 's'} a day</small>`;
  $('#costHoursLbl').textContent = hrs; $('#costHours').style.setProperty('--pct', ((hrs - 1) / 23 * 100) + '%');
  $('#costDetail').innerHTML = `About <span class="mono">${w} W</span> for a ${byId(SIZES, costSize).name.toLowerCase()} sign, so roughly ${(year / 12 * 100).toFixed(0)}p a month.`;
  $$('#costSize .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cost === costSize)));
}
$('#costSize').addEventListener('click', e => { const b = e.target.closest('[data-cost]'); if (!b) return; costSize = b.dataset.cost; cost(); });
$('#costHours').addEventListener('input', cost); cost();

/* ---------- FAQ: top 10 in 3 tabs ---------- */
const FAQ = [
  ['Ordering and design', [
    ['How long does it take?', '7 to 10 working days from your order to your doorstep, and you see the dates before you pay. We skip weekends and UK bank holidays, and we tell you if Christmas is going to get in the way.'],
    ['Will I see it before you make it?', 'Always. Within 12 hours of ordering you get a proof drawing with every measurement marked, like the sheet in How it works. Nothing is cut until you say yes, and changes at this stage are free.'],
    ['What can\'t you put on a sign?', 'Emoji and most symbols, because there is no tube shape for them yet. Letters, numbers and the usual punctuation are all fine, and you can add one of our drawn symbols above your words. Anything over 2 m wide is quoted rather than priced in the builder.'],
    ['Can I change my mind?', 'Free until you approve the proof. After that your sign is being made to your words, so the usual change-of-mind rules for personalised goods apply. If it arrives faulty or damaged, we repair or remake it.']
  ]],
  ['Delivery and returns', [
    ['Where do you deliver?', 'Across mainland GB, free and tracked. We can\'t reach Northern Ireland or the Highlands and Islands yet; message us on WhatsApp and we\'ll see what\'s possible.'],
    ['Can I return it?', 'Ready-made designs: yes, within 14 days, unused. Custom signs are made to your words, so they can\'t be returned for a change of mind, which is exactly why you approve a drawing first. Faulty or damaged signs are always put right under the Consumer Rights Act.'],
    ['What does the warranty cover?', 'Two years on the sign, the power supply, the dimmer and the remote. If a fault is ours, we repair or remake it. Your statutory rights are not affected.']
  ]],
  ['Fitting and care', [
    ['Does it plug into a normal socket?', 'Yes. Every sign comes with a UK 3-pin plug and a low-voltage power supply, so it stays cool to the touch. The dimmer and remote are in the box too.'],
    ['How do I hang it?', 'Wall screws on standoffs, chains, adhesive strips, or a table stand if you chose that backing. The fixings for your method are included, and the proof drawing shows where the holes go.'],
    ['Can it go outside?', 'Not from the builder yet. We\'re testing a weatherproof build, so for now outdoor signs are quoted by hand and drawn to suit the spot. Pick "Outdoors" in the builder and we\'ll take it from there.']
  ]]
];
$('#faqTabs').innerHTML = FAQ.map(([t], i) => `<button role="tab" id="faqtab${i}" aria-selected="${i === 0}" aria-controls="faqpanel${i}" tabindex="${i === 0 ? 0 : -1}">${t}</button>`).join('');
$('#faqPanels').innerHTML = FAQ.map(([, qs], i) => `<div class="acc" role="tabpanel" id="faqpanel${i}" aria-labelledby="faqtab${i}"${i ? ' hidden' : ''}>${qs.map(([q, a], j) => `<details${j === 0 ? ' open' : ''}><summary>${esc(q)}</summary><div class="body"><p>${esc(a)}</p></div></details>`).join('')}</div>`).join('');
function selectTab(i) { $$('#faqTabs [role="tab"]').forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; }); $$('#faqPanels [role="tabpanel"]').forEach((p, k) => p.hidden = k !== i); }
$('#faqTabs').addEventListener('click', e => { const t = e.target.closest('[role="tab"]'); if (t) selectTab(+t.id.slice(6)); });
$('#faqTabs').addEventListener('keydown', e => { const tabs = $$('#faqTabs [role="tab"]'), i = tabs.indexOf(document.activeElement); if (i < 0) return; let n = i; if (e.key === 'ArrowRight') n = (i + 1) % tabs.length; else if (e.key === 'ArrowLeft') n = (i + tabs.length - 1) % tabs.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = tabs.length - 1; else return; e.preventDefault(); selectTab(n); tabs[n].focus(); });

/* ---------- save + email ---------- */
$('#saveForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#saveEmail'); if (!v.value || !v.checkValidity()) { v.focus(); toast('Enter an email address and we\'ll send the design.'); return; } v.value = ''; toast(`Prototype: in the live store we email "${hero.text.trim() || 'After dark'}" to you, lit.`); });

/* ---------- boot ---------- */
drawHero(false); bestPrices();
LN.initStrikes();
const refresh = () => { LN.refitAll(); drawHero(false); bestPrices(); };
LN.ensureFonts().then(refresh);
document.fonts.addEventListener('loadingdone', refresh);
let rt = 0; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { LN.refitAll(); howSheet(); sizeGuide(); }, 120); });
};

/* =====================================================================
   Builder (create.html): After Dark builder + live proof drawing. Every rule from the core.
   ===================================================================== */
LN.initBuilder = function () {
"use strict";
const { $, $$, L, byId, gbp, gbp2, esc, fontOf, colourOf, uiHex, SIZES, BACKINGS, BOARDS, USES, JACKETS, HANGS, MAXLINES, MAXLINE, EXCLUDED_MSG, measure, metricsFor, dimsFor, priceFor, addOf, promoLive, promoFor, promoLine, deliveryText, postcode, cleanText, decodeDesign, encodeDesign, setRoom, toast } = LN;
const BACKING_ICONS = {
  cut: '<svg viewBox="0 0 44 30" fill="none"><path d="M6 19c0-6 4-11 9-11 3 0 4 3 7 3s5-4 9-4 7 4 7 9-3 8-8 8H13c-4 0-7-2-7-5Z" stroke="currentColor" stroke-width="1.4"/><path d="M12 18c2-5 5-6 6-2s4 3 6-1 5-2 6 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  rect: '<svg viewBox="0 0 44 30" fill="none"><rect x="4" y="5" width="36" height="20" rx="2" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="9" r="1.2" fill="currentColor"/><circle cx="36" cy="9" r="1.2" fill="currentColor"/><circle cx="8" cy="21" r="1.2" fill="currentColor"/><circle cx="36" cy="21" r="1.2" fill="currentColor"/><path d="M12 17c2-5 5-6 6-2s4 3 6-1 5-2 6 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  stand: '<svg viewBox="0 0 44 30" fill="none"><rect x="6" y="3" width="32" height="18" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M12 27h20l-3-6H15l-3 6Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M13 14c2-5 5-6 6-2s4 3 6-1 5-2 6 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
};
const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>';
const DEFAULT = { text: "Let's stay in", align: 'center', font: 'soho', colour: 'pink', jacket: 'white', size: 'm', backing: 'cut', board: 'clear', use: 'in', hang: 'screws', icon: '' };
const q = new URLSearchParams(location.search);
const intent = location.hash; /* read before the first update() replaces the hash with the design state */
let st = Object.assign({}, DEFAULT, decodeDesign());
if (q.get('text')) st.text = q.get('text').slice(0, 80);
const stage = LN.Stage.mount($('#stage'), { scene: q.get('scene') || 'velvet' }); const view = stage.view;
const wrap = $('#stagewrap'), words = $('#words'); let spec = false;

/* ---------- design maths ---------- */
function current() {
  const n = cleanText(st.text);
  const hasText = n.lines.length > 0 || !!st.icon;
  const Ls = n.lines.length ? n.lines : (st.icon ? [] : ['Your words']);
  const f = fontOf(st.font), c = colourOf(st.colour);
  const m = measure(f, Ls, st.align, st.icon), mm = metricsFor(f, Ls, st.align, st.icon);
  return { n, Ls, f, c, m, mm, d: dimsFor(st.size, m, st.backing), dp: mm ? dimsFor(st.size, mm, st.backing) : null, hasText, bk: byId(BACKINGS, st.backing), bd: byId(BOARDS, st.board) };
}
function priceState(cur) {
  if (!cur.hasText) return { kind: 'empty' };
  if (cur.n.bad.length) return { kind: 'bad' };
  if (st.use === 'out') return { kind: 'quote', reason: 'outdoor' };
  const p = priceFor(cur.dp, st);
  if (p.quote && p.reason === 'no-dimensions') return { kind: 'wait' };
  if (p.quote) return { kind: 'quote', reason: p.reason, total: p.total };
  return { kind: 'price', total: p.total, promo: promoLive() ? promoFor(p.total) : null };
}
function writeHash() { try { history.replaceState(null, '', encodeDesign(st)); } catch (e) {} }
function sizeLabel(sizeId, cur) {
  if (st.use === 'out') return 'Quote';
  if (!cur.mm) return '…';
  const p = priceFor(dimsFor(sizeId, cur.mm, st.backing), st);
  if (p.quote) return p.reason === 'too-wide' ? 'Over 2 m, quote' : 'Quote';
  return gbp(p.total) + (promoLive() ? `<small>${gbp(promoFor(p.total))} launch</small>` : '');
}

/* ---------- panel ---------- */
/* Bring a step's heading into view in whichever box really scrolls: the panel's own .scroll pane on desktop
   (body.create is overflow:hidden there), the window on mobile. The heading lands just below anything stuck
   above it (on mobile the preview and the step tabs). Used by the step tabs and by #step= deep links. */
function goToStep(id, smooth) {
  const sec = document.getElementById(id); if (!sec) return false;
  const pane = $('#scroll'), behavior = smooth && !LN.reduced ? 'smooth' : 'instant', GAP = 8;
  if (/auto|scroll/.test(getComputedStyle(pane).overflowY)) {
    pane.scrollTo({ top: pane.scrollTop + sec.getBoundingClientRect().top - pane.getBoundingClientRect().top - GAP, behavior });
  } else {
    const stuck = [wrap, $('#ptabs')].reduce((low, el) => { const cs = getComputedStyle(el);
      return cs.position === 'sticky' && cs.display !== 'none' ? Math.max(low, (parseFloat(cs.top) || 0) + el.offsetHeight) : low; }, 0);
    scrollTo({ top: scrollY + sec.getBoundingClientRect().top - stuck - GAP, behavior });
  }
  return true;
}
function pressGroup(container, attr, value) { container.querySelectorAll(`[${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === value))); }
function buildPanel() {
  $('#fonts').innerHTML = LN.FONTS.map(f => `<button class="ft" data-font="${f.id}" aria-pressed="false"><span class="pv" style="font-family:'${f.family}';font-weight:${f.weight || 400}"></span><span class="nm">${esc(f.name)}</span></button>`).join('');
  $('#colours').innerHTML = LN.COLOURS.map(c => `<button class="cs${c.rgb ? ' rgbsw' : ''}" data-colour="${c.id}" aria-pressed="false" aria-label="${esc(c.name)}" style="--c:${c.hex}"><span class="ball"></span></button>`).join('');
  $('#jacket').innerHTML = JACKETS.map(j => `<button data-jacket="${j.id}" aria-pressed="false">${j.name}<small>${j.sub}</small></button>`).join('');
  $('#sizes').innerHTML = SIZES.map(s => `<button class="sz" data-size="${s.id}" aria-pressed="false"><span class="nm">${esc(s.name)}</span><span class="dm"></span><span class="pr"></span></button>`).join('');
  $('#backings').innerHTML = BACKINGS.map(b => `<button class="opt" data-backing="${b.id}" aria-pressed="false">${BACKING_ICONS[b.id]}<span><span class="nm">${esc(b.name)}</span><span class="ds">${esc(b.desc)}</span></span><span class="pr">${addOf('backing', b.id) ? '+' + gbp(addOf('backing', b.id)) : 'Included'}</span></button>`).join('');
  $('#boards').innerHTML = BOARDS.map(b => `<button class="bd" data-board="${b.id}" aria-pressed="false"><i style="--b:${b.swatch}"></i>${esc(b.name)}${addOf('finish', b.id) ? ` <small>+${gbp(addOf('finish', b.id))}</small>` : ''}</button>`).join('');
  $('#use').innerHTML = USES.map(u => `<button data-use="${u.id}" aria-pressed="false">${u.name}<small>${u.sub}</small></button>`).join('');
  $('#hang').innerHTML = HANGS.map(h => `<button data-hang="${h.id}" aria-pressed="false">${h.name}<small>${h.sub}</small></button>`).join('');
  $('#hangNote').innerHTML = 'Fixings for your method are in the box. Which kits we include <span class="cf">[CONFIRM]</span>';
  $('#included').innerHTML = ['Dimmer & remote included', 'UK plug, fixed', '2-year warranty', 'Free mainland GB delivery'].map(t => `<span class="badge">${check}${t}</span>`).join('');
  $('#symbols').insertAdjacentHTML('beforeend', `<button class="sym none" data-icon="" aria-pressed="true">None</button>` + Object.keys(L.icons).map(k => `<button class="sym" data-icon="${k}" aria-pressed="false" aria-label="${k}"><svg viewBox="0 0 24 24"><path d="${L.icons[k]}"/></svg></button>`).join(''));
  $('#scenes').innerHTML = Object.entries(stage.SCENES).map(([id, s]) => id === 'own'
    ? `<button class="schip upload" data-scene="own" aria-pressed="false"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 8"/></svg>Your wall</button>`
    : `<button class="schip" data-scene="${id}" aria-pressed="false"><span class="sw" style="--sw:${s.sw}"></span>${s.name}</button>`).join('');
  $('#ptabs').innerHTML = [['s-words', 'Words'], ['s-font', 'Lettering'], ['s-colour', 'Colour'], ['s-size', 'Size'], ['s-backing', 'Backing'], ['s-extras', 'Extras'], ['s-review', 'Review']].map(([id, n], i) => `<button role="tab" data-tab="${id}" aria-current="${i === 0}">${n}</button>`).join('');
  $('#protoNote').textContent = 'Prototype. Prices, wattage and the hanging kits are placeholders until the workshop confirms them. Nothing here is sent anywhere.';
  const bind = (sel, key, opts = {}) => $(sel).addEventListener('click', e => { const b = e.target.closest(`[data-${key}]`); if (!b || b.disabled) return; st[key] = b.dataset[key]; if (opts.flick) stage.strike(); update(); });
  bind('#fonts', 'font', { flick: true }); bind('#colours', 'colour', { flick: true }); bind('#jacket', 'jacket'); bind('#sizes', 'size'); bind('#backings', 'backing'); bind('#boards', 'board');
  bind('#use', 'use'); bind('#hang', 'hang'); bind('#symbols', 'icon');
  $('.align').addEventListener('click', e => { const b = e.target.closest('[data-align]'); if (!b) return; st.align = b.dataset.align; update(); });
  words.value = st.text;
  words.addEventListener('input', () => {
    let Ls = words.value.replace(/\r/g, '').split('\n'); let changed = false;
    if (Ls.length > MAXLINES) { Ls = Ls.slice(0, MAXLINES); changed = true; }
    Ls = Ls.map(l => { const ch = Array.from(l); if (ch.length > MAXLINE) { changed = true; return ch.slice(0, MAXLINE).join(''); } return l; });
    if (changed) { const pos = words.selectionStart; words.value = Ls.join('\n'); words.selectionStart = words.selectionEnd = Math.min(pos, words.value.length); }
    st.text = words.value; update();
  });
  $('#ptabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) goToStep(b.dataset.tab, true); });
  if ('IntersectionObserver' in window) {
    const tio = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) $$('#ptabs [data-tab]').forEach(t => t.setAttribute('aria-current', String(t.dataset.tab === e.target.id))); }); }, { rootMargin: '-45% 0px -50% 0px' });
    $$('.pstep').forEach(s => tio.observe(s));
  }
}

/* ---------- update ---------- */
function update() {
  const cur = current(), { Ls, m, d, c, bk, bd } = cur;
  document.documentElement.style.setProperty('--spill', view.on ? (view.night ? .16 : .07) : 0);
  if (view.on) setRoom(uiHex(c));
  pressGroup($('#fonts'), 'data-font', st.font); pressGroup($('#colours'), 'data-colour', st.colour); pressGroup($('#jacket'), 'data-jacket', st.jacket); pressGroup($('#sizes'), 'data-size', st.size);
  pressGroup($('#backings'), 'data-backing', st.backing); pressGroup($('#boards'), 'data-board', st.board); pressGroup($('#use'), 'data-use', st.use); pressGroup($('#hang'), 'data-hang', st.hang);
  pressGroup($('.align'), 'data-align', st.align); pressGroup($('#symbols'), 'data-icon', st.icon || '');
  const first = (Ls.find(l => l.trim()) || 'Your words').slice(0, 16);
  $$('.ft').forEach(b => { const f = fontOf(b.dataset.font), el = b.querySelector('.pv'); el.textContent = cur.n.lines.length ? first : 'Your words'; const cap = measure(f, ['H'], 'left').cap; el.style.fontSize = Math.max(18, Math.min(34, 15.5 / cap)) + 'px'; });
  $('#cName').textContent = c.name; $('#cNote').textContent = c.rgb ? 'Remote picks colours and effects, +25%' : byId(JACKETS, st.jacket).sub;
  $$('.sz').forEach(b => {
    const dd = dimsFor(b.dataset.size, m, st.backing);
    b.querySelector('.dm').innerHTML = `${dd.W} × ${dd.H} cm <small>(${LN.inches(dd.W)} × ${LN.inches(dd.H)} in)</small>`;
    const label = cur.hasText && !cur.n.bad.length ? sizeLabel(b.dataset.size, cur) : '';
    b.querySelector('.pr').innerHTML = label; b.classList.toggle('quote', /quote/i.test(label));
  });
  $('#counter').textContent = `Longest line ${Math.max(0, ...st.text.split('\n').map(l => Array.from(l).length))} of ${MAXLINE} characters`;
  const warn = $('#wordsWarn'), bad = cur.n.bad;
  const warnIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
  if (bad.length) { warn.hidden = false; warn.innerHTML = `${warnIcon}<span>We can't draw ${bad.map(ch => `<b>${esc(ch)}</b>`).join(' ')} in neon tube yet. Letters, numbers and the usual punctuation are all fine, or add one of the symbols below.</span>`; }
  else if (cur.n.truncated) { warn.hidden = false; warn.innerHTML = `${warnIcon}<span>We kept the first three lines and 24 characters a line. That's as much as one sign can hold.</span>`; }
  else { warn.hidden = true; warn.textContent = ''; }
  words.setAttribute('aria-invalid', String(bad.length > 0));
  $('#hangWrap').hidden = st.backing === 'stand';
  /* price, promo, quote */
  const ps = priceState(cur), priceEl = $('#price'), promoEl = $('#promo'), kl = $('#klarna'), addBtn = $('#addBtn'), qb = $('#quoteBox'), buy = $('#buyrow');
  buy.hidden = ps.kind === 'quote'; qb.hidden = ps.kind !== 'quote'; promoEl.textContent = '';
  if (ps.kind === 'empty') { priceEl.textContent = '£ –'; kl.textContent = 'Type your words to see a price.'; addBtn.disabled = true; }
  else if (ps.kind === 'bad') { priceEl.textContent = '£ –'; kl.textContent = 'Remove the characters we can\'t draw to see a price.'; addBtn.disabled = true; }
  else if (ps.kind === 'wait') { priceEl.innerHTML = '<span class="wait">working out your price…</span>'; kl.textContent = 'Loading the lettering so the measurements are exact.'; addBtn.disabled = true; }
  else if (ps.kind === 'quote') {
    $('#quoteWhy').textContent = ps.reason === 'too-wide' ? `At ${d.W} cm wide this is over 2 m, so a designer draws it by hand and prices it for you. The mockup is free and arrives within 12 hours.`
      : ps.reason === 'outdoor' ? 'Outdoor and weatherproof signs are built to suit the spot, so we quote them rather than price them here. Free mockup within 12 hours.'
      : 'This one comes to more than £1,500, so a designer prices it by hand. Free mockup within 12 hours.';
    addBtn.disabled = true;
  } else {
    priceEl.innerHTML = ps.promo != null ? `<span class="was">${gbp(ps.total)}</span>${gbp(ps.promo)}` : gbp(ps.total);
    promoEl.innerHTML = ps.promo != null ? `${esc(promoLine(ps.total))} <span class="sample">sample date</span>` : '';
    kl.innerHTML = `or 3 payments of <b>${gbp2((ps.promo ?? ps.total) / 3)}</b> with Klarna or Clearpay`;
    addBtn.disabled = false;
  }
  $$('[data-meta]').forEach(el => el.innerHTML = `
    <p><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/></svg><span>Arrives ${deliveryText()} with free mainland GB delivery</span></p>
    <p><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4"/><path d="m8 15 2.5 2.5L16 12"/></svg><span>You approve the proof drawing within 12 hours, before we make anything</span></p>`);
  /* review */
  const sheetSpec = { lines: cur.n.lines, align: st.align, f: cur.f, c, m, d, bk, bd, icon: st.icon || '', jacket: st.jacket, use: st.use, hang: st.hang, letterCm: byId(SIZES, st.size).letter };
  LN.Sheet.render($('#miniSheet'), sheetSpec, { compact: true });
  wrap.classList.toggle('spec', spec); /* the sheet must be visible before it is measured and drawn */
  if (spec) LN.Sheet.render($('#stageSheet'), sheetSpec);
  const priceRow = ps.kind === 'price' ? (ps.promo != null ? `${gbp(ps.promo)} launch price (${gbp(ps.total)})` : gbp(ps.total)) : ps.kind === 'quote' ? 'Quoted by a designer' : ps.kind === 'wait' ? 'working out…' : '—';
  $('#specTable').innerHTML = `<table>
    <tr><td>Words</td><td class="ui">${esc(cur.n.lines.join(' / ') || (st.icon ? st.icon + ' symbol' : '—'))}${st.icon && cur.n.lines.length ? ` + ${st.icon}` : ''}</td></tr>
    <tr><td>Lettering</td><td class="ui">${esc(cur.f.name)}</td></tr>
    <tr><td>Colour</td><td class="ui">${esc(c.name)}, ${byId(JACKETS, st.jacket).name.toLowerCase()}</td></tr>
    <tr><td>Letter height</td><td>${byId(SIZES, st.size).letter} cm</td></tr>
    <tr><td>Overall</td><td>${d.W} × ${d.H} cm</td></tr>
    <tr><td>Backing</td><td class="ui">${esc(bk.name)}, ${bd.name.toLowerCase()}</td></tr>
    <tr><td>Hangs</td><td class="ui">${byId(USES, st.use).name}, ${st.backing === 'stand' ? 'on its stand' : byId(HANGS, st.hang).name.toLowerCase()}</td></tr>
    <tr><td>Power</td><td class="ui">12 V supply <span class="cf">[CONFIRM]</span>, UK plug, dimmer and remote</td></tr>
    <tr><td>Price</td><td class="ui">${priceRow}</td></tr></table>`;
  $('#delivWhen').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/></svg><span>Order today and it arrives <b>${deliveryText()}</b>. That's 7 to 10 working days, skipping weekends and bank holidays.</span>`;
  render(); writeHash();
}
function render() {
  const cur = current();
  stage.render({ lines: cur.Ls, align: st.align, font: cur.f, colour: cur.c, m: cur.m, d: cur.d, backing: cur.bk, board: cur.bd, icon: st.icon || null, jacket: st.jacket, placeholder: !cur.hasText });
  const pw = $('#btnPower'); pw.setAttribute('aria-pressed', String(view.on)); pw.querySelector('.lbl').textContent = view.on ? 'Sign on' : 'Sign off';
  const rm = $('#btnRoom'); rm.setAttribute('aria-pressed', String(view.night)); rm.querySelector('.lbl').textContent = view.night ? 'Evening' : 'Daytime';
  rm.querySelector('svg').innerHTML = view.night ? '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>' : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  pressGroup($('.sseg'), 'data-view', spec ? 'spec' : view.mode); $('#btnDims').setAttribute('aria-pressed', String(view.dims)); pressGroup($('#scenes'), 'data-scene', view.scene);
  [pw, rm, $('#btnDims'), $('#btnAR')].forEach(b => b.hidden = spec);
  wrap.classList.toggle('spec', spec);
}

/* ---------- stage controls ---------- */
$('#btnPower').addEventListener('click', () => { view.on = !view.on; update(); if (view.on) stage.strike(); });
$('#btnRoom').addEventListener('click', () => { view.night = !view.night; update(); });
$('#btnDims').addEventListener('click', () => { view.dims = !view.dims; render(); });
$('.sseg').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; spec = b.dataset.view === 'spec'; if (!spec) view.mode = b.dataset.view; update(); });
$('#scenes').addEventListener('click', e => { const b = e.target.closest('[data-scene]'); if (!b) return; if (b.dataset.scene === 'own') { $('#ownWall').click(); return; } view.scene = b.dataset.scene; render(); });
$('#ownWall').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; stage.setOwnWall(f); render(); toast('Your photo stays on this device. It is never uploaded.'); });

/* ---------- postcode check ---------- */
function checkPostcode() {
  const raw = $('#pcode').value.trim(), msg = $('#pmsg'); msg.className = 'pmsg';
  if (!raw) { msg.classList.add('hint'); msg.textContent = 'Free delivery across mainland GB. Check your postcode before you order.'; return; }
  const s = postcode(raw);
  if (s === 'invalid') { msg.classList.add('bad'); msg.textContent = 'That doesn\'t look like a UK postcode. Try the format SW1A 1AA.'; }
  else if (s === 'excluded') { msg.classList.add('bad'); msg.textContent = EXCLUDED_MSG; }
  else { msg.classList.add('ok'); msg.textContent = `Good news: free delivery to ${raw.toUpperCase()}, arriving ${deliveryText()}.`; }
}
$('#pcodeBtn').addEventListener('click', checkPostcode);
$('#pcode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); checkPostcode(); } });

/* ---------- share / email / gift ---------- */
async function copy(url, okMsg) {
  try { await navigator.clipboard.writeText(url); toast(okMsg); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (_) {} ta.remove(); toast(ok ? okMsg : 'Copy the link from your address bar to share this design.'); }
}
$$('[data-share]').forEach(b => b.addEventListener('click', () => { writeHash(); copy(location.href, 'Design link copied. Anyone with the link sees this exact sign.'); }));
$$('[data-gift]').forEach(b => b.addEventListener('click', () => { writeHash(); copy(location.href.replace('create.html', 'gift.html'), 'Gift link copied. It opens the lit sign with your message and no prices (page comes with the live store).'); }));
$$('[data-email]').forEach(b => b.addEventListener('click', () => { const form = $('#emailForm'); if (innerWidth <= 900) { const e = prompt('Email address for your design'); if (e) toast(`Prototype: in the live store we email the design to ${e}.`); return; } form.hidden = !form.hidden; if (!form.hidden) $('#emailIn').focus(); }));
$('#emailForm').addEventListener('submit', e => { e.preventDefault(); const v = $('#emailIn').value; e.target.hidden = true; toast(`Prototype: in the live store we email the design to ${v}.`); });

/* ---------- basket ---------- */
$('#addBtn').addEventListener('click', () => {
  const cur = current(), ps = priceState(cur); if (ps.kind !== 'price') return;
  LN.addToBasket({ kind: 'custom', name: cur.n.lines.join(' ') || 'Symbol sign', lines: cur.n.lines.slice(), align: st.align, icon: st.icon || null, font: st.font, colour: st.colour, jacket: st.jacket, size: st.size, backing: st.backing, board: st.board, use: st.use, hang: st.hang, W: cur.dp.W, H: cur.dp.H, price: ps.total, promo: ps.promo });
});

/* ---------- quote / logo modal ---------- */
const modal = $('#logoModal'); let lastFocus = null;
function openModal(kind) {
  const t = $('#lTitle'), l = $('#lLede'), n = $('#lNotes'), s = $('#lSubmit');
  if (kind === 'bulk') { t.textContent = 'Bulk quote'; l.textContent = 'Several signs, or one for every branch? Tell us how many, where they go and when you need them. A designer comes back with a mockup and a price within 12 hours.'; s.textContent = 'Request bulk quote'; }
  else if (kind === 'quote') { const cur = current(); t.textContent = 'Get a free quote'; l.textContent = 'A designer draws this one by hand, mockup and price within 12 hours. Your design is attached already.'; s.textContent = 'Request free quote'; n.value = `${cur.n.lines.join(' / ')} · ${cur.f.name} · ${cur.c.name} · about ${cur.d.W} × ${cur.d.H} cm · ${st.use === 'out' ? 'outdoors' : 'indoors'}`; }
  else { t.textContent = 'Your logo in neon'; l.textContent = 'Send your logo or artwork. A designer redraws it in neon and emails you a free mockup and price within 12 hours.'; s.textContent = 'Request free mockup'; }
  lastFocus = document.activeElement; modal.hidden = false; modal.querySelector('input[type=email]').focus();
}
function closeModal() { modal.hidden = true; if (lastFocus) lastFocus.focus(); }
$('#logoBtn').addEventListener('click', () => openModal('logo'));
$('#quoteBtn').addEventListener('click', () => openModal('quote'));
modal.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
$('#logoFile').addEventListener('change', e => { const f = e.target.files[0]; $('#logoName').textContent = f ? f.name : 'PNG, JPG, SVG or PDF'; });
$('#logoForm').addEventListener('submit', e => { e.preventDefault(); closeModal(); toast('Prototype: request captured. In the live store a designer replies within 12 hours.'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

/* ---------- boot ---------- */
buildPanel(); update();
if (intent === '#logo') openModal('logo');
else if (intent === '#quote=bulk') openModal('bulk');
else if (intent.startsWith('#step=')) goToStep('s-' + intent.slice(6), false);
LN.ensureFonts().then(update);
document.fonts.addEventListener('loadingdone', update);
setTimeout(() => { view.on = true; update(); stage.strike(); }, LN.reduced ? 0 : 650);
};

/* =====================================================================
   Boot: which page are we on?
   ===================================================================== */
(() => {
  const run = () => { LN.mountChrome(); const page = document.body.dataset.page; if (page === 'home') LN.initHome(); else if (page === 'create') LN.initBuilder(); else { LN.initStrikes(); LN.ensureFonts(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
