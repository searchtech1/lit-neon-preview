/* Lit Neon v2 — stage: the scene compositor (brief §3.8.4 layers, §3.8.6 frames, §5.9 own wall). Built once here and
   used by the hero, the builder, cards (quick view), the product gallery, the size guide, the drawer minis and gift.html.
   stage.mount(el, { frame: 'hero'|'card'|'room'|'guide'|'real'|'thumb', scene, design, view, interactive, pill, rulers })
     → { setDesign, setView, setScene, setFrame, render, strike, toPNG, frameInfo, signBBox, ownWall, on, destroy, ready }
   Layers, bottom to top: plate (day/night crossfade) → wall bounce (screen, clipped to wallBox) → floor bounce → acrylic
   backing (cut contour via SVG filter, or panel/stand with standoffs) → tube (renderer glow stack; off-state = jacket)
   → rulers (mono, cm/in) → "Drag to move" hint (first use) → "Rendered preview" pill (rule 4).
   Calibration keeps the sign at TRUE scale (ppc from calib.px / calib.cm); the frame decides how big it looks: every
   frame except `real` crops to the wall box and zooms until the sign hits the surface's target fraction of the stage
   width, capped so source pixels ≥ device pixels (the wall crop is the source), never leaving the plate and always
   keeping the calibration object's top edge in the bottom 30% of the crop. Review mode logs `frame-short`. */
import { resolve as resolveDesign, OPTIONS, ICON_SIZE, ICON_GAP, iconAtOf, tubeHtml, iconSvg, coreOf, glowOf, iconGlowOf, offTube, uiHex, rgba, relight, reducedMotion, bakeGlow, onFonts, injectCss, escapeHtml as esc } from './renderer.js';
import { fmtLen, cmToIn } from './money.js';
import * as clock from './clock.js';

/* ---------- scenes.json ---------- */
let scenesPromise = null, SCENES = null;
export function loadScenes(url = '/lit-neon-preview/rework/data/scenes.json') {
  /* perf audit: the AVIF/WebP probe used to finish after the first plate was chosen, so pages fetched the JPG and then the
     AVIF (or kept a 500 KB JPG). The probe starts here and the scenes promise waits for it (a few ms). */
  if (!scenesPromise) scenesPromise = Promise.all([fetch(url, { cache: 'no-store' }).then(r => r.json()), Promise.race([probeFormats(), new Promise(r => setTimeout(r, 400))])]).then(([j]) => { SCENES = j.scenes; import('./pricing.js').then(p => p.setScenes && p.setScenes(SCENES)).catch(() => {}); return SCENES; });
  return scenesPromise;
}
export const scenes = () => SCENES || [];
export const getScene = id => (SCENES || []).find(s => s.id === id) || null;
/** scenes for a collection first, then the rest (the picker order) */
export function scenesFor(collection) { const all = (SCENES || []).filter(s => !s.own && !s.studio); return all.filter(s => s.collection === collection).concat(all.filter(s => s.collection !== collection)); }
export const defaultSceneFor = collection => (scenesFor(collection)[0] || getScene('s01-living') || {}).id || 's01-living';

/* image format support, probed once (avif → webp → jpg) */
let fmtSupport = null, fmtProbe = null;
function probeFormats() {
  if (fmtSupport) return fmtProbe;
  fmtSupport = { avif: false, webp: false };
  const test = (fmt, uri) => new Promise(r => { const i = new Image(); i.onload = () => r(i.width > 0); i.onerror = () => r(false); i.src = uri; });
  fmtProbe = Promise.all([
    test('webp', 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==').then(ok => { fmtSupport.webp = ok; }),
    test('avif', 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=').then(ok => { fmtSupport.avif = ok; })
  ]);
  return fmtProbe;
}
function plateSourceOf(scene, variant, orientation, wall) {
  const P = scene.plates; const portrait = orientation === 'portrait';
  let stem, widths;
  if (wall && P.wall && P.wall[orientation] && P.wall[orientation][variant]) { stem = P.wall[orientation][variant]; widths = P.widths ? (portrait ? P.widths.portraitWall : P.widths.wall) : null; }
  else if (wall) { stem = `${P[variant]}-wall${portrait ? '-portrait' : ''}`; widths = scene.wall && scene.wall[orientation] ? scene.wall[orientation].sizes : null; }
  else if (portrait && P.portrait && P.portrait[variant]) { stem = P.portrait[variant]; widths = P.widths ? P.widths.portrait : null; }
  else if (portrait) { stem = `${P[variant]}-portrait`; widths = P.portraitSizes || P.sizes; }
  else { stem = P[variant]; widths = P.widths ? P.widths.plate : P.sizes; }
  return { stem: '/lit-neon-preview/rework/assets/img/' + stem, widths: widths || [1600], formats: P.formats || ['jpg'] };
}
const bestFormat = formats => { probeFormats(); if (formats.includes('avif') && fmtSupport.avif) return 'avif'; if (formats.includes('webp') && fmtSupport.webp) return 'webp'; return formats.includes('jpg') ? 'jpg' : formats[formats.length - 1]; };

const FRAMES = {
  hero: SW => SW >= 1024 ? [.35, .45] : SW < 768 ? [.60, .70] : [.45, .55],
  card: () => [.45, .60], room: () => [.50, .60], guide: () => [.30, .45], real: () => [0, .25],
  /* decorative room heroes (contact, 404): the sign smaller in frame so the room's furniture shows under it */
  wide: () => [.20, .30],
  /* basket / checkout line thumbnails (~96 px): the sign fills most of the tile so it reads at a glance */
  thumb: () => [.76, .84]
};
const dpr = () => Math.min(3, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
const isReview = () => { try { return clock.isReview(); } catch { return false; } };
const frameShortLog = [];
export const frameShorts = () => frameShortLog.slice();

const CSS = `
.ln-stage{position:relative;overflow:clip;background:var(--night,#180E1F);isolation:isolate;user-select:none;-webkit-user-select:none;touch-action:pan-y;width:100%;max-width:100%;contain:layout paint}
.ln-stage *{box-sizing:border-box}
.ln-stage__plate{position:absolute;will-change:transform;transition:left var(--d-base,240ms) var(--ease-out),top var(--d-base,240ms) var(--ease-out),width var(--d-base,240ms) var(--ease-out),height var(--d-base,240ms) var(--ease-out)}
.ln-stage.is-dragging .ln-stage__plate,.ln-stage.is-dragging .ln-sign,.ln-stage.no-anim .ln-stage__plate,.ln-stage.no-anim .ln-sign{transition:none}
.ln-plate{position:absolute;display:block;max-width:none;pointer-events:none;transition:opacity var(--d-slow,480ms) var(--ease-in-out);object-fit:fill}
.ln-plate.night{opacity:0}.ln-stage.is-night .ln-plate.night,.ln-stage.day-pending .ln-plate.night{opacity:1}
.ln-stage.has-poster .ln-stage__plate::before{display:none}
.ln-stage.is-loading .ln-stage__plate::before{content:"";position:absolute;inset:0;background:linear-gradient(100deg,var(--night-2,#1F1328) 20%,var(--night-3,#27192F) 40%,var(--night-2,#1F1328) 60%);background-size:300% 100%;animation:ln-shimmer 1.6s linear infinite}
@keyframes ln-shimmer{to{background-position:-300% 0}}
.ln-bounce,.ln-floorbounce{position:absolute;pointer-events:none;mix-blend-mode:screen;transition:opacity var(--d-slow,480ms),background var(--d-base,240ms);border-radius:50%}
.ln-sign{position:absolute;transition:left var(--d-base,240ms) var(--ease-out),top var(--d-base,240ms) var(--ease-out),width var(--d-base,240ms) var(--ease-out),height var(--d-base,240ms) var(--ease-out);outline:none}
.ln-sign[tabindex]{cursor:grab}.ln-stage.is-dragging .ln-sign{cursor:grabbing}
.ln-sign:focus-visible{box-shadow:0 0 0 2px var(--amber,#F0B56A),0 0 0 5px rgba(0,0,0,.4)}
.ln-sign.faded{opacity:.35}
.ln-board{position:absolute;inset:0;display:none;transition:background var(--d-base,240ms)}
.ln-board i{position:absolute;width:var(--so);height:var(--so);border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff 0,#e8d9a8 30%,#a8853d 70%,#6b5322 100%);box-shadow:0 2px 2px rgba(0,0,0,.45)}
.ln-board i:nth-child(1){left:var(--soi);top:var(--soi)}.ln-board i:nth-child(2){right:var(--soi);top:var(--soi)}.ln-board i:nth-child(3){left:var(--soi);bottom:var(--soi)}.ln-board i:nth-child(4){right:var(--soi);bottom:var(--soi)}
.ln-standbase{position:absolute;left:18%;right:18%;top:100%;display:none;border-radius:0 0 4px 4px}
.ln-sbody{position:absolute;left:50%;top:50%;display:block;white-space:pre;line-height:1.15;margin:0;pointer-events:none}
.ln-sbody p{position:absolute;margin:0;white-space:pre;line-height:1.15}
.ln-sbody svg{position:absolute;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.5;width:var(--ic);height:var(--ic)}
.ln-sbody .ln-bridge{position:absolute;background:#fff;transform-origin:0 50%}
.ln-sign.has-icon .ln-tube svg{pointer-events:auto;cursor:move;touch-action:none}
.ln-sign.icon-hint .ln-tube svg{animation:ln-icon-hint 1.1s ease-in-out 3}
@keyframes ln-icon-hint{50%{transform:scale(1.18)}}
.ln-contour{color:#fff}.ln-contour svg{stroke:#fff;stroke-width:2.2}
.ln-stage.is-night .ln-board,.ln-stage.is-night .ln-standbase{filter:brightness(.62)}
.ln-tube{transition:color var(--d-base,240ms),text-shadow var(--d-base,240ms),filter var(--d-base,240ms)}
.ln-tube.off p,.ln-tube.off p .ln-line{color:var(--off,#ebe6dd)!important;text-shadow:0 .012em 0 rgba(0,0,0,.38),0 .035em .05em rgba(0,0,0,.32)!important}
.ln-tube.off p .ln-line{color:var(--off-line,var(--off,#ebe6dd))!important}
.ln-tube.off svg{stroke:var(--off,#ebe6dd)!important;filter:drop-shadow(0 1px 0 rgba(0,0,0,.4))!important}
.ln-tube.placeholder p{opacity:.45;border:1px dashed rgba(242,233,223,.5);border-radius:.1em;padding:0 .08em}
.ln-stage.is-rgb .ln-tube:not(.off),.ln-stage.is-rgb .ln-bounce,.ln-stage.is-rgb .ln-floorbounce{animation:ln-hue var(--d-hue,6s) linear infinite}
.ln-stage .strike{animation:ln-strike var(--d-strike,800ms) linear}
.ln-ruler{position:absolute;pointer-events:none;color:rgba(242,233,223,.9);font:400 var(--t-mono,13px)/1 var(--f-mono,monospace);font-variant-numeric:tabular-nums;text-shadow:0 1px 2px rgba(0,0,0,.6)}
.ln-ruler.h{height:9px;border-left:1px solid currentColor;border-right:1px solid currentColor}
.ln-ruler.h::before{content:"";position:absolute;left:0;right:0;top:4px;border-top:1px solid currentColor;opacity:.8}
.ln-ruler.h span{position:absolute;left:50%;top:13px;transform:translateX(-50%);white-space:nowrap}
.ln-ruler.v{width:9px;border-top:1px solid currentColor;border-bottom:1px solid currentColor}
.ln-ruler.v::before{content:"";position:absolute;top:0;bottom:0;left:4px;border-left:1px solid currentColor;opacity:.8}
.ln-ruler.v span{position:absolute;left:15px;top:50%;transform:translateY(-50%);white-space:nowrap}
.ln-ruler.v.flip span{left:auto;right:15px}
.ln-stage.is-light .ln-ruler{color:rgba(24,14,31,.85);text-shadow:none}
.ln-stage__ui{position:absolute;inset:0;pointer-events:none;z-index:5}
.ln-pill{position:absolute;left:var(--s-3,12px);bottom:var(--s-3,12px);display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:var(--r-pill,999px);background:rgba(24,14,31,.62);color:var(--bone-2,#D9CFC6);font:500 var(--t-caption,13px)/1.2 var(--f-ui,sans-serif);backdrop-filter:blur(8px);border:1px solid rgba(242,233,223,.14)}
.ln-pill::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--brass,#C8A04A)}
.ln-hint{position:absolute;left:50%;top:var(--s-4,16px);transform:translateX(-50%);padding:8px 14px;border-radius:var(--r-pill,999px);background:rgba(242,233,223,.92);color:var(--night,#180E1F);font:600 var(--t-small,14px)/1.2 var(--f-ui,sans-serif);box-shadow:var(--e-2);transition:opacity var(--d-base,240ms);white-space:nowrap}
.ln-hint[hidden]{display:none}
.ln-msg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:10px 16px;border-radius:var(--r-2,8px);background:rgba(24,14,31,.78);color:var(--bone,#F2E9DF);font:500 var(--t-small,14px)/1.3 var(--f-ui,sans-serif);text-align:center;max-width:min(320px,90%);pointer-events:none}
/* own wall scale bar */
.ln-bar{position:absolute;height:44px;transform:translateY(-50%);pointer-events:auto;touch-action:none}
.ln-bar__line{position:absolute;left:0;right:0;top:50%;height:3px;transform:translateY(-50%);background:var(--amber,#F0B56A);box-shadow:0 0 0 1px rgba(0,0,0,.5)}
.ln-bar__end{position:absolute;top:0;width:44px;height:44px;margin-left:-22px;border-radius:50%;background:rgba(240,181,106,.18);display:grid;place-items:center;cursor:ew-resize;border:0;padding:0}
.ln-bar__end::after{content:"";width:16px;height:16px;border-radius:50%;background:var(--amber,#F0B56A);border:2px solid var(--night,#180E1F)}
.ln-bar__end:focus-visible{outline:2px solid var(--amber,#F0B56A);outline-offset:2px}
.ln-bar__label{position:absolute;left:50%;top:-44px;transform:translateX(-50%);display:flex;gap:6px;align-items:center;padding:6px 10px;border-radius:var(--r-2,8px);background:rgba(24,14,31,.88);color:var(--bone,#F2E9DF);font:500 var(--t-caption,13px)/1.2 var(--f-ui,sans-serif);white-space:nowrap;backdrop-filter:blur(6px)}
.ln-bar__label select,.ln-bar__label input{font:inherit;color:inherit;background:var(--night-3,#27192F);border:1px solid rgba(242,233,223,.2);border-radius:4px;height:32px;padding:0 6px;min-width:0}
.ln-bar__label input{width:64px}
.ln-stage.is-brighter .ln-plate{filter:brightness(1.35) contrast(.95)}
@media (prefers-reduced-motion:reduce){.ln-stage .strike,.ln-stage.is-rgb .ln-tube,.ln-stage.is-rgb .ln-bounce,.ln-stage.is-rgb .ln-floorbounce{animation:none!important}.ln-stage__plate,.ln-sign,.ln-plate{transition:none!important}}`;

let uid = 0;
/** mount(el, opts) — see the header. design = design state (§4.2); view fields can also live on the design (night/on/unit/view). */
export function mount(el, opts = {}) {
  injectCss(); injectCss('ln-stage-css', CSS);
  const id = 'lns' + (++uid);
  el.classList.add('ln-stage'); el.dataset.composite = ''; el.dataset.frame = opts.frame || 'room';
  if (opts.qa && !el.dataset.qa) el.dataset.qa = opts.qa; /* the stage root carries its qa prefix (drawer minis: basket.drawer.line.stage) */
  /* perf audit (LCP): a page may ship a low-res poster of its hero plate in the HTML (<picture class="ln-stage__poster"
     data-scene="…">). It paints before any JS runs, stays under the plate while the real plates load, and is removed once
     they have (or as soon as the stage shows a different scene). */
  let poster = el.querySelector(':scope > .ln-stage__poster');
  /* the poster stays attached (re-inserting it would paint it again and count as a second, later LCP candidate) */
  [...el.childNodes].forEach(n => { if (n !== poster) n.remove(); });
  el.insertAdjacentHTML('beforeend', `
    <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="${id}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
      <feMorphology in="SourceAlpha" operator="dilate" radius="10" result="d"/><feGaussianBlur in="d" stdDeviation="4" result="b"/>
      <feComponentTransfer in="b" result="shape"><feFuncA type="linear" slope="24" intercept="-11"/></feComponentTransfer>
      <feMorphology in="shape" operator="erode" radius="1.3" result="inner"/><feComposite in="shape" in2="inner" operator="out" result="edge"/>
      <feFlood class="cfFill" flood-color="#ffffff" flood-opacity=".08"/><feComposite in2="shape" operator="in" result="fill"/>
      <feFlood class="cfEdge" flood-color="#ffffff" flood-opacity=".45"/><feComposite in2="edge" operator="in" result="edgeC"/>
      <feMerge><feMergeNode in="fill"/><feMergeNode in="edgeC"/></feMerge></filter></svg>
    <div class="ln-stage__plate">
      <img class="ln-plate day" alt="" decoding="async" draggable="false"><img class="ln-plate night" alt="" decoding="async" draggable="false">
      <div class="ln-bounce"></div><div class="ln-floorbounce"></div>
      <div class="ln-sign" role="img" aria-label="Your sign" data-qa="${esc(opts.qa || 'stage')}.sign"><div class="ln-board"><i></i><i></i><i></i><i></i></div><div class="ln-sbody ln-contour above" aria-hidden="true" style="filter:url(#${id})"></div><div class="ln-sbody ln-tube above"></div><div class="ln-standbase"></div></div>
      <div class="ln-ruler h"><span></span></div><div class="ln-ruler v"><span></span></div>
    </div>
    <div class="ln-stage__ui">${opts.pill === false ? '' : `<span class="ln-pill c-pill c-pill--rendered" data-caption="rendered">Rendered preview</span>`}<div class="ln-hint" hidden data-qa="${esc(opts.qa || 'stage')}.hint">Drag to move</div></div>`);
  if (poster) el.classList.add('has-poster');
  const dropPoster = () => { if (!poster) return; poster.remove(); poster = null; el.classList.remove('has-poster'); };
  const q = s => el.querySelector(s);
  const E = { plate: q('.ln-stage__plate'), day: q('.ln-plate.day'), night: q('.ln-plate.night'), bounce: q('.ln-bounce'), floor: q('.ln-floorbounce'), sign: q('.ln-sign'), board: q('.ln-board'), contour: q('.ln-contour'), tube: q('.ln-tube'), standbase: q('.ln-standbase'), rulH: q('.ln-ruler.h'), rulV: q('.ln-ruler.v'), ui: q('.ln-stage__ui'), hint: q('.ln-hint'), filter: q('filter') };

  const st = {
    frame: opts.frame || 'room', sceneId: opts.scene || null, scene: null, design: null, res: null,
    view: Object.assign({ night: true, on: true, rulers: opts.rulers === false ? 'off' : 'cm', unit: 'cm' }, opts.view || {}),
    interactive: opts.interactive !== false, loaded: { day: false, night: false }, k: 1, ppc: 0, crop: null, orientation: 'landscape', frameInfo: null,
    own: null /* { url, w, h, bar: {x1,y1,x2,y2 (plate fractions)}, cm, set: bool, rotation, bright } */
  };
  const listeners = {}; const emit = (t, d) => (listeners[t] || []).forEach(fn => { try { fn(d); } catch {} });
  const on = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); return () => { listeners[t] = listeners[t].filter(f => f !== fn); }; };

  /* ---------- plates ---------- */
  /* one resolver for both scenes.json shapes: IMG's delivered entries (plates.portrait / plates.wall.* / plates.widths /
     plates.formats) and the placeholder short form (plates.sizes + implicit -portrait / -wall suffixes). */
  const plateSource = plateSourceOf;

  const pickSize = (sizes, need) => { const s = (sizes || [1600]).slice().sort((a, b) => a - b); return s.find(x => x >= need) || s[s.length - 1]; };
  let plateSrcKey = '';
  function loadPlates(scene, orientation, wall, needPx) {
    if (poster && (scene.own || poster.dataset.scene !== scene.id)) dropPoster();
    if (scene.own) return;
    const src = plateSource(scene, 'day', orientation, wall); const size = pickSize(src.widths, needPx); const fmt = bestFormat(src.formats);
    const key = `${scene.id}|${orientation}|${wall}|${size}|${fmt}`;
    if (key === plateSrcKey) return; plateSrcKey = key;
    el.classList.add('is-loading'); st.loaded = { day: false, night: false };
    /* perf audit: priority is set BEFORE src (setting it after had no effect): the plate the viewer sees first gets 'high' on
       hero stages; every other stage lets the browser defer offscreen plates (loading=lazy) so they stop competing with the hero */
    const lead = st.view.night ? 'night' : 'day';
    for (const v of ['day', 'night']) { const img = E[v]; img.fetchPriority = opts.priority === 'high' && v === lead ? 'high' : 'auto'; if (opts.priority !== 'high' && opts.lazy !== false) img.loading = 'lazy'; }
    /* simplify rework (speed): only the plate on screen is fetched up front; the other one follows once the first has
       landed and the page has gone quiet (or at once when the lights are switched). A stage that started from a baked
       poster already showed the sign lit, so it does not replay the off/on strike when the plate lands. */
    const hadPoster = !!poster; pendingPlates = {}; el.classList.toggle('day-pending', lead === 'night');
    for (const v of ['day', 'night']) { const img = E[v]; const sv = plateSource(scene, v, orientation, wall); const url = `${sv.stem}-${size}.${fmt}`;
      img.onload = () => { st.loaded[v] = true; if (v === 'day') el.classList.remove('day-pending'); if (v === lead) { el.classList.remove('is-loading'); dropPoster(); emit('load', { scene: scene.id }); if (st.view.on && !strikeDone) { strikeDone = true; if (!hadPoster) strike(); } const later = () => wantPlate(v === 'day' ? 'night' : 'day'); 'requestIdleCallback' in window ? setTimeout(() => requestIdleCallback(later, { timeout: 4000 }), 2500) : setTimeout(later, 3500); } };
      img.onerror = () => { st.loaded[v] = true; el.classList.remove('is-loading'); if (v === 'day') el.classList.remove('day-pending'); };
      if (v === lead) img.src = url; else pendingPlates[v] = url; }
  }
  let pendingPlates = {};
  function wantPlate(v) { const url = pendingPlates[v]; if (!url) return; delete pendingPlates[v]; E[v].src = url; }
  let strikeDone = false;

  /* ---------- geometry ---------- */
  function sceneMeta() {
    const sc = st.scene; const o = st.orientation;
    if (sc.own) { const w = st.own.w, h = st.own.h; const bar = st.own.bar; const cm = st.own.cm;
      const barPx = bar && cm ? Math.hypot((bar.x2 - bar.x1) * w, (bar.y2 - bar.y1) * h) : 0;
      return { PW: w, PH: h, calibPpc: barPx && cm ? barPx / cm : 0, wallBox: sc.wallBox, anchor: sc.anchor, topY: 1, srcScale: 1, wallCrop: null, floorY: 1 }; }
    const [PW, PH] = (o === 'portrait' && sc.aspect.portrait) ? sc.aspect.portrait : sc.aspect.landscape;
    const p = o === 'portrait' && sc.portrait ? sc.portrait : null;
    const calibPx = p ? p.calibPx : sc.calib.px; const calibPxY = p ? p.calibPxY : sc.calib.pxY;
    const calibPpc = sc.calib.vertical && calibPxY ? (calibPxY[1] - calibPxY[0]) / sc.calib.cm : (calibPx[1] - calibPx[0]) / sc.calib.cm;
    const wallCrop = sc.wall && sc.wall[o] ? sc.wall[o] : null;
    const plateSize = Math.max(...plateSource(sc, 'day', o, false).widths);
    return { PW, PH, calibPpc, wallBox: (p && p.wallBox) || sc.wallBox, anchor: (p && p.anchor) || sc.anchor, topY: p ? (p.calibTopY ?? sc.calib.topY) : sc.calib.topY, wallCrop, plateSrcScale: plateSize / PW, wallSrcScale: wallCrop ? wallCrop.px[0] / (wallCrop.crop.w * PW) : 0, floorY: sc.floorY ?? .84 };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function pos() { const sc = st.scene, m = sceneMeta(); const p = st.design.pos && st.design.pos[sc.id]; return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : { x: m.anchor.x, y: m.anchor.y }; }

  function render() {
    if (!st.scene || !st.design) return;
    const R = el.getBoundingClientRect(), SW = R.width, SH = R.height; if (!SW || !SH) return;
    const res = st.res = resolveDesign(st.design); const d = res.dims || { W: 60, H: 20, emCm: 10 };
    const wantPortrait = SH / SW > 1.1 && !st.scene.own && st.scene.portrait; st.orientation = wantPortrait ? 'portrait' : 'landscape';
    const m = sceneMeta(); const { PW, PH } = m;
    const DPR = dpr(); const frame = st.scene.own && !st.own.set ? 'real' : st.frame;
    const range = (FRAMES[frame] || FRAMES.room)(SW); const target = (range[0] + range[1]) / 2;
    let k, cx, cy, cw, ch, useWall = false, short = false, fraction = 0, sourcePx = 0;
    const p = pos();
    const kMin = Math.max(SW / PW, SH / PH); /* never leave the plate */
    if (frame === 'real' || !m.calibPpc) {
      k = Math.min(SW / PW, SH / PH); cw = PW; ch = PH; cx = 0; cy = 0; /* whole plate, contained */
      if (m.calibPpc) fraction = d.W * m.calibPpc * k / SW; sourcePx = Math.round(PW * (m.plateSrcScale || 1));
    } else {
      const desired = target * SW / (d.W * m.calibPpc);
      /* sharpness cap: prefer the wall crop as the source */
      const wallCap = m.wallSrcScale ? m.wallSrcScale / DPR : 0, plateCap = (m.plateSrcScale || 1) / DPR;
      k = clamp(desired, kMin, Math.max(kMin, Math.max(wallCap, plateCap)));
      cw = SW / k; ch = SH / k;
      const signW = d.W * m.calibPpc, signH = d.H * m.calibPpc;
      cx = clamp(p.x * PW - cw / 2, 0, PW - cw);
      const topYpx = m.topY * PH; let lo = Math.max(0, topYpx - .88 * ch), hi = Math.min(PH - ch, topYpx - .7 * ch);
      let want = p.y * PH - .42 * ch; want = Math.max(want, p.y * PH + signH / 2 + 8 - ch); want = Math.min(want, p.y * PH - signH / 2 - 8);
      cy = lo <= hi ? clamp(want, lo, hi) : clamp(want, 0, PH - ch);
      cy = clamp(cy, 0, Math.max(0, PH - ch));
      /* can the wall crop serve this crop? */
      const wc = m.wallCrop && m.wallCrop.crop;
      useWall = !!wc && cx >= wc.x * PW - 1 && cy >= wc.y * PH - 1 && cx + cw <= (wc.x + wc.w) * PW + 1 && cy + ch <= (wc.y + wc.h) * PH + 1;
      const srcScale = useWall ? m.wallSrcScale : (m.plateSrcScale || 1);
      /* if the chosen k exceeds this source's cap, pull back to it */
      const cap = Math.max(kMin, srcScale / DPR); if (k > cap) { k = cap; cw = SW / k; ch = SH / k; cx = clamp(p.x * PW - cw / 2, 0, PW - cw); cy = clamp(cy, 0, Math.max(0, PH - ch)); }
      fraction = signW * k / SW; sourcePx = Math.round(cw * srcScale);
      short = fraction < range[0] - .005 && k < desired;
      if (short && isReview()) { const line = `frame-short ${st.scene.id} ${frame} ${fraction.toFixed(2)}`; if (!frameShortLog.includes(line)) { frameShortLog.push(line); document.dispatchEvent(new CustomEvent('ln:frame-short', { detail: { scene: st.scene.id, frame, fraction } })); import('./facts.js').then(f => f.logFrameShort && f.logFrameShort(st.scene.id, frame, fraction)).catch(() => {}); } }
    }
    /* a sign bigger than the view (2 m+ quote sizes, a long 3-line sign) is shown scaled to fit instead of spilling off the
       stage; the rulers keep the true centimetres (sweep 2026-10-17) */
    let fitScale = 1; if (m.calibPpc) { const sw = d.W * m.calibPpc * k, sh = d.H * m.calibPpc * k; fitScale = Math.min(1, (.94 * SW) / sw, (.86 * SH) / sh); }
    E.sign.classList.toggle('is-scaled', fitScale < .999);
    st.k = k; st.crop = { x: cx, y: cy, w: cw, h: ch }; st.ppc = m.calibPpc * k * fitScale; st.fitScale = fitScale;
    st.frameInfo = { frame, scene: st.scene.id, fraction: Math.round(fraction * 1000) / 1000, target: range, sourcePx, devicePx: Math.round(SW * DPR), short, k, ppc: st.ppc, orientation: st.orientation, crop: st.crop, useWall };
    /* plate box */
    const PWk = PW * k, PHk = PH * k, ox = -cx * k, oy = -cy * k;
    const letterbox = frame === 'real' || !m.calibPpc; const lbx = letterbox ? (SW - PWk) / 2 : 0, lby = letterbox ? (SH - PHk) / 2 : 0;
    Object.assign(E.plate.style, { left: (ox + lbx) + 'px', top: (oy + lby) + 'px', width: PWk + 'px', height: PHk + 'px' });
    if (st.scene.own) { E.day.src !== st.own.url && (E.day.src = st.own.url); E.night.src !== st.own.url && (E.night.src = st.own.url); Object.assign(E.day.style, { left: 0, top: 0, width: PWk + 'px', height: PHk + 'px' }); Object.assign(E.night.style, { left: 0, top: 0, width: PWk + 'px', height: PHk + 'px' }); el.classList.remove('is-loading'); }
    else {
      const wc = useWall ? m.wallCrop.crop : null;
      loadPlates(st.scene, st.orientation, useWall, Math.min(SW < 768 ? 1600 : 3000, Math.round((useWall ? m.wallCrop.px[0] : PW) * Math.min(1, (SW * DPR) / (cw * (useWall ? m.wallSrcScale : (m.plateSrcScale || 1))))) || 1600));
      const L = wc ? wc.x * PWk : 0, T = wc ? wc.y * PHk : 0, Wd = wc ? wc.w * PWk : PWk, Hd = wc ? wc.h * PHk : PHk;
      for (const img of [E.day, E.night]) Object.assign(img.style, { left: L + 'px', top: T + 'px', width: Wd + 'px', height: Hd + 'px' });
    }
    /* sign */
    const ppc = st.ppc || (SW * .6 / d.W); const w = d.W * ppc, h = d.H * ppc;
    const sx = p.x * PWk - w / 2, sy = p.y * PHk - h / 2;
    Object.assign(E.sign.style, { left: sx + 'px', top: sy + 'px', width: w + 'px', height: h + 'px' });
    E.sign.classList.toggle('faded', !!(st.scene.own && !st.own.set));
    E.sign.setAttribute('aria-label', `Your sign, ${Math.round(d.W)} by ${Math.round(d.H)} centimetres${st.interactive ? '. Drag or use the arrow keys to move it' : ''}`);
    const c = res.colour, night = st.view.night, onNow = st.view.on;
    el.classList.toggle('is-night', night); el.classList.toggle('is-on', onNow); el.classList.toggle('is-rgb', res.rgb && onNow); el.classList.toggle('is-light', !night && st.scene.light !== 'warm' && !!st.scene.studio === false && (st.scene.light === 'cool' || st.scene.light === 'neutral'));
    const emPx = d.emCm * ppc, mres = res.m;
    /* one explicit layout (renderer.measure): the body is the ink box; text, symbol and (outline layer only) the bridge sit at measured spots */
    const bodyHtml = (res.icon ? iconSvg(res.icon, null, '', '') : '') + ((res.drawLines.length || !res.hasText) ? `<p>${tubeHtml(res)}</p>` : '');
    const B = mres.bridge, bridgeHtml = B ? `<i class="ln-bridge" style="left:${B.x1}em;top:${B.y1 - B.w / 2}em;width:${Math.hypot(B.x2 - B.x1, B.y2 - B.y1)}em;height:${B.w}em;transform:rotate(${Math.atan2(B.y2 - B.y1, B.x2 - B.x1)}rad)"></i>` : '';
    E.sign.classList.toggle('has-icon', !!res.icon && !!res.drawLines.length);
    for (const x of [E.tube, E.contour]) {
      const html = x === E.contour ? bridgeHtml + bodyHtml : bodyHtml;
      if (x.dataset.html !== html) { x.innerHTML = html; x.dataset.html = html; }
      x.style.fontFamily = `"${res.font.family}", cursive`; x.style.fontWeight = res.font.weight || 400; x.style.fontSize = emPx + 'px'; x.style.wordSpacing = (res.font.wordSpacingEm || 0) + 'em'; x.style.setProperty('--ic', (mres.iconEm || 0) + 'em');
      x.style.width = mres.inkW + 'em'; x.style.height = mres.inkH + 'em';
      const pEl = x.querySelector('p'); if (pEl) { pEl.style.textAlign = res.state.align; pEl.style.left = (mres.textOffX - mres.minX) + 'em'; pEl.style.top = (mres.textOffY - mres.top) + 'em'; }
      const sv = x.querySelector('svg'); if (sv) { sv.style.left = mres.iconX + 'em'; sv.style.top = mres.iconY + 'em'; }
      x.style.transform = 'translate(-50%,-50%)';
    }
    E.tube.classList.toggle('placeholder', res.placeholder); E.tube.classList.toggle('off', !onNow);
    E.tube.style.setProperty('--off', offTube(c, res.state.jacket));
    const glowK = night ? 1 : .5;
    const tp = E.tube.querySelector('p'); if (tp) { tp.style.color = coreOf(c); tp.style.textShadow = glowOf(c, glowK); tp.querySelectorAll('.ln-line').forEach((ln, i) => { const lc = res.lineColours[i]; if (lc && lc.id !== c.id) { ln.style.color = coreOf(lc); ln.style.textShadow = glowOf(lc, glowK); } else { ln.style.color = ''; ln.style.textShadow = ''; } }); }
    const ti = E.tube.querySelector('svg'); if (ti) { ti.style.stroke = coreOf(c); ti.style.filter = iconGlowOf(c); }
    E.contour.querySelectorAll('.ln-line').forEach(ln => { ln.style.color = '#fff'; ln.style.textShadow = 'none'; });
    /* backing */
    const bk = res.backing, fin = res.finish, R2 = bk.margin * ppc;
    if (bk.id === 'cut' || bk.id === 'letter') { E.contour.style.display = 'grid'; E.board.style.display = 'none'; E.standbase.style.display = 'none'; E.contour.style.padding = (R2 * 1.4) + 'px'; E.contour.style.filter = night ? `url(#${id}) brightness(.62)` : `url(#${id})`;
      const ms = E.filter.querySelectorAll('feMorphology'); ms[0].setAttribute('radius', (R2 * .9).toFixed(2)); E.filter.querySelector('feGaussianBlur').setAttribute('stdDeviation', Math.max(1, R2 * .32).toFixed(2)); ms[1].setAttribute('radius', Math.max(.8, R2 * .045).toFixed(2));
      const fl = E.filter.querySelector('.cfFill'), ed = E.filter.querySelector('.cfEdge'); fl.setAttribute('flood-color', fin.fill[0]); fl.setAttribute('flood-opacity', fin.fill[1]); ed.setAttribute('flood-color', fin.edge[0]); ed.setAttribute('flood-opacity', fin.edge[1]); }
    else { E.contour.style.display = 'none'; E.board.style.display = 'block';
      Object.assign(E.board.style, { background: fin.panel, border: `1px solid ${fin.border}`, borderRadius: Math.max(3, .8 * ppc) + 'px', boxShadow: `inset 0 0 0 1px rgba(242,233,223,.08), 0 ${1.2 * ppc}px ${2.4 * ppc}px rgba(0,0,0,.35)` });
      E.board.style.setProperty('--so', Math.max(4, 1.6 * ppc) + 'px'); E.board.style.setProperty('--soi', Math.max(3, 1.8 * ppc) + 'px');
      E.standbase.style.display = bk.id === 'stand' ? 'block' : 'none';
      Object.assign(E.standbase.style, { height: 5 * ppc + 'px', background: fin.id === 'clear' ? 'linear-gradient(rgba(255,255,255,.18),rgba(255,255,255,.06))' : fin.panel, border: `1px solid ${fin.border}` }); }
    /* bounce light: radius 1.6 × sign width, screen, clipped to the wall box; floor ellipse at floorY */
    const scx = p.x * PWk, scy = p.y * PHk; const bw = w * 1.6 * 2, bh = Math.max(h * 2.6, w * 1.1);
    const wb = m.wallBox; const lit = onNow && !res.placeholder;
    Object.assign(E.bounce.style, { left: (scx - bw / 2) + 'px', top: (scy - bh / 2) + 'px', width: bw + 'px', height: bh + 'px', background: `radial-gradient(closest-side, ${rgba(c.hex, .5)}, ${rgba(c.hex, .18)} 45%, transparent 100%)`, opacity: lit ? (night ? .55 : .15) : 0,
      clipPath: wb ? `inset(${Math.max(0, wb.y * PHk - (scy - bh / 2))}px ${Math.max(0, (scx + bw / 2) - (wb.x + wb.w) * PWk)}px ${Math.max(0, (scy + bh / 2) - (wb.y + wb.h) * PHk)}px ${Math.max(0, wb.x * PWk - (scx - bw / 2))}px)` : 'none' });
    const fy = m.floorY * PHk; const fw = w * 2.2, fh = Math.max(w * .5, 12);
    Object.assign(E.floor.style, { left: (scx - fw / 2) + 'px', top: (fy - fh / 2) + 'px', width: fw + 'px', height: fh + 'px', background: `radial-gradient(closest-side, ${rgba(c.hex, .35)}, transparent 100%)`, opacity: lit && night && m.floorY < 1 ? .25 : 0 });
    /* rulers */
    const showR = st.view.rulers !== 'off' && !res.placeholder && !(st.scene.own && !st.own.set);
    E.rulH.style.display = E.rulV.style.display = showR ? 'block' : 'none';
    if (showR) { const unit = st.view.rulers === 'in' ? 'in' : (st.view.unit || 'cm'); const extra = bk.id === 'stand' ? 5 * ppc : 0;
      Object.assign(E.rulH.style, { left: sx + 'px', top: (sy + h + extra + 12) + 'px', width: w + 'px' });
      /* height ruler: right of the sign when it fits, else the side with more room; the label never leaves the stage */
      const rightRoom = SW - ((sx + ox + lbx) + w + 12 + 72), leftRoom = (sx + ox + lbx) - 21 - 15 - 60;
      const flip = rightRoom < 0 && leftRoom > rightRoom; E.rulV.classList.toggle('flip', flip);
      Object.assign(E.rulV.style, { left: (flip ? sx - 21 : sx + w + 12) + 'px', top: sy + 'px', height: h + 'px' });
      E.rulH.firstElementChild.textContent = fmtLen(d.W, unit); E.rulV.firstElementChild.textContent = fmtLen(d.H, unit);
      const sp = E.rulV.firstElementChild; sp.style.left = ''; sp.style.right = ''; sp.style.top = ''; sp.style.transform = '';
      const lw = sp.offsetWidth || 40, rulX = (flip ? sx - 21 : sx + w + 12) + ox + lbx;
      /* the label keeps a 16 px gutter from the stage edge (round-2 review: "18 cm" sat 4 px from the phone's edge). When
         it can't sit beside the ruler, it drops under the ruler's foot, on the same row as the width label (below the
         width ruler's line; the width label is centred under the sign, so they don't meet), clamped inside the gutter */
      const G = SW < 600 ? 16 : 8;
      if ((flip && rulX - 15 - lw < G) || (!flip && rulX + 9 + 15 + lw > SW - G)) {
        const cx = Math.min(SW - G - lw / 2, Math.max(G + lw / 2, rulX + 4.5));
        Object.assign(sp.style, { top: `calc(100% + ${12 + 13 + extra}px)`, transform: 'translateX(-50%)', left: (cx - rulX) + 'px', right: 'auto' });
      } }
    if (lit && opts.relight !== false) relight(uiHex(c));
    E.sign.tabIndex = st.interactive ? 0 : -1; E.sign.style.pointerEvents = st.interactive ? 'auto' : 'none';
    emit('frame', st.frameInfo);
  }

  /* ---------- drag + keyboard (clamped to the wall box and the crop) ---------- */
  let drag = null; let hintShown = false;
  function clampPos(x, y) {
    const m = sceneMeta(); const d = (st.res && st.res.dims) || { W: 60, H: 20 }; const { PW, PH } = m; const ppcPlate = m.calibPpc ? m.calibPpc * (st.fitScale || 1) : (st.ppc / st.k);   /* the sign as drawn (scaled-to-fit included) */
    const hw = d.W * ppcPlate / 2 / PW, hh = d.H * ppcPlate / 2 / PH; const wb = m.wallBox || { x: 0, y: 0, w: 1, h: 1 };
    let minX = wb.x + hw, maxX = wb.x + wb.w - hw, minY = wb.y + hh, maxY = wb.y + wb.h - hh;
    if (st.crop && st.frame !== 'real') { const c = st.crop; minX = Math.max(minX, c.x / PW + hw * .5); maxX = Math.min(maxX, (c.x + c.w) / PW - hw * .5); minY = Math.max(minY, c.y / PH + hh * .5); maxY = Math.min(maxY, (c.y + c.h) / PH - hh * .5); }
    if (minX > maxX) { minX = maxX = (minX + maxX) / 2; } if (minY > maxY) { minY = maxY = (minY + maxY) / 2; }
    return { x: clamp(x, minX, maxX), y: clamp(y, minY, maxY) };
  }
  function setPos(x, y, { silent } = {}) { const sc = st.scene; const np = clampPos(x, y); st.design.pos = Object.assign({}, st.design.pos, { [sc.id]: { x: Math.round(np.x * 1000) / 1000, y: Math.round(np.y * 1000) / 1000 } }); render(); if (!silent) emit('change', { pos: st.design.pos, scene: sc.id }); }
  function showHint() { if (hintShown || !st.interactive) return; let seen = false; try { seen = localStorage.getItem('stage.hint') === '1'; } catch {} if (seen) return; hintShown = true; E.hint.hidden = false; }
  function hideHint() { E.hint.hidden = true; try { localStorage.setItem('stage.hint', '1'); } catch {} }
  let iconDrag = null;
  const textCentre = () => { const r = E.tube.getBoundingClientRect(), mm = st.res && st.res.m; if (!mm) return null; const k = r.width / mm.inkW; return { x: r.left + (mm.textOffX + mm.textW / 2) * k, y: r.top + (mm.textOffY + mm.textH / 2) * k, k }; };
  E.sign.addEventListener('pointerdown', e => {
    if (!st.interactive || e.button || !E.sign.classList.contains('has-icon')) return;
    const sv = E.tube.querySelector('svg'); if (!sv) return; const r = sv.getBoundingClientRect(), pad = 10;
    if (e.clientX < r.left - pad || e.clientX > r.right + pad || e.clientY < r.top - pad || e.clientY > r.bottom + pad) return;
    const tc = textCentre(); if (!tc) return; iconDrag = { id: e.pointerId, tc }; E.sign.setPointerCapture(e.pointerId); el.classList.add('is-dragging'); E.sign.classList.remove('icon-hint'); hideHint(); e.preventDefault(); e.stopImmediatePropagation();
  });
  E.sign.addEventListener('pointermove', e => {
    if (!iconDrag || e.pointerId !== iconDrag.id) return; e.stopImmediatePropagation();
    const mm = st.res.m, k = iconDrag.tc.k, gapS = (ICON_SIZE / 2 + ICON_GAP) * mm.cap;
    const at = iconAtOf({ x: (e.clientX - iconDrag.tc.x) / k / (mm.textW / 2 + gapS), y: (e.clientY - iconDrag.tc.y) / k / (mm.textH / 2 + gapS) });
    if (st.design.iconAt && st.design.iconAt.x === at.x && st.design.iconAt.y === at.y) return;
    st.design = Object.assign({}, st.design, { iconAt: at }); render();
    /* keep the words where they were: shift the sign by however far the text centre moved */
    const tc2 = textCentre(); if (tc2) { const m2 = sceneMeta(), p = pos(); const dx = tc2.x - iconDrag.tc.x, dy = tc2.y - iconDrag.tc.y; if (Math.abs(dx) + Math.abs(dy) > .5) setPos(p.x - dx / (m2.PW * st.k), p.y - dy / (m2.PH * st.k), { silent: true }); }
    emit('icon', { iconAt: at, live: true });
  });
  const endIcon = e => { if (!iconDrag || (e && e.pointerId !== iconDrag.id)) return; iconDrag = null; el.classList.remove('is-dragging'); emit('icon', { iconAt: st.design.iconAt }); emit('change', { pos: st.design.pos, scene: st.scene.id }); };
  E.sign.addEventListener('pointerup', endIcon); E.sign.addEventListener('pointercancel', endIcon);
  E.sign.addEventListener('pointerdown', e => { if (!st.interactive || e.button || iconDrag) return; const m = sceneMeta(); const p = pos(); drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, px: p.x, py: p.y, PWk: m.PW * st.k, PHk: m.PH * st.k }; E.sign.setPointerCapture(e.pointerId); el.classList.add('is-dragging'); hideHint(); e.preventDefault(); });
  E.sign.addEventListener('pointermove', e => { if (!drag || e.pointerId !== drag.id) return; setPos(drag.px + (e.clientX - drag.x0) / drag.PWk, drag.py + (e.clientY - drag.y0) / drag.PHk, { silent: true }); });
  const endDrag = e => { if (!drag || (e && e.pointerId !== drag.id)) return; drag = null; el.classList.remove('is-dragging'); emit('change', { pos: st.design.pos, scene: st.scene.id }); };
  E.sign.addEventListener('pointerup', endDrag); E.sign.addEventListener('pointercancel', endDrag);
  E.sign.addEventListener('keydown', e => { if (!st.interactive) return; const step = (e.shiftKey ? 10 : 1); const m = sceneMeta(); const ppcPlate = m.calibPpc || 1; const dx = step * ppcPlate / m.PW, dy = step * ppcPlate / m.PH; const p = pos();
    const map = { ArrowLeft: [-dx, 0], ArrowRight: [dx, 0], ArrowUp: [0, -dy], ArrowDown: [0, dy] }; if (!map[e.key]) return; e.preventDefault(); setPos(p.x + map[e.key][0], p.y + map[e.key][1]); hideHint(); });
  E.sign.addEventListener('pointerenter', showHint, { once: true }); E.sign.addEventListener('focus', showHint, { once: true });

  /* ---------- own wall (§5.9) ---------- */
  const ownWall = {
    presets: () => (getScene('wall') || {}).presets || [{ id: 'door', name: 'Door', cm: 80 }, { id: 'sofa', name: 'Sofa', cm: 210 }, { id: 'bed', name: 'Double bed', cm: 150 }, { id: 'a4', name: 'A4 sheet', cm: 30 }, { id: 'custom', name: 'Custom', cm: null }],
    /** load a File/Blob (EXIF orientation honoured). The photo never leaves the device. */
    async load(file) {
      let bmp = null; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { bmp = null; }
      const cv = document.createElement('canvas'); let w, h;
      if (bmp) { w = bmp.width; h = bmp.height; const max = 2400; const k = Math.min(1, max / Math.max(w, h)); cv.width = Math.round(w * k); cv.height = Math.round(h * k); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); bmp.close && bmp.close(); }
      else { const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); const max = 2400; const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(img.src); }
      ownWall._set(cv); emit('wall', { state: 'loaded' }); return true;
    },
    _set(cv) {
      if (st.own && st.own.url) URL.revokeObjectURL(st.own.url);
      const url = cv.toDataURL('image/jpeg', .9);
      st.own = { url, canvas: cv, w: cv.width, h: cv.height, bar: { x1: .3, y1: .5, x2: .7, y2: .5 }, cm: null, set: false, bright: false, dark: false };
      try { const d = cv.getContext('2d').getImageData(0, 0, Math.min(64, cv.width), Math.min(64, cv.height)).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3; st.own.dark = s / (d.length / 4) < 70; } catch {}
      st.scene = Object.assign({}, getScene('wall') || { id: 'wall', name: 'Your wall', own: true, wallBox: { x: .02, y: .02, w: .96, h: .96 }, anchor: { x: .5, y: .4 }, light: 'neutral', floorY: 1 }, { own: true });
      st.sceneId = 'wall'; el.dataset.scene = 'wall'; strikeDone = false; mountBar(); render();
    },
    rotate() { if (!st.own) return; const src = st.own.canvas; const cv = document.createElement('canvas'); cv.width = src.height; cv.height = src.width; const ctx = cv.getContext('2d'); ctx.translate(cv.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(src, 0, 0); ownWall._set(cv); emit('wall', { state: 'rotated' }); },
    retake() { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.setAttribute('capture', 'environment'); inp.onchange = () => { if (inp.files[0]) ownWall.load(inp.files[0]); }; inp.click(); },
    brighten(on) { st.own && (st.own.bright = on == null ? !st.own.bright : !!on); el.classList.toggle('is-brighter', !!(st.own && st.own.bright)); },
    /** set the real width of what the bar spans (cm). ppc follows. */
    setCm(cm) { if (!st.own) return; st.own.cm = cm > 0 ? +cm : null; st.own.set = !!st.own.cm; render(); mountBar(); emit('wall', { state: st.own.set ? 'scaled' : 'unscaled', ppc: st.ppc }); },
    setPreset(idOrCm) { const p = ownWall.presets().find(x => x.id === idOrCm); ownWall.setCm(p ? p.cm : +idOrCm); },
    get state() { return st.own ? { ...st.own, ppc: st.ppc } : null; },
    get ppc() { return st.ppc; },
    isDark: () => !!(st.own && st.own.dark),
    /** IndexedDB (session-scoped key) — never uploaded */
    async save() { if (!st.own) return false; const blob = await new Promise(r => st.own.canvas.toBlob(r, 'image/jpeg', .9)); return idb('put', { id: 'session', blob, cm: st.own.cm, bar: st.own.bar, at: Date.now() }).then(() => true).catch(() => false); },
    async restore() { const rec = await idb('get', 'session').catch(() => null); if (!rec || !rec.blob) return false; await ownWall.load(rec.blob); if (rec.bar) st.own.bar = rec.bar; if (rec.cm) ownWall.setCm(rec.cm); return true; },
    async forget() { return idb('delete', 'session').then(() => true).catch(() => false); },
    exit(sceneId) { if (st.own && st.own.url && st.own.url.startsWith('blob:')) URL.revokeObjectURL(st.own.url); st.own = null; unmountBar(); el.classList.remove('is-brighter'); setScene(sceneId || defaultSceneFor(null)); }
  };
  function idb(op, arg) {
    return new Promise((res, rej) => { if (!('indexedDB' in window)) return rej(new Error('no idb')); const r = indexedDB.open('litneon', 1); r.onupgradeneeded = () => r.result.createObjectStore('walls', { keyPath: 'id' }); r.onerror = () => rej(r.error);
      r.onsuccess = () => { const db = r.result; const tx = db.transaction('walls', op === 'get' ? 'readonly' : 'readwrite'); const s = tx.objectStore('walls'); const q = op === 'put' ? s.put(arg) : op === 'get' ? s.get(arg) : s.delete(arg); q.onsuccess = () => { res(q.result); db.close(); }; q.onerror = () => rej(q.error); }; });
  }
  let bar = null, barDrag = null;
  function mountBar() {
    if (!st.own) return unmountBar();
    if (!bar) {
      bar = document.createElement('div'); bar.className = 'ln-bar'; bar.dataset.qa = `${opts.qa || 'stage'}.ownwall.scalebar`;
      bar.innerHTML = `<div class="ln-bar__line"></div><button type="button" class="ln-bar__end" data-end="1" aria-label="Left end of the scale bar"></button><button type="button" class="ln-bar__end" data-end="2" aria-label="Right end of the scale bar"></button>
        <label class="ln-bar__label"><span>How wide is this?</span><select aria-label="What the bar spans" data-qa="${opts.qa || 'stage'}.ownwall.preset">${ownWall.presets().map(p => `<option value="${p.id}" ${p.id === 'door' ? 'selected' : ''}>${esc(p.name)}${p.cm ? ` · ${p.cm} cm` : ''}</option>`).join('')}</select><input type="number" inputmode="decimal" min="5" max="1000" step="1" aria-label="Width in centimetres" placeholder="cm" hidden data-qa="${opts.qa || 'stage'}.ownwall.cm"></label>`;
      E.ui.appendChild(bar);
      const sel = bar.querySelector('select'), inp = bar.querySelector('input');
      sel.addEventListener('change', () => { if (sel.value === 'custom') { inp.hidden = false; inp.focus(); ownWall.setCm(+inp.value || 0); } else { inp.hidden = true; ownWall.setPreset(sel.value); } });
      inp.addEventListener('input', () => ownWall.setCm(+inp.value || 0));
      bar.addEventListener('pointerdown', e => { const end = e.target.closest('[data-end]'); if (!end) return; barDrag = { end: +end.dataset.end, id: e.pointerId }; end.setPointerCapture(e.pointerId); e.preventDefault(); });
      bar.addEventListener('pointermove', e => { if (!barDrag || e.pointerId !== barDrag.id) return; const R = E.plate.getBoundingClientRect(); const x = clamp((e.clientX - R.left) / R.width, 0, 1), y = clamp((e.clientY - R.top) / R.height, 0, 1); if (barDrag.end === 1) { st.own.bar.x1 = x; st.own.bar.y1 = y; } else { st.own.bar.x2 = x; st.own.bar.y2 = y; } layoutBar(); if (st.own.set) render(); });
      const up = () => { if (barDrag) { barDrag = null; emit('wall', { state: st.own.set ? 'scaled' : 'unscaled', ppc: st.ppc }); } }; bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
      bar.addEventListener('keydown', e => { const end = e.target.closest('[data-end]'); if (!end) return; const d = { ArrowLeft: -.01, ArrowRight: .01 }[e.key]; if (d == null) return; e.preventDefault(); if (+end.dataset.end === 1) st.own.bar.x1 = clamp(st.own.bar.x1 + d, 0, 1); else st.own.bar.x2 = clamp(st.own.bar.x2 + d, 0, 1); layoutBar(); render(); });
      if (!st.own.cm) ownWall.setPreset('door');
    }
    let msg = E.ui.querySelector('.ln-msg'); if (!st.own.set) { if (!msg) { msg = document.createElement('div'); msg.className = 'ln-msg'; msg.dataset.qa = `${opts.qa || 'stage'}.ownwall.msg`; E.ui.appendChild(msg); } msg.textContent = 'Set the scale: drag the ends of the bar across something you know the width of. Your photo stays on this device.'; } else if (msg) msg.remove();
    layoutBar();
  }
  function layoutBar() { if (!bar || !st.own) return; const R = E.plate.getBoundingClientRect(), S = el.getBoundingClientRect(); const b = st.own.bar; const x1 = R.left - S.left + b.x1 * R.width, x2 = R.left - S.left + b.x2 * R.width, y = R.top - S.top + ((b.y1 + b.y2) / 2) * R.height;
    const L = Math.min(x1, x2), W = Math.abs(x2 - x1); Object.assign(bar.style, { left: L + 'px', top: y + 'px', width: Math.max(44, W) + 'px' }); bar.querySelector('[data-end="1"]').style.left = (x1 - L) + 'px'; bar.querySelector('[data-end="2"]').style.left = (x2 - L) + 'px'; }
  function unmountBar() { if (bar) { bar.remove(); bar = null; } const msg = E.ui.querySelector('.ln-msg'); msg && msg.remove(); }

  /* ---------- public API ---------- */
  function setDesign(design) { st.design = Object.assign({}, st.design || {}, design); if (st.design.night != null) st.view.night = st.design.night !== false; if (st.design.on != null) st.view.on = st.design.on !== false; if (st.design.unit) st.view.unit = st.design.unit; wantPlate(st.view.night ? 'night' : 'day'); render(); }
  function setView(v) { const wasOn = st.view.on; Object.assign(st.view, v); wantPlate(st.view.night ? 'night' : 'day'); render(); if (!wasOn && st.view.on) strike(); }
  function setFrame(f) { st.frame = f; el.dataset.frame = f; render(); }
  function setScene(sceneId) {
    if (sceneId === 'wall') { if (st.own) { st.scene = Object.assign({}, getScene('wall') || {}, { own: true }); st.sceneId = 'wall'; mountBar(); render(); } else ownWall.retake(); return; }
    const sc = getScene(sceneId) || getScene('s01-living') || scenes()[0]; if (!sc) return;
    if (st.own) { unmountBar(); st.own = null; el.classList.remove('is-brighter'); }
    st.scene = sc; st.sceneId = sc.id; el.dataset.scene = sc.id; strikeDone = false; plateSrcKey = ''; render();
  }
  function strike() { if (reducedMotion() || !st.view.on) return; [E.tube, E.bounce].forEach(x => { x.classList.remove('strike'); void x.offsetWidth; x.classList.add('strike'); }); setTimeout(() => [E.tube, E.bounce].forEach(x => x.classList.remove('strike')), 950); }
  /** toPNG({ transparent: true, bakeGlow: true, includeWall: false, ppc }) → { blob, dataUrl, width, height } */
  async function toPNG(o = {}) {
    const baked = bakeGlow(st.design, { ppc: o.ppc || Math.max(6, Math.min(16, st.ppc * 2 || 12)), bakeGlow: o.bakeGlow !== false, on: st.view.on, night: st.view.night, transparent: o.includeWall ? false : (o.transparent !== false), background: 'transparent' });
    if (!baked) return null;
    let canvas = baked.canvas;
    if (o.includeWall && st.crop) {
      const out = document.createElement('canvas'); const S = el.getBoundingClientRect(); const scale = Math.min(2, 1600 / S.width); out.width = Math.round(S.width * scale); out.height = Math.round(S.height * scale); const ctx = out.getContext('2d');
      const img = st.view.night ? E.night : E.day; const ir = img.getBoundingClientRect();
      try { ctx.drawImage(img, (ir.left - S.left) * scale, (ir.top - S.top) * scale, ir.width * scale, ir.height * scale); } catch {}
      const sr = E.sign.getBoundingClientRect(); const pad = (baked.W - baked.dims.W * baked.ppc) / 2; const k = (sr.width * scale) / (baked.dims.W * baked.ppc);
      ctx.drawImage(baked.canvas, (sr.left - S.left) * scale - pad * k, (sr.top - S.top) * scale - pad * k, baked.W * k, baked.H * k);
      canvas = out;
    }
    const dataUrl = canvas.toDataURL('image/png'); const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    return { blob, dataUrl, width: canvas.width, height: canvas.height, ppc: baked.ppc, dims: baked.dims };
  }
  const frameInfo = () => st.frameInfo;
  const signBBox = () => E.sign.getBoundingClientRect();
  const ro = new ResizeObserver(() => { el.classList.add('no-anim'); render(); requestAnimationFrame(() => el.classList.remove('no-anim')); }); ro.observe(el);
  const offFonts = onFonts(() => render());
  function destroy() { ro.disconnect(); offFonts(); unmountBar(); if (st.own && st.own.url && st.own.url.startsWith('blob:')) URL.revokeObjectURL(st.own.url); el.innerHTML = ''; el.classList.remove('ln-stage'); }

  st.design = Object.assign({ text: '', font: 'soho', colour: 'warm' }, opts.design || {});
  if (st.design.night != null) st.view.night = st.design.night !== false; if (st.design.on != null) st.view.on = st.design.on !== false;
  el.classList.add('is-loading');
  const ready = loadScenes().then(() => { setScene(st.sceneId || st.design.scene || defaultSceneFor(opts.collection)); return api; }).catch(e => { console.error('stage: scenes.json failed', e); el.classList.remove('is-loading'); return api; });
  const api = { el, setDesign, setView, setScene, setFrame, render, strike, toPNG, frameInfo, signBBox, ownWall, on, destroy, ready, get state() { return st; }, get view() { return st.view; }, get scene() { return st.scene; }, get res() { return st.res; }, pos, setPos, hideHint };
  return api;
}

/** Mount every `[data-stage]` element under root. The attribute holds JSON mount options, e.g.
    <div data-stage='{"frame":"guide","scene":"s00-studio-dark","design":{"text":"Open late","backing":"rect"},"interactive":false}'></div>
    `cycle` (array of partial designs) rotates the design every `every` ms with a pause control (≥ 5 s animations need one, §7.5). */
export function autoMount(root = document) {
  const out = [];
  root.querySelectorAll('[data-stage]').forEach(el => {
    if (el.dataset.stageMounted) return; let o = {}; try { o = JSON.parse(el.dataset.stage || '{}'); } catch { o = {}; }
    const api = mount(el, o); el.dataset.stageMounted = '1'; out.push(api);
    if (Array.isArray(o.cycle) && o.cycle.length > 1) {
      let i = 0, timer = 0; const every = Math.max(1200, +o.every || 2400);
      const step = () => { i = (i + 1) % o.cycle.length; api.setDesign(Object.assign({}, o.design || {}, o.cycle[i])); };
      const play = () => { if (reducedMotion()) return; timer = setInterval(step, every); };
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'ln-iconbtn ln-stage__pause'; btn.setAttribute('aria-pressed', 'false'); btn.setAttribute('aria-label', 'Pause'); btn.textContent = '❚❚'; btn.style.cssText = 'position:absolute;right:8px;bottom:8px;z-index:6;pointer-events:auto;background:rgba(24,14,31,.62);color:var(--bone,#F2E9DF)'; btn.dataset.qa = (o.qa || 'stage') + '.pause';
      btn.addEventListener('click', () => { const paused = btn.getAttribute('aria-pressed') === 'true'; btn.setAttribute('aria-pressed', String(!paused)); btn.setAttribute('aria-label', paused ? 'Pause' : 'Play'); btn.textContent = paused ? '❚❚' : '▶'; if (paused) play(); else { clearInterval(timer); timer = 0; } });
      el.querySelector('.ln-stage__ui').appendChild(btn); play();
    }
  });
  return out;
}

export default { mount, autoMount, loadScenes, scenes, getScene, scenesFor, defaultSceneFor, frameShorts, FRAMES, addPoster };
export { FRAMES };

/* perf audit: every page that draws a stage imports this module first; start scenes.json + the format probe right away
   (browser only), so the hero stage never waits for them after the page's copy and data have loaded */
try { if (typeof window !== 'undefined' && window.document && /^https?:$/.test(location.protocol)) loadScenes().catch(() => {}); } catch {}

/** A poster for a stage that is not mounted yet (perf audit, LCP): the scene's night wall plate at 1000/1600 px, under the
    real plates until they load. Pages whose scene is only known after data loads (product, collection) call this as soon
    as they know it; static pages ship the same <picture> in their HTML. */
export function addPoster(el, sceneId, { portraitMedia = '', sizes = '100vw' } = {}) {
  try {
    const sc = getScene(sceneId); if (!el || !sc || sc.own || el.classList.contains('ln-stage') || el.querySelector('.ln-stage__poster')) return;
    const set = (o, ext) => { const s = plateSourceOf(sc, 'night', o, true); return [1000, 1600].filter(w => s.widths.includes(w)).map(w => `${s.stem}-${w}.${ext} ${w}w`).join(', '); };
    const src = (o, m) => ['avif', 'webp'].map(ext => `<source${m ? ` media="${m}"` : ''} type="image/${ext}" srcset="${set(o, ext)}" sizes="${sizes}">`).join('');
    const land = plateSourceOf(sc, 'night', 'landscape', true);
    el.insertAdjacentHTML('afterbegin', `<picture class="ln-stage__poster" data-scene="${sc.id}" aria-hidden="true">${portraitMedia && sc.portrait ? src('portrait', portraitMedia) + `<source media="${portraitMedia}" srcset="${set('portrait', 'jpg')}" sizes="${sizes}">` : ''}${src('landscape')}<img src="${land.stem}-1000.jpg" srcset="${set('landscape', 'jpg')}" sizes="${sizes}" alt="" fetchpriority="high" decoding="async"></picture>`);
  } catch {}
}
