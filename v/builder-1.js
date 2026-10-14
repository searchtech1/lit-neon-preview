/* Built-round builder, version 1 — D2 B: pinned stage, Words · Style · Colour · Size in place, dock = price + Next
   (→ Add to basket on the last step). All engine work is in builder-core.js (shared with version 2). */
import * as C from './builder-core.js';

const STEPS = ['words', 'style', 'colour', 'size'], NAME = { words: 'Words', style: 'Style', colour: 'Colour', size: 'Size' };
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const visited = new Set(['words']); let step = 'words';

C.S.design = C.initialDesign();
const shell = $('#shell'), wrap = $('#stagewrap');
wrap.insertAdjacentHTML('beforeend', C.stageToolsHtml());
C.mountStage(wrap); C.wireStageTools(wrap); C.wireHeader(shell); C.wireViewport(shell);

/* steps: Words is in the HTML already (first paint); the other three render now, hidden */
$('#step-style').innerHTML = C.styleHtml(); $('#step-colour').innerHTML = C.colourHtml(); $('#step-size').innerHTML = C.sizeHtml({ rows: true });
C.wireWords($('#step-words')); C.wireStyle($('#step-style')); C.wireColour($('#step-colour')); C.wireSize($('#step-size'));

function show(id, { focus = false } = {}) {
  step = id; visited.add(id);
  $$('.v-steps [role=tab]').forEach(b => { const on = b.dataset.step === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; b.classList.toggle('is-done', visited.has(b.dataset.step) && !on); });
  $$('.v-step').forEach(s => { s.hidden = s.dataset.step !== id; });
  $('#panel').scrollTop = 0;
  if (id === 'style' && C.S.loadFaces) C.S.loadFaces();
  if (id !== 'words' && document.activeElement && document.activeElement.id === 'v-words') document.activeElement.blur();
  paintDock();
  if (focus) { const s = $(`#step-${id}`); s.setAttribute('tabindex', '-1'); s.focus({ preventScroll: true }); }
}
$('.v-steps').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) show(b.dataset.step); });
$('.v-steps').addEventListener('keydown', e => { const i = STEPS.indexOf(step); const n = e.key === 'ArrowRight' ? (i + 1) % 4 : e.key === 'ArrowLeft' ? (i + 3) % 4 : -1; if (n < 0) return; e.preventDefault(); show(STEPS[n]); $(`.v-steps [data-step="${STEPS[n]}"]`).focus(); });

/* dock */
const cta = $('[data-cta]');
function paintDock() {
  const p = C.paintPrice($('[data-price]'));
  const i = STEPS.indexOf(step); const last = i === STEPS.length - 1;
  if (!last) { cta.textContent = `Next: ${NAME[STEPS[i + 1]]}`; cta.dataset.mode = 'next'; cta.disabled = false; }
  else if (p.kind === 'quote') { cta.textContent = 'Request a free quote'; cta.dataset.mode = 'add'; cta.disabled = false; }
  else { cta.textContent = 'Add to basket'; cta.dataset.mode = 'add'; cta.disabled = p.kind !== 'price'; }
}
cta.addEventListener('click', () => { if (cta.dataset.mode === 'next') show(STEPS[STEPS.indexOf(step) + 1], { focus: true }); else C.openConfirm(cta); });
$('[data-price]').addEventListener('click', e => { if (!$('[data-price]').classList.contains('is-wait')) C.openBreakdown(e.currentTarget); });
C.onChange(paintDock); paintDock();
C.loadFacts();
