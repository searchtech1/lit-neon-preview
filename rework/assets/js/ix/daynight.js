/* Lit Neon v2 — ix/daynight.js (brief §5.7): the day vs night slider. Two stages of the same scene — the day plate with
   the sign off (honest white tube) and the night plate with the sign lit and the room relit — under one compare
   control: pointer drag, touch (touch-action: pan-y), keyboard (role=slider, arrows 5%, PageUp/Down 10%, Home/End),
   click-to-jump, a one-time auto-sweep 15 → 85% when the section enters view (skipped under reduced motion), scene
   tabs (Bedroom · Home bar · Wedding) with the visitor's words, a portrait plate on phones, and "See it in your room".
   mount(el, { state, scene, scenes }) → { destroy, setState }. data-qa: ix.daynight.* */
import { boot, readState, watchState, hostState, link, onFonts, t, esc, icon, stage, roving, $, $$, reduced, onView, registerFrame } from './_ix.js';

/* a zoomed-out frame so the room reads (the builder's `room` frame crops to the wall): sign ≈ a third of the stage */
registerFrame('ix-scene', () => [.30, .38]);
const DEFAULT_SCENES = [{ id: 'bedroom', scene: 's02-bedroom' }, { id: 'bar', scene: 's04-homebar' }, { id: 'wedding', scene: 's06-wedding' }];

export function mount(el, opts = {}) {
  const host = hostState(opts);
  el.classList.add('ix', 'ix-daynight'); el.dataset.qa = 'ix.daynight';
  const SCENES = opts.scenes || DEFAULT_SCENES;
  let state = null, killed = false, pos = 50, cur = SCENES.find(s => s.scene === (opts.scene || el.dataset.scene)) || SCENES[0];
  const stages = {}; let offWatch = () => {}, offFonts = () => {}, offView = () => {}, raf = 0, swept = false, touched = false;
  const api = { destroy, setState };

  el.innerHTML = `
    <div class="ix-daynight__bar">
      <div class="c-tabs c-tabs--seg ix-daynight__tabs" role="tablist" aria-label="${esc(t('daynight.tabsLabel'))}">
        ${SCENES.map(s => `<button type="button" role="tab" aria-selected="${s === cur}" tabindex="${s === cur ? 0 : -1}" data-id="${s.id}" data-scene="${s.scene}" data-qa="ix.daynight.tab">${esc(t('daynight.tabs.' + s.id, {}, s.id))}</button>`).join('')}
      </div>
    </div>
    <div class="c-compare ix-daynight__compare" style="--pos:50%" data-dragging="false" data-swept="false" data-qa="ix.daynight.compare">
      <div class="a"><div class="ix-daynight__stage"></div></div>
      <div class="b"><div class="ix-daynight__stage"></div></div>
      <span class="ix-daynight__tag ix-daynight__tag--day">${esc(t('daynight.day'))}</span><span class="ix-daynight__tag ix-daynight__tag--night">${esc(t('daynight.night'))}</span>
      <div class="divider"></div>
      <div class="thumb" role="slider" tabindex="0" aria-label="${esc(t('daynight.sliderLabel'))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" data-qa="ix.daynight.handle">${icon('drag')}</div>
    </div>
    <div class="ix__row ix__row--between ix-daynight__foot">
      <p class="ix__caption" data-caption="rendered">${icon('image')}<span>${esc(t('daynight.caption'))}</span></p>
      <a class="c-btn c-btn--primary" data-qa="ix.daynight.cta" href="/lit-neon-preview/rework/create.html">${esc(t('daynight.cta'))}</a>
    </div>`;
  const root = $(el, '.ix-daynight__compare'), thumb = $(el, '.thumb'), tabs = $(el, '[role=tablist]'), cta = $(el, '[data-qa="ix.daynight.cta"]');

  function set(p) { pos = Math.max(0, Math.min(100, p)); root.style.setProperty('--pos', pos + '%'); thumb.setAttribute('aria-valuenow', String(Math.round(pos))); thumb.setAttribute('aria-valuetext', t('daynight.sliderText', { pct: Math.round(pos) + '%' }, '{pct} night')); }
  function fromEvent(e) { const r = root.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); }
  let dragging = false;
  root.addEventListener('pointerdown', e => { if (e.target.closest('[role=tab]')) return; if (e.button !== 0 && e.pointerType === 'mouse') return; touched = true; cancelSweep(); dragging = true; root.dataset.dragging = 'true'; root.setPointerCapture(e.pointerId); fromEvent(e); thumb.focus({ preventScroll: true }); });
  root.addEventListener('pointermove', e => { if (dragging) fromEvent(e); });
  const up = () => { if (!dragging) return; dragging = false; root.dataset.dragging = 'false'; };
  root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
  thumb.addEventListener('keydown', e => { if (/^(Arrow|Page|Home|End)/.test(e.key)) touched = true; let d = 0; const k = e.key; if (k === 'ArrowLeft' || k === 'ArrowDown') d = -5; else if (k === 'ArrowRight' || k === 'ArrowUp') d = 5; else if (k === 'PageDown') d = -10; else if (k === 'PageUp') d = 10; else if (k === 'Home') { e.preventDefault(); cancelSweep(); return set(0); } else if (k === 'End') { e.preventDefault(); cancelSweep(); return set(100); } if (d) { e.preventDefault(); cancelSweep(); set(pos + d); } });

  /* one-time auto-sweep 15 → 85 → 55 when first in view */
  function cancelSweep() { if (raf) { cancelAnimationFrame(raf); raf = 0; root.dataset.swept = 'true'; } }
  function sweep() {
    if (swept) return; swept = true;
    /* the visitor got there first (a drag or a key before the in-view callback): never animate over their position */
    if (touched) { root.dataset.swept = 'true'; return; }
    if (reduced()) { root.dataset.swept = 'skipped'; return; }
    const t0 = performance.now(), D1 = 1500, D2 = 700; set(15);
    const ease = x => 1 - Math.pow(1 - x, 3);
    const frame = now => { const dt = now - t0; if (dt < D1) set(15 + 70 * ease(dt / D1)); else if (dt < D1 + D2) set(85 - 30 * ease((dt - D1) / D2)); else { set(55); raf = 0; root.dataset.swept = 'true'; return; } raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame);
  }

  /* scene tabs */
  function pick(btn) { $$(tabs, '[role=tab]').forEach(b => { const on = b === btn; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }); cur = SCENES.find(s => s.id === btn.dataset.id) || SCENES[0]; el.dataset.scene = cur.scene; Object.values(stages).forEach(s => s.setScene(cur.scene)); paint(); }
  tabs.addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) pick(b); });
  roving(tabs, '[role=tab]', { onMove: pick });

  const design = on => Object.assign({}, state, { scene: cur.scene, on, night: on, view: 'room' });
  function paint() { if (stages.day) { stages.day.setDesign(design(false)); stages.night.setDesign(design(true)); } cta.href = link(Object.assign({}, state, { scene: cur.scene })); }
  function setState(partial = {}) { if (killed) return; state = readState(el, { state: host.set(partial) }); paint(); }
  function destroy() { killed = true; cancelSweep(); offWatch(); offFonts(); offView(); Object.values(stages).forEach(s => s.destroy()); el.innerHTML = ''; }

  boot().then(() => {
    if (killed) return;
    state = readState(el, { state: host.get() }); el.dataset.scene = cur.scene;
    stages.day = stage.mount($(el, '.a .ix-daynight__stage'), { frame: 'ix-scene', scene: cur.scene, design: design(false), interactive: false, pill: true, rulers: false, qa: 'ix.daynight.day', relight: false });
    stages.night = stage.mount($(el, '.b .ix-daynight__stage'), { frame: 'ix-scene', scene: cur.scene, design: design(true), interactive: false, pill: false, rulers: false, qa: 'ix.daynight.night' });
    paint(); set(50);
    offWatch = watchState(host, () => { const s = readState(el, { state: host.get() }); if (s.text !== state.text || s.font !== state.font || s.colour !== state.colour || s.size !== state.size) { state = s; paint(); } });
    offFonts = onFonts(paint);
    offView = onView(el, on => { if (on) sweep(); }, { threshold: .35, once: true });
  });
  return api;
}
export default { mount };
