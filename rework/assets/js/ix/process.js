/* Lit Neon v2 — ix/process.js (brief §5.12): how your sign is made, illustrated. Five chapters on paper, each one of
   IMG's drafting SVGs (img/process/0N-*.svg) inlined and driven by the visitor's own design: 1 Drawn (the proof
   draws itself: lettering, dimension lines re-fitted to it, the title block filled with real values) → 2 Bent (a tube
   path draws along the visitor's words) → 3 Mounted (acrylic contour, standoffs drop in) → 4 Tested (the sign strikes
   on, the bench meter reads watts when wattsPerMetre is confirmed) → 5 Boxed (items slide into the box). Chapter tabs
   with ticks, autoplay with pause, pause off-screen, reduced motion = final frames. Each chapter carries confirmed facts
   only; fact slots fill from the registry. No <video> unless a workshop clip is confirmed. mount(el) → { destroy, setState }. */
import { boot, readState, watchState, hostState, onFonts, t, esc, icon, R, facts, clock, money, h, $, $$, reduced, onView, inlineSvg, uid, letteringSvg, pauseButton, reviewMode } from './_ix.js';

const CHAPTERS = [
  { id: 'drawn', svg: '/lit-neon-preview/rework/assets/img/process/01-drawn.svg' },
  { id: 'bent', svg: '/lit-neon-preview/rework/assets/img/process/02-bent.svg' },
  { id: 'mounted', svg: '/lit-neon-preview/rework/assets/img/process/03-mounted.svg' },
  { id: 'tested', svg: '/lit-neon-preview/rework/assets/img/process/04-tested.svg' },
  { id: 'boxed', svg: '/lit-neon-preview/rework/assets/img/process/05-boxed.svg' }
];
const EVERY = 4200;
/* where the visitor's lettering goes in each drawing (SVG units, 480 × 360) */
/* stroke widths as [fraction of the lettering em, min, max] (viewBox units): the tube, the acrylic cut-line margin, the bench glow */
const TUBE = [.06, 1.3, 3.4], ACRYLIC = [.26, 6, 14], GLOW = [.3, 6, 16];
const BOX = { drawn: { x: 60, y: 96, w: 220, h: 150 }, bent: { x: 112, y: 86, w: 262, h: 192 }, mounted: { x: 70, y: 96, w: 220, h: 150 }, tested: { x: 104, y: 104, w: 176, h: 136 }, boxed: { x: 18, y: 26, w: 206, h: 196 } };

export function mount(el, opts = {}) {
  const host = hostState(opts);
  el.classList.add('ix', 'ix-process', 'paper'); el.dataset.qa = 'ix.process'; el.dataset.playing = 'true';
  const id = uid('pr'); let state = null, killed = false, cur = 0, playing = true, inView = false, timer = 0; const svgs = {};
  let offWatch = () => {}, offFonts = () => {}, offView = () => {};
  const api = { destroy, setState };

  el.innerHTML = `
    <div class="ix-process__head"><span class="c-pill c-pill--illustration">${esc(t('process.label'))}</span><span class="ix-process__pause"></span></div>
    <div class="ix-process__layout">
      <ol class="ix-process__tabs" role="tablist" aria-orientation="vertical" aria-label="${esc(t('process.h2'))}">
        ${CHAPTERS.map((c, i) => `<li role="presentation"><button type="button" role="tab" id="${id}-t${i}" aria-controls="${id}-p" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-i="${i}" data-qa="ix.process.tab"><span class="dot"><span class="n">${i + 1}</span>${icon('check', 'tick')}</span><span class="lbl"><b>${esc(t('process.chapters.' + c.id))}</b><span>${esc(t('process.lines.' + c.id))}</span></span></button></li>`).join('')}
      </ol>
      <div class="ix-process__panel" role="tabpanel" id="${id}-p" aria-labelledby="${id}-t0" aria-live="polite">
        <div class="ix-process__art" data-qa="ix.process.art"></div>
        <div class="ix-process__photo" hidden></div>
        <div class="ix-process__cap"><p class="ix-process__chapter"><b></b> <span></span></p><ul class="ix-process__facts"></ul></div>
      </div>
    </div>`;
  const art = $(el, '.ix-process__art'), tabs = $(el, '.ix-process__tabs');
  const pb = pauseButton({ qa: 'ix.process.pause', label: t('process.pause'), playLabel: t('process.play'), onChange: on => { playing = on; sync(); } });
  $(el, '.ix-process__pause').appendChild(pb.el);

  const res = () => R.resolve(Object.assign({}, state));
  const watts = r => { if (!facts.has('wattsPerMetre')) return null; const w = +facts.value('wattsPerMetre'); return Number.isFinite(w) ? Math.round(R.flexMetres(r) * w) : null; };
  const q = (svg, sel) => svg.querySelector(`#${id}-${CHAPTERS[cur].id}-${sel}`);

  /* fill one chapter's svg from the design */
  function fill(ch, svg) {
    const r = res(); const d = r.dims; const p = `#${id}-${ch.id}-`; const g = sel => svg.querySelector(p + sel);
    const strokeAttrs = (cls, extra = '') => `class="${cls}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${extra}`;
    if (ch.id === 'drawn') {
      const L = letteringSvg(r, BOX.drawn, { attrs: strokeAttrs('ink', 'stroke-width="1.6"'), cls: 'ix-process__lettering reveal' });
      const slot = g('slot-sign'); if (slot) slot.innerHTML = L.html;
      const b = L.bbox; const x0 = b.x.toFixed(1), x1 = (b.x + b.w).toFixed(1), y0 = b.y.toFixed(1), y1 = (b.y + b.h).toFixed(1);
      const dw = g('dim-w'); if (dw) { const ps = dw.querySelectorAll('path'); ps[0] && ps[0].setAttribute('d', `M${x0} ${(b.y - 10).toFixed(1)}V66M${x1} ${(b.y - 10).toFixed(1)}V66`); ps[1] && ps[1].setAttribute('d', `M${x0} 76H${x1}`); ps[2] && ps[2].setAttribute('d', `M${x0} 76l9-4v8ZM${x1} 76l-9-4v8Z`); const tx = g('slot-dim-w'); if (tx) { tx.setAttribute('x', ((b.x + b.x + b.w) / 2).toFixed(1)); tx.textContent = d ? money.fmtLen(d.W, 'cm') : ''; } }
      const dh = g('dim-h'); if (dh) { const ps = dh.querySelectorAll('path'); const rx = (b.x + b.w + 10).toFixed(1), rx2 = (b.x + b.w + 46).toFixed(1), rx3 = (b.x + b.w + 36).toFixed(1); ps[0] && ps[0].setAttribute('d', `M${rx} ${y0}H${rx2}M${rx} ${y1}H${rx2}`); ps[1] && ps[1].setAttribute('d', `M${rx3} ${y0}V${y1}`); ps[2] && ps[2].setAttribute('d', `M${rx3} ${y0}l-4 9h8ZM${rx3} ${y1}l-4-9h8Z`); const tx = g('slot-dim-h'); if (tx) { tx.setAttribute('x', (b.x + b.w + 46).toFixed(1)); tx.setAttribute('y', ((b.y + b.y + b.h) / 2 + 4).toFixed(1)); tx.textContent = d ? money.fmtLen(d.H, 'cm') : ''; } }
      const set = (sel, v) => { const e = g(sel); if (e) e.textContent = v; };
      set('slot-tb-title', (r.words || t('common.yourWords')).slice(0, 22)); set('slot-tb-size', d ? money.fmtDims(d.W, d.H, 'cm') : ''); set('slot-tb-led', `${money.fmtMetres(R.flexMetres(r))} LED`);
      const w = watts(r); set('slot-tb-power', w != null ? t('process.watts', { w }) : ''); set('slot-tb-date', clock.format(clock.now())); set('slot-tb-by', t('process.tbBy'));
    }
    if (ch.id === 'bent') {
      const L = letteringSvg(r, BOX.bent, { attrs: strokeAttrs('tube draw-text'), sw: TUBE, cls: 'ix-process__lettering' });
      const slot = g('slot-tube'); if (slot) slot.innerHTML = L.html;
      const dash = svg.querySelector('.dash-template') || svg.querySelector('.dash'); if (dash) { const D = letteringSvg(r, BOX.bent, { attrs: strokeAttrs('dash', 'stroke-width="1.2"'), cls: 'dash-template' }); dash.outerHTML = D.html; }
    }
    if (ch.id === 'mounted') {
      const A = letteringSvg(r, BOX.mounted, { attrs: strokeAttrs('acrylic-cut', 'stroke="currentColor"'), sw: ACRYLIC, cls: 'ix-process__acrylic' });
      const acr = svg.querySelector('.ix-process__acrylic') || svg.querySelector('.acrylic'); if (acr) acr.outerHTML = A.html;
      const L = letteringSvg(r, BOX.mounted, { attrs: strokeAttrs('tube'), sw: TUBE, cls: 'ix-process__lettering' });
      const slot = g('slot-tube-mounted'); if (slot) slot.innerHTML = L.html;
      const b = L.bbox; const drops = svg.querySelectorAll('.drop'); const pts = [[b.x + b.w * .12, b.y + b.h * .18], [b.x + b.w * .88, b.y + b.h * .18], [b.x + b.w * .2, b.y + b.h * .86], [b.x + b.w * .8, b.y + b.h * .86]];
      drops.forEach((dr, i) => { if (pts[i]) { dr.setAttribute('transform', `translate(${pts[i][0].toFixed(1)} ${pts[i][1].toFixed(1)})`); dr.style.setProperty('--i', i); } });
    }
    if (ch.id === 'tested') {
      const L = letteringSvg(r, BOX.tested, { attrs: strokeAttrs('tube'), sw: TUBE, cls: 'ix-process__lettering tube-lit' });
      const G = letteringSvg(r, BOX.tested, { attrs: strokeAttrs('glowline'), sw: GLOW, cls: 'ix-process__glow' });
      const slot = g('slot-tube-lit'); if (slot) slot.innerHTML = L.html; const gl = g('slot-glow'); if (gl) gl.innerHTML = G.html;
      const acr = svg.querySelector('.ix-process__acrylic') || svg.querySelector('.acrylic'); if (acr) { const A = letteringSvg(r, BOX.tested, { attrs: strokeAttrs('acrylic-cut', 'stroke="currentColor"'), sw: ACRYLIC, cls: 'ix-process__acrylic' }); acr.outerHTML = A.html; }
      const w = watts(r); const tw = g('slot-watts'); if (tw) tw.textContent = w != null ? t('process.watts', { w }) : (reviewMode() ? '?' : '');
      const th = g('slot-hours'); if (th) th.textContent = facts.has('benchTestHours') ? `${facts.value('benchTestHours')} h` : '';
    }
    if (ch.id === 'boxed') {
      const item = g('item-sign'); if (item) { const L = letteringSvg(r, BOX.boxed, { attrs: strokeAttrs('tube'), sw: TUBE, cls: 'ix-process__lettering' }); const A = letteringSvg(r, BOX.boxed, { attrs: strokeAttrs('acrylic-cut', 'stroke="currentColor"'), sw: ACRYLIC, cls: 'ix-process__acrylic' }); item.innerHTML = A.html + L.html; }
      svg.querySelectorAll('.slide').forEach(s => s.style.setProperty('--i', (+s.dataset.order || 1) - 1));
    }
  }
  function factsFor(ch) {
    const out = [];
    const base = { drawn: [[t('process.facts.drawn.0'), null]], bent: [[facts.has('madeInUK') ? t('process.facts.bent.0') : null, 'madeInUK'], [facts.has('workshopTown') ? t('process.factSlots.town', { value: facts.value('workshopTown') }) : null, null]], mounted: [[facts.has('acrylicThicknessMm') ? t('process.factSlots.acrylic', { value: `${facts.value('acrylicThicknessMm')} mm` }) : null, 'acrylicThicknessMm']], tested: [[facts.has('warrantyYears') ? facts.get('warrantyYears') : null, 'warrantyYears'], [facts.has('benchTestHours') ? t('process.factSlots.bench', { value: `${facts.value('benchTestHours')} hours` }) : null, 'benchTestHours']], boxed: [[facts.has('ukPlug') ? t('process.facts.boxed.0') : null, 'ukPlug'], [facts.has('dimmerRemoteIncluded') ? t('process.facts.boxed.1') : null, 'dimmerRemoteIncluded'], [facts.has('leadTimeDays') ? t('process.factSlots.lead', facts.value('leadTimeDays') || {}) : null, 'leadTimeDays']] }[ch.id] || [];
    for (const [text, key] of base) { if (text) out.push(`<li>${icon('check', 'ic--sm')}${esc(text)}</li>`); else if (key && reviewMode()) out.push(`<li class="is-review">${facts.chip(key)}</li>`); }
    return out.join('');
  }
  async function show(i, { restart = true } = {}) {
    cur = Math.max(0, Math.min(CHAPTERS.length - 1, i)); const ch = CHAPTERS[cur];
    $$(tabs, '[role=tab]').forEach(b => { const on = +b.dataset.i === cur; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; b.parentElement.classList.toggle('is-done', +b.dataset.i < cur); b.parentElement.classList.toggle('is-current', on); });
    $(el, '.ix-process__panel').setAttribute('aria-labelledby', `${id}-t${cur}`); el.dataset.chapter = ch.id;
    if (!svgs[ch.id]) { const s = await inlineSvg(ch.svg, `${id}-${ch.id}`); if (!s) return; s.classList.add('ix-process__svg'); svgs[ch.id] = s; }
    if (killed) return;
    const svg = svgs[ch.id]; fill(ch, svg);
    art.innerHTML = ''; art.appendChild(svg); svg.classList.remove('is-active'); void svg.getBoundingClientRect(); if (restart && !reduced()) svg.classList.add('is-active'); else svg.classList.add('is-active', 'is-final');
    $(el, '.ix-process__chapter b').textContent = t('process.chapterOf', { n: cur + 1, total: CHAPTERS.length }) + ' · ' + t('process.chapters.' + ch.id);
    $(el, '.ix-process__chapter span').textContent = t('process.lines.' + ch.id);
    $(el, '.ix-process__facts').innerHTML = factsFor(ch);
    photo(ch);
  }
  function photo(ch) {
    const box = $(el, '.ix-process__photo'); const list = facts.has('photos.workshop') ? facts.value('photos.workshop') : null;
    const src = Array.isArray(list) ? list[cur] : null;
    box.hidden = !src; box.innerHTML = src ? `<img data-photo src="${esc(src)}" alt="${esc(t('process.chapters.' + ch.id))}" loading="lazy">` : '';
  }
  function sync() { const run = playing && inView && !reduced() && !killed; el.dataset.playing = String(playing); clearInterval(timer); timer = 0; if (run) timer = setInterval(() => show((cur + 1) % CHAPTERS.length), EVERY); }
  tabs.addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) { show(+b.dataset.i); } });
  tabs.addEventListener('keydown', e => { const list = $$(tabs, '[role=tab]'); const i = list.findIndex(b => b === document.activeElement); if (i < 0) return; let n = null; if (e.key === 'ArrowDown' || e.key === 'ArrowRight') n = (i + 1) % list.length; else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') n = (i - 1 + list.length) % list.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = list.length - 1; if (n == null) return; e.preventDefault(); list[n].focus(); show(n); });
  function setState(partial = {}) { if (killed) return; state = readState(el, { state: host.set(partial) }); show(cur, { restart: false }); }
  function destroy() { killed = true; sync(); offWatch(); offFonts(); offView(); el.innerHTML = ''; }

  boot().then(async () => {
    if (killed) return;
    state = readState(el, { state: host.get() });
    await Promise.all(CHAPTERS.map(c => inlineSvg(c.svg, `${id}-${c.id}`).then(s => { if (s) { s.classList.add('ix-process__svg'); svgs[c.id] = s; } })));
    await show(0);
    offWatch = watchState(host, () => { const s = readState(el, { state: host.get() }); if (s.text !== state.text || s.font !== state.font || s.size !== state.size || s.colour !== state.colour) { state = s; show(cur, { restart: false }); } });
    offFonts = onFonts(() => show(cur, { restart: false }));
    offView = onView(el, on => { inView = on; sync(); }, { threshold: .25 });
    sync();
  });
  return api;
}
export default { mount };
