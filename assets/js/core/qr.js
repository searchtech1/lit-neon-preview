/* Lit Neon v2 — qr.js (WS0-C, brief §5.10/§5.11/§6.2): a thin wrapper over the vendored qrcode-generator 1.4.4
   (assets/vendor/qrcode.min.js, MIT). Same signatures as the freeze stub (CONTRACT.md E11), now SCANNABLE:
     render(el, text, { size, dark, light, ecc, margin }) → canvas   (crisp at any devicePixelRatio, whole device pixels per module)
     svg(text, size, { dark, light, ecc, margin, title }) → string    (one <path>, shape-rendering crispEdges)
     toDataURL(text, size, opts) → 'data:image/png;base64,…'          (browser; a canvas render)
     matrix(text, { ecc }) → { size, modules: Uint8Array[], version, ecc }   (pure, works in Node — what the tests decode)
   Text is encoded as UTF-8 bytes (gift messages can carry any character). Error correction defaults to 'M' and drops to
   'L' automatically when 'M' would need a version above 10 (long gift links), so the modules stay large enough to scan
   off a phone screen at the 112–160 px the share and AR sheets render. The quiet zone is the spec's 4 modules. */
import qrcode from '../../vendor/qrcode.min.js';

export const STUB = false;
const ECCS = ['L', 'M', 'Q', 'H'];
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

const cache = new Map();
/** the module matrix for `text`: { size, modules (rows of 0/1), version, ecc } */
export function matrix(text, { ecc } = {}) {
  const t = String(text ?? '');
  const key = (ecc || 'auto') + '\u0000' + t;
  if (cache.has(key)) return cache.get(key);
  const make = level => { const q = qrcode(0, level); q.addData(t, 'Byte'); q.make(); return q; };
  let level = ECCS.includes(ecc) ? ecc : 'M';
  let q = make(level);
  if (!ecc && q.getModuleCount() > 57 /* version 10 */) { level = 'L'; q = make(level); }
  const n = q.getModuleCount();
  const modules = Array.from({ length: n }, (_, y) => { const row = new Uint8Array(n); for (let x = 0; x < n; x++) row[x] = q.isDark(y, x) ? 1 : 0; return row; });
  const out = { size: n, modules, version: (n - 17) / 4, ecc: level };
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  cache.set(key, out);
  return out;
}

/** draws the code into a <canvas> inside `el` (reused if present). `size` is the CSS box including the quiet zone. */
export function render(el, text, { size = 128, dark = '#180E1F', light = '#ffffff', ecc, margin = 4, dpr: dprOpt } = {}) {
  if (!el) return null;
  let c = el.tagName === 'CANVAS' ? el : el.querySelector('canvas');
  if (!c) { c = document.createElement('canvas'); el.innerHTML = ''; el.appendChild(c); }
  const m = matrix(text, { ecc }); const cells = m.size + margin * 2;
  /* at least 2 bitmap pixels per CSS pixel: on a 1× desktop screen whole-pixel modules at 1× leave a wide white margin
     (a 41-cell code in 160 px draws at 123 px); at 2× it fills ~90 % of the box and the browser's pixelated downscale
     keeps every module edge hard (decoded from a real 1× screenshot in the WS0 QA) */
  const dpr = dprOpt || Math.min(3, Math.max(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1));
  /* whole device pixels per module, so no module edge is antialiased (scanners hate grey seams); the remainder widens the
     quiet zone evenly, so the bitmap is exactly size × dpr */
  const px = Math.max(cells, Math.round(size * dpr)); const unit = Math.max(1, Math.floor(px / cells)); const off = Math.floor((px - unit * cells) / 2) + margin * unit;
  c.width = px; c.height = px; c.style.width = c.style.height = size + 'px'; c.style.imageRendering = 'pixelated';
  c.setAttribute('role', 'img'); c.setAttribute('aria-label', 'QR code for ' + text); c.dataset.qrVersion = m.version; c.dataset.qrEcc = m.ecc; delete c.dataset.stub;
  c.dataset.qrText = String(text);
  const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = light; ctx.fillRect(0, 0, px, px); ctx.fillStyle = dark;
  for (let y = 0; y < m.size; y++) { const row = m.modules[y]; for (let x = 0; x < m.size; x++) if (row[x]) ctx.fillRect(off + x * unit, off + y * unit, unit, unit); }
  return c;
}

const escXml = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
/** a standalone SVG string (one path; runs of dark modules merged per row) */
export function svg(text, size = 128, { dark = '#180E1F', light = '#ffffff', ecc, margin = 4, title = 'QR code' } = {}) {
  const m = matrix(text, { ecc }); const n = m.size + margin * 2; let d = '';
  for (let y = 0; y < m.size; y++) { const row = m.modules[y]; let x = 0; while (x < m.size) { if (!row[x]) { x++; continue; } let e = x; while (e < m.size && row[e]) e++; d += `M${x + margin} ${y + margin}h${e - x}v1h-${e - x}z`; x = e; } }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="${escXml(title)}"><rect width="${n}" height="${n}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}

/** a PNG data URL of the code (browser only) */
export function toDataURL(text, size = 256, opts = {}) {
  const host = document.createElement('div'); return render(host, text, { ...opts, size, dpr: 1 }).toDataURL('image/png');
}

export default { render, svg, toDataURL, matrix, STUB };
