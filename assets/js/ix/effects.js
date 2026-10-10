/* Lit Neon v2 — ix/effects.js (brief §5.4): static vs RGB. Three cards of the SAME sign (the visitor's words) on the
   gaming scene: One colour (static, the remote dimming it), Colour changing (steps through seven colours every 1.2 s),
   Gradient (only when facts.rgbGradient is confirmed; otherwise two cards fill the row). Each card: a live stage, a
   schematic remote with the buttons that matter, two bullets, the price difference at the current size from
   pricing.deltas (the RGB multiplier) and "Choose this" into the builder. A "Pause animations" button (WCAG 2.2.2) and
   an automatic pause off-screen; reduced motion shows a seven-swatch strip instead of cycling.
   mount(el, { state, scene }) → { destroy, setState }. data-qa: ix.effects.* */
import { boot, readState, watchState, hostState, link, onFonts, t, esc, icon, R, stage, pricing, facts, money, h, $, $$, reduced, onView, pauseButton, registerFrame } from './_ix.js';
/* a slightly smaller card so the gaming scene's desk (its calibration object) and the sign both fit the crop */
registerFrame('ix-card', () => [.38, .44]);

const CYCLE = ['red', 'green', 'blue', 'ice', 'cool', 'violet', 'yellow'];
const EVERY = 1200, DIM_EVERY = 2600;

function remoteSvg(kind) {
  /* a schematic remote: power, dim −/+, four colour dots, a cycle button. Classes mark what the card animates. */
  return `<svg class="ix-effects__remote" viewBox="0 0 64 124" aria-hidden="true" focusable="false">
    <rect class="body" x="4" y="2" width="56" height="120" rx="12"/>
    <circle class="pwr" cx="32" cy="20" r="7"/><path class="pwr-glyph" d="M32 15v5M28.5 17.5a5 5 0 1 0 7 0"/>
    <rect class="dim dim-minus" x="12" y="36" width="18" height="12" rx="6"/><path class="glyph" d="M17 42h8"/>
    <rect class="dim dim-plus" x="34" y="36" width="18" height="12" rx="6"/><path class="glyph" d="M39 42h8M43 38v8"/>
    ${kind === 'static' ? '' : `<g class="dots"><circle cx="17" cy="66" r="5"/><circle cx="27" cy="66" r="5"/><circle cx="37" cy="66" r="5"/><circle cx="47" cy="66" r="5"/><circle cx="17" cy="80" r="5"/><circle cx="27" cy="80" r="5"/><circle cx="37" cy="80" r="5"/><circle cx="47" cy="80" r="5"/></g>
    <rect class="cycle" x="12" y="96" width="40" height="14" rx="7"/><path class="glyph" d="M26 103h12M35 100l3 3-3 3"/>`}
    ${kind === 'static' ? '<rect class="dim-track" x="14" y="64" width="36" height="6" rx="3"/><rect class="dim-level" x="14" y="64" width="36" height="6" rx="3"/>' : ''}
  </svg>`;
}

export function mount(el, opts = {}) {
  const host = hostState(opts);
  el.classList.add('ix', 'ix-effects'); el.dataset.qa = 'ix.effects'; el.dataset.playing = 'true';
  const SCENE = opts.scene || el.dataset.scene || 's12-gaming';
  let state = null, killed = false, playing = true, inView = false, timer = 0, dimTimer = 0, ci = 0, dimmed = false;
  const stages = {}; let offWatch = () => {}, offFonts = () => {}, offView = () => {};
  const api = { destroy, setState };

  const hasGradient = () => facts.has('rgbGradient');
  const kinds = () => ['static', 'changing'].concat(hasGradient() ? ['gradient'] : []);
  const titles = { static: t('effects.static'), changing: t('effects.changing'), gradient: t('effects.gradient') };
  const bullets = k => k === 'static' ? [t('effects.staticBullets.0'), t('effects.staticBullets.1')] : k === 'changing' ? [t('effects.changingBullets.0'), t('effects.changingBullets.1', { fix: t('effects.fix') })] : [t('effects.gradientBullets.0'), t('effects.gradientBullets.1')];

  function markup() {
    const ks = kinds();
    el.innerHTML = `
      <div class="ix-effects__grid" data-cols="${ks.length}">
        ${ks.map(k => `<article class="ix-effects__card" data-kind="${k}" data-qa="ix.effects.card">
          <div class="ix-effects__stage ix__stage"><div class="ix-effects__mount"></div></div>
          <div class="ix-effects__body">
            <div class="ix-effects__top"><h3 class="t-title">${esc(titles[k])}</h3>${remoteSvg(k)}</div>
            <ul class="ix-effects__bullets">${bullets(k).map(b => `<li>${esc(b)}</li>`).join('')}</ul>
            ${k === 'changing' && reduced() ? `<div class="ix-effects__strip" data-qa="ix.effects.strip" aria-label="${esc(t('effects.swatchStrip'))}">${CYCLE.map(c => { const col = R.colourOf(c); return `<span class="c-swatch" style="--tube:${col.hex};--core:${R.coreOf(col)}" title="${esc(col.name)}"><span class="tube"></span><span class="name">${esc(col.name)}</span></span>`; }).join('')}</div>` : ''}
            <p class="ix-effects__price" data-qa="ix.effects.price"></p>
            <a class="c-btn c-btn--ghost" data-qa="ix.effects.choose" href="/lit-neon-preview/create.html">${esc(t('effects.choose'))}</a>
          </div>
        </article>`).join('')}
      </div>
      <div class="ix__row ix__row--between ix-effects__foot">
        <p class="ix__caption" data-caption="rendered">${icon('image')}<span>${esc(t('effects.caption'))} · ${esc(t('effects.offNote'))}</span></p>
        <span class="ix-effects__pause"></span>
      </div>`;
    const pb = pauseButton({ qa: 'ix.effects.pause', label: t('effects.pause'), playLabel: t('effects.play'), onChange: on => { playing = on; sync(); } });
    $(el, '.ix-effects__pause').appendChild(pb.el);
    for (const k of ks) {
      const d = designFor(k);
      stages[k] = stage.mount($(el, `.ix-effects__card[data-kind="${k}"] .ix-effects__mount`), { frame: 'ix-card', scene: SCENE, design: d, interactive: false, pill: true, rulers: false, qa: `ix.effects.${k}`, relight: k === 'static' });
    }
  }
  function designFor(k) {
    const base = Object.assign({}, state, { scene: SCENE, on: true, night: true, view: 'room', colours: null });
    if (k === 'static') return Object.assign(base, { colour: state.colour === 'rgb' ? 'warm' : state.colour });
    if (k === 'changing') return Object.assign(base, { colour: CYCLE[ci] });
    return Object.assign(base, { colour: 'rgb' });
  }
  function paint() {
    const sizeName = R.sizeOf(state.size).name;
    const base = Object.assign({}, state, { colours: null, colour: state.colour === 'rgb' ? 'warm' : state.colour });
    const d = pricing.deltas(base, 'colour', ['rgb']);
    for (const k of kinds()) {
      const card = $(el, `.ix-effects__card[data-kind="${k}"]`); if (!card) continue;
      const price = card.querySelector('.ix-effects__price'), a = card.querySelector('.ix-effects__choose, [data-qa="ix.effects.choose"]');
      if (k === 'static') { price.textContent = t('effects.included'); price.dataset.delta = '0'; a.href = link(Object.assign({}, base, { scene: SCENE })); }
      else if (k === 'changing') { const v = d.rgb; price.textContent = v === 'quote' || v == null ? t('effects.quoted') : t('effects.atSize', { delta: money.fmtDelta(v), size: sizeName }); price.dataset.delta = v == null ? '' : String(v); a.href = link(Object.assign({}, base, { colour: 'rgb', scene: SCENE })); }
      else { price.textContent = t('effects.quoted'); price.dataset.delta = 'quote'; a.href = link(Object.assign({}, base, { colour: 'rgb', scene: SCENE })); }
      if (stages[k]) stages[k].setDesign(designFor(k));
    }
  }
  function tick() { ci = (ci + 1) % CYCLE.length; if (stages.changing) stages.changing.setDesign({ colour: CYCLE[ci] }); const card = $(el, '.ix-effects__card[data-kind="changing"]'); if (card) card.querySelectorAll('.dots circle').forEach((c, i) => c.classList.toggle('is-active', i === ci % 8)); }
  function dimTick() { dimmed = !dimmed; const card = $(el, '.ix-effects__card[data-kind="static"]'); if (!card) return; card.classList.toggle('is-dimmed', dimmed); card.querySelector('.dim-minus')?.classList.toggle('is-active', dimmed); card.querySelector('.dim-plus')?.classList.toggle('is-active', !dimmed); }
  function sync() {
    const run = playing && inView && !reduced() && !killed;
    el.dataset.playing = String(playing);
    el.classList.toggle('is-running', run);
    clearInterval(timer); clearInterval(dimTimer); timer = dimTimer = 0;
    if (run) { timer = setInterval(tick, EVERY); dimTimer = setInterval(dimTick, DIM_EVERY); }
  }
  function setState(partial = {}) { if (killed) return; state = readState(el, { state: host.set(partial) }); paint(); }
  function destroy() { killed = true; sync(); offWatch(); offFonts(); offView(); Object.values(stages).forEach(s => s.destroy()); el.innerHTML = ''; }

  boot().then(() => {
    if (killed) return;
    state = readState(el, { state: host.get() }); markup(); paint();
    offWatch = watchState(host, () => { const s = readState(el, { state: host.get() }); if (s.text !== state.text || s.font !== state.font || s.size !== state.size || s.colour !== state.colour) { state = s; paint(); } });
    offFonts = onFonts(paint);
    offView = onView(el, on => { inView = on; sync(); }, { threshold: .2 });
    sync();
  });
  return api;
}
export default { mount };
