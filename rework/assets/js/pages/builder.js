/* Lit Neon v2 — builder page (brief §4.2, owner P2). The flagship: app shell, 7-step rail, sticky stage on the
   photoreal plates, live price dock with breakdown, two-colour per line (owner D5: +rules.multicolourDelta per extra
   colour), proof drawing view, AR, share, gift, own wall, quote routes (outdoor / over 2 m / over max), postcode and
   need-by checks, add to basket, edit from basket, and the education block below the shell.
   Everything time-, price- or fact-dependent comes from pricing.js / rules / facts / clock.now(): nothing here is a
   typed price or date. Every control carries data-qa="builder.<area>.<control>" (qa/matrix/builder.json). */
import * as R from 'core/renderer.js';
import stage, { FRAMES } from 'core/stage.js';
import pricing from 'core/pricing.js';
import * as sheetMod from 'core/sheet.js';
import basket, { drawer } from 'core/basket.js';
import router from 'core/router.js';
import * as share from 'core/share.js';
import * as ar from 'core/ar.js';
import * as forms from 'core/forms.js';
import * as drawing from 'core/drawing-export.js';
import * as ui from 'core/ui.js';
import * as copy from 'core/copy.js';
import * as facts from 'core/facts.js';
import * as clock from 'core/clock.js';
import { gbp, fmtDelta, fmtDims, fmtLen, sayDims, fmtDay, esc, cmToIn, fmtRange } from 'core/money.js';
import { mount as mountChrome } from 'core/chrome.js';
import { track } from 'core/analytics.js';
import 'rules';

const RULES = globalThis.LIT_RULES;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const t = (k, v, f) => copy.t(k, v, f);
const icon = ui.icon;
const STEPS = ['words', 'lettering', 'colour', 'size', 'backing', 'fitting', 'symbol', 'review'];   /* owner 2026-10-16: text first, lettering second, the symbol picker last */
const STEP_ICONS = { words: 'pencil', lettering: 'drawing', colour: 'image', size: 'ruler', backing: 'box', fitting: 'standoff', review: 'check' };
const SYMBOL_FOR_GLYPH = { '💍': 'ring', '❤': 'heart', '♥': 'heart', '❤️': 'heart', '💕': 'twohearts', '💞': 'twohearts', '💖': 'heart', '🥂': 'champagne', '🍾': 'champagne', '🌙': 'moon', '☾': 'moon', '⚡': 'bolt', '🍸': 'cocktail', '🍹': 'cocktail', '⭐': 'star', '★': 'star', '☆': 'star', '✨': 'star' };
const RULER_CYCLE = ['cm', 'in', 'off'];
const isMobile = () => matchMedia('(max-width: 1023px)').matches;
const isPhone = () => matchMedia('(max-width: 767px)').matches;

/* a close-up frame for the stage: the same scene and scale, zoomed until the sign fills most of the stage
   (capped by the stage's own sharpness rule). Registered here, requested as an official frame in INTEGRATION.md. */
FRAMES.closeup = SW => SW < 768 ? [.82, .92] : [.78, .9];
/* keyboard mode on phones: the stage is ~150 px tall, so after 'guide' a wider view of the room before the whole plate */
FRAMES.typing = () => [.2, .26];

/* ====================================================================== state ====================================================================== */
let design = R.normalise(R.DEFAULT_DESIGN);
let editUid = null, roomScene = 's05-pub', rulers = 'cm', current = 'words', started = false;
let stageApi = null, rail = null, sheets = {}, lb = null, areaLoaded = false, DESIGNS = null, arApi = null;
const tiles = new Map(), minis = {}, examples = [];
let paintTimer = 0, hashTimer = 0;
let learnDone = false;

/* ====================================================================== boot ====================================================================== */
(async function boot() {
  stage.loadScenes();   /* perf audit: scenes.json + the AVIF probe start with the copy, so the stage mounts without a wait */
  await Promise.all([copy.load(['chrome', 'builder']), facts.load(), ui.ensureSprite()]);
  mountChrome({ page: 'builder' }).catch(() => {});
  absoluteMeta();
  fillStatic();

  /* resume precedence (§4.2) */
  const res = router.design.resume(location.hash);
  const q = new URLSearchParams(location.search);
  if (res.mode === 'url') { design = R.normalise(res.state); editUid = res.editUid || null; }
  else if (res.mode === 'direct') { design = R.normalise(res.state); }
  else if (res.mode === 'welcome') { design = R.normalise(R.DEFAULT_DESIGN); showWelcome(res.state); }
  else { /* cold load: the hero's default words, lit, so the first screen is a priced sign (decision in INTEGRATION.md) */ design = R.normalise({ ...R.DEFAULT_DESIGN, text: 'After dark', font: 'soho', colour: 'pink' }); if (q.get('text')) design.text = String(q.get('text')).slice(0, 80); }
  /* a truncated/hand-edited share link (router.parseHash malformed:true) that yielded no design: say so, after the page has booted (WS0-B request) */
  /* malformed = a broken %-escape (router flag) OR a d= code that decodes to nothing (a cut-off base64 such as #d=zz) */
  const badLink = res.mode !== 'url' && res.hash && (res.hash.malformed || (res.hash.code && !res.hash.d));
  if (badLink) setTimeout(() => ui.toast(res.mode !== 'direct' ? t('ui.hashMalformedFresh', {}, 'That link looks incomplete, so we started a fresh design for you.') : t('ui.hashMalformed', {}, 'That link looks incomplete, so we started from your last design.'), { kind: 'info', duration: 6000 }), 900);
  if (res.hash && res.hash.scene && stage.getScene) design.scene = res.hash.scene || design.scene;
  if (!design.scene || design.scene === 'wall' || !['s0', 's1'].includes(String(design.scene).slice(0, 2))) design.scene = 's00-studio-dark';   /* owner pick 2026-10-17: the dark plaster studio */
  design.text = R.resolve(design).clean.text;
  roomScene = design.scene && design.scene !== 's00-studio-dark' ? design.scene : 's05-pub';
  rulers = design.unit === 'in' ? 'in' : 'cm';
  if (editUid) showEditing();

  /* stage */
  stageApi = stage.mount($('#b-stage'), { frame: design.view === 'drawing' ? 'room' : 'real', scene: design.scene, design, qa: 'builder.stage', priority: 'high', view: { rulers } });   /* owner 2026-10-17: real size is the default frame */
  stageApi.on('change', e => { design.pos = e.pos; autosave(); });
  stageApi.on('wall', onWall);
  window.__builder = { get stage() { return stageApi; }, get design() { return design; } };   /* QA hook (like window.__p4) */
  stage.loadScenes().then(list => { pricing.setScenes(list); paintSceneButton(); paintAll(); });

  renderToolbar(); renderTabs(); renderRail();
  renderWords(); renderLettering(); renderColour(); renderSize(); renderBacking(); renderFitting(); renderSymbol(); renderReview();
  wireDock(); wireShell(); wireSpy();
  applyView(design.view, true);
  update({ silent: true });

  R.ensureFonts().then(() => update({ silent: true }));
  R.onFonts(() => update({ silent: true }));
  router.onHashIntent(onHash);
  if (res.hash && res.hash.step && STEPS.includes(res.hash.step)) setTimeout(() => jumpTo(res.hash.step, { focus: false }), 200);
  renderLearn();
  if (location.hash === '#learn') setTimeout(() => $('#learn').scrollIntoView(), 100);
})();

function absoluteMeta() {
  const abs = p => new URL(p, location.origin).href;
  const can = $('link[rel="canonical"]'); if (can) can.href = abs('/lit-neon-preview/rework/create.html');
  const og = $('meta[property="og:image"]'); if (og) og.content = abs('/lit-neon-preview/rework/assets/img/og/create.jpg');
  const ou = $('meta[property="og:url"]'); if (ou) ou.content = abs('/lit-neon-preview/rework/create.html');
}

/* copy into the static shell (headings stay in the HTML for the crawler; the JSON can still restyle them) */
function fillStatic() {
  $('#b-realsize').textContent = t('toolbar.realSize');
  $('#b-light').innerHTML = icon('power'); $('#b-light').setAttribute('aria-label', t('toolbar.light'));
  $('#b-daynight').innerHTML = icon('moon'); $('#b-daynight').setAttribute('aria-label', t('toolbar.daynight'));
  $('#b-rulers').innerHTML = icon('ruler'); $('#b-rulers').setAttribute('aria-label', t('toolbar.rulersCm'));
  $('#b-more').innerHTML = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>`; $('#b-more').setAttribute('aria-label', t('toolbar.more'));
  $('#b-share').innerHTML = `${icon('share')}<span>${esc(t('toolbar.share'))}</span>`;
  $('#b-gift').innerHTML = `${icon('gift')}<span>${esc(t('toolbar.gift'))}</span>`;
  $('#b-save').innerHTML = `${icon('mail')}<span>${esc(t('toolbar.save'))}</span>`;
  $('#b-ar').innerHTML = `${icon('ar-cube')}<span class="lbl">${esc(t('toolbar.ar'))}</span>`;
  $('#b-wall-rotate').innerHTML = `${icon('rotate')}<span>${esc(t('toolbar.wallRotate'))}</span>`;
  $('#b-wall-bright').innerHTML = `${icon('sun')}<span>${esc(t('toolbar.wallBrighten'))}</span>`;
  $('#b-wall-retake').innerHTML = `${icon('camera')}<span>${esc(t('toolbar.wallRetake'))}</span>`;
  $('#b-wall-exit .label').textContent = t('toolbar.wallBack');
  $('#b-drawing-note').textContent = t('toolbar.drawingNote');
  $('#b-cta').textContent = t('dock.add');
  $('#b-deliverto').innerHTML = `${icon('truck')}<span class="lbl">${esc(t('dock.deliverTo'))}</span>`;
  $('#b-more-link').innerHTML = `<span>${esc(t('dock.more'))}</span>${icon('chevron-down')}`;
  $('.b-h1').textContent = t('h1');
  $$('.b-step').forEach((s, i) => { s.querySelector('[data-stepn]').textContent = t('stepOf', { n: i + 1, total: STEPS.length }); s.querySelector('.b-step__title').textContent = t(`steps.${s.dataset.step}`); });
}

/* ====================================================================== core update ====================================================================== */
function update({ silent = false, heavy = true } = {}) {
  design = R.normalise(design); design.align = 'center';   /* owner decision 2026-10-15: no alignment control, every sign is centred */
  if (stageApi) stageApi.setDesign(design);
  paintDock();
  clearTimeout(paintTimer); paintTimer = setTimeout(() => { paintAll(); if (design.view === 'drawing') paintDrawing(); }, heavy ? 90 : 0);
  if (!silent) { autosave(); if (!started) { started = true; track('builder_start', { source: 'builder' }); } }
}
function paintAll() { paintWords(); paintLettering(); paintColour(); paintSize(); paintBacking(); paintFitting(); paintReview(); }
function autosave() { router.design.set(design, 'builder'); clearTimeout(hashTimer); hashTimer = setTimeout(() => router.writeHash(design, editUid ? { edit: editUid } : {}), 300); }
function setDesign(patch, opts) { Object.assign(design, patch); update(opts); }

/* ====================================================================== welcome / editing ====================================================================== */
function showWelcome(saved) {
  const el = $('#b-welcome'); const words = R.resolve(saved).words || t('steps.words');
  el.hidden = false; el.innerHTML = `${icon('clock')}<span class="txt"><b>${esc(t('welcome.title'))}</b> · ${esc(t('welcome.resume', { words }))}</span><span class="acts"><button type="button" class="c-btn c-btn--primary c-btn--sm" data-qa="builder.welcome.resume">${esc(t('welcome.resumeBtn'))}</button><button type="button" class="c-btn c-btn--ghost c-btn--sm" data-qa="builder.welcome.fresh">${esc(t('welcome.fresh'))}</button></span>`;
  el.querySelector('[data-qa="builder.welcome.resume"]').addEventListener('click', () => { design = R.normalise(saved); roomScene = design.scene; stageApi.setScene(design.scene); el.hidden = true; paintWordsValue(); applyView(design.view, true); update(); });
  el.querySelector('[data-qa="builder.welcome.fresh"]').addEventListener('click', () => { router.design.clear(); el.hidden = true; });
}
function showEditing() { const el = $('#b-editing'); el.hidden = false; el.innerHTML = `${icon('pencil', 'ic--sm')}<span>${esc(t('welcome.editing'))}</span>`; }

/* ====================================================================== toolbar + views ====================================================================== */
function renderToolbar() {
  const view = $('#b-view'); const tabsEls = $$('[role=tab]', view);
  tabsEls.forEach(b => b.addEventListener('click', () => applyView(b.dataset.view)));
  view.addEventListener('keydown', e => { const i = tabsEls.indexOf(document.activeElement); if (i < 0) return; const n = e.key === 'ArrowRight' ? (i + 1) % 3 : e.key === 'ArrowLeft' ? (i + 2) % 3 : e.key === 'Home' ? 0 : e.key === 'End' ? 2 : -1; if (n < 0) return; e.preventDefault(); tabsEls[n].focus(); applyView(tabsEls[n].dataset.view); });
  $('#b-realsize').addEventListener('click', e => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', String(on)); stageApi.setFrame(on ? 'real' : (design.view === 'fit' ? 'closeup' : 'room')); });
  $('#b-light').addEventListener('click', () => { setDesign({ on: !design.on }); paintToolbar(); });
  $('#b-daynight').addEventListener('click', () => { setDesign({ night: !design.night }); paintToolbar(); });
  $('#b-rulers').addEventListener('click', () => cycleRulers());
  $('#b-more').addEventListener('click', e => openMore(e.currentTarget));
  $('#b-scenes').addEventListener('click', e => openScenes(e.currentTarget));
  $('#b-share').addEventListener('click', () => openShare());
  $('#b-gift').addEventListener('click', () => openShare('gift'));
  $('#b-save').addEventListener('click', () => openShare('email'));
  /* AR fallback (no WebXR / Quick Look, or a failed launch): don't just explain — open the Scenes sheet at "Your own wall"
     with the reason inline above the photo buttons, so the tap still leads somewhere (adversarial round 2) */
  arApi = ar.mount($('#b-ar'), { stage: stageApi, getState: () => design, qa: 'builder.stage.ar', onFallback: f => {
    const android = /android/i.test(navigator.userAgent); const note = t(android ? 'scenes.arFallbackAndroid' : 'scenes.arFallback', {}, String(f.message || '').replace(/<[^>]+>/g, ''));
    openScenes($('#b-ar'), { ownWall: true, note });
  } });
  $('#b-wall-rotate').addEventListener('click', () => stageApi.ownWall.rotate());
  $('#b-wall-bright').addEventListener('click', e => { stageApi.ownWall.brighten(); e.currentTarget.setAttribute('aria-pressed', String(!!(stageApi.ownWall.state && stageApi.ownWall.state.bright))); });
  $('#b-wall-retake').addEventListener('click', () => stageApi.ownWall.retake());
  $('#b-wall-exit').addEventListener('click', () => { stageApi.ownWall.exit(roomScene); design.scene = roomScene; onWall({ state: 'exit' }); paintSceneButton(); autosave(); });
  paintToolbar();
}
function paintToolbar() {
  const light = $('#b-light'); light.setAttribute('aria-pressed', String(design.on)); light.setAttribute('aria-label', design.on ? t('toolbar.lightOn') : t('toolbar.lightOff'));
  const dn = $('#b-daynight'); dn.setAttribute('aria-pressed', String(design.night)); dn.innerHTML = icon(design.night ? 'moon' : 'sun'); dn.setAttribute('aria-label', design.night ? t('toolbar.night') : t('toolbar.day'));
  const ru = $('#b-rulers'); ru.setAttribute('aria-pressed', String(rulers !== 'off')); ru.setAttribute('aria-label', t(rulers === 'cm' ? 'toolbar.rulersCm' : rulers === 'in' ? 'toolbar.rulersIn' : 'toolbar.rulersOff'));
  const drawingView = design.view === 'drawing';
  [light, dn, ru, $('#b-realsize')].forEach(b => { b.disabled = drawingView; });
}
function cycleRulers() { rulers = RULER_CYCLE[(RULER_CYCLE.indexOf(rulers) + 1) % 3]; if (rulers !== 'off') design.unit = rulers; stageApi.setView({ rulers }); paintToolbar(); autosave(); paintSize(); }
function applyView(v, initial = false) {
  if (!R.OPTIONS.views.includes(v)) v = 'room';
  design.view = v;
  $$('#b-view [role=tab]').forEach(b => { const on = b.dataset.view === v; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  const drawingEl = $('#b-drawing'), stageEl = $('#b-stage');
  if (v === 'drawing') { drawingEl.hidden = false; stageEl.classList.add('is-hidden'); paintDrawing(); }
  else { drawingEl.hidden = true; stageEl.classList.remove('is-hidden'); const real = initial || $('#b-realsize').getAttribute('aria-pressed') === 'true'; $('#b-realsize').setAttribute('aria-pressed', String(real)); stageApi.setFrame(real ? 'real' : (v === 'fit' ? 'closeup' : 'room')); }
  $('#b-realsize').hidden = v === 'drawing';
  paintToolbar();
  if (!initial) autosave();
}
function paintDrawing() { const el = $('#b-drawing-sheet'); if (el.offsetWidth) sheetMod.render(el, design, { lite: true }); }

/* own wall state → controls + the privacy note */
function onWall(e) {
  const active = stageApi.scene && stageApi.scene.own;
  $('#b-wallctl').hidden = !active;
  let note = $('.b-wallnote', $('#b-stage')); if (active && !note) { note = document.createElement('p'); note.className = 'b-wallnote'; note.dataset.qa = 'builder.stage.wallnote'; note.innerHTML = `${icon('lock', 'ic--sm')}<span>${esc(t('toolbar.wallPrivate'))}</span>`; $('#b-stage .ln-stage__ui').appendChild(note); }
  if (!active && note) note.remove();
  if (active) { design.scene = 'wall'; $('#b-scene-name').textContent = t('toolbar.ownWall'); $('.b-scenebtn__thumb').style.backgroundImage = stageApi.ownWall.state ? `url(${stageApi.ownWall.state.url})` : ''; track('wall_photo', { state: e.state }); }
  paintSize();
}

/* ====================================================================== tabs (mobile) + rail (desktop) + scroll spy ====================================================================== */
function renderTabs() {
  const el = $('#b-tabs');
  el.innerHTML = STEPS.map((id, i) => `<button type="button" role="tab" id="b-tab-${id}" aria-selected="${id === current}" tabindex="${id === current ? 0 : -1}" data-step="${id}" data-qa="builder.tabs.tab" data-id="${id}"><span class="n">${i + 1}</span><span>${esc(t(`stepsShort.${id}`, {}, t(`steps.${id}`)))}</span></button>`).join('');
  el.addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) jumpTo(b.dataset.step); });
  el.addEventListener('keydown', e => { const list = $$('[role=tab]', el); const i = list.indexOf(document.activeElement); if (i < 0) return; const n = e.key === 'ArrowRight' ? (i + 1) % list.length : e.key === 'ArrowLeft' ? (i + list.length - 1) % list.length : e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : -1; if (n < 0) return; e.preventDefault(); list[n].focus(); jumpTo(list[n].dataset.step); });
}
function renderRail() { rail = ui.steps($('#b-rail'), { qa: 'builder.rail', steps: STEPS.map(id => ({ id, label: t(`stepsShort.${id}`, {}, t(`steps.${id}`)) })), current, done: [], onJump: id => jumpTo(id) }); $('#b-rail').classList.add('b-rail'); }
/* a step counts as done only once the shopper has actually been on it (scrolled to it or opened it) and moved on:
   jumping from Words straight to Size leaves Lettering and Colour unticked */
const visited = new Set(); let visitTimer = 0;
function paintProgress() {
  /* "been on it" = the step stayed current for a moment (a smooth scroll sweeping past it does not count) */
  clearTimeout(visitTimer); { const cur = current; if (!visited.has(cur)) visitTimer = setTimeout(() => { visited.add(cur); if (current !== cur) paintProgress(); }, 700); }
  const idx = STEPS.indexOf(current); const done = STEPS.slice(0, idx).filter(id => visited.has(id));
  rail && rail.render(current, done);
  $$('#b-tabs [role=tab]').forEach(b => { const on = b.dataset.step === current; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; b.classList.toggle('is-done', done.includes(b.dataset.step)); if (on) revealTab(b); });
}
function revealTab(b) { const l = $('#b-tabs'); if (l.scrollWidth <= l.clientWidth + 1) return; const lr = l.getBoundingClientRect(), r = b.getBoundingClientRect(); l.scrollTo({ left: Math.max(0, l.scrollLeft + (r.left - lr.left) - (lr.width - r.width) / 2), behavior: R.reducedMotion() ? 'auto' : 'smooth' }); }
let spyLock = 0;
/* <1024 the page itself scrolls: the stage and the step bar are sticky under the header and the dock is sticky at the
   bottom, so the preview is never covered while editing (§0.2 rule 6). ≥1024 the panel body is its own scroller.
   panelTop/panelBottom = the band where step content is actually visible, in viewport coordinates. */
function panelTop() { return isMobile() ? $('#b-tabs').getBoundingClientRect().bottom : $('#b-body').getBoundingClientRect().top; }
function panelBottom() {
  if (!isMobile()) return $('#b-body').getBoundingClientRect().bottom;
  const dock = $('#b-dock'); const r = dock.getBoundingClientRect(); return r.height ? Math.min(innerHeight, r.top) : innerHeight;
}
function jumpTo(id, { focus = true } = {}) {
  const sec = $(`#step-${id}`); if (!sec) return; const body = $('#b-body');
  current = id; paintProgress(); spyLock = Date.now() + 700;
  const behavior = R.reducedMotion() ? 'auto' : 'smooth'; const delta = sec.getBoundingClientRect().top - panelTop() - 8;
  if (isMobile()) window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior }); else body.scrollTo({ top: body.scrollTop + delta, behavior });
  if (focus) { const h = sec.querySelector('.b-step__title'); h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
}
function wireSpy() {
  const body = $('#b-body'); let raf = 0;
  const spy = () => { raf = 0; if (Date.now() < spyLock) return; const pt = panelTop(); const top = pt + Math.max(120, panelBottom() - pt) * .3; let cur = STEPS[0]; for (const id of STEPS) { const s = $(`#step-${id}`); if (s.getBoundingClientRect().top <= top) cur = id; }
    const atEnd = isMobile() ? body.getBoundingClientRect().bottom <= panelBottom() + 4 : body.scrollTop + body.clientHeight >= body.scrollHeight - 4; if (atEnd) cur = 'review'; if (cur !== current) { current = cur; paintProgress(); } };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(spy); };
  body.addEventListener('scroll', onScroll, { passive: true }); addEventListener('scroll', onScroll, { passive: true });
  paintProgress();
}

/* keyboard mode (<1024): the stage shrinks and the dock hides while a panel input has focus (§4.2) */
function wireShell() {
  const shell = $('#builder'); const vv = window.visualViewport; let baseH = innerHeight, typing = false;
  let kbdOn = false, kbdTimer = 0, kbdGen = 0;
  /* the stage frames target a share of the stage WIDTH, so a 150-180 px tall keyboard-mode stage crops a two-line sign; while the
     shopper types, drop to the 'guide' frame and, if the sign still overruns the box, to 'real' (whole plate); restore on blur */
  const frameFor = () => $('#b-realsize').getAttribute('aria-pressed') === 'true' ? 'real' : (design.view === 'fit' ? 'closeup' : 'room');
  const refitKbd = on => {
    if (design.view === 'drawing' || !stageApi) return;
    if (!on) { kbdGen++; stageApi.setFrame(frameFor()); return; }
    /* the sign must sit wholly inside the visible stage (below the sticky header too), not only be smaller than it */
    const fits = () => { const box = $('#b-stage').getBoundingClientRect(), sg = stageApi.signBBox(); const hd = $('.ch-header'); const hh = hd ? Math.max(0, hd.getBoundingClientRect().bottom) : 0; const top = Math.max(box.top, hh);
      return sg.top >= top + 4 && sg.bottom <= box.bottom - 4 && sg.left >= box.left + 4 && sg.right <= box.right - 4; };
    stageApi.setFrame('guide'); const gen = ++kbdGen;   /* a newer refit (stage resized again) cancels this one's later checks */
    clearTimeout(kbdTimer); kbdTimer = setTimeout(() => { if (gen !== kbdGen || !shell.classList.contains('kbd') || fits()) return; stageApi.setFrame('typing'); setTimeout(() => { if (gen === kbdGen && shell.classList.contains('kbd') && !fits()) stageApi.setFrame('real'); }, 450); }, 450);   /* the plate/sign glide to a new frame: measure after it settles */
  };
  /* the stage box changes height as the keyboard opens/closes and as the sticky shell settles: refit while typing */
  if (window.ResizeObserver) { let lastH = 0; new ResizeObserver(() => { const h = Math.round($('#b-stage').getBoundingClientRect().height); if (Math.abs(h - lastH) < 2) return; lastH = h; if (shell.classList.contains('kbd')) refitKbd(true); }).observe($('#b-stage')); }
  const paint = () => { const small = vv ? vv.height < baseH * .75 : false; const on = isMobile() && (typing || small); shell.classList.toggle('kbd', on); if (on !== kbdOn) { kbdOn = on; refitKbd(on); } };
  document.addEventListener('focusin', e => { const body = $('#b-body'); if (!body.contains(e.target)) return; typing = !!e.target.matches('input:not([type=checkbox]):not([type=range]):not([type=date]), textarea'); paint();
    if (typing && isMobile()) setTimeout(() => { /* once the keyboard is up (stage shrunk, dock hidden): bring the field into the visible band under the sticky stage */ const r = e.target.getBoundingClientRect(); const pt = panelTop(), pb = panelBottom(); if (r.top < pt + 8 || r.bottom > pb - 8) window.scrollBy({ top: r.top - pt - 12, behavior: (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth') }); }, 320); });
  document.addEventListener('focusout', () => { typing = false; setTimeout(paint, 60); });
  const onVV = () => { baseH = Math.max(baseH, innerHeight); paint(); }; vv && vv.addEventListener('resize', onVV); addEventListener('resize', () => { baseH = innerHeight; paint(); paintDrawing(); });
  $('#b-more-link').addEventListener('click', e => { e.preventDefault(); $('#learn').scrollIntoView({ behavior: R.reducedMotion() ? 'auto' : 'smooth' }); history.replaceState(null, '', '#learn'); });
  $('#learn-backup').addEventListener('click', e => { e.preventDefault(); $('#builder').scrollIntoView({ behavior: R.reducedMotion() ? 'auto' : 'smooth' }); router.writeHash(design, editUid ? { edit: editUid } : {}); });
}
function onHash(h) {
  if (h.intent) return;
  if (h.step && STEPS.includes(h.step)) jumpTo(h.step);
  if (h.scene && stage.getScene(h.scene) && h.scene !== design.scene) { roomScene = h.scene; design.scene = h.scene; stageApi.setScene(h.scene); paintSceneButton(); }
  if (h.d && h.edit && h.edit !== editUid) { editUid = h.edit; showEditing(); paintDock(); paintReview(); }
  if (h.d && h.code && h.code !== router.encode(design)) { design = R.normalise(h.d); if (design.scene === 'wall') design.scene = roomScene; roomScene = design.scene === 's00-studio-dark' ? roomScene : design.scene; stageApi.setScene(design.scene); paintWordsValue(); applyView(design.view, true); update({ silent: true }); }
}

/* ====================================================================== step 1 · words ====================================================================== */
let lastWords = '';
function renderWords() {
  const L = R.OPTIONS.limits;
  $('#body-words').innerHTML = `
    <div class="b-group">
      <label class="b-label" for="b-words"><span>${esc(t('words.label'))}</span><span class="sub">${esc(t('words.help', { maxLines: L.maxLines, maxChars: L.maxChars }))}</span></label>
      <div class="b-words c-input--with-icon"><textarea class="c-input" id="b-words" name="words" rows="3" autocomplete="off" autocapitalize="sentences" spellcheck="true" placeholder="${esc(t('words.placeholder'))}" aria-describedby="b-words-note b-counters" data-qa="builder.words.textarea"></textarea><button type="button" class="c-btn c-btn--icon b-words__clear" id="b-words-clear" hidden aria-label="${esc(t('words.clear'))}" data-qa="builder.words.clear">${icon('close')}</button></div>
      <div class="b-counters" id="b-counters" aria-live="polite"></div>
      <div class="b-note" id="b-words-note" hidden role="status" aria-live="polite" data-qa="builder.words.note"></div>
    </div>
    <a class="b-logocard" href="/lit-neon-preview/rework/upload.html?from=builder" data-qa="builder.words.logocard">${icon('upload')}<span><b>${esc(t('words.logoCard'))}</b><span>${esc(t('words.logoCardLine', { hours: facts.has('mockupHours') ? facts.value('mockupHours') : '' }))}</span></span>${icon('arrow-right')}</a>`;
  const ta = $('#b-words'); paintWordsValue();
  ta.addEventListener('beforeinput', e => { lastWords = ta.value; ta._sel = [ta.selectionStart, ta.selectionEnd]; ta._type = e.inputType; });
  ta.addEventListener('input', onWordsInput);
  ta.addEventListener('blur', () => { const cleaned = R.resolve(design).clean.text; if (cleaned !== ta.value) { ta.value = cleaned; design.text = cleaned; update(); } });
  $('#b-words-clear').addEventListener('click', () => { ta.value = ''; design.text = ''; design.icon = ''; update(); ta.focus(); });
}
function paintWordsValue() { const ta = $('#b-words'); if (ta && ta.value !== design.text) ta.value = design.text; }
function onWordsInput() {
  const ta = $('#b-words'); const L = R.OPTIONS.limits; let v = ta.value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"'); const note = $('#b-words-note');
  const lines = v.split('\n');
  /* a bulk insertion is anything that is not one typed character: paste, drop, autocorrect/replacement, composition
     (phone keyboards), or any input that grew the text by more than one character (CDP insertText, dictation) */
  const grew = Array.from(v).length - Array.from(lastWords || '').length;
  const paste = /insertFromPaste|insertFromDrop|insertReplacementText|insertFromYank|insertCompositionText|insertFromComposition/.test(ta._type || '') || grew > 1;
  const over = lines.findIndex(l => Array.from(l).length > L.maxChars); const tooMany = lines.length > L.maxLines;
  if ((over >= 0 || tooMany) && !paste && lastWords !== undefined) {
    /* typed over a limit: never cut a word. If a line is free and the full line has a space, the last word moves to a
       new line (so "Welcome to the Smith wedding" becomes two lines as you type); otherwise the character is refused. */
    if (over >= 0 && !tooMany && lines.length < L.maxLines && lines[over].includes(' ')) {
      const l = lines[over]; const sp = l.lastIndexOf(' '); const head = l.slice(0, sp).trim(), tail = l.slice(sp + 1);
      lines.splice(over, 1, head, tail); v = lines.join('\n'); ta.value = v; try { ta.setSelectionRange(v.length, v.length); } catch {}
      showNote(t('words.wrapped', { n: over + 1, word: tail }), 'warn', [{ label: t('words.makeTwoLines'), qa: 'builder.words.note.twolines', run: () => balanceLines() }]);
      $('#b-words-note').dataset.sticky = '1'; design.text = v; update(); return;
    }
    const sel = ta._sel || [lastWords.length, lastWords.length]; ta.value = lastWords; try { ta.setSelectionRange(sel[0], sel[0]); } catch {}
    showNote(tooMany ? t('words.linesFull') : t('words.lineFull', { n: over + 1 }), 'warn', []); return;
  }
  if (over >= 0 || tooMany) {
    /* pasted over a limit: never throw the paste away. Long lines flow onto free lines at word boundaries first (the
       way a long typed line wraps), then the first maxLines lines are kept, and anything still over is clipped at a
       word boundary (or hard at maxChars for a run without spaces). The note says what was kept. */
    const flowed = flowLines(lines, L);
    v = flowed.kept.join('\n'); ta.value = v; try { ta.setSelectionRange(v.length, v.length); } catch {}
    if (flowed.dropped) { showNote(t('words.pasteKept', { kept: flowed.kept.join(' / ') }), 'warn', flowed.kept.length < L.maxLines && flowed.kept.some(l => l.includes(' ')) ? [{ label: t('words.makeTwoLines'), qa: 'builder.words.note.twolines', run: () => splitLongest() }] : []); note.dataset.sticky = '1'; }
    else if (flowed.wrapped) { showNote(t('words.wrapped', { n: flowed.wrapped.n, word: flowed.wrapped.word }), 'warn', flowed.kept.length === 2 ? [{ label: t('words.makeTwoLines'), qa: 'builder.words.note.twolines', run: () => balanceLines() }] : []); note.dataset.sticky = '1'; }
    else { note.hidden = true; note.dataset.sticky = '0'; }
  } else if (note.dataset.sticky !== '1' || lines.length < 2) { note.hidden = true; note.dataset.sticky = '0'; }
  if (ta.value !== v) ta.value = v;
  design.text = v; update();
}
/** flow pasted lines into the limits at word boundaries: { kept, dropped, wrapped: { n, word } | null } */
function flowLines(lines, L) {
  const out = []; let wrapped = null, dropped = false;
  const push = s => { if (out.length >= L.maxLines) { dropped = true; return false; } out.push(s); return true; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) { if (out.length && i < lines.length - 1 && lines.slice(i + 1).some(x => x.trim())) push(''); continue; }
    let cur = '';
    for (const w of l.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${w}` : w;
      if (Array.from(next).length <= L.maxChars) { cur = next; continue; }
      if (cur) { const ok = push(cur); cur = ''; if (ok && !wrapped) wrapped = { n: out.length, word: w }; }
      let rest = Array.from(w);
      while (rest.length > L.maxChars) { if (!push(rest.slice(0, L.maxChars).join(''))) { rest = []; break; } rest = rest.slice(L.maxChars); }
      cur = rest.join('');
    }
    if (cur) push(cur);
  }
  return { kept: out.length ? out : [''], dropped, wrapped: dropped ? null : wrapped };
}
/** re-split the whole text into two balanced lines at a word boundary */
function balanceLines() {
  const words = design.text.split(/\s+/).filter(Boolean); if (words.length < 2) return; const total = words.join(' ').length; let best = 1, bd = Infinity;
  for (let i = 1; i < words.length; i++) { const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '); if (a.length > R.OPTIONS.limits.maxChars || b.length > R.OPTIONS.limits.maxChars) continue; const d = Math.abs(a.length - b.length); if (d < bd) { bd = d; best = i; } }
  design.text = words.slice(0, best).join(' ') + '\n' + words.slice(best).join(' '); paintWordsValue(); update(); $('#b-words').focus();
}
function splitLongest() {
  const lines = design.text.split('\n'); if (lines.length >= R.OPTIONS.limits.maxLines) return;
  let i = 0; lines.forEach((l, k) => { if (l.length > lines[i].length) i = k; }); const l = lines[i]; const mid = l.length / 2; let best = -1, bd = Infinity;
  for (let k = 0; k < l.length; k++) if (l[k] === ' ' && Math.abs(k - mid) < bd) { bd = Math.abs(k - mid); best = k; }
  if (best < 0) return; lines.splice(i, 1, l.slice(0, best).trim(), l.slice(best + 1).trim()); design.text = lines.join('\n'); paintWordsValue(); update(); $('#b-words').focus();
}
function showNote(msg, kind = 'warn', actions = [], auto = false) {
  const note = $('#b-words-note'); note.hidden = false; note.dataset.auto = auto ? '1' : '0'; note.dataset.sticky = '0'; note.className = 'b-note' + (kind === 'bad' ? ' is-bad' : kind === 'ok' ? ' is-ok' : '');
  note.innerHTML = `${icon(kind === 'bad' ? 'warning' : 'info')}<span class="msg">${esc(msg)}</span>${actions.length ? `<span class="acts">${actions.map((a, i) => `<button type="button" class="c-btn c-btn--ghost c-btn--sm" data-act="${i}" data-qa="${esc(a.qa)}">${esc(a.label)}</button>`).join('')}</span>` : ''}`;
  /* the note sits under the words box: pressing its buttons must not blur the textarea first, or keyboard mode ends,
     the stage grows back and the button moves out from under the finger before the click lands */
  note.querySelectorAll('[data-act]').forEach(b => { b.addEventListener('mousedown', e => { if (document.activeElement && document.activeElement.id === 'b-words') e.preventDefault(); }); b.addEventListener('click', () => actions[+b.dataset.act].run()); });
}
/* user-perceived characters: 👨‍👩‍👧 (ZWJ), 👍🏽 (skin tone), ❤️ (VS16) and 🇬🇧 are ONE character to the shopper, so the
   "can't draw" note names and removes whole graphemes, never their loose code points */
const SEG = (() => { try { return new Intl.Segmenter(undefined, { granularity: 'grapheme' }); } catch { return null; } })();
const graphemes = s => (SEG ? Array.from(SEG.segment(s), x => x.segment) : Array.from(s));
const hasBad = (g, bad) => Array.from(g).some(ch => bad.includes(ch));
const badGraphemes = (text, bad) => { const out = []; for (const g of graphemes(text)) if (hasBad(g, bad) && !out.includes(g)) out.push(g); return out.length ? out : bad.slice(); };
const stripBad = (text, bad) => text.split('\n').map(l => graphemes(l).filter(g => !hasBad(g, bad)).join('').replace(/ {2,}/g, ' ').trim()).join('\n');
function paintWords() {
  const res = R.resolve(design); const L = R.OPTIONS.limits; const ta = $('#b-words'); const lines = design.text.split('\n');
  $('#b-words-clear').hidden = !design.text;
  $('#b-counters').innerHTML = (design.text ? lines : []).map((l, i) => { const n = Array.from(l).length; return `<span class="b-counter${n >= L.maxChars ? ' is-full' : n >= L.maxChars - 2 ? ' is-warn' : ''}" data-qa="builder.words.counter" data-line="${i + 1}"><span class="sr-only">${esc(t('words.lineLabel', { n: i + 1 }))} </span>${esc(t('words.counter', { n, max: L.maxChars }))}</span>`; }).join('');
  /* unsupported glyphs (B08): placeholder on the stage, fix actions here */
  if (res.bad.length) {
    ta.setAttribute('aria-invalid', 'true');
    const shown = badGraphemes(design.text, res.bad); const g = shown[0]; const sym = SYMBOL_FOR_GLYPH[g] || SYMBOL_FOR_GLYPH[Array.from(g)[0]]; const acts = [{ label: t('words.remove'), qa: 'builder.words.note.remove', run: () => { design.text = stripBad(design.text, res.bad); paintWordsValue(); update(); } }];
    if (sym) acts.push({ label: t('words.useSymbol', { name: t(`words.symbolNames.${sym}`).toLowerCase() }), qa: 'builder.words.note.usesymbol', run: () => { design.text = stripBad(design.text, res.bad); design.icon = sym; paintWordsValue(); update(); } });
    showNote(shown.length > 1 ? t('words.unsupportedMany', { glyphs: shown.join(' ') }) : t('words.unsupported', { glyph: g }), 'bad', acts, true);
  } else {
    ta.removeAttribute('aria-invalid');
    const p = pricing.price(design);
    if (p.kind === 'quote' && p.reason === 'too-wide') {
      const fit = R.OPTIONS.sizes.slice().reverse().map(s => ({ s, p: pricing.price({ ...design, size: s.id }) })).find(x => x.p.kind === 'price');
      const acts = fit ? [{ label: t('words.useSize', { size: fit.s.name }), qa: 'builder.words.note.usesize', run: () => setDesign({ size: fit.s.id }) }] : [];
      if (lines.length < L.maxLines && design.text.includes(' ')) acts.push({ label: t('words.makeTwoLines'), qa: 'builder.words.note.twolines', run: () => splitLongest() });
      showNote(t('words.tooWide', { size: design.size === 'custom' ? t('size.custom') : R.sizeOf(design.size).name }) + (fit ? ' ' + t('words.fitsAt', { size: fit.s.name, width: fmtLen(fit.p.dims.W, design.unit), price: gbp(fit.p.payable) }) : '') + (acts.length > 1 ? ' ' + t('words.splitHint') : ''), 'warn', acts, true);
    } else if ($('#b-words-note').dataset.auto === '1') $('#b-words-note').hidden = true;
  }
  /* symbol deltas: "+£40 · +27 cm" */
  $$('#b-symbols [data-icon]').forEach(b => { const id = b.dataset.icon; b.setAttribute('aria-pressed', String(id === design.icon)); const d = b.querySelector('[data-delta]'); if (!id) { d.textContent = t('words.symbolNone'); return; } if (!res.hasText && !design.icon) { d.textContent = ''; return; } const delta = pricing.symbolDelta(design, id), cm = pricing.symbolHeightDelta(design, id); d.textContent = delta == null ? '' : t('words.symbolDelta', { price: fmtDelta(delta), cm }); });
  const pos = $('#b-iconpos'); pos.hidden = !design.icon || !res.drawLines.length; $$('[data-pos]', pos).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pos === design.iconPos)));
}

/* ====================================================================== step 2 · lettering ====================================================================== */
function renderLettering() {
  const faces = R.enabledFonts(); const styles = ['all', ...Array.from(new Set(faces.map(f => f.style || 'script')))];
  const fam = f => `font-family:'${String(f.family).replace(/'/g, '')}',cursive;font-weight:${f.weight || 400}`;
  $('#body-lettering').innerHTML = `
    <p class="b-help">${esc(t('lettering.help'))}</p>
    <div class="b-fontpick" id="b-fontpick">
      <button type="button" class="b-fontpick__btn" id="b-fontbtn" aria-haspopup="listbox" aria-expanded="false" aria-controls="b-fontpop" data-qa="builder.font.open"><span class="face" data-face></span><span class="meta"><span class="nm" data-facename></span><span class="note" data-note></span></span>${icon('chevron-down')}</button>
      <div class="b-fontpick__pop" id="b-fontpop" hidden>
        <div class="c-chips" role="group" aria-label="${esc(t('lettering.label'))}" id="b-styles">${styles.map(st => `<button type="button" class="c-chip" aria-pressed="${st === 'all'}" data-style="${st}" data-qa="builder.font.style" data-id="${st}">${esc(t(`lettering.styles.${st}`, {}, st))}</button>`).join('')}</div>
        <div class="b-fontlist" role="listbox" aria-label="${esc(t('lettering.label'))}" id="b-tiles">${faces.map(f => `<button type="button" role="option" class="b-fontopt" aria-selected="${f.id === design.font}" data-font="${f.id}" data-style="${f.style || 'script'}" aria-label="${esc(t('a11y.tile', { face: f.name }))}" data-qa="builder.font.tile" data-id="${f.id}"><span class="face" style="${fam(f)}">${esc(f.name)}</span><span class="meta"><span class="nm">${esc(f.name)}</span><span class="note" data-note></span></span></button>`).join('')}</div>
      </div>
    </div>`;
  const btn = $('#b-fontbtn'), pop = $('#b-fontpop');
  const open = on => { pop.hidden = !on; btn.setAttribute('aria-expanded', String(on)); if (on) { const sel = $('#b-tiles [aria-selected="true"]'); if (sel) sel.scrollIntoView({ block: 'nearest' }); } };
  btn.addEventListener('click', () => open(pop.hidden));
  $('#b-tiles').addEventListener('click', e => { const b = e.target.closest('[data-font]'); if (!b) return; setDesign({ font: b.dataset.font }); stageApi.strike(); open(false); btn.focus(); });
  $('#b-styles').addEventListener('click', e => { const b = e.target.closest('[data-style]'); if (!b) return; $$('#b-styles .c-chip').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $$('#b-tiles .b-fontopt').forEach(tl => { tl.hidden = b.dataset.style !== 'all' && tl.dataset.style !== b.dataset.style; }); });
  document.addEventListener('click', e => { if (!pop.hidden && !$('#b-fontpick').contains(e.target)) open(false); });
  pop.addEventListener('keydown', e => { if (e.key === 'Escape') { open(false); btn.focus(); } });
}
function paintLettering() {
  const res = R.resolve(design); const sizeName = res.sizeId === 'custom' ? t('size.custom') : R.sizeOf(res.sizeId).name;
  const cur = R.fontOf(design.font); const btn = $('#b-fontbtn'); if (!btn) return;
  const face = btn.querySelector('[data-face]'); face.textContent = cur.name; face.style.cssText = `font-family:'${String(cur.family).replace(/'/g, '')}',cursive;font-weight:${cur.weight || 400}`;
  btn.querySelector('[data-facename]').textContent = cur.name;
  const thinCur = (cur.minLetterCm || 0) > res.letterCm; btn.querySelector('[data-note]').textContent = thinCur ? t('lettering.thinAtSmall', { size: sizeName }) : '';
  $$('#b-tiles .b-fontopt').forEach(b => { const f = R.fontOf(b.dataset.font); b.setAttribute('aria-selected', String(f.id === design.font)); const thin = (f.minLetterCm || 0) > res.letterCm; const n = b.querySelector('[data-note]'); n.textContent = thin ? t('lettering.thinAtSmall', { size: sizeName }) : ''; n.title = thin ? t('lettering.thinNote', { face: f.name, min: f.minLetterCm, size: sizeName }) : ''; });
}

/* ====================================================================== step 3 · colour ====================================================================== */
function renderColour() {
  const C = R.OPTIONS.colours;
  $('#body-colour').innerHTML = `
    <div class="b-group">
      <span class="b-label"><span>${esc(t('colour.label'))}</span><span class="sub">${esc(t('colour.help'))}</span></span>
      <div class="b-swatches c-swatches" role="group" aria-label="${esc(t('colour.label'))}" id="b-swatches">${C.map(c => `<button type="button" class="c-swatch${c.rgb ? ' c-swatch--rgb' : ''}" aria-pressed="${c.id === design.colour}" style="--tube:${c.hex};--core:${c.core || '#fff'}" data-colour="${c.id}" data-qa="builder.colour.swatch" data-id="${c.id}"><span class="tube"></span><span class="name">${esc(c.name)}</span></button>`).join('')}</div>
      <p class="b-help" id="b-rgbnote" hidden data-qa="builder.colour.rgbnote"></p>
    </div>
    <div class="b-group b-jacket">
      <span class="b-label">${esc(t('colour.jacketLabel'))}</span>
      <div class="c-seg" role="group" aria-label="${esc(t('colour.jacketLabel'))}" id="b-jacket">
        <button type="button" aria-pressed="${design.jacket === 'white'}" data-jacket="white" data-qa="builder.colour.jacket.white"><span class="b-jacket__mini" data-mini="white" aria-hidden="true"></span><span>${esc(t('colour.jacketWhite'))}</span><span class="sub">${esc(t('colour.jacketWhiteSub'))}</span></button>
        <button type="button" aria-pressed="${design.jacket === 'colour'}" data-jacket="colour" data-qa="builder.colour.jacket.colour"><span class="b-jacket__mini" data-mini="colour" aria-hidden="true"></span><span>${esc(t('colour.jacketColoured'))}</span><span class="sub">${esc(t('colour.jacketColouredSub'))}</span></button>
      </div>
      <p class="b-help" id="b-jacketnote" hidden></p>
    </div>
    <div class="b-group">
      <div class="b-switchrow"><span class="txt"><b id="b-perline-label">${esc(t('colour.perLine'))}</b><small id="b-perline-help"></small></span><button type="button" class="c-switch" role="switch" aria-checked="${!!design.colours}" aria-labelledby="b-perline-label" id="b-perline" data-qa="builder.colour.perline"></button></div>
      <div class="b-lines" id="b-lines" hidden data-qa="builder.colour.lines"></div>
      <button type="button" class="c-btn c-btn--text" id="b-twocolours" data-qa="builder.colour.twocolours"><span class="label">${esc(t('colour.twoColours'))}</span></button>
    </div>
    <div class="b-group">
      <span class="b-label"><span>${esc(t('colour.examples'))}</span><span class="sub">${esc(t('colour.examplesNote'))}</span></span>
      <div class="b-examples" id="b-examples"></div>
    </div>`;
  $('#b-swatches').addEventListener('click', e => { const b = e.target.closest('[data-colour]'); if (!b) return; const id = b.dataset.colour; const patch = { colour: id }; if (design.colours) patch.colours = design.colours.map((c, i) => (i === 0 ? id : c)); setDesign(patch); stageApi.strike(); });
  $('#b-jacket').addEventListener('click', e => { const b = e.target.closest('[data-jacket]'); if (!b || b.disabled) return; setDesign({ jacket: b.dataset.jacket }); });
  minis.white = R.mountNeon($('[data-mini="white"]'), { ...design, jacket: 'white' }, { lit: true, fitW: .9, fitH: .8, perLine: false }); minis.white.setLit(false);
  minis.colour = R.mountNeon($('[data-mini="colour"]'), { ...design, jacket: 'colour' }, { lit: true, fitW: .9, fitH: .8, perLine: false }); minis.colour.setLit(false);
  $('#b-perline').addEventListener('click', e => { if (e.currentTarget.disabled) return; const on = e.currentTarget.getAttribute('aria-checked') !== 'true'; togglePerLine(on); });
  $('#b-lines').addEventListener('click', e => { const b = e.target.closest('[data-line-colour]'); if (!b) return; const i = +b.closest('[data-line]').dataset.line; const cs = (design.colours || []).slice(); cs[i] = b.dataset.lineColour; if (i === 0) design.colour = cs[0]; setDesign({ colours: cs }); stageApi.strike(); });
  $('#b-twocolours').addEventListener('click', () => { const sw = $('#b-perline'); if (sw.disabled) { jumpTo('words'); showNote(t('colour.perLineNeedsLines'), 'warn', [], true); return; } togglePerLine(true); sw.focus(); });
  /* example signs in this colour: three catalogue designs, rendered, opening a lightbox of baked renders */
  const EX = [{ text: 'Open late', font: 'shoreditch' }, { text: 'Mr & Mrs', font: 'notting' }, { text: 'Cuppa first', font: 'margate' }];
  $('#b-examples').dataset.ex = JSON.stringify(EX);
  paintExamples();
}
function togglePerLine(on) {
  const lines = R.resolve(design).lines;
  if (on) { const cs = lines.map((_, i) => (design.colours && design.colours[i]) || design.colour); if (cs.length > 1 && cs.every(c => c === design.colour)) cs[1] = design.colour === 'warm' ? 'pink' : 'warm'; setDesign({ colours: cs }); }
  else setDesign({ colours: null });
  stageApi.strike();
}
function paintColour() {
  const res = R.resolve(design); const c = res.colour; const rules = pricing.rules().pricing;
  $$('#b-swatches .c-swatch').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.colour === design.colour)); b.setAttribute('aria-label', t('a11y.swatch', { name: R.colourOf(b.dataset.colour).name, jacket: res.jacket.name.toLowerCase() })); });
  const rgbNote = $('#b-rgbnote'); rgbNote.hidden = !res.rgb; if (res.rgb) rgbNote.textContent = t('colour.rgbNote', { pct: Math.round((rules.rgbMultiplier - 1) * 100) + '%' });
  $$('#b-jacket [data-jacket]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.jacket === design.jacket)); b.disabled = res.rgb; });
  const jn = $('#b-jacketnote'); jn.hidden = !res.rgb; jn.textContent = t('colour.rgbJacket');
  for (const j of ['white', 'colour']) { minis[j].update({ ...design, jacket: j, colours: null }); minis[j].setLit(false); }
  /* per-line colours (owner D5) */
  const sw = $('#b-perline'); const can = res.lines.length > 1 && !res.rgb; sw.disabled = !can; sw.setAttribute('aria-checked', String(!!design.colours));
  $('#b-perline-help').textContent = res.rgb ? t('colour.perLineRgb') : res.lines.length < 2 ? t('colour.perLineNeedsLines') : t('colour.perLineHelp', { delta: fmtDelta(rules.multicolourDelta) });
  const linesEl = $('#b-lines'); linesEl.hidden = !design.colours || !can;
  $('#b-twocolours').hidden = !!design.colours && can;   /* the shortcut is redundant once each line has its own row */
  if (design.colours && can) {
    const key = res.lines.length + '|' + res.lines.join('\n');
    if (linesEl.dataset.key !== key) { linesEl.dataset.key = key; linesEl.innerHTML = res.lines.map((l, i) => `<div class="b-line" data-line="${i}"><span class="b-line__label"><span>${esc(t('words.lineLabel', { n: i + 1 }))}</span><b>${esc(l)}</b><span class="b-line__now" data-qa="builder.colour.line.name" data-line="${i}"></span></span><div class="c-swatches" role="group" aria-label="${esc(t('colour.lineLabel', { n: i + 1, text: l }))}">${R.OPTIONS.colours.filter(x => !x.rgb).map(x => `<button type="button" class="c-swatch" aria-pressed="false" style="--tube:${x.hex};--core:${x.core || '#fff'}" data-line-colour="${x.id}" aria-label="${esc(x.name)}" data-qa="builder.colour.line" data-id="${i}-${x.id}"><span class="tube"></span><span class="name">${esc(x.name)}</span></button>`).join('')}</div></div>`).join(''); }
    $$('.b-line[data-line]', linesEl).forEach(row => { const i = +row.dataset.line; const cur = (design.colours[i] || design.colour); $$('[data-line-colour]', row).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lineColour === cur))); const now = row.querySelector('.b-line__now'); if (now) now.textContent = t('colour.lineColourNow', { name: R.colourOf(cur).name }, R.colourOf(cur).name); });
  }
  paintExamples();
}

/* real photos per tube colour (homepage set); renders fill in where no photo exists yet (owner 2026-10-17: "view examples" must look real) */
const COLOUR_PHOTOS = {
  pink: [{ f: 'hero', alt: 'after dark in hot pink on a brick wall' }, { f: 'p8', alt: 'last orders in pink above a bar table' }],
  ice: [{ f: 'p4', alt: "kettle's on in ice blue in a kitchen" }, { f: 'p55', alt: 'the same kitchen sign at night' }],
  warm: [{ f: 'p24', alt: 'dream big in warm white above a bed' }, { f: 'p11', alt: 'a florist logo in warm white' }, { f: 'p49', alt: 'a café logo in warm white on brick' }],
  cool: [{ f: 'p50', alt: 'a barbershop logo in cool white' }],
  violet: [{ f: 'p12', alt: 'game on in violet above a desk' }],
  candy: [{ f: 'p9', alt: 'little dreamer in candy pink above a cot' }],
  orange: [{ f: 'p3', alt: 'cheers in amber above a home bar' }],
  gold: [{ f: 'p3', alt: 'cheers in golden yellow above a home bar' }]
};
let exPhotosKey = null;
function paintExamples() {
  const host = $('#b-examples'); if (!host) return;
  const EX = JSON.parse(host.dataset.ex || '[]'); const photos = COLOUR_PHOTOS[design.colour] || [];
  const key = design.colour + '|' + design.jacket;
  if (exPhotosKey !== key) {
    exPhotosKey = key; examples.length = 0;
    const tiles = photos.slice(0, 3).map((p, i) => `<button type="button" class="b-example is-photo" data-photo="${i}" aria-label="${esc(p.alt)}" data-qa="builder.colour.example" data-id="p${i}"><img src="/lit-neon-preview/rework/assets/img/photos/${p.f}-800.jpg" alt="" loading="lazy" decoding="async"></button>`);
    const need = Math.max(0, 3 - tiles.length);
    for (let i = 0; i < need; i++) tiles.push(`<button type="button" class="b-example" data-ex="${i}" aria-label="${esc(EX[i].text)}" data-qa="builder.colour.example" data-id="${i}"><span data-exneon></span>${ui.pill('rendered')}</button>`);
    host.innerHTML = tiles.join('');
    $$('#b-examples .b-example[data-ex]').forEach(b => { const i = +b.dataset.ex; examples[i] = R.mountNeon(b.querySelector('[data-exneon]'), { ...EX[i], colour: design.colour, jacket: design.jacket }, { lit: true, fitW: .8, fitH: .6 }); b.addEventListener('click', () => openExampleLightbox(EX, i)); });
    $$('#b-examples .b-example[data-photo]').forEach(b => b.addEventListener('click', () => { const items = photos.map(p => ({ src: `/lit-neon-preview/rework/assets/img/photos/${p.f}-1600.jpg`, alt: p.alt, caption: `${p.alt} · ${R.colourOf(design.colour).name}` })); lb && lb.destroy(); lb = ui.lightbox({ items, index: +b.dataset.photo, qa: 'builder.lightbox' }); lb.open(+b.dataset.photo, b); }));
    const note = host.closest('.b-group') && host.closest('.b-group').querySelector('.b-label .sub'); if (note) note.textContent = photos.length ? t('colour.examplesPhotos', {}, 'Real photos in this colour') : t('colour.examplesNote');
  } else { examples.forEach((m, i) => { if (m) m.update({ ...EX[i], colour: design.colour, jacket: design.jacket }); }); }
}
async function openExampleLightbox(EX, index) {
  const items = EX.map(x => { const r = R.bakeGlow({ ...R.DEFAULT_DESIGN, ...x, colour: design.colour, jacket: design.jacket, size: 'm' }, { ppc: 10, transparent: false, background: '#180E1F', on: design.on, night: true, maxPx: 1400 }); return { src: r ? r.canvas.toDataURL('image/png') : '', alt: `${x.text} in ${R.colourOf(design.colour).name}`, caption: `${x.text} · ${R.colourOf(design.colour).name} · ${t('scenes.placeholderNote')}` }; });
  lb && lb.destroy(); lb = ui.lightbox({ items, index, qa: 'builder.lightbox' }); lb.open(index, document.activeElement);
}

/* ====================================================================== step 4 · size ====================================================================== */
function renderSize() {
  const L = R.OPTIONS.limits;
  $('#body-size').innerHTML = `
    <div class="b-label"><span>${esc(t('size.label'))}</span><div class="c-seg b-unit" role="group" aria-label="Units" id="b-unit"><button type="button" aria-pressed="${design.unit !== 'in'}" data-unit="cm" data-qa="builder.size.unit.cm">${esc(t('size.unitCm'))}</button><button type="button" aria-pressed="${design.unit === 'in'}" data-unit="in" data-qa="builder.size.unit.in">${esc(t('size.unitIn'))}</button></div></div>
    <p class="b-help">${esc(t('size.help'))}</p>
    <div class="c-sizes b-sizes" id="b-sizes" role="group" aria-label="${esc(t('size.label'))}"></div>
    <div class="b-group b-tube"><span class="b-label"><span>${esc(t('size.tubeLabel'))}</span><span class="sub">${esc(t('size.tubeHelp'))}</span></span>
      <div class="c-seg c-seg--lg" role="group" aria-label="${esc(t('size.tubeLabel'))}" id="b-tube"><button type="button" aria-pressed="${design.tube !== '8'}" data-tube="6" data-qa="builder.size.tube.6">${esc(t('size.tube6'))}</button><button type="button" aria-pressed="${design.tube === '8'}" data-tube="8" data-qa="builder.size.tube.8">${esc(t('size.tube8'))} <span class="delta" data-tube-delta></span></button></div></div>
    <div class="b-custom__slider c-range" id="b-custom" hidden data-qa="builder.size.custom.panel">
      <label class="b-label" for="b-width"><span>${esc(t('size.custom'))}</span><span class="readout" data-qa="builder.size.custom.readout"></span></label>
      <input type="range" id="b-width" min="${L.customMinCm}" max="${L.customMaxCm}" step="${L.customStepCm}" value="60" data-qa="builder.size.custom.slider">
      <p class="b-help">${esc(t('size.customHint'))}</p>
    </div>`;
  $('#b-sizes').addEventListener('click', e => { const b = e.target.closest('[data-size]'); if (!b || b.disabled) return; const id = b.dataset.size; if (id === 'custom') { const res = R.resolve(design); const letterCm = design.custom ? design.custom.letterCm : R.sizeOf(design.size === 'custom' ? 'm' : design.size).letterCm; setDesign({ size: 'custom', custom: { letterCm } }); $('#b-width').value = String(Math.round((res.dims ? res.dims.W : 60) / 5) * 5); } else setDesign({ size: id }); });
  $('#b-tube').addEventListener('click', e => { const b = e.target.closest('[data-tube]'); if (!b) return; setDesign({ tube: b.dataset.tube }); stageApi.strike(); });
  $('#b-unit').addEventListener('click', e => { const b = e.target.closest('[data-unit]'); if (!b) return; design.unit = b.dataset.unit; rulers = b.dataset.unit; stageApi.setView({ rulers, unit: rulers }); paintToolbar(); update(); });
  ui.range($('#b-custom'), { text: v => t('size.customReadout', { width: fmtLen(v, design.unit), letter: pricing.letterCmForWidth(design, v) || '—' }), onInput: v => { const letterCm = pricing.letterCmForWidth(design, v); if (letterCm) setDesign({ size: 'custom', custom: { letterCm } }, { heavy: true }); } });
}
function paintSize() {
  const scene = stageApi && stageApi.scene && !stageApi.scene.own ? stageApi.scene : roomScene;
  const cards = pricing.sizeCards(design, scene); const el = $('#b-sizes'); const unit = design.unit;
  const html = c => { const priceTxt = c.payable != null ? gbp(c.payable) : c.tooWide ? t('size.quoted') : !c.available ? t('size.unavailable', {}, 'Not offered') : t('pills.quote', {}, 'Quote'); const other = unit === 'in' ? 'cm' : 'in';
    const dims = c.W ? `<span title="${esc(fmtDims(c.W, c.H, other))}">${esc(t('size.length', {}, 'Length'))} <b>${esc(fmtLen(c.W, unit))}</b></span><span title="${esc(fmtDims(c.W, c.H, other))}">${esc(t('size.height', {}, 'Height'))} <b>${esc(fmtLen(c.H, unit))}</b></span>` : '<span>—</span>';
    return `<span class="name">${esc(c.name)}</span><span class="price${c.payable == null ? ' is-quote' : ''}">${esc(priceTxt)}</span><span class="dims">${dims}</span><span class="promo">${c.selected && c.promoLine ? esc(c.promoLine) : ''}</span><span class="verdict">${esc(!c.available ? (c.reason || t('size.tooThin')) : c.verdict || '')}</span>`; };
  const list = cards.filter(c => c.id !== 'custom');
  const custom = { id: 'custom', name: t('size.custom'), selected: design.size === 'custom', available: true };
  const all = list.concat([custom]);
  if (el.children.length !== all.length) el.innerHTML = all.map(c => `<button type="button" class="c-size${c.id === 'custom' ? ' b-customcard' : ''}" data-size="${c.id}" data-qa="builder.size.card" data-id="${c.id}"></button>`).join('');
  Array.from(el.children).forEach((b, i) => { const c = all[i]; b.setAttribute('aria-pressed', String(!!c.selected)); b.disabled = c.available === false; if (c.id === 'custom') { const cc = cards.find(x => x.id === 'custom'); b.innerHTML = cc ? html({ ...cc, name: t('size.custom') }) : `<span class="name">${esc(t('size.custom'))}</span><span class="dims">${fmtLen(R.OPTIONS.limits.customMinCm, unit)} – ${fmtLen(R.OPTIONS.limits.customMaxCm, unit)}</span><span class="price is-quote">${esc(t('size.customHint').split('.')[0])}</span><span class="verdict"></span>`; b.setAttribute('aria-label', t('a11y.sizeCard', { name: t('size.custom'), dims: cc && cc.W ? sayDims(cc.W, cc.H) : '', price: cc && cc.payable != null ? gbp(cc.payable) : '' })); } else { b.innerHTML = html(c); b.setAttribute('aria-label', t('a11y.sizeCard', { name: c.name, dims: c.W ? sayDims(c.W, c.H) : '', price: c.payable != null ? gbp(c.payable) : (c.tooWide ? t('size.quoted') : !c.available ? t('size.tooThin') : t('pills.quote', {}, 'Quote')) })); } });
  const panel = $('#b-custom'); panel.hidden = design.size !== 'custom';
  if (design.size === 'custom') { const res = R.resolve(design); const w = res.dims ? Math.round(res.dims.W / 5) * 5 : 60; const inp = $('#b-width'); if (Math.abs(+inp.value - w) > 2 && document.activeElement !== inp) { inp.value = String(Math.max(+inp.min, Math.min(+inp.max, w))); } inp.setAttribute('aria-valuetext', t('size.customReadout', { width: fmtLen(+inp.value, unit), letter: res.letterCm })); $('#b-custom .readout').textContent = t('size.customReadout', { width: fmtLen(res.dims ? res.dims.W : +inp.value, unit), letter: res.letterCm }); }
  $$('#b-unit [data-unit]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.unit === unit)));
  $$('#b-tube [data-tube]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tube === (design.tube === '8' ? '8' : '6')))); const td = $('[data-tube-delta]'); if (td) { const dl = pricing.tubeDelta(design); td.textContent = dl ? fmtDelta(dl, '') : ''; }
}

/* ====================================================================== step 5 · backing ====================================================================== */
function renderBacking() {
  const rules = pricing.rules().pricing; const ICON = { cut: 'drawing', letter: 'pencil', rect: 'box', stand: 'stand' };
  $('#body-backing').innerHTML = `
    <p class="b-help">${esc(t('backing.help'))}</p>
    <div class="c-opts b-backcards" role="radiogroup" aria-label="${esc(t('backing.label'))}" id="b-backings">${R.OPTIONS.backings.map(b => `<button type="button" class="c-opt b-backcard" role="radio" aria-checked="${b.id === design.backing}" data-backing="${b.id}" data-qa="builder.backing.card" data-id="${b.id}"><img class="b-backcard__img" src="/lit-neon-preview/rework/assets/img/photos/bk-${b.id}-800.jpg" alt="" loading="lazy" decoding="async" onerror="this.remove()">${icon(ICON[b.id])}<span><span class="name">${esc(t(`backing.${b.id}`, {}, b.name))}</span><span class="sub">${esc(t(`backing.${b.id}Sub`, {}, b.sub))}</span></span><span class="delta${!rules.backing[b.id] ? ' is-included' : ''}">${esc(fmtDelta(rules.backing[b.id] || 0, t('pills.included', {}, 'Included')))}</span></button>`).join('')}</div>
    <span class="b-label">${esc(t('backing.finishLabel'))}</span>
    <div class="b-finishes" role="group" aria-label="${esc(t('backing.finishLabel'))}" id="b-finishes">${R.OPTIONS.finishes.map(f => `<button type="button" class="b-finish" aria-pressed="${f.id === design.board}" data-finish="${f.id}" data-qa="builder.backing.finish" data-id="${f.id}"><span class="sw" style="background:${f.swatch}" aria-hidden="true"></span><span>${esc(t(`backing.finishes.${f.id}`, {}, f.name))}</span><span class="delta">${esc(fmtDelta(rules.finish[f.id] || 0, t('pills.included', {}, 'Included')))}</span></button>`).join('')}</div>
    <div><button type="button" class="c-btn c-btn--ghost" id="b-backing-example" data-qa="builder.backing.example">${icon('eye')}<span>${esc(t('backing.example'))}</span></button></div>`;
  $('#b-backings').addEventListener('click', e => { const b = e.target.closest('[data-backing]'); if (!b) return; setDesign({ backing: b.dataset.backing }); });
  $('#b-finishes').addEventListener('click', e => { const b = e.target.closest('[data-finish]'); if (!b) return; setDesign({ board: b.dataset.finish }); });
  $('#b-backing-example').addEventListener('click', () => {
    /* owner 2026-10-17: real photos of each backing style; the baked render is the fallback when a photo is missing */
    const items = R.OPTIONS.backings.map(b => ({ src: `/lit-neon-preview/rework/assets/img/photos/bk-${b.id}-1600.jpg`, alt: `${b.name} backing`, caption: t(`backing.${b.id}`, {}, b.name) + ' · ' + t(`backing.${b.id}Sub`, {}, b.sub) }));
    lb && lb.destroy(); lb = ui.lightbox({ items, index: R.OPTIONS.backings.findIndex(b => b.id === design.backing), qa: 'builder.lightbox' }); lb.open(undefined, $('#b-backing-example'));
  });
}
function paintBacking() {
  $$('#b-backings [data-backing]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.backing === design.backing)));
  $$('#b-finishes [data-finish]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.finish === design.board)));
}

/* ====================================================================== step 6 · fitting ====================================================================== */
function renderFitting() {
  const ICON = { screws: 'standoff', chains: 'chain', strips: 'strip' };
  const rulesP = pricing.rules().pricing; const outLabel = t('fitting.outdoorIndicative', { pct: (rulesP.outdoorPct || 0) + '%' });
  $('#body-fitting').innerHTML = `
    <div class="b-group"><span class="b-label">${esc(t('fitting.where'))}</span>
      <div class="c-seg c-seg--lg" role="group" aria-label="${esc(t('fitting.where'))}" id="b-use"><button type="button" aria-pressed="${design.use === 'in'}" data-use="in" data-qa="builder.fitting.use.in">${esc(t('fitting.indoors'))}</button><button type="button" aria-pressed="${design.use === 'out'}" data-use="out" data-qa="builder.fitting.use.out">${esc(t('fitting.outdoors'))}<span class="delta">${esc(outLabel)}</span></button></div>
      <p class="b-quotehint" id="b-outdoornote" hidden>${esc(t('fitting.outdoorNote', { pct: (rulesP.outdoorPct || 0) + '%' }))}</p></div>
    <div class="b-group"><span class="b-label"><span>${esc(t('fitting.dimmer'))}</span><span class="sub">${esc(t('fitting.dimmerHelp'))}</span></span>
      <div class="c-seg c-seg--lg" role="group" aria-label="${esc(t('fitting.dimmer'))}" id="b-dimmer"><button type="button" aria-pressed="${!design.dimmer}" data-dimmer="0" data-qa="builder.fitting.dimmer.no">${esc(t('fitting.dimmerNo'))}</button><button type="button" aria-pressed="${!!design.dimmer}" data-dimmer="1" data-qa="builder.fitting.dimmer.yes">${esc(t('fitting.dimmerYes'))} <span class="delta">${esc(fmtDelta(rulesP.dimmerDelta || 0, ''))}</span></button></div></div>
    <div class="b-group" id="b-hanggroup"><span class="b-label">${esc(t('fitting.how'))}</span>
      <div class="c-opts" role="radiogroup" aria-label="${esc(t('fitting.how'))}" id="b-hangs">${R.OPTIONS.hangs.map(h => { const kit = facts.get(`kitContents.${h.id}`); return `<button type="button" class="c-opt" role="radio" aria-checked="${h.id === design.hang}" data-hang="${h.id}" data-qa="builder.fitting.hang" data-id="${h.id}">${icon(ICON[h.id])}<span><span class="name">${esc(t(`fitting.${h.id}`, {}, h.name))}</span><span class="sub">${esc(kit || t(`fitting.${h.id}Sub`, {}, h.sub))}</span></span><span class="delta is-included">${esc(t('pills.included', {}, 'Included'))}</span></button>`; }).join('')}</div>
      <p class="b-help" id="b-standnote" hidden>${esc(t('fitting.standNote'))}</p></div>
    <div class="b-group"><span class="b-label">${esc(t('fitting.badges'))}</span>
      <ul class="b-badges">${[['standoff', t('fitting.badgeFixings')], ['plug-uk', t('fitting.badgePlug')], ['shield', t('fitting.badgeWarranty', { years: facts.has('warrantyYears') ? facts.value('warrantyYears') : '' })], ['truck', t('fitting.badgeDelivery')]].map(([ic, txt]) => `<li>${icon(ic)}<span>${esc(txt)}</span></li>`).join('')}</ul></div>`;
  $('#b-use').addEventListener('click', e => { const b = e.target.closest('[data-use]'); if (!b) return; setUse(b.dataset.use); });
  $('#b-hangs').addEventListener('click', e => { const b = e.target.closest('[data-hang]'); if (!b) return; setDesign({ hang: b.dataset.hang }); });
  $('#b-dimmer').addEventListener('click', e => { const b = e.target.closest('[data-dimmer]'); if (!b) return; setDesign({ dimmer: b.dataset.dimmer === '1' }); });
}
function setUse(use) {
  if (use === design.use) return;
  if (use === 'out') { if (design.scene !== 'wall' && design.scene !== 's00-studio-dark') roomScene = design.scene; design.scene = 's11-shopwindow'; stageApi.setScene('s11-shopwindow'); }
  else { design.scene = roomScene; stageApi.setScene(roomScene); }
  paintSceneButton(); setDesign({ use });
}
function paintFitting() {
  $$('#b-use [data-use]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.use === design.use)));
  $('#b-outdoornote').hidden = design.use !== 'out';
  const stand = design.backing === 'stand'; $('#b-hangs').hidden = stand; $('#b-standnote').hidden = !stand;
  $$('#b-dimmer [data-dimmer]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.dimmer === '1') === !!design.dimmer)));
  $$('#b-hangs [data-hang]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.hang === design.hang)));
}


/* ====================================================================== step 7 · symbol (moved to the end, owner 2026-10-16) ====================================================================== */
function renderSymbol() {
  $('#body-symbol').innerHTML = `
    <div class="b-group">
      <p class="b-help">${esc(t('words.symbolsHelp'))}</p>
      <div class="b-symbols" role="group" aria-label="${esc(t('words.symbols'))}" id="b-symbols">
        ${['', ...R.OPTIONS.symbols].map(id => `<button type="button" class="b-symbol" aria-pressed="${id === design.icon}" data-icon="${id}" data-qa="builder.words.symbol" data-id="${id || 'none'}">${id ? R.iconSvg(id, null, '', '') : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>'}<span><span class="name">${esc(t(`words.symbolNames.${id || 'none'}`))}</span><span class="delta" data-delta></span></span></button>`).join('')}
      </div>
      <div class="c-seg b-iconpos" role="group" aria-label="${esc(t('words.position'))}" id="b-iconpos" hidden><button type="button" aria-pressed="true" data-pos="above" data-qa="builder.words.symbolpos.above">${esc(t('words.above'))}</button><button type="button" aria-pressed="false" data-pos="inline" data-qa="builder.words.symbolpos.inline">${esc(t('words.inline'))}</button></div>
    </div>
`;
  $('#b-symbols').addEventListener('click', e => { const b = e.target.closest('[data-icon]'); if (!b) return; setDesign({ icon: b.dataset.icon }); stageApi.strike(); });
  $('#b-iconpos').addEventListener('click', e => { const b = e.target.closest('[data-pos]'); if (!b) return; setDesign({ iconPos: b.dataset.pos }); });
}

/* ====================================================================== step 8 · review ====================================================================== */
function renderReview() {
  $('#body-review').innerHTML = `
    <p class="b-help">${esc(t('review.help'))}</p>
    <div class="b-review__sheet" id="b-review-sheet" data-qa="builder.review.sheet"></div>
    <div class="b-review__acts"><button type="button" class="c-btn c-btn--ghost" id="b-open-drawing" data-qa="builder.review.opendrawing">${icon('drawing')}<span>${esc(t('review.openDrawing'))}</span></button><button type="button" class="c-btn c-btn--ghost" id="b-pdf" data-qa="builder.review.pdf">${icon('download')}<span>${esc(t('review.downloadPdf'))}</span></button></div>
    <div class="b-group"><span class="b-label">${esc(t('review.specTitle'))}</span><table class="c-spec" id="b-spec" data-qa="builder.review.spec"></table></div>
    <div class="b-group"><span class="b-label">${esc(t('review.breakdownTitle'))}</span><div class="b-rows" id="b-review-rows" data-qa="builder.review.rows"></div></div>
    <div class="b-group b-review__delivery"><span class="b-label">${esc(t('review.deliveryTitle'))}</span><div id="b-review-delivery" data-qa="builder.review.delivery"></div><div class="b-needby"><label class="b-needby__label" for="b-needby-r"><span>${icon('calendar', 'ic--sm')}${esc(t('dock.needBy'))}</span></label><input class="c-input b-needby__input" type="date" id="b-needby-r" min="${clock.format(clock.now(), 'iso')}" data-qa="builder.review.needby"></div><p class="b-needby__out t-caption" id="b-needby-r-out" hidden></p></div>
    <label class="c-check" id="b-spelling-wrap"><input type="checkbox" id="b-spelling" name="spelling" data-qa="builder.review.spelling"><span>${esc(t('review.spelling'))}</span></label>
    <p class="b-ccr">${esc(t('review.ccr'))}</p>
    <button type="button" class="c-btn c-btn--primary c-btn--lg b-review__add" id="b-review-add" disabled data-qa="builder.review.add">${esc(t('review.add'))}</button>`;
  $('#b-open-drawing').addEventListener('click', () => { applyView('drawing'); if (isMobile()) { /* the stage is sticky under the header; only if the shell has scrolled away (education block) bring it back */ const r = $('.b-stagecol').getBoundingClientRect(); const hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h-scrolled')) || 56; if (r.top < hh - 1) window.scrollBy({ top: r.top - hh, behavior: R.reducedMotion() ? 'auto' : 'smooth' }); } });
  $('#b-pdf').addEventListener('click', () => drawing.download(design));
  $('#b-spelling').addEventListener('change', () => { $('#b-cta-reason').hidden = true; $('#b-spelling-wrap').style.outline = ''; paintDock(); });
  $('#b-review-add').addEventListener('click', () => addToBasket($('#b-review-add')));
  $('#b-needby-r').addEventListener('change', e => paintNeedBy(e.target.value, $('#b-needby-r-out')));
}
function paintReview() {
  const res = R.resolve(design); const sheetEl = $('#b-review-sheet'); if (sheetEl.offsetWidth) sheetMod.render(sheetEl, design, { compact: true });
  const colourText = design.colours ? res.lineColours.map((c, i) => `${c.name} (${t('words.lineLabel', { n: i + 1 }).toLowerCase()})`).join(' / ') : res.colour.name;
  /* every cell is escaped: the words come from the textarea, the share hash or the search box (user text, never HTML).
     The size row is the one cell with markup, so it is assembled from escaped pieces. */
  const rows = [[t('review.rows.words'), esc(res.words || '—')], [t('review.rows.lettering'), esc(res.font.name)], [t('review.rows.colour'), esc(colourText)], [t('review.rows.jacket'), esc(res.jacket.sub)], [t('review.rows.size'), `${esc(res.sizeId === 'custom' ? t('size.custom') : R.sizeOf(res.sizeId).name)} · <span class="mono">${esc(res.dims ? fmtDims(res.dims.W, res.dims.H, design.unit) : '—')}</span>`]];
  if (design.icon) rows.push([t('review.rows.symbol'), esc(`${t(`words.symbolNames.${design.icon}`)}, ${design.iconPos === 'inline' ? t('words.inline').toLowerCase() : t('words.above').toLowerCase()}`)]);
  rows.push([t('review.rows.tube'), esc(design.tube === '8' ? t('size.tube8') : t('size.tube6'))], [t('review.rows.backing'), esc(res.backing.name)], [t('review.rows.finish'), esc(`${res.finish.name} acrylic`)], [t('review.rows.hangs'), esc(design.backing === 'stand' ? t('backing.stand') : res.hang.name)], [t('review.rows.where'), esc(res.use.name)], [t('review.rows.dimmer'), esc(design.dimmer ? t('fitting.dimmerYes') : t('fitting.dimmerNo'))], [t('review.rows.plug'), esc(t('review.plugValue'))]);
  $('#b-spec').innerHTML = rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('');
  $('#b-review-rows').innerHTML = breakdownRows(false);
  $('#b-review-delivery').innerHTML = deliveryMarkup(pricing.deliveryLine(router.postcode.get()), 'builder.review');
  wireDelivery($('#b-review-delivery'), 'builder.review');
  const p = pricing.price(design); const add = $('#b-review-add'); const ok = p.kind === 'price' && $('#b-spelling').checked; add.disabled = !ok && p.kind !== 'quote'; add.textContent = p.kind === 'quote' ? t('dock.quote') : editUid ? t('dock.update') : t('review.add');
}
function breakdownRows(withEdit) {
  const b = pricing.breakdown(design); if (!b.rows.length) return '';
  const label = r => r.id === 'base' ? r.label : r.id === 'symbol' ? `${t('dock.rows.symbol')} · ${t(`words.symbolNames.${design.icon}`)}` : r.id === 'rgb' ? t('dock.rows.rgb') : r.id === 'colours' ? `${t('dock.rows.colours')} · ${r.label}` : r.id === 'tube' ? t('dock.rows.tube') : r.id === 'dimmer' ? t('dock.rows.dimmer') : r.id === 'outdoor' ? r.label : r.id === 'backing' ? `${t('dock.rows.backing')} · ${r.label}` : r.id === 'finish' ? `${t('dock.rows.finish')} · ${r.label}` : r.label;
  const rows = b.rows.map(r => `<div><span>${esc(label(r))}${r.sub ? `<span class="sub">${esc(r.sub)}</span>` : ''}</span>${withEdit ? `<button type="button" class="c-btn c-btn--text" data-step="${esc(r.step)}" data-qa="builder.breakdown.edit" data-id="${r.id}"><span class="label">${esc(t('dock.edit'))}</span></button>` : ''}<b>${r.amount == null ? '—' : r.id === 'base' ? gbp(r.amount) : fmtDelta(r.amount, t('pills.included', {}, 'Included'))}</b></div>`).join('');
  const total = b.kind === 'price' ? `<div class="total"><span>${esc(t('dock.rows.total'))}${b.promoNote ? `<span class="sub promo">${esc(b.promoNote)}</span>` : ''}</span><b>${gbp(b.total)}</b></div>` : `<div class="total"><span>${esc(b.reason)}</span><b class="is-quote">${esc(t('pills.quote', {}, 'Quote'))}</b></div>`;
  return rows + total;
}

/* ====================================================================== dock ====================================================================== */
let lastAmount = null, lastPayable = null, lastKey = '', countRaf = 0;
function wireDock() {
  $('#b-cta').addEventListener('click', () => onCta($('#b-cta')));
  $('#b-price').addEventListener('click', e => openBreakdown(e.currentTarget));
  $('#b-deliverto').addEventListener('click', e => openPostcodeSheet(e.currentTarget));
  $('#b-dock-sum').addEventListener('click', () => setDockDetails($('#b-dock-sum').getAttribute('aria-expanded') !== 'true'));
  paintDelivery();
  matchMedia('(max-width: 1023px)').addEventListener('change', () => paintDelivery());
}
/* desktop dock details (postcode form · need-by · pay in 3) open beneath a one-line summary */
function setDockDetails(open, { focus = true } = {}) {
  const sum = $('#b-dock-sum'); sum.setAttribute('aria-expanded', String(open)); $('#b-dock-row2').hidden = !open; paintDockSummary();
  if (open && focus) { const i = $('#b-delivery input'); if (i && !isMobile()) setTimeout(() => i.focus({ preventScroll: true }), 40); }
}
function paintDockSummary(d = pricing.deliveryLine(router.postcode.get()), p = pricing.price(design)) {
  const open = $('#b-dock-sum').getAttribute('aria-expanded') === 'true'; const ic = $('#b-dock-sum-ic'), txt = $('#b-dock-sum-text'), more = $('#b-dock-sum-more');
  const bad = d.status === 'excluded' || d.status === 'invalid';
  if (p.kind === 'quote') { ic.innerHTML = icon('drawing'); txt.textContent = t('dock.quoteDelivery', { hours: facts.has('mockupHours') ? facts.value('mockupHours') : '' }); }
  else if (d.status === 'ok') { ic.innerHTML = icon('check'); txt.textContent = `${d.prefix || t('dock.deliveryFree', { postcode: d.formatted })} · ${d.line}`; }
  else if (bad) { ic.innerHTML = icon('warning'); txt.textContent = d.text; }
  else { ic.innerHTML = icon('truck'); txt.textContent = `${t('dock.deliveryFree', { postcode: 'mainland GB' })} · ${d.text}`; }
  $('#b-dock-sum').classList.toggle('is-bad', bad && p.kind !== 'quote');
  more.innerHTML = `<span>${esc(open ? t('dock.detailsOpen') : p.kind === 'quote' ? t('dock.details') : bad ? t('dock.detailsAsk') : d.status === 'ok' ? t('dock.details') : t('dock.detailsCheck'))}</span>${icon('chevron-down')}`;
}
function paintDock() {
  const p = pricing.price(design); const amount = $('#b-price-amount'), cap = $('#b-price-caption'), reason = $('#b-price-reason'), cta = $('#b-cta'), ctaReason = $('#b-cta-reason');
  const d = pricing.deliveryLine(router.postcode.get()); const excluded = d.status === 'excluded';
  amount.className = 'amount';
  if (p.kind === 'price') { animateAmount(amount, p.payable); cap.innerHTML = p.promoLine ? `${ui.pill('launch')}${esc(p.promoLine.replace(/^[^·]*·\s*/, ''))}` : (p.res.dims ? esc(fmtDims(p.res.dims.W, p.res.dims.H, design.unit)) : ''); }
  else if (p.kind === 'quote') { amount.classList.add('is-quote'); amount.innerHTML = `${esc(t('pills.quote', {}, 'Quote'))}${icon('chevron-down')}`; lastAmount = null; cap.textContent = pricing.quoteReason(p); }
  else if (p.kind === 'wait') { amount.classList.add('is-wait'); amount.textContent = t('dock.measuring'); lastAmount = null; cap.textContent = ''; }
  else { amount.classList.add('is-wait'); amount.textContent = p.kind === 'bad' ? t('dock.bad') : t('dock.empty'); lastAmount = null; cap.textContent = ''; }
  cap.classList.toggle('is-quote', p.kind === 'quote');
  /* reason line: what just changed and by how much (B12/C09) */
  const key = [design.size, design.icon, design.font, design.colour, (design.colours || []).join(), design.backing, design.board, design.custom && design.custom.letterCm].join('|');
  if (p.kind === 'price' && lastKey && key !== lastKey && lastPayable != null) { const diff = Math.round((p.payable - lastPayable) * 100) / 100; reason.textContent = diff ? t('dock.reason', { delta: fmtDelta(diff), what: changeLabel(lastKey, key) }) : ''; reason.classList.toggle('is-ok', diff < 0); }
  else if (p.kind !== 'price') reason.textContent = '';
  if (p.kind === 'price') lastPayable = p.payable; lastKey = key;
  $('#b-price').disabled = !(p.kind === 'price' || p.kind === 'quote');
  /* CTA */
  cta.className = 'c-btn c-btn--primary c-btn--lg b-dock__cta'; cta.disabled = false; ctaReason.hidden = true; cta.removeAttribute('href');
  if (excluded) { cta.textContent = t('dock.askDelivery'); cta.dataset.mode = 'delivery'; }
  else if (p.kind === 'quote') { cta.textContent = t('dock.quote'); cta.dataset.mode = 'quote'; }
  else if (p.kind === 'price') { cta.textContent = editUid ? t('dock.update') : t('dock.add'); cta.dataset.mode = editUid ? 'update' : 'add'; }
  else { cta.textContent = editUid ? t('dock.update') : t('dock.add'); cta.disabled = true; cta.dataset.mode = 'none'; ctaReason.hidden = p.kind !== 'bad'; ctaReason.textContent = p.kind === 'bad' ? t('dock.bad') : ''; }
  /* chip (phone/tablet) */
  const chip = $('#b-deliverto'); chip.innerHTML = `${icon('truck')}<span class="lbl">${esc(d.status === 'ok' ? t('dock.deliverToSet', { postcode: d.formatted }) : t('dock.deliverTo'))}</span>`; chip.classList.toggle('is-selected', d.status === 'ok');
  paintDelivery(d, p);
  const rv = $('#b-review-add'); if (rv) { const ok = p.kind === 'price' && $('#b-spelling').checked; rv.disabled = !ok && p.kind !== 'quote'; }
}
function changeLabel(prev, next) {
  const a = prev.split('|'), b = next.split('|');
  if (a[0] !== b[0] || a[7] !== b[7]) return b[0] === 'custom' ? t('dock.reasonCustom') : t('dock.reasonSize', { name: R.sizeOf(b[0]).name });
  if (a[1] !== b[1]) return t('dock.reasonSymbol', { name: b[1] ? t(`words.symbolNames.${b[1]}`) : t('words.symbolNames.none') });
  if (a[2] !== b[2]) return t('dock.reasonFont', { name: R.fontOf(b[2]).name });
  if (a[3] !== b[3]) return t('dock.reasonColour', { name: R.colourOf(b[3]).name });
  if (a[4] !== b[4]) return t('dock.reasonColours', { n: new Set((b[4] ? b[4].split(',') : [b[3]])).size });
  if (a[5] !== b[5]) return t('dock.reasonBacking', { name: R.backingOf(b[5]).name });
  if (a[6] !== b[6]) return t('dock.reasonFinish', { name: R.finishOf(b[6]).name });
  return '';
}
function animateAmount(el, to) {
  cancelAnimationFrame(countRaf); const from = lastAmount == null ? to : lastAmount; lastAmount = to;
  if (from === to || R.reducedMotion()) { el.innerHTML = `${esc(gbp(to))}${icon('chevron-down')}`; return; }
  const t0 = performance.now(); const step = now => { const k = Math.min(1, (now - t0) / 400); const v = from + (to - from) * (1 - Math.pow(1 - k, 3)); el.innerHTML = `${esc(gbp(Math.round(v)))}${icon('chevron-down')}`; if (k < 1) countRaf = requestAnimationFrame(step); else el.innerHTML = `${esc(gbp(to))}${icon('chevron-down')}`; }; countRaf = requestAnimationFrame(step);
}
function onCta(btn) {
  const mode = btn.dataset.mode;
  if (mode === 'delivery') { location.href = contactRoute(t('postcode.excludedMessage', { postcode: pricing.deliveryLine(router.postcode.get()).formatted || '', link: router.shareLink(design) })); return; }
  if (mode === 'quote') { openQuoteSheet(btn); return; }
  if (mode === 'add' || mode === 'update') addToBasket(btn);
}
function addToBasket(btn) {
  const p = pricing.price(design);
  if (p.kind === 'quote') { openQuoteSheet(btn); return; }
  if (p.kind !== 'price') return;
  const cb = $('#b-spelling');
  if (!cb.checked) {
    current = 'review'; paintProgress(); spyLock = Date.now() + 900;
    const w = $('#b-spelling-wrap'); const behavior = R.reducedMotion() ? 'auto' : 'smooth';
    /* bring the tick box itself (not the top of the Review step) into the middle of the visible band: under the sticky
       stage + step bar and above the sticky dock on phones, inside the panel scroller on desktop */
    const reveal = () => { const r = w.getBoundingClientRect(); const top = panelTop(), bottom = panelBottom(); const delta = r.top + r.height / 2 - (top + bottom) / 2;
      if (isMobile()) window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior }); else { const body = $('#b-body'); body.scrollTo({ top: body.scrollTop + delta, behavior }); } };
    reveal();
    setTimeout(() => { cb.focus({ preventScroll: true }); w.classList.remove('b-check-shake'); void w.offsetWidth; w.classList.add('b-check-shake');
      /* an amber ring until it is ticked (or a few seconds pass), so the box reads as "this one" without a scroll hunt */
      Object.assign(w.style, { outline: '2px solid var(--amber)', outlineOffset: '6px', borderRadius: 'var(--r-2)' }); clearTimeout(w._ring); w._ring = setTimeout(() => { w.style.outline = ''; }, 4000); }, R.reducedMotion() ? 0 : 450);
    const r = $('#b-cta-reason'); r.hidden = false; r.textContent = t('review.spellingNeeded'); return;
  }
  if (editUid && basket.get(editUid)) { basket.update(editUid, design); ui.flashSuccess(btn, t('dock.updated')); track('builder_add_to_basket', { update: true }); }
  else { const r = basket.add({ kind: 'custom', state: design }); if (editUid && !basket.get(editUid)) editUid = null; ui.flashSuccess(btn, t('dock.added')); track('builder_add_to_basket', { merged: r.merged, payable: p.payable }); }
  setTimeout(() => drawer.open(), 250);
}

/* ---- delivery line (dock row 2 on desktop, the postcode sheet on phones, the review step everywhere) ---- */
function deliveryMarkup(d, qa) {
  const firmLine = d.status === 'ok' ? d.line : d.text;
  if (d.status === 'ok') return `<div class="b-dock__delivery"><span class="ic-wrap">${icon('check')}</span><span class="msg" data-qa="${qa}.deliverymsg"><b>${esc(d.prefix || t('dock.deliveryFree', { postcode: d.formatted }))}</b> · ${esc(firmLine)}</span><button type="button" class="c-btn c-btn--text" data-pc-change data-qa="${qa}.postcode.change"><span class="label">${esc(t('dock.change'))}</span></button></div>`;
  const bad = d.status === 'excluded' || d.status === 'invalid';
  const route = d.status === 'excluded' ? contactRoute(t('postcode.excludedMessage', { postcode: d.formatted || '', link: router.shareLink(design) })) : '';
  const routeLabel = facts.has('whatsappNumber') ? t('postcode.excludedCta') : facts.has('supportEmail') ? t('postcode.excludedCtaEmail') : t('postcode.excludedCtaContact');
  return `<div class="b-dock__delivery${bad ? ' is-bad' : ''}"><span class="ic-wrap">${icon(bad ? 'warning' : 'truck')}</span><form class="b-pcform" data-pc novalidate><label class="sr-only" for="${qa.replace(/\./g, '-')}-pc">${esc(t('postcode.label'))}</label><input class="c-input" id="${qa.replace(/\./g, '-')}-pc" name="postcode" inputmode="text" autocomplete="postal-code" autocapitalize="characters" placeholder="SW1A 1AA" value="${esc(router.postcode.get() || '')}" ${bad ? 'aria-invalid="true"' : ''} data-qa="${qa}.postcode.input"><button type="submit" class="c-btn c-btn--ghost" data-qa="${qa}.postcode.check">${esc(t('postcode.check'))}</button></form><p class="b-pcmsg${bad ? ' is-bad' : ''}" data-qa="${qa}.postcode.msg">${esc(d.status === 'empty' ? t('dock.deliveryFree', { postcode: 'mainland GB' }) + ' · ' + d.text : d.text)}${d.status === 'excluded' ? ` <a href="${esc(route)}" data-qa="${qa}.postcode.ask" ${/^https?:/.test(route) ? 'target="_blank" rel="noopener"' : ''}>${esc(routeLabel)} ${icon('arrow-right', 'ic--sm')}</a>` : ''}</p></div>`;
}
function wireDelivery(root, qa) {
  const form = root.querySelector('[data-pc]'); if (form) form.addEventListener('submit', e => { e.preventDefault(); setPostcode(form.postcode.value); });
  const ch = root.querySelector('[data-pc-change]'); if (ch) ch.addEventListener('click', () => { router.postcode.set(''); paintDock(); paintReview(); if (sheets.postcode && sheets.postcode.isOpen) paintPostcodeSheet(); });
}
function setPostcode(v) {
  const d = pricing.deliveryLine(v);
  if (d.status === 'ok') router.postcode.set(d.formatted); else if (d.status === 'excluded') router.postcode.set(d.formatted); else router.postcode.set(v.trim() ? v.trim().toUpperCase() : '');
  paintDock(); paintReview(); if (sheets.postcode && sheets.postcode.isOpen) { paintPostcodeSheet(); if (d.status === 'ok') setTimeout(() => sheets.postcode.close(), 350); }
  return d;
}
function paintDelivery(d = pricing.deliveryLine(router.postcode.get()), p = pricing.price(design)) {
  const el = $('#b-delivery'), nb = $('#b-needby-wrap');
  /* phones and tablets: no input ever lives in the dock (the chip opens the postcode sheet) */
  if (isMobile()) { el.innerHTML = ''; nb.innerHTML = ''; $('#b-needby-out').hidden = true; return; }
  if (p.kind === 'quote') { el.innerHTML = `<div class="b-dock__delivery"><span class="ic-wrap">${icon('drawing')}</span><span class="msg">${esc(t('dock.quoteDelivery', { hours: facts.has('mockupHours') ? facts.value('mockupHours') : '' }))}</span></div>`; nb.innerHTML = ''; $('#b-needby-out').hidden = true; }
  else {
    const focused = document.activeElement && el.contains(document.activeElement);
    el.innerHTML = deliveryMarkup(d, 'builder.dock'); wireDelivery(el, 'builder.dock');
    if (focused) { const i = el.querySelector('input'); if (i) { i.focus({ preventScroll: true }); try { i.setSelectionRange(i.value.length, i.value.length); } catch {} } }
    if (!nb.querySelector('input')) { nb.innerHTML = `<label class="b-needby__label" for="b-needby"><span>${icon('calendar', 'ic--sm')}${esc(t('dock.needBy'))}</span></label><input class="c-input b-needby__input" type="date" id="b-needby" min="${clock.format(clock.now(), 'iso')}" data-qa="builder.dock.needby">`; nb.querySelector('input').addEventListener('change', e => paintNeedBy(e.target.value, $('#b-needby-out'))); }
  }
  ui.bnpl($('#b-bnpl'), p.kind === 'price' ? p.payable : 0, { quote: p.kind !== 'price', qa: 'builder.dock.bnpl' });
  /* a postcode we cannot deliver to (or cannot read) opens the details so the form and the ask link are in view */
  if ((d.status === 'excluded' || d.status === 'invalid') && p.kind !== 'quote' && $('#b-dock-sum').getAttribute('aria-expanded') !== 'true') setDockDetails(true, { focus: false });
  paintDockSummary(d, p);
}
function paintNeedBy(date, out) {
  if (!date) { out.hidden = true; return; }
  const r = pricing.needBy(date, router.postcode.get()); out.hidden = false; out.className = `b-needby__out t-caption is-${r.kind}`;
  const rushHref = contactRoute(t('dock.rushMessage', { date: fmtDay(new Date(date)), link: router.shareLink(design) }));
  out.innerHTML = `${esc(r.text)}${r.rush ? ` → <a href="${esc(rushHref)}" data-qa="builder.dock.needby.rush" ${/^https?:/.test(rushHref) ? 'target="_blank" rel="noopener"' : ''}>${esc(t('dock.rush'))}</a>` : ''}`;
}
/** wa.me → mailto: → contact.html, never '#' (§3.9.2) */
function contactRoute(message) {
  if (facts.has('whatsappNumber')) return `https://wa.me/${String(facts.value('whatsappNumber')).replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
  if (facts.has('supportEmail')) return `mailto:${facts.value('supportEmail')}?subject=${encodeURIComponent('Lit Neon — a question about my sign')}&body=${encodeURIComponent(message)}`;
  return `/lit-neon-preview/rework/contact.html?topic=delivery&message=${encodeURIComponent(message)}`;
}

/* ====================================================================== sheets: breakdown · postcode · scenes · more · quote ====================================================================== */
function openBreakdown(opener) {
  if (!sheets.breakdown) sheets.breakdown = ui.sheet({ title: t('dock.breakdownTitle'), body: '', qa: 'builder.breakdown.sheet', onClose: () => $('#b-price').setAttribute('aria-expanded', 'false') });
  sheets.breakdown.setBody(`<div class="b-sheet"><div class="b-breakrows" data-qa="builder.breakdown.rows">${breakdownRows(true)}</div><p class="b-sheet__lede">${esc(design.use === 'out' ? t('fitting.outdoorNote', { hours: facts.has('mockupHours') ? facts.value('mockupHours') : '' }) : t('review.ccr'))}</p></div>`);
  sheets.breakdown.body().querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { sheets.breakdown.close(); jumpTo(b.dataset.step); }));
  $('#b-price').setAttribute('aria-expanded', 'true'); sheets.breakdown.open(opener);
}
function openPostcodeSheet(opener) {
  if (!sheets.postcode) sheets.postcode = ui.sheet({ title: t('postcode.title'), body: '', qa: 'builder.postcode.sheet' });
  paintPostcodeSheet(); sheets.postcode.open(opener);
  setTimeout(() => { const i = sheets.postcode.body().querySelector('input'); if (i && !isPhone()) i.focus(); }, 520);
}
function paintPostcodeSheet() {
  const d = pricing.deliveryLine(router.postcode.get());
  sheets.postcode.setBody(`<div class="b-pcsheet"><p class="b-sheet__lede">${esc(t('postcode.help'))}</p>${deliveryMarkup(d, 'builder.postcode')}</div>`);
  wireDelivery(sheets.postcode.body(), 'builder.postcode');
}
function thumbFor(sc) { const P = sc.plates; if (!P) return ''; const w = P.widths ? P.widths.plate[0] : (P.sizes || [1600])[0]; return `/lit-neon-preview/rework/assets/img/${P.night}-${w}.jpg`; }
function paintSceneButton() {
  const sc = stageApi && stageApi.scene; if (!sc) return;
  if (sc.own) return;
  $('#b-scene-name').textContent = sc.name || sc.id; $('.b-scenebtn__thumb').style.backgroundImage = `url(${thumbFor(sc)})`; $('#b-scenes').setAttribute('aria-label', t('toolbar.sceneLabel', { name: sc.name || sc.id }));
}
function sceneMeasure(s) {
  /* customer copy, never the calibration note ("brick wall span (scaled from the 198 cm door)"): a per-scene noun from copy, else the
     calib object with any parenthetical stripped */
  if (!s.calib || !s.calib.cm) return '';
  const obj = t(`scenes.objects.${s.id}`, {}, '') || String(s.calib.object || '').replace(/\s*\(.*?\)\s*/g, ' ').trim().replace(/^./, c => c.toUpperCase());
  return obj ? t('scenes.measure', { object: obj, cm: s.calib.cm }) : '';
}
function openScenes(opener, { ownWall = false, note = '' } = {}) {
  if (!sheets.scenes) sheets.scenes = ui.sheet({ title: t('scenes.title'), body: '', qa: 'builder.scenes.sheet' });
  const list = stage.scenesFor(null).filter(s => s.plates);
  const phone = navigator.maxTouchPoints > 1;
  sheets.scenes.setBody(`<div class="b-sheet"><p class="b-sheet__lede">${esc(t('scenes.lede'))}</p>
    <div class="b-scenegrid" role="group" aria-label="${esc(t('scenes.ours'))}">${list.map(s => `<button type="button" class="b-scenecard" aria-pressed="${s.id === design.scene}" data-scene="${s.id}" data-qa="builder.scenes.card" data-id="${s.id}"><span class="b-scenecard__img" style="background-image:url(${thumbFor(s)})" role="img" aria-label="${esc(s.name)}"></span><span class="b-scenecard__name"><span>${esc(s.name)}</span><small>${esc(sceneMeasure(s))}</small></span>${ui.pill('rendered')}</button>`).join('')}</div>
    <div class="b-ownwall${ownWall ? ' is-lit' : ''}" id="b-ownwall" tabindex="-1"><span class="b-label">${esc(t('scenes.yours'))}</span>${note ? `<p class="b-ownwall__note" role="status" data-qa="builder.scenes.arnote">${icon('info', 'ic--sm')} ${esc(note)}</p>` : ''}<p>${esc(t('scenes.uploadLine'))}</p><p>${icon('lock', 'ic--sm')} ${esc(t('toolbar.wallPrivate'))}</p><div class="acts"><label class="c-btn c-btn--ghost" data-qa="builder.scenes.ownwall"><input type="file" accept="image/*" data-wall-file data-qa="builder.scenes.ownwall.file">${icon('upload')}<span>${esc(t('scenes.choose'))}</span></label>${phone ? `<label class="c-btn c-btn--ghost" data-qa="builder.scenes.takephoto"><input type="file" accept="image/*" capture="environment" data-wall-file data-qa="builder.scenes.takephoto.file">${icon('camera')}<span>${esc(t('toolbar.takePhoto'))}</span></label>` : ''}</div></div></div>`);
  const body = sheets.scenes.body();
  body.querySelectorAll('[data-scene]').forEach(b => b.addEventListener('click', () => { const id = b.dataset.scene; roomScene = id; design.scene = id; if (design.use === 'out' && id !== 's11-shopwindow') { /* outdoor keeps the shop window as its default, but a chosen scene wins */ } stageApi.setScene(id); paintSceneButton(); onWall({ state: 'exit' }); autosave(); paintSize(); sheets.scenes.close(); }));
  body.querySelectorAll('[data-wall-file]').forEach(inp => inp.addEventListener('change', async () => { if (!inp.files[0]) return; sheets.scenes.close(); await stageApi.ownWall.load(inp.files[0]); onWall({ state: 'loaded' }); }));
  sheets.scenes.open(opener);
  /* the sheet is reused: a normal open starts at the rooms, never where the last AR-fallback scroll left it (reset once it is displayed) */
  requestAnimationFrame(() => { let e = body; while (e && !e.classList.contains('c-sheet')) { e.scrollTop = 0; e = e.parentElement; } if (e) e.scrollTop = 0; });
  if (ownWall) setTimeout(() => { const own = body.querySelector('#b-ownwall'); if (!own) return; own.scrollIntoView({ block: 'start', behavior: R.reducedMotion() ? 'auto' : 'smooth' }); const first = own.querySelector('label.c-btn'); (first || own).focus({ preventScroll: true }); }, 380);
}
function openMore(opener) {
  if (!sheets.more) sheets.more = ui.sheet({ title: t('toolbar.more'), body: '', qa: 'builder.more.sheet' });
  const arBtn = $('#b-ar'); const arState = arBtn.dataset.arState || ''; const arOwn = arState === 'unsupported' || arState === 'failed';
  /* name the entry by what the tap does: real AR → "See it in your room (AR)"; no AR on this device → "See it on your own wall" (opens the Scenes sheet at the photo upload) */
  const arLabel = arOwn ? t('toolbar.arOwnWall') : (arApi && arApi.support && !arApi.support.desktop) ? t('toolbar.arRoom') : (arBtn.querySelector('.lbl').textContent || t('toolbar.ar'));
  sheets.more.setBody(`<div class="b-moremenu">
    <div class="row"><button type="button" class="c-btn c-btn--ghost" data-more="daynight" data-qa="builder.more.daynight">${icon(design.night ? 'sun' : 'moon')}<span>${esc(design.night ? t('toolbar.day') : t('toolbar.night'))}</span></button><button type="button" class="c-btn c-btn--ghost" data-more="rulers" data-qa="builder.more.rulers">${icon('ruler')}<span>${esc(t(rulers === 'cm' ? 'toolbar.rulersNextIn' : rulers === 'in' ? 'toolbar.rulersNextOff' : 'toolbar.rulersNextCm'))}</span></button></div>
    <div class="row"><button type="button" class="c-btn c-btn--ghost" data-more="realsize" aria-pressed="${$('#b-realsize').getAttribute('aria-pressed')}" data-qa="builder.more.realsize">${icon('ruler')}<span>${esc(t('toolbar.realSize'))}</span></button><button type="button" class="c-btn c-btn--ghost" data-more="scenes" data-qa="builder.more.scenes">${icon('image')}<span>${esc(t('toolbar.scenes'))}</span></button></div>
    ${stageApi.scene && stageApi.scene.own ? `<div class="row"><button type="button" class="c-btn c-btn--ghost" data-more="rotate" data-qa="builder.more.rotate">${icon('rotate')}<span>${esc(t('toolbar.wallRotate'))}</span></button><button type="button" class="c-btn c-btn--ghost" data-more="exitwall" data-qa="builder.more.exitwall">${icon('arrow-left')}<span>${esc(t('toolbar.wallBack'))}</span></button></div>` : ''}
    <button type="button" class="c-btn c-btn--ghost" data-more="share" data-qa="builder.more.share">${icon('share')}<span>${esc(t('toolbar.share'))}</span></button>
    <button type="button" class="c-btn c-btn--ghost" data-more="gift" data-qa="builder.more.gift">${icon('gift')}<span>${esc(t('toolbar.gift'))}</span></button>
    <button type="button" class="c-btn c-btn--ghost" data-more="save" data-qa="builder.more.save">${icon('mail')}<span>${esc(t('toolbar.save'))}</span></button>
    ${arBtn.hidden ? '' : `<button type="button" class="c-btn c-btn--ghost" data-more="${arOwn ? 'ownwall' : 'ar'}" data-qa="builder.more.ar">${icon(arOwn ? 'upload' : 'ar-cube')}<span>${esc(arLabel)}</span></button>`}
    <button type="button" class="c-btn c-btn--ghost" data-more="needby" data-qa="builder.more.needby">${icon('calendar')}<span>${esc(t('dock.needBy'))}</span></button>
    <a class="c-btn c-btn--ghost" href="#learn" data-more="learn" data-qa="builder.more.learn">${icon('chevron-down')}<span>${esc(t('dock.more'))}</span></a></div>`);
  if (!sheets.more._wired) { sheets.more._wired = true; sheets.more.body().addEventListener('click', e => {
    const b = e.target.closest('[data-more]'); if (!b) return; const k = b.dataset.more;
    if (k === 'learn') { e.preventDefault(); sheets.more.close(); setTimeout(() => $('#learn').scrollIntoView({ behavior: (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth') }), 400); return; }
    sheets.more.close();
    setTimeout(() => { if (k === 'daynight') $('#b-daynight').click(); else if (k === 'rulers') cycleRulers(); else if (k === 'realsize') $('#b-realsize').click(); else if (k === 'scenes') openScenes(opener); else if (k === 'rotate') stageApi.ownWall.rotate(); else if (k === 'exitwall') $('#b-wall-exit').click(); else if (k === 'share') openShare(); else if (k === 'gift') openShare('gift'); else if (k === 'save') openShare('email'); else if (k === 'ar') arBtn.click(); else if (k === 'ownwall') openScenes(opener, { ownWall: true }); else if (k === 'needby') { jumpTo('review'); setTimeout(() => $('#b-needby-r').focus(), 500); } }, 420);
  }); }
  sheets.more.open(opener);
}
function openShare(tab) {
  const s = share.open({ state: design, stage: stageApi, title: t('share.title'), qa: 'share' });
  if (tab) setTimeout(() => { const b = s.el.querySelector(`[data-qa="share.tab.${tab}"]`); b && b.click(); }, 50);
  return s;
}
async function openQuoteSheet(opener) {
  const p = pricing.price(design); const res = R.resolve(design); const hours = facts.has('mockupHours') ? facts.value('mockupHours') : '';
  const why = p.reason === 'outdoor' ? t('quoteSheet.whyOutdoor') : p.reason === 'too-wide' ? t('quoteSheet.whyWide') : p.reason === 'over-max' ? t('quoteSheet.whyMax') : (p.note || '');
  if (!sheets.quote) sheets.quote = ui.sheet({ title: t('quoteSheet.title'), body: '', modal: true, qa: 'builder.quote.sheet' });
  const colourText = design.colours ? res.lineColours.map((c, i) => `${c.name} (line ${i + 1})`).join(' / ') : res.colour.name;
  const spec = [[t('review.rows.words'), res.words || '—'], [t('review.rows.lettering'), res.font.name], [t('review.rows.colour'), colourText], [t('review.rows.size'), `${res.sizeId === 'custom' ? t('size.custom') : R.sizeOf(res.sizeId).name} · ${res.dims ? fmtDims(res.dims.W, res.dims.H, design.unit) : '—'}`], [t('review.rows.backing'), `${res.backing.name}, ${res.finish.name.toLowerCase()}`], [t('review.rows.hangs'), design.backing === 'stand' ? t('backing.stand') : res.hang.name], [t('review.rows.where'), res.use.name]];
  if (design.icon) spec.splice(4, 0, [t('review.rows.symbol'), t(`words.symbolNames.${design.icon}`)]);
  sheets.quote.setBody(`<div class="b-sheet"><p class="b-sheet__lede">${esc(t('quoteSheet.lede', { hours }))}</p>${why ? `<p class="b-quote__why">${esc(why)}</p>` : ''}
    <div class="b-quote__spec"><span class="b-label">${esc(t('quoteSheet.specTitle'))}${p.indoor != null ? `<span class="sub">${esc(pricing.quoteReason(p))}</span>` : ''}</span><div class="b-quote__preview" data-preview><span class="t-caption">${esc(t('ui.loading', {}, 'One moment'))}</span></div><table class="c-spec c-spec--compact" data-qa="builder.quote.spec">${spec.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table><p class="b-form__note">${esc(t('quoteSheet.attach'))}</p></div>
    <form class="b-form" novalidate data-quote-form data-qa="builder.quote.form">
      <div class="c-field"><label for="b-q-name">${esc(t('quoteSheet.name'))}</label><input class="c-input" id="b-q-name" name="name" autocomplete="name" data-qa="builder.quote.name"></div>
      <div class="c-field"><label for="b-q-email">${esc(t('quoteSheet.email'))}</label><input class="c-input" id="b-q-email" name="email" type="email" inputmode="email" autocomplete="email" data-qa="builder.quote.email"></div>
      <div class="c-field"><label for="b-q-wa">${esc(t('quoteSheet.whatsapp'))}</label><input class="c-input" id="b-q-wa" name="whatsapp" type="tel" inputmode="tel" autocomplete="tel" data-qa="builder.quote.whatsapp"></div>
      <div class="c-field"><label for="b-q-notes">${esc(t('quoteSheet.notes'))}</label><textarea class="c-input" id="b-q-notes" name="notes" rows="2" data-qa="builder.quote.notes"></textarea></div>
      <label class="c-check"><input type="checkbox" name="consent" data-qa="builder.quote.consent"><span>${esc(t('quoteSheet.consent'))}</span></label>
      <button type="submit" class="c-btn c-btn--primary c-btn--lg" data-qa="builder.quote.submit">${esc(t('quoteSheet.submit'))}</button>
    </form><div data-quote-done hidden></div></div>`);
  const body = sheets.quote.body(); let pngFile = null;
  stageApi.toPNG({ transparent: false, includeWall: true }).then(png => { if (!png) return; body.querySelector('[data-preview]').innerHTML = `<img src="${png.dataUrl}" alt="${esc(t('a11y.stage'))}">`; pngFile = new File([png.blob], 'lit-neon-preview.png', { type: 'image/png' }); }).catch(() => {});
  forms.bind(body.querySelector('[data-quote-form]'), { kind: 'quote', qa: 'builder.quote', files: () => (pngFile ? [pngFile] : []), extra: () => ({ reason: p.reason, indoorPrice: p.indoor != null ? p.indoor : '', designLink: router.shareLink(design), spec: JSON.stringify(basket.specFor({ uid: 'quote', kind: 'quote', state: design, qty: 1, meta: {} })) }),
    onSuccess: res => { body.querySelector('[data-quote-form]').hidden = true; const done = body.querySelector('[data-quote-done]'); done.hidden = false; forms.renderSuccess(done, { ref: res.ref, local: res.local, title: t('quoteSheet.successTitle'), body: res.local ? '' : esc(t('quoteSheet.successBody', { hours })), next: [t('quoteSheet.next1'), t('quoteSheet.next2'), t('quoteSheet.next3'), t('quoteSheet.next4')], qa: 'builder.quote' }); basket.add({ kind: 'quote', state: design, meta: { reason: pricing.quoteReason(p) } }); } });
  sheets.quote.open(opener);
}

/* ====================================================================== education block (A20) ====================================================================== */
async function renderLearn() {
  $('#learn-eyebrow').textContent = t('learn.eyebrow'); $('#learn-h').textContent = t('learn.priceH2'); $('#learn-price-lede').textContent = t('learn.priceLede');
  $('#learn-size-h').textContent = t('learn.sizeH2'); $('#learn-size-lede').textContent = t('learn.sizeLede'); $('#learn-size-guide').textContent = t('learn.sizeGuide');
  $('#learn-jacket-h').textContent = t('learn.jacketH2'); $('#learn-jacket-lede').textContent = t('learn.jacketLede'); $('#learn-jacket-guide').textContent = t('learn.jacketGuide');
  $('#learn-compare-h').textContent = t('learn.compareH2'); $('#learn-compare-lede').textContent = t('learn.compareLede');
  $('#learn-faq-h').textContent = t('learn.faqH2'); $('#learn-faq-more').textContent = t('learn.faqMore'); $('#learn-backup .label').textContent = t('learn.backUp');
  /* jackets: two renders of the words, off, on paper */
  $('#learn-jackets').innerHTML = ['white', 'colour'].map(j => `<div class="b-learn__jacket"><div data-learn-jacket="${j}" role="img" aria-label="${esc(t(j === 'white' ? 'colour.jacketWhite' : 'colour.jacketColoured'))}"></div><p>${esc(t(j === 'white' ? 'learn.jacketWhite' : 'learn.jacketColoured'))}</p>${ui.pill('rendered')}</div>`).join('');
  /* compare table (§4.1 §12 rows, confirmed facts only) */
  const lead = facts.has('leadTimeDays') ? (() => { const v = facts.value('leadTimeDays'); return v && typeof v === 'object' ? `${v.min}–${v.max}` : String(v); })() : '';
  const rows = copy.get('learn.compareRows', []); const H = [t('learn.compareOurs'), t('learn.compareTypical')];
  $('#learn-compare').innerHTML = `<table><thead><tr><th scope="col"></th><th scope="col">${esc(H[0])}</th><th scope="col">${esc(H[1])}</th></tr></thead><tbody>${rows.map(r => `<tr><th scope="row">${esc(r[0])}</th><td class="ours" data-h="${esc(H[0])}">${esc(copy.fill(r[1], { lead, years: facts.has('warrantyYears') ? facts.value('warrantyYears') : '' }))}</td><td class="typ" data-h="${esc(H[1])}">${esc(r[2])}</td></tr>`).join('')}</tbody></table>`;
  /* FAQ subset: the six questions tagged builder, answers through the data-file token grammar */
  try { const faq = await (await fetch('/lit-neon-preview/rework/data/faq.json')).json(); const qs = faq.questions.filter(q => (q.tags || []).includes('builder')).slice(0, 6); await R.fontsReady(); await pricing.loadAreas();
    DESIGNS = DESIGNS || await (await fetch('/lit-neon-preview/rework/data/designs.json')).json().catch(() => null);
    const items = qs.map(q => ({ id: q.id, q: q.q, a: fillTokens(q.a), links: q.links || [] }));
    $('#learn-faq').innerHTML = items.map(x => `<details id="${esc(x.id)}" data-qa="builder.learn.faq.item" data-id="${esc(x.id)}"><summary data-qa="builder.learn.faq.summary" data-id="${esc(x.id)}"><span class="label">${esc(x.q)}</span>${icon('chevron-down')}</summary><div class="c-acc__body prose"><p>${esc(x.a)}</p>${x.links.length ? `<p class="links">${x.links.map(l => `<a href="/lit-neon-preview/rework/${esc(l.href)}">${esc(l.label)}</a>`).join('')}</p>` : ''}</div></details>`).join('');
    ui.accordion($('#learn-faq'), { single: false, deepLink: false });
    const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(x => ({ '@type': 'Question', name: x.q, acceptedAnswer: { '@type': 'Answer', text: x.a } })) };
    const s = document.createElement('script'); s.type = 'application/ld+json'; s.textContent = JSON.stringify(ld); document.head.appendChild(s);
  } catch (e) { console.error('builder: faq', e); }
  await R.fontsReady(); paintLearn();
}
function paintLearn() {
  if (learnDone) return;
  const ref = { ...R.DEFAULT_DESIGN, text: 'Open late', font: 'shoreditch', colour: 'warm' };
  const px = (st, size) => { const p = pricing.price({ ...st, size }); return p.kind === 'price' ? gbp(p.payable) : null; };
  const small = px(ref, 's'), large = px(ref, 'l'); const shortP = px({ ...ref, text: 'Hi' }, 'm'), longP = px({ ...ref, text: 'Happy birthday' }, 'm');
  if (!small || !large || !shortP || !longP) return; learnDone = true;
  const rules = pricing.rules().pricing; const cards = copy.get('learn.priceCards', []); const lines = copy.get('learn.priceCardLines', []);
  const vars = { words: ref.text, small, large, short: 'Hi', shortPrice: shortP, long: 'Happy birthday', longPrice: longP, delta: fmtDelta(rules.multicolourDelta), rgbPct: Math.round((rules.rgbMultiplier - 1) * 100) + '%', stand: fmtDelta(rules.backing.stand), mirror: fmtDelta(rules.finish.gold) };
  const nums = [`${small} – ${large}`, `${shortP} – ${longP}`, fmtDelta(rules.multicolourDelta), fmtDelta(rules.finish.gold)];
  $('#learn-price-cards').innerHTML = cards.map((c, i) => `<div class="b-learn__card"><span class="num">${esc(nums[i])}</span><h3>${esc(c)}</h3><p>${esc(copy.fill(lines[i], vars))}</p></div>`).join('');
  /* on phones the four cards are a swipe row: a scrollable region must be keyboard-reachable, and only while it scrolls */
  const cardsEl = $('#learn-price-cards'); cardsEl.setAttribute('role', 'region'); cardsEl.setAttribute('aria-labelledby', 'learn-h');
  const tabbable = () => { if (cardsEl.scrollWidth > cardsEl.clientWidth + 1) cardsEl.tabIndex = 0; else cardsEl.removeAttribute('tabindex'); }; tabbable(); addEventListener('resize', tabbable);
  const bands = pricing.bands(ref); const by = id => bands.find(b => b.size === id) || {};
  const say = (a, b) => `${a.name} to ${b.name} (${a.W}–${b.W} cm wide)`;
  const sl = copy.get('learn.sizeLines', []);
  $('#learn-size-lines').innerHTML = [copy.fill(sl[0], { bed: say(by('m'), by('l')) }), copy.fill(sl[1], { shelf: `${by('s').name} (${by('s').W} cm wide)` }), copy.fill(sl[2], { wall: `${by('xl').name} (${by('xl').W} cm wide)` })].map(x => `<li>${icon('check')}<span>${esc(x)}</span></li>`).join('');
  for (const j of ['white', 'colour']) { const m = R.mountNeon($(`[data-learn-jacket="${j}"]`), { ...design, text: design.text || 'Open late', font: design.font, colour: design.colour === 'rgb' ? 'pink' : design.colour, jacket: j, colours: null }, { lit: true, fitW: .8, fitH: .6 }); m.setLit(false); }
}
/** the data-file token grammar (CONTRACT.md Data §D2) until facts.fill lands: {fact:KEY} {value:KEY} {rule:pricing.PATH|money} {price:from} {exclusions} */
function fillTokens(s) {
  return String(s || '').replace(/\{(fact|value|rule|price|exclusions)(?::([^}|]+))?(?:\|(\w+))?\}/g, (m, kind, arg, filter) => {
    try {
      if (kind === 'fact') return facts.get(arg) || '';
      if (kind === 'value') { const v = facts.value(arg); return v == null ? '' : String(v); }
      if (kind === 'rule') { const [file, ...path] = arg.split('.'); let v = RULES[file]; for (const p of path) v = v == null ? v : v[p]; return v == null ? '' : (filter === 'money' ? gbp(v) : String(v)); }
      if (kind === 'price') { const from = DESIGNS ? pricing.fromPriceAll(DESIGNS.designs) : pricing.fromPrice({ text: 'Open late', font: 'shoreditch', colour: 'warm' }); return from == null ? '' : gbp(from); }
      if (kind === 'exclusions') return pricing.describeExclusions().short;
    } catch { return ''; }
    return '';
  }).replace(/\s{2,}/g, ' ').trim();
}
