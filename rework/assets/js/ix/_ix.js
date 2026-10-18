/* Lit Neon v2 — ix/_ix.js: the helpers every §5 interactive shares (P1b). Not a page module: each ix/<name>.js imports
   from here so the nine modules agree on one boot sequence, one view over the design store (§5.13) and one way to
   inline an illustration. Mount contract (§0.3): mount(el, opts) → { destroy(), setState(partial) }; opts override
   el.dataset.* so a guide can embed `<div data-ix="size-guide" data-scene="s02-bedroom">` with no script of its own.
   Shared state: `home.state` is a VIEW over router.design (the single source of truth); readState() reads it, the
   modules that may write (size guide) call writeState() with their source, and watchState() re-renders on `ln:design`. */
import * as R from 'core/renderer.js';
import stage from 'core/stage.js';
import pricing from 'core/pricing.js';
import router from 'core/router.js';
import facts from 'core/facts.js';
import copy from 'core/copy.js';
import * as clock from 'core/clock.js';
import * as ui from 'core/ui.js';
import * as money from 'core/money.js';
import { roving, announce } from 'core/a11y.js';

export { R, stage, pricing, router, facts, copy, clock, ui, money, roving, announce };
export const esc = ui.esc;
export const icon = ui.icon;
export const gbp = money.gbp;

/* ---------- copy before any mount: every module builds its markup synchronously in mount() with t() (tab names, pills,
   pause labels, aria-labels), so the ix strings and the facts registry must be in place before an importer evaluates.
   A host that mounts before its own copy load (home) otherwise got empty tabs and labels. This top-level await holds the
   importing modules for one small cached fetch; neither call rejects in a way that blocks the page. ---------- */
await Promise.all([copy.load(['ix']), Promise.resolve().then(() => facts.ready()).catch(() => null)]);

/* ---------- boot: copy + facts + scenes + sprite once per page; fonts kicked, modules re-render on ln:fonts ---------- */
let bootPromise = null;
export function boot() {
  if (!bootPromise) bootPromise = Promise.all([copy.load(['ix']), facts.ready(), stage.loadScenes(), ui.ensureSprite()]).then(() => { R.ensureFonts(); R.initStrikes(); return true; });
  return bootPromise;
}

/* ---------- copy: every ix string lives under the `ix` key of data/copy/ix.json ---------- */
export const t = (key, vars = {}, fallback) => copy.t('ix.' + key, vars, fallback);
export const reviewMode = () => facts.reviewMode();
export const reduced = () => R.reducedMotion();

/* ---------- the shared state view (§5.13) ---------- */
const FALLBACK = () => t('common.fallbackWords', {}, 'After dark');
/** The visitor's design (router store) merged with opts.state and the element's data-* (words/font/colour/size/jacket/scene). */
export function readState(el, opts = {}) {
  const rec = router.design.get();
  const ds = el ? el.dataset : {};
  const base = rec ? rec.state : {};
  const st = Object.assign({}, base, opts.state || {});
  if (ds.words) st.text = ds.words; if (ds.font) st.font = ds.font; if (ds.colour) st.colour = ds.colour; if (ds.size) st.size = ds.size; if (ds.jacket) st.jacket = ds.jacket;
  if (!st.text || !st.text.trim()) st.text = opts.fallbackWords || ds.fallback || FALLBACK();
  return R.normalise(st);
}
/** The host's opts.state is a pin taken when it mounted (or last called setState). A later write to the store (the quiz
    on the same page, the builder in another tab, a hub's own capture) is newer intent, so it supersedes the pin until the
    host pins again; without this a host that passes a snapshot (home passes view()) freezes its modules on old words. */
export function hostState(opts = {}) {
  let pin = opts.state ? Object.assign({}, opts.state) : null;
  return { get: () => pin, set: (partial = {}) => (pin = Object.assign({}, pin || {}, partial)), clear: () => { pin = null; } };
}
/** Re-run fn with a fresh state whenever the store changes (another section, another tab). With a hostState, the pin is
    dropped first so fn reads the store. Returns off(). */
export function watchState(a, b) {
  const host = typeof a === 'function' ? null : a, fn = typeof a === 'function' ? a : b;
  const h = () => { if (host) host.clear(); fn(); };
  document.addEventListener('ln:design', h);
  const off = router.design.subscribe(h);
  return () => { document.removeEventListener('ln:design', h); off(); };
}
/** Debounced write to the store from a section (the size guide), so the hero and the builder follow. */
export function writeState(partial, source = 'hero') {
  const rec = router.design.get(); const base = rec ? rec.state : R.normalise({});
  router.design.setDebounced(Object.assign({}, base, partial), source, 300);
}
/** builder link carrying a state (root-relative, works from guides/ and legal/) */
export const link = (state, extra) => router.builderLink(state, extra);

/* ---------- fonts: re-render when a lettering face lands ---------- */
export const onFonts = fn => R.onFonts(fn);

/* ---------- visibility: pause animations off-screen, start sweeps on first view ---------- */
export function onView(el, fn, { threshold = .35, once = false } = {}) {
  if (!('IntersectionObserver' in window)) { fn(true); return () => {}; }
  const io = new IntersectionObserver(entries => { entries.forEach(e => { const on = e.isIntersecting && e.intersectionRatio >= threshold; fn(on); if (on && once) io.disconnect(); }); }, { threshold: [0, threshold, .7] });
  io.observe(el); return () => io.disconnect();
}

/* ---------- illustrations: fetch an SVG once, inline it with unique ids so two instances never clash ---------- */
const svgCache = new Map();
export async function inlineSvg(url, uid) {
  if (!svgCache.has(url)) svgCache.set(url, fetch(url).then(r => r.ok ? r.text() : '').catch(() => ''));
  let src = await svgCache.get(url); if (!src) return null;
  const p = uid + '-';
  src = src.replace(/<\?xml[^>]*>/, '').replace(/\bid="([^"]+)"/g, (m, id) => `id="${p}${id}"`)
    .replace(/\b(xlink:href|href)="#([^"]+)"/g, (m, a, id) => `${a}="#${p}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (m, id) => `url(#${p}${id})`)
    .replace(/aria-labelledby="([^"]+)"/g, (m, ids) => `aria-labelledby="${ids.split(/\s+/).map(i => p + i).join(' ')}"`)
    .replace(/\swidth="\d+"\sheight="\d+"/, '');
  const box = document.createElement('div'); box.innerHTML = src;
  const svg = box.querySelector('svg'); if (!svg) return null;
  svg.setAttribute('focusable', 'false');
  return svg;
}
let uidN = 0; export const uid = (prefix = 'ix') => `${prefix}${++uidN}${Math.random().toString(36).slice(2, 6)}`;

/* ---------- lettering as SVG (the drafting illustrations draw the visitor's words) ----------
   Fits the design's ink box into `box` {x,y,w,h} (SVG units), keeping the aspect. Returns { html, bbox } where html is
   a <g> of <text> lines (+ the icon path) and bbox is the ink box actually used. `attrs` lands on every <text>. */
export function letteringSvg(res, box, { attrs = '', cls = '', iconCls = '', sw = null } = {}) {
  const m = res.m; if (!m || !(m.inkW > 0)) return { html: '', bbox: box };
  const em = Math.min(box.w / m.inkW, box.h / m.inkH);
  /* sw = [fraction of the em, min, max]: a stroke that scales with the lettering, so long words drawn small keep open
     counters instead of a fixed-width stroke filling them in */
  if (sw) attrs += ` style="stroke-width:${Math.max(sw[1], Math.min(sw[2], em * sw[0])).toFixed(2)}px"`; /* inline style: an illustration's own <style> (.tube{stroke-width:5}) outranks a presentation attribute */
  const w = m.inkW * em, h = m.inkH * em, left = box.x + (box.w - w) / 2, top = box.y + (box.h - h) / 2;
  const lines = res.drawLines.length ? res.drawLines : (res.hasText ? [] : ['Your words']);
  const textShiftX = (m.inkW - m.textW) / 2 - m.minX + (m.textOffX ? m.textOffX / 2 : 0);
  const alignOff = li => res.state.align === 'left' ? 0 : res.state.align === 'right' ? (m.blockW - m.lineWidths[li]) : (m.blockW - m.lineWidths[li]) / 2;
  const f = res.font;
  let html = `<g class="${cls}">`;
  if (res.icon) { const inline = res.iconPos === 'inline' && lines.length; const ix = inline ? 0 : (m.inkW - m.iconEm) / 2, iy = inline ? (m.inkH - m.iconEm) / 2 : 0; html += `<g class="${iconCls}" transform="translate(${(left + ix * em).toFixed(2)} ${(top + iy * em).toFixed(2)}) scale(${(m.iconEm * em / 24).toFixed(4)})"><path ${attrs} vector-effect="non-scaling-stroke" d="${R.OPTIONS.icons[res.icon]}"/></g>`; }
  lines.forEach((line, li) => { html += `<text ${attrs} x="${(left + (textShiftX + alignOff(li)) * em).toFixed(2)}" y="${(top + (m.textOffY + m.baselines[li] - m.top) * em).toFixed(2)}" font-family="${esc(f.family)}" font-weight="${f.weight || 400}" font-size="${(em * ((m.lineScales || [])[li] || 1)).toFixed(2)}" word-spacing="${(f.wordSpacingEm || 0) * em}" xml:space="preserve">${esc(line)}</text>`; });
  html += '</g>';
  return { html, bbox: { x: left, y: top, w, h }, em };
}

/* ---------- custom frames: the stage reads FRAMES[name](SW) → [min, max] fraction of the stage width on every render.
   Registering a name here never touches the five brief frames; INTEGRATION.md asks WS0-B for a first-class option. ---------- */
export function registerFrame(name, fn) { if (stage.FRAMES && !stage.FRAMES[name]) stage.FRAMES[name] = fn; return name; }

/* ---------- small DOM helpers ---------- */
export const h = (html) => { const tpl = document.createElement('template'); tpl.innerHTML = html.trim(); return tpl.content.firstElementChild; };
export const $ = (el, s) => el.querySelector(s);
export const $$ = (el, s) => Array.from(el.querySelectorAll(s));
export function pressGroup(container, selector, onPick) {
  container.addEventListener('click', e => { const b = e.target.closest(selector); if (!b || !container.contains(b) || b.disabled) return; $$(container, selector).forEach(x => x.setAttribute('aria-pressed', String(x === b))); onPick(b); });
}
/** a "Pause animations" control (WCAG 2.2.2): returns { el, playing, set(on) } */
export function pauseButton({ qa, onChange, label = t('common.pause', {}, 'Pause animations'), playLabel = t('common.play', {}, 'Play animations') }) {
  const el = h(`<button type="button" class="c-btn c-btn--ghost c-btn--sm ix-pause" aria-pressed="false" data-qa="${esc(qa)}">${icon('pause')}<span class="label">${esc(label)}</span></button>`);
  let playing = true;
  const set = on => { playing = !!on; el.setAttribute('aria-pressed', String(!playing)); el.innerHTML = `${icon(playing ? 'pause' : 'play')}<span class="label">${esc(playing ? label : playLabel)}</span>`; onChange && onChange(playing); };
  el.addEventListener('click', () => set(!playing));
  return { el, get playing() { return playing; }, set };
}
/** the scene for a stage ("s02-bedroom") → its metadata, or the default living room */
export const sceneOf = id => stage.getScene(id) || stage.getScene('s01-living');
/** sign geometry inside a mounted stage: { ppc, crop:{x,y,w,h}, k, PW, PH } from frameInfo + scene (plate px → stage px: (px - crop.x) * k) */
export function stageGeom(api) {
  const fi = api.frameInfo(); const sc = api.scene; if (!fi || !sc) return null;
  const o = fi.orientation; const [PW, PH] = (o === 'portrait' && sc.aspect && sc.aspect.portrait) ? sc.aspect.portrait : (sc.aspect ? sc.aspect.landscape : [3072, 2048]);
  const R0 = api.el.getBoundingClientRect(); const S = api.el.querySelector('.ln-stage__plate'); const Rp = S ? S.getBoundingClientRect() : R0;
  const k = fi.k; const left = Rp.left - R0.left, top = Rp.top - R0.top;
  const p = o === 'portrait' && sc.portrait ? sc.portrait : null;
  const calibPx = p ? p.calibPx : sc.calib.px;
  return { ppc: fi.ppc, k, PW, PH, crop: fi.crop, left, top, calibPx, topY: p ? (p.calibTopY ?? sc.calib.topY) : sc.calib.topY, floorY: sc.floorY ?? .84, toStage: (x, y) => ({ x: left + x * k, y: top + y * k }) };
}

/* ---------- auto-mount `[data-ix]` embeds (guides, hubs): <div data-ix="size-guide" data-scene="…"> ---------- */
const MODULES = { jacket: 'jacket', anatomy: 'anatomy', 'size-guide': 'size-guide', size: 'size-guide', effects: 'effects', hanging: 'hanging', quiz: 'quiz', daynight: 'daynight', 'day-night': 'daynight', cost: 'cost', process: 'process' };
export async function autoMount(root = document) {
  const out = [];
  for (const el of Array.from(root.querySelectorAll('[data-ix]'))) {
    if (el.dataset.ixMounted) continue; const name = MODULES[el.dataset.ix]; if (!name) continue; el.dataset.ixMounted = '1';
    try { const mod = await import(`./${name}.js`); out.push(mod.mount(el, {})); } catch (e) { console.error('ix: failed to mount', name, e); }
  }
  return out;
}
export default { boot, readState, watchState, hostState, writeState, link, autoMount, t };
