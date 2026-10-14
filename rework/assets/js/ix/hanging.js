/* Lit Neon v2 — ix/hanging.js (brief §5.5): four ways to hang. Tabs (Wall screws & standoffs · Hanging chains ·
   Adhesive strips · Table stand); the stage on s01-living shows the visitor's sign mounted that way (standoff caps,
   chains from two hooks to the wall top, flush strips, or the stand backing on the sofa top); a step-by-step install
   sequence in IMG's drafting SVGs (zoomed to one step, the `draw` paths animating, scrubbable, play/pause, a static
   strip under reduced motion); "Best for" tags; "In the kit" and timing lines only from confirmed facts; a two-question
   helper that recommends a method; and "Choose this in the designer". mount(el) → { destroy, setState }. */
import { boot, readState, watchState, hostState, link, onFonts, t, esc, icon, stage, facts, ui, roving, h, $, $$, reduced, onView, inlineSvg, uid, registerFrame, reviewMode } from './_ix.js';

const METHODS = [
  { id: 'screws', svg: '/lit-neon-preview/rework/assets/img/hanging/screws.svg', steps: 8, hang: 'screws', icon: 'standoff' },
  { id: 'chains', svg: '/lit-neon-preview/rework/assets/img/hanging/chains.svg', steps: 4, hang: 'chains', icon: 'chain' },
  { id: 'strips', svg: '/lit-neon-preview/rework/assets/img/hanging/strips.svg', steps: 4, hang: 'strips', icon: 'strip' },
  { id: 'stand', svg: '/lit-neon-preview/rework/assets/img/hanging/stand.svg', steps: 3, hang: 'screws', icon: 'stand' }
];
const STEP_W = 216, STEP_PAD = 8, EVERY = 1800;
registerFrame('ix-hang', () => [.36, .44]);

export function mount(el, opts = {}) {
  const host = hostState(opts);
  el.classList.add('ix', 'ix-hang'); el.dataset.qa = 'ix.hang'; el.dataset.playing = 'true';
  const id = uid('hg'); let state = null, killed = false, cur = METHODS.find(m => m.id === (opts.method || el.dataset.method)) || METHODS[0];
  let step = 1, playing = true, inView = false, timer = 0, api0 = null, mountEl = null, range = null, svgs = {}, helper = { drill: null, size: null };
  let offWatch = () => {}, offFonts = () => {}, offView = () => {}, offFrame = () => {};
  const api = { destroy, setState, stage: () => api0 };

  el.innerHTML = `
    <div class="c-tabs ix-hang__tabs" role="tablist" aria-label="${esc(t('hanging.h2'))}">
      ${METHODS.map(m => `<button type="button" role="tab" id="${id}-t-${m.id}" aria-controls="${id}-p" aria-selected="${m === cur}" tabindex="${m === cur ? 0 : -1}" data-id="${m.id}" data-qa="ix.hang.tab">${icon(m.icon)}<span>${esc(t('hanging.tabs.' + m.id))}</span></button>`).join('')}
    </div>
    <div class="ix-hang__panel" role="tabpanel" id="${id}-p" aria-labelledby="${id}-t-${cur.id}">
      <div class="ix-hang__stagecol">
        <div class="ix-hang__stage ix__stage"><div class="ix-hang__mount"></div></div>
        <p class="ix__caption" data-caption="rendered">${icon('image')}<span>${esc(t('hanging.caption'))}</span></p>
      </div>
      <div class="ix-hang__info">
        <div class="ix-hang__seq">
          <div class="ix-hang__strip paper" data-qa="ix.hang.strip"><span class="c-pill c-pill--illustration ix__pill">${esc(t('hanging.illustration'))}</span></div>
          <div class="ix-hang__seqbar">
            <p class="ix-hang__stepcap" aria-live="polite"><b class="ix-hang__stepn"></b> <span class="ix-hang__steptxt"></span></p>
            <div class="c-range ix-hang__range"><input type="range" min="1" max="${cur.steps}" step="1" value="1" aria-label="${esc(t('hanging.stepOf', { n: 1, total: cur.steps }))}" data-qa="ix.hang.step"></div>
            <button type="button" class="c-btn c-btn--ghost c-btn--sm ix-hang__play" aria-pressed="false" data-qa="ix.hang.play">${icon('pause')}<span class="label">${esc(t('hanging.pause'))}</span></button>
          </div>
        </div>
        <dl class="ix-hang__facts">
          <div><dt>${esc(t('hanging.bestFor'))}</dt><dd class="ix-hang__best"></dd></div>
          <div class="ix-hang__kit" hidden><dt>${esc(t('hanging.kit'))}</dt><dd></dd></div>
          <div class="ix-hang__time" hidden><dt>${icon('clock', 'ic--sm')}</dt><dd></dd></div>
        </dl>
        <div class="ix__cta"><a class="c-btn c-btn--primary" data-qa="ix.hang.cta" href="/lit-neon-preview/rework/create.html">${esc(t('hanging.cta'))}</a></div>
      </div>
    </div>
    <div class="ix-hang__helper">
      <p class="ix-hang__helpertitle">${esc(t('hanging.helper.title'))}</p>
      <div class="ix-hang__q"><span>${esc(t('hanging.helper.drill'))}</span><div class="ix__chips" role="group" aria-label="${esc(t('hanging.helper.drill'))}"><button type="button" class="c-chip" aria-pressed="false" data-q="drill" data-v="yes" data-qa="ix.hang.helper.drill">${esc(t('hanging.helper.yes'))}</button><button type="button" class="c-chip" aria-pressed="false" data-q="drill" data-v="no" data-qa="ix.hang.helper.drill">${esc(t('hanging.helper.no'))}</button></div></div>
      <div class="ix-hang__q"><span>${esc(t('hanging.helper.big'))}</span><div class="ix__chips" role="group" aria-label="${esc(t('hanging.helper.big'))}"><button type="button" class="c-chip" aria-pressed="false" data-q="size" data-v="small" data-qa="ix.hang.helper.size">${esc(t('hanging.helper.small'))}</button><button type="button" class="c-chip" aria-pressed="false" data-q="size" data-v="large" data-qa="ix.hang.helper.size">${esc(t('hanging.helper.large'))}</button></div></div>
      <p class="ix-hang__result" aria-live="polite" hidden data-qa="ix.hang.helper.result"><b></b> <span></span> <button type="button" class="c-btn c-btn--ghost c-btn--sm" data-qa="ix.hang.helper.goto">${esc(t('hanging.helper.goto'))}</button></p>
    </div>`;
  const tabs = $(el, '[role=tablist]'), strip = $(el, '.ix-hang__strip'), stageEl = $(el, '.ix-hang__stage'); mountEl = $(el, '.ix-hang__mount');
  const input = $(el, '[data-qa="ix.hang.step"]'), playBtn = $(el, '[data-qa="ix.hang.play"]');

  const design = () => Object.assign({}, state, { scene: 's01-living', hang: cur.hang, backing: cur.id === 'stand' ? 'stand' : (state.backing === 'stand' ? 'cut' : state.backing), on: true, night: true, view: 'room' });
  /* mounted overlays (caps, chains) positioned from the sign box after every stage render */
  function overlays() {
    if (!api0) return; let ov = stageEl.querySelector('.ix-hang__ov'); if (!ov) { ov = h('<div class="ix-hang__ov" aria-hidden="true"></div>'); stageEl.appendChild(ov); }
    const R0 = api0.el.getBoundingClientRect(), b = api0.signBBox(); const sx = b.left - R0.left, sy = b.top - R0.top, sw = b.width, sh = b.height;
    ov.dataset.method = cur.id; ov.innerHTML = '';
    if (cur.id === 'screws') { const ix = sw * .12, iy = sh * .22; [[sx + ix, sy + iy], [sx + sw - ix, sy + iy], [sx + ix, sy + sh - iy], [sx + sw - ix, sy + sh - iy]].forEach(([x, y]) => ov.appendChild(h(`<i class="ix-hang__cap" style="left:${x}px;top:${y}px"></i>`))); }
    if (cur.id === 'chains') { [sx + sw * .18, sx + sw * .82].forEach(x => ov.appendChild(h(`<i class="chain ix-hang__chain" style="left:${x}px;top:0;height:${Math.max(0, sy + 2)}px"></i>`))); }
  }
  function paint() {
    $$(tabs, '[role=tab]').forEach(b => { const on = b.dataset.id === cur.id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    $(el, '.ix-hang__panel').setAttribute('aria-labelledby', `${id}-t-${cur.id}`); el.dataset.method = cur.id;
    if (api0) { api0.setDesign(design()); if (api0.scene) { if (cur.id === 'stand') api0.setPos(.5, 1); else api0.setPos(.5, .44); } /* low on the wall so the sofa top reads; the stand sits on it (only once the scene has loaded) */ }
    $(el, '.ix-hang__best').innerHTML = (t('hanging.best.' + cur.id + '.0') ? [t('hanging.best.' + cur.id + '.0'), t('hanging.best.' + cur.id + '.1')] : []).filter(Boolean).map(x => `<span class="c-pill">${esc(x)}</span>`).join(' ');
    const kitKey = 'kitContents.' + cur.id, kit = $(el, '.ix-hang__kit'); kit.hidden = !facts.has(kitKey) && !reviewMode(); if (!kit.hidden) kit.querySelector('dd').innerHTML = facts.has(kitKey) ? esc(facts.get(kitKey)) : facts.chip(kitKey);
    const time = $(el, '.ix-hang__time'); time.hidden = !facts.has('installMinutes') && !reviewMode(); if (!time.hidden) time.querySelector('dd').innerHTML = facts.has('installMinutes') ? esc(t('hanging.time', { minutes: facts.value('installMinutes') }) + ', ' + t('hanging.timeTools.' + cur.id)) : facts.chip('installMinutes');
    $(el, '[data-qa="ix.hang.cta"]').href = link(Object.assign({}, state, { hang: cur.hang, backing: cur.id === 'stand' ? 'stand' : (state.backing === 'stand' ? 'cut' : state.backing) }));
    input.max = String(cur.steps); if (step > cur.steps) step = 1; input.value = String(step); range && range.paint();
    showStrip(); overlays();
  }
  async function showStrip() {
    const m = cur; if (!svgs[m.id]) { const s = await inlineSvg(m.svg, `${id}-${m.id}`); if (!s) return; svgs[m.id] = s; }
    const svg = svgs[m.id]; if (strip.querySelector('svg') !== svg) { $$(strip, 'svg').forEach(x => x.remove()); strip.appendChild(svg); svg.classList.add('ix-hang__svg'); }
    showStep();
  }
  function showStep() {
    const svg = svgs[cur.id]; if (!svg) return;
    const total = cur.steps; strip.classList.toggle('is-static', reduced());
    if (reduced()) svg.setAttribute('viewBox', `0 0 ${STEP_PAD * 2 + total * STEP_W - 16} 216`);
    else svg.setAttribute('viewBox', `${STEP_PAD + (step - 1) * STEP_W - 6} 2 212 212`);
    $$(svg, '.step').forEach(g => { const on = +g.dataset.step === step; if (on && !g.classList.contains('is-active')) { g.classList.remove('is-active'); void g.getBoundingClientRect(); } g.classList.toggle('is-active', on); g.classList.toggle('is-done', +g.dataset.step < step); });
    $(el, '.ix-hang__stepn').textContent = t('hanging.stepOf', { n: step, total });
    $(el, '.ix-hang__steptxt').textContent = t(`hanging.steps.${cur.id}.${step - 1}`, {}, '');
    input.setAttribute('aria-label', `${t('hanging.stepOf', { n: step, total })}: ${t(`hanging.steps.${cur.id}.${step - 1}`, {}, '')}`); input.setAttribute('aria-valuetext', t(`hanging.steps.${cur.id}.${step - 1}`, {}, String(step)));
    el.dataset.step = String(step);
  }
  function setStep(n) { step = Math.max(1, Math.min(cur.steps, n)); input.value = String(step); range && range.paint(); showStep(); }
  function sync() { const run = playing && inView && !reduced() && !killed; el.dataset.playing = String(playing); clearInterval(timer); timer = 0; if (run) timer = setInterval(() => setStep(step >= cur.steps ? 1 : step + 1), EVERY); playBtn.setAttribute('aria-pressed', String(!playing)); playBtn.innerHTML = `${icon(playing ? 'pause' : 'play')}<span class="label">${esc(playing ? t('hanging.pause') : t('hanging.play'))}</span>`; }
  function pick(id) { cur = METHODS.find(m => m.id === id) || METHODS[0]; step = 1; paint(); if (api0 && !reduced()) api0.strike(); }

  /* events */
  tabs.addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) pick(b.dataset.id); });
  roving(tabs, '[role=tab]', { onMove: b => pick(b.dataset.id) });
  playBtn.addEventListener('click', () => { playing = !playing; sync(); });
  $(el, '.ix-hang__helper').addEventListener('click', e => {
    const chip = e.target.closest('.c-chip[data-q]'); if (chip) { helper[chip.dataset.q] = chip.dataset.v; $$(el, `.c-chip[data-q="${chip.dataset.q}"]`).forEach(c => c.setAttribute('aria-pressed', String(c === chip))); recommend(); return; }
    if (e.target.closest('[data-qa="ix.hang.helper.goto"]')) { const r = $(el, '.ix-hang__result').dataset.method; if (r) { pick(r); $(el, `[role=tab][data-id="${r}"]`).focus(); } }
  });
  function recommend() {
    const out = $(el, '.ix-hang__result'); if (!helper.drill || !helper.size) { out.hidden = true; return; }
    const m = helper.drill === 'yes' ? 'screws' : helper.size === 'small' ? 'strips' : 'chains';
    out.hidden = false; out.dataset.method = m; out.querySelector('b').textContent = t('hanging.helper.result', { method: t('hanging.tabs.' + m) }); out.querySelector('span').textContent = t('hanging.helper.why.' + m);
  }
  function setState(partial = {}) { if (killed) return; state = readState(el, { state: host.set(partial) }); paint(); }
  function destroy() { killed = true; sync(); offWatch(); offFonts(); offView(); offFrame(); api0 && api0.destroy(); el.innerHTML = ''; }

  boot().then(() => {
    if (killed) return;
    state = readState(el, { state: host.get() });
    range = ui.range($(el, '.ix-hang__range'), { text: v => t('hanging.stepOf', { n: v, total: cur.steps }), onInput: v => { playing = false; sync(); setStep(v); } });
    api0 = stage.mount(mountEl, { frame: 'ix-hang', scene: 's01-living', design: design(), interactive: false, pill: true, rulers: false, qa: 'ix.hang.stage' });
    offFrame = api0.on('frame', overlays);
    paint(); api0.ready.then(() => { if (!killed) paint(); });
    offWatch = watchState(host, () => { const s = readState(el, { state: host.get() }); if (s.text !== state.text || s.font !== state.font || s.colour !== state.colour || s.size !== state.size) { state = s; paint(); } });
    offFonts = onFonts(() => { paint(); });
    offView = onView(el, on => { inView = on; sync(); }, { threshold: .2 });
    sync();
  });
  return api;
}
export default { mount };
