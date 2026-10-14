/* core/a11y.js — focus trap, inert background, scroll lock, roving tabindex, live announcements (brief §3.7, §7.5).
   Used by ui.js (sheet/drawer/modal/lightbox) and chrome.js (mobile drawer, search sheet). */

const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"], summary, iframe, audio[controls], video[controls]';

export function focusables(root) {
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(el => {
    if (el.closest('[hidden], [inert]')) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0);
  });
}

/** Trap Tab/Shift+Tab inside `root`. Returns a release function. */
export function trapFocus(root, { initial } = {}) {
  function onKey(e) {
    if (e.key !== 'Tab') return;
    const list = focusables(root);
    if (!list.length) { e.preventDefault(); root.focus(); return; }
    const first = list[0], last = list[list.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) { if (active === first || !root.contains(active)) { e.preventDefault(); last.focus(); } }
    else { if (active === last || !root.contains(active)) { e.preventDefault(); first.focus(); } }
  }
  function onFocusIn(e) { if (!root.contains(e.target)) { const list = focusables(root); (list[0] || root).focus(); } }
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('focusin', onFocusIn, true);
  if (initial !== false) {
    const target = initial instanceof Element ? initial : (root.querySelector('[data-autofocus]') || root.querySelector('h1, h2, [role="heading"]') || focusables(root)[0] || root);
    if (target && !target.hasAttribute('tabindex') && !target.matches(FOCUSABLE)) target.setAttribute('tabindex', '-1');
    queueMicrotask(() => target && target.focus({ preventScroll: true }));
  }
  return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('focusin', onFocusIn, true); };
}

/* ---- inert everything except the overlay (B02). Nested overlays stack. ---- */
const inertStack = [];
export function setInert(except) {
  const roots = Array.from(document.body.children).filter(el => el !== except && !except.contains(el) && !el.contains(except) && !el.matches('script, style, link, .c-scrim, .c-toast, .ch-review'));
  const applied = roots.filter(el => !el.hasAttribute('inert'));
  applied.forEach(el => el.setAttribute('inert', ''));
  inertStack.push({ except, applied });
  return () => {
    const i = inertStack.findIndex(s => s.except === except);
    if (i < 0) return;
    const [s] = inertStack.splice(i, 1);
    s.applied.forEach(el => el.removeAttribute('inert'));
    // re-apply for any overlay still above us
    inertStack.forEach(o => o.applied.forEach(el => el.setAttribute('inert', '')));
  };
}

/* ---- scroll lock (keeps the scrollbar gutter stable; counts nested overlays) ---- */
let locks = 0, savedY = 0;
export function lockScroll() {
  if (locks++ === 0) {
    savedY = window.scrollY;
    const sb = window.innerWidth - document.documentElement.clientWidth;
    document.body.classList.add('has-overlay');
    if (sb > 0) document.body.style.paddingRight = sb + 'px';
  }
  return unlockScroll;
}
export function unlockScroll() {
  if (locks === 0) return;
  if (--locks === 0) { document.body.classList.remove('has-overlay'); document.body.style.paddingRight = ''; }
}
export function overlaysOpen() { return locks; }

/* ---- roving tabindex for toolbars / tab lists / chip groups ---- */
export function roving(container, selector, { orientation = 'horizontal', loop = true, onMove } = {}) {
  const items = () => Array.from(container.querySelectorAll(selector)).filter(el => !el.disabled && !el.hidden);
  function setActive(el, focus = true) {
    items().forEach(i => i.setAttribute('tabindex', i === el ? '0' : '-1'));
    if (focus) el.focus();
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    onMove?.(el);
  }
  const init = items(); if (init.length) { const cur = init.find(i => i.getAttribute('aria-selected') === 'true' || i.getAttribute('aria-pressed') === 'true') || init[0]; init.forEach(i => i.setAttribute('tabindex', i === cur ? '0' : '-1')); }
  function onKey(e) {
    const list = items(); const i = list.indexOf(document.activeElement); if (i < 0) return;
    const prev = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft', next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    let j = null;
    if (e.key === next) j = i + 1; else if (e.key === prev) j = i - 1; else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = list.length - 1;
    if (j === null) return;
    e.preventDefault();
    if (loop) j = (j + list.length) % list.length; else j = Math.max(0, Math.min(list.length - 1, j));
    setActive(list[j]);
  }
  container.addEventListener('keydown', onKey);
  return { setActive, destroy: () => container.removeEventListener('keydown', onKey) };
}

/* ---- polite live region ---- */
let live;
export function announce(text, { assertive = false } = {}) {
  if (!live) { live = document.createElement('div'); live.className = 'live'; live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true'); document.body.appendChild(live); }
  live.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
  live.textContent = ''; requestAnimationFrame(() => { live.textContent = text; });
}

/** Keep a reference to the opener and return focus on close. */
export function rememberFocus() { const el = document.activeElement; return () => { if (el && el.isConnected && typeof el.focus === 'function') el.focus({ preventScroll: true }); }; }

/** Escape key helper for dialogs. */
export function onEscape(handler) { const fn = e => { if (e.key === 'Escape') { e.stopPropagation(); handler(e); } }; document.addEventListener('keydown', fn); return () => document.removeEventListener('keydown', fn); }

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isTouch = () => matchMedia('(hover: none)').matches;

export const a11y = { focusables, trapFocus, setInert, lockScroll, unlockScroll, overlaysOpen, roving, announce, rememberFocus, onEscape, prefersReducedMotion, isTouch };
export default a11y;
