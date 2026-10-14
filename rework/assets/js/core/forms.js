/* Lit Neon v2 — forms adapter (brief §3.11): every submission is real. forms.submit(kind, fields, files) posts through the
   driver in /lit-neon-preview/rework/config/forms.json: `webhook` (FormData POST to Formspree/Basin/Worker; success ONLY on a 2xx) or `local`
   (review mode only; localStorage.requests/captures, labelled "Saved locally"). Reference numbers (LN-M-…) are generated
   here and sent in the POST so inbox and screen agree. Also the UI helpers pages share: bind(form), dropzone(el),
   fieldError(), the rights checkbox rule, and the pending / error+Retry / success states.
   Node-safe: createForms({ fetch, storage, isReview, config, now }) for tests; the default reads config lazily. */
import * as clock from './clock.js';
import { esc } from './money.js';

export const KIND_PREFIX = { mockup: 'M', bulk: 'B', contact: 'C', emailDesign: 'E', quizEmail: 'Q', quote: 'R', capture: 'E' };
export const DEFAULT_CONFIG = { driver: 'webhook', endpoint: '', maxFileMb: 20, kinds: {} };
const ACCEPT = { mockup: 'image/png,image/jpeg,image/svg+xml,application/pdf', bulk: 'image/png,image/jpeg,image/svg+xml,application/pdf' };

const EMAIL_NEED = { mockup: 'An email address, so we can send your mockup', bulk: 'An email address, so we can send your quote', quote: 'An email address, so we can send your quote', contact: 'An email address, so we can reply', emailDesign: 'An email address, so we can send your design', quizEmail: 'An email address, so we can send your picks' };
/* sprite symbols are stroke-only paths: the stroke/fill attributes keep them from rendering as solid black shapes */
const ICON = (id, px = 16) => `<svg class="ic c-icon" aria-hidden="true" focusable="false" width="${px}" height="${px}" style="width:${px}px;height:${px}px;flex:0 0 auto" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><use href="/lit-neon-preview/rework/assets/img/icons.svg#${id}"/></svg>`;

/** reference number: config/forms.json kinds[kind].refPrefix wins ("LN-E"); KIND_PREFIX is the fallback before the config
    loads (tests/forms.test.js keeps the two equal, so screen, inbox and the config never disagree) */
export function makeRef(kind, now = () => Date.now(), cfg = null) {
  const k = cfg && cfg.kinds && cfg.kinds[kind]; const pre = k && typeof k === 'object' && /^[A-Z]{2}-[A-Z]$/.test(k.refPrefix || '') ? k.refPrefix : `LN-${KIND_PREFIX[kind] || 'X'}`;
  return `${pre}-${now().toString(36).toUpperCase()}`;
}

export function createForms({ fetch: fetchFn, storage, isReview, config, now = () => clock.now().getTime() } = {}) {
  const F = fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  const store = storage === undefined ? (() => { try { return globalThis.localStorage || null; } catch { return null; } })() : storage;
  const review = isReview || (() => clock.isReview());
  let cfg = config || null, cfgPromise = null;
  async function loadConfig() {
    if (cfg) return cfg; if (cfgPromise) return cfgPromise;
    cfgPromise = (async () => { try { const r = await F('/lit-neon-preview/rework/config/forms.json', { cache: 'no-store' }); cfg = r.ok ? Object.assign({}, DEFAULT_CONFIG, await r.json()) : { ...DEFAULT_CONFIG }; } catch { cfg = { ...DEFAULT_CONFIG }; } return cfg; })();
    return cfgPromise;
  }
  const endpointFor = (c, kind) => (c.kinds && c.kinds[kind] && (typeof c.kinds[kind] === 'string' ? c.kinds[kind] : c.kinds[kind].endpoint)) || c.endpoint || '';
  const listRead = k => { try { return JSON.parse((store && store.getItem(k)) || '[]'); } catch { return []; } };
  const listWrite = (k, v) => { try { store && store.setItem(k, JSON.stringify(v.slice(-100))); } catch {} };

  /** Validate before a network call. Returns [] or [{ field, message }]. */
  function validate(kind, fields, files = []) {
    const errs = [];
    const need = (k, msg) => { if (!fields[k] || !String(fields[k]).trim()) errs.push({ field: k, message: msg }); };
    if (kind !== 'quizEmail' && kind !== 'emailDesign') need('name', 'Your name, so we know who to write to');
    if (['mockup', 'bulk', 'contact', 'emailDesign', 'quizEmail', 'quote'].includes(kind)) {
      need('email', EMAIL_NEED[kind] || 'An email address, so we can reply');
      if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(fields.email).trim())) errs.push({ field: 'email', message: 'That email address doesn’t look right' });
    }
    if ((kind === 'mockup' || kind === 'bulk') && files.length && !(fields.rights === true || fields.rights === 'on' || fields.rights === 'true')) errs.push({ field: 'rights', message: 'Tick to confirm you have the right to use this artwork' });
    if (kind === 'mockup' && !files.length && !fields.noFile) errs.push({ field: 'file', message: 'Add your logo or artwork (PNG, JPG, SVG or PDF)' });
    /* Replying to the shopper's own request needs no consent tick (UK GDPR: their request is the basis), and a marketing
       opt-in may never be a condition of service (PECR). So the `consent` checkbox is recorded in the payload but does
       not block a send — unless config/forms.json sets "requireConsent": true (owner/legal call, INTEGRATION.md). */
    if (fields.consent === false && cfg && cfg.requireConsent === true) errs.push({ field: 'consent', message: 'Tick to let us reply by email' });
    return errs;
  }

  /** submit(kind, fields, files) → { ok, ref, status, driver, local?, error? }. Never throws for network/driver failures. */
  async function submit(kind, fields = {}, files = []) {
    const c = await loadConfig(); const ref = fields._ref || makeRef(kind, now, c);
    const errs = validate(kind, fields, files);
    if (errs.length) return { ok: false, error: 'validation', errors: errs, ref, driver: c.driver };
    const payload = { ...fields, _ref: ref, _kind: kind, _page: typeof location !== 'undefined' ? location.pathname : '', _submittedAt: new Date(now()).toISOString(), _files: files.map(f => ({ name: f.name, size: f.size, type: f.type })) };
    if (c.driver === 'local') {
      if (!review()) return { ok: false, error: 'driver', message: 'This form isn’t connected yet. Please contact us another way.', ref, driver: 'local' };
      const key = kind === 'emailDesign' || kind === 'quizEmail' ? 'captures' : 'requests';
      listWrite(key, listRead(key).concat([payload]));
      return { ok: true, ref, status: 200, driver: 'local', local: true, message: 'Saved locally (review build) — nothing was sent.' };
    }
    const endpoint = endpointFor(c, kind);
    if (!endpoint || !F) return { ok: false, error: 'config', message: 'This form isn’t connected yet. Please contact us another way.', ref, driver: 'webhook' };
    const fd = typeof FormData !== 'undefined' ? new FormData() : null;
    let body; if (fd) { for (const [k, v] of Object.entries(payload)) fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v)); files.forEach((f, i) => fd.append(files.length > 1 ? `file${i + 1}` : 'file', f, f.name)); body = fd; }
    else body = JSON.stringify(payload);
    try {
      const r = await F(endpoint, { method: 'POST', body, headers: fd ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' } });
      if (r.ok) return { ok: true, ref, status: r.status, driver: 'webhook' };
      return { ok: false, error: 'status', status: r.status, ref, driver: 'webhook', message: 'That didn’t send. Nothing was lost — try again.' };
    } catch (e) { return { ok: false, error: 'network', ref, driver: 'webhook', message: 'You look offline. Nothing was lost — try again when you’re back.' }; }
  }

  /* ---------- UI helpers ---------- */
  const SPINNER = '<span class="c-spinner" aria-hidden="true"></span>';
  function fieldError(input, message) {
    if (!input) return; input.setAttribute('aria-invalid', 'true');
    const dropErr = input.classList.contains('c-drop') ? input.querySelector('.c-drop__error') : null;
    if (dropErr) { dropErr.hidden = false; dropErr.textContent = message; return; }   /* a dropzone shows its error in its own slot */
    const id = (input.id || input.name || 'f') + '-err'; let el = input.form ? input.form.querySelector('#' + CSS.escape(id)) : null;
    if (!el) {
      el = document.createElement('p'); el.id = id; el.className = 'c-input__error'; el.setAttribute('role', 'alert');
      /* never inside the control itself (an <input> carries .c-input and is a void element → a 0 px message):
         the nearest .c-field ABOVE the control, else after its wrapping <label> (checkboxes), else after the control. */
      const parent = input.parentElement;
      const field = parent && parent.closest('.c-field');
      if (field && field !== input) field.appendChild(el);
      else if (parent && parent.tagName === 'LABEL') parent.insertAdjacentElement('afterend', el);
      else input.insertAdjacentElement('afterend', el);
    }
    el.style.display = 'flex'; el.style.gap = '6px'; el.style.alignItems = 'flex-start';
    el.innerHTML = `${ICON('i-warning').replace('flex:0 0 auto', 'flex:0 0 auto;margin-top:2px')}<span>${esc(message)}</span>`;
    { const ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean); if (!ids.includes(id)) ids.push(id); input.setAttribute('aria-describedby', ids.join(' ')); }
  }
  /** clear ONE control's error (message, red border, describedby) — called as the shopper fixes the field */
  function clearFieldError(input) {
    if (!input) return; input.removeAttribute('aria-invalid');
    const dropErr = input.classList.contains('c-drop') ? input.querySelector('.c-drop__error') : null;
    if (dropErr) { dropErr.hidden = true; dropErr.textContent = ''; return; }
    const id = (input.id || input.name || 'f') + '-err'; const el = input.form ? input.form.querySelector('#' + CSS.escape(id)) : document.getElementById(id);
    if (el) el.remove();
    const ids = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(x => x && x !== id); ids.length ? input.setAttribute('aria-describedby', ids.join(' ')) : input.removeAttribute('aria-describedby');
  }
  function clearErrors(form) { form.querySelectorAll('[aria-invalid="true"]').forEach(i => i.removeAttribute('aria-invalid')); form.querySelectorAll('.c-input__error').forEach(e => { if (e.classList.contains('c-drop__error')) { e.hidden = true; e.textContent = ''; } else e.remove(); }); const s = form.querySelector('.c-form__status'); if (s) { s.hidden = true; s.innerHTML = ''; } }  /* a dropzone's error slot is kept (hidden), never removed: dropzone.error() writes to it */
  function fieldsOf(form) { const o = {}; for (const [k, v] of new FormData(form).entries()) { if (v instanceof File) continue; o[k] = o[k] == null ? v : [].concat(o[k], v); } form.querySelectorAll('input[type=checkbox]').forEach(cb => { o[cb.name] = cb.checked; }); return o; }
  /** Wire a <form>: validation, pending (aria-busy + spinner), inline error + Retry, success only on ok. opts: { kind, files: () => File[], extra: () => ({}), onSuccess(res, fields), onError(res), validate(fields) → [{field,message}] } */
  function bind(form, opts) {
    loadConfig();   /* so the synchronous submit-time validate() sees config flags (requireConsent) */
    const btn = form.querySelector('[type=submit]'); const label = btn ? btn.innerHTML : '';
    let status = form.querySelector('.c-form__status'); if (!status) { status = document.createElement('div'); status.className = 'c-form__status'; status.hidden = true; status.setAttribute('aria-live', 'polite'); (btn ? btn.parentElement : form).appendChild(status); }
    form.setAttribute('novalidate', '');
    const pending = on => { form.classList.toggle('is-pending', on); if (btn) { btn.disabled = on; btn.setAttribute('aria-busy', String(on)); btn.innerHTML = on ? `${SPINNER}<span class="visually-hidden">Sending</span>` : label; } };
    async function go(payload) {
      clearErrors(form); pending(true);
      const res = await submit(opts.kind, payload.fields, payload.files);
      pending(false);
      if (res.ok) { form.dispatchEvent(new CustomEvent('ln:submitted', { detail: res })); opts.onSuccess && opts.onSuccess(res, payload.fields); return res; }
      if (res.error === 'validation') { res.errors.forEach(e => fieldError(form.querySelector(`[name="${e.field}"]`) || form.querySelector(`[data-field="${e.field}"]`), e.message)); const first = form.querySelector('[aria-invalid="true"]'); first && first.focus(); return res; }
      status.hidden = false; status.className = 'c-form__status c-form__status--error'; status.setAttribute('role', 'alert');
      status.innerHTML = `<p>${esc(res.message || 'That didn’t send. Nothing was lost — try again.')}</p><button type="button" class="c-btn c-btn--ghost c-btn--md" data-qa="${esc(opts.qa || opts.kind)}.retry">Retry</button>`;
      status.querySelector('button').addEventListener('click', () => go(payload), { once: true });
      /* the status sits under the submit button: on a phone (or in a sheet) it can land below the fold, so bring it into view */
      try { status.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); } catch {}
      opts.onError && opts.onError(res); return res;
    }
    /* live correction (adversarial review: errors stayed until the next submit): typing a value clears that field's error at
       once; after a first submit attempt, leaving a field re-validates just that field */
    let attempted = false;
    const errsFor = (name) => { const fields = Object.assign(fieldsOf(form), opts.extra ? opts.extra() : {}); const files = opts.files ? opts.files() : []; return (opts.validate ? opts.validate(fields, files) : []).concat(validate(opts.kind, fields, files)).filter(er => er.field === name); };
    const ctl = t => t && t.name ? (form.querySelector(`[name="${t.name}"]`) || t) : null;
    const onEdit = e => { const c = ctl(e.target); if (!c || c.getAttribute('aria-invalid') !== 'true') return; if (!errsFor(c.name).length) clearFieldError(c); };
    form.addEventListener('input', onEdit); form.addEventListener('change', onEdit);
    form.addEventListener('focusout', e => { if (!attempted) return; const c = ctl(e.target); if (!c || c.type === 'submit' || c.type === 'button') return; const errs = errsFor(c.name); if (errs.length) fieldError(c, errs[0].message); else clearFieldError(c); });
    form.addEventListener('submit', e => {
      e.preventDefault(); attempted = true;
      const fields = Object.assign(fieldsOf(form), opts.extra ? opts.extra() : {}); const files = opts.files ? opts.files() : [];
      const errs = (opts.validate ? opts.validate(fields, files) : []).concat(validate(opts.kind, fields, files));
      if (errs.length) { clearErrors(form); errs.forEach(er => fieldError(form.querySelector(`[name="${er.field}"]`) || form.querySelector(`[data-field="${er.field}"]`), er.message)); const first = form.querySelector('[aria-invalid="true"]'); first && first.focus(); return; }
      go({ fields, files });
    });
    return { submit: () => form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })), reset() { form.reset(); clearErrors(form); } };
  }
  /** Replace a form with its confirmation (aria-live). Local-driver saves are labelled in amber. */
  function renderSuccess(container, { ref, local, title = 'Request received', body = '', next = [] , qa = 'form' }) {
    container.innerHTML = `<div class="c-form__success${local ? ' c-form__success--local' : ''}" role="status" aria-live="polite" data-qa="${esc(qa)}.confirm">
      <p class="c-eyebrow">${local ? 'Saved locally (review build) — nothing was sent.' : 'Reference'} <b data-qa="${esc(qa)}.confirm.ref">${esc(ref)}</b></p>
      <h3 class="c-title">${esc(title)}</h3>${body ? `<p>${body}</p>` : ''}
      ${next.length ? `<ol class="c-steps-mini">${next.map(n => `<li>${esc(n)}</li>`).join('')}</ol>` : ''}</div>`;
    container.querySelector('h3').setAttribute('tabindex', '-1'); container.querySelector('h3').focus();
  }
  /** Drop zone: click or drag; type + size validation; thumbnail; remove ×. opts: { accept, maxMb, multiple, onChange(files) } → { files, clear, destroy } */
  function dropzone(el, opts = {}) {
    const maxMb = opts.maxMb || (cfg && cfg.maxFileMb) || DEFAULT_CONFIG.maxFileMb, accept = (opts.accept || ACCEPT.mockup).split(',').map(s => s.trim());
    const files = []; let input = el.querySelector('input[type=file]');
    if (!input) { input = document.createElement('input'); input.type = 'file'; input.className = 'visually-hidden'; input.accept = accept.join(','); if (opts.multiple) input.multiple = true; el.appendChild(input); }
    /* a11y (pre-publish audit): the zone is a labelled group with a real "Choose" button inside, not role=button, because it
       holds the file list's Remove buttons (axe nested-interactive). Mouse click anywhere on the zone still opens the picker. */
    el.classList.add('c-drop'); if (el.getAttribute('tabindex') === '0') el.removeAttribute('tabindex'); el.setAttribute('role', 'group'); el.setAttribute('aria-label', el.getAttribute('aria-label') || 'Add a file: click or drag it here');
    input.setAttribute('tabindex', '-1'); input.setAttribute('aria-hidden', 'true');
    let choose = el.querySelector('.c-drop__choose');
    if (!choose) { choose = document.createElement('button'); choose.type = 'button'; choose.className = 'c-btn c-btn--ghost c-btn--sm c-drop__choose'; choose.textContent = opts.multiple ? 'Choose files' : 'Choose a file'; choose.setAttribute('aria-label', el.getAttribute('aria-label')); input.before(choose); }
    const list = el.querySelector('.c-drop__list') || el.appendChild(Object.assign(document.createElement('ul'), { className: 'c-drop__list' }));
    const err = el.querySelector('.c-drop__error') || el.appendChild(Object.assign(document.createElement('p'), { className: 'c-drop__error c-input__error', hidden: true }));
    err.setAttribute('role', 'alert');
    const okType = f => accept.some(a => a === f.type || (a.endsWith('/*') && f.type.startsWith(a.slice(0, -1))) || (!f.type && /\.(png|jpe?g|svg|pdf)$/i.test(f.name)));
    function render() {
      list.innerHTML = files.map((f, i) => `<li>${f.type.startsWith('image/') && f.type !== 'image/svg+xml' ? `<img alt="" src="${URL.createObjectURL(f)}" class="c-drop__thumb">` : `<span class="c-drop__thumb c-drop__thumb--doc" style="display:grid;place-items:center" aria-hidden="true">${ICON('i-drawing', 24)}</span>`}<span class="c-drop__name">${esc(f.name)}</span><span class="c-drop__size">${(f.size / 1048576).toFixed(1)} MB</span><button type="button" class="c-btn c-btn--icon" aria-label="Remove ${esc(f.name)}" data-remove="${i}">×</button></li>`).join('');
      el.classList.toggle('has-files', files.length > 0); el.removeAttribute('aria-invalid'); err.hidden = true; err.textContent = '';
      opts.onChange && opts.onChange(files.slice());
    }
    function take(fl) {
      let reject = null;   /* the reason a file was refused must survive render() (INTEGRATION #126) */
      for (const f of Array.from(fl || [])) {
        if (!okType(f)) { reject = `We can’t read ${f.name} — PNG, JPG, SVG or PDF please`; continue; }
        if (f.size > maxMb * 1048576) { reject = `${f.name} is ${(f.size / 1048576).toFixed(0)} MB — the limit is ${maxMb} MB`; continue; }
        if (!f.size) { reject = `${f.name} looks empty or corrupt`; continue; }
        if (!opts.multiple) files.length = 0; files.push(f);
      }
      render();
      if (reject) show(reject);
    }
    function show(m) { err.hidden = false; err.textContent = m; el.setAttribute('aria-invalid', 'true'); }
    const onDrag = e => { e.preventDefault(); el.classList.toggle('is-over', e.type !== 'dragleave' && e.type !== 'drop'); if (e.type === 'drop') take(e.dataTransfer.files); };
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(t => el.addEventListener(t, onDrag));
    const onClick = e => { if (e.target.closest('[data-remove]')) { files.splice(+e.target.closest('[data-remove]').dataset.remove, 1); render(); return; } if (e.target !== input) input.click(); };
    const onKey = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); input.click(); } };
    el.addEventListener('click', onClick); el.addEventListener('keydown', onKey); input.addEventListener('change', () => { take(input.files); input.value = ''; });
    return { get files() { return files.slice(); }, take, clear() { files.length = 0; render(); }, error: show, destroy() { ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(t => el.removeEventListener(t, onDrag)); el.removeEventListener('click', onClick); el.removeEventListener('keydown', onKey); } };
  }
  return { submit, validate, makeRef: k => makeRef(k, now, cfg), loadConfig, bind, dropzone, fieldError, clearFieldError, clearErrors, fieldsOf, renderSuccess, requests: () => listRead('requests'), captures: () => listRead('captures'), get config() { return cfg; } };
}

const forms = createForms();
export default forms;
export const { submit, validate, loadConfig, bind, dropzone, fieldError, clearFieldError, clearErrors, fieldsOf, renderSuccess } = forms;
