/* Lit Neon v2 — bulk quote page (brief §4.16, owner P3). Hero on the office scene (live stage), then a real quote form:
   count stepper (3–200, typed or stepped), purpose chips, same/several designs, size, where, need-by, budget band,
   up to 5 files (≤ 20 MB each) with the rights checkbox, company/name/email/WhatsApp/notes/consent.
   forms.submit('bulk') posts FormData with the files; the confirmation (LN-B-…) renders only on a 2xx; a non-2xx keeps
   every field and offers Retry. Budget bands are numbers formatted with money.gbp — never typed into copy or markup.
   Every control carries data-qa="bulk.*" (qa/matrix/bulk.json). */
import * as copy from 'core/copy.js';
import * as facts from 'core/facts.js';
import * as clock from 'core/clock.js';
import * as ui from 'core/ui.js';
import forms from 'core/forms.js';
import stage from 'core/stage.js';
import * as R from 'core/renderer.js';
import * as sheetMod from 'core/sheet.js';
import { mount as mountChrome } from 'core/chrome.js';
import { track } from 'core/analytics.js';
import { gbp, esc, isoDate, addDays } from 'core/money.js';
import 'rules';

const RULES = globalThis.LIT_RULES || {};
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const t = (k, v, f) => copy.t(k, v, f);
const icon = ui.icon;
const MIN = 3, MAX = 200, MAX_FILES = 5;
const BUDGETS = [[null, 1000], [1000, 3000], [3000, 10000], [10000, null]];   /* order totals in £ (bands, not prices) */
const SIZES = ['40', '60', '80', '100', '120+'];
const st = window.__bulk = {};

(async function boot() {
  await Promise.all([copy.load(['chrome', 'bulk']), facts.load(), ui.ensureSprite()]);
  mountChrome({ page: 'bulk' }).catch(() => {});
  fillCopy();
  hero();
  form();
  sidebar();
  document.documentElement.dataset.ready = 'bulk';
})();

function fillCopy() {
  $$('[data-copy]').forEach(el => { const v = copy.get(el.dataset.copy); if (typeof v === 'string' && v) el.textContent = v; });
  const p = copy.get('form.notesPlaceholder'); if (p) $('#bq-notes').placeholder = p;
  const c = copy.get('form.countPlaceholder'); if (c) $('#bq-count').placeholder = c;
  const a = copy.get('form.filesAria'); if (a) $('#bq-drop').setAttribute('aria-label', a);
}

/* ---------------- hero: the office scene with a sign at true size ---------------- */
function hero() {
  const phone = matchMedia('(max-width: 767px)').matches;
  const design = R.normalise({ ...R.DEFAULT_DESIGN, text: t('heroWords', {}, 'Welcome in'), font: 'shoreditch', colour: 'warm', size: 'l', pos: phone ? {} : { 's10-office': { x: 0.78, y: 0.36 } } });
  try { st.stage = stage.mount($('#bq-stage'), { frame: 'hero', scene: 's10-office', design, view: { night: true, on: true, rulers: 'off' }, interactive: false, rulers: false, pill: true, qa: 'bulk.hero.stage', priority: 'high' }); } catch { /* the copy stands on its own */ }
  $('[data-qa="bulk.hero.cta"]').addEventListener('click', e => { e.preventDefault(); $('#quote').scrollIntoView({ behavior: ui.prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }); setTimeout(() => $('#bq-count').focus({ preventScroll: true }), 450); });
}

/* ---------------- shared bits ---------------- */
function chips(group, items, input, { qa, multi = false, onChange } = {}) {
  group.innerHTML = items.map(i => `<button type="button" class="c-chip" aria-pressed="false" data-v="${esc(i.v)}" data-qa="${qa}.chip">${esc(i.label)}</button>`).join('');
  const sync = () => { const on = $$('.c-chip[aria-pressed="true"]', group).map(b => b.dataset.v); input.value = on.map(v => (items.find(i => i.v === v) || {}).label || v).join(', '); onChange && onChange(on); };
  group.addEventListener('click', e => {
    const b = e.target.closest('.c-chip'); if (!b) return; const on = b.getAttribute('aria-pressed') !== 'true';
    if (!multi) $$('.c-chip', group).forEach(x => x.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', String(on)); sync();
  });
  return { clear() { $$('.c-chip', group).forEach(x => x.setAttribute('aria-pressed', 'false')); sync(); } };
}
const k = n => n >= 1000 ? `£${(n / 1000).toLocaleString('en-GB')}k` : gbp(n);
function addWorkingDays(from, n) { const hol = (RULES.delivery && RULES.delivery.bankHolidays) || []; let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); let i = 0; while (i < n) { d = addDays(d, 1); if (d.getDay() !== 0 && d.getDay() !== 6 && !hol.includes(isoDate(d))) i++; } return d; }

/* ---------------- the form ---------------- */
function form() {
  const f = $('#bq-form');
  /* count: typed or stepped, 3–200; empty until the customer says (the AT submits without it) */
  const input = $('#bq-count'), help = $('#bq-count-help'), minus = $('[data-step="-1"]', f), plus = $('[data-step="1"]', f);
  /* read the number the field really holds: '1e3' is 1000 and '2.5' is 2.5 to a number input, never parseInt's 1 and 2 */
  const val = () => { const raw = String(input.value).trim(); if (!raw) return null; const n = Number(raw); return Number.isFinite(n) ? Math.round(n) : null; };
  const paint = () => { const n = val(); minus.disabled = n == null || n <= MIN; plus.disabled = n != null && n >= MAX; help.textContent = n != null && n >= MAX ? t('form.countMore') : t('form.countHelp'); };
  f.addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (!b) return; const n = val(); const next = n == null ? MIN : Math.max(MIN, Math.min(MAX, n + +b.dataset.step)); input.value = String(next); input.removeAttribute('aria-invalid'); $('#bq-count-err')?.remove(); paint(); });
  input.addEventListener('input', paint);
  /* on blur the field always ends as a whole number in range (or empty): 1e3 → 200, 2.5 → 3, 0 or junk → empty, 1–2 → 3
     with the reason. A field the browser itself can't parse (badInput) is cleared rather than left invalid. */
  input.addEventListener('blur', () => {
    const n = val();
    if (n == null) { if (input.validity && input.validity.badInput) input.value = ''; paint(); return; }
    if (n < 1) input.value = ''; else input.value = String(Math.max(MIN, Math.min(MAX, n)));
    if (input.value) { input.removeAttribute('aria-invalid'); $('#bq-count-err')?.remove(); }
    paint(); if (n >= 1 && n < MIN) help.textContent = t('form.countMin');
  });
  paint();
  /* chips */
  const purpose = chips($('[data-qa="bulk.purpose"]'), ['branches', 'event', 'gifts', 'retail', 'other'].map(v => ({ v, label: t(`form.purposes.${v}`) })), f.elements.purpose, { qa: 'bulk.purpose', multi: true });
  const budgetItems = BUDGETS.map(([a, b], i) => ({ v: `b${i}`, label: a == null ? t('form.budgetUnder', { a: k(b) }) : (b == null ? t('form.budgetOver', { a: k(a) }) : t('form.budgetRange', { a: k(a), b: k(b) })) })).concat([{ v: 'notsure', label: t('form.budgetNotSure') }]);
  const budget = chips($('[data-qa="bulk.budget"]'), budgetItems, f.elements.budget, { qa: 'bulk.budget' });
  const sizeLabels = copy.get('form.sizeChips', []);
  const size = chips($('[data-qa="bulk.size"]'), SIZES.map((v, i) => ({ v, label: sizeLabels[i] || `${v} cm` })).concat([{ v: 'mix', label: t('form.sizeMixed') }, { v: 'notsure', label: t('form.sizeNotSure') }]), f.elements.size, { qa: 'bulk.size' });
  const where = chips($('[data-qa="bulk.where"]'), ['indoors', 'outdoors', 'window', 'mix'].map(v => ({ v, label: t(`form.whereChips.${v}`) })), f.elements.where, { qa: 'bulk.where', onChange: on => { $('#bq-where-hint').textContent = on.includes('outdoors') || on.includes('mix') ? t('form.outdoorNote') : ''; } });
  /* same / several */
  const seg = $('[data-qa="bulk.designs"]');
  seg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const on = b.getAttribute('aria-pressed') !== 'true'; $$('button', seg).forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', String(on)); f.elements.designs.value = on ? b.dataset.v : ''; $('#bq-several').hidden = !(on && b.dataset.v === 'several'); });
  /* need-by: honest tight-date note */
  const nb = $('#bq-needby'); const std = addWorkingDays(clock.now(), 10); nb.min = isoDate(clock.now());
  nb.addEventListener('change', () => { const v = nb.value ? new Date(nb.value + 'T12:00:00') : null; const tight = v && v < std; $('#bq-needby-note').textContent = tight ? t('form.needByTight') : t('form.needByNote'); nb.dataset.tight = tight ? '1' : ''; });
  /* files: ≤ 5 × 20 MB */
  let guard = false, pending = null; const zone = $('#bq-drop');
  /* forms.dropzone hides its own type/size message on re-render (INTEGRATION.md): pre-check in the capture phase */
  const precheck = list => { pending = null; for (const fl of Array.from(list || [])) { const okType = /^(image\/(png|jpeg|svg\+xml)|application\/pdf)$/.test(fl.type) || (!fl.type && /\.(png|jpe?g|svg|pdf)$/i.test(fl.name)); if (!okType) pending = t('form.filesType'); else if (fl.size > 20 * 1048576) pending = t('form.filesSize', { name: fl.name }); } };
  zone.addEventListener('drop', e => precheck(e.dataTransfer && e.dataTransfer.files), true);
  zone.addEventListener('change', e => { if (e.target.type === 'file') precheck(e.target.files); }, true);
  const dz = forms.dropzone(zone, { accept: 'image/png,image/jpeg,image/svg+xml,application/pdf', maxMb: 20, multiple: true, onChange: files => {
    if (!guard && files.length > MAX_FILES) { guard = true; const keep = files.slice(0, MAX_FILES); dz.clear(); dz.take(keep); dz.error(t('form.filesMax')); guard = false; return; }
    decorate(dz);
    if (pending && !guard) { const m = pending; pending = null; dz.error(m); }
  } });
  st.dz = dz;
  const bound = forms.bind(f, {
    kind: 'bulk', qa: 'bulk', files: () => dz.files,
    validate: fields => { const n = String(fields.count ?? '').trim() ? Math.round(Number(fields.count)) : NaN; return Number.isFinite(n) && n >= MIN && n <= MAX ? [] : [{ field: 'count', message: Number.isFinite(n) && n > 0 && n < MIN ? t('form.countMin') : t('form.countErr') }]; },
    extra: () => ({ subject: 'Bulk quote request', designs: f.elements.designs.value, needByTight: nb.dataset.tight === '1', fileCount: dz.files.length, page: 'bulk-quote' }),
    onSuccess: (res, fields) => {
      track('bulk_request', { ref: res.ref, count: fields.count });
      done(f, res, fields, () => { bound.reset(); dz.clear(); purpose.clear(); budget.clear(); size.clear(); where.clear(); $$('button', seg).forEach(x => x.setAttribute('aria-pressed', 'false')); f.elements.designs.value = ''; $('#bq-several').hidden = true; paint(); $('#bq-needby-note').textContent = t('form.needByNote'); });
    }
  });
  st.bound = bound;
}
function decorate(dz) {
  const files = dz.files; $$('#bq-drop .c-drop__list li').forEach((li, i) => {
    const fl = files[i]; const img = $('img', li); const rm = $('[data-remove]', li); if (rm) { rm.dataset.qa = 'bulk.drop.remove'; rm.innerHTML = icon('close'); }
    const size = $('.c-drop__size', li); if (fl && size) size.textContent = fl.size < 1048576 ? `${Math.max(1, Math.round(fl.size / 1024))} KB` : `${(fl.size / 1048576).toFixed(1)} MB`;
    if (!fl || !img) return;
    if (fl.type === 'image/svg+xml') img.src = URL.createObjectURL(fl);
    else if (fl.type === 'application/pdf' || /\.pdf$/i.test(fl.name)) { const s = document.createElement('span'); s.className = 'c-drop__thumb c-drop__thumb--doc'; s.innerHTML = icon('drawing'); img.replaceWith(s); }
  });
}
function done(f, res, fields, onAgain) {
  const name = String(fields.name || '').trim().split(/\s+/)[0];
  const card = document.createElement('div'); card.className = 'bq-card bq-done';
  const target = document.createElement('div'); card.appendChild(target);
  const next = (copy.get('confirm.next', []) || []).map(s => copy.fill(s, { email: String(fields.email || '').trim() }));
  forms.renderSuccess(target, { ref: res.ref, local: !!res.local, title: name ? t('confirm.title', { name }) : t('confirm.titleNoName'), body: esc(t('confirm.within')), next, qa: 'bulk' });
  const acts = document.createElement('div'); acts.className = 'bq-done__acts';
  acts.innerHTML = `<a class="c-btn c-btn--ghost" href="/lit-neon-preview/shop.html" data-qa="bulk.confirm.browse">${esc(t('confirm.browse'))}</a><button type="button" class="c-btn c-btn--text" data-qa="bulk.confirm.again"><span class="label">${esc(t('confirm.again'))}</span></button>`;
  card.appendChild(acts); f.replaceWith(card);
  acts.querySelector('button').addEventListener('click', () => { card.replaceWith(f); onAgain(); $('#bq-count').focus(); });
  card.scrollIntoView({ block: 'center', behavior: ui.prefersReducedMotion() ? 'auto' : 'smooth' });
}

/* ---------------- sidebar ---------------- */
function sidebar() {
  $('#bq-who').innerHTML = (copy.get('sidebar.whoList', []) || []).map(x => `<li>${icon('check')}<span>${esc(x)}</span></li>`).join('');
  const el = $('#bq-sheet'); const design = R.normalise({ ...R.DEFAULT_DESIGN, text: t('heroWords', {}, 'Welcome in'), font: 'shoreditch', colour: 'warm', size: 'm' });
  const paint = () => { if (el.offsetWidth) sheetMod.render(el, design, { compact: true, title: t('heroWords', {}, 'Welcome in') }); };
  R.ensureFonts(['shoreditch']).then(paint).catch(paint);
  let raf = 0; new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }).observe(el);
}
