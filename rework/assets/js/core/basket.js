/* Lit Neon v2 — basket (brief §4.18, §4.19, §6.2): the store (localStorage.basket), merge by specHash, qty, edit,
   inline undo, re-price from the stored spec on every render, the per-kind Shopify /cart/add.js payload, the delivery
   line, events — and the global drawer (markup template lives here: foundation-owned, pages request changes via
   INTEGRATION.md). Prices are never stored: every render recomputes them from the spec under the live clock (§3.7a).
   Line kinds: custom · photo · ready · quote. Quote lines never reach payload().items (they go out via forms.submit).
   Node-safe: createBasket({ storage, pricing, resolve, variants, now }) — the drawer is DOM-only and mounted on demand. */
import { resolve as resolveDesign, OPTIONS, fontOf, colourOf, sizeOf, backingOf, finishOf, hangOf, useOf, jacketOf } from './renderer.js';
import pricingDefault from './pricing.js';
import * as clock from './clock.js';
import { gbp, esc, fmtDims, sayDims } from './money.js';

export const KINDS = ['custom', 'photo', 'ready', 'quote'];
const STRIP = ['pos', 'scene', 'view', 'night', 'on', 'unit', 'v'];

/** stable hash of what the workshop would make — identical specs merge into one line */
export function specHash(state, kind = 'custom', extra = {}) {
  const st = resolveDesign(state).state; const o = {};
  for (const k of Object.keys(st).sort()) if (!STRIP.includes(k)) o[k] = st[k];
  const s = kind + '|' + JSON.stringify(o) + '|' + JSON.stringify(extra);
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function createBasket({ storage, pricing = pricingDefault, resolve = resolveDesign, variants = null, now = () => clock.now().getTime(), undoMs = 5000 } = {}) {
  const store = storage === undefined ? (() => { try { return globalThis.localStorage || null; } catch { return null; } })() : storage;
  const KEY = 'basket';
  const read = () => { try { const v = JSON.parse((store && store.getItem(KEY)) || '[]'); return Array.isArray(v) ? v.filter(l => l && l.uid && KINDS.includes(l.kind)) : []; } catch { return []; } };
  let lines = read(); let variantMap = variants; const removed = new Map();
  const target = typeof EventTarget !== 'undefined' ? new EventTarget() : null; const subs = new Set();
  const emit = (type, detail) => { subs.forEach(fn => { try { fn(type, detail); } catch {} }); if (target && typeof CustomEvent !== 'undefined') target.dispatchEvent(new CustomEvent(type, { detail })); };
  const save = () => { try { store && store.setItem(KEY, JSON.stringify(lines)); } catch {} emit('change', { lines }); if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('ln:basket', { detail: { count: signs(), signs: signs(), lines: lines.length } })); };
  const uid = () => now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (typeof window !== 'undefined' && store === globalThis.localStorage) window.addEventListener('storage', e => { if (e.key === KEY) { lines = read(); emit('change', { lines, external: true }); } });

  /** add({ kind, state, qty, meta }) → { uid, merged, line }. Identical specs merge (qty += n). */
  function add({ kind = 'custom', state, qty = 1, meta = {} }) {
    if (!KINDS.includes(kind)) throw new Error('unknown line kind ' + kind);
    const st = resolve(state).state; const hash = specHash(st, kind, kind === 'ready' ? { design: meta.design } : kind === 'photo' ? { photoHash: meta.photoHash } : {});
    const existing = kind === 'quote' ? null : lines.find(l => l.specHash === hash);
    if (existing) { existing.qty = Math.min(10, existing.qty + qty); existing.updatedAt = now(); save(); emit('add', { line: existing, merged: true }); return { uid: existing.uid, merged: true, line: existing }; }
    const line = { uid: uid(), kind, state: st, qty: Math.max(1, Math.min(10, qty)), specHash: hash, addedAt: now(), updatedAt: now(), meta };
    lines.push(line); save(); emit('add', { line, merged: false }); return { uid: line.uid, merged: false, line };
  }
  function get(id) { return lines.find(l => l.uid === id) || null; }
  /** remove → { undo() } ; the line can be restored for undoMs (drawer shows "Removed · Undo") */
  function remove(id) {
    const i = lines.findIndex(l => l.uid === id); if (i < 0) return { undo() { return false; } };
    const [line] = lines.splice(i, 1); const at = i; save(); emit('remove', { line });
    const t = setTimeout(() => removed.delete(id), undoMs); removed.set(id, { line, at, t });
    return { undo() { const r = removed.get(id); if (!r) return false; clearTimeout(r.t); removed.delete(id); lines.splice(Math.min(r.at, lines.length), 0, r.line); save(); emit('add', { line: r.line, merged: false, restored: true }); return true; } };
  }
  function undo(id) { const r = removed.get(id); if (!r) return false; clearTimeout(r.t); removed.delete(id); lines.splice(Math.min(r.at, lines.length), 0, r.line); save(); emit('add', { line: r.line, restored: true }); return true; }
  function setQty(id, n) { const l = get(id); if (!l) return; l.qty = Math.max(1, Math.min(10, Math.round(n) || 1)); l.updatedAt = now(); save(); }
  /** edit: replace the spec; merges into another identical line if one exists */
  function update(id, state, meta) {
    const l = get(id); if (!l) return null; const st = resolve(state).state; if (meta) Object.assign(l.meta, meta);
    const hash = specHash(st, l.kind, l.kind === 'ready' ? { design: l.meta.design } : l.kind === 'photo' ? { photoHash: l.meta.photoHash } : {});
    const other = lines.find(x => x.uid !== id && x.specHash === hash);
    if (other) { other.qty = Math.min(10, other.qty + l.qty); lines = lines.filter(x => x.uid !== id); save(); return other; }
    l.state = st; l.specHash = hash; l.updatedAt = now(); save(); return l;
  }
  function clear() { lines = []; save(); }
  function useVariants(map) { variantMap = map; }

  /* ---------- prices (recomputed, never stored) ---------- */
  function priceLine(line) {
    if (line.kind === 'quote') return { kind: 'quote', everyday: null, payable: null, reason: line.meta.reason || 'Quoted separately' };
    if (line.kind === 'photo' && line.meta.ledMetres) { const p = pricing.photo(line.meta.ledMetres, line.meta.heightCm, { backing: line.state.backing, finish: line.state.board, rgb: colourOf(line.state.colour).rgb }); return p.kind === 'price' ? { kind: 'price', everyday: p.everyday, payable: p.payable } : { kind: 'quote', everyday: null, payable: null }; }
    const p = pricing.price(line.state);
    return p.kind === 'price' ? { kind: 'price', everyday: p.everyday, payable: p.payable, promoLine: p.promoLine } : { kind: p.kind, everyday: null, payable: null, reason: pricing.quoteReason(p) };
  }
  function subtotal() {
    let everyday = 0, payable = 0, quotes = 0, items = 0;
    for (const l of lines) { const p = priceLine(l); if (p.kind === 'price') { everyday += p.everyday * l.qty; payable += p.payable * l.qty; items += l.qty; } else quotes++; }
    return { everyday: Math.round(everyday * 100) / 100, payable: Math.round(payable * 100) / 100, discount: Math.round((everyday - payable) * 100) / 100, quotes, items, promo: pricing.promoLive() };
  }
  const count = () => lines.length;
  /** how many SIGNS are in the basket (sum of line quantities) — what the header badge shows (round-2 review) */
  const signs = () => lines.reduce((n, l) => n + (Math.max(1, +l.qty || 1)), 0);

  /* ---------- spec + payload (§4.18) ---------- */
  function specFor(line, p = priceLine(line)) {
    const res = resolve(line.state); const st = res.state;
    const colours = st.colours ? res.lineColours.map(c => c.name) : [res.colour.name];
    return { v: 3, kind: line.kind, lines: res.lines, align: st.align, icon: st.icon || null, iconPos: st.icon ? st.iconPos : null,
      lettering: res.font.name, font_family: res.font.family, colour: res.colour.name, colour_hex: res.colour.hex, colours, rgb: res.rgb, jacket: st.jacket,
      ...(line.kind === 'photo'
        ? { lines: [], lettering: null, font_family: null, size: 'photo', letter_height_cm: null, width_cm: line.meta.widthCm || null, height_cm: line.meta.heightCm || null }
        : { size: res.sizeId, letter_height_cm: res.letterCm, width_cm: res.dims ? res.dims.W : null, height_cm: res.dims ? res.dims.H : null }),
      backing: st.backing, finish: st.board, hang: st.backing === 'stand' ? 'stand' : st.hang, use: st.use, dimmer: !!st.dimmer, plug: 'UK', everyday_gbp: p.everyday, qty: line.qty, ref: line.uid,
      ...(line.kind === 'photo' ? { photoHash: line.meta.photoHash || null, render: line.meta.png ? 'attached' : null, ledMetres: line.meta.ledMetres || null } : {}),
      ...(line.kind === 'ready' ? { design: line.meta.design || null } : {}) };
  }
  function properties(line, p, postcode) {
    const res = resolve(line.state); const st = res.state; const spec = specFor(line, p);
    const colourText = st.colours ? res.lineColours.map((c, i) => `${c.name} (line ${i + 1})`).join(' / ') : res.colour.name;
    const photo = line.kind === 'photo';
    const props = { Words: photo ? 'From your photo' : (res.words || '—'), Lettering: photo ? 'Traced from your photo' : res.font.name, Colour: colourText, Jacket: jacketOf(st.jacket).name, Size: photo ? `About ${fmtDims(spec.width_cm, spec.height_cm)}${spec.ledMetres ? ` · ${spec.ledMetres} m LED` : ''}` : `${res.sizeId === 'custom' ? 'Custom' : sizeOf(res.sizeId).name}, ${fmtDims(spec.width_cm, spec.height_cm)}`,
      Backing: backingOf(st.backing).name, Finish: finishOf(st.board).name, Hangs: st.backing === 'stand' ? 'On its stand' : hangOf(st.hang).name };
    if (st.icon) props.Symbol = `${st.icon}${st.iconPos === 'inline' ? ', inline' : ''}`;
    props['Dimmer + remote'] = st.dimmer ? 'Yes' : 'No';
    if (postcode) props['Deliver to'] = postcode;
    props._spec = JSON.stringify(spec);
    return props;
  }
  const variantFor = everyday => { if (variantMap && variantMap[String(everyday)]) return variantMap[String(everyday)]; const pp = globalThis.LitNeonCore.pricePointFor(everyday, pricing.rules().pricing); return pp ? 'price-point:' + pp.key : null; };
  /** the exact /cart/add.js payload (items) + the quote lines listed separately; opts.postcode is added as a line property */
  function payload(opts = {}) {
    const items = [], quoted = [], unpriced = [];
    for (const l of lines) {
      const p = priceLine(l);
      if (l.kind === 'quote') { quoted.push({ uid: l.uid, reason: l.meta.reason || 'Quoted separately', spec: specFor(l, p) }); continue; }
      if (p.kind !== 'price') { unpriced.push({ uid: l.uid, kind: p.kind, reason: p.reason }); continue; }
      const props = properties(l, p, opts.postcode);
      if (l.kind === 'ready') {
        const st = l.state; const id = `ready:${l.meta.design || 'design'}:${st.size}:${st.colour}:${st.backing}`;
        items.push({ id, quantity: l.qty, properties: { Jacket: props.Jacket, Hangs: props.Hangs, Finish: props.Finish, _spec: props._spec } });
        if (st.board !== 'clear') items.push({ id: `finish-upgrade:${st.board}`, quantity: l.qty, properties: { For: l.uid, _addon: true } });
      } else {
        const id = variantFor(p.everyday); if (!id) { unpriced.push({ uid: l.uid, kind: 'quote', reason: 'no-variant' }); continue; }
        items.push({ id, quantity: l.qty, properties: props });
      }
    }
    return { items, quoted, unpriced, subtotal: subtotal() };
  }
  const delivery = pc => pricing.deliveryLine(pc);
  const postcode = { get() { try { return (store && store.getItem('postcode')) || ''; } catch { return ''; } }, set(v) { try { if (!store) return; v ? store.setItem('postcode', v) : store.removeItem('postcode'); } catch {} emit('change', { lines }); } };
  function on(type, fn) { subs.add((t, d) => { if (t === type) fn(d); }); return () => {}; }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

  return { add, get, remove, undo, setQty, update, clear, useVariants, priceLine, subtotal, count, signs, specFor, properties, payload, delivery, postcode, on, subscribe, specHash,
    lines: () => lines.slice(), get removed() { return Array.from(removed.keys()); }, reload() { lines = read(); emit('change', { lines }); } };
}

/* =====================================================================
   Dialog helper (focus trap, inert page, scroll lock, Escape, focus return) — shared by the basket drawer, the share
   sheet and the AR sheet. Exported so the other foundation modules do not duplicate it.
   ===================================================================== */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let openCount = 0; const stack = [];
export const dialog = {
  /** open(el, { onClose, initialFocus }) → close(). el must be a direct child of <body> and carry role=dialog. */
  open(el, { onClose, initialFocus } = {}) {
    const opener = document.activeElement;
    const siblings = Array.from(document.body.children).filter(x => x !== el && x.tagName !== 'SCRIPT' && !x.hasAttribute('data-ln-overlay'));
    siblings.forEach(s => { if (!s.inert) { s.inert = true; s.dataset.lnInert = '1'; } });
    if (!openCount++) { document.documentElement.dataset.scrollLock = '1'; document.documentElement.style.overflow = 'hidden'; }
    el.hidden = false; el.setAttribute('aria-modal', 'true'); el.removeAttribute('aria-hidden'); requestAnimationFrame(() => el.classList.add('is-open'));
    const focusables = () => Array.from(el.querySelectorAll(FOCUSABLE)).filter(x => x.offsetParent !== null || x === document.activeElement);
    const first = initialFocus ? el.querySelector(initialFocus) : (el.querySelector('[data-autofocus]') || el.querySelector('h2, h3, [role=heading]') || focusables()[0]);
    if (first) { if (!first.hasAttribute('tabindex') && !first.matches(FOCUSABLE)) first.setAttribute('tabindex', '-1'); setTimeout(() => first.focus({ preventScroll: true }), 30); }
    const isTop = () => stack[stack.length - 1] === close;
    const onKey = e => {
      if (!isTop()) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return; const f = focusables(); if (!f.length) { e.preventDefault(); return; }
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && (i === f.length - 1 || i < 0)) { e.preventDefault(); f[0].focus(); }
    };
    let refocusing = false;
    const onFocusIn = e => { if (!isTop() || refocusing || el.contains(e.target)) return; const f = focusables(); if (!f.length) return; refocusing = true; try { f[0].focus(); } finally { refocusing = false; } };
    const onClickClose = e => { if (e.target.closest('[data-close]')) close(); };
    el.addEventListener('click', onClickClose);
    document.addEventListener('keydown', onKey); document.addEventListener('focusin', onFocusIn);
    let closed = false;
    function close() {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', onKey); document.removeEventListener('focusin', onFocusIn); el.removeEventListener('click', onClickClose);
      el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true');
      const done = () => { el.hidden = true; }; const dur = parseFloat(getComputedStyle(el).transitionDuration) || 0; dur ? setTimeout(done, dur * 1000 + 20) : done();
      siblings.forEach(s => { if (s.dataset.lnInert) { s.inert = false; delete s.dataset.lnInert; } });
      if (!--openCount) { delete document.documentElement.dataset.scrollLock; document.documentElement.style.overflow = ''; }
      stack.splice(stack.indexOf(close), 1);
      if (opener && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
      onClose && onClose();
    }
    stack.push(close);
    return close;
  },
  closeAll() { stack.slice().reverse().forEach(c => c()); },
  get isOpen() { return openCount > 0; }
};

/* =====================================================================
   Drawer (§4.19) — mounted once per page by chrome/pages: basket.drawer.mount(); open via basket.drawer.open()
   ===================================================================== */
/* base controls shared by every foundation overlay (drawer, share sheet, AR sheet): injected by each of them, so a sheet
   opened before the drawer ever mounted still gets real buttons (adversarial review: share actions rendered as bare text) */
export const BASE_CSS = `
.ln-btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--s-2);min-height:var(--btn-md,44px);padding:0 var(--s-5);border-radius:var(--r-2);font:600 var(--t-body) var(--f-ui);text-decoration:none;cursor:pointer;border:1px solid transparent;transition:box-shadow var(--d-base),transform var(--d-fast),background var(--d-base);white-space:nowrap}
.ln-btn--primary{background:var(--bone);color:var(--night)}.ln-btn--primary:hover{box-shadow:var(--glow-ring)}
.ln-btn--ghost{background:transparent;color:var(--bone);border-color:var(--hair)}.ln-btn--ghost:hover{box-shadow:var(--glow-ring)}
.ln-btn--lg{min-height:var(--btn-lg,52px)}.ln-btn:active{transform:translateY(1px)}
.ln-btn[aria-disabled=true]{opacity:.5;pointer-events:none}
.ln-btn:focus-visible,.ln-textbtn:focus-visible,.ln-iconbtn:focus-visible{outline:var(--focus-ring,2px) solid var(--amber);outline-offset:var(--focus-offset,3px)}
.ln-iconbtn{width:var(--touch,44px);height:var(--touch,44px);display:grid;place-items:center;background:none;border:1px solid transparent;border-radius:var(--r-2);color:var(--bone);cursor:pointer}
.ln-iconbtn:hover{background:var(--night-3)}
.ln-textbtn{display:inline-flex;align-items:center;background:none;border:0;color:var(--bone);text-decoration:underline;text-underline-offset:3px;font:500 var(--t-small) var(--f-ui);min-height:var(--touch,44px);padding:0 var(--s-2);cursor:pointer}
.ln-note{margin:0;color:var(--smoke);font-size:var(--t-caption);line-height:var(--lh-caption)}`;
export function injectBase() { if (typeof document === 'undefined' || document.getElementById('ln-base-css')) return; const s = document.createElement('style'); s.id = 'ln-base-css'; s.textContent = BASE_CSS; document.head.appendChild(s); }

/* Drawer layout: the panel is exactly the viewport tall (the drawer grid has ONE 100% row — an implicit auto row let the
   panel grow to its content and pushed "Go to checkout" below the fold). Head · scrolling body · compact sticky foot
   (subtotal + checkout only); delivery, BNPL, express, the 3-step strip and the marks scroll with the lines. */
const DRAWER_CSS = `
.ln-drawer{position:fixed;inset:0;z-index:var(--z-drawer,60);display:grid;grid-template-columns:1fr min(var(--drawer-w,420px),100%);grid-template-rows:100%;height:100%;height:100dvh;pointer-events:none}
.ln-drawer[hidden]{display:none}
/* .c-drawer (components.css) is kept as a hook only: its fixed 420px width + translateX would pin this full-screen wrapper
   to the left edge on desktop with no scrim — reset it; the panel inside does the slide */
.ln-drawer.c-drawer{display:grid;left:0;right:0;top:0;bottom:0;width:auto;max-width:none;transform:none;background:none;box-shadow:none;border:0;visibility:visible;opacity:1;transition:opacity var(--d-slow,480ms) linear;touch-action:auto}
.ln-drawer.c-drawer[hidden]{display:none}
.ln-drawer__scrim{background:var(--scrim,rgba(10,6,14,.62));opacity:0;transition:opacity var(--d-base,240ms) var(--ease-out);pointer-events:auto}
.ln-drawer__panel{background:var(--night-2,#1F1328);color:var(--bone,#F2E9DF);display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;transform:translateX(100%);transition:transform var(--d-slow,480ms) var(--ease-out);box-shadow:var(--e-3);pointer-events:auto;border-left:1px solid var(--hair)}
.ln-drawer.is-open .ln-drawer__scrim{opacity:1}.ln-drawer.is-open .ln-drawer__panel{transform:none}
.ln-drawer__head{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:var(--s-3);padding:var(--s-3) var(--s-5);border-bottom:1px solid var(--hair)}
.ln-drawer__head h2{font:600 var(--t-title)/var(--lh-title) var(--f-ui);margin:0}
.ln-drawer__body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:var(--s-2) var(--s-5) var(--s-5);display:flex;flex-direction:column;gap:var(--s-4)}
.ln-drawer__foot{flex:0 0 auto;border-top:1px solid var(--hair);padding:var(--s-3) var(--s-5) calc(var(--s-3) + env(safe-area-inset-bottom));display:grid;gap:var(--s-2);background:var(--night-2)}
.ln-drawer__foot .ln-foot-acts{display:grid;grid-template-columns:1fr;gap:var(--s-1);justify-items:center}
.ln-drawer__foot .ln-foot-acts .ln-btn{width:100%}
.ln-lines{display:grid}
.ln-bline{display:grid;grid-template-columns:96px minmax(0,1fr);gap:var(--s-3) var(--s-4);padding:var(--s-3) 0;border-bottom:1px solid var(--hair)}
.ln-bline:last-child{border-bottom:0}
.ln-bline__mini{aspect-ratio:1;border-radius:var(--r-2);overflow:hidden;background:var(--night);position:relative}
.ln-bline__mini img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;padding:var(--s-1)}
.ln-bline__name{font:600 var(--t-body)/var(--lh-body) var(--f-ui);margin:0 0 var(--s-1);display:flex;justify-content:space-between;gap:var(--s-3)}
.ln-bline__name>span:first-child{min-width:0;overflow-wrap:anywhere}
.ln-bline__price{font-variant-numeric:tabular-nums;white-space:nowrap}
.ln-bline dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:2px var(--s-3);font-size:var(--t-small);line-height:var(--lh-small);color:var(--bone-2)}
.ln-bline dt{color:var(--smoke)}.ln-bline dd{margin:0;min-width:0;overflow-wrap:anywhere}
.ln-bline__acts{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:var(--s-3);flex-wrap:wrap}
.ln-qty{display:inline-flex;align-items:center;border:1px solid var(--hair);border-radius:var(--r-2);height:var(--touch,44px)}
.ln-qty button{width:var(--touch,44px);height:100%;background:none;border:0;color:var(--bone);font:600 var(--t-body) var(--f-ui);cursor:pointer}
.ln-qty button:disabled{color:var(--smoke);cursor:default}.ln-qty output{min-width:28px;text-align:center;font-variant-numeric:tabular-nums}
.ln-qty button:focus-visible{outline:var(--focus-ring,2px) solid var(--amber);outline-offset:var(--focus-offset,3px)}
.ln-undo{display:flex;justify-content:space-between;align-items:center;gap:var(--s-3);padding:var(--s-3) var(--s-4);background:var(--night-3);border-radius:var(--r-2);font-size:var(--t-small)}
.ln-sum{display:grid;gap:var(--s-3);padding-top:var(--s-4);border-top:1px solid var(--hair)}
.ln-row{display:flex;justify-content:space-between;gap:var(--s-3);align-items:baseline}
.ln-row b{font:700 var(--t-display-3)/1 var(--f-display);font-variant-numeric:tabular-nums}
.ln-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--s-2);margin:0;padding:0;list-style:none;font-size:var(--t-caption);color:var(--bone-2)}
.ln-steps li{padding:var(--s-2);border:1px solid var(--hair);border-radius:var(--r-2)}
.ln-steps b{display:block;color:var(--bone);font-weight:600}
.ln-marks{display:flex;gap:var(--s-2);flex-wrap:wrap;align-items:center;color:var(--bone-2)}.ln-marks img,.ln-marks svg{height:22px;width:auto;display:block}
.ln-express{display:grid;grid-template-columns:1fr 1fr;gap:var(--s-2)}
.ln-empty{display:grid;justify-items:center;text-align:center;gap:var(--s-3);padding:var(--s-6) var(--s-4)}
.ln-empty img{width:120px;height:auto}
.ln-pc{display:grid;grid-template-columns:1fr auto;gap:var(--s-2)}
.ln-pc input{height:var(--control-h,48px);font:400 var(--t-body) var(--f-ui);padding:0 var(--s-3);border-radius:var(--r-2);border:1px solid var(--hair);background:var(--night-3);color:var(--bone);text-transform:uppercase;min-width:0}
.ln-pc input:focus-visible{outline:var(--focus-ring,2px) solid var(--amber);outline-offset:2px}
.ln-pc--bad input{border-color:var(--amber)}
.ln-pcmsg{margin:0;font-size:var(--t-caption);color:var(--bone-2)}.ln-pcmsg.is-bad{color:var(--amber)}
@media (max-width:767px){.ln-drawer{grid-template-columns:0 100%}.ln-drawer__panel{border-left:0}.ln-steps li{padding:var(--s-2) var(--s-2)}}
@media (max-height:640px){.ln-drawer__foot .ln-note{display:none}}
@media (prefers-reduced-motion:reduce){.ln-drawer__panel,.ln-drawer__scrim{transition:none}}`;

export function createDrawer(basket, { stageLoader = () => import('./stage.js'), uiLoader = () => import('./ui.js').catch(() => null), paymentsUrl = '/lit-neon-preview/rework/config/payments.json' } = {}) {
  let el = null, close = null, miniStages = [], payments = null, lastUndo = null, undoTimer = 0;
  const esc2 = esc;
  function mount() {
    if (el) return el;
    injectBase(); if (!document.getElementById('ln-drawer-css')) { const s = document.createElement('style'); s.id = 'ln-drawer-css'; s.textContent = DRAWER_CSS; document.head.appendChild(s); }
    el = document.createElement('div'); el.className = 'ln-drawer c-drawer'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'ln-drawer-title'); el.hidden = true; el.dataset.lnOverlay = '1'; el.dataset.qa = 'basket.drawer';
    el.innerHTML = `<div class="ln-drawer__scrim" data-close></div><div class="ln-drawer__panel">
      <div class="ln-drawer__head"><h2 id="ln-drawer-title" tabindex="-1" data-qa="basket.title">Your basket</h2><button type="button" class="ln-iconbtn" data-close aria-label="Close basket" data-qa="basket.close"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="ln-drawer__body" data-qa="basket.lines"></div><div class="ln-drawer__foot" data-qa="basket.footer" hidden></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
    basket.subscribe(() => { if (!el.hidden) render(); updateCounts(); });
    fetch(paymentsUrl, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(p => { payments = p; if (el && !el.hidden) render(); }).catch(() => {});
    updateCounts();
    return el;
  }
  function updateCounts() { const n = basket.signs ? basket.signs() : basket.count(); document.querySelectorAll('[data-basket-count]').forEach(x => { x.textContent = String(n); x.dataset.n = String(n); x.setAttribute('aria-label', `${n} ${n === 1 ? 'sign' : 'signs'} in your basket`); }); }
  function onClick(e) {
    const t = e.target;
    if (t.closest('[data-close]')) return; /* the dialog helper closes */
    const line = t.closest('[data-uid]'); const id = line && line.dataset.uid;
    if (t.closest('[data-qty]') && id) { const l = basket.get(id); basket.setQty(id, l.qty + (+t.closest('[data-qty]').dataset.qty)); return; }
    if (t.closest('[data-remove]') && id) { const { undo } = basket.remove(id); lastUndo = { id, undo }; clearTimeout(undoTimer); undoTimer = setTimeout(() => { lastUndo = null; render(); }, 5000); render(); return; }
    if (t.closest('[data-undo]')) { if (lastUndo) { lastUndo.undo(); lastUndo = null; clearTimeout(undoTimer); } render(); return; }
    if (t.closest('[data-pc-check]')) { const inp = el.querySelector('[data-qa="basket.postcode.input"]'); checkPostcode(inp.value); return; }
    const edit = t.closest('[data-qa="basket.line.edit"]');
    if (edit && edit.tagName === 'A') {
      let same = false; try { const u = new URL(edit.href, location.href); same = u.pathname === location.pathname && u.search === location.search; } catch {}
      if (same) { closeDrawer(); setTimeout(() => { const n = document.querySelector('#b-editing:not([hidden]), [data-edit-note]:not([hidden])'); if (n) { if (!n.hasAttribute('tabindex')) n.setAttribute('tabindex', '-1'); n.focus({ preventScroll: true }); n.scrollIntoView({ block: 'nearest', behavior: (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth') }); } }, 160); }
      return;
    }
    if (t.closest('[data-checkout]')) { import('./analytics.js').then(a => a.track('basket_checkout', { items: basket.count(), subtotal: basket.subtotal().payable })).catch(() => {}); }
  }
  function checkPostcode(v) { const d = basket.delivery(v); if (d.status === 'ok') basket.postcode.set(d.formatted); render(d); }
  const lineName = l => { if (l.kind === 'photo') return 'From your photo'; const r = resolveDesign(l.state); return r.lines.length ? r.lines.join(' ') : (r.icon ? `${r.icon} symbol` : 'Your sign'); };
  /* a photo line is the traced design, not a text sign: its size and LED length come from the photo meta (upload.html) */
  function photoSpec(l, res, st) {
    const m = l.meta || {}; const W = m.widthCm, H = m.heightCm;
    const size = W && H ? `About ${fmtDims(W, H, st.unit)}${m.ledMetres ? ` · ${(Math.round(m.ledMetres * 10) / 10).toFixed(1)}\u00a0m of LED` : ''}` : '—';
    return `<dl><dt>Made from</dt><dd>Your photo, traced in neon</dd><dt>Colour</dt><dd>${esc2(res.colour.name)}</dd><dt>Size</dt><dd data-qa="basket.line.size">${esc2(size)}</dd><dt>Backing</dt><dd>${esc2(res.backing.name)}, ${esc2(res.finish.name.toLowerCase())}</dd><dt>Hangs</dt><dd>${st.backing === 'stand' ? 'On its stand' : esc2(res.hang.name)} · UK plug</dd><dt>Proof</dt><dd>A designer draws your proof before anything is made</dd></dl>`;
  }
  function render(pcResult) {
    if (!el) mount();
    const body = el.querySelector('.ln-drawer__body'), foot = el.querySelector('.ln-drawer__foot');
    const lines = basket.lines(); const n = lines.length;
    const nSigns = basket.signs ? basket.signs() : n; el.querySelector('#ln-drawer-title').textContent = n ? `Your basket (${nSigns} ${nSigns === 1 ? 'sign' : 'signs'})` : 'Your basket'; /* signs, like the header badge */
    miniStages.forEach(s => s.destroy && s.destroy()); miniStages = [];
    if (!n && !lastUndo) {
      body.innerHTML = `<div class="ln-empty c-empty" data-qa="basket.empty"><img src="/lit-neon-preview/rework/assets/img/empty/basket.svg" alt="" width="120" height="120"><p class="c-title">Nothing in here yet</p><p class="ln-note">Design a sign in a couple of minutes, or start from one of ours.</p><a class="ln-btn ln-btn--primary" href="/lit-neon-preview/rework/create.html" data-qa="basket.empty.design">Design a sign</a><a class="ln-btn ln-btn--ghost" href="/lit-neon-preview/rework/shop.html" data-qa="basket.empty.shop">Browse ready-made</a></div>`;
      foot.hidden = true; return;
    }
    const undoRow = lastUndo ? `<div class="ln-undo" role="status" data-qa="basket.undo"><span>Removed</span><button type="button" class="ln-textbtn" data-undo data-qa="basket.undo.button">Undo</button></div>` : '';
    body.innerHTML = undoRow + '<div class="ln-lines">' + lines.map(l => {
      const res = resolveDesign(l.state), st = res.state, p = basket.priceLine(l);
      const photo = l.kind === 'photo';
      const editHref = photo ? `/lit-neon-preview/rework/contact.html?topic=design&order=${encodeURIComponent(l.uid.toUpperCase())}&text=${encodeURIComponent('Please change my photo sign (basket ref ' + l.uid.toUpperCase() + '): ')}` : l.kind === 'ready' ? `/lit-neon-preview/rework/product.html?id=${encodeURIComponent(l.meta.design || '')}#edit=${l.uid}` : `/lit-neon-preview/rework/create.html${basket.editHash ? basket.editHash(l) : ''}`;
      const editLabel = photo ? 'Ask for a change' : 'Edit design';
      const colour = st.colours ? res.lineColours.map(c => c.name).join(' / ') : res.colour.name;
      const sizeName = res.sizeId === 'custom' ? 'Custom' : sizeOf(res.sizeId).name;
      const price = p.kind === 'price' ? gbp(p.payable * l.qty) : (l.kind === 'quote' ? 'Quoted' : '—');
      return `<article class="ln-bline" data-uid="${l.uid}" data-kind="${l.kind}" data-qa="basket.line">
        <div class="ln-bline__mini" data-mini aria-hidden="true">${photo && l.meta.png ? `<img src="${esc2(l.meta.png)}" alt="" data-qa="basket.line.photo">` : ''}</div>
        <div><p class="ln-bline__name"><span>${esc2(lineName(l))}</span><span class="ln-bline__price" data-qa="basket.line.price">${price}</span></p>
          ${photo ? photoSpec(l, res, st) : `<dl><dt>Lettering</dt><dd>${esc2(res.font.name)}</dd><dt>Colour</dt><dd>${esc2(colour)}, ${esc2(jacketOf(st.jacket).name.toLowerCase())}</dd><dt>Size</dt><dd>${esc2(sizeName)}, ${res.dims ? fmtDims(res.dims.W, res.dims.H, st.unit) : '—'}</dd><dt>Backing</dt><dd>${esc2(res.backing.name)}, ${esc2(res.finish.name.toLowerCase())}</dd><dt>Hangs</dt><dd>${st.backing === 'stand' ? 'On its stand' : esc2(res.hang.name)} · UK plug</dd>${st.icon ? `<dt>Symbol</dt><dd>${esc2(st.icon)}</dd>` : ''}</dl>`}</div>
        <div class="ln-bline__acts">${l.kind === 'quote' ? `<span class="ln-note">${esc2(l.meta.reason || 'Quoted separately')}</span>` : `<div class="ln-qty c-qty" role="group" aria-label="Quantity"><button type="button" data-qty="-1" ${l.qty <= 1 ? 'disabled' : ''} aria-label="One fewer" data-qa="basket.line.minus">−</button><output aria-live="polite" data-qa="basket.line.qty">${l.qty}</output><button type="button" data-qty="1" ${l.qty >= 10 ? 'disabled' : ''} aria-label="One more" data-qa="basket.line.plus">+</button></div>${l.qty >= 10 ? '<a class="ln-textbtn" href="/lit-neon-preview/rework/bulk-quote.html">Need more? Bulk quote</a>' : ''}`}
          <span><a class="ln-textbtn" href="${esc2(editHref)}" data-qa="basket.line.edit"${photo ? ' data-photo-edit aria-label="Ask a designer to change your photo sign"' : ''}>${editLabel}</a><button type="button" class="ln-textbtn" data-remove data-qa="basket.line.remove">Remove</button></span></div></article>`;
    }).join('') + '</div><div class="ln-sum" data-qa="basket.summary"></div>';
    /* minis: the stage engine on s00-studio-dark, lit, `thumb` frame (the sign fills ~80 % of the tile so it reads at a glance) */
    stageLoader().then(mod => { el.querySelectorAll('.ln-bline').forEach(node => { const l = basket.get(node.dataset.uid); if (!l || (l.kind === 'photo' && l.meta && l.meta.png)) return; const host = node.querySelector('[data-mini]'); const s = mod.mount(host, { frame: 'thumb', scene: 's00-studio-dark', design: { ...l.state, on: true, night: true }, interactive: false, pill: false, rulers: false, qa: 'basket.drawer.line.stage' }); miniStages.push(s); }); }).catch(() => {});
    /* footer */
    const sub = basket.subtotal(); const pc = basket.postcode.get(); const d = pcResult || basket.delivery(pc);
    foot.hidden = false;
    const hasQuote = sub.quotes > 0;
    const providers = (payments && Array.isArray(payments.express) ? payments.express : (payments && payments.providers) || []).filter(p => p.enabled !== false);
    const sum = body.querySelector('.ln-sum');
    sum.innerHTML = `
      ${hasQuote ? `<p class="ln-note">${sub.quotes === 1 ? 'One line is quoted separately' : `${sub.quotes} lines are quoted separately`} — a designer prices it within 12 hours.</p>` : ''}
      <div data-qa="basket.delivery">${d.status === 'ok' ? `<p class="ln-pcmsg"><b>${esc2(d.prefix || '')}</b> · ${esc2(d.line || d.text)} <button type="button" class="ln-textbtn" data-pc-change data-qa="basket.postcode.change">Change</button></p>` : `<form class="ln-pc${d.status === 'excluded' || d.status === 'invalid' ? ' ln-pc--bad' : ''}" data-pc onsubmit="return false"><label class="visually-hidden" for="ln-pc-in">Delivery postcode</label><input id="ln-pc-in" inputmode="text" autocomplete="postal-code" placeholder="Postcode" value="${esc2(pc || '')}" data-qa="basket.postcode.input"><button type="button" class="ln-btn ln-btn--ghost" data-pc-check data-qa="basket.postcode.check">Check</button></form><p class="ln-pcmsg${d.status === 'excluded' || d.status === 'invalid' ? ' is-bad' : ''}" data-qa="basket.postcode.msg">${d.status === 'empty' ? 'Free delivery across mainland GB · ' + esc2(d.text) : esc2(d.text)}${d.status === 'excluded' ? ` → <a class="ln-textbtn" href="/lit-neon-preview/rework/contact.html?postcode=${encodeURIComponent(d.formatted || '')}">Ask us about delivery</a>` : ''}</p>`}</div>
      <div data-slot="bnpl" data-total="${sub.payable}"></div>
      ${!hasQuote && sub.items && providers.length ? `<div class="ln-express" data-qa="basket.express" data-slot="express"></div>` : ''}
      <ol class="ln-steps"><li><b>1 · Proof</b>Your drawing within 12 hours</li><li><b>2 · Approve</b>Tweaks are free until you say yes</li><li><b>3 · Made</b>7–10 working days, then tracked delivery</li></ol>
      <div class="ln-marks" aria-label="Payment methods" data-slot="marks"></div>`;
    foot.innerHTML = `
      ${sub.items ? `<div class="ln-row"><span>Subtotal</span><b data-qa="basket.subtotal">${gbp(sub.payable)}</b></div>` : ''}
      ${sub.promo && sub.items ? `<p class="ln-note" data-qa="basket.promo">${esc2(basketPromoLine(sub))}</p>` : ''}
      <div class="ln-foot-acts"><a class="ln-btn ln-btn--primary ln-btn--lg" href="/lit-neon-preview/rework/checkout.html" data-checkout data-qa="basket.checkout"${sub.items ? '' : ' aria-disabled="true" tabindex="-1"'}>Go to checkout</a>
      <button type="button" class="ln-textbtn" data-close data-qa="basket.continue">Continue shopping</button></div>`;
    const changeBtn = body.querySelector('[data-pc-change]'); if (changeBtn) changeBtn.addEventListener('click', () => { basket.postcode.set(''); render({ status: 'empty', text: basket.delivery('').text }); });
    const pcForm = body.querySelector('[data-pc]'); if (pcForm) pcForm.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); checkPostcode(pcForm.querySelector('input').value); } });
    uiLoader().then(ui => { const slot = body.querySelector('[data-slot="bnpl"]'); if (ui && slot && typeof ui.bnpl === 'function') ui.bnpl(slot, sub.payable); }).catch(() => {});
    /* payment marks: the shared row (inline SVG in the text colour; as <img> their currentColor rendered black on the dark drawer) */
    uiLoader().then(ui => { const slot = body.querySelector('[data-slot="marks"]'); if (ui && slot && typeof ui.paymentMarks === 'function') ui.paymentMarks(slot).catch(() => {}); }).catch(() => {});
    /* express pay: the same component as the product page and checkout (inline mark in the text colour + 'Pay with …' label) */
    uiLoader().then(ui => { const slot = body.querySelector('[data-slot="express"]'); if (ui && slot && typeof ui.expressRow === 'function') ui.expressRow(slot, { qa: 'basket.express', onPick: id => { location.href = `/lit-neon-preview/rework/checkout.html#express=${encodeURIComponent(id)}`; } }).then(() => slot.classList.add('ln-express')).catch(() => {}); }).catch(() => {});
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('debug') === '1' && sessionStorage.getItem('review') === '1') { const pre = document.createElement('details'); pre.className = 'ln-note'; pre.innerHTML = `<summary>What the store receives</summary><pre data-qa="basket.payload">${esc2(JSON.stringify(basket.payload({ postcode: basket.postcode.get() }), null, 2))}</pre>`; sum.appendChild(pre); }
  }
  function basketPromoLine(sub) { const pl = basket.promoLineFor ? basket.promoLineFor(sub.everyday) : null; return pl || `Launch price · everyday ${gbp(sub.everyday)}`; }
  function openDrawer() { mount(); render(); if (close) return; close = dialog.open(el, { onClose: () => { close = null; miniStages.forEach(s => s.destroy && s.destroy()); miniStages = []; } }); }
  function closeDrawer() { if (close) close(); }
  return { mount, open: openDrawer, close: closeDrawer, render, updateCounts, get el() { return el; } };
}

const basket = createBasket();
/* promo line + edit hash need pricing/router: wired lazily so Node tests of the store never load them */
basket.promoLineFor = everyday => pricingDefault.promoLine(everyday);
basket.editHash = line => { try { return globalThis.__lnRouter ? globalThis.__lnRouter.buildHash(line.state, { edit: line.uid }) : ''; } catch { return ''; } };
import('./router.js').then(r => { globalThis.__lnRouter = r.default; }).catch(() => {});
export const drawer = typeof document !== 'undefined' ? createDrawer(basket) : null;
basket.open = () => { if (drawer) drawer.open(); };
basket.close = () => { if (drawer) drawer.close(); };
export default basket;
export const { add, get, remove, undo, setQty, update, clear, useVariants, priceLine, subtotal, count, signs, specFor, properties, payload, delivery, postcode, subscribe } = basket;
