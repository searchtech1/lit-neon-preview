/* core/facts.js — the facts registry (brief §3.9). Every workshop-dependent claim comes from data/facts.json through
   get(key) / has(key) / value(key). Unconfirmed facts return their customerFallback in customer mode and
   reviewCopy + chip in review mode; has(key) gates whole UI blocks. The module also counts placeholder rule files
   and unreviewed legal pages, logs every get() for the QA scan, collects the stage's frame-short log, and renders the
   fixed review badge (html[data-review] only).

   Shapes accepted for data/facts.json: { facts: [entry] } (WS-DATA), [entry], or { key: entry }.
   entry = { key, value, status: 'confirmed'|'unconfirmed', tier: 'launchRequired'|'optional', customerCopy,
             customerFallback, reviewCopy, source, omit? }  — customerCopy/Fallback may interpolate {value}. */

const ROOT = new URL('../../../', import.meta.url);
const reg = new Map();
const log = [];                 // { key, branch: 'confirmed'|'fallback'|'review'|'missing', at }
const frameShort = [];          // { scene, surface, fraction }
let placeholderConfigs = [];    // names of rule files with _placeholder: true
let legal = [];                 // [{ path, title, legalReviewed }]
let loadedPromise = null;
let fixture = null;             // 'confirmed' when ?facts=confirmed (review only)
const listeners = new Set();

/* ---- review mode: boot.js owns the URL overrides; this is the read side plus a safe fallback for pages that
       load without boot.js (tests, demos). ---- */
export function reviewMode() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('review')) sessionStorage.setItem('review', q.get('review') === '1' ? '1' : '0');
    const on = sessionStorage.getItem('review') === '1';
    if (on) document.documentElement.setAttribute('data-review', '1'); else document.documentElement.removeAttribute('data-review');
    return on;
  } catch { return false; }
}

function normalise(json) {
  let list = [];
  if (Array.isArray(json)) list = json;
  else if (json && Array.isArray(json.facts)) list = json.facts;
  else if (json && typeof json === 'object') list = Object.entries(json).filter(([k]) => !k.startsWith('_') && k !== 'version' && k !== 'updated').map(([key, v]) => (v && typeof v === 'object' && 'status' in v ? { key, ...v } : { key, value: v, status: 'confirmed', tier: 'optional' }));
  return list;
}

function interpolate(str, value) {
  if (str == null) return str;
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : { value };
  return String(str).replace(/\{([a-zA-Z0-9_.]+)\}/g, (_, k) => {
    if (k === 'value') return value == null ? '' : (typeof value === 'object' ? '' : String(value));
    const r = k.split('.').reduce((o, p) => (o && o[p] !== undefined ? o[p] : undefined), v);
    return r === undefined || r === null ? '' : String(r);
  });
}

async function fetchJson(rel) {
  try { const r = await fetch(new URL(rel, ROOT)); if (r.ok) return await r.json(); } catch {}
  return null;
}

/** Load the registry (+ the confirmed fixture in review mode with ?facts=confirmed), the rules' _placeholder flags
    and legal-status.json. Idempotent; pages may call it or just await ready(). */
export function load(inline) {
  if (loadedPromise && !inline) return loadedPromise;
  loadedPromise = (async () => {
    const review = reviewMode();
    try { fixture = review ? sessionStorage.getItem('facts') : null; } catch { fixture = null; }
    const lsP = fetchJson('data/legal-status.json');   /* perf audit: fetched alongside facts.json, not after it (one round trip less on every page) */
    const base = inline || (await fetchJson('data/facts.json')) || { facts: [] };
    normalise(base).forEach(e => reg.set(e.key, { tier: 'optional', ...e }));
    if (fixture === 'confirmed') {
      const fx = await fetchJson('qa/fixtures/facts.confirmed.json');
      if (fx) normalise(fx).forEach(e => reg.set(e.key, { ...(reg.get(e.key) || {}), ...e, status: e.status || 'confirmed' }));
    }
    // placeholder configs: rules.js (vendored) exposes _placeholder on pricing + delivery
    placeholderConfigs = [];
    const rules = await loadRules();
    if (rules) {
      if (fixture !== 'confirmed') {
        if (rules.pricing?._placeholder) placeholderConfigs.push('config/pricing-rules.json');
        if (rules.delivery?._placeholder) placeholderConfigs.push('config/delivery-rules.json');
      }
    }
    const ls = await lsP;
    legal = ls ? (Array.isArray(ls) ? ls : ls.pages || []) : [];
    if (fixture === 'confirmed') legal = legal.map(p => ({ ...p, legalReviewed: true }));
    listeners.forEach(fn => { try { fn(); } catch {} });
    return api;
  })();
  return loadedPromise;
}
export const ready = () => load();
export function onReady(fn) { listeners.add(fn); if (loadedPromise) loadedPromise.then(() => fn()); }

let rulesPromise = null;
/** The rules object (window.LIT_RULES) — from the page if present, else the vendored engine, else null. */
export function loadRules() {
  if (typeof window !== 'undefined' && window.LIT_RULES) return Promise.resolve(window.LIT_RULES);
  if (rulesPromise) return rulesPromise;
  rulesPromise = import(new URL('assets/vendor/engines/rules.js', ROOT).href).then(m => m.default || window.LIT_RULES || null).catch(() => (window.LIT_RULES || null));
  return rulesPromise;
}

function entry(key) { return reg.get(key); }
function record(key, branch) { log.push({ key, branch }); }

/** true only when the fact is confirmed (gates whole UI blocks, §3.9.1). */
export function has(key) { const e = entry(key); return !!e && e.status === 'confirmed'; }
/** The raw confirmed value, else undefined (never an unconfirmed draft in customer mode). */
export function value(key) {
  const e = entry(key);
  if (!e) { record(key, 'missing'); return undefined; }
  if (e.status === 'confirmed') { record(key, 'confirmed'); return e.value; }
  record(key, reviewMode() ? 'review' : 'fallback');
  return reviewMode() ? e.value : undefined;
}
/** Customer-facing text for a fact: customerCopy (interpolated) when confirmed; customerFallback in customer mode;
    reviewCopy in review mode. `fallback` overrides a missing key/fallback. Returns '' when the fact is omitted. */
export function get(key, fallback) {
  const e = entry(key);
  if (!e) { record(key, 'missing'); return fallback ?? ''; }
  if (e.status === 'confirmed') {
    record(key, 'confirmed');
    if (e.customerCopy != null) return interpolate(e.customerCopy, e.value);
    return e.value == null ? (fallback ?? '') : (typeof e.value === 'object' ? (fallback ?? '') : String(e.value));
  }
  if (reviewMode()) { record(key, 'review'); return e.reviewCopy ? interpolate(e.reviewCopy, e.value) : (e.customerFallback ?? fallback ?? ''); }
  record(key, 'fallback');
  return e.customerFallback != null ? interpolate(e.customerFallback, e.value) : (fallback ?? '');
}
/** Full entry (read-only copy) — for review UI. */
export function describe(key) { const e = entry(key); return e ? { ...e } : null; }
export function tier(key) { return entry(key)?.tier || null; }
export function status(key) { return entry(key)?.status || 'missing'; }
export function keys() { return Array.from(reg.keys()); }
/** Review-mode chip HTML for a fact (empty string in customer mode). */
export function chip(key, label) {
  if (!reviewMode()) return '';
  const e = entry(key);
  const text = label || (e && e.status === 'confirmed' ? 'Confirmed' : 'Unconfirmed');
  return `<span class="c-pill c-pill--review" data-fact="${key}" title="${key}${e && e.source ? ' · ' + String(e.source).replace(/"/g, '&quot;') : ''}">${text}</span>`;
}
/** Set `data-gated` collapse on an element when a fact is unconfirmed: removes it from the DOM (collapsed layout). */
export function gate(el, key) { if (!el) return false; if (has(key)) return true; el.remove(); return false; }

/* ---- promo helpers (pricing.js owns promoLive(); this is the facts side it reads) ---- */
export function promo() {
  const start = has('promoStart') ? value('promoStart') : null;
  const end = has('promoEnd') ? value('promoEnd') : null;
  const pct = has('promoPct') ? Number(value('promoPct')) : 0;
  return { start, end, pct, confirmed: !!(start && end && pct) };
}

/* ---- counting for the badge and the launch gate (§3.9.3) ---- */
export function unconfirmed(tierFilter) {
  return Array.from(reg.values()).filter(e => e.status !== 'confirmed' && (!tierFilter || e.tier === tierFilter)).map(e => e.key);
}
export function summary() {
  const facts = unconfirmed();
  const launch = unconfirmed('launchRequired');
  const legalOpen = legal.filter(p => !p.legalReviewed);
  return {
    facts: facts.length, launchRequired: launch.length, placeholderConfigs: placeholderConfigs.length, legalUnreviewed: legalOpen.length,
    frameShort: frameShort.length, fixture, lists: { facts, launch, placeholderConfigs: [...placeholderConfigs], legal: legalOpen.map(p => p.path), frameShort: [...frameShort] },
    text: `Review build · ${facts.length} unconfirmed fact${facts.length === 1 ? '' : 's'} · ${placeholderConfigs.length} placeholder rule file${placeholderConfigs.length === 1 ? '' : 's'} · ${legalOpen.length} legal page${legalOpen.length === 1 ? '' : 's'} unreviewed`
  };
}
export function getLog() { return log.slice(); }
export function clearLog() { log.length = 0; }
/** stage.js calls this when the sharpness cap stops a frame reaching its target fraction (§3.8.6). */
export function logFrameShort(scene, surface, fraction) {
  frameShort.push({ scene, surface, fraction: Math.round(fraction * 100) / 100 });
  if (reviewMode()) console.info(`frame-short ${scene} ${surface} ${fraction}`);
  renderBadge();
}

/* ---- review badge (§3.9.4) ---- */
let badge;
export function renderBadge() {
  if (!reviewMode()) { badge?.remove(); badge = null; return; }
  const s = summary();
  if (!badge) {
    /* A slim tab on the left edge, vertically centred: at desktop widths it sits wholly inside the page gutter, so it
       never covers gallery labels, trust-bar items or anything else bottom-left. The full summary is the button's
       accessible name and the first line of the panel. */
    badge = document.createElement('div');
    badge.className = 'ch-review'; badge.setAttribute('data-qa', 'chrome.review.badge');
    badge.innerHTML = `<button type="button" class="ch-review__btn" aria-expanded="false" aria-controls="ch-review-panel" data-qa="chrome.review.toggle"><span class="ch-review__label">Review</span><span class="ch-review__count"></span></button><div class="ch-review__panel" id="ch-review-panel" hidden role="region" aria-label="Review build status"></div>`;
    const btn = badge.querySelector('button'), panel = badge.querySelector('.ch-review__panel');
    const setOpen = open => { panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', () => setOpen(panel.hidden));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { setOpen(false); btn.focus(); } });
    document.addEventListener('pointerdown', e => { if (!panel.hidden && !badge.contains(e.target)) setOpen(false); });
    document.body.appendChild(badge);
  }
  const open = s.facts + s.placeholderConfigs + s.legalUnreviewed;
  const btn = badge.querySelector('.ch-review__btn');
  btn.querySelector('.ch-review__count').textContent = String(open);
  btn.setAttribute('aria-label', s.text); btn.title = s.text;
  btn.classList.toggle('is-clear', open === 0);
  const li = (k, v) => `<li><span>${k}</span><span>${v ?? ''}</span></li>`;
  const factRows = s.lists.facts.map(k => li(k, entry(k)?.tier === 'launchRequired' ? 'launch-required' : 'optional')).join('') || `<li class="ok">all confirmed</li>`;
  badge.querySelector('.ch-review__panel').innerHTML =
    `<p class="ch-review__sum">${s.text}</p>` +
    `<h3>Facts (${s.facts})</h3><ul>${factRows}</ul>` +
    `<h3>Placeholder configs (${s.placeholderConfigs})</h3><ul>${s.lists.placeholderConfigs.map(p => li(p, '_placeholder: true')).join('') || '<li class="ok">none</li>'}</ul>` +
    `<h3>Legal status (${s.legalUnreviewed})</h3><ul>${s.lists.legal.map(p => li(p, 'unreviewed')).join('') || '<li class="ok">all reviewed</li>'}</ul>` +
    `<h3>frame-short (${s.frameShort})</h3><ul>${s.lists.frameShort.map(f => li(`${f.scene} · ${f.surface}`, f.fraction)).join('') || '<li class="ok">none</li>'}</ul>` +
    (s.fixture ? `<p class="t-caption">Fixture: ${s.fixture}</p>` : '') +
    `<a class="c-btn c-btn--ghost c-btn--sm" href="${location.pathname}?review=0">Leave review mode</a>`;
}

export const facts = { load, ready, onReady, reviewMode, has, value, get, describe, tier, status, keys, chip, gate, promo, unconfirmed, summary, getLog, clearLog, logFrameShort, renderBadge, loadRules };
const api = facts;
export default facts;
