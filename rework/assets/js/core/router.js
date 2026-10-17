/* Lit Neon v2 — router (brief §4.2, §5.13, §6.2): hash intents, the compact design codec, the single design store with
   sources and resume precedence, and every builder/share/gift link. Node-safe: createRouter({ storage, now, location })
   isolates it for tests; the default instance uses localStorage + window.location.
   Codec: `#d=` + base64url(compact JSON with short keys, defaults omitted) — typically ≤ 120 chars (tested). */
import { DEFAULT_DESIGN, normalise, OPTIONS } from './renderer.js';

const KEYS = { text: 't', align: 'a', font: 'f', colour: 'c', colours: 'cs', jacket: 'j', size: 's', custom: 'cu', backing: 'b', board: 'bd', use: 'u', hang: 'h', icon: 'i', iconPos: 'ip', iconAt: 'ia', scene: 'sc', pos: 'p', night: 'n', on: 'o', view: 'v', unit: 'un', tube: 'tb', dimmer: 'dm' };
const UNKEYS = Object.fromEntries(Object.entries(KEYS).map(([k, v]) => [v, k]));

export function b64e(s) { const bytes = new TextEncoder().encode(s); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export function b64d(s) { const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); }

/* compact wire format: `key:value|key:value…` (ids, not indices, so links outlive catalogue reordering), then base64url.
   `|` and `\\` inside the text are escaped; newlines travel as-is. A typical state is ~45–90 chars encoded. */
const escV = v => String(v).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
const splitFields = s => { const out = []; let cur = '', i = 0; while (i < s.length) { const ch = s[i]; if (ch === '\\' && i + 1 < s.length) { cur += s[i + 1]; i += 2; continue; } if (ch === '|') { out.push(cur); cur = ''; i++; continue; } cur += ch; i++; } out.push(cur); return out; };
/** compact, default-free encoding of a design state */
export function encode(state) {
  const st = normalise(state); const parts = [];
  for (const [k, short] of Object.entries(KEYS)) {
    let v = st[k];
    if (k === 'pos') { const p = st.pos && st.pos[st.scene]; if (!p) continue; v = `${Math.round(p.x * 1000) / 1000},${Math.round(p.y * 1000) / 1000}`; }
    else if (k === 'custom') { if (!v || st.size !== 'custom') continue; v = v.letterCm; }
    else if (k === 'colours') { if (!v) continue; v = v.join(','); }
    else if (k === 'iconAt') { if (!v || !st.icon) continue; v = `${v.x},${v.y}`; }
    else if (typeof v === 'boolean') { if (v === DEFAULT_DESIGN[k]) continue; v = v ? 1 : 0; }
    else if (v === DEFAULT_DESIGN[k] || v == null || v === '') continue;
    parts.push(short + ':' + escV(v));
  }
  return b64e(parts.join('|'));
}
/** inverse of encode; returns a normalised state ({} on junk). Also accepts the older JSON form. */
export function decode(code) {
  try {
    const raw = b64d(code); const out = {};
    if (raw.startsWith('{')) { const o = JSON.parse(raw); for (const [short, v] of Object.entries(o)) { const k = UNKEYS[short]; if (k) out[k] = v; } }
    else for (const field of splitFields(raw)) {
      const i = field.indexOf(':'); if (i < 1) continue; const k = UNKEYS[field.slice(0, i)]; if (!k) continue; const v = field.slice(i + 1);
      if (k === 'pos') { const [x, y] = v.split(',').map(Number); if (Number.isFinite(x) && Number.isFinite(y)) out._pos = { x, y }; continue; }
      if (k === 'custom') { out.custom = { letterCm: +v }; out.size = 'custom'; continue; }
      if (k === 'colours') { out.colours = v.split(',').filter(Boolean); continue; }
      if (k === 'iconAt') { const [x, y] = v.split(',').map(Number); if (Number.isFinite(x) && Number.isFinite(y)) out.iconAt = { x, y }; continue; }
      if (k === 'night' || k === 'on') { out[k] = v !== '0' && v !== 'false'; continue; }
      out[k] = v;
    }
    if (out._pos) { const scene = out.scene || DEFAULT_DESIGN.scene; out.pos = { [scene]: out._pos }; delete out._pos; }
    if (!Object.keys(out).length) return {};
    return normalise(out);
  } catch { return {}; }
}

/** parse any location.hash: { d: state|null, code, edit, step, scene, intent: 'logo'|'quote=bulk'|null, raw: {…} } */
export function parseHash(hash) {
  const h = String(hash || '').replace(/^#/, ''); const raw = {}; let malformed = false;
  /* a truncated or hand-edited link (a stray %, a cut-off %E0%A4) must never throw: keep the raw text, flag it, and let
     decode() reject it, so the page falls back to autosave/defaults (create) or its broken-link message (gift) */
  const dec = x => { try { return decodeURIComponent(x); } catch { malformed = true; try { return decodeURIComponent(x.replace(/%(?![0-9a-f]{2})/gi, '%25').replace(/(%[0-9a-f]{2})+/gi, m => { try { return decodeURIComponent(m); } catch { return ''; } })); } catch { return x; } } };
  for (const part of h.split('&')) { if (!part) continue; const i = part.indexOf('='); if (i < 0) raw[dec(part)] = true; else { const k = dec(part.slice(0, i)), v = part.slice(i + 1); if (k === 'd') { try { raw.d = decodeURIComponent(v); } catch { malformed = true; const cut = v.replace(/%(?![0-9a-f]{2})[\s\S]*$/i, ''); try { raw.d = decodeURIComponent(cut) || v; } catch { raw.d = v; } } } else raw[k] = dec(v); } }
  const d = raw.d ? decode(raw.d) : null;
  const intent = raw.logo === true ? 'logo' : raw.quote ? 'quote=' + raw.quote : null;
  return { d: d && Object.keys(d).length ? d : null, malformed, code: raw.d || null, edit: raw.edit || null, step: raw.step || null, scene: raw.scene || null, intent, m: raw.m || null, from: raw.from || null, raw };
}
export function buildHash(state, extra = {}) {
  const parts = [];
  if (state) parts.push('d=' + encode(state));
  for (const [k, v] of Object.entries(extra)) { if (v == null || v === false || v === '') continue; parts.push(v === true ? encodeURIComponent(k) : `${encodeURIComponent(k)}=${encodeURIComponent(v)}`); }
  return parts.length ? '#' + parts.join('&') : '';
}
/** root-relative builder link carrying the state (works from guides/ and legal/) */
export const builderLink = (state, extra = {}) => '/lit-neon-preview/rework/create.html' + buildHash(state, extra);
export const giftHash = (state, message, from) => buildHash(state, { m: (message || '').slice(0, 140), from: (from || '').slice(0, 40) });

export function createRouter({ storage, now = () => new Date(), location: loc } = {}) {
  const store = storage === undefined ? (() => { try { return globalThis.localStorage || null; } catch { return null; } })() : storage;
  const LOC = () => loc || (typeof window !== 'undefined' ? window.location : { hash: '', origin: '', pathname: '/' });
  const read = k => { try { const v = store ? store.getItem(k) : null; return v == null ? null : JSON.parse(v); } catch { return null; } };
  const write = (k, v) => { try { if (!store) return; if (v == null) store.removeItem(k); else store.setItem(k, JSON.stringify(v)); } catch {} };
  const subs = new Set(); const timers = new Map();
  const emit = rec => { subs.forEach(fn => { try { fn(rec); } catch {} }); if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('ln:design', { detail: rec })); };

  const design = {
    KEY: 'design', STALE_MS: 30 * 60 * 1000, SOURCES: ['hero', 'builder', 'collection', 'quiz', 'footer', 'basket-edit', 'product', 'weddings'],
    /** { state, source, updatedAt } or null */
    get() { const r = read('design'); return r && r.state ? { state: normalise(r.state), source: r.source || 'builder', updatedAt: r.updatedAt || 0 } : null; },
    /** write now (the builder autosaves on every change); returns the record */
    set(state, source = 'builder') { const rec = { state: normalise(state), source, updatedAt: now().getTime() }; write('design', rec); emit(rec); return rec; },
    /** debounced write (hero, collection mini builders, quiz, footer: 300 ms per source) */
    setDebounced(state, source, ms = 300) { clearTimeout(timers.get(source)); timers.set(source, setTimeout(() => design.set(state, source), ms)); },
    flush() { timers.forEach(t => clearTimeout(t)); timers.clear(); },
    clear() { write('design', null); emit(null); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    /** §4.2 resume precedence for create.html */
    resume(hash) {
      const h = parseHash(hash == null ? LOC().hash : hash);
      if (h.d) return { mode: 'url', state: h.d, editUid: h.edit || null, hash: h };
      const rec = design.get();
      if (rec && rec.source !== 'builder' && now().getTime() - rec.updatedAt < design.STALE_MS) return { mode: 'direct', state: rec.state, source: rec.source, hash: h };
      if (rec) return { mode: 'welcome', state: rec.state, source: rec.source, hash: h };
      return { mode: 'default', state: normalise(DEFAULT_DESIGN), hash: h };
    }
  };
  /* cross-tab sync */
  if (typeof window !== 'undefined' && store === globalThis.localStorage) window.addEventListener('storage', e => { if (e.key === 'design') emit(design.get()); });

  const postcode = {
    get() { try { return store ? (store.getItem('postcode') || '') : ''; } catch { return ''; } },
    set(v) { try { if (!store) return; if (!v) store.removeItem('postcode'); else store.setItem('postcode', String(v)); } catch {} }
  };

  /** absolute share link (short form hash) */
  const origin = () => { const L = LOC(); return (L.origin && L.origin !== 'null') ? L.origin : ''; };
  const shareLink = (state, extra) => origin() + builderLink(state, extra);
  const giftLink = (state, message, from) => origin() + '/lit-neon-preview/rework/gift.html' + giftHash(state, message, from);
  const productLink = (designId, extra = {}) => `/lit-neon-preview/rework/product.html?id=${encodeURIComponent(designId)}` + buildHash(null, extra);

  /** write the current state into the URL without a history entry (debounced by the caller) */
  function writeHash(state, extra = {}) { try { if (typeof history !== 'undefined') history.replaceState(null, '', buildHash(state, extra) || LOC().pathname + LOC().search); } catch {} }
  /** hash intents on the builder: #logo → upload.html#logo, #quote=bulk → bulk-quote.html, #step=x → callback */
  function onHashIntent(fn) {
    if (typeof window === 'undefined') return () => {};
    const handler = () => { const h = parseHash(window.location.hash); if (h.intent === 'logo') window.location.replace('/lit-neon-preview/rework/upload.html#logo'); else if (h.intent === 'quote=bulk') window.location.replace('/lit-neon-preview/rework/bulk-quote.html'); else fn(h); };
    window.addEventListener('hashchange', handler); handler(); return () => window.removeEventListener('hashchange', handler);
  }
  /** the stored design state (chrome's footer capture reads the words) or null */
  const getDesign = () => { const r = design.get(); return r ? r.state : null; };
  return { design, getDesign, postcode, encode, decode, parseHash, buildHash, builderLink, shareLink, giftLink, giftHash, productLink, writeHash, onHashIntent, KEYS };
}

const router = createRouter();
export default router;
export const { design, getDesign, postcode, shareLink, giftLink, productLink, writeHash, onHashIntent } = router;
export { OPTIONS };
