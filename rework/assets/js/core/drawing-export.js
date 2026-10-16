/* Lit Neon v2 — drawing-export.js (WS0-C, brief §4.2 step 7, §6.2): the proof drawing as an A4-landscape VECTOR PDF,
   written by a minimal PDF writer in the browser (no library, no server). Same signatures as the freeze stub:
     pdf(state, { filename, title }) → Promise<{ blob, filename, url, scale, pages:1 }>
     download(state, opts) → Promise<same>   (triggers the save)
     build(state, opts) → Promise<{ bytes: Uint8Array, scale, traced }>   (the raw file; exported for tests and previews)
   What is on the sheet (mirrors core/sheet.js, the on-screen proof): a drafting frame and 5 mm grid · title + one-line
   summary · the "For approval" stamp · the drawing TO SCALE (1:N picked from a standard ladder so the sign fills the
   sheet; a scale bar under it; "to scale when printed at 100 % on A4") — lettering as vector outlines traced from the
   customer's real lettering face (canvas raster → marching squares → simplified paths; Node falls back to stroked
   Helvetica), the symbol as its own vector centreline, the acrylic as a dashed cut contour / panel with four standoffs /
   panel on its stand · overall width and height dimensions and the letter-height dimension with cap lines · a spec
   table and construction notes (customer names only; voltage, cable length and watts only when the facts registry has
   them confirmed) · the title block (Title · Acrylic · LED flex · Power? · Scale · Date · Drawn by · Sheet).
   Dates come from clock.now(); no prices anywhere on the drawing. Text is Helvetica/Courier (WinAnsi), content streams
   are Flate-compressed when CompressionStream exists. */
import { resolve, flexMetres, OPTIONS, ensureFonts } from './renderer.js';
import { fmtDate, fmtMetres, cmToIn } from './money.js';
import * as clock from './clock.js';

export const STUB = false;

let factsPeer = null; try { const m = await import('./facts.js'); factsPeer = m.default && typeof m.default.has === 'function' ? m.default : m; } catch { factsPeer = null; }
const F = { has: k => { try { return !!(factsPeer && factsPeer.has && factsPeer.has(k)); } catch { return false; } }, get: k => { try { const v = factsPeer && (factsPeer.value || factsPeer.get) ? (factsPeer.value ? factsPeer.value(k) : factsPeer.get(k)) : undefined; return v && typeof v === 'object' && 'value' in v ? v.value : v; } catch { return undefined; } } };
const hasDOM = () => typeof document !== 'undefined' && typeof document.createElement === 'function';

/* ---------- page geometry (pt, top-left origin; flipped on write) ---------- */
const PW = 842, PH = 595, PT_PER_CM = 72 / 2.54;
const SCALES = [1, 2, 2.5, 4, 5, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 75, 100];
const C = { ink: [0.094, 0.055, 0.122], soft: [0.353, 0.31, 0.361], rule: [0.812, 0.765, 0.725], draft: [0.184, 0.365, 0.541], grid: [0.9, 0.925, 0.95], oxblood: [0.545, 0.12, 0.2], white: [1, 1, 1] };

/* ---------- WinAnsi text + Helvetica metrics ---------- */
const WIN = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };
const winAnsi = s => Array.from(String(s)).map(ch => { const c = ch.codePointAt(0); if (c >= 32 && c < 127) return ch; if (WIN[ch]) return String.fromCharCode(WIN[ch]); if (c >= 0xA0 && c <= 0xFF) return ch; return '?'; }).join('');
const pdfStr = s => '(' + winAnsi(s).replace(/[\\()]/g, m => '\\' + m) + ')';
const HV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const HB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
const EXTRA = { '×': 584, '·': 278, '–': 556, '—': 1000, '‘': 222, '’': 222, '“': 333, '”': 333, '£': 556, '•': 350, '…': 1000 };
function textW(s, font, size) {
  if (font === 'mono') return Array.from(String(s)).length * 600 * size / 1000;
  const T = font === 'bold' ? HB : HV; let w = 0;
  for (const ch of String(s)) { const c = ch.codePointAt(0); w += (c >= 32 && c < 127) ? T[c - 32] : (EXTRA[ch] || (/\p{L}/u.test(ch) ? T[ch.normalize('NFD').charCodeAt(0) - 32] || 556 : 556)); }
  return w * size / 1000;
}
const fit = (s, font, size, maxW) => { s = String(s); if (textW(s, font, size) <= maxW) return s; while (s.length > 1 && textW(s + '…', font, size) > maxW) s = s.slice(0, -1); return s.trimEnd() + '…'; };
const n2 = v => (Math.round(v * 100) / 100).toString();

/* ---------- a tiny content-stream builder (top-left coordinates) ---------- */
function Canvas() {
  const o = [];
  const Y = y => PH - y;
  const api = {
    ops: o,
    raw: s => { o.push(s); return api; },
    save: () => { o.push('q'); return api; }, restore: () => { o.push('Q'); return api; },
    stroke: (rgb, w = 1, dash = null) => { o.push(`${rgb.map(n2).join(' ')} RG ${n2(w)} w ${dash ? `[${dash.map(n2).join(' ')}] 0 d` : '[] 0 d'} 1 J 1 j`); return api; },
    fill: rgb => { o.push(`${rgb.map(n2).join(' ')} rg`); return api; },
    rect: (x, y, w, h, mode = 'S') => { o.push(`${n2(x)} ${n2(Y(y + h))} ${n2(w)} ${n2(h)} re ${mode}`); return api; },
    line: (x1, y1, x2, y2) => { o.push(`${n2(x1)} ${n2(Y(y1))} m ${n2(x2)} ${n2(Y(y2))} l S`); return api; },
    poly: (pts, close = true, mode = 'S') => { if (pts.length < 2) return api; let s = `${n2(pts[0][0])} ${n2(Y(pts[0][1]))} m`; for (let i = 1; i < pts.length; i++) s += ` ${n2(pts[i][0])} ${n2(Y(pts[i][1]))} l`; o.push(s + (close ? ' h ' : ' ') + mode); return api; },
    roundRect: (x, y, w, h, r, mode = 'S') => { const k = 0.5523 * r; o.push([`${n2(x + r)} ${n2(Y(y))} m`, `${n2(x + w - r)} ${n2(Y(y))} l`, `${n2(x + w - r + k)} ${n2(Y(y))} ${n2(x + w)} ${n2(Y(y + r - k))} ${n2(x + w)} ${n2(Y(y + r))} c`, `${n2(x + w)} ${n2(Y(y + h - r))} l`, `${n2(x + w)} ${n2(Y(y + h - r + k))} ${n2(x + w - r + k)} ${n2(Y(y + h))} ${n2(x + w - r)} ${n2(Y(y + h))} c`, `${n2(x + r)} ${n2(Y(y + h))} l`, `${n2(x + r - k)} ${n2(Y(y + h))} ${n2(x)} ${n2(Y(y + h - r + k))} ${n2(x)} ${n2(Y(y + h - r))} c`, `${n2(x)} ${n2(Y(y + r))} l`, `${n2(x)} ${n2(Y(y + r - k))} ${n2(x + r - k)} ${n2(Y(y))} ${n2(x + r)} ${n2(Y(y))} c`, `h ${mode}`].join(' ')); return api; },
    circle: (cx, cy, r, mode = 'S') => api.roundRect(cx - r, cy - r, 2 * r, 2 * r, r, mode),
    /* text: font 'reg' | 'bold' | 'mono'; align left|center|right; mode 0 fill, 1 stroke */
    text: (s, x, y, { font = 'reg', size = 10, rgb = C.ink, align = 'left', mode = 0, rot = 0 } = {}) => {
      const w = textW(s, font, size); const dx = align === 'center' ? -w / 2 : align === 'right' ? -w : 0; const fid = font === 'bold' ? 'F2' : font === 'mono' ? 'F3' : 'F1';
      const col = mode === 1 ? `${rgb.map(n2).join(' ')} RG` : `${rgb.map(n2).join(' ')} rg`;
      if (rot) { const a = rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a); o.push(`BT /${fid} ${n2(size)} Tf ${mode} Tr ${col} ${n2(c)} ${n2(sn)} ${n2(-sn)} ${n2(c)} ${n2(x + dx * c)} ${n2(Y(y) + dx * sn)} Tm ${pdfStr(s)} Tj ET`); }
      else o.push(`BT /${fid} ${n2(size)} Tf ${mode} Tr ${col} ${n2(x + dx)} ${n2(Y(y))} Td ${pdfStr(s)} Tj ET`);
      return api;
    },
    /* an SVG path (M L H V C S Q T A Z, abs + rel) transformed by (x, y, scale), stroked */
    svgPath: (d, x, y, s) => { const segs = svgToSegments(d); let out = ''; for (const g of segs) { if (g[0] === 'M') out += ` ${n2(x + g[1] * s)} ${n2(Y(y + g[2] * s))} m`; else if (g[0] === 'L') out += ` ${n2(x + g[1] * s)} ${n2(Y(y + g[2] * s))} l`; else if (g[0] === 'C') out += ` ${n2(x + g[1] * s)} ${n2(Y(y + g[2] * s))} ${n2(x + g[3] * s)} ${n2(Y(y + g[4] * s))} ${n2(x + g[5] * s)} ${n2(Y(y + g[6] * s))} c`; else if (g[0] === 'Z') out += ' h'; } o.push(out.trim() + ' S'); return api; }
  };
  return api;
}

/* ---------- SVG path → absolute M/L/C/Z segments (arcs → cubic béziers) ---------- */
export function svgToSegments(d) {
  const toks = String(d).match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || []; let i = 0; const out = [];
  let cx = 0, cy = 0, sx = 0, sy = 0, lc = null, lq = null, cmd = '';
  const num = () => parseFloat(toks[i++]); const isNum = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
  /* arc flags may be written without separators ("0 1 1 0-13" / "a6.5 6.5 0 1 1 0-13"): the tokenizer already splits signs */
  while (i < toks.length) {
    if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++]; else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase(); const C1 = cmd.toUpperCase();
    if (C1 === 'Z') { out.push(['Z']); cx = sx; cy = sy; lc = lq = null; continue; }
    do {
      if (C1 === 'M') { let x = num(), y = num(); if (rel) { x += cx; y += cy; } out.push(['M', x, y]); cx = sx = x; cy = sy = y; cmd = rel ? 'l' : 'L'; lc = lq = null; break; }
      if (C1 === 'L') { let x = num(), y = num(); if (rel) { x += cx; y += cy; } out.push(['L', x, y]); cx = x; cy = y; lc = lq = null; }
      else if (C1 === 'H') { let x = num(); if (rel) x += cx; out.push(['L', x, cy]); cx = x; lc = lq = null; }
      else if (C1 === 'V') { let y = num(); if (rel) y += cy; out.push(['L', cx, y]); cy = y; lc = lq = null; }
      else if (C1 === 'C' || C1 === 'S') {
        let x1, y1; if (C1 === 'C') { x1 = num(); y1 = num(); if (rel) { x1 += cx; y1 += cy; } } else { x1 = lc ? 2 * cx - lc[0] : cx; y1 = lc ? 2 * cy - lc[1] : cy; }
        let x2 = num(), y2 = num(), x = num(), y = num(); if (rel) { x2 += cx; y2 += cy; x += cx; y += cy; }
        out.push(['C', x1, y1, x2, y2, x, y]); lc = [x2, y2]; lq = null; cx = x; cy = y;
      } else if (C1 === 'Q' || C1 === 'T') {
        let qx, qy; if (C1 === 'Q') { qx = num(); qy = num(); if (rel) { qx += cx; qy += cy; } } else { qx = lq ? 2 * cx - lq[0] : cx; qy = lq ? 2 * cy - lq[1] : cy; }
        let x = num(), y = num(); if (rel) { x += cx; y += cy; }
        out.push(['C', cx + 2 / 3 * (qx - cx), cy + 2 / 3 * (qy - cy), x + 2 / 3 * (qx - x), y + 2 / 3 * (qy - y), x, y]); lq = [qx, qy]; lc = null; cx = x; cy = y;
      } else if (C1 === 'A') {
        const rx = num(), ry = num(), rot = num(); const fa = parseFlag(), fs = parseFlag(); let x = num(), y = num(); if (rel) { x += cx; y += cy; }
        arcToBeziers(cx, cy, rx, ry, rot, fa, fs, x, y).forEach(b => out.push(b)); cx = x; cy = y; lc = lq = null;
      } else { i++; }
    } while (isNum());
  }
  return out;
  function parseFlag() { const t = toks[i]; if (t === '0' || t === '1') { i++; return +t; } /* "11" packed flags */ if (/^[01]{2,}/.test(t)) { toks[i] = t.slice(1); return +t[0]; } return num() ? 1 : 0; }
}
function arcToBeziers(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
  if (!rx || !ry) return [['L', x2, y2]];
  const phi = phiDeg * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2; const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  rx = Math.abs(rx); ry = Math.abs(ry); const lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const sign = fa === fs ? -1 : 1; const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p; const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, num / den)); const cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => { const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); return a; };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry); let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI; else if (fs && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2)); const step = dt / n; const k = 4 / 3 * Math.tan(step / 4); const out = [];
  const P = t => [cx + rx * Math.cos(t) * cp - ry * Math.sin(t) * sp, cy + rx * Math.cos(t) * sp + ry * Math.sin(t) * cp];
  const D = t => [-rx * Math.sin(t) * cp - ry * Math.cos(t) * sp, -rx * Math.sin(t) * sp + ry * Math.cos(t) * cp];
  for (let j = 0; j < n; j++) { const a = t1 + j * step, b = a + step; const p0 = P(a), p3 = P(b), d0 = D(a), d3 = D(b); out.push(['C', p0[0] + k * d0[0], p0[1] + k * d0[1], p3[0] - k * d3[0], p3[1] - k * d3[1], p3[0], p3[1]]); }
  return out;
}

/* ---------- lettering → vector outlines (browser): raster in the real face, marching squares, RDP ---------- */
const PLACEHOLDER = ['Your words'];
function layoutOf(res) {
  const m = res.m; const lines = res.drawLines.length ? res.drawLines : (res.hasText ? [] : PLACEHOLDER);
  const alignOff = i => res.state.align === 'left' ? 0 : res.state.align === 'right' ? (m.blockW - m.lineWidths[i]) : (m.blockW - m.lineWidths[i]) / 2;
  const textShiftX = (m.inkW - m.textW) / 2 - m.minX + (m.textOffX ? m.textOffX / 2 : 0);
  /* positions in em, relative to the ink box's top-left (same maths as renderer.bakeGlow / the stage) */
  const pos = lines.map((t, i) => ({ t, x: textShiftX + alignOff(i), y: m.textOffY + m.baselines[i] - m.top }));
  let icon = null;
  if (res.icon) { const inline = res.iconPos === 'inline' && lines.length; icon = { d: OPTIONS.icons[res.icon], s: m.iconEm, x: inline ? 0 : (m.inkW - m.iconEm) / 2, y: inline ? (m.inkH - m.iconEm) / 2 : 0 }; }
  return { lines, pos, icon };
}
function paintLines(ctx, res, L, ox, oy, em, mode) {
  const f = res.font;
  for (const p of L.pos) {
    let cx = ox + p.x * em; const y = oy + p.y * em;
    for (const part of p.t.split(/( |&)/).filter(s => s !== '')) {
      if (part === ' ') { cx += ctx.measureText(' ').width + (f.wordSpacingEm || 0) * em; continue; }
      if (part === '&') cx += (f.ampersandGapEm || 0) * em;
      if (mode === 'stroke') ctx.strokeText(part, cx, y); ctx.fillText(part, cx, y);
      cx += ctx.measureText(part).width + (part === '&' ? (f.ampersandGapEm || 0) * em : 0);
    }
  }
}
/** marching squares over an alpha raster → closed loops in pixel coordinates (iso-interpolated, sub-pixel) */
export function traceLoops(alpha, W, H, iso = 128) {
  const at = (x, y) => alpha[y * W + x];
  const hv = (x, y) => { const a = at(x, y), b = at(x + 1, y); return [x + (iso - a) / (b - a), y]; };
  const vv = (x, y) => { const a = at(x, y), b = at(x, y + 1); return [x, y + (iso - a) / (b - a)]; };
  const adj = new Map(); const pts = new Map(); const HOFF = 0, VOFF = W * H;
  const link = (a, b) => { (adj.get(a) || adj.set(a, []).get(a)).push(b); (adj.get(b) || adj.set(b, []).get(b)).push(a); };
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const tl = at(x, y) >= iso, tr = at(x + 1, y) >= iso, br = at(x + 1, y + 1) >= iso, bl = at(x, y + 1) >= iso;
    const c = (tl ? 8 : 0) | (tr ? 4 : 0) | (br ? 2 : 0) | (bl ? 1 : 0); if (c === 0 || c === 15) continue;
    const T = HOFF + y * W + x, B = HOFF + (y + 1) * W + x, Lf = VOFF + y * W + x, R = VOFF + y * W + x + 1;
    const P = id => { if (!pts.has(id)) { pts.set(id, id >= VOFF ? vv((id - VOFF) % W, Math.floor((id - VOFF) / W)) : hv(id % W, Math.floor(id / W))); } return id; };
    const seg = (a, b) => link(P(a), P(b));
    const centre = (at(x, y) + at(x + 1, y) + at(x + 1, y + 1) + at(x, y + 1)) / 4 >= iso;
    switch (c) {
      case 1: case 14: seg(Lf, B); break; case 2: case 13: seg(B, R); break; case 3: case 12: seg(Lf, R); break;
      case 4: case 11: seg(T, R); break; case 6: case 9: seg(T, B); break; case 7: case 8: seg(Lf, T); break;
      case 5: if (centre) { seg(T, Lf); seg(B, R); } else { seg(Lf, B); seg(T, R); } break;
      case 10: if (centre) { seg(T, R); seg(Lf, B); } else { seg(Lf, T); seg(B, R); } break;
    }
  }
  const loops = []; const seen = new Set();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue; const loop = []; let prev = -1, cur = start;
    while (cur !== undefined && !seen.has(cur)) { seen.add(cur); loop.push(pts.get(cur)); const nb = adj.get(cur); const next = nb[0] !== prev ? nb[0] : nb[1]; prev = cur; cur = next; }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts; const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); const [ax, ay] = pts[a], [bx, by] = pts[b]; const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9; let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
}
const simplifyLoop = (loop, eps) => { if (loop.length < 8) return loop; let far = 0, fd = 0; const [x0, y0] = loop[0]; loop.forEach(([x, y], i) => { const d = (x - x0) ** 2 + (y - y0) ** 2; if (d > fd) { fd = d; far = i; } }); const a = rdp(loop.slice(0, far + 1), eps), b = rdp(loop.slice(far).concat([loop[0]]), eps); return a.concat(b.slice(1, -1)); };
const area = l => { let s = 0; for (let i = 0, j = l.length - 1; i < l.length; j = i++) s += (l[j][0] - l[i][0]) * (l[j][1] + l[i][1]); return s / 2; };
const inside = (p, l) => { let c = false; for (let i = 0, j = l.length - 1; i < l.length; j = i++) { const [xi, yi] = l[i], [xj, yj] = l[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
/** trace the lettering (and, for cut-to-shape, its offset contour) in the real face. Returns loops in em units relative to the ink box. */
async function traceLettering(res, L, emPt) {
  if (!hasDOM() || !L.lines.length) return null;
  try { await ensureFonts([res.font.id]); } catch {}
  try { if (document.fonts && document.fonts.load) await document.fonts.load(`${res.font.weight || 400} 100px "${res.font.family}"`); } catch {}
  const m = res.m; const marginEm = res.backing.margin / res.dims.emCm;
  /* raster: about 4 px per pt on paper, capped at ~5 Mpx */
  const padEm = marginEm + 0.15;
  const areaEm = (m.inkW + 2 * padEm) * (m.inkH + 2 * padEm);
  const em = Math.max(140, Math.min(emPt * 4, 900, Math.sqrt(5e6 / areaEm)));
  const W = Math.ceil((m.inkW + 2 * padEm) * em) + 2, H = Math.ceil((m.inkH + 2 * padEm) * em) + 2; const P = padEm * em + 1;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d', { willReadFrequently: true });
  const alphaOf = () => { const d = ctx.getImageData(0, 0, W, H).data; const a = new Uint8Array(W * H); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]; for (let x = 0; x < W; x++) { a[x] = 0; a[(H - 1) * W + x] = 0; } for (let y = 0; y < H; y++) { a[y * W] = 0; a[y * W + W - 1] = 0; } return a; };
  const font = `${res.font.weight || 400} ${em}px "${res.font.family}"`;
  ctx.font = font; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#000';
  paintLines(ctx, res, L, P, P, em, 'fill');
  const toEm = loop => loop.map(([x, y]) => [(x - P) / em, (y - P) / em]);
  const letters = traceLoops(alphaOf(), W, H).map(l => toEm(simplifyLoop(l, 0.35))).filter(l => l.length > 2 && Math.abs(area(l)) * em * em > 4);
  let contour = null;
  if (res.backing.id === 'cut' || res.backing.id === 'letter') {
    ctx.clearRect(0, 0, W, H); ctx.font = font; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 2 * marginEm * em; ctx.strokeStyle = '#000';
    paintLines(ctx, res, L, P, P, em, 'stroke');
    if (L.icon && typeof Path2D !== 'undefined') { ctx.save(); ctx.translate(P + L.icon.x * em, P + L.icon.y * em); const k = L.icon.s * em / 24; ctx.scale(k, k); ctx.lineWidth = 1.7 + 2 * marginEm * em / k; ctx.stroke(new Path2D(L.icon.d)); ctx.restore(); }
    const loops = traceLoops(alphaOf(), W, H).map(l => simplifyLoop(l, 0.5)).filter(l => l.length > 2);
    contour = loops.filter(l => loops.filter(o => o !== l && inside(l[0], o)).length % 2 === 0).map(toEm);
  }
  return { letters, contour };
}

/* ---------- the sheet ---------- */
function pickScale(Wcm, Hcm, maxW, maxH) { for (const s of SCALES) { const k = PT_PER_CM / s; if (Wcm * k <= maxW && Hcm * k <= maxH) return s; } return SCALES[SCALES.length - 1]; }
const fmtScale = s => `1:${s}`;
function niceBar(scale) { const cmPerPt = scale / PT_PER_CM; const target = 110 * cmPerPt; const opts = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]; let best = opts[0]; for (const o of opts) if (o <= target) best = o; return best; }

export async function build(state, opts = {}) {
  const res = resolve(state); const d = res.dims || { W: 60, H: 20, emCm: 10 }; const m = res.m;
  const flex = flexMetres(res); const wpm = F.has('wattsPerMetre') ? +F.get('wattsPerMetre') : NaN; const watts = Number.isFinite(wpm) ? Math.round(flex * wpm) : null;
  const L = layoutOf(res);
  const words = res.words || (res.hasText ? '' : 'Your words');
  const colourText = res.state.colours ? res.lineColours.map((c, i) => `${c.name} (line ${i + 1})`).join(', ') : res.colour.name;
  const today = fmtDate(clock.now());
  const g = Canvas();

  /* layout boxes */
  const M = 18, FR = { x: M, y: M, w: PW - 2 * M, h: PH - 2 * M };
  const TB = { x: 34, y: PH - 34 - 42, w: PW - 68, h: 42 };
  const RC = { x: PW - 34 - 222, w: 222 };           /* right column: spec + notes */
  const top = 92, bottom = TB.y - 14;
  const DA = { x: 34 + 34, y: top + 14, w: RC.x - 18 - (34 + 34) - 58, h: bottom - top - 14 - 64 }; /* room for dims + scale bar */
  const scale = pickScale(d.W, d.H, DA.w, DA.h - (res.backing.id === 'stand' ? 18 : 0)); /* the stand base (≤ 18 pt) sits under the panel */ const ppc = PT_PER_CM / scale; const emPt = d.emCm * ppc;
  const w = d.W * ppc, h = d.H * ppc; const standH = res.backing.id === 'stand' ? Math.min(18, Math.max(6, 3 * ppc)) : 0;
  const left = DA.x + (DA.w - w) / 2, topY = DA.y + (DA.h - h - standH) / 2; const mg = res.backing.margin * ppc;

  /* paper: white page (viewers without a page colour render transparent as black), drafting grid (5 mm), frame */
  g.fill(C.white).rect(0, 0, PW, PH, 'f');
  g.save().stroke(C.grid, 0.35);
  const grid = 5 / 10 * PT_PER_CM; for (let x = FR.x + 4 + grid; x < FR.x + FR.w - 4; x += grid) g.line(x, FR.y + 4, x, FR.y + FR.h - 4); for (let y = FR.y + 4 + grid; y < FR.y + FR.h - 4; y += grid) g.line(FR.x + 4, y, FR.x + FR.w - 4, y);
  g.restore();
  g.stroke(C.ink, 1).rect(FR.x, FR.y, FR.w, FR.h).stroke(C.rule, 0.5).rect(FR.x + 4, FR.y + 4, FR.w - 8, FR.h - 8);

  /* head */
  const title = opts.title || 'Custom neon sign · drawing 1';
  g.text(fit(title, 'bold', 21, RC.x - 60), 34, 56, { font: 'bold', size: 21 });
  g.text(`${L.lines.length || 0} line${L.lines.length === 1 ? '' : 's'} · ${res.letterCm} cm letters · about ${fmtMetres(flex)} of LED flex · drawn to scale ${fmtScale(scale)}`, 34, 74, { font: 'mono', size: 8.5, rgb: C.soft });
  /* stamp */
  g.save(); const sx = PW - 34 - 150, sy = 34; const a = -5 * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  g.raw(`1 0 0 1 ${n2(sx + 75)} ${n2(PH - (sy + 22))} cm ${n2(ca)} ${n2(sa)} ${n2(-sa)} ${n2(ca)} 0 0 cm`);
  g.raw(`1 1 1 rg ${C.oxblood.map(n2).join(' ')} RG 1.8 w [] 0 d 1 j ${n2(-72)} ${n2(-18)} 144 36 re B`);
  g.raw(`BT /F2 15 Tf 0 Tr ${C.oxblood.map(n2).join(' ')} rg ${n2(-textW('FOR APPROVAL', 'bold', 15) / 2)} 1 Td ${pdfStr('FOR APPROVAL')} Tj ET`);
  g.raw(`BT /F1 6.5 Tf 0 Tr ${C.oxblood.map(n2).join(' ')} rg ${n2(-textW('nothing is made until you say yes', 'reg', 6.5) / 2)} -10.5 Td ${pdfStr('nothing is made until you say yes')} Tj ET`);
  g.restore();

  /* acrylic */
  const traced = await traceLettering(res, L, emPt);
  const ink = { x: left + mg, y: topY + mg };
  const P = ([ex, ey]) => [ink.x + ex * emPt, ink.y + ey * emPt];
  if (res.backing.id === 'cut' || res.backing.id === 'letter') {
    g.stroke(C.draft, 0.7, [3, 2.2]);
    if (traced && traced.contour && traced.contour.length) traced.contour.forEach(l => g.poly(l.map(P)));
    else g.roundRect(left, topY, w, h, Math.min(mg, h / 2, w / 2));
  } else {
    g.stroke(C.draft, 0.7, [4.5, 2.5]).roundRect(left, topY, w, h, Math.min(3, h / 4));
    if (res.backing.id === 'stand') { g.stroke(C.draft, 0.7).roundRect(left + w * .14, topY + h, w * .72, standH, Math.min(2, standH / 3)); g.stroke(C.draft, 0.45, [1.5, 1.5]).line(left + w * .14, topY + h - Math.min(6, h * .12), left + w * .86, topY + h - Math.min(6, h * .12)); }
    else { const so = Math.min(7, Math.max(2.2, 0.9 * ppc)), si = Math.min(14, Math.max(5, 1.8 * ppc)); g.stroke(C.draft, 0.6); [[left + si, topY + si], [left + w - si, topY + si], [left + si, topY + h - si], [left + w - si, topY + h - si]].forEach(([x, y]) => g.circle(x, y, so).circle(x, y, so * .35)); }
  }
  /* lettering */
  g.stroke(C.draft, 0.75);
  if (traced && traced.letters.length) { traced.letters.forEach(l => g.poly(l.map(P))); }
  else {
    /* no canvas (Node) or nothing to trace: outlined Helvetica at the cap height, positioned by the same metrics */
    const size = emPt * (m.cap / 0.718) * 0.9;
    L.pos.forEach(p => { const [x, y] = P([p.x, p.y]); g.text(p.t, x, y, { size, mode: 1, rgb: C.draft }); });
  }
  if (L.icon) { const [x, y] = P([L.icon.x, L.icon.y]); g.stroke(C.draft, 0.9).svgPath(L.icon.d, x, y, L.icon.s * emPt / 24); }

  /* dimensions */
  const dimH = (x1, x2, y, label) => { g.stroke(C.draft, 0.5).line(x1, y, x2, y).line(x1, y - 4, x1, y + 4).line(x2, y - 4, x2, y + 4); arrow(x1, y, 1, 0); arrow(x2, y, -1, 0); const tw = textW(label, 'mono', 8.5); g.fill(C.white).rect((x1 + x2) / 2 - tw / 2 - 3, y + 3, tw + 6, 11, 'f'); g.text(label, (x1 + x2) / 2, y + 12, { font: 'mono', size: 8.5, rgb: C.draft, align: 'center' }); };
  const dimV = (x, y1, y2, label, side = 1) => { g.stroke(C.draft, 0.5).line(x, y1, x, y2).line(x - 4, y1, x + 4, y1).line(x - 4, y2, x + 4, y2); arrow(x, y1, 0, 1); arrow(x, y2, 0, -1); const tw = textW(label, 'mono', 8.5); const tx = side > 0 ? x + 6 : x - 6 - tw; g.fill(C.white).rect(tx - 2, (y1 + y2) / 2 - 7, tw + 4, 11, 'f'); g.text(label, tx, (y1 + y2) / 2 + 2, { font: 'mono', size: 8.5, rgb: C.draft }); };
  function arrow(x, y, ux, uy) { const s = 4.5, b = 1.8; g.fill(C.draft).raw(`${n2(x)} ${n2(PH - y)} m ${n2(x + ux * s - uy * b)} ${n2(PH - (y + uy * s + ux * b))} l ${n2(x + ux * s + uy * b)} ${n2(PH - (y + uy * s - ux * b))} l h f`); }
  g.stroke(C.draft, 0.35, [1, 1.5]).line(left, topY + h + 4, left, topY + h + standH + 26).line(left + w, topY + h + 4, left + w, topY + h + standH + 26).line(left + w + 4, topY, left + w + 26, topY).line(left + w + 4, topY + h, left + w + 26, topY + h);
  dimH(left, left + w, topY + h + standH + 22, `${d.W} cm (${cmToIn(d.W)} in)`);
  dimV(left + w + 22, topY, topY + h, `${d.H} cm`);
  if (L.lines.length) {
    const base = ink.y + L.pos[0].y * emPt; const capTop = base - m.cap * emPt;
    g.stroke(C.draft, 0.35, [2, 2]).line(left - 30, capTop, ink.x + 6, capTop).line(left - 30, base, ink.x + 6, base);
    dimV(left - 22, capTop, base, `${res.letterCm} cm`, -1);
  }
  /* scale bar */
  const bar = niceBar(scale); const barPt = bar * ppc; const bx = left, by = Math.min(bottom - 14, topY + h + standH + 50);
  for (let i = 0; i < 4; i++) { g.fill(i % 2 ? C.white : C.ink).rect(bx + i * barPt / 4, by, barPt / 4, 4, 'f'); }
  g.stroke(C.ink, 0.5).rect(bx, by, barPt, 4);
  g.text('0', bx, by + 13, { font: 'mono', size: 7, rgb: C.soft, align: 'center' }).text(`${bar} cm`, bx + barPt, by + 13, { font: 'mono', size: 7, rgb: C.soft, align: 'center' });
  g.text(`Scale ${fmtScale(scale)} when printed at 100% on A4`, bx + barPt + 26, by + 5.5, { font: 'mono', size: 7, rgb: C.soft });

  /* spec table */
  const rows = [['Words', words || '—'], ['Lettering', res.font.name], ['Colour', res.state.colours && !res.rgb ? res.lineColours.map((c, i) => `${c.name} (line ${i + 1}) ${c.hex}`).join(', ') : colourText + (res.rgb ? '' : ` · ${res.colour.hex}`)], ['Tube', `${res.jacket.name.toLowerCase()}`], ['Letter height', `${res.letterCm} cm`],
    ['Overall', `${d.W} × ${d.H} cm (${cmToIn(d.W)} × ${cmToIn(d.H)} in)`], ['LED flex, est.', fmtMetres(flex)], ['Backing', `${res.backing.name}, ${res.finish.name.toLowerCase()} acrylic`],
    ['Hangs', `${res.use.name.toLowerCase()}, ${res.backing.id === 'stand' ? 'on its stand' : res.hang.name.toLowerCase()}`], ['Power', [F.has('psuVoltage') ? `${F.get('psuVoltage')} supply` : null, 'UK plug', 'dimmer and remote'].filter(Boolean).join(', ')]];
  if (res.icon) rows.splice(1, 0, ['Symbol', `${res.icon.replace(/^two/, 'two ')} (${res.iconPos})`]);
  if (watts != null) rows.push(['Power use', `${watts} W`]);
  const rh = 15.5, lh = 9.5, kW = 76; let ry = top;
  const cellsR = rows.map(([k, v], i) => { const font = i === 0 ? 'bold' : 'mono', size = i === 0 ? 8.5 : 7.5; const ln = wrap(v, font, size, RC.w - kW - 10); const lines = ln.length > 2 ? [ln[0], fit(ln.slice(1).join(' '), font, size, RC.w - kW - 10)] : ln; return { k, lines, font, size, h: rh + (lines.length - 1) * lh }; });
  const tableH = cellsR.reduce((a, c) => a + c.h, 0);
  g.fill(C.white).rect(RC.x, ry, RC.w, tableH, 'f').stroke(C.ink, 0.75).rect(RC.x, ry, RC.w, tableH);
  { let y = ry; cellsR.forEach((c, i) => { if (i) g.stroke(C.rule, 0.4).line(RC.x, y, RC.x + RC.w, y); g.text(c.k, RC.x + 6, y + 10.5, { size: 7.5, rgb: C.soft }); c.lines.forEach((t, j) => g.text(t, RC.x + kW + 4, y + 10.5 + j * lh, { font: c.font, size: c.size })); y += c.h; }); }
  g.stroke(C.rule, 0.4).line(RC.x + kW, ry, RC.x + kW, ry + tableH);
  ry += tableH + 16;
  /* construction notes */
  const notes = [`Tube path follows the centreline of each letter${res.icon ? ' and the symbol' : ''}.`,
    res.backing.id === 'cut' ? `Acrylic cut ${res.backing.margin} cm outside the lettering (dashed line).` : res.backing.id === 'stand' ? `Acrylic panel with ${res.backing.margin} cm clearance, slotted into its base (shown below the panel).` : `Acrylic panel with ${res.backing.margin} cm clearance, four brass standoffs.`,
    `Lines ${res.state.align === 'center' ? 'centred' : 'aligned ' + res.state.align}. Cable exits bottom right${F.has('cableLengthM') ? `, ${F.get('cableLengthM')} m clear` : ''}.`,
    'All dimensions in centimetres; LED flex length is an estimate.',
    'Made in a UK workshop. You approve this drawing before anything is made.'];
  g.text('Construction notes', RC.x, ry, { font: 'bold', size: 8.5 }); ry += 12;
  notes.forEach((t, i) => { const wrapped = wrap(t, 'reg', 7.5, RC.w - 14); wrapped.forEach((ln, j) => { if (ry > TB.y - 10) return; if (!j) g.text(`${i + 1}.`, RC.x, ry, { size: 7.5, rgb: C.soft }); g.text(ln, RC.x + 12, ry, { size: 7.5, rgb: C.soft }); ry += 10; }); ry += 2; });

  /* title block */
  const cells = [['Title', words || '—'], ['Acrylic', `${d.W} × ${d.H} cm`], ['LED flex', fmtMetres(flex)]];
  if (watts != null) cells.push(['Power', `${watts} W`]);
  cells.push(['Scale', `${fmtScale(scale)} on A4`], ['Date', today], ['Drawn by', 'Lit Neon'], ['Sheet', '1 of 1']);
  const widths = cells.map((c, i) => i === 0 ? 2.2 : 1); const tot = widths.reduce((s, x) => s + x, 0); let cx = TB.x;
  g.fill(C.white).rect(TB.x, TB.y, TB.w, TB.h, 'f').stroke(C.ink, 0.9).rect(TB.x, TB.y, TB.w, TB.h);
  cells.forEach(([k, v], i) => { const cw = TB.w * widths[i] / tot; if (i) g.stroke(C.rule, 0.5).line(cx, TB.y, cx, TB.y + TB.h); g.text(k.toUpperCase(), cx + 8, TB.y + 14, { font: 'bold', size: 6.5, rgb: C.soft }); g.text(fit(v, i === 0 ? 'bold' : 'mono', i === 0 ? 10 : 8.5, cw - 14), cx + 8, TB.y + 31, { font: i === 0 ? 'bold' : 'mono', size: i === 0 ? 10 : 8.5 }); cx += cw; });

  const bytes = await writePdf(g.ops.join('\n'), { title: `Lit Neon proof drawing: ${words || 'your sign'}`, date: clock.now() });
  return { bytes, scale, traced: !!(traced && traced.letters.length), dims: d };
}
function wrap(t, font, size, maxW) { const out = []; let cur = ''; for (const wd of t.split(' ')) { const nxt = cur ? cur + ' ' + wd : wd; if (textW(nxt, font, size) > maxW && cur) { out.push(cur); cur = wd; } else cur = nxt; } if (cur) out.push(cur); return out; }

/* ---------- the PDF file ---------- */
const latin1 = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff; return u; };
async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try { const cs = new CompressionStream('deflate'); const out = new Response(new Blob([bytes]).stream().pipeThrough(cs)); return new Uint8Array(await out.arrayBuffer()); } catch { return null; }
}
const pdfDate = d => { const p = n => String(n).padStart(2, '0'); return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`; };
async function writePdf(content, { title, date }) {
  const raw = latin1(content); const z = await deflate(raw);
  const stream = z || raw;
  const objs = [
    latin1('<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /DisplayDocTitle true >> >>'),
    latin1('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    latin1(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> >>`),
    null, /* content stream */
    latin1('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    latin1('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'),
    latin1('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'),
    latin1(`<< /Title ${pdfStr(title)} /Author (Lit Neon) /Subject (Proof drawing for approval) /Creator (Lit Neon v2 drawing-export) /Producer (Lit Neon v2) /CreationDate (${pdfDate(date)}) >>`)
  ];
  const parts = [latin1('%PDF-1.5\n%\xE2\xE3\xCF\xD3\n')]; let len = parts[0].length; const offs = [];
  objs.forEach((o, i) => {
    offs.push(len);
    const head = latin1(`${i + 1} 0 obj\n`);
    const body = o || (() => { const h = latin1(`<< /Length ${stream.length}${z ? ' /Filter /FlateDecode' : ''} >>\nstream\n`); const t = latin1('\nendstream'); const b = new Uint8Array(h.length + stream.length + t.length); b.set(h); b.set(stream, h.length); b.set(t, h.length + stream.length); return b; })();
    const tail = latin1('\nendobj\n'); parts.push(head, body, tail); len += head.length + body.length + tail.length;
  });
  const xref = len;
  parts.push(latin1(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  const total = parts.reduce((s, p) => s + p.length, 0); const out = new Uint8Array(total); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const slug = s => String(s || 'sign').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'sign';
export async function pdf(state, { filename, title } = {}) {
  const r = await build(state, { title }); const res = resolve(state);
  const blob = new Blob([r.bytes], { type: 'application/pdf' });
  const name = filename || `lit-neon-proof-${slug(res.words)}.pdf`;
  const url = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(blob) : '';
  return { blob, filename: name, url, scale: r.scale, traced: r.traced, pages: 1 };
}
/** convenience: build and trigger the download */
export async function download(state, opts) { const r = await pdf(state, opts); const a = document.createElement('a'); a.href = r.url; a.download = r.filename; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(r.url), 4000); return r; }
export default { pdf, download, build, traceLoops, svgToSegments, STUB };
