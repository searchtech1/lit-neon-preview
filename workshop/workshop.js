/* Lit Neon — Workshop direction: shared engine.
   Measurement, sizing, pricing, neon rendering, basket, header/footer, toast.
   Everything that touches products reads window.LIT (shared/catalog.js). */
(() => {
"use strict";
const LIT = window.LIT;
const WS = window.WS = {};

/* ---------- small helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
WS.$ = $; WS.$$ = $$;
WS.byId = (arr, id) => arr.find(x => x.id === id) || arr[0];
WS.gbp = n => '£' + Math.round(n).toLocaleString('en-GB');
WS.gbp2 = n => '£' + n.toLocaleString('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2});
WS.ceil5 = n => Math.ceil(n / 5) * 5;
WS.esc = s => String(s).replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
const hexToRgb = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
WS.rgba = (h, a) => { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; };
WS.mix = (h1, h2, t) => { const a = hexToRgb(h1), b = hexToRgb(h2); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
WS.reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
WS.cmToIn = cm => (cm / 2.54).toFixed(1);

/* ---------- catalogue ---------- */
WS.FONTS = LIT.fonts; WS.COLOURS = LIT.colours; WS.SIZES = LIT.sizes; WS.DESIGNS = LIT.designs; WS.CATS = LIT.categories; WS.ICONS = LIT.icons;
WS.BACKINGS = [
  {id: 'cut', name: 'Cut to shape', desc: 'Acrylic follows the outline of your letters', add: 0, margin: 2.5},
  {id: 'rect', name: 'Rectangle', desc: 'A clean panel on polished standoffs', add: 0, margin: 5},
  {id: 'stand', name: 'Table stand', desc: 'Freestanding, for shelves and counters', add: 20, margin: 5}
];
WS.BOARDS = [
  {id: 'clear', name: 'Clear', add: 0, swatch: 'linear-gradient(135deg,#f5f7f9,#dfe5ea)', fill: ['#ffffff', .08], edge: ['#ffffff', .5], rect: 'rgba(255,255,255,.07)', border: 'rgba(255,255,255,.42)'},
  {id: 'black', name: 'Black', add: 10, swatch: '#16171b', fill: ['#121316', .95], edge: ['#ffffff', .14], rect: 'rgba(18,19,22,.95)', border: 'rgba(255,255,255,.12)'},
  {id: 'white', name: 'White', add: 10, swatch: '#f6f6f4', fill: ['#f4f4f2', .95], edge: ['#000000', .08], rect: 'rgba(244,244,242,.96)', border: 'rgba(0,0,0,.08)'},
  {id: 'gold', name: 'Gold mirror', add: 25, swatch: 'linear-gradient(135deg,#8f7034,#f0d48b 45%,#9c7b3a 70%,#d9bb70)', fill: ['#b8954f', 1], edge: ['#f6dd9c', .9], rect: 'linear-gradient(135deg,#7d6230,#e2c47c 40%,#8d6f35 62%,#cfb067)', border: 'rgba(246,221,156,.6)'},
  {id: 'silver', name: 'Silver mirror', add: 25, swatch: 'linear-gradient(135deg,#8b9098,#f3f5f7 45%,#9298a1 70%,#d7dbe0)', fill: ['#a9aeb6', 1], edge: ['#f4f6f8', .9], rect: 'linear-gradient(135deg,#7f848c,#eef0f2 40%,#8b9099 62%,#cdd1d6)', border: 'rgba(244,246,248,.6)'}
];
WS.USES = [{id: 'in', name: 'Indoors', sub: 'Included', add: 0}, {id: 'out', name: 'Outdoors', sub: 'Weatherproof, +£30', add: 30}];
WS.PLUGS = [{id: 'uk', name: 'UK', sub: '3-pin'}, {id: 'eu', name: 'EU', sub: '2-pin'}, {id: 'us', name: 'US', sub: '2-pin'}, {id: 'au', name: 'AU', sub: '2-pin'}];
WS.PRODS = [{id: 'std', name: 'Standard', sub: '5 working days', days: 5, add: 0}, {id: 'exp', name: 'Express', sub: '2 working days, +£35', days: 2, add: 35}];
WS.MAXW = 210; WS.MAXLINES = 3; WS.MAXLINE = 24;
WS.ICON_LIST = [{id: '', name: 'None'}].concat(Object.keys(LIT.icons).map(k => ({id: k, name: k[0].toUpperCase() + k.slice(1)})));

/* ---------- measurement (canvas ink box, em units at 100px) ---------- */
const mctx = document.createElement('canvas').getContext('2d');
const mcache = new Map();
WS.clearMeasureCache = () => mcache.clear();
WS.measure = function (f, L, align = 'center') {
  const key = f.family + '|' + align + '|' + L.join('\n');
  if (mcache.has(key)) return mcache.get(key);
  mctx.font = `${f.weight || 400} 100px "${f.family}"`;
  let loaded = true; try { loaded = document.fonts.check(mctx.font); } catch (e) {}
  const LH = 115;
  const cap = mctx.measureText('H').actualBoundingBoxAscent || 70;
  const fm = mctx.measureText('Hgy');
  const fA = fm.fontBoundingBoxAscent || 92, fD = fm.fontBoundingBoxDescent || 28;
  const half = (LH - (fA + fD)) / 2;
  const ms = L.map(t => mctx.measureText(t));
  const blockW = Math.max(1, ...ms.map(m => m.width));
  let minX = Infinity, maxX = -Infinity, top = Infinity, bot = -Infinity;
  const baselines = [];
  ms.forEach((m, i) => {
    const base = i * LH + half + fA; baselines.push(base / 100);
    if (!L[i].trim()) return;
    const x0 = align === 'left' ? 0 : align === 'right' ? blockW - m.width : (blockW - m.width) / 2;
    minX = Math.min(minX, x0 - m.actualBoundingBoxLeft);
    maxX = Math.max(maxX, x0 + m.actualBoundingBoxRight);
    top = Math.min(top, base - m.actualBoundingBoxAscent);
    bot = Math.max(bot, base + m.actualBoundingBoxDescent);
  });
  if (!isFinite(minX)) { minX = 0; maxX = 100; top = half; bot = half + 70; }
  const blockH = L.length * LH;
  const r = {
    cap: cap / 100, fA: fA / 100, fD: fD / 100, lh: LH / 100,
    blockW: blockW / 100, blockH: blockH / 100,
    minX: minX / 100, maxX: maxX / 100, top: top / 100, bot: bot / 100,
    inkW: (maxX - minX) / 100, inkH: (bot - top) / 100,
    offX: (blockW / 2 - (minX + maxX) / 2) / 100,
    offY: (blockH / 2 - (top + bot) / 2) / 100,
    baselines, lineWidths: ms.map(m => m.width / 100)
  };
  if (loaded) mcache.set(key, r); // never cache a fallback-font measurement
  return r;
};

/* A "design" here = {lines, font(id), colour(id), icon(key|''), align}. Geometry in em of the lettering font. */
WS.geom = function (dz) {
  const f = WS.byId(WS.FONTS, dz.font);
  const L = dz.lines && dz.lines.length ? dz.lines : [];
  const hasText = L.some(l => l.trim());
  const m = hasText ? WS.measure(f, L, dz.align || 'center') : null;
  const cap = m ? m.cap : .7;
  const icon = dz.icon && LIT.icons[dz.icon] ? dz.icon : '';
  const iconH = icon ? (hasText ? cap * 1.55 : 1) : 0, iconW = iconH;
  const gap = icon && hasText ? cap * .45 : 0;
  const inkW = (m ? m.inkW : 0) + iconW + gap, inkH = Math.max(m ? m.inkH : 0, iconH);
  return {f, m, L, hasText, icon, iconW, iconH, gap, inkW, inkH, cap};
};

/* Real-world size for a size id. For text: letter height = cap height. Icon-only: medium = widthCm. */
WS.dimsFor = function (dz, sizeId, backingId = 'cut') {
  const g = WS.geom(dz), sz = WS.byId(WS.SIZES, sizeId), mg = WS.byId(WS.BACKINGS, backingId).margin;
  let emcm; // cm per em
  if (g.hasText) emcm = sz.letterCm / g.cap;
  else emcm = ((dz.widthCm || 40) * (sz.letterCm / 10) - 2 * mg) / Math.max(g.inkW, .01);
  const W = Math.round(g.inkW * emcm + 2 * mg), H = Math.round(g.inkH * emcm + 2 * mg);
  return {W, H, emcm, ok: W <= WS.MAXW, letterCm: g.hasText ? sz.letterCm : null, g};
};

/* Price formula (placeholder, same as v1). */
WS.priceFor = function (d, s) {
  let base = 25 + d.W * 1.0 + d.H * 1.6;
  if (WS.byId(WS.COLOURS, s.colour).rgb) base *= 1.25;
  let p = WS.ceil5(base) + WS.byId(WS.BACKINGS, s.backing || 'cut').add + WS.byId(WS.BOARDS, s.board || 'clear').add + WS.byId(WS.USES, s.use || 'in').add + WS.byId(WS.PRODS, s.prod || 'std').add;
  return Math.max(70, p);
};

/* Estimated LED flex length: ink area / stroke width, measured from the drawing itself. Returns metres. */
const fcache = new Map();
const fctx = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
let iconPath = null;
WS.flexMetres = function (dz, emcm) {
  const g = WS.geom(dz);
  let emLen = 0; // tube length in em
  if (g.hasText) {
    const key = g.f.family + '|' + g.L.join('\n');
    if (!fcache.has(key)) {
      const S = 120;
      const W = Math.ceil(g.m.inkW * S) + 40, H = Math.ceil(g.m.blockH * S) + 40;
      fctx.canvas.width = W; fctx.canvas.height = H; // resizing resets the context, so set the font after
      fctx.font = `${g.f.weight || 400} ${S}px "${g.f.family}"`;
      fctx.clearRect(0, 0, W, H); fctx.fillStyle = '#000'; fctx.textBaseline = 'alphabetic';
      g.L.forEach((t, i) => fctx.fillText(t, 20 - g.m.minX * S + (dz.align === 'left' ? 0 : dz.align === 'right' ? (g.m.blockW - g.m.lineWidths[i]) * S : (g.m.blockW - g.m.lineWidths[i]) * S / 2), 20 + g.m.baselines[i] * S - g.m.top * S));
      const px = fctx.getImageData(0, 0, W, H).data;
      let area = 0; const runs = [];
      for (let y = 0; y < H; y++) {
        let run = 0;
        for (let x = 0; x < W; x++) {
          const on = px[(y * W + x) * 4 + 3] > 110;
          if (on) { area++; run++; } else if (run) { runs.push(run); run = 0; }
        }
        if (run) runs.push(run);
      }
      runs.sort((a, b) => a - b);
      const stroke = runs.length ? Math.max(2, runs[Math.floor(runs.length * .3)]) : 10;
      let loaded = true; try { loaded = document.fonts.check(fctx.font); } catch (e) {}
      if (loaded) fcache.set(key, area / stroke / S);
      emLen += area / stroke / S;
    } else emLen += fcache.get(key);
  }
  if (g.icon) {
    if (!iconPath) { iconPath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); }
    iconPath.setAttribute('d', LIT.icons[g.icon]);
    let len = 24; try { len = iconPath.getTotalLength(); } catch (e) {}
    emLen += len / 24 * g.iconH;
  }
  return Math.round(emLen * emcm) / 100; // metres, 2 dp
};

/* ---------- glow ---------- */
WS.glow = function (c) {
  const core = c.core || WS.mix(c.hex, '#ffffff', .72);
  return {core, shadow: `0 0 .02em ${core}, 0 0 .05em ${c.hex}, 0 0 .11em ${c.hex}, 0 0 .24em ${c.hex}, 0 0 .5em ${WS.rgba(c.hex, .75)}, 0 0 1em ${WS.rgba(c.hex, .45)}`,
    iconFilter: `drop-shadow(0 0 .04em ${c.hex}) drop-shadow(0 0 .12em ${c.hex}) drop-shadow(0 0 .3em ${WS.rgba(c.hex, .6)})`};
};

/* Render a sign into a stage box. opts: {dz, on, fit:{w,h} px | emPx, contour:{R, board}, align}
   Returns {emPx, w, h} in px. The sign is centred in the stage. */
WS.renderSign = function (stage, opts) {
  const dz = opts.dz, g = WS.geom(dz), c = WS.byId(WS.COLOURS, dz.colour);
  const on = opts.on !== false;
  let emPx = opts.emPx;
  if (!emPx) { const fit = opts.fit || {w: stage.clientWidth * .78, h: stage.clientHeight * .62}; emPx = Math.min(fit.w / Math.max(g.inkW, .01), fit.h / Math.max(g.inkH, .01), opts.maxEm || 1e9); }
  const w = g.inkW * emPx, h = g.inkH * emPx;
  let sign = stage.querySelector(':scope > .ws-sign');
  if (!sign) { sign = document.createElement('div'); sign.className = 'ws-sign'; stage.appendChild(sign); }
  sign.classList.toggle('off', !on);
  sign.classList.toggle('plain', !!opts.plain);
  sign.classList.toggle('rgb', !!c.rgb && !opts.plain);
  Object.assign(sign.style, {width: w + 'px', height: h + 'px', fontSize: emPx + 'px'});
  if (opts.pos) Object.assign(sign.style, {left: opts.pos.left + 'px', top: opts.pos.top + 'px', transform: 'none'});
  else Object.assign(sign.style, {left: '50%', top: '50%', transform: 'translate(-50%,-50%)'});
  const gl = WS.glow(c);
  const parts = [];
  const textLeft = (g.iconW + g.gap - (g.m ? g.m.minX : 0)), textTop = ((g.inkH - (g.m ? g.m.inkH : 0)) / 2 - (g.m ? g.m.top : 0));
  const iconTop = (g.inkH - g.iconH) / 2;
  const iconHtml = g.icon ? `<svg class="ws-ico" viewBox="0 0 24 24" style="left:0;top:${iconTop}em;width:${g.iconW}em;height:${g.iconH}em;color:${gl.core};filter:${on ? gl.iconFilter : 'none'}" aria-hidden="true"><path d="${LIT.icons[g.icon]}"/></svg>` : '';
  const textHtml = g.hasText ? `<span class="ws-tube" style="left:${textLeft}em;top:${textTop}em;width:${g.m.blockW}em;font-family:'${g.f.family}',cursive;font-weight:${g.f.weight || 400};text-align:${dz.align || 'center'};color:${gl.core};text-shadow:${on ? gl.shadow : 'none'}">${WS.esc(g.L.join('\n'))}</span>` : '';
  if (opts.contour) {
    // cut-to-shape acrylic: duplicate layer run through the contour filter
    const pad = opts.contour.pad;
    parts.push(`<div class="ws-contour" style="left:${-pad}px;top:${-pad}px;right:${-pad}px;bottom:${-pad}px;filter:url(#${opts.contour.filterId})${opts.contour.dim ? ' brightness(.62)' : ''}"><div style="position:absolute;left:${pad}px;top:${pad}px;width:${w}px;height:${h}px">
      ${g.icon ? `<svg class="ws-ico" viewBox="0 0 24 24" style="left:0;top:${iconTop}em;width:${g.iconW}em;height:${g.iconH}em;color:#fff;stroke-width:2.4" aria-hidden="true"><path d="${LIT.icons[g.icon]}"/></svg>` : ''}
      ${g.hasText ? `<span class="ws-tube" style="left:${textLeft}em;top:${textTop}em;width:${g.m.blockW}em;font-family:'${g.f.family}',cursive;font-weight:${g.f.weight || 400};text-align:${dz.align || 'center'};color:#fff">${WS.esc(g.L.join('\n'))}</span>` : ''}
    </div></div>`);
  }
  parts.push(iconHtml, textHtml);
  sign.innerHTML = parts.join('');
  stage.style.setProperty('--glow', c.rgb ? '#ff5fa2' : c.hex);
  return {emPx, w, h, g};
};

/* Design from a catalogue entry */
WS.designOf = d => ({lines: d.lines.slice(), font: d.font, colour: d.colour, icon: d.icon || '', align: 'center', widthCm: d.widthCm, id: d.id});

/* ---------- delivery ---------- */
const BH = new Set(LIT.bankHolidays);
const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isWorking = d => d.getDay() !== 0 && d.getDay() !== 6 && !BH.has(isoLocal(d));
WS.addWorkingDays = (from, n) => { const d = new Date(from); while (n > 0) { d.setDate(d.getDate() + 1); if (isWorking(d)) n--; } return d; };
WS.arrival = function (days = 5) {
  const now = new Date();
  const late = (now.getHours() >= 14 || !isWorking(now)) ? 1 : 0;
  const a = WS.addWorkingDays(now, days + late + 1), b = WS.addWorkingDays(now, days + late + 2);
  const f = (d, withMonth) => d.toLocaleDateString('en-GB', withMonth ? {weekday: 'short', day: 'numeric', month: 'short'} : {weekday: 'short', day: 'numeric'});
  return a.getMonth() === b.getMonth() ? `${f(a, false)} to ${f(b, true)}` : `${f(a, true)} to ${f(b, true)}`;
};
WS.orderBy = () => { const now = new Date(); return (now.getHours() >= 14 || !isWorking(now)) ? 'Order by 2pm on the next working day' : 'Order by 2pm today'; };

/* ---------- share-link state codec (builder state in the URL hash) ---------- */
WS.b64e = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
WS.b64d = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));
WS.builderLink = st => 'create.html#d=' + WS.b64e(JSON.stringify(st));

/* ---------- wall textures (shared with the builder) ---------- */
const NOISE = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='260' height='260'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .5 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>")}")`;
const NOISE_SOFT = NOISE.replace('.5 0', '.16 0');
const BRICK = (() => {
  const bw = 21.5, bh = 6.5, m = 1, cols = 4, rows = 4, W = cols * (bw + m), H = rows * (bh + m);
  const shades = ['#7b4836', '#86523c', '#6e4131', '#91593f', '#774535', '#9b6345', '#6a3e2f', '#835040', '#a06a4b'];
  let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const grid = Array.from({length: rows}, () => Array.from({length: cols}, () => shades[Math.floor(rnd() * shades.length)]));
  let s = `<svg xmlns='http://www.w3.org/2000/svg' width='${W * 10}' height='${H * 10}' viewBox='0 0 ${W} ${H}'><rect width='100%' height='100%' fill='#b9ad9c'/>`;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? (bw + m) / 2 : 0;
    for (let c = -1; c <= cols; c++) {
      const x = c * (bw + m) + off + m / 2, y = r * (bh + m) + m / 2;
      const col = grid[r][((c % cols) + cols) % cols];
      s += `<rect x='${x.toFixed(2)}' y='${y}' width='${bw}' height='${bh}' rx='.5' fill='${col}'/>`;
      s += `<rect x='${x.toFixed(2)}' y='${y}' width='${bw}' height='1.2' fill='rgba(255,255,255,.06)'/>`;
    }
  }
  return {url: `url("data:image/svg+xml,${encodeURIComponent(s + '</svg>')}")`, W, H};
})();
WS.SCENES = {
  brick: {name: 'London brick', sw: '#8a553d', light: false, skirt: '#d8d2c8', paint(ppc) { return {backgroundColor: '#7a4a37', backgroundImage: `${NOISE}, ${BRICK.url}`, backgroundSize: `260px 260px, ${BRICK.W * ppc}px ${BRICK.H * ppc}px`}; }},
  plaster: {name: 'Plaster', sw: '#cdc2b5', light: true, skirt: '#ece8e1', paint() { return {backgroundColor: '#d3c9bc', backgroundImage: `${NOISE_SOFT}, radial-gradient(ellipse at 30% 20%, rgba(255,255,255,.18), transparent 60%), radial-gradient(ellipse at 80% 70%, rgba(120,100,80,.12), transparent 55%)`, backgroundSize: '260px 260px, 100% 100%, 100% 100%'}; }},
  green: {name: 'Heritage green', sw: '#2e3c34', light: false, skirt: '#26332c', paint() { return {backgroundColor: '#3b4f43', backgroundImage: `${NOISE}, radial-gradient(ellipse at 50% 30%, rgba(255,255,255,.05), transparent 60%)`, backgroundSize: '260px 260px, 100% 100%'}; }},
  concrete: {name: 'Concrete', sw: '#8f8e8a', light: true, skirt: '#6f6e6a', paint(ppc) { return {backgroundColor: '#8f8e8a', backgroundImage: `${NOISE_SOFT}, radial-gradient(circle, rgba(40,40,38,.5) ${0.7 * ppc}px, transparent ${0.9 * ppc}px), linear-gradient(90deg, rgba(0,0,0,.09) 1px, transparent 1px), linear-gradient(rgba(0,0,0,.07) 1px, transparent 1px)`, backgroundSize: `260px 260px, ${60 * ppc}px ${45 * ppc}px, ${120 * ppc}px ${90 * ppc}px, ${120 * ppc}px ${90 * ppc}px`, backgroundPosition: `0 0, ${30 * ppc}px ${22 * ppc}px, 0 0, 0 0`}; }},
  own: {name: 'Your wall', sw: '', light: false, skirt: 'transparent', paint(ppc, ownUrl) { return {backgroundColor: '#222', backgroundImage: ownUrl ? `url("${ownUrl}")` : 'none', backgroundSize: 'cover', backgroundPosition: 'center'}; }}
};

/* ---------- toast ---------- */
let toastT = 0;
WS.toast = function (msg) {
  let t = $('#wsToast');
  if (!t) { t = document.createElement('div'); t.id = 'wsToast'; t.className = 'ws-toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3400);
};

/* ---------- basket (localStorage, shared across pages) ---------- */
const KEY = 'litneon.workshop.basket';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
const save = items => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} };
WS.basket = {
  items: load(),
  add(item) { this.items.push(Object.assign({added: Date.now()}, item)); save(this.items); WS.renderBasket(); },
  remove(i) { this.items.splice(i, 1); save(this.items); WS.renderBasket(); },
  total() { return this.items.reduce((a, b) => a + b.price, 0); }
};
WS.payloadFor = function (it) {
  if (it.kind === 'ready') {
    return {items: [{id: 'variant:' + it.designId + ':' + it.s.size + ':' + it.s.colour, quantity: 1, properties: {'Colour': WS.byId(WS.COLOURS, it.s.colour).name, 'Size': `${WS.byId(WS.SIZES, it.s.size).name}, ${it.d.W} × ${it.d.H} cm`, 'Backing': `${WS.byId(WS.BACKINGS, it.s.backing).name}, ${WS.byId(WS.BOARDS, it.s.board).name.toLowerCase()}`, 'Plug': 'UK'}}]};
  }
  const s = it.s;
  return {items: [{
    id: 47100000000 + it.price, quantity: 1,
    properties: {
      'Words': it.dz.lines.join(' / '), 'Symbol': it.dz.icon || 'None',
      'Lettering': WS.byId(WS.FONTS, s.font).name, 'Colour': WS.byId(WS.COLOURS, s.colour).name,
      'Size': `${WS.byId(WS.SIZES, s.size).name}, ${it.d.W} × ${it.d.H} cm`,
      'Backing': `${WS.byId(WS.BACKINGS, s.backing).name}, ${WS.byId(WS.BOARDS, s.board).name.toLowerCase()}`,
      'Hangs': WS.byId(WS.USES, s.use).name, 'Plug': WS.byId(WS.PLUGS, s.plug).name,
      'Making time': WS.byId(WS.PRODS, s.prod).sub.split(',')[0],
      '_spec': JSON.stringify({v: 2, lines: it.dz.lines, icon: it.dz.icon || null, align: it.dz.align, font_family: WS.byId(WS.FONTS, s.font).family, colour: WS.byId(WS.COLOURS, s.colour).name, colour_hex: WS.byId(WS.COLOURS, s.colour).hex, letter_height_cm: it.d.letterCm, width_cm: it.d.W, height_cm: it.d.H, led_flex_m_est: it.flex, backing: s.backing, acrylic: s.board, waterproof: s.use === 'out', plug: s.plug.toUpperCase(), express: s.prod === 'exp', price_gbp: it.price})
    }
  }]};
};
WS.renderBasket = function () {
  const items = WS.basket.items, n = items.length;
  $$('.ws-count').forEach(el => { el.textContent = n; el.dataset.n = n; });
  const body = $('#wsDrawerBody'), foot = $('#wsDrawerFoot'); if (!body) return;
  if (!n) { body.innerHTML = `<div class="empty"><p>Your basket is empty.</p><a class="btn primary sm" href="create.html">Design a sign</a><a class="link-btn" href="shop.html">or browse ready-made designs</a></div>`; foot.hidden = true; return; }
  body.innerHTML = items.map((it, i) => {
    const s = it.s;
    return `<div class="ws-item"><div class="ws-panel ws-stage" data-thumb="${i}"></div>
      <dl>
        ${it.kind === 'ready' ? `<dt>Design</dt><dd>${WS.esc(it.name)}</dd>` : `<dt>Words</dt><dd>${WS.esc(it.dz.lines.join(' / ') || 'Symbol only')}</dd><dt>Lettering</dt><dd>${WS.byId(WS.FONTS, s.font).name}</dd>`}
        <dt>Colour</dt><dd>${WS.byId(WS.COLOURS, s.colour).name}</dd>
        <dt>Size</dt><dd>${WS.byId(WS.SIZES, s.size).name}, ${it.d.W} × ${it.d.H} cm</dd>
        <dt>Backing</dt><dd>${WS.byId(WS.BACKINGS, s.backing).name}, ${WS.byId(WS.BOARDS, s.board).name.toLowerCase()}</dd>
        ${it.kind === 'ready' ? '' : `<dt>Hangs</dt><dd>${WS.byId(WS.USES, s.use).name}, ${WS.byId(WS.PLUGS, s.plug).name} plug</dd><dt>Making time</dt><dd>${WS.byId(WS.PRODS, s.prod).sub.split(',')[0]}</dd>`}
      </dl>
      <div class="ws-item-foot"><button class="link-btn" data-remove="${i}">Remove</button><b>${WS.gbp(it.price)}</b></div></div>`;
  }).join('');
  $$('[data-thumb]', body).forEach(el => { const it = items[+el.dataset.thumb]; WS.renderSign(el, {dz: it.dz, fit: {w: el.clientWidth * .72, h: 96}, maxEm: 70}); });
  foot.hidden = false;
  $('#wsSubtotal').textContent = WS.gbp(WS.basket.total());
  const pl = $('#wsPayload'); if (pl) pl.textContent = JSON.stringify(WS.payloadFor(items[n - 1]), null, 2);
};
let lastFocus = null;
WS.openDrawer = function () { WS.renderBasket(); lastFocus = document.activeElement; const d = $('#wsDrawer'); d.classList.add('open'); d.setAttribute('aria-hidden', 'false'); $('#wsScrim').classList.add('show'); $('.ws-x', d).focus(); };
WS.closeDrawer = function () { const d = $('#wsDrawer'); if (!d.classList.contains('open')) return; d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); $('#wsScrim').classList.remove('show'); if (lastFocus && lastFocus.focus) lastFocus.focus(); };

/* ---------- shared chrome ---------- */
const NAV = [['create.html', 'Design your sign'], ['shop.html', 'Ready-made'], ['weddings.html', 'Weddings'], ['business.html', 'Business'], ['photo.html', 'Photo to neon'], ['about.html', 'How it\'s made'], ['faq.html', 'Help']];
const page = location.pathname.split('/').pop() || 'index.html';
const navHtml = cls => NAV.map(([h, t]) => `<a href="${h}"${h === page ? ' aria-current="page"' : ''}>${t}</a>`).join('');
const basketSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>`;
WS.mountChrome = function () {
  const h = $('#wsHeader');
  if (h) h.outerHTML = `<header class="ws-header" id="wsHeader"><div class="ws-wrap ws-header-in">
    <a class="ws-wordmark" href="index.html" aria-label="Lit Neon home">Lit Neon</a>
    <nav class="ws-nav" aria-label="Main">${navHtml()}</nav>
    <button class="ws-basket-btn" id="wsBasketBtn" aria-label="Open basket">${basketSvg}<span class="lbl">Basket</span><span class="ws-count" data-n="0">0</span></button>
    <button class="ws-menu-btn" id="wsMenuBtn" aria-expanded="false" aria-controls="wsMenu" aria-label="Open menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
  </div></header>
  <div class="ws-menu" id="wsMenu" aria-hidden="true"><div class="ws-menu-top"><span class="ws-wordmark" aria-hidden="true">Lit Neon</span><button class="ws-x" id="wsMenuClose" aria-label="Close menu" style="border-color:rgba(228,226,219,.4);background:none;color:inherit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <nav aria-label="Main, mobile">${navHtml()}</nav>
    <div class="ws-menu-foot"><a class="btn paper" href="create.html">Design your sign</a><button class="btn ghost light" id="wsMenuBasket">Basket <span class="ws-count" data-n="0">0</span></button></div></div>`;
  const f = $('#wsFooter');
  if (f && f.hidden) f.remove();
  else if (f) f.outerHTML = `<footer class="ws-footer" id="wsFooter"><div class="ws-wrap">
    <div class="ws-footer-grid">
      <div><a class="ws-wordmark" href="index.html">Lit Neon</a><p class="blurb">Custom LED neon signs, drawn to measure and made to order for homes, weddings, pubs and shops across the UK.</p></div>
      <div><h4>Shop</h4><ul><li><a href="create.html">Design your sign</a></li><li><a href="shop.html">Ready-made designs</a></li><li><a href="weddings.html">Weddings</a></li><li><a href="business.html">Business and logos</a></li><li><a href="photo.html">Photo to neon</a></li></ul></div>
      <div><h4>Help</h4><ul><li><a href="faq.html#delivery">Delivery</a></li><li><a href="faq.html#returns">Returns</a></li><li><a href="faq.html#install">Installation</a></li><li><a href="faq.html#care">Care</a></li><li><a href="faq.html">All questions</a></li></ul></div>
      <div><h4>Company</h4><ul><li><a href="about.html">How it's made</a></li><li><a href="#" data-soon="Contact">Contact</a></li><li><a href="#" data-soon="Privacy policy">Privacy</a></li><li><a href="#" data-soon="Terms">Terms</a></li><li><a href="#" data-soon="Cookie settings">Cookies</a></li></ul></div>
    </div>
    <div class="ws-footer-bottom"><p>Lit Neon Ltd, registered in England and Wales. Company and VAT numbers to follow. Prices include VAT.</p><p class="note">${WS.esc(LIT.brand.note)}</p></div>
  </div></footer>`;
  document.body.insertAdjacentHTML('beforeend', `<div class="ws-scrim" id="wsScrim"></div>
  <aside class="ws-drawer" id="wsDrawer" role="dialog" aria-modal="true" aria-labelledby="wsDrawerTitle" aria-hidden="true">
    <div class="ws-drawer-head"><h2 id="wsDrawerTitle">Your basket</h2><button class="ws-x" data-close aria-label="Close basket"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="ws-drawer-body" id="wsDrawerBody"></div>
    <div class="ws-drawer-foot" id="wsDrawerFoot" hidden>
      <div class="ws-total"><span>Subtotal, inc. VAT</span><b id="wsSubtotal">£0</b></div>
      <p class="fine">Free UK delivery. Pay in 3 with Klarna at checkout.</p>
      <button class="btn primary" id="wsCheckout">Go to checkout</button>
      <details class="dev"><summary>What Shopify receives</summary><p>Each line points at a hidden price-point variant and carries the full design as order details for the workshop.</p><pre id="wsPayload"></pre></details>
    </div>
  </aside>`);
  // events
  $('#wsBasketBtn').addEventListener('click', WS.openDrawer);
  $('#wsDrawer [data-close]').addEventListener('click', WS.closeDrawer);
  $('#wsScrim').addEventListener('click', WS.closeDrawer);
  $('#wsDrawerBody').addEventListener('click', e => { const b = e.target.closest('[data-remove]'); if (b) { WS.basket.remove(+b.dataset.remove); WS.toast('Removed from your basket'); } });
  $('#wsCheckout').addEventListener('click', () => WS.toast("Prototype: in the live store this opens Shopify's secure checkout."));
  const menu = $('#wsMenu'), mbtn = $('#wsMenuBtn');
  const openMenu = () => { menu.classList.add('open'); menu.setAttribute('aria-hidden', 'false'); mbtn.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; $('#wsMenuClose').focus(); };
  const closeMenu = () => { menu.classList.remove('open'); menu.setAttribute('aria-hidden', 'true'); mbtn.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; mbtn.focus(); };
  WS.openMenu = openMenu; WS.closeMenu = closeMenu;
  mbtn.addEventListener('click', openMenu);
  $('#wsMenuClose').addEventListener('click', closeMenu);
  $('#wsMenuBasket').addEventListener('click', () => { closeMenu(); WS.openDrawer(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (menu.classList.contains('open')) closeMenu(); else WS.closeDrawer(); } });
  document.addEventListener('click', e => { const a = e.target.closest('[data-soon]'); if (a) { e.preventDefault(); WS.toast(`${a.dataset.soon} comes with the live store.`); } });
  WS.renderBasket();
};

/* Fonts: resolve when the lettering fonts are really usable, so measurements are right.
   The Google Fonts stylesheet is injected by the page; wait for it before asking for the faces. */
const fontCbs = [];
let fontsDone = false;
WS.fontsReady = function () {
  const links = $$('link[rel="stylesheet"][href*="fonts.googleapis"]');
  const linkWait = Promise.all(links.map(l => l.sheet ? Promise.resolve() : new Promise(r => { l.addEventListener('load', r, {once: true}); l.addEventListener('error', r, {once: true}); setTimeout(r, 4000); })));
  return linkWait.then(() => Promise.all(LIT.fonts.map(f => document.fonts.load(`${f.weight || 400} 100px "${f.family}"`, 'Hgy').catch(() => {}))))
    .then(() => document.fonts.ready).then(() => { WS.clearMeasureCache(); fcache.clear(); fontsDone = true; });
};
/* Register a re-render: runs now, once fonts are ready, and whenever more faces finish loading. */
WS.onFonts = function (cb) {
  fontCbs.push(cb); cb();
  WS.fontsReady().then(cb);
};
document.fonts.addEventListener('loadingdone', () => { WS.clearMeasureCache(); fcache.clear(); fontCbs.forEach(cb => cb()); });

/* dimension line helpers: returns HTML for an H or V dimension at px coords */
WS.dimH = (left, top, width, label, cls = '') => `<div class="dim h ${cls}" style="left:${left}px;top:${top}px;width:${width}px"><i></i><span>${label}</span></div>`;
WS.dimV = (left, top, height, label, cls = '') => `<div class="dim v ${cls}" style="left:${left}px;top:${top}px;height:${height}px"><i></i><span>${label}</span></div>`;

/* ---------- product spec cards (home, shop, weddings, product) ---------- */
WS.cardHtml = function (d) {
  const dims = WS.dimsFor(WS.designOf(d), 's', 'cut');
  return `<a class="spec-card" href="product.html?id=${d.id}" data-cat="${d.category}" data-id="${d.id}" data-from="${d.from}">
    <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
    <div class="ws-panel ws-stage" data-card="${d.id}"></div>
    <div class="body"><h3>${WS.esc(d.name)}</h3><div class="from"><b>from ${WS.gbp(d.from)} <small>inc. VAT</small></b><span class="mono">${dims.W} × ${dims.H} cm</span></div></div></a>`;
};
WS.hydrateCards = function (root = document) {
  $$('[data-card]', root).forEach(el => {
    const d = WS.byId(WS.DESIGNS, el.dataset.card), dz = WS.designOf(d);
    const w = el.clientWidth, h = el.clientHeight; if (!w) return;
    const r = WS.renderSign(el, {dz, fit: {w: w * .7, h: h * .42}});
    $$('.dim', el).forEach(x => x.remove());
    const dims = WS.dimsFor(dz, 's', 'cut');
    const left = (w - r.w) / 2, top = (h - r.h) / 2;
    el.insertAdjacentHTML('beforeend', WS.dimH(left, top + r.h + Math.min(26, h * .12), r.w, `${dims.W} cm`, 'light below'));
  });
};

document.addEventListener('DOMContentLoaded', WS.mountChrome);
})();
