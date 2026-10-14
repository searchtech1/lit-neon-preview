/* Lit Neon v2 — ix/jacket.js (brief §5.1): the tube-jacket demo. Two tiles (White jacket · Coloured jacket), each two
   stages on s00-studio-light stacked and split by one "Lights off ↔ on" slider: the left part is the honest off state
   on the day plate (white tube vs tinted tube), the right part the lit state on the night plate, so the jacket
   difference is visible at every slider position. A tube-swatch strip of the 12 colours (coloured-jacket availability
   from catalog.colours[].jacketColour), captions, and a CTA that carries words + colour + jacket into the builder.
   mount(el, { state, colour, jacket, initial }) → { destroy, setState }. data-qa: ix.jacket.* (qa/matrix/ix.json). */
import { boot, readState, watchState, hostState, link, onFonts, t, esc, icon, R, stage, roving, h, $, $$, reduced, ui } from './_ix.js';

const SCENE = 's00-studio-light';
const SKEW = 6; /* % of width the diagonal leans */

export function mount(el, opts = {}) {
  const host = hostState(opts);
  el.classList.add('ix', 'ix-jacket'); el.dataset.qa = 'ix.jacket';
  const api = { destroy, setState };
  let state = null, colour = null, jacket = 'white', v = +(opts.initial ?? el.dataset.initial ?? 50);
  const stages = {}; let offWatch = () => {}, offFonts = () => {}, killed = false;

  el.innerHTML = `
    <div class="ix-jacket__tiles">
      ${['white', 'colour'].map(j => `
      <div class="ix-jacket__tile" data-jacket="${j}" data-state="split" style="--pos:50%;--skew:${SKEW}%">
        <div class="ix-jacket__stage ix-jacket__off"></div>
        <div class="ix-jacket__stage ix-jacket__on"></div>
        <svg class="ix-jacket__divider" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="56" y1="0" x2="44" y2="100" vector-effect="non-scaling-stroke"/></svg>
        <span class="ix-jacket__tag ix-jacket__tag--a">${esc(t('jacket.sliderOff', {}, 'Lights off'))}</span><span class="ix-jacket__tag ix-jacket__tag--b">${esc(t('jacket.sliderOn', {}, 'Lights on'))}</span>
        <button type="button" class="ix-jacket__pick" aria-pressed="${j === 'white'}" data-jacket="${j}" data-qa="ix.jacket.tile" aria-label="${esc(t('jacket.choose', { jacket: j === 'white' ? t('jacket.white') : t('jacket.coloured') }))}"><span class="ix-jacket__name">${esc(j === 'white' ? t('jacket.white') : t('jacket.coloured'))}</span><span class="ix-jacket__cap">${esc(j === 'white' ? t('jacket.offCaption') : t('jacket.onCaption'))}</span>${icon('check', 'ix-jacket__tick')}</button>
        <span class="ix-jacket__note" hidden></span>
      </div>`).join('')}
    </div>
    <p class="ix__caption" data-caption="rendered">${icon('image')}<span>${esc(t('jacket.caption'))}</span></p>
    <div class="ix__controls ix__sticky">
      <div class="c-range ix-jacket__range" aria-label="${esc(t('jacket.slider'))}">
        <label class="ix__label" for="">${esc(t('jacket.slider'))} <span class="readout"></span></label>
        <input type="range" min="0" max="100" step="1" value="${v}" data-qa="ix.jacket.slider" aria-label="${esc(t('jacket.slider'))}">
      </div>
      <div class="ix-jacket__swatches" role="group" aria-label="${esc(t('jacket.coloursLabel'))}"></div>
      <div class="ix__cta"><a class="c-btn c-btn--primary" data-qa="ix.jacket.cta" href="/lit-neon-preview/rework/create.html">${esc(t('jacket.cta'))}</a></div>
    </div>`;
  const tiles = { white: $(el, '.ix-jacket__tile[data-jacket="white"]'), colour: $(el, '.ix-jacket__tile[data-jacket="colour"]') };
  const range = $(el, 'input[type=range]'); const label = $(el, 'label'); label.htmlFor = range.id = `${el.dataset.qa}-${Math.random().toString(36).slice(2, 7)}`;
  const swatches = $(el, '.ix-jacket__swatches'); const cta = $(el, '[data-qa="ix.jacket.cta"]');

  const avail = c => !c.rgb && !!c.jacketColour;
  function design(j, on) { return Object.assign({}, state, { colour, jacket: j, on, night: on, scene: SCENE, view: 'room' }); }
  function paintPos() {
    const pos = (100 + SKEW) - v * (1 + 2 * SKEW / 100); /* 106 … -6: the lit layer covers from `pos` to the right, so 0 = all off, 100 = all lit */
    Object.values(tiles).forEach(tile => { tile.style.setProperty('--pos', pos + '%'); tile.dataset.state = v >= 98 ? 'on' : v <= 2 ? 'off' : 'split'; const ln = tile.querySelector('line'); ln.setAttribute('x1', pos + SKEW); ln.setAttribute('x2', pos - SKEW); });
    $(el, '.readout').textContent = t('jacket.sliderText', { pct: Math.round(v) + '%' }, '{pct} lit');
    range.setAttribute('aria-valuetext', $(el, '.readout').textContent);
    $(el, '.ix-jacket__range').style.setProperty('--pct', v + '%');
  }
  function paintSwatches() {
    swatches.innerHTML = R.OPTIONS.colours.map(c => `<button type="button" class="c-swatch${c.rgb ? ' c-swatch--rgb' : ''}" aria-pressed="${c.id === colour}" tabindex="${c.id === colour ? 0 : -1}" data-id="${c.id}" style="--tube:${c.hex};--core:${R.coreOf(c)}" aria-label="${esc(c.name)}${avail(c) ? '' : ', ' + esc(t('jacket.whiteOnly'))}" data-qa="ix.jacket.swatch"><span class="tube"></span><span class="name">${esc(c.name)}</span></button>`).join('');
  }
  function paint() {
    const c = R.colourOf(colour); const ok = avail(c);
    if (!ok && jacket === 'colour') jacket = 'white';
    for (const j of ['white', 'colour']) {
      const tile = tiles[j];
      tile.style.setProperty('--off', R.offTube(c, j));
      tile.classList.toggle('is-unavailable', j === 'colour' && !ok);
      const note = tile.querySelector('.ix-jacket__note'); note.hidden = !(j === 'colour' && !ok); note.textContent = t('jacket.whiteOnlyWhy', { colour: c.name });
      const pick = tile.querySelector('.ix-jacket__pick'); pick.setAttribute('aria-pressed', String(jacket === j)); pick.disabled = j === 'colour' && !ok;
      if (stages[j]) { stages[j].off.setDesign(design(j, false)); stages[j].on.setDesign(design(j, true)); }
    }
    $$(swatches, '.c-swatch').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.id === colour)); b.tabIndex = b.dataset.id === colour ? 0 : -1; });
    cta.href = link(Object.assign({}, state, { colour, jacket }));
    el.dataset.colour = colour; el.dataset.jacket = jacket;
  }
  function strikeAll() { if (reduced()) return; Object.values(stages).forEach(s => s.on.strike()); }

  /* events */
  range.addEventListener('input', () => { v = +range.value; paintPos(); });
  range.addEventListener('keydown', e => { let nv = null; if (e.key === 'PageUp') nv = v + 10; else if (e.key === 'PageDown') nv = v - 10; else if (e.key === 'Home') nv = 0; else if (e.key === 'End') nv = 100; if (nv != null) { e.preventDefault(); range.value = String(Math.max(0, Math.min(100, nv))); v = +range.value; paintPos(); } });
  swatches.addEventListener('click', e => { const b = e.target.closest('.c-swatch'); if (!b) return; colour = b.dataset.id; paint(); strikeAll(); });
  roving(swatches, '.c-swatch', { orientation: 'horizontal' });
  el.addEventListener('click', e => { const b = e.target.closest('.ix-jacket__pick'); if (!b || b.disabled) return; jacket = b.dataset.jacket; paint(); });

  function setState(partial = {}) {
    if (killed) return; const prev = state;
    state = readState(el, { state: host.set(partial), fallbackWords: t('jacket.fallbackWords', {}, 'Open late') });
    if (partial.colour) colour = partial.colour; if (partial.jacket) jacket = partial.jacket;
    if (!colour) colour = opts.colour || el.dataset.colour || state.colour;
    paint(); if (prev && prev.text !== state.text) strikeAll();
  }
  function destroy() { killed = true; offWatch(); offFonts(); Object.values(stages).forEach(s => { s.off.destroy(); s.on.destroy(); }); el.innerHTML = ''; }

  boot().then(() => {
    if (killed) return;
    state = readState(el, { state: host.get(), fallbackWords: t('jacket.fallbackWords', {}, 'Open late') });
    colour = opts.colour || el.dataset.colour || state.colour; jacket = opts.jacket || el.dataset.jacket || state.jacket || 'white';
    if (!avail(R.colourOf(colour)) && jacket === 'colour') jacket = 'white';
    paintSwatches();
    for (const j of ['white', 'colour']) {
      const tile = tiles[j];
      stages[j] = {
        off: stage.mount(tile.querySelector('.ix-jacket__off'), { frame: 'card', scene: SCENE, design: design(j, false), interactive: false, pill: true, rulers: false, qa: `ix.jacket.${j}.off`, relight: false }),
        on: stage.mount(tile.querySelector('.ix-jacket__on'), { frame: 'card', scene: SCENE, design: design(j, true), interactive: false, pill: false, rulers: false, qa: `ix.jacket.${j}.on`, relight: j === 'white' })
      };
    }
    paint(); paintPos();
    offWatch = watchState(host, () => { const s = readState(el, { state: host.get(), fallbackWords: t('jacket.fallbackWords', {}, 'Open late') }); if (s.text !== state.text || s.font !== state.font) { state = s; paint(); strikeAll(); } });
    offFonts = onFonts(() => paint());
  });
  return api;
}
export default { mount };
