/* Lit Neon v2 — ix/size-guide.js (brief §5.3): the real-size guide. A stage (guide frame) on a photoreal plate with a
   scene chip row (Sofa · Bed · Bar · Kitchen), a Day / Dusk / Night control (default dusk), the visitor's words at true
   scale, a five-tick size slider that snaps and animates the sign, a 175 cm person drawn in draft-blue line beside the
   sign, a dashed ghost of the next size up, a readout (size name, W × H cm and in, verdict, payable price) and
   "Design at this size". The chosen size is written to the design store (source 'hero') so the cost calculator and the
   builder follow. Quote states ("Over 2 m") keep a fix button. mount(el, { state, scene }) → { destroy, setState }. */
import { boot, readState, watchState, hostState, writeState, link, onFonts, t, esc, icon, R, stage, pricing, money, ui, roving, $, $$, reduced, stageGeom, letteringSvg, registerFrame, uid } from './_ix.js';

const SCENES = [{ id: 'sofa', scene: 's01-living', object: 'sofa' }, { id: 'bed', scene: 's02-bedroom', object: 'bed' }, { id: 'bar', scene: 's04-homebar', object: 'bar' }, { id: 'kitchen', scene: 's03-kitchen', object: 'units' }];
const SIZES = () => R.OPTIONS.sizes;
const PERSON_CM = 175;
/* a 175 cm person, drafting line, 60 × 175 units (cm) */
const PERSON = `<svg class="ix-size__person" viewBox="0 0 60 180" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">
  <circle cx="30" cy="14" r="11"/><path d="M30 25v8M19 40c0-5 5-8 11-8s11 3 11 8l3 46h-6l-2-28v60h-6V70h-2v48h-6V58l-2 28h-6z"/><path d="M19 40l-5 34M41 40l5 34M21 118l-4 4h8M39 118l4 4h-8"/></g></svg>`;

export function mount(el, opts = {}) {
  const host = hostState(opts);
  el.classList.add('ix', 'ix-size'); el.dataset.qa = 'ix.size';
  let state = null, killed = false, api0 = null, cur = SCENES.find(s => s.scene === (opts.scene || el.dataset.scene)) || SCENES[0];
  let sizeIdx = 1, light = opts.light || el.dataset.light || 'dusk', figure = false, ghost = false, real = false, range = null;
  let offWatch = () => {}, offFonts = () => {}, offFrame = () => {}, ro = null;
  const api = { destroy, setState, stage: () => api0 };
  /* a locked zoom: the frame is computed for Medium (≈ a third of the stage) and kept, so a bigger size really grows
     on the wall instead of the stage re-zooming to it (the brief's AT: Statement ≥ 2 × Small on screen) */
  const REF_FRACTION = .34; let refW = 0, curW = 0;
  const FRAME = registerFrame('ix-size-' + uid('f'), () => { const f = refW && curW ? Math.max(.12, Math.min(.9, REF_FRACTION * curW / refW)) : REF_FRACTION; return [f, f]; });
  const names = SIZES().map(s => s.name);
  const SHORT = { s: 'S', m: 'M', l: 'L', xl: 'XL', xxl: 'XXL' };
  const shortNames = () => SIZES().map(s => SHORT[s.id] || s.name);
  /* tick labels: each sits under its thumb stop (css --i); the full names are used only when the measured labels keep
     ≥ 6 px between neighbours and the first/last stay inside the track, else S/M/L/XL/XXL (re-measured on resize) */
  let ticksShort = false;
  function fitTicks() {
    const ticks = $$(el, '.ix-size__range .ticks span'); if (!ticks.length) return;
    ticks.forEach((s, i) => s.style.setProperty('--i', String(i)));
    const label = (list) => ticks.forEach((s, i) => { if (s.textContent !== list[i]) s.textContent = list[i]; });
    label(names);
    const box = $(el, '.ix-size__range .ticks').getBoundingClientRect(); if (!box.width) return;
    const rects = ticks.map(s => s.getBoundingClientRect());
    let ok = true;
    for (let i = 1; i < rects.length; i++) if (rects[i].left - rects[i - 1].right < 6) { ok = false; break; }
    if (ok && (rects[0].left < box.left - 1 || rects[rects.length - 1].right > box.right + 1)) ok = false;
    ticksShort = !ok; if (ticksShort) label(shortNames());
    $(el, '.ix-size__range').classList.toggle('is-short', ticksShort);
  }

  el.innerHTML = `
    <div class="ix-size__layout">
      <div class="ix-size__stagewrap">
        <div class="ix-size__stage ix__stage" data-light="${esc(light)}"><div class="ix-size__mount"></div><div class="ix-size__overlay" aria-hidden="true"><div class="ix-size__figure" hidden>${PERSON}<span class="ix-size__figlabel"></span></div><div class="ix-size__ghost" hidden></div></div></div>
        <div class="ix-size__bar">
          <div class="ix__chips" role="group" aria-label="${esc(t('size.scenesLabel'))}">${SCENES.map(s => `<button type="button" class="c-chip" aria-pressed="${s === cur}" data-id="${s.id}" data-scene="${s.scene}" data-qa="ix.size.scene">${esc(t('size.scenes.' + s.id, {}, s.id))}</button>`).join('')}</div>
          <div class="c-seg ix-size__light" role="group" aria-label="${esc(t('size.lightLabel'))}">${['day', 'dusk', 'night'].map(l => `<button type="button" aria-pressed="${l === light}" data-light="${l}" data-qa="ix.size.light">${esc(t('size.light.' + l, {}, l))}</button>`).join('')}</div>
          <div class="ix__chips ix-size__toggles">
            <button type="button" class="c-chip" aria-pressed="false" data-qa="ix.size.figure">${icon('eye', 'ic--sm')}${esc(t('size.figure'))}</button>
            <button type="button" class="c-chip" aria-pressed="false" data-qa="ix.size.ghost">${icon('ruler', 'ic--sm')}${esc(t('size.ghost'))}</button>
            <button type="button" class="c-chip" aria-pressed="false" data-qa="ix.size.real">${icon('image', 'ic--sm')}${esc(t('size.wholeRoom'))}</button>
          </div>
        </div>
        <p class="ix__caption" data-caption="rendered">${icon('image')}<span>${esc(t('size.caption'))}</span></p>
      </div>
      <div class="ix-size__panel">
        <div class="c-range ix-size__range"><label class="ix__label" for="">${esc(t('size.sliderLabel'))}</label><input type="range" min="0" max="${names.length - 1}" step="1" value="1" data-qa="ix.size.slider" aria-label="${esc(t('size.sliderLabel'))}"></div>
        <div class="ix__readout ix-size__readout" aria-live="polite" data-qa="ix.size.readout">
          <div class="big"><span class="ix-size__name"></span></div>
          <div class="sub ix-size__dims"></div>
          <div class="sub ix-size__letters"></div>
          <div class="verdict ix-size__verdict"></div>
          <div class="ix-size__price c-price c-price--inline"><span class="amount" data-qa="ix.size.price"></span></div>
          <div class="ix-size__quote" hidden><span class="ix-size__quotetext"></span> <button type="button" class="c-btn c-btn--ghost c-btn--sm" data-qa="ix.size.fix"></button></div>
        </div>
        <div class="ix__cta"><a class="c-btn c-btn--primary" data-qa="ix.size.cta" href="/lit-neon-preview/create.html">${esc(t('size.cta'))}</a></div>
      </div>
    </div>`;
  const stageEl = $(el, '.ix-size__stage'), mountEl = $(el, '.ix-size__mount'), figEl = $(el, '.ix-size__figure'), ghostEl = $(el, '.ix-size__ghost');
  const input = $(el, 'input[type=range]'); $(el, '.ix-size__range label').htmlFor = input.id = 'ixsize-' + Math.random().toString(36).slice(2, 7);
  const q = s => $(el, s);

  const sizeId = () => SIZES()[sizeIdx].id;
  const design = () => Object.assign({}, state, { size: sizeId(), scene: cur.scene, on: true, night: light !== 'day', view: 'room' });
  function sceneMeta() { return stage.getScene(cur.scene); }
  function verdictFor(W) {
    const sc = sceneMeta(); const cm = sc && sc.calib && sc.calib.cm; if (!cm) return '';
    const r = W / cm, object = cur.object;
    return r < .5 ? t('size.verdicts.small', { object }) : r < .75 ? t('size.verdicts.fits', { object }) : r < .9 ? t('size.verdicts.spans', { object }) : t('size.verdicts.fills', { object });
  }
  function paint() {
    const d = design(); const res = R.resolve(d); const p = pricing.price(d, { res });
    const ref = R.resolve(Object.assign({}, d, { size: 'm' })); refW = ref.dims ? ref.dims.W : 0; curW = res.dims ? res.dims.W : 0;
    api0 && api0.setDesign(d);
    stageEl.dataset.light = light;
    $$(el, '[data-qa="ix.size.light"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.light === light)));
    $$(el, '[data-qa="ix.size.scene"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === cur.id)));
    const s = SIZES()[sizeIdx]; q('.ix-size__name').textContent = s.name;
    const dims = res.dims; q('.ix-size__dims').textContent = dims ? `${money.fmtDims(dims.W, dims.H, 'cm')} (${money.fmtDims(dims.W, dims.H, 'in')})` : t('size.wait');
    q('.ix-size__letters').textContent = t('size.letters', { cm: money.fmtLen(s.letterCm, 'cm') });
    const v = q('.ix-size__verdict'), quote = q('.ix-size__quote'), price = q('[data-qa="ix.size.price"]');
    v.classList.remove('is-quote'); quote.hidden = true;
    if (p.kind === 'price') { price.textContent = money.gbp(p.payable); price.dataset.payable = String(p.payable); v.textContent = dims ? verdictFor(dims.W) : ''; }
    else if (p.kind === 'quote') { price.textContent = ui.esc(t('common.quote')); delete price.dataset.payable; v.textContent = p.reason === 'too-wide' ? t('size.quote') : pricing.quoteReason(p); v.classList.add('is-quote');
      const fix = largestPriced(p.reason === 'too-small' ? 'up' : 'down'); if (fix != null) { quote.hidden = false; q('.ix-size__quotetext').textContent = ''; q('[data-qa="ix.size.fix"]').textContent = t('size.quoteFix', { name: SIZES()[fix].name }); q('[data-qa="ix.size.fix"]').dataset.idx = String(fix); } }
    else { price.textContent = '—'; v.textContent = p.kind === 'wait' ? t('size.wait') : ''; }
    input.setAttribute('aria-valuetext', t('size.sliderText', { name: s.name, dims: dims ? money.sayDims(dims.W, dims.H) : '' }));
    q('[data-qa="ix.size.cta"]').href = link(Object.assign({}, state, { size: sizeId(), scene: cur.scene }));
    el.dataset.size = sizeId(); el.dataset.scene = cur.scene;
    overlays();
  }
  function largestPriced(dir) {
    const order = dir === 'up' ? SIZES().map((_, i) => i).filter(i => i > sizeIdx) : SIZES().map((_, i) => i).filter(i => i < sizeIdx).reverse();
    for (const i of order) { const p = pricing.price(Object.assign(design(), { size: SIZES()[i].id })); if (p.kind === 'price') return i; }
    return null;
  }
  /* the person and the ghost are positioned from the stage's frame geometry, after every render */
  function overlays() {
    figEl.hidden = !figure; ghostEl.hidden = !ghost; stageEl.classList.toggle('figure', figure); stageEl.classList.toggle('ghost', ghost);
    if (!api0 || (!figure && !ghost)) return;
    const g = stageGeom(api0); if (!g || !g.ppc) return;
    const res = api0.res; const d = res && res.dims; if (!d) return;
    const box = api0.signBBox(), R0 = api0.el.getBoundingClientRect(); const sx = box.left - R0.left, sy = box.top - R0.top, sw = box.width, sh = box.height;
    if (figure) {
      const fh = PERSON_CM * g.ppc, fw = fh * 60 / 180; const floor = g.toStage(0, g.floorY * g.PH).y; const SW = R0.width;
      let fx = sx - 30 * g.ppc - fw; if (fx < 8) fx = Math.min(SW - fw - 8, sx + sw + 30 * g.ppc);
      Object.assign(figEl.style, { left: fx + 'px', top: (floor - fh) + 'px', width: fw + 'px', height: fh + 'px' });
      figEl.querySelector('.ix-size__figlabel').textContent = money.fmtLen(PERSON_CM, 'cm');
    }
    if (ghost) {
      const nextIdx = Math.min(SIZES().length - 1, sizeIdx + 1); if (nextIdx === sizeIdx) { ghostEl.hidden = true; return; }
      const n = R.resolve(Object.assign(design(), { size: SIZES()[nextIdx].id })); const nd = n.dims; if (!nd) return;
      const w2 = nd.W * g.ppc, h2 = nd.H * g.ppc, m = n.backing.margin * g.ppc; const cx = sx + sw / 2, cy = sy + sh / 2;
      const L = letteringSvg(n, { x: m, y: m, w: w2 - 2 * m, h: h2 - 2 * m }, { attrs: 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 5" vector-effect="non-scaling-stroke"' });
      ghostEl.innerHTML = `<svg viewBox="0 0 ${w2.toFixed(1)} ${h2.toFixed(1)}" style="width:${w2}px;height:${h2}px" aria-hidden="true"><rect x=".75" y=".75" width="${(w2 - 1.5).toFixed(1)}" height="${(h2 - 1.5).toFixed(1)}" rx="${(m * .6).toFixed(1)}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="3 5" vector-effect="non-scaling-stroke"/>${L.html}</svg><span class="ix-size__ghostlabel">${esc(t('size.ghostLabel'))}: ${esc(SIZES()[nextIdx].name)} · ${esc(money.fmtDims(nd.W, nd.H, 'cm'))}</span>`;
      Object.assign(ghostEl.style, { left: (cx - w2 / 2) + 'px', top: (cy - h2 / 2) + 'px', width: w2 + 'px', height: h2 + 'px' });
    }
  }
  /* the person only fits in the whole-room view (175 cm beside a 67 cm sign cannot fit a wall crop), so the figure toggle zooms out */
  function applyFrame() { if (!api0) return; const wide = real || figure; api0.setFrame(wide ? 'real' : FRAME); $(el, '[data-qa="ix.size.real"]').setAttribute('aria-pressed', String(wide)); el.dataset.frame = wide ? 'real' : 'locked'; }
  function setSize(i, write = true) { sizeIdx = Math.max(0, Math.min(SIZES().length - 1, i)); input.value = String(sizeIdx); range && range.paint(); paint(); if (write) writeState({ size: sizeId() }, 'hero'); }

  /* events */
  el.addEventListener('click', e => {
    const sc = e.target.closest('[data-qa="ix.size.scene"]'); if (sc) { cur = SCENES.find(s => s.id === sc.dataset.id); api0 && api0.setScene(cur.scene); paint(); return; }
    const lt = e.target.closest('[data-qa="ix.size.light"]'); if (lt) { light = lt.dataset.light; paint(); if (light !== 'day' && !reduced()) api0 && api0.strike(); return; }
    const fg = e.target.closest('[data-qa="ix.size.figure"]'); if (fg) { figure = !figure; fg.setAttribute('aria-pressed', String(figure)); applyFrame(); overlays(); return; }
    const gh = e.target.closest('[data-qa="ix.size.ghost"]'); if (gh) { ghost = !ghost; gh.setAttribute('aria-pressed', String(ghost)); overlays(); return; }
    const rl = e.target.closest('[data-qa="ix.size.real"]'); if (rl) { real = !real; rl.setAttribute('aria-pressed', String(real)); applyFrame(); return; }
    const fx = e.target.closest('[data-qa="ix.size.fix"]'); if (fx && fx.dataset.idx) { setSize(+fx.dataset.idx); return; }
  });
  roving($(el, '.ix-size__light'), 'button', { orientation: 'horizontal' });

  function setState(partial = {}) { if (killed) return; state = readState(el, { state: host.set(partial) }); const i = SIZES().findIndex(s => s.id === state.size); if (i >= 0) sizeIdx = i; input.value = String(sizeIdx); range && range.paint(); paint(); }
  function destroy() { killed = true; offWatch(); offFonts(); offFrame(); ro && ro.disconnect(); api0 && api0.destroy(); el.innerHTML = ''; }

  boot().then(() => {
    if (killed) return;
    state = readState(el, { state: host.get() }); const i = SIZES().findIndex(s => s.id === state.size); sizeIdx = i >= 0 ? i : 1; input.value = String(sizeIdx);
    range = ui.range($(el, '.ix-size__range'), { ticks: names, text: v => { const s = SIZES()[v]; const d = R.resolve(Object.assign(design(), { size: s.id })).dims; return t('size.sliderText', { name: s.name, dims: d ? money.sayDims(d.W, d.H) : '' }); }, onInput: v => setSize(v, false), onChange: v => setSize(v, true) });
    api0 = stage.mount(mountEl, { frame: FRAME, scene: cur.scene, design: design(), interactive: true, pill: true, rulers: true, qa: 'ix.size.stage' });
    offFrame = api0.on('frame', () => overlays());
    paint(); fitTicks();
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => fitTicks()); ro.observe($(el, '.ix-size__range')); }
    offWatch = watchState(host, () => { const s = readState(el, { state: host.get() }); if (s.text !== state.text || s.font !== state.font || s.colour !== state.colour || s.size !== state.size) { state = s; const j = SIZES().findIndex(x => x.id === s.size); if (j >= 0 && j !== sizeIdx) { sizeIdx = j; input.value = String(j); range.paint(); } paint(); } });
    offFonts = onFonts(() => { paint(); fitTicks(); });
  });
  return api;
}
export default { mount };
