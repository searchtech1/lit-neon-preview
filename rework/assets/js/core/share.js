/* Lit Neon v2 — share sheet (brief §4.2 "Share sheet", §5.11 gift link, §6.2). Tabs: Share design · Gift link · Email it
   to me. Preview PNG from the stage, link + Copy (success shown IN the sheet, never a toast), WhatsApp, Email, native
   Share (navigator.share, with the PNG when files are supported), QR (core/qr.js — a stub until WS0-C lands), the gift
   link with a 140-char message and a "from" name (no prices on gift.html), and "Email it to me" through
   forms.submit('emailDesign') — success only on a 2xx. analytics.track('share', { channel }) on each action.
   share.open({ state, stage, title }) → { close } ; share.links(state, { message, from }) → { design, gift, whatsapp, mailto }. */
import { dialog, injectBase } from './basket.js';
import router from './router.js';
import { track } from './analytics.js';
import { esc } from './money.js';
import * as forms from './forms.js';
import * as qr from './qr.js';
import { injectCss } from './renderer.js';

const CSS = `
.ln-sheet-dlg{position:fixed;inset:0;z-index:var(--z-sheet,70);display:grid;place-items:end center;pointer-events:none}
.ln-sheet-dlg[hidden]{display:none}
.ln-sheet-dlg.c-sheet{display:grid;left:0;right:0;top:0;bottom:0;width:auto;max-width:none;max-height:none;transform:none;background:none;box-shadow:none;border:0;border-radius:0;padding:0;visibility:visible;opacity:1;transition:opacity var(--d-slow,480ms) linear;touch-action:auto}
.ln-sheet-dlg.c-sheet[hidden]{display:none}
.ln-sheet-dlg__scrim{position:absolute;inset:0;background:var(--scrim,rgba(10,6,14,.62));opacity:0;transition:opacity var(--d-base,240ms);pointer-events:auto}
.ln-sheet-dlg__panel{position:relative;width:min(560px,100%);max-height:min(92dvh,920px);overflow:auto;background:var(--night-2,#1F1328);color:var(--bone,#F2E9DF);border-radius:var(--r-4,22px) var(--r-4,22px) 0 0;box-shadow:var(--e-3);transform:translateY(24px);opacity:0;transition:transform var(--d-slow,480ms) var(--ease-out),opacity var(--d-base,240ms);pointer-events:auto;padding:var(--s-3) var(--s-5) calc(var(--s-5) + env(safe-area-inset-bottom));border:1px solid var(--hair)}
.ln-sheet-dlg.is-open .ln-sheet-dlg__scrim{opacity:1}.ln-sheet-dlg.is-open .ln-sheet-dlg__panel{transform:none;opacity:1}
@media (min-width:1024px){.ln-sheet-dlg{place-items:center}.ln-sheet-dlg__panel{border-radius:var(--r-4,22px)}}
.ln-sheet-dlg__grab{width:40px;height:4px;border-radius:2px;background:var(--hair);margin:0 auto var(--s-3)}
@media (min-width:1024px){.ln-sheet-dlg__grab{display:none}}
.ln-sheet-dlg__head{display:flex;justify-content:space-between;align-items:center;gap:var(--s-3);margin-bottom:var(--s-3)}
.ln-sheet-dlg__head h2{margin:0;font:600 var(--t-title)/var(--lh-title) var(--f-ui)}
.ln-tabs{display:flex;gap:var(--s-1);border-bottom:1px solid var(--hair);margin-bottom:var(--s-4)}
.ln-tabs [role=tab]{background:none;border:0;color:var(--smoke);font:600 var(--t-small) var(--f-ui);min-height:var(--touch,44px);padding:0 var(--s-3);border-bottom:2px solid transparent;cursor:pointer;margin-bottom:-1px}
.ln-tabs [role=tab][aria-selected=true]{color:var(--bone);border-color:var(--bone)}
.ln-tabs [role=tab]:focus-visible{outline:var(--focus-ring,2px) solid var(--amber);outline-offset:-2px;border-radius:var(--r-1)}
.ln-share__preview{aspect-ratio:16/9;border-radius:var(--r-3);overflow:hidden;background:var(--night);display:grid;place-items:center;margin-bottom:var(--s-4);position:relative}
.ln-share__preview img{max-width:100%;max-height:100%;object-fit:contain}
.ln-share__row{display:grid;grid-template-columns:1fr auto;gap:var(--s-2);margin-bottom:var(--s-3)}
.ln-share__row input,.ln-field input,.ln-field textarea{width:100%;height:var(--control-h,48px);font:400 var(--t-body) var(--f-ui);padding:0 var(--s-3);border-radius:var(--r-2);border:1px solid var(--hair);background:var(--night-3);color:var(--bone)}
.ln-field textarea{height:auto;min-height:72px;padding:var(--s-2) var(--s-3);resize:vertical}
.ln-share__row input:focus-visible,.ln-field input:focus-visible,.ln-field textarea:focus-visible{outline:var(--focus-ring,2px) solid var(--amber);outline-offset:2px}
.ln-field{display:grid;gap:var(--s-1);margin-bottom:var(--s-3)}
.ln-field label{font:500 var(--t-small) var(--f-ui);color:var(--bone-2)}
.ln-field .count{font-size:var(--t-caption);color:var(--smoke);justify-self:end}
.ln-share__acts{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:var(--s-2);margin-bottom:var(--s-4)}
.ln-share__act{display:grid;justify-items:center;align-content:center;gap:6px;min-height:76px;padding:var(--s-2) var(--s-1);border-radius:var(--r-3);border:1px solid var(--hair);background:var(--night-3);color:var(--bone);font:600 var(--t-small)/1.2 var(--f-ui);text-decoration:none;cursor:pointer;text-align:center;transition:box-shadow var(--d-base),border-color var(--d-base),transform var(--d-fast)}
.ln-share__act:hover{box-shadow:var(--glow-ring);border-color:var(--bone-2)}.ln-share__act:active{transform:translateY(1px)}
.ln-share__act:focus-visible{outline:var(--focus-ring,2px) solid var(--amber);outline-offset:var(--focus-offset,3px)}
.ln-share__act .ic{width:22px;height:22px}
.ln-share__act[hidden]{display:none}
.ln-share__row .ln-btn{min-width:108px;min-height:var(--control-h,48px)}
.ln-share__row .ln-btn .ic{width:18px;height:18px}
.ln-share__qr{display:grid;grid-template-columns:auto 1fr;gap:var(--s-4);align-items:center;padding:var(--s-3);border:1px solid var(--hair);border-radius:var(--r-3)}
.ln-share__qr canvas,.ln-share__qr svg{width:112px;height:112px;background:#fff;border-radius:var(--r-2);padding:6px}
.ln-share__ok{color:var(--ok);font:500 var(--t-small) var(--f-ui);min-height:20px;margin:0 0 var(--s-2)}
.ln-check{display:flex;gap:var(--s-2);align-items:flex-start;font-size:var(--t-small);color:var(--bone-2);margin-bottom:var(--s-3)}
.ln-check input{width:20px;height:20px;margin:2px 0 0;accent-color:var(--amber)}
.visually-hidden{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.ln-share__ok:empty{min-height:0;margin:0}
@media (max-width:767px){.ln-share__qr{display:none}}`;

const IC = id => `<svg class="ic" aria-hidden="true" focusable="false" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><use href="/lit-neon-preview/rework/assets/img/icons.svg#${id}"/></svg>`;

/** the sheet + base control styles (also used by the AR sheet in core/ar.js) */
export function injectSheetCss() { injectBase(); injectCss('ln-share-css', CSS); }

export function links(state, { message = '', from = '' } = {}) {
  const design = router.shareLink(state); const gift = router.giftLink(state, message, from);
  const text = `My neon sign design on Lit Neon: ${design}`;
  return { design, gift, whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`, whatsappGift: `https://wa.me/?text=${encodeURIComponent(`A little something for you: ${gift}`)}`,
    mailto: `mailto:?subject=${encodeURIComponent('My neon sign design')}&body=${encodeURIComponent(text)}`, mailtoGift: `mailto:?subject=${encodeURIComponent('A sign for you')}&body=${encodeURIComponent(gift)}` };
}

async function copyText(text) { try { await navigator.clipboard.writeText(text); return true; } catch { try { const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; } } }

/** open({ state, stage, title, qa }) — the stage supplies toPNG for the preview; returns { close, el } */
export function open({ state, stage, title = 'Share your design', qa = 'share' } = {}) {
  injectSheetCss();
  const el = document.createElement('div'); el.className = 'ln-sheet-dlg c-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'ln-share-title'); el.hidden = true; el.dataset.lnOverlay = '1'; el.dataset.qa = `${qa}.sheet`;
  let message = '', from = ''; const L = () => links(state, { message, from });
  const tabs = [['design', 'Share design'], ['gift', 'Gift link'], ['email', 'Email it to me']];
  el.innerHTML = `<div class="ln-sheet-dlg__scrim" data-close></div><div class="ln-sheet-dlg__panel">
    <div class="ln-sheet-dlg__grab" aria-hidden="true"></div>
    <div class="ln-sheet-dlg__head"><h2 id="ln-share-title" tabindex="-1">${esc(title)}</h2><button type="button" class="ln-iconbtn" data-close aria-label="Close" data-qa="${qa}.close"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="ln-share__preview" data-preview><span class="ln-note">Preparing your preview…</span></div>
    <div class="ln-tabs" role="tablist" aria-label="Share options">${tabs.map(([id, n], i) => `<button role="tab" id="ln-share-tab-${id}" aria-selected="${i === 0}" aria-controls="ln-share-panel-${id}" tabindex="${i === 0 ? 0 : -1}" data-qa="${qa}.tab.${id}">${n}</button>`).join('')}</div>
    <div role="tabpanel" id="ln-share-panel-design" aria-labelledby="ln-share-tab-design" data-qa="${qa}.panel.design">
      <div class="ln-share__row"><label class="visually-hidden" for="ln-share-link">Design link</label><input id="ln-share-link" readonly value="${esc(L().design)}" data-qa="${qa}.link"><button type="button" class="ln-btn ln-btn--primary" data-copy="design" data-qa="${qa}.copy">${IC('i-link')}<span data-lbl>Copy</span></button></div>
      <p class="ln-share__ok" role="status" aria-live="polite" data-ok="design"></p>
      <div class="ln-share__acts"><a class="ln-share__act" href="${esc(L().whatsapp)}" target="_blank" rel="noopener" data-track="whatsapp" data-qa="${qa}.whatsapp">${IC('i-whatsapp')}<span>WhatsApp</span></a><a class="ln-share__act" href="${esc(L().mailto)}" data-track="email" data-qa="${qa}.email">${IC('i-mail')}<span>Email</span></a><button type="button" class="ln-share__act" data-native data-qa="${qa}.native" hidden>${IC('i-share')}<span>More apps</span></button></div>
      <div class="ln-share__qr"><div data-qr="design"></div><p class="ln-note">Scan to open this design on your phone — then tap <b>See it in your room</b>.</p></div>
    </div>
    <div role="tabpanel" id="ln-share-panel-gift" aria-labelledby="ln-share-tab-gift" hidden data-qa="${qa}.panel.gift">
      <p class="ln-note" style="margin:0 0 var(--s-3)">A gift link opens the lit sign with your message. No prices, no spec — just the sign.</p>
      <div class="ln-field"><label for="ln-gift-msg">Your message</label><textarea id="ln-gift-msg" maxlength="140" rows="2" placeholder="For the hallway, with love" data-qa="${qa}.gift.message"></textarea><span class="count"><span data-count>0</span> / 140</span></div>
      <div class="ln-field"><label for="ln-gift-from">From</label><input id="ln-gift-from" maxlength="40" placeholder="Your name" data-qa="${qa}.gift.from"></div>
      <div class="ln-share__row"><label class="visually-hidden" for="ln-gift-link">Gift link</label><input id="ln-gift-link" readonly value="${esc(L().gift)}" data-qa="${qa}.gift.link"><button type="button" class="ln-btn ln-btn--primary" data-copy="gift" data-qa="${qa}.gift.copy">${IC('i-link')}<span data-lbl>Copy</span></button></div>
      <p class="ln-share__ok" role="status" aria-live="polite" data-ok="gift"></p>
      <div class="ln-share__acts"><a class="ln-share__act" href="${esc(L().whatsappGift)}" target="_blank" rel="noopener" data-track="whatsapp-gift" data-gift-wa data-qa="${qa}.gift.whatsapp">${IC('i-whatsapp')}<span>WhatsApp</span></a><a class="ln-share__act" href="${esc(L().mailtoGift)}" data-track="email-gift" data-gift-mail data-qa="${qa}.gift.email">${IC('i-mail')}<span>Email</span></a><a class="ln-share__act" href="${esc(L().gift)}" target="_blank" rel="noopener" data-qa="${qa}.gift.open">${IC('i-eye')}<span>Preview</span></a></div>
      <div class="ln-share__qr"><div data-qr="gift"></div><p class="ln-note">Or let them scan it.</p></div>
    </div>
    <div role="tabpanel" id="ln-share-panel-email" aria-labelledby="ln-share-tab-email" hidden data-qa="${qa}.panel.email">
      <form data-email-form novalidate>
        <div class="ln-field c-input"><label for="ln-share-email">Your email</label><input id="ln-share-email" name="email" type="email" autocomplete="email" inputmode="email" required data-qa="${qa}.email.input"></div>
        <label class="ln-check"><input type="checkbox" name="marketing" data-qa="${qa}.email.consent"> <span>Also send me the occasional note from the workshop. Optional; unsubscribe any time.</span></label>
        <button type="submit" class="ln-btn ln-btn--primary" data-qa="${qa}.email.submit">Email me my design</button>
      </form>
      <div data-email-done hidden></div>
    </div></div>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s);
  /* preview */
  if (stage && stage.toPNG) stage.toPNG({ transparent: false, includeWall: true }).then(p => { if (!p) return; $('[data-preview]').innerHTML = `<img src="${p.dataUrl}" alt="Preview of your sign on its wall">`; el._png = p; }).catch(() => { $('[data-preview]').innerHTML = '<span class="ln-note">Preview unavailable</span>'; });
  else $('[data-preview]').remove();
  /* QR codes (stub until WS0-C) */
  qr.render($('[data-qr="design"]'), L().design, { size: 112 }); qr.render($('[data-qr="gift"]'), L().gift, { size: 112 });
  /* native share */
  const nat = $('[data-native]'); if (navigator.share) { nat.hidden = false; nat.addEventListener('click', async () => { const data = { title: 'My neon sign', text: 'My neon sign design on Lit Neon', url: L().design }; try { if (el._png && navigator.canShare && navigator.canShare({ files: [new File([el._png.blob], 'lit-neon-design.png', { type: 'image/png' })] })) data.files = [new File([el._png.blob], 'lit-neon-design.png', { type: 'image/png' })]; await navigator.share(data); track('share', { channel: 'native' }); } catch {} }); }
  /* tabs */
  const tabEls = Array.from(el.querySelectorAll('[role=tab]'));
  const select = i => { tabEls.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; el.querySelector('#' + t.getAttribute('aria-controls')).hidden = k !== i; }); };
  tabEls.forEach((t, i) => { t.addEventListener('click', () => select(i)); t.addEventListener('keydown', e => { const n = e.key === 'ArrowRight' ? (i + 1) % tabEls.length : e.key === 'ArrowLeft' ? (i + tabEls.length - 1) % tabEls.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabEls.length - 1 : -1; if (n < 0) return; e.preventDefault(); select(n); tabEls[n].focus(); }); });
  /* gift fields */
  const refreshGift = () => { const l = L(); $('#ln-gift-link').value = l.gift; $('[data-gift-wa]').href = l.whatsappGift; $('[data-gift-mail]').href = l.mailtoGift; $(`[data-qa="${qa}.gift.open"]`).href = l.gift; qr.render($('[data-qr="gift"]'), l.gift, { size: 112 }); };
  $('#ln-gift-msg').addEventListener('input', e => { message = e.target.value.slice(0, 140); $('[data-count]').textContent = message.length; refreshGift(); });
  $('#ln-gift-from').addEventListener('input', e => { from = e.target.value.slice(0, 40); refreshGift(); });
  /* copy + tracking */
  el.addEventListener('click', async e => {
    const c = e.target.closest('[data-copy]'); if (c) { const which = c.dataset.copy; const ok = await copyText(L()[which]); const okEl = $(`[data-ok="${which}"]`); okEl.textContent = ok ? (which === 'gift' ? 'Gift link copied' : 'Link copied — anyone with it sees this exact sign') : 'Copy the link from the box above'; const lbl = c.querySelector('[data-lbl]') || c; lbl.textContent = ok ? 'Copied ✓' : 'Copy'; setTimeout(() => { lbl.textContent = 'Copy'; }, 1500); track('share', { channel: 'copy', kind: which }); return; }
    const t = e.target.closest('[data-track]'); if (t) track('share', { channel: t.dataset.track });
  });
  /* email it to me */
  forms.bind($('[data-email-form]'), { kind: 'emailDesign', qa: `${qa}.email`, extra: () => ({ designLink: L().design, design: JSON.stringify(state) }),   /* sending the design is the shopper's own request: no tick needed; the marketing box is an optional extra (PECR) */
    onSuccess: res => { const done = $('[data-email-done]'); $('[data-email-form]').hidden = true; done.hidden = false; forms.renderSuccess(done, { ref: res.ref, local: res.local, title: 'On its way', body: res.local ? '' : 'Your design is in your inbox in a minute or two.', qa: `${qa}.email` }); track('email_capture', { source: 'share' }); } });
  const close = dialog.open(el, { onClose: () => setTimeout(() => el.remove(), 600) });
  return { close, el };
}

export default { open, links };
