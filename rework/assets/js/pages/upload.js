/* Lit Neon v2 — upload page (brief §4.3, owner P3). Two paths:
   · Logo or artwork → the manual 12h mockup: drop zone (type / size / corrupt checks), a short brief, the rights
     checkbox, forms.submit('mockup') with the file attached; the confirmation renders only on a 2xx.
   · A photo → shared/neon-photo.js traces it ON THE DEVICE; after every render a quality gate reads the result
     (subject, path count, how flat the source is) and asks "Are you happy with this preview?":
       "Buy at this price — £X" (pricing.photo from the engine's ledMetres → basket line kind:'photo', proof first),
       "Send this to a designer first" (preview attached, price shown as indicative),
       "Not quite — let a designer draw it from the photo" (original photo attached).
   Nothing time-, price- or fact-dependent is typed here: prices from pricing.js, dates from clock.now(), facts from
   the registry. Every control carries data-qa="upload.*" (qa/matrix/upload.json). */
import * as copy from 'core/copy.js';
import * as facts from 'core/facts.js';
import * as clock from 'core/clock.js';
import * as ui from 'core/ui.js';
import forms from 'core/forms.js';
import pricing from 'core/pricing.js';
import basket from 'core/basket.js';
import router from 'core/router.js';
import * as R from 'core/renderer.js';
import * as sheetMod from 'core/sheet.js';
import { mount as mountChrome } from 'core/chrome.js';
import { track } from 'core/analytics.js';
import { gbp, esc, fmtDims, fmtDay, fmtHour, fmtMetres, isoDate, addDays } from 'core/money.js';
import 'rules';

const RULES = globalThis.LIT_RULES || {};
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const t = (k, v, f) => copy.t(k, v, f);
const icon = ui.icon;
/* MediaPipe pinned (the engine's default is @latest); loads only when a photo arrives on the photo path (§7.4). */
const SEGMENTER = {
  bundle: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  model: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite',
  timeout: 20000
};
const WIDTHS = ['40', '60', '80', '100', '120+'];
const PHOTO_SIZES = [40, 60, 80, 100, 120];   /* longest side, cm; the engine measures its tube at 80 cm (ENGINE_REF) */
const ENGINE_REF = 80;
const FLAT_LOGO = 0.75;          /* share of flat pixels above which a source reads as a graphic, not a photo (tuned on shared/test-images) */
const state = window.__upload = { size: 60, path: 'logo', gate: null, price: null, args: null, render: null, flat: null, file: null, hash: null, quote: null, mode: null };

/* ====================================================================== boot ====================================================================== */
(async function boot() {
  await Promise.all([copy.load(['chrome', 'upload']), facts.load(), ui.ensureSprite()]);
  mountChrome({ page: 'upload' }).catch(() => {});
  fillCopy();
  hero();
  pathSwitch();
  logoForm();
  photoForm();
  sample();
  faq();
  document.documentElement.dataset.ready = 'upload';
})();

/** [data-copy] text comes from data/copy/upload.json when the key exists (the HTML keeps the same words for no-JS/SEO). */
function fillCopy() {
  $$('[data-copy]').forEach(el => { const v = copy.get(el.dataset.copy); if (typeof v === 'string' && v) el.textContent = v; });
  const ph = (sel, key) => { const v = copy.get(key); if (v && $(sel)) $(sel).placeholder = v; };
  ph('#u-notes', 'brief.notesPlaceholder'); ph('#u-pf-matters', 'photo.mattersPlaceholder');
  const lab = copy.get('drop.aria'); if (lab) $('#u-drop').setAttribute('aria-label', lab);
  /* the 12-hour chip: hours from the confirmed fact; "working" only when the owner says so */
  const chip = $('[data-fact-mockup]');
  if (chip && facts.has('mockupHoursDefinition')) chip.textContent = `Within ${facts.value('mockupHours') || 12} ${facts.value('mockupHoursDefinition') === 'working' ? 'working hours' : 'hours'}`;
}

/* ====================================================================== hero ====================================================================== */
function hero() {
  const cmp = $('#u-compare'); const c = R.colourOf('pink');
  cmp.style.setProperty('--tube', c.hex); cmp.style.setProperty('--core', R.coreOf(c));
  ui.compare(cmp, { initial: 52, labelA: t('hero.compareA'), labelB: t('hero.compareB') });
  const thumb = $('.thumb', cmp); if (thumb) thumb.dataset.qa = 'upload.hero.compare.thumb';
  $('[data-qa="upload.hero.cta.upload"]').addEventListener('click', e => { e.preventDefault(); go('logo', true); });
  $('[data-qa="upload.hero.cta.photo"]').addEventListener('click', e => { e.preventDefault(); go('photo', true); });
}
function go(path, scroll) {
  const panel = path === 'photo' ? 'photo' : 'logo';
  tabsApi.select(panel);
  /* the hero CTAs always leave a shareable #logo / #photo, even when that tab was already open (select() is then a no-op) */
  if (location.hash.slice(1) !== panel) history.replaceState(null, '', location.pathname + location.search + '#' + panel);
  if (scroll) {
    $('#start').scrollIntoView({ behavior: ui.prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    if (path === 'logo') setTimeout(() => $('#u-drop')?.focus({ preventScroll: true }), 450);
  }
}

/* ====================================================================== path switch ====================================================================== */
let tabsApi = null;
function pathSwitch() {
  /* ui.tabs() selects the default tab (logo) while it is being built and fires onChange: that first call must not write
     the hash, or a deep link to /lit-neon-preview/rework/upload.html#photo (or any #anchor) is rewritten to #logo before it is read */
  const initial = location.hash.slice(1); let booting = true;
  tabsApi = ui.tabs($('[data-qa="upload.path"]'), {
    onChange: (el, panel) => {
      state.path = panel;
      if (!booting && location.hash.slice(1) !== panel && (location.hash || panel !== 'logo')) history.replaceState(null, '', location.pathname + location.search + '#' + panel);
      if (panel === 'photo') ensurePhoto();
    }
  });
  booting = false;
  const fromHash = () => { const h = location.hash.slice(1); if (h === 'photo' || h === 'logo') tabsApi.select(h); };
  if (initial === 'photo' || initial === 'logo') tabsApi.select(initial);
  window.addEventListener('hashchange', fromHash);
}

/* ====================================================================== shared form bits ====================================================================== */
/** single-choice chips (toggle off on a second tap; every brief field is optional) */
function chips(group, items, input, { qa, onChange } = {}) {
  group.innerHTML = items.map(i => `<button type="button" class="c-chip" aria-pressed="false" data-v="${esc(i.v)}" data-qa="${qa}.chip">${esc(i.label)}</button>`).join('');
  const set = v => { input.value = v || ''; $$('.c-chip', group).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v))); onChange && onChange(v || ''); };
  group.addEventListener('click', e => { const b = e.target.closest('.c-chip'); if (!b) return; set(b.getAttribute('aria-pressed') === 'true' ? '' : b.dataset.v); });
  return { set, get: () => input.value, label: v => (items.find(i => i.v === (v ?? input.value)) || {}).label || '' };
}
const widthItems = () => { const labels = copy.get('brief.widthChips', []); return WIDTHS.map((v, i) => ({ v, label: labels[i] || `${v} cm` })).concat([{ v: 'notsure', label: t('brief.notSure', {}, 'Not sure') }]); };
/** working days from today (weekends + the rules' bank holidays skipped) */
function addWorkingDays(from, n) { const hol = (RULES.delivery && RULES.delivery.bankHolidays) || []; let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); let k = 0; while (k < n) { d = addDays(d, 1); if (d.getDay() !== 0 && d.getDay() !== 6 && !hol.includes(isoDate(d))) k++; } return d; }
/** the D2 token grammar for faq.json answers ({fact:} {value:} {rule:} {price:from} {exclusions}) — same resolver as the builder's until facts.fill lands */
function fillTokens(s) {
  return String(s || '').replace(/\{(fact|value|rule|price|exclusions)(?::([^}|]+))?(?:\|(\w+))?\}/g, (m, kind, arg, filter) => {
    try {
      if (kind === 'fact') return facts.get(arg) || '';
      if (kind === 'value') { const v = facts.value(arg); return v == null ? '' : String(v); }
      if (kind === 'rule') { const [file, ...p] = arg.split('.'); let v = RULES[file]; for (const k of p) v = v == null ? v : v[k]; return v == null ? '' : (filter === 'money' ? gbp(v) : String(v)); }
      if (kind === 'price') { const from = pricing.fromPrice({ text: 'Open late', font: 'shoreditch', colour: 'warm' }); return from == null ? '' : gbp(from); }
      if (kind === 'exclusions') return pricing.describeExclusions().short;
    } catch { return ''; }
    return '';
  }).replace(/\s{2,}/g, ' ').trim();
}
const dataUrlToFile = async (url, name) => { const b = await (await fetch(url)).blob(); return new File([b], name, { type: b.type || 'image/png' }); };
async function hashOf(blob) {
  try { const buf = await blob.arrayBuffer(); const d = await crypto.subtle.digest('SHA-256', buf); return Array.from(new Uint8Array(d)).slice(0, 10).map(x => x.toString(16).padStart(2, '0')).join(''); }
  catch { let h = 5381; const s = `${blob.size}|${blob.type}|${blob.name || ''}`; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'x' + (h >>> 0).toString(16); }
}
/** "Mockup by Wed 21 Oct, 14:00" only when the owner has confirmed the hours are clock hours; else the fallback phrase */
function mockupWhen() {
  if (facts.has('mockupHoursDefinition') && facts.value('mockupHoursDefinition') === 'clock') {
    const d = new Date(clock.now().getTime() + (facts.value('mockupHours') || 12) * 3600e3);
    return t('confirm.mockupBy', { when: `${fmtDay(d)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` });
  }
  const within = facts.has('mockupHoursDefinition') ? `within ${facts.value('mockupHours') || 12} working hours` : (facts.get('mockupHoursDefinition') || 'within 12 hours');
  return t('confirm.mockupWithin', { within });
}
/** confirmation card in place of a form; returns the card */
function confirmInto(slot, form, res, fields, { qa, onAgain }) {
  const name = String(fields.name || '').trim().split(/\s+/)[0];
  const card = document.createElement('div'); card.className = 'u-card u-done';
  const target = document.createElement('div'); card.appendChild(target);
  const next = (copy.get('confirm.next', []) || []).map(s => copy.fill(s, { email: String(fields.email || '').trim() }));
  forms.renderSuccess(target, { ref: res.ref, local: !!res.local, title: name ? t('confirm.title', { name }) : t('confirm.titleNoName'), body: `<span class="u-done__when">${esc(mockupWhen())}</span>`, next, qa });
  const acts = document.createElement('div'); acts.className = 'u-done__acts';
  acts.innerHTML = `<a class="c-btn c-btn--ghost" href="/lit-neon-preview/rework/create.html" data-qa="${qa}.confirm.design">${esc(t('confirm.wait'))}</a><button type="button" class="c-btn c-btn--text" data-qa="${qa}.confirm.again"><span class="label">${esc(t('confirm.again'))}</span></button>`;
  card.appendChild(acts);
  form.replaceWith(card);
  acts.querySelector('button').addEventListener('click', () => { card.replaceWith(form); onAgain && onAgain(); form.querySelector('input:not([type=hidden]), button')?.focus(); });
  card.scrollIntoView({ block: 'center', behavior: ui.prefersReducedMotion() ? 'auto' : 'smooth' });
  return card;
}

/* ====================================================================== logo path ====================================================================== */
let dz = null;
function logoForm() {
  const form = $('#u-logo-form');
  /* drop zone: type/size from forms.dropzone, plus a decode check so a corrupt file is caught before upload */
  const checked = new WeakSet();
  /* forms.dropzone hides its own type/size message when it re-renders (INTEGRATION.md), so the page pre-checks each
     incoming file in the capture phase and re-shows the reason right after the dropzone's render */
  let pending = null; const zone = $('#u-drop');
  const precheck = list => { pending = null; for (const f of Array.from(list || [])) { const m = rejectReason(f, 20); if (m) pending = m; } };
  zone.addEventListener('drop', e => precheck(e.dataTransfer && e.dataTransfer.files), true);
  zone.addEventListener('change', e => { if (e.target.type === 'file') precheck(e.target.files); }, true);
  dz = forms.dropzone(zone, { accept: 'image/png,image/jpeg,image/svg+xml,application/pdf', maxMb: 20, onChange: files => {
    decorateDrop();
    if (pending) { const m = pending; pending = null; dz.error(m); }
    const fresh = files.filter(f => !checked.has(f)); fresh.forEach(f => checked.add(f));
    fresh.forEach(async f => { if (!(await readable(f))) { dz.clear(); dz.error(t('drop.errCorrupt', { name: f.name })); } });
  } });
  /* brief */
  const width = chips($('[data-qa="upload.width"]'), widthItems(), form.elements.width, { qa: 'upload.width', onChange: v => {
    const hints = copy.get('brief.widthHints', []); const i = WIDTHS.indexOf(v);
    $('#u-width-hint').textContent = v === 'notsure' ? t('brief.notSureHint') : (i >= 0 ? hints[i] || '' : t('brief.widthHelp'));
  } });
  const whereItems = ['indoors', 'outdoors', 'window'].map(v => ({ v, label: t(`brief.whereChips.${v}`) }));
  const where = chips($('[data-qa="upload.where"]'), whereItems, form.elements.where, { qa: 'upload.where', onChange: v => { $('#u-where-hint').textContent = v ? t(`brief.whereHints.${v}`) : ''; } });
  /* colours: tube swatches (multi) + "Match my artwork" (exclusive) */
  const sw = $('[data-qa="upload.colours"]');
  sw.innerHTML = R.OPTIONS.colours.map(c => `<button type="button" class="c-swatch${c.rgb ? ' c-swatch--rgb' : ''}" aria-pressed="false" data-id="${c.id}" data-qa="upload.colours.swatch" style="--tube:${c.hex};--core:${c.core || R.coreOf(c)}" aria-label="${esc(c.name)}"><span class="tube"></span><span class="name">${esc(c.name)}</span></button>`).join('')
    + `<button type="button" class="c-chip u-match" aria-pressed="false" data-id="match" data-qa="upload.colours.match">${esc(t('brief.match'))}</button>`;
  const syncColours = () => { const on = $$('[aria-pressed="true"]', sw).map(b => b.dataset.id === 'match' ? t('brief.match') : R.colourOf(b.dataset.id).name); form.elements.colours.value = on.join(', '); };
  sw.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const on = b.getAttribute('aria-pressed') !== 'true';
    if (b.dataset.id === 'match' && on) $$('.c-swatch', sw).forEach(x => x.setAttribute('aria-pressed', 'false'));
    if (b.dataset.id !== 'match' && on) $('.u-match', sw).setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-pressed', String(on)); syncColours();
  });
  /* deadline: earliest = today + 10 working days; earlier dates are allowed but flagged honestly */
  const dl = $('#u-deadline'); const min = addWorkingDays(clock.now(), 10);
  dl.min = isoDate(clock.now()); dl.dataset.standardMin = isoDate(min);
  dl.addEventListener('change', () => {
    const note = $('#u-deadline-note'); const v = dl.value ? new Date(dl.value + 'T12:00:00') : null;
    const tight = v && v < min; note.textContent = tight ? t('brief.deadlineTight') : t('brief.deadlineNote'); note.classList.toggle('is-warn', !!tight); dl.dataset.tight = tight ? '1' : '';
  });
  /* ?from=builder: notes prefilled with the design in the builder (and the nearest width chip) */
  if (new URLSearchParams(location.search).get('from') === 'builder') {
    const rec = router.design && router.design.get ? router.design.get() : null; const st = rec && rec.state;
    if (st && String(st.text || '').trim()) {
      const res = R.resolve(st); const sizeName = res.sizeId === 'custom' ? 'custom size' : R.sizeOf(res.sizeId).name;
      $('#u-notes').value = t('brief.fromBuilder', { words: res.lines.join(' / '), lettering: res.font.name, colour: res.colour.name, size: res.dims ? `${sizeName}, ${fmtDims(res.dims.W, res.dims.H)}` : sizeName });
      if (res.dims) { const near = WIDTHS.map(Number).reduce((a, b) => Math.abs(b - res.dims.W) < Math.abs(a - res.dims.W) ? b : a, 40); width.set(res.dims.W > 110 ? '120+' : String(near)); }
    }
  }
  const bound = forms.bind(form, {
    kind: 'mockup', qa: 'upload', files: () => dz.files,
    extra: () => ({ subject: 'Free mockup request (logo or artwork)', path: 'logo', widthLabel: width.label(), whereLabel: where.label(), deadlineTight: dl.dataset.tight === '1', page: 'upload' }),
    onSuccess: (res, fields) => {
      track('mockup_request', { path: 'logo', ref: res.ref });
      confirmInto($('#u-logo-slot'), form, res, fields, { qa: 'upload', onAgain: () => { bound.reset(); dz.clear(); width.set(''); where.set(''); $$('[aria-pressed]', sw).forEach(b => b.setAttribute('aria-pressed', 'false')); syncColours(); $('#u-deadline-note').textContent = t('brief.deadlineNote'); } });
    }
  });
  state.logo = { form, bound, dz, width, where };
}
/** dropzone list: real thumbnails for SVG, a document glyph for PDF, data-qa on the remove buttons */
function decorateDrop() {
  const files = dz.files; $$('#u-drop .c-drop__list li').forEach((li, i) => {
    const f = files[i]; const img = $('img', li); const rm = $('[data-remove]', li); if (rm) { rm.dataset.qa = 'upload.drop.remove'; rm.innerHTML = icon('close'); }
    const size = $('.c-drop__size', li); if (f && size) size.textContent = f.size < 1048576 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1048576).toFixed(1)} MB`;
    if (!f || !img) return;
    if (f.type === 'image/svg+xml') img.src = URL.createObjectURL(f);
    else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) { const s = document.createElement('span'); s.className = 'c-drop__thumb c-drop__thumb--doc'; s.innerHTML = icon('drawing'); img.replaceWith(s); }
  });
}
/** why a file would be refused (type, size, empty) — the same rules forms.dropzone applies */
function rejectReason(f, maxMb) {
  const okType = /^(image\/(png|jpeg|svg\+xml)|application\/pdf)$/.test(f.type) || (!f.type && /\.(png|jpe?g|svg|pdf)$/i.test(f.name));
  if (!okType) return t('drop.errType');
  if (f.size > maxMb * 1048576) return t('drop.errSize');
  if (!f.size) return t('drop.errCorrupt', { name: f.name });
  return null;
}
/** can the browser open it? PNG/JPG decode, SVG has an <svg> root, PDF starts with %PDF- */
async function readable(f) {
  try {
    if (/^image\/(png|jpeg)$/.test(f.type)) { const b = await createImageBitmap(f); b.close && b.close(); return true; }
    if (f.type === 'image/svg+xml' || /\.svg$/i.test(f.name)) return /<svg[\s>]/i.test(await f.slice(0, 4096).text());
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return (await f.slice(0, 5).text()) === '%PDF-';
    return true;
  } catch { return false; }
}

/* ====================================================================== sample proof sheet ====================================================================== */
function sample() {
  const el = $('#u-sample-sheet'); const design = R.normalise({ ...R.DEFAULT_DESIGN, text: 'Lit Neon', font: 'soho', colour: 'pink', size: 'm' });
  const paint = () => { if (el.offsetWidth) sheetMod.render(el, design, { compact: true, title: 'Lit Neon' }); };
  R.ensureFonts(['shoreditch']).then(paint).catch(paint);
  let raf = 0; new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }).observe(el);
}

/* ====================================================================== FAQ ====================================================================== */
async function faq() {
  let data = null; try { data = await (await fetch('/lit-neon-preview/rework/data/faq.json')).json(); } catch { data = null; }
  const qs = (data && data.questions || []).filter(q => (q.pages || []).includes('upload'));
  const root = $('#u-faq');
  root.innerHTML = qs.map(q => {
    const v = (q.variants || []).find(x => x.when && x.when.startsWith('fact:') && facts.has(x.when.slice(5)));
    const links = (q.links || []).map(l => `<a href="/lit-neon-preview/rework/${esc(String(l.href).replace(/^\//, ''))}" data-qa="upload.faq.link">${esc(l.label)}</a>`).join('');
    return `<details id="${esc(q.id)}" data-qa="upload.faq.item"><summary data-qa="upload.faq.q"><span class="label">${esc(q.q)}</span>${icon('chevron-down')}</summary><div class="c-acc__body prose"><p>${esc(fillTokens(v ? v.a : q.a))}</p>${links ? `<p class="links">${links}</p>` : ''}</div></details>`;
  }).join('');
  ui.accordion(root, { single: false });
}

/* ====================================================================== photo path ====================================================================== */
let photoCtl = null, photoLoading = null, renderTimer = 0;
async function ensurePhoto() {
  if (photoCtl || photoLoading) return photoLoading;
  photoLoading = (async () => {
    const host = $('#u-photo');
    host.innerHTML = ui.skeleton('card');
    try { await import('neon-photo'); } catch { host.innerHTML = `<p class="u-gate__wait">${esc(t('photo.privacy'))}</p>`; return; }
    const palette = R.OPTIONS.colours.filter(c => !c.rgb).map(c => ({ id: c.id, name: c.name, hex: c.hex, core: c.core }));
    photoCtl = window.LitNeonPhoto.mount(host, { colour: R.colourOf('warm').hex, palette, segmenter: SEGMENTER, onQuote: p => { state.quote = p; } });
    tagEngine(host);
    const stageEl = $('.lnp-result', host); if (stageEl) { stageEl.insertAdjacentHTML('beforeend', ui.pill('rendered', t('photo.rendered', {}, 'Rendered preview'))); stageEl.dataset.composite = ''; }
    /* keep the original photo (the engine only keeps pixels): capture-phase listeners run before the engine's own */
    host.addEventListener('change', e => { const f = e.target && e.target.type === 'file' && e.target.files && e.target.files[0]; if (f) newSource(f, 'upload'); }, true);
    host.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) newSource(f, 'upload'); }, true);
    host.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (!b) return; if (b.textContent.trim() === 'Capture') newSource(null, 'camera'); if (b.textContent.trim() === 'Try another photo') resetGate(); }, true);
    host.addEventListener('lnp:rendered', e => { state.render = e.detail; clearTimeout(renderTimer); renderTimer = setTimeout(updateGate, 160); });
    /* the engine's own controls change the design: re-read after each */
    host.addEventListener('input', () => { clearTimeout(renderTimer); renderTimer = setTimeout(updateGate, 260); });
  })();
  return photoLoading;
}
/** data-qa on the engine's controls (the engine is shared and has no hooks of its own) */
function tagEngine(host) {
  const byText = (sel, text, qa) => $$(sel, host).forEach(b => { if (b.textContent.trim() === text) b.dataset.qa = qa; });
  byText('.lnp-btn', 'Choose a photo', 'upload.photo.choose'); byText('.lnp-btn', 'Use camera', 'upload.photo.camera');
  byText('.lnp-btn', 'Capture', 'upload.photo.capture'); byText('.lnp-btn', 'Cancel', 'upload.photo.cancelcam'); byText('.lnp-btn', 'Switch camera', 'upload.photo.flip');
  byText('.lnp-btn', 'Resume camera', 'upload.photo.resume'); byText('.lnp-btn', 'Choose a photo instead', 'upload.photo.instead');
  byText('.lnp-btn', 'Get a quote for this design', 'upload.photo.enginequote');
  byText('.lnp-link', 'Download PNG', 'upload.photo.download'); byText('.lnp-link', 'Try another photo', 'upload.photo.reset');
  byText('.lnp-seg button', 'Lights on', 'upload.photo.lights.on'); byText('.lnp-seg button', 'Lights off', 'upload.photo.lights.off');
  $$('input[type=file]', host).forEach(i => { i.dataset.qa = 'upload.photo.input'; });
  $$('input[type=range]', host).forEach(i => { i.dataset.qa = `upload.photo.${i.dataset.ctl}`; });
  $$('.lnp-sw', host).forEach(b => { b.dataset.qa = 'upload.photo.swatch'; });
  $$('.lnp-check', host).forEach(l => { const i = $('input', l); if (i) i.dataset.qa = /two/i.test(l.textContent) ? 'upload.photo.twotone' : 'upload.photo.outline'; });
}
async function newSource(file, source) {
  state.file = file; state.source = source; state.flat = null; state.hash = null; state.gate = null;
  if (file) { state.hash = await hashOf(file); state.flat = await flatness(file); }
  updateGate();
}
/** share of near-flat pixels in a 128 px thumbnail: graphics (logos, line art) are mostly flat; photos are textured */
async function flatness(file) {
  try {
    const bmp = await createImageBitmap(file); const k = 128 / Math.max(bmp.width, bmp.height); const w = Math.max(8, Math.round(bmp.width * k)), h = Math.max(8, Math.round(bmp.height * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bmp, 0, 0, w, h); bmp.close && bmp.close();
    const d = x.getImageData(0, 0, w, h).data; let flat = 0, n = 0;
    for (let y = 0; y < h - 1; y++) for (let i = 0; i < w - 1; i++) {
      const p = (y * w + i) * 4, r = p + 4, b = p + w * 4; n++;
      if (d[p + 3] < 16) { flat++; continue; }
      const diff = Math.max(Math.abs(d[p] - d[r]), Math.abs(d[p + 1] - d[r + 1]), Math.abs(d[p + 2] - d[r + 2]), Math.abs(d[p] - d[b]), Math.abs(d[p + 1] - d[b + 1]), Math.abs(d[p + 2] - d[b + 2]));
      if (diff <= 6) flat++;
    }
    return n ? Math.round(flat / n * 1000) / 1000 : null;
  } catch { return null; }
}
/** §4.3 quality gate: ready (logo-like) · good (person) · pet · detailed (> 60 paths, or a photo with no subject) · fallback */
function classify(d, flat) {
  if (!d || !d.ledMetres || !d.paths) return null;
  const logoLike = flat != null && flat >= FLAT_LOGO;
  if (d.paths > 60) return 'detailed';
  if (d.subject === 'person') return 'good';
  if (d.subject === 'pet') return 'pet';
  if (logoLike && d.paths <= 40) return 'ready';
  if (!logoLike && d.seg && d.seg.enabled && d.seg.error && d.paths <= 40) return 'fallback';   /* MediaPipe didn't load: we can't tell, so a designer refines it */
  return 'detailed';
}
const TONE = { ready: 'ok', good: 'info', pet: 'amber', detailed: 'amber', fallback: 'amber' };
const BUYABLE = new Set(['ready', 'good', 'pet']);
function quoteNow() { state.quote = null; const b = $('[data-qa="upload.photo.enginequote"]'); if (b) b.click(); return state.quote; }
function resetGate() { state.render = null; state.gate = null; state.price = null; $('#u-gate-body').hidden = true; $('#u-gate-wait').hidden = false; closePhotoForm(); }
function updateGate() {
  const d = state.render; const g = classify(d, state.flat);
  if (!g) { resetGate(); return; }
  state.gate = g;
  const q = quoteNow(); const s = q && q.settings;
  /* the engine draws the sign ENGINE_REF cm on its longest side; at the chosen size the tube scales with it */
  const k = state.size / ENGINE_REF;
  const W = Math.max(10, Math.round((s && s.widthCm ? s.widthCm : ENGINE_REF) * k)), H = Math.max(10, Math.round((s && s.heightCm ? s.heightCm : ENGINE_REF * .45) * k));
  const led = Math.round(d.ledMetres * k * 10) / 10;
  state.args = { ledMetres: led, heightCm: H, options: { backing: 'cut', finish: 'clear', rgb: false, widthCm: W } };
  const p = pricing.photo(led, H, state.args.options); state.price = p; state.dims = { W, H };
  /* read-out */
  $('#u-gate-wait').hidden = true; $('#u-gate-body').hidden = false;
  const sc = $('#u-score'); sc.dataset.tone = TONE[g]; sc.dataset.gate = g; $('span', sc).textContent = t(`photo.gate.${g}`);
  $('use', sc).setAttribute('href', `#i-${g === 'ready' ? 'check' : (g === 'good' ? 'info' : 'pencil')}`);
  $('#u-gate-why').textContent = t(`photo.gateWhy.${g}`);
  $('#u-gate-size').textContent = `${t('photo.size', { size: fmtDims(W, H), metres: fmtMetres(led) })} · ${t('photo.sizeNote')}`;
  $$('[data-qa="upload.photo.sizes"] .c-chip').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === state.size)));
  const twoTone = !!(s && s.twoTone);
  const canBuy = BUYABLE.has(g) && p.kind === 'price' && !twoTone;
  const buy = $('#u-buy'), designer = $('#u-designer'), note = $('#u-gate-note'), priceEl = $('#u-gate-price');
  buy.hidden = !canBuy; $('#u-buyline').hidden = !canBuy;
  designer.classList.toggle('c-btn--primary', !canBuy); designer.classList.toggle('c-btn--ghost', canBuy);
  if (canBuy) {
    $('.label', buy).textContent = t('photo.buy', { price: gbp(p.payable) });
    buy.dataset.price = String(p.payable);
    priceEl.innerHTML = `<span class="amt" data-qa="upload.photo.price.amount">${gbp(p.payable)}</span>${p.promoLine ? `<span class="promo" data-qa="upload.photo.price.promo">${esc(p.promoLine)}</span>` : ''}`;
    note.hidden = true;
  } else {
    priceEl.innerHTML = p.kind === 'price' ? `<span class="ind">${esc(t('photo.indicative', { price: gbp(p.payable) }))}</span>` : '';
    note.hidden = false; note.textContent = p.kind !== 'price' ? t('photo.buyQuote') : (twoTone ? t('photo.buyTwoTone') : t('photo.buyGated'));
  }
}
/* ---------- photo outcomes ---------- */
let pfBound = null, pfWidth = null, pfFiles = [];
function photoForm() {
  const form = $('#u-photo-form');
  pfWidth = chips($('[data-qa="upload.photoform.width"]'), widthItems(), form.elements.width, { qa: 'upload.photoform.width' });
  const sizes = $('[data-qa="upload.photo.sizes"]');
  sizes.innerHTML = PHOTO_SIZES.map(v => `<button type="button" class="c-chip" aria-pressed="${v === state.size}" data-v="${v}" data-qa="upload.photo.sizes.chip">${v} cm</button>`).join('');
  sizes.addEventListener('click', e => { const b = e.target.closest('.c-chip'); if (!b) return; state.size = +b.dataset.v; updateGate(); });
  $('#u-buy').addEventListener('click', buyPhoto);
  $('#u-designer').addEventListener('click', () => openPhotoForm('designer'));
  $('#u-notquite').addEventListener('click', () => openPhotoForm('draw'));
  $('#u-pf-cancel').addEventListener('click', () => { closePhotoForm(); $('#u-gate').scrollIntoView({ block: 'center' }); $('#u-designer').focus({ preventScroll: true }); });
  pfBound = forms.bind(form, {
    kind: 'mockup', qa: 'upload.photoform', files: () => pfFiles,
    extra: () => { const d = state.render || {}; const p = state.price || {}; const s = (state.quote && state.quote.settings) || {};
      return { subject: state.mode === 'draw' ? 'Mockup request (draw from my photo)' : 'Mockup request (photo preview)', path: 'photo', mode: state.mode, gate: state.gate, ledMetres: d.ledMetres, lines: d.paths, detectedSubject: d.subject || 'graphic',
        indicativePrice: p.kind === 'price' ? p.payable : '', indicativeSize: state.dims ? `${state.dims.W} x ${state.dims.H} cm` : '', settings: JSON.stringify(s), photoHash: state.hash || '', widthLabel: pfWidth.label(), page: 'upload' }; },
    onSuccess: (res, fields) => {
      track('mockup_request', { path: 'photo', mode: state.mode, ref: res.ref });
      const slot = $('#u-photoform-slot');
      confirmInto(slot, form, res, fields, { qa: 'upload.photoform', onAgain: () => { pfBound.reset(); pfWidth.set(''); closePhotoForm(); } });
    }
  });
}
async function openPhotoForm(mode) {
  if (!state.render) return;
  state.mode = mode; const form = $('#u-photo-form');
  const q = quoteNow(); pfFiles = [];
  let thumb = '', what = '';
  if (mode === 'draw' && state.file) { pfFiles = [state.file]; what = t('photo.attachedPhoto'); thumb = URL.createObjectURL(state.file); }
  else if (q) { pfFiles = [await dataUrlToFile(q.png, 'neon-preview.png')]; what = state.source === 'camera' ? t('photo.attachedCamera') : t('photo.attachedPreview'); thumb = q.png; }
  $('#u-pf-title').textContent = t(mode === 'draw' ? 'photo.formDrawTitle' : 'photo.formDesignerTitle');
  const p = state.price; const ind = p && p.kind === 'price' && mode === 'designer' ? ` ${t('photo.indicative', { price: gbp(p.payable) })}.` : '';
  $('#u-pf-lede').textContent = t(mode === 'draw' ? 'photo.formDrawLede' : 'photo.formDesignerLede') + ind;
  $('#u-pf-attached').innerHTML = what ? `${thumb ? `<img src="${esc(thumb)}" alt="">` : ''}<span>${esc(t('photo.attached', { what }))}</span>` : '';
  $('#u-pf-matters-f').hidden = mode !== 'draw';
  form.dataset.mode = mode;
  const slot = $('#u-photoform-slot'); slot.hidden = false;
  if (!slot.contains(form)) { const done = $('.u-done', slot); if (done) done.replaceWith(form); }
  form.scrollIntoView({ block: 'start', behavior: ui.prefersReducedMotion() ? 'auto' : 'smooth' });
  setTimeout(() => $('#u-pf-title').setAttribute('tabindex', '-1') || $('#u-pf-title').focus({ preventScroll: true }), 300);
}
function closePhotoForm() { const slot = $('#u-photoform-slot'); if (slot) slot.hidden = true; }
/** a 480 px JPEG of the preview for the basket line (localStorage stays small); the full PNG goes with the proof request */
async function smallPreview(dataUrl) {
  try { const img = new Image(); img.src = dataUrl; await img.decode(); const k = Math.min(1, 480 / img.naturalWidth); const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.82); }
  catch { return null; }
}
async function buyPhoto() {
  const btn = $('#u-buy'); if (btn.hidden || !state.render || !state.price || state.price.kind !== 'price') return;
  const q = quoteNow(); if (!q) return;
  ui.setBusy(btn, true);
  const s = q.settings; const pal = R.OPTIONS.colours.find(c => c.hex.toLowerCase() === String(s.colour).toLowerCase());
  if (!state.hash) state.hash = await hashOf(await (await fetch(q.png)).blob());
  const st = R.normalise({ ...R.DEFAULT_DESIGN, text: '', colour: pal ? pal.id : 'warm', backing: 'cut', board: 'clear' });
  const meta = { ledMetres: state.args.ledMetres, heightCm: state.args.heightCm, widthCm: state.args.options.widthCm, sizeCm: state.size, photoHash: state.hash, png: await smallPreview(q.png), name: t('photo.basketName'), gate: state.gate, subject: s.subject, settings: { detail: s.detail, thickness: s.thickness, smoothness: s.smoothness, outlineOnly: s.outlineOnly, colour: pal ? pal.id : s.colour } };
  const res = basket.add({ kind: 'photo', state: st, qty: 1, meta });
  ui.setBusy(btn, false);
  state.added = res.uid;
  ui.flashSuccess(btn, `${t('photo.buyAdded')} ✓`);
  basket.open();
}
