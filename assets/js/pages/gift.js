/* Lit Neon v2 — gift preview (brief §4.21, §5.11, owner P7). gift.html#d=<state>&m=<message>&from=<name>
   - With a design: minimal chrome (wordmark + "Design your sign"), a full-screen stage on the design's scene at night
     with the sign OFF, then after 600 ms the strike-on reveal and the --room relight; the message card (max 140 chars,
     always set as text, never HTML) and "from {name}" (max 40). Replay, Sign on/off, Share (navigator.share, else
     copy the link with an inline confirmation). No prices, no spec, no basket — the link carries only the design.
     Reduced motion: lit immediately.
   - Without a design (the footer's "Gift a sign"): an explainer with a live example stage, the three steps, "Design a
     sign to gift" and "See an example" (a real gift link to this page). A broken link says so instead of failing.
   Every control carries data-qa="gift.*" and is listed in qa/matrix/gift.json. */
import * as R from 'core/renderer.js';
import stage from 'core/stage.js';
import router from 'core/router.js';
import * as ui from 'core/ui.js';
import * as copy from 'core/copy.js';
import * as facts from 'core/facts.js';
import { esc } from 'core/money.js';
import { mount as mountChrome } from 'core/chrome.js';
import { track } from 'core/analytics.js';

const t = (k, v, f) => copy.t(k, v, f);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const icon = ui.icon;
const MAX_MSG = 140, MAX_FROM = 40;
let introHtml = '', mode = null, live = null, lightTimer = 0;

boot();

async function boot() {
  introHtml = $('#main').innerHTML;
  await Promise.all([copy.load(['chrome', 'gift']), facts.load(), ui.ensureSprite()]);
  await stage.loadScenes().catch(() => {});
  const first = readHash();
  mode = first.design ? 'gift' : 'intro';
  mountChrome({ page: 'gift', minimal: mode === 'gift' }).catch(() => {});
  render(first);
  window.addEventListener('hashchange', () => {
    const h = readHash(); const next = h.design ? 'gift' : 'intro';
    if (next !== mode) { location.reload(); return; }   /* chrome differs between the two modes */
    render(h);
  });
}

/** the hash → { design, message, from, example, broken } (message and name trimmed to their limits) */
function readHash() {
  const h = router.parseHash(location.hash);
  const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const res = h.d ? R.resolve(h.d) : null;
  const design = res && (res.hasText || res.icon) ? R.normalise(h.d) : null;
  return { design, message: clean(h.m, MAX_MSG), from: clean(h.from, MAX_FROM), example: !!h.raw.ex, broken: !!h.code && !design };
}

function render(h) { if (live) { try { live.destroy(); } catch {} live = null; } clearTimeout(lightTimer); h.design ? renderGift(h) : renderIntro(h); }

/* ============================================================ the gift ============================================================ */
function sceneFor(state) {
  const s = stage.getScene ? stage.getScene(state.scene) : null;
  if (s && !s.placeholder && s.id !== 'wall') return s.id;
  const list = (stage.scenes ? stage.scenes() : []).filter(x => !x.placeholder && x.id !== 'wall' && !/^s00/.test(x.id));
  return (list[0] && list[0].id) || 's01-living';
}

function renderGift(h) {
  const st = h.design; const res = R.resolve(st);
  const msg = h.message || t('defaultMessage', {}, 'Someone designed this sign for you.');
  document.title = t('meta.title', {}, document.title);
  $('#main').innerHTML = `<section class="gf-view" data-hero aria-labelledby="gf-msg" data-qa="gift.view">
      <div class="gf-stage" data-qa="gift.stage"></div>
      <div class="gf-card" data-qa="gift.card">
        <p class="t-eyebrow gf-card__eyebrow">${h.example ? `<span class="c-pill">${esc(t('example', {}, 'Example gift'))}</span>` : ''}<span>${esc(t('eyebrow', {}, 'A sign, designed for you'))}</span></p>
        <h1 id="gf-msg" class="gf-msg${msg.length > 70 ? ' gf-msg--long' : ''}" data-qa="gift.message"></h1>
        <p class="gf-from" data-qa="gift.from" ${h.from ? '' : 'hidden'}></p>
        <div class="gf-acts">
          <button type="button" class="c-btn c-btn--ghost" data-qa="gift.replay">${icon('rotate')}<span>${esc(t('replay', {}, 'Replay'))}</span></button>
          <button type="button" class="c-btn c-btn--ghost" aria-pressed="false" data-qa="gift.light">${icon('power')}<span>${esc(t('light', {}, 'Sign on/off'))}</span></button>
          <button type="button" class="c-btn c-btn--ghost" data-qa="gift.share">${icon('share')}<span>${esc(t('share', {}, 'Share'))}</span></button>
        </div>
        <p class="gf-status" role="status" data-qa="gift.status"></p>
        <a class="c-btn c-btn--primary c-btn--block gf-back" href="/lit-neon-preview/create.html" data-qa="gift.designback">${esc(t('designBack', {}, 'Design one back'))}${icon('arrow-right')}</a>
      </div>
    </section>`;
  /* the message and name are always text, never markup */
  $('[data-qa="gift.message"]').textContent = msg;
  if (h.from) $('[data-qa="gift.from"]').textContent = t('from', { name: h.from }, 'from {name}');
  const reduced = R.reducedMotion();
  live = stage.mount($('.gf-stage'), { frame: 'hero', scene: sceneFor(st), design: { ...st, night: true, on: reduced }, view: { night: true, on: reduced, rulers: 'off' }, interactive: false, rulers: false, priority: 'high', qa: 'gift.stage' });
  const lightBtn = $('[data-qa="gift.light"]');
  const setOn = on => { live && live.setView({ on }); lightBtn.setAttribute('aria-pressed', String(on)); if (on && res.colour && res.colour.hex && !res.rgb) R.relight(res.colour.hex); };
  const reveal = () => { clearTimeout(lightTimer); if (R.reducedMotion()) { setOn(true); return; } setOn(false); lightTimer = setTimeout(() => setOn(true), 600); };
  Promise.resolve(live && live.ready).then(reveal).catch(reveal);
  if (reduced) setOn(true);
  $('[data-qa="gift.replay"]').addEventListener('click', reveal);
  lightBtn.addEventListener('click', () => { clearTimeout(lightTimer); setOn(lightBtn.getAttribute('aria-pressed') !== 'true'); });
  $('[data-qa="gift.share"]').addEventListener('click', share);
}

async function share() {
  const status = $('[data-qa="gift.status"]'); const url = location.href;
  const data = { title: t('eyebrow', {}, 'A sign, designed for you'), text: $('[data-qa="gift.message"]').textContent, url };
  if (navigator.share) { try { await navigator.share(data); track('share', { channel: 'native', from: 'gift' }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  const copied = await copyText(url);
  if (copied) { status.textContent = t('copied', {}, 'Link copied'); status.classList.remove('is-bad'); track('share', { channel: 'copy', from: 'gift' }); }
  else { status.textContent = t('copyFail'); status.classList.add('is-bad'); }
}

/* ============================================================ the explainer ============================================================ */
function renderIntro(h) {
  if (!$('.gf-intro')) $('#main').innerHTML = introHtml;
  $$('[data-copy]').forEach(el => { const v = t(el.dataset.copy); if (v) el.textContent = v; });
  const broken = $('[data-qa="gift.broken"]'); broken.hidden = !h.broken; broken.textContent = h.broken ? t('intro.broken') : '';
  /* "See an example" is a real gift link to this page */
  const example = { text: t('intro.exampleWords', {}, 'Happy birthday\nAlex'), font: 'soho', colour: 'pink', scene: 's02-bedroom' };
  $('[data-qa="gift.intro.example"]').href = '/lit-neon-preview/gift.html' + router.giftHash(example, t('intro.exampleMessage'), t('intro.exampleFrom')) + '&ex=1';
  live = stage.mount($('.gf-intro__stage'), { frame: 'hero', scene: 's02-bedroom', design: { ...example, night: true, on: true }, view: { night: true, on: true, rulers: 'off' }, interactive: false, rulers: false, qa: 'gift.intro.stage' });
}

/** clipboard API, else the selection fallback (older Safari, insecure previews) */
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try { const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; }
}
