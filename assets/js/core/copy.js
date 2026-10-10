/* core/copy.js — customer-facing strings live in data/copy/<page>.json, one file per page or interactive group
   (brief §0.3). This module loads and deep-merges them, then serves keys with {var} interpolation.
   Copy files carry no literal dates, prices or percentages (tools/lint-copy.mjs); those arrive as vars. */

const ROOT = new URL('../../../', import.meta.url);   // sites/v2/
const store = {};
const loaded = new Set();
const pending = new Map();

function deepMerge(into, from) {
  for (const [k, v] of Object.entries(from || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) { into[k] = deepMerge(into[k] && typeof into[k] === 'object' ? into[k] : {}, v); }
    else into[k] = v;
  }
  return into;
}

/** Load one or more copy files by name ('chrome', 'home', …). Missing files resolve silently (the page still renders). */
export async function load(names) {
  const list = (Array.isArray(names) ? names : [names]).filter(n => n && !loaded.has(n));
  await Promise.all(list.map(async n => {
    if (pending.has(n)) return pending.get(n);
    const p = (async () => {
      try {
        const r = await fetch(new URL(`data/copy/${n}.json`, ROOT));
        if (r.ok) deepMerge(store, await r.json());
      } catch {}
      loaded.add(n);
    })();
    pending.set(n, p); await p; pending.delete(n);
  }));
  return store;
}
/** Merge an inline object (tests, demos, or a page that embeds its copy). */
export function merge(obj) { deepMerge(store, obj); return store; }
export function has(path) { return get(path, undefined) !== undefined; }
/** Dotted-path lookup: copy.get('announce.free'). Returns `fallback` when absent. */
export function get(path, fallback) {
  const v = String(path).split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), store);
  return v === undefined ? fallback : v;
}
/** Interpolate {var} placeholders. Missing vars render as an empty string (never "{undefined}"). */
export function fill(template, vars = {}) {
  return String(template ?? '').replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, k) => {
    const v = k.split('.').reduce((o, p) => (o && o[p] !== undefined ? o[p] : undefined), vars);
    return v === undefined || v === null ? '' : String(v);
  });
}
/** get + fill in one call; when the key is missing, the fallback (or the key itself in review mode) is used. */
export function t(path, vars = {}, fallback) {
  const raw = get(path);
  if (raw === undefined) {
    if (fallback !== undefined) return fill(fallback, vars);
    try { if (sessionStorage.getItem('review') === '1') return `⟨${path}⟩`; } catch {}
    return '';
  }
  return fill(raw, vars);
}
export function all() { return store; }

export const copy = { load, merge, get, has, fill, t, all };
export default copy;
