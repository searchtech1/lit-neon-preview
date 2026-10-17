/* core/ui.js — behaviour for the component library in css/components.css (brief §3.7):
   sheet · drawer · modal · toast · tabs · accordion · range · compare slider · lightbox · stepper · price · bnpl
   · express row · steps rail · pills · payment marks · empty state · skeleton · mini neon tile · icons.
   Every factory returns a small controller; every control carries the data-qa the caller passes in `qa`. */

import { trapFocus, setInert, lockScroll, unlockScroll, overlaysOpen, roving, announce, rememberFocus, onEscape, prefersReducedMotion, isTouch } from './a11y.js';
export { prefersReducedMotion, isTouch, announce, overlaysOpen };
import * as copy from './copy.js';
import * as clock from './clock.js';

const ROOT = new URL('../../../', import.meta.url);
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const money = await import('./money.js').catch(() => null);
/** £240 (whole pounds) or £36.01 when pence matter. */
export const gbp = n => money?.gbp ? money.gbp(n) : (Number.isInteger(+n) ? `£${(+n).toLocaleString('en-GB')}` : `£${(+n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const gbp2 = n => money?.gbp2 ? money.gbp2(n) : `£${(+n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* =========================== icons =========================== */
let spritePromise = null;
/** Inline the sprite once so <use href="#i-…"> works on every page (incl. guides/ and legal/). */
export function ensureSprite() {
  if (spritePromise) return spritePromise;
  spritePromise = (async () => {
    if (document.getElementById('ln-sprite')) return;
    try {
      const r = await fetch(new URL('assets/img/icons.svg', ROOT)); if (!r.ok) return;
      const div = document.createElement('div'); div.id = 'ln-sprite'; div.hidden = false; div.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      div.innerHTML = await r.text(); document.body.prepend(div);
    } catch {}
  })();
  return spritePromise;
}
export const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;

/* =========================== catalogue (lettering faces, tube colours) =========================== */
let catalogPromise = null;
export function catalog() {
  if (catalogPromise) return catalogPromise;
  catalogPromise = import(new URL('assets/vendor/engines/catalog.js', ROOT).href).then(m => m.default || window.LIT).catch(() => window.LIT || null).then(c => c || FALLBACK_CATALOG);
  return catalogPromise;
}
// Minimal mirror of shared/catalog.js ids → faces/colours, used only when the vendored engine has not been built yet.
const FALLBACK_CATALOG = {
  fonts: [{ id: 'soho', name: 'Soho', family: 'Neonderthaw' }, { id: 'shoreditch', name: 'Shoreditch', family: 'Tilt Neon' }, { id: 'brighton', name: 'Brighton', family: 'Pacifico' }, { id: 'mayfair', name: 'Mayfair', family: 'Sacramento' }, { id: 'camden', name: 'Camden', family: 'Monoton' }, { id: 'margate', name: 'Margate', family: 'Yellowtail' }, { id: 'notting', name: 'Notting Hill', family: 'Great Vibes' }, { id: 'brixton', name: 'Brixton', family: 'Righteous' }, { id: 'hackney', name: 'Hackney', family: 'Comfortaa', weight: 600 }, { id: 'leith', name: 'Leith', family: 'Kaushan Script' }],
  colours: [{ id: 'warm', name: 'Warm white', hex: '#ffc77a', core: '#fff6e6' }, { id: 'cool', name: 'Cool white', hex: '#cfeaff', core: '#ffffff' }, { id: 'ice', name: 'Ice blue', hex: '#4fd2ff' }, { id: 'blue', name: 'Electric blue', hex: '#2f6bff' }, { id: 'violet', name: 'Violet', hex: '#9b4dff' }, { id: 'pink', name: 'Hot pink', hex: '#ff3db4' }, { id: 'candy', name: 'Candy pink', hex: '#ff8ccf' }, { id: 'red', name: 'Red', hex: '#ff2b3d' }, { id: 'orange', name: 'Orange', hex: '#ff7a1a' }, { id: 'yellow', name: 'Golden yellow', hex: '#ffc23a' }, { id: 'green', name: 'Green', hex: '#2dff7a' }, { id: 'rgb', name: 'Colour changing', hex: '#ff2d55', rgb: true }]
};
let cat = FALLBACK_CATALOG; catalog().then(c => { cat = c; });
export const fontOf = id => (cat.fonts || []).find(f => f.id === id) || cat.fonts[0];
export const colourOf = id => (cat.colours || []).find(c => c.id === id) || cat.colours[0];

/** Mini neon tile: CSS text render in the lettering face with a glow (lit) or unlit. `img` swaps in a pre-rendered
    card image when it exists (removed on error so the text tile stays). */
export function mini({ text, font = 'soho', colour = 'pink', img, imgLit, lit = true, large = false, alt = '', eager = false } = {}) {
  const f = fontOf(font), c = colourOf(colour);
  const fam = `"${f.family}", cursive`; const w = f.weight ? `font-weight:${f.weight};` : '';
  const load = eager ? 'eager' : 'lazy';
  // `img` is the resting frame; `imgLit` (optional) is a second, lit frame that the parent fades in on hover/focus
  // (.c-mini img.lit). Once a frame has loaded the tile gets .has-img and the text fallback is hidden — never truncated.
  const mark = "this.parentNode.classList.add('has-img');this.closest('.c-card')?.classList.add('has-img')";
  return `<span class="c-mini${lit ? '' : ' is-off'}${large ? ' c-mini--lg' : ''}${imgLit ? ' c-mini--hover' : ''}" style="--tube:${c.hex}" aria-hidden="true">` +
    (img ? `<img src="${esc(img)}" alt="" loading="${load}" decoding="async" onload="${mark}" onerror="this.remove()">` : '') +
    (imgLit ? `<img class="lit" src="${esc(imgLit)}" alt="" loading="${load}" decoding="async" onerror="this.remove()">` : '') +
    `<span class="txt" style="font-family:${fam};${w}">${esc(text)}</span></span>`;
}

/* =========================== buttons =========================== */
export function setBusy(btn, busy = true) { if (!btn) return; btn.toggleAttribute('disabled', busy); btn.setAttribute('aria-busy', String(busy)); }
export function flashSuccess(btn, label, ms = 1500) {
  if (!btn) return; const old = btn.innerHTML; btn.classList.add('is-success'); btn.innerHTML = `${icon('check')}<span class="label">${esc(label || copy.t('ui.added', {}, 'Added ✓'))}</span>`;
  setTimeout(() => { btn.classList.remove('is-success'); btn.innerHTML = old; }, ms);
}

/* =========================== dialogs: sheet / drawer / modal / lightbox share one core =========================== */
function dialogCore(el, { onOpen, onClose, qa, initialFocus, closeOnLinks = false } = {}) {
  let scrim = null, release = null, uninert = null, restore = null, offEsc = null, open = false;
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.tabIndex = -1;
  if (qa) el.setAttribute('data-qa', qa);
  const api = {
    el,
    get isOpen() { return open; },
    open(opener) {
      if (open) return api; open = true;
      const remembered = rememberFocus();
      restore = opener instanceof Element ? () => { if (opener.isConnected) opener.focus({ preventScroll: true }); } : remembered;
      scrim = document.createElement('div'); scrim.className = 'c-scrim'; document.body.appendChild(scrim);
      requestAnimationFrame(() => scrim.classList.add('is-open'));
      scrim.addEventListener('click', () => api.close('scrim'));
      lockScroll(); uninert = setInert(el);
      el.classList.add('is-open'); el.removeAttribute('hidden');
      release = trapFocus(el, { initial: initialFocus === undefined ? undefined : initialFocus });
      offEsc = onEscape(() => api.close('escape'));
      document.dispatchEvent(new CustomEvent('ln:overlay', { detail: { open: true, el } }));
      onOpen?.(api); return api;
    },
    close(reason) {
      if (!open) return api; open = false;
      el.classList.remove('is-open'); scrim?.classList.remove('is-open');
      release?.(); uninert?.(); offEsc?.(); unlockScroll();
      const s = scrim; scrim = null;
      setTimeout(() => { s?.remove(); if (!open) el.setAttribute('hidden', ''); }, prefersReducedMotion() ? 0 : 500);
      document.dispatchEvent(new CustomEvent('ln:overlay', { detail: { open: false, el } }));
      onClose?.(reason, api); restore?.(); return api;
    },
    toggle(opener) { return open ? api.close() : api.open(opener); },
    destroy() { api.close(); setTimeout(() => el.remove(), 520); }
  };
  el.setAttribute('hidden', '');
  el.addEventListener('click', e => { if (e.target.closest('[data-close]')) api.close('button'); else if (closeOnLinks && e.target.closest('a[href]')) api.close('link'); });
  return api;
}

function dialogMarkup({ title, body = '', foot = '', titleTag = 'h2', count, handle = false, closeLabel }) {
  const hid = 'dlg-' + Math.random().toString(36).slice(2, 8);
  return { hid, html: `${handle ? '<div class="handle" aria-hidden="true"></div>' : ''}
<div class="c-dialog__head"><${titleTag} class="title" id="${hid}">${esc(title)}${count != null ? ` <span class="count">(${count})</span>` : ''}</${titleTag}>
<button type="button" class="c-btn c-btn--icon c-dialog__close" data-close aria-label="${esc(closeLabel || copy.t('ui.close', {}, 'Close'))}">${icon('close')}</button></div>
<div class="c-dialog__body">${body}</div>${foot ? `<div class="c-dialog__foot">${foot}</div>` : ''}` };
}

/** Bottom sheet (mobile) / side sheet or modal (≥1024). opts.modal → centred dialog at ≥1024. Drag-to-dismiss on touch. */
export function sheet({ title, body, foot, modal = false, qa, onOpen, onClose, count, closeOnLinks } = {}) {
  const el = document.createElement('div'); el.className = 'c-sheet' + (modal ? ' c-sheet--modal' : '');
  const { hid, html } = dialogMarkup({ title, body, foot, count, handle: true }); el.innerHTML = html; el.setAttribute('aria-labelledby', hid);
  document.body.appendChild(el);
  const api = dialogCore(el, { onOpen, onClose, qa, closeOnLinks });
  // drag to dismiss (touch, bottom-sheet layout only)
  let y0 = null, dy = 0;
  el.addEventListener('pointerdown', e => { if (matchMedia('(min-width: 1024px)').matches) return; if (!e.target.closest('.handle, .c-dialog__head')) return; y0 = e.clientY; dy = 0; el.classList.add('is-dragging'); el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); el.style.transform = `translateY(${dy}px)`; });
  const end = () => { if (y0 === null) return; el.classList.remove('is-dragging'); el.style.transform = ''; if (dy > 120) api.close('drag'); y0 = null; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  api.setBody = html => { el.querySelector('.c-dialog__body').innerHTML = html; return api; };
  api.body = () => el.querySelector('.c-dialog__body');
  return api;
}
/** Drawer: basket (right, 420 px) or nav (right, 100 %). */
export function drawer({ title, body, foot, nav = false, qa, onOpen, onClose, count, closeOnLinks = nav } = {}) {
  const el = document.createElement('div'); el.className = 'c-drawer' + (nav ? ' c-drawer--nav ch-drawer' : '');
  const { hid, html } = dialogMarkup({ title, body, foot, count }); el.innerHTML = html; el.setAttribute('aria-labelledby', hid);
  document.body.appendChild(el);
  const api = dialogCore(el, { onOpen, onClose, qa, closeOnLinks });
  api.setBody = html => { el.querySelector('.c-dialog__body').innerHTML = html; return api; };
  api.setFoot = html => { let f = el.querySelector('.c-dialog__foot'); if (!f) { f = document.createElement('div'); f.className = 'c-dialog__foot'; el.appendChild(f); } f.innerHTML = html; return api; };
  api.setCount = n => { const c = el.querySelector('.count'); if (c) c.textContent = `(${n})`; return api; };
  api.body = () => el.querySelector('.c-dialog__body');
  return api;
}
/** Modal ≤ 640 px; becomes a sheet < 768. Focus lands on the heading (no autofocus into inputs on mobile). */
export function modal({ title, body, foot, qa, onOpen, onClose } = {}) {
  const el = document.createElement('div'); el.className = 'c-modal';
  const { hid, html } = dialogMarkup({ title, body, foot }); el.innerHTML = html; el.setAttribute('aria-labelledby', hid);
  document.body.appendChild(el);
  const api = dialogCore(el, { onOpen, onClose, qa, initialFocus: el.querySelector(`#${hid}`) });
  api.setBody = h => { el.querySelector('.c-dialog__body').innerHTML = h; return api; };
  api.body = () => el.querySelector('.c-dialog__body');
  return api;
}

/* =========================== toast =========================== */
let toastEl = null, toastTimer = null;
/** One at a time, 3.4 s, role=status; suppressed while any drawer/sheet is open (feedback then lives inline). */
export function toast(text, { kind = 'ok', action, duration = 3400, qa } = {}) {
  if (overlaysOpen() > 0) return null;
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'c-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); document.body.appendChild(toastEl); }
  clearTimeout(toastTimer);
  toastEl.className = `c-toast c-toast--${kind}`; if (qa) toastEl.setAttribute('data-qa', qa); else toastEl.removeAttribute('data-qa');
  toastEl.innerHTML = `${icon(kind === 'bad' ? 'warning' : kind === 'info' ? 'info' : 'check')}<span>${esc(text)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) toastEl.querySelector('button').addEventListener('click', () => { action.onClick?.(); hideToast(); });
  requestAnimationFrame(() => toastEl.classList.add('is-open'));
  toastTimer = setTimeout(hideToast, duration);
  return { hide: hideToast };
}
export function hideToast() { toastEl?.classList.remove('is-open'); }

/* =========================== tabs =========================== */
/** root contains [role=tablist] > [role=tab][aria-controls]; panels anywhere in the document. Arrow keys, Home/End;
    the active tab is scrolled into view. Returns { select(idOrIndex), destroy } */
export function tabs(root, { onChange, activate = 'auto' } = {}) {
  const list = root.matches('[role="tablist"]') ? root : root.querySelector('[role="tablist"]');
  const tabEls = () => Array.from(list.querySelectorAll('[role="tab"]'));
  function revealTab(el) {   // horizontal only: never scroll the page (a tab bar may be far below the fold at init)
    const l = list, lr = l.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (l.scrollWidth <= l.clientWidth + 1) return;
    const target = l.scrollLeft + (r.left - lr.left) - (lr.width - r.width) / 2;
    l.scrollTo({ left: Math.max(0, target), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
  function select(t, { focus = false, scroll = true } = {}) {
    const el = typeof t === 'number' ? tabEls()[t] : (typeof t === 'string' ? tabEls().find(x => x.id === t || x.getAttribute('aria-controls') === t) : t);
    if (!el) return;
    tabEls().forEach(x => { const on = x === el; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; const p = document.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !on; });
    if (scroll) revealTab(el);
    if (focus) el.focus();
    onChange?.(el, el.getAttribute('aria-controls'));
  }
  list.addEventListener('click', e => { const t = e.target.closest('[role="tab"]'); if (t && list.contains(t)) select(t); });
  const rov = roving(list, '[role="tab"]', { onMove: el => { if (activate === 'auto') select(el); } });
  const cur = tabEls().find(x => x.getAttribute('aria-selected') === 'true') || tabEls()[0];
  if (cur) select(cur, { scroll: false });
  return { select, destroy: () => rov.destroy() };
}

/* =========================== accordion =========================== */
/** <details> based; single-open closes siblings; content stays in the DOM. `deepLink` opens #id on load/hashchange. */
export function accordion(root, { single = false, deepLink = true } = {}) {
  const items = () => Array.from(root.querySelectorAll(':scope > details'));
  root.addEventListener('toggle', e => { if (single && e.target.open) items().forEach(d => { if (d !== e.target) d.open = false; }); }, true);
  function openHash() {
    const id = location.hash.slice(1); if (!id) return;
    const d = root.querySelector(`details#${CSS.escape(id)}`) || document.getElementById(id)?.closest('details');
    if (d && root.contains(d)) { d.open = true; d.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); }
  }
  if (deepLink) { openHash(); window.addEventListener('hashchange', openHash); }
  return { open: id => { const d = root.querySelector(`#${CSS.escape(id)}`); if (d) d.open = true; }, closeAll: () => items().forEach(d => { d.open = false; }), destroy: () => deepLink && window.removeEventListener('hashchange', openHash) };
}

/* =========================== range =========================== */
/** root = .c-range containing input[type=range]; opts.ticks = labels array (snaps to tick indexes when the input's
    step divides the range); opts.text(value) → aria-valuetext in words; PageUp/Down = 5 steps. */
export function range(root, { ticks, text, onInput, onChange } = {}) {
  const input = root.querySelector('input[type="range"]');
  const readout = root.querySelector('.readout');
  let tickEls = [];
  if (ticks) {
    let t = root.querySelector('.ticks'); if (!t) { t = document.createElement('div'); t.className = 'ticks'; root.appendChild(t); }
    t.innerHTML = ticks.map(l => `<span>${esc(l)}</span>`).join(''); tickEls = Array.from(t.children);
    t.addEventListener('click', e => { const i = tickEls.indexOf(e.target); if (i >= 0) { const min = +input.min, max = +input.max; input.value = String(min + i * (max - min) / (ticks.length - 1)); fire(true); } });
  }
  function paint() {
    const min = +input.min || 0, max = +input.max || 100, v = +input.value; const pct = ((v - min) / (max - min)) * 100;
    root.style.setProperty('--pct', pct + '%');
    const words = text ? text(v) : String(v); input.setAttribute('aria-valuetext', words);
    if (readout) readout.textContent = words;
    if (tickEls.length) { const i = Math.round(((v - min) / (max - min)) * (tickEls.length - 1)); tickEls.forEach((el, k) => el.classList.toggle('is-active', k === i)); }
  }
  function fire(change) { paint(); onInput?.(+input.value); if (change) onChange?.(+input.value); }
  input.addEventListener('input', () => fire(false)); input.addEventListener('change', () => fire(true));
  input.addEventListener('keydown', e => {
    const step = +input.step || 1; let v = null;
    if (e.key === 'PageUp') v = +input.value + 5 * step; else if (e.key === 'PageDown') v = +input.value - 5 * step;
    if (v !== null) { e.preventDefault(); input.value = String(Math.max(+input.min, Math.min(+input.max, v))); fire(true); }
  });
  paint();
  return { get value() { return +input.value; }, set(v) { input.value = String(v); fire(true); }, paint, input };
}

/* =========================== compare slider =========================== */
/** root = .c-compare > .a, .b, .divider, .thumb(role=slider). Pointer drag + arrow keys; touch-action: pan-y keeps the
    page scrolling vertically. Position is a 0–100 percentage on --pos. */
export function compare(root, { onChange, initial = 50, labelA, labelB } = {}) {
  const thumb = root.querySelector('.thumb') || (() => { const t = document.createElement('div'); t.className = 'thumb'; t.innerHTML = icon('drag'); root.appendChild(t); return t; })();
  if (!root.querySelector('.divider')) { const d = document.createElement('div'); d.className = 'divider'; root.insertBefore(d, thumb); }
  thumb.setAttribute('role', 'slider'); thumb.tabIndex = 0; thumb.setAttribute('aria-valuemin', '0'); thumb.setAttribute('aria-valuemax', '100');
  thumb.setAttribute('aria-label', root.getAttribute('aria-label') || `${labelA || copy.t('ui.before', {}, 'Before')} / ${labelB || copy.t('ui.after', {}, 'After')}`);
  let pos = initial;
  function set(p, fire = true) { pos = Math.max(0, Math.min(100, p)); root.style.setProperty('--pos', pos + '%'); thumb.setAttribute('aria-valuenow', String(Math.round(pos))); thumb.setAttribute('aria-valuetext', `${Math.round(pos)}% ${labelA || ''}`.trim()); if (fire) onChange?.(pos); }
  function fromEvent(e) { const r = root.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); }
  let dragging = false;
  root.addEventListener('pointerdown', e => { if (e.button !== 0 && e.pointerType === 'mouse') return; dragging = true; root.setPointerCapture(e.pointerId); fromEvent(e); thumb.focus({ preventScroll: true }); });
  root.addEventListener('pointermove', e => { if (dragging) fromEvent(e); });
  const up = () => { dragging = false; };
  root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
  thumb.addEventListener('keydown', e => {
    const k = e.key; let d = 0;
    if (k === 'ArrowLeft' || k === 'ArrowDown') d = -2; else if (k === 'ArrowRight' || k === 'ArrowUp') d = 2; else if (k === 'PageDown') d = -10; else if (k === 'PageUp') d = 10; else if (k === 'Home') { e.preventDefault(); return set(0); } else if (k === 'End') { e.preventDefault(); return set(100); }
    if (d) { e.preventDefault(); set(pos + d); }
  });
  set(initial, false);
  return { set, get value() { return pos; } };
}

/* =========================== lightbox =========================== */
/** items: [{ src, alt, caption }]. Pinch/scroll zoom, arrows, Escape, focus return. */
export function lightbox({ items = [], index = 0, qa } = {}) {
  const el = document.createElement('div'); el.className = 'c-lightbox'; el.setAttribute('aria-label', 'Image viewer');
  el.innerHTML = `<div class="c-lightbox__bar"><button type="button" class="c-btn c-btn--icon" data-close aria-label="${esc(copy.t('ui.close', {}, 'Close'))}">${icon('close')}</button></div>
<div class="c-lightbox__stage"><img alt="">${items.length > 1 ? `<button type="button" class="c-btn c-btn--icon c-btn--ghost c-lightbox__nav prev" aria-label="${esc(copy.t('ui.prev', {}, 'Previous'))}">${icon('chevron-left')}</button><button type="button" class="c-btn c-btn--icon c-btn--ghost c-lightbox__nav next" aria-label="${esc(copy.t('ui.next', {}, 'Next'))}">${icon('chevron-right')}</button>` : ''}</div>
<div class="c-lightbox__cap"><span class="cap"></span><span class="t-caption">${items.length > 1 ? '<span class="idx"></span> · ' : ''}${esc(copy.t('ui.zoom', {}, 'Pinch or scroll to zoom'))}</span></div>`;
  document.body.appendChild(el);
  const img = el.querySelector('img'), stage = el.querySelector('.c-lightbox__stage');
  let i = index, scale = 1, tx = 0, ty = 0;
  const paint = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
  function show(k) { i = (k + items.length) % items.length; const it = items[i]; img.src = it.src; img.alt = it.alt || ''; el.querySelector('.cap').textContent = it.caption || ''; const idx = el.querySelector('.idx'); if (idx) idx.textContent = `${i + 1} / ${items.length}`; scale = 1; tx = ty = 0; paint(); }
  const api = dialogCore(el, { qa, initialFocus: el.querySelector('[data-close]') });
  const baseOpen = api.open; api.open = (k = i, opener) => { show(k); return baseOpen(opener); };
  el.querySelector('.prev')?.addEventListener('click', () => show(i - 1)); el.querySelector('.next')?.addEventListener('click', () => show(i + 1));
  el.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') show(i - 1); if (e.key === 'ArrowRight') show(i + 1); });
  stage.addEventListener('wheel', e => { e.preventDefault(); scale = Math.max(1, Math.min(4, scale - e.deltaY * 0.002)); if (scale === 1) { tx = ty = 0; } paint(); }, { passive: false });
  const pts = new Map(); let d0 = 0, s0 = 1, p0 = null;
  stage.addEventListener('pointerdown', e => { pts.set(e.pointerId, e); stage.setPointerCapture(e.pointerId); if (pts.size === 2) { const [a, b] = [...pts.values()]; d0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); s0 = scale; } else p0 = { x: e.clientX - tx, y: e.clientY - ty }; });
  stage.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e); if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); scale = Math.max(1, Math.min(4, s0 * d / d0)); paint(); } else if (scale > 1 && p0) { tx = e.clientX - p0.x; ty = e.clientY - p0.y; paint(); } });
  const lift = e => { pts.delete(e.pointerId); if (pts.size < 2) p0 = null; };
  stage.addEventListener('pointerup', lift); stage.addEventListener('pointercancel', lift);
  img.addEventListener('dblclick', () => { scale = scale > 1 ? 1 : 2; tx = ty = 0; paint(); });
  return api;
}

/* =========================== stepper =========================== */
export function stepper(root, { min = 1, max = 10, value = 1, onChange, moreHref, qa } = {}) {
  root.classList.add('c-qty'); if (qa) root.setAttribute('data-qa', qa);
  root.innerHTML = `<button type="button" aria-label="Fewer" ${qa ? `data-qa="${qa}.minus"` : ''}>${icon('minus')}</button><output aria-live="polite" ${qa ? `data-qa="${qa}.value"` : ''}>${value}</output><button type="button" aria-label="More" ${qa ? `data-qa="${qa}.plus"` : ''}>${icon('plus')}</button>`;
  const [minus, plus] = root.querySelectorAll('button'); const out = root.querySelector('output');
  let more = null;
  function set(v, fire = true) {
    value = Math.max(min, Math.min(max, v)); out.value = String(value); minus.disabled = value <= min; plus.disabled = value >= max;
    if (value >= max && moreHref) { if (!more) { more = document.createElement('div'); more.className = 'c-qty__more'; more.innerHTML = `<a href="${esc(moreHref)}">${esc(copy.t('ui.more', {}, 'Need more? Bulk quote'))}</a>`; root.after(more); } } else { more?.remove(); more = null; }
    if (fire) onChange?.(value);
  }
  minus.addEventListener('click', () => set(value - 1)); plus.addEventListener('click', () => set(value + 1));
  set(value, false);
  return { set, get value() { return value; } };
}

/* =========================== price =========================== */
/** data = { payable, everyday, quote?: boolean, quoteReason?, reason?, reasonOk?, breakdown?: [{ label, amount, step }],
    promo?: { live, end (Date|ISO), pct }, variant: 'dock'|'inline'|'card', onEdit(step) }.
    Shows one payable price; the §3.7a promo line beneath only while promo.live; never a strikethrough or a saving. */
export function price(root, data = {}) {
  const { variant = 'dock', qa } = data;
  root.className = `c-price c-price--${variant}`; if (qa) root.setAttribute('data-qa', qa);
  root.setAttribute('aria-live', 'polite');
  function render(d) {
    data = { ...data, ...d };
    const { payable, everyday, quote, quoteReason, reason, reasonOk, breakdown, promo } = data;
    let html = '';
    if (quote) html += `<div class="amount is-quote" ${qa ? `data-qa="${qa}.amount"` : ''}>${esc(copy.t('price.quote', {}, 'Quote'))}</div><div class="reason">${esc(quoteReason || copy.t('price.quoteWhy', {}, 'We price this one by hand'))}</div>`;
    else {
      html += `<div class="amount" ${qa ? `data-qa="${qa}.amount"` : ''}>${gbp(payable)}</div>`;
      if (promo?.live && everyday != null && promo.end) {
        const date = clock.format(clock.addDays(new Date(promo.end), 1));
        html += `<div class="promo" ${qa ? `data-qa="${qa}.promo"` : ''}><span class="c-pill c-pill--launch">${esc(copy.t('pills.launch', {}, 'Launch price'))}</span>${esc(copy.t('promo.line', { everyday: gbp(everyday), date }, 'Launch price · everyday {everyday} from {date}').replace(/^Launch price · /, ''))}</div>`;
      }
      html += `<div class="reason${reasonOk ? ' is-ok' : ''}" ${qa ? `data-qa="${qa}.reason"` : ''}>${esc(reason || '')}</div>`;
      if (breakdown?.length) {
        html += `<button type="button" class="breakdown-toggle" aria-expanded="false" ${qa ? `data-qa="${qa}.breakdown"` : ''}>${esc(copy.t('price.breakdown', {}, 'Price breakdown'))}${icon('chevron-down', 'ic--sm')}</button><div class="breakdown" hidden>` +
          breakdown.map(b => `<div><span>${esc(b.label)}${b.step && data.onEdit ? ` <button type="button" data-step="${esc(b.step)}">${esc(copy.t('price.edit', {}, 'Edit'))}</button>` : ''}</span><b>${b.amount === 0 ? esc(copy.t('pills.included', {}, 'Included')) : (b.amount > 0 && b.delta ? '+' : '') + gbp(b.amount)}</b></div>`).join('') +
          `<div class="total"><span>${esc(copy.t('price.total', {}, 'Total'))}</span><b>${gbp(payable)}</b></div></div>`;
      }
    }
    root.innerHTML = html;
    const tog = root.querySelector('.breakdown-toggle');
    tog?.addEventListener('click', () => { const b = root.querySelector('.breakdown'); const open = b.hidden; b.hidden = !open; tog.setAttribute('aria-expanded', String(open)); tog.firstChild.textContent = copy.t(open ? 'price.hide' : 'price.breakdown', {}, open ? 'Hide breakdown' : 'Price breakdown'); });
    root.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => data.onEdit?.(b.dataset.step)));
    return api;
  }
  const api = { render, el: root };
  return render({});
}

/* =========================== BNPL =========================== */
let bnplCfg = null;
export async function bnplConfig() { if (bnplCfg) return bnplCfg; try { const r = await fetch(new URL('config/bnpl.json', ROOT)); bnplCfg = r.ok ? await r.json() : { providers: [] }; } catch { bnplCfg = { providers: [] }; } return bnplCfg; }
/** Renders one line per provider whose limits include `total`; hidden when none apply or `quote` is true. */
export async function bnpl(root, total, { quote = false, qa } = {}) {
  root.classList.add('c-bnpl'); if (qa) root.setAttribute('data-qa', qa);
  const cfg = await bnplConfig();
  const rows = quote ? [] : (cfg.providers || []).filter(p => p.enabled !== false && total >= p.minTotal && total <= p.maxTotal);
  if (!rows.length) { root.hidden = true; root.innerHTML = ''; return root; }
  root.hidden = false;
  root.innerHTML = (await Promise.all(rows.map(async p => `<div data-provider="${p.id}">${await markSvg(p.mark)}<span>${esc(fillTemplate(p.template, { instalment: gbp2(total / p.parts) }))}</span></div>`))).join('');
  return root;
}
const fillTemplate = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));

/* =========================== payment marks & express row =========================== */
let payCfg = null; const markCache = new Map();
let payP = null; export function paymentsConfig() { return payP || (payP = paymentsConfigFetch()); } /* one in-flight fetch shared by every caller */
async function paymentsConfigFetch() { if (payCfg) return payCfg; try { const r = await fetch(new URL('config/payments.json', ROOT)); payCfg = r.ok ? await r.json() : { express: [], marks: [] }; } catch { payCfg = { express: [], marks: [] }; } return payCfg; }
async function markSvg(rel) {
  if (markCache.has(rel)) return markCache.get(rel);
  const p = (async () => { try { const r = await fetch(new URL('assets/img/' + rel, ROOT)); if (r.ok) return (await r.text()).replace(/<\?xml[^>]*>/, ''); } catch {} return ''; })();
  markCache.set(rel, p); return p;
}
/** Row of payment marks (footer, checkout, drawer). */
export async function paymentMarks(root, { qa } = {}) {
  const cfg = await paymentsConfig(); if (qa) root.setAttribute('data-qa', qa);
  root.innerHTML = (await Promise.all(cfg.marks.map(async m => `<span title="${esc(m.name)}" aria-label="${esc(m.name)}" role="img">${await markSvg(m.mark)}</span>`))).join('');
  return root;
}
/** Express buttons (Apple Pay · Google Pay · Shop Pay · PayPal). onPick(id) adds the line and navigates. */
export async function expressRow(root, { onPick, hidden = false, qa = 'express' } = {}) {
  const cfg = await paymentsConfig(); root.classList.add('c-express'); root.hidden = hidden;
  const list = cfg.express.filter(p => p.enabled !== false);
  root.innerHTML = (await Promise.all(list.map(async p => `<button type="button" class="c-btn c-btn--express" data-provider="${p.id}" data-qa="${qa}.${p.id}" aria-label="Pay with ${esc(p.name)}">${await markSvg(p.mark)}</button>`))).join('');
  root.querySelectorAll('button').forEach(b => b.addEventListener('click', () => onPick?.(b.dataset.provider, b)));
  return { el: root, setHidden: h => { root.hidden = h; } };
}

/* =========================== steps rail =========================== */
/** steps: [{ id, label }], current id, done: [ids]; click/Enter jumps via onJump(id). vertical → .c-steps--vertical */
export function steps(root, { steps: list = [], current, done = [], onJump, vertical = false, qa } = {}) {
  root.className = 'c-steps' + (vertical ? ' c-steps--vertical' : ''); root.setAttribute('role', 'list'); if (qa) root.setAttribute('data-qa', qa);
  function render(cur = current, dn = done) {
    current = cur; done = dn;
    root.innerHTML = list.map((s, i) => `<li role="listitem" class="${done.includes(s.id) ? 'is-done' : ''}${s.id === current ? ' is-current' : ''}"><button type="button" data-id="${esc(s.id)}" ${qa ? `data-qa="${qa}.${esc(s.id)}"` : ''} ${s.id === current ? 'aria-current="step"' : ''}><span class="dot">${done.includes(s.id) ? icon('check') : i + 1}</span><span>${esc(s.label)}</span></button></li>`).join('');
    root.querySelectorAll('button').forEach(b => b.addEventListener('click', () => onJump?.(b.dataset.id)));
    return api;
  }
  const api = { render, el: root };
  return render();
}

/* =========================== pills / empty / skeleton =========================== */
export function pill(kind, text) {
  const label = text ?? copy.t(`pills.${kind}`, {}, kind);
  return `<span class="c-pill c-pill--${kind}">${kind === 'rendered' ? icon('image', 'ic--sm') : ''}${esc(label)}</span>`;
}
/** Empty state with a drafting illustration. kind: basket | search | filters */
export function empty({ kind = 'search', text, cta, ghost, qa } = {}) {
  return `<div class="c-empty" ${qa ? `data-qa="${qa}"` : ''}><img src="${new URL(`assets/img/empty/${kind}.svg`, ROOT).href}" alt="" width="160" height="120"><p>${esc(text)}</p><div class="actions">${cta ? `<a class="c-btn c-btn--primary" href="${esc(cta.href)}" ${cta.qa ? `data-qa="${cta.qa}"` : ''}>${esc(cta.label)}</a>` : ''}${ghost ? `<a class="c-btn c-btn--ghost" href="${esc(ghost.href)}" ${ghost.qa ? `data-qa="${ghost.qa}"` : ''}>${esc(ghost.label)}</a>` : ''}</div></div>`;
}
export const skeleton = (kind = 'card') => `<div class="c-skel c-skel--${kind}" aria-hidden="true"></div>`;

/* =========================== email validation (shared by footer capture and forms) =========================== */
export function validEmail(v) {
  const s = String(v || '').trim();
  const m = s.match(/^[^\s@]+@([^\s@]+)$/); if (!m) return false;
  const domain = m[1]; const parts = domain.split('.');
  return parts.length >= 2 && parts.every(p => p.length > 0) && parts[parts.length - 1].length >= 2 && !/[^a-z0-9.-]/i.test(domain);
}

export const ui = { esc, gbp, gbp2, ensureSprite, icon, catalog, fontOf, colourOf, mini, setBusy, flashSuccess, sheet, drawer, modal, toast, hideToast, tabs, accordion, range, compare, lightbox, stepper, price, bnpl, bnplConfig, paymentsConfig, paymentMarks, expressRow, steps, pill, empty, skeleton, validEmail, isTouch, prefersReducedMotion, announce };
export default ui;

/** review snippet (owner 2026-10-17): stars + rating + count from a design's REAL review data { rating, count }.
    Renders nothing without data, so no figure is ever shown that isn't backed by genuine reviews. */
export function ratingHtml(r, { qa = '', compact = false } = {}) {
  if (!r || !(+r.count > 0) || !(+r.rating > 0)) return '';
  const v = Math.max(0, Math.min(5, +r.rating)), pct = (v / 5 * 100).toFixed(1), star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 6 6.5.6-4.9 4.3 1.5 6.4L12 16.8l-5.9 3.3 1.5-6.4-4.9-4.3 6.5-.6z"/></svg>';
  return `<span class="c-rating${compact ? ' c-rating--sm' : ''}"${qa ? ` data-qa="${qa}"` : ''} aria-label="Rated ${v.toFixed(1)} out of 5 from ${(+r.count).toLocaleString('en-GB')} reviews"><span class="stars" aria-hidden="true"><span class="base">${star.repeat(5)}</span><span class="fill" style="width:${pct}%">${star.repeat(5)}</span></span><b>${v.toFixed(1)}</b><span class="n">(${(+r.count).toLocaleString('en-GB')})</span></span>`;
}
