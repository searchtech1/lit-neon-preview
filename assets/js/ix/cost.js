/* Lit Neon v2 — ix/cost.js (brief §5.8): the running-cost calculator. Inputs: size chips (default = the design's
   size), hours a day (1–24, default 5), "Dimmed to half", the tariff (editable, p/kWh). Watts = the LED flex metres of
   the visitor's design (renderer.flexMetres) × facts.wattsPerMetre (× 0.55 dimmed). Outputs per evening, month and
   year with money formatting (pence under a pound), one factual bulb comparison, and the assumptions line.
   Gating (§3.9.2): with wattsPerMetre unconfirmed the calculator shows only if the owner approved a typical value
   (wattsPerMetreTypical); otherwise, in customer mode, the whole block collapses — the element (and a [data-gated]
   ancestor, and the tab that controls its panel) is removed — and mount() returns { gated: true }. Review mode shows it
   with chips using the drafts. */
import { boot, readState, watchState, hostState, onFonts, t, esc, icon, R, facts, money, ui, h, $, $$, reviewMode } from './_ix.js';

const BULBS = [3, 5, 7, 10, 15, 20, 30, 40, 60, 100];
const draft = k => { const e = facts.describe(k); return e && Number.isFinite(+e.draft) ? +e.draft : null; };

export function mount(el, opts = {}) {
  const host = hostState(opts);
  el.classList.add('ix', 'ix-cost'); el.dataset.qa = 'ix.cost';
  let state = null, killed = false, hours = +(el.dataset.hours || 5), dimmed = false, tariff = null, tariffDefault = null, wpm = null, typical = false, size = null, range = null;
  let offWatch = () => {}, offFonts = () => {};
  const api = { destroy, setState, gated: false };

  function collapse() {
    api.gated = true;
    const panel = el.closest('[role=tabpanel]'); const gated = (el.parentElement && el.parentElement.closest('[data-gated]')) || panel || el;
    el.dataset.gated = 'true';
    if (panel && panel.id) { const tab = document.querySelector(`[role=tab][aria-controls="${panel.id}"]`); if (tab) { const list = tab.closest('[role=tablist]'); const wasSelected = tab.getAttribute('aria-selected') === 'true'; tab.remove(); if (wasSelected && list) { const first = list.querySelector('[role=tab]'); first && first.click(); } } }
    document.dispatchEvent(new CustomEvent('ln:ix-gated', { detail: { name: 'cost', el: gated } }));
    gated.remove();
  }
  function resolveFacts() {
    const review = reviewMode();
    if (facts.has('wattsPerMetre')) { wpm = +facts.value('wattsPerMetre'); typical = false; }
    else if (facts.has('wattsPerMetreTypical')) { wpm = +facts.value('wattsPerMetreTypical'); typical = true; }
    else if (review) { wpm = draft('wattsPerMetre') ?? draft('wattsPerMetreTypical'); typical = true; }
    else wpm = null;
    tariffDefault = facts.has('electricityPencePerKwh') ? +facts.value('electricityPencePerKwh') : (review ? draft('electricityPencePerKwh') : null);
    if (tariff == null) tariff = tariffDefault;
    return Number.isFinite(wpm) && wpm > 0 && Number.isFinite(tariffDefault) && tariffDefault > 0;
  }
  function markup() {
    const sizes = R.OPTIONS.sizes;
    el.innerHTML = `
      <div class="ix-cost__grid">
        <div class="ix-cost__inputs">
          <div class="ix-cost__field"><span class="ix__label">${esc(t('cost.size'))}</span><div class="ix__chips" role="group" aria-label="${esc(t('cost.size'))}">${sizes.map(s => `<button type="button" class="c-chip" aria-pressed="${s.id === size}" data-id="${s.id}" data-qa="ix.cost.size">${esc(s.name)}</button>`).join('')}</div></div>
          <div class="ix-cost__field c-range ix-cost__hours"><label class="ix__label" for="${el.dataset.qa}-h">${esc(t('cost.hours'))} <span class="readout"></span></label><input type="range" id="${el.dataset.qa}-h" min="1" max="24" step="1" value="${hours}" data-qa="ix.cost.hours"></div>
          <div class="ix-cost__field"><button type="button" class="ix-cost__toggle" role="switch" aria-checked="false" data-qa="ix.cost.dimmed"><span class="c-switch" aria-hidden="true"></span><span class="lbl">${esc(t('cost.dimmed'))}</span></button></div>
          <div class="ix-cost__field"><label class="ix__label" for="${el.dataset.qa}-t">${esc(t('cost.tariff'))} ${facts.has('electricityPencePerKwh') ? '' : facts.chip('electricityPencePerKwh')}</label>
            <div class="ix-cost__tariff"><input class="c-input" id="${el.dataset.qa}-t" type="number" inputmode="decimal" min="1" max="200" step="0.1" value="${tariff}" data-qa="ix.cost.tariff"><span class="unit">${esc(t('cost.tariffUnit'))}</span><button type="button" class="c-btn c-btn--text" data-qa="ix.cost.reset" hidden><span class="label">${esc(t('cost.reset'))}</span></button></div></div>
        </div>
        <div class="ix-cost__out" aria-live="polite" data-qa="ix.cost.readout">
          <div class="ix-cost__tiles">
            <div class="ix-cost__tile"><span class="lbl">${esc(t('cost.evening'))}</span><b class="val" data-qa="ix.cost.evening"></b></div>
            <div class="ix-cost__tile"><span class="lbl">${esc(t('cost.month'))}</span><b class="val" data-qa="ix.cost.month"></b></div>
            <div class="ix-cost__tile"><span class="lbl">${esc(t('cost.year'))}</span><b class="val" data-qa="ix.cost.year"></b></div>
          </div>
          <p class="ix-cost__watts"><b data-qa="ix.cost.watts"></b> · <span class="ix-cost__flex"></span></p>
          <p class="ix-cost__compare">${icon('info', 'ic--sm')}<span></span></p>
          <p class="ix-cost__assume t-caption"></p>
        </div>
      </div>`;
    range = ui.range($(el, '.ix-cost__hours'), { text: v => t('cost.hoursText', { n: v }), onInput: v => { hours = v; paint(); } });
    $(el, '.ix__chips').addEventListener('click', e => { const b = e.target.closest('.c-chip'); if (!b) return; size = b.dataset.id; $$(el, '[data-qa="ix.cost.size"]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.id === size))); paint(); });
    $(el, '[data-qa="ix.cost.dimmed"]').addEventListener('click', e => { dimmed = !dimmed; e.currentTarget.setAttribute('aria-checked', String(dimmed)); paint(); });
    const tIn = $(el, '[data-qa="ix.cost.tariff"]'); tIn.addEventListener('input', () => { const v = parseFloat(tIn.value); tariff = Number.isFinite(v) && v > 0 ? v : tariffDefault; paint(); });
    $(el, '[data-qa="ix.cost.reset"]').addEventListener('click', () => { tariff = tariffDefault; tIn.value = String(tariff); paint(); });
  }
  const fmt = pence => money.pence(Math.round(pence * 10) / 10);
  function paint() {
    const st = Object.assign({}, state, { size });
    const res = R.resolve(st); const flex = R.flexMetres(res);
    const watts = Math.max(1, Math.round(flex * wpm * (dimmed ? .55 : 1)));
    const perDay = watts / 1000 * hours * tariff; /* pence */
    $(el, '[data-qa="ix.cost.evening"]').textContent = fmt(perDay);
    $(el, '[data-qa="ix.cost.month"]').textContent = fmt(perDay * 30);
    $(el, '[data-qa="ix.cost.year"]').textContent = fmt(perDay * 365);
    $(el, '[data-qa="ix.cost.watts"]').textContent = t('cost.watts', { w: watts }); $(el, '[data-qa="ix.cost.watts"]').dataset.watts = String(watts);
    $(el, '.ix-cost__flex').textContent = t('cost.flex', { m: money.fmtMetres(flex) });
    const bulb = BULBS.reduce((a, b) => Math.abs(b - watts) < Math.abs(a - watts) ? b : a, BULBS[0]);
    $(el, '.ix-cost__compare span').textContent = t('cost.comparison', { w: bulb });
    $(el, '.ix-cost__assume').innerHTML = esc(t('cost.assumptions', { wpm, tariff })) + (typical ? ' ' + esc(t('cost.typical', { wpm })) + ' ' + (facts.has('wattsPerMetreTypical') ? '' : facts.chip('wattsPerMetre')) : '');
    $(el, '[data-qa="ix.cost.reset"]').hidden = tariff === tariffDefault;
    el.dataset.size = size; el.dataset.hours = String(hours);
  }
  function setState(partial = {}) { if (killed || api.gated) return; state = readState(el, { state: host.set(partial) }); if (partial.size) size = partial.size; paint(); }
  function destroy() { killed = true; offWatch(); offFonts(); if (!api.gated) el.innerHTML = ''; }

  boot().then(() => {
    if (killed) return;
    if (!resolveFacts()) { collapse(); return; }
    state = readState(el, { state: host.get() }); size = state.size === 'custom' ? 'm' : state.size;
    markup(); paint();
    offWatch = watchState(host, () => { const s = readState(el, { state: host.get() }); if (s.text !== state.text || s.font !== state.font || s.size !== state.size) { state = s; if (s.size !== 'custom') { size = s.size; $$(el, '[data-qa="ix.cost.size"]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.id === size))); } paint(); } });
    offFonts = onFonts(paint);
  });
  return api;
}
export default { mount };
