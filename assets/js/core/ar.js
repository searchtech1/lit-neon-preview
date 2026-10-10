/* Lit Neon v2 — AR UI (brief §5.10, §6.2): capability detection, the desktop "On your phone" QR sheet, <model-viewer>
   wiring with blob URLs from core/ar-export.js (a stub until WS0-C lands: the plane exports, the texture does not), and
   the fallback chain WebXR → Quick Look → "Use See it on your wall instead".
   ar.mount(button, { stage, getState, link, onFallback, qa }) → { destroy, support, update() }
   States on the button: data-ar-state = unsupported | idle | preparing | active | failed. Desktop reads "On your phone".
   A tap that lands before support detection finishes is QUEUED (the click awaits init(), never swallowed). The fallback
   message is exposed three ways: onFallback({ message, html, reason }), the `ln:ar-fallback` event detail, and
   api.fallbackMessage / button.dataset.arFallback (plain text) for pages that render their own notice. */
import { dialog, injectBase } from './basket.js';
import router from './router.js';
import * as arExport from './ar-export.js';
import * as qr from './qr.js';
import { track } from './analytics.js';
import { esc } from './money.js';
import { injectCss } from './renderer.js';
import { injectSheetCss } from './share.js';

export async function support() {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const quickLook = ios && (() => { try { const a = document.createElement('a'); return a.relList && a.relList.supports && a.relList.supports('ar'); } catch { return false; } })();
  let webxr = false; try { webxr = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-ar')); } catch { webxr = false; }
  /* Scene Viewer is a separate Android app: it cannot fetch the page-scoped blob: URL our in-browser model lives at, so it
     is NOT a launch path (adversarial review). Android without WebXR falls back to "See it on your wall". */
  const android = /Android/.test(ua); const sceneViewer = false;
  const phone = ios || android || (navigator.maxTouchPoints > 1 && innerWidth < 1024);
  return { ios, android, quickLook, webxr, sceneViewer, phone, any: quickLook || webxr || sceneViewer, desktop: !phone };
}

const CSS = `.ln-ar__sheet{display:grid;gap:var(--s-4)}.ln-ar__qr{display:grid;grid-template-columns:auto 1fr;gap:var(--s-4);align-items:center}.ln-ar__qr canvas{width:160px;height:160px;background:#fff;border-radius:var(--r-2);padding:8px}
.ln-ar__status{font:500 var(--t-small) var(--f-ui);color:var(--bone-2);min-height:20px}.ln-ar__mv{width:100%;height:280px;border-radius:var(--r-3);background:var(--night);display:none}model-viewer.ln-ar__mv{display:block}`;

export function mount(button, { stage, getState, link, onFallback, qa = 'stage.ar' } = {}) {
  injectBase(); injectCss('ln-ar-css', CSS);
  let sup = null, mv = null, blobs = [], ready = null, lastFallback = '';
  /* one place that tells the page AR is not happening and why (plain text + an HTML variant) */
  function fallback(reason, message, html, error) {
    lastFallback = message; button.dataset.arFallback = message; button.dataset.arFallbackReason = reason;
    onFallback && onFallback({ message, html: html || esc(message), reason, error });
    button.dispatchEvent(new CustomEvent('ln:ar-fallback', { bubbles: true, detail: { message, html: html || esc(message), reason, error: error ? String(error.message || error) : undefined } }));
  }
  const state = s => { button.dataset.arState = s; };
  const setLabel = txt => { const l = button.querySelector('.lbl') || button; l.textContent = txt; button.setAttribute('aria-label', txt); };
  const getLink = () => (typeof link === 'function' ? link() : link) || router.shareLink(getState());
  async function init() {
    sup = await support();
    if (sup.desktop || !sup.any) { setLabel(sup.desktop ? 'On your phone' : 'See it on your wall'); state(sup.desktop ? 'idle' : 'unsupported'); button.title = sup.desktop ? '' : 'Room view (AR) needs a phone browser with AR support. Trying it on a photo of your wall works on any phone.'; }
    else { setLabel('See it in your room'); state('idle'); }
    button.hidden = false;
  }
  function openPhoneSheet() {
    const el = document.createElement('div'); el.className = 'ln-sheet-dlg c-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'ln-ar-title'); el.hidden = true; el.dataset.lnOverlay = '1'; el.dataset.qa = `${qa}.sheet`;
    const url = getLink();
    el.innerHTML = `<div class="ln-sheet-dlg__scrim" data-close></div><div class="ln-sheet-dlg__panel"><div class="ln-sheet-dlg__grab" aria-hidden="true"></div>
      <div class="ln-sheet-dlg__head"><h2 id="ln-ar-title" tabindex="-1">See it in your room</h2><button type="button" class="ln-iconbtn" data-close aria-label="Close" data-qa="${qa}.close"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="ln-ar__sheet"><div class="ln-ar__qr"><div data-qr></div><p class="ln-note" style="font-size:var(--t-body);color:var(--bone)">Scan to open this design on your phone, then tap <b>See it in your room</b>. The sign hangs on your wall at true size — no app needed.</p></div>
      <div class="ln-share__row"><label class="visually-hidden" for="ln-ar-link">Design link</label><input id="ln-ar-link" readonly value="${esc(url)}" data-qa="${qa}.link"><button type="button" class="ln-btn ln-btn--ghost" data-copy data-qa="${qa}.copy">Copy</button></div><p class="ln-share__ok" role="status" aria-live="polite"></p></div></div>`;
    document.body.appendChild(el);
    injectSheetCss(); /* the shared sheet + button styles, even if the share sheet never opened on this page */
    qr.render(el.querySelector('[data-qr]'), url, { size: 160 });
    el.addEventListener('click', async e => { if (e.target.closest('[data-copy]')) { let ok = false; try { await navigator.clipboard.writeText(url); ok = true; } catch {} el.querySelector('.ln-share__ok').textContent = ok ? 'Link copied' : 'Copy the link from the box'; } });
    dialog.open(el, { onClose: () => setTimeout(() => el.remove(), 600) }); track('ar_open', { mode: 'qr' });
  }
  async function launch() {
    state('preparing'); setLabel('Preparing your sign…'); button.setAttribute('aria-busy', 'true');
    try {
      const st = getState(); const png = stage && stage.toPNG ? await stage.toPNG({ transparent: true, bakeGlow: true }) : null;
      const [glb, usdz] = await Promise.all([arExport.glb(st, png), sup.ios ? arExport.usdz(st, png) : null]);
      blobs.forEach(URL.revokeObjectURL); blobs = [];
      const glbUrl = URL.createObjectURL(glb); blobs.push(glbUrl); const usdzUrl = usdz ? URL.createObjectURL(usdz) : null; if (usdzUrl) blobs.push(usdzUrl);
      if (sup.quickLook && usdzUrl) { const a = document.createElement('a'); a.rel = 'ar'; a.href = usdzUrl + '#allowsContentScaling=0'; const img = document.createElement('img'); img.alt = ''; img.src = png ? png.dataUrl : 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; a.appendChild(img); a.style.position = 'fixed'; a.style.left = '-9999px'; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 2000); }
      else {
        try { await import('/lit-neon-preview/assets/vendor/model-viewer.min.js'); } catch { throw new Error('model-viewer not vendored yet'); }
        if (!mv) { mv = document.createElement('model-viewer'); mv.className = 'ln-ar__mv'; mv.setAttribute('ar', ''); mv.setAttribute('ar-modes', 'webxr quick-look'); mv.setAttribute('ar-scale', 'fixed'); mv.setAttribute('ar-placement', 'wall'); mv.setAttribute('camera-controls', ''); mv.setAttribute('alt', 'Your neon sign'); mv.style.position = 'fixed'; mv.style.left = '-9999px'; document.body.appendChild(mv); }
        mv.src = glbUrl; if (usdzUrl) mv.setAttribute('ios-src', usdzUrl);
        await new Promise(r => setTimeout(r, 300)); if (!mv.canActivateAR) throw new Error('AR not available on this device'); await mv.activateAR();
      }
      state('active'); track('ar_open', { mode: sup.quickLook ? 'quicklook' : sup.webxr ? 'webxr' : 'scene-viewer' });
    } catch (e) {
      state('failed'); setLabel('See it on your wall instead');
      fallback('launch-failed', 'Room view (AR) couldn’t start on this phone. Try it on a photo of your wall instead.', 'Room view (AR) couldn’t start on this phone. Try it on a photo of your wall instead.', e);
    } finally { button.removeAttribute('aria-busy'); if (button.dataset.arState !== 'failed') { setLabel(sup.desktop ? 'On your phone' : 'See it in your room'); state('idle'); } }
  }
  let queued = false;
  const onClick = async e => {
    e.preventDefault();
    if (button.dataset.arState === 'preparing' && sup) return; /* a launch is already running */
    if (!sup) { if (queued) return; queued = true; button.setAttribute('aria-busy', 'true'); try { await ready; } catch {} finally { queued = false; button.removeAttribute('aria-busy'); } if (!sup) return; }
    if (button.dataset.arState === 'failed' || (!sup.any && !sup.desktop)) {
      const message = button.dataset.arState === 'failed' ? (lastFallback || 'Room view (AR) couldn’t start on this phone. Try it on a photo of your wall instead.')
        : sup.android ? 'This phone’s browser can’t open room view (AR). Try it on a photo of your wall instead.' : 'Room view (AR) isn’t available on this device. Try it on a photo of your wall instead.';
      fallback(button.dataset.arState === 'failed' ? 'launch-failed' : 'unsupported', message); return;
    }
    if (sup.desktop) openPhoneSheet(); else launch();
  };
  button.addEventListener('click', onClick); button.dataset.qa = button.dataset.qa || `${qa}.button`;
  ready = init();
  return { destroy() { button.removeEventListener('click', onClick); blobs.forEach(URL.revokeObjectURL); mv && mv.remove(); }, get support() { return sup; }, get ready() { return ready; }, get fallbackMessage() { return lastFallback; }, update: () => (ready = init()) };
}
export default { mount, support };
