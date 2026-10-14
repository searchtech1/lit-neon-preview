/* Lit Neon v2 — "built round" homepage module (sites/v2/v/). Lean on purpose: the first screen is finished HTML and the
   sign is lit before this file runs. This module only re-lights it as you type, prices it (core/pricing.js is imported on
   the first interaction — never on load), opens the three sheets, drives the rail chips, the proof drawing (core/sheet.js
   when scrolled near), the sticky bar, the cookie bar and the version pill. No chrome is injected. */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* --- the catalogue the hero needs synchronously (mirrors assets/vendor/engines/catalog.js; cap heights measured once in
   Chrome at 100 px: actualBoundingBoxAscent of "H"). Prices never live here. --- */
const FONTS = {
  soho: ['Soho', 'Neonderthaw', 400, .18, .789], brighton: ['Brighton', 'Pacifico', 400, .12, .877], shoreditch: ['Shoreditch', 'Tilt Neon', 400, .10, .693],
  camden: ['Camden', 'Monoton', 400, .14, .809], margate: ['Margate', 'Yellowtail', 400, .16, .721], notting: ['Notting Hill', 'Great Vibes', 400, .20, .807],
  brixton: ['Brixton', 'Righteous', 400, .10, .700], hackney: ['Hackney', 'Comfortaa', 600, .10, .781]
};
const COLOURS = { warm: ['Warm white', '#ffc77a', '#fff6e6'], cool: ['Cool white', '#cfeaff', '#ffffff'], ice: ['Ice blue', '#4fd2ff'], blue: ['Electric blue', '#2f6bff'], violet: ['Violet', '#9b4dff'], pink: ['Hot pink', '#ff3db4'], candy: ['Candy pink', '#ff8ccf'], red: ['Red', '#ff2b3d'], orange: ['Orange', '#ff7a1a'], yellow: ['Golden yellow', '#ffc23a'], green: ['Green', '#2dff7a'] };
const SIZES = { s: ['Small', 7], m: ['Medium', 10], l: ['Large', 14], xl: ['Extra large', 18], xxl: ['Statement', 24] };
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixWhite = (h, t) => '#' + hexRgb(h).map(v => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('');
const rgba = (h, a) => `rgba(${hexRgb(h).join(',')},${a})`;
const colourVars = id => { const c = COLOURS[id] || COLOURS.pink; const core = c[2] || mixWhite(c[1], .72); return { '--hex': c[1], '--core': core, '--spill': rgba(c[1], .75), '--spill2': rgba(c[1], .45), '--offc': '#e7e0d6' }; };

/* --- state --- */
const state = { text: 'After dark', font: 'soho', colour: 'pink', size: 'm', scene: 's01-living', on: true };
const subs = new Set(); const emit = () => subs.forEach(f => { try { f(); } catch (e) { console.error(e); } });
const VERSION = document.body.dataset.version || '1';

/* --- the sign: text, face, colour, size factor, fit-to-wall --- */
function paintSign(sign, textEl, st, { maxFrac = .82 } = {}) {
  const f = FONTS[st.font] || FONTS.soho, size = SIZES[st.size] || SIZES.m;
  const text = (st.text || '').trim() || 'Your words';
  textEl.textContent = text;
  sign.style.fontFamily = `"${f[1]}", cursive`; sign.style.fontWeight = f[2]; sign.style.wordSpacing = f[3] + 'em';
  Object.entries(colourVars(st.colour)).forEach(([k, v]) => sign.style.setProperty(k, v));
  sign.style.setProperty('--k', (FONTS.soho[4] / f[4]) * (size[1] / 10));
  sign.setAttribute('aria-label', `Your sign, ${st.on ? 'lit' : 'switched off'}: ${text}`);
  fitSign(sign);
}
function fitSign(sign) {
  const plate = sign.parentElement; if (!plate) return;
  sign.style.setProperty('--fit', 1);
  const w = sign.getBoundingClientRect().width, max = plate.clientWidth * .82;
  if (w > max) sign.style.setProperty('--fit', (max / w).toFixed(3));
}
const relit = sign => { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; sign.classList.remove('sign--relit'); void sign.offsetWidth; sign.classList.add('sign--relit'); setTimeout(() => sign.classList.remove('sign--relit'), 1200); };

/* --- the day plate: fetched only when someone switches the lights off (§6 #3) --- */
function dayPicture(scene, portraitOnly) {
  const S = `/lit-neon-preview/assets/img/scenes/${scene}`;
  const set = (stem, ws, fmt) => ws.map(w => `${S}/${stem}-${w}.${fmt} ${w}w`).join(', ');
  const land = portraitOnly ? '' : `<source media="(min-width: 768px)" type="image/avif" srcset="${set('day-wall', [1000, 1600], 'avif')}" sizes="(min-width: 1024px) 80vw, 130vw"><source media="(min-width: 768px)" type="image/webp" srcset="${set('day-wall', [1000, 1600], 'webp')}" sizes="(min-width: 1024px) 80vw, 130vw"><source media="(min-width: 768px)" srcset="${set('day-wall', [1000, 1600], 'jpg')}" sizes="(min-width: 1024px) 80vw, 130vw">`;
  const p = document.createElement('picture'); p.className = 'plate--day';
  p.innerHTML = `${land}<source type="image/avif" srcset="${set('day-portrait-wall', [1000, 1600], 'avif')}" sizes="150vw"><source type="image/webp" srcset="${set('day-portrait-wall', [1000, 1600], 'webp')}" sizes="150vw"><img src="${S}/day-portrait-wall-1000.jpg" srcset="${set('day-portrait-wall', [1000, 1600], 'jpg')}" sizes="150vw" alt="" width="1000" height="1250" decoding="async" loading="eager">`;
  return p;
}
function wireToggle(btn, host, plate, scene, getState, setOn) {
  let day = null;
  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on)); const l = btn.querySelector('span'); if (l) l.textContent = on ? 'On' : 'Off';
    if (!on && !day) { day = dayPicture(scene, plate.dataset.portrait === '1'); const img = day.querySelector('img'); img.onload = () => img.classList.add('ok'); plate.insertBefore(day, plate.querySelector('.sign')); }
    host.classList.toggle('is-off', !on); setOn(on);
    if (on) relit(plate.querySelector('.sign'));
  });
}

/* --- hero --- */
const hero = $('#hero'), plate = $('#plate'), sign = $('#sign'), signText = $('#sign-text'), input = $('#words'), count = $('#count'), priceEl = $('#price'), cta = $('#cta');
const swatches = $$('#sws .sw'), faceBtn = $('#face-btn'), faceName = $('#face-name');
function setState(partial, { strike = false } = {}) {
  Object.assign(state, partial); paintSign(sign, signText, state); if (strike) relit(sign); emit();
}
input.addEventListener('input', () => {
  const v = input.value; count.textContent = v.length >= 16 ? `${v.length}/24` : '';
  setState({ text: v });
});
input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
input.addEventListener('focus', () => engine(), { once: true });
$('#sws').addEventListener('click', e => { const b = e.target.closest('.sw'); if (!b) return; swatches.forEach(x => x.setAttribute('aria-pressed', String(x === b))); setState({ colour: b.dataset.c }, { strike: true }); });
$('#faces').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; $$('#faces [data-f]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); const f = FONTS[b.dataset.f]; faceName.textContent = f[0]; faceName.style.fontFamily = `"${f[1]}", cursive`; faceName.style.fontWeight = f[2]; faceBtn.setAttribute('aria-label', `Lettering: ${f[0]}`); setState({ font: b.dataset.f }); });
wireToggle($('#tog'), hero, plate, 's01-living', () => state, on => { state.on = on; emit(); });
addEventListener('resize', () => fitSign(sign), { passive: true });
document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => { fitSign(sign); if (live.sheet) live.sheet(); });

/* --- the engine: pricing + renderer + router, loaded on the first interaction, then the price follows the words --- */
let enginePromise = null; const live = {};
function engine() {
  return enginePromise || (enginePromise = Promise.all([import('core/pricing.js'), import('core/renderer.js'), import('core/router.js')]).then(([P, R, RT]) => {
    const pricing = P.default; const gbp = P.gbp;
    const design = () => ({ text: state.text, font: state.font, colour: state.colour, size: state.size, scene: state.scene, jacket: 'white' });
    let timer = 0; const off = R.onFonts(() => price());
    function price() {
      const st = design(); if (!st.text.trim()) { priceEl.innerHTML = `<span>Type a word to see its price</span>`; return; }
      const p = pricing.price(st);
      if (p.kind === 'wait') { priceEl.innerHTML = `<span>Measuring your lettering…</span>`; R.ensureFonts([st.font]).then(() => price()); return; }
      if (p.kind === 'price') priceEl.innerHTML = `<b>${esc(gbp(p.payable))}</b><span>at ${SIZES[state.size][0]} · about ${p.dims.W} × ${p.dims.H} cm</span>`;
      else if (p.kind === 'quote') priceEl.innerHTML = `<b>Quoted</b><span>${esc(pricing.quoteReason(p))}</span>`;
      else if (p.kind === 'bad') priceEl.innerHTML = `<span>We can't draw ${esc(p.bad.join(' '))} in tube</span>`;
      else priceEl.innerHTML = `<span>Type a word to see its price</span>`;
      const link = RT.builderLink(st).replace('/lit-neon-preview/create.html', (cta.getAttribute('href') || '/lit-neon-preview/create.html').split('#')[0]); cta.href = link; const s = $('#sticky-cta'); if (s) s.href = link; const h = $('#how-cta'); if (h) h.href = link;
    }
    const schedule = () => { clearTimeout(timer); timer = setTimeout(price, 120); };
    subs.add(schedule); price();
    live.pricing = pricing; live.R = R; live.design = design;
    return { pricing, R, RT, design, gbp };
  }).catch(e => { console.error(e); priceEl.innerHTML = `<span>Priced live in the designer</span>`; }));
}
['pointerdown', 'keydown'].forEach(t => $('#panel').addEventListener(t, () => engine(), { once: true, passive: true }));

/* --- sheets (lettering · quiz · menu): one open at a time, Esc / backdrop close, scroll locked --- */
let openSheet = null, lastFocus = null;
function open(id) {
  close(); const s = $(id); if (!s) return; lastFocus = document.activeElement; s.hidden = false; s.classList.add('is-on'); document.body.classList.add('has-overlay'); openSheet = s;
  const f = s.querySelector('button:not([data-close]), a, input'); (f || s.querySelector('[data-close]')).focus({ preventScroll: true }); paintSticky();
}
function close() { if (!openSheet) return; openSheet.classList.remove('is-on'); openSheet.hidden = true; openSheet = null; document.body.classList.remove('has-overlay'); if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true }); paintSticky(); }
$$('.sheet').forEach(s => { s.addEventListener('click', e => { if (e.target === s || e.target.closest('[data-close]')) close(); }); });
addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
faceBtn.addEventListener('click', () => open('#sheet-face'));
const menuBtn = $('#menu-btn'); if (menuBtn) menuBtn.addEventListener('click', () => open('#sheet-menu'));

/* --- the three-question quiz (data/quiz.json, fetched when the sheet opens) --- */
let quizData = null; const picks = {};
$('#quiz-btn').addEventListener('click', async () => {
  open('#sheet-quiz'); engine();
  if (!quizData) { try { quizData = await (await fetch('/lit-neon-preview/data/quiz.json')).json(); } catch { $('#quiz').innerHTML = '<p>The questions didn\'t load. Try the designer instead.</p>'; return; } renderQuiz(); }
});
function renderQuiz() {
  const q = $('#quiz'); q.innerHTML = quizData.steps.map(s => `<div><h3>${esc(s.question)}</h3><div class="chips chips--wrap" role="group" aria-label="${esc(s.question)}">${s.options.map(o => `<button type="button" class="chip" data-step="${s.id}" data-o="${o.id}" aria-pressed="false">${esc(o.label)}${o.hint ? ` <small>· ${esc(o.hint)}</small>` : ''}</button>`).join('')}</div></div>`).join('');
  q.addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (!b) return; $$(`[data-step="${b.dataset.step}"]`, q).forEach(x => x.setAttribute('aria-pressed', String(x === b))); picks[b.dataset.step] = b.dataset.o; $('#quiz-go').disabled = !(picks.room && picks.mood && picks.wall); });
}
$('#quiz-go').addEventListener('click', () => {
  const D = quizData; if (!D) return; const words = (((D.words[picks.room] || {})[picks.mood]) || [['Your words']])[0]; const font = (D.fonts[picks.mood] || ['soho']).find(f => FONTS[f]) || 'soho'; const colour = (D.colours[picks.mood] || ['pink'])[0];
  const wall = D.steps.find(s => s.id === 'wall').options.find(o => o.id === picks.wall); const size = wall && SIZES[wall.size] ? wall.size : 'm';
  const line = words.join(' '); input.value = line; count.textContent = line.length >= 16 ? `${line.length}/24` : '';
  const sw = swatches.find(b => b.dataset.c === colour); if (sw) swatches.forEach(x => x.setAttribute('aria-pressed', String(x === sw)));
  const fb = $(`#faces [data-f="${font}"]`); if (fb) fb.click(); else setState({ font });
  setState({ text: line, colour, size }, { strike: true }); close();
  hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

/* --- bestsellers rail: chips swap the pre-rendered cards; "from" prices fill in once the engine is near --- */
const railData = JSON.parse($('#rail-data').textContent); const rail = $('#rail');
const cardHtml = d => `<a class="card" href="/lit-neon-preview/product.html?id=${d.id}"><div class="card__img"><img src="/lit-neon-preview/assets/img/cards/${d.id}/lit-400.avif" srcset="/lit-neon-preview/assets/img/cards/${d.id}/lit-400.avif 400w, /lit-neon-preview/assets/img/cards/${d.id}/lit-800.avif 800w" sizes="(min-width: 768px) 240px, 68vw" alt="Rendered preview of the “${esc(d.name)}” sign" width="400" height="500" loading="lazy" decoding="async" onload="this.classList.add('ok')"><span class="pill">Rendered preview</span></div><h3>${esc(d.name)}</h3><p data-id="${d.id}">${esc(d.sub)}</p></a>`;
$('#rail-chips').addEventListener('click', e => {
  const b = e.target.closest('[data-set]'); if (!b) return; $$('#rail-chips [data-set]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  rail.innerHTML = railData[b.dataset.set].map(cardHtml).join(''); rail.scrollTo({ left: 0 }); fillFrom();
});
async function fillFrom() {
  const E = await engine(); if (!E) return; const all = Object.values(railData).flat();
  try { await E.R.ensureFonts([...new Set($$('#rail p[data-id]').map(p => (all.find(x => x.id === p.dataset.id) || {}).font).filter(Boolean))]); } catch {}
  $$('#rail p[data-id]').forEach(p => { if (p.dataset.from) return; const d = all.find(x => x.id === p.dataset.id); if (!d) return; const v = E.pricing.fromPrice({ lines: d.lines, font: d.font, colour: d.colour, icon: d.icon }, { size: 's' }) ?? E.pricing.fromPrice({ lines: d.lines, font: d.font, colour: d.colour, icon: d.icon }, { size: 'm' }); if (v != null) { p.dataset.from = '1'; p.textContent = `${d.sub} · from ${E.gbp(v)}`; } });
}

/* --- how it works: the proof drawing (core/sheet.js) is drawn from the hero words when the section nears --- */
const sheetBox = $('#sheet'); let sheetMod = null;
new IntersectionObserver(async (es, io) => {
  if (!es.some(e => e.isIntersecting)) return; io.disconnect();
  try { const [S] = await Promise.all([import('core/sheet.js'), engine()]); sheetMod = S;
    live.sheet = () => { const d = Object.assign({}, live.design ? live.design() : state); S.render(sheetBox, d, { compact: true }); sheetBox.classList.add('is-live'); const cap = $('#sheet-cap'); if (cap) cap.textContent = `Drawn live from “${(state.text || '').trim() || 'Your words'}”, at ${SIZES[state.size][0]}`; };
    live.sheet(); subs.add(() => { clearTimeout(live.sheetT); live.sheetT = setTimeout(live.sheet, 200); });
    const pdf = $('#how-pdf'); if (pdf) { pdf.hidden = false; pdf.addEventListener('click', async () => { pdf.disabled = true; pdf.textContent = 'Drawing your sign…'; try { const X = await import('core/drawing-export.js'); await X.download(live.design()); } catch (e) { console.error(e); } pdf.disabled = false; pdf.textContent = 'Download the drawing as PDF'; }); }
  } catch (e) { console.error(e); }
}, { rootMargin: '600px 0px' }).observe(sheetBox);

/* --- rail prices once the rail is near (needs the engine; below the fold, so never on load) --- */
new IntersectionObserver((es, io) => { if (es.some(e => e.isIntersecting)) { io.disconnect(); fillFrom(); } }, { rootMargin: '400px 0px' }).observe(rail);

/* --- see it in your room (home 2 only): lazy module --- */
const demo = $('#demo'); if (demo) new IntersectionObserver((es, io) => { if (es.some(e => e.isIntersecting)) { io.disconnect(); import('/lit-neon-preview/v/home-demo.js').then(m => m.mount(demo, { state, subs, engine, paintSign, wireToggle, relit, FONTS, COLOURS, SIZES })).catch(e => console.error(e)); } }, { rootMargin: '500px 0px' }).observe(demo);

/* --- one sticky thing at a time: sticky CTA (phone, after the hero, not at the footer) · cookie bar · version pill --- */
const sticky = $('#sticky'), cookie = $('#cookie'), ver = $('#ver');
let heroOut = false, footerNear = false, cookieOpen = false;
const consent = () => { try { return localStorage.getItem('consent'); } catch { return '1'; } };
function paintSticky() {
  const show = heroOut && !footerNear && !cookieOpen && !openSheet && matchMedia('(max-width: 767px)').matches;
  sticky.classList.toggle('is-on', show); sticky.setAttribute('aria-hidden', String(!show)); $('#sticky-cta').tabIndex = show ? 0 : -1; document.body.classList.toggle('has-sticky', show);
  ver.classList.toggle('is-on', heroOut && !ver.dataset.off);
}
new IntersectionObserver(es => { heroOut = !es[0].isIntersecting && scrollY > 240; if (heroOut && !consent()) showCookie(); paintSticky(); }, { threshold: 0 }).observe(hero);
new IntersectionObserver(es => { footerNear = es[0].isIntersecting; paintSticky(); }, { rootMargin: '0px 0px 80px 0px' }).observe($('#footer'));
function showCookie(top) { if (cookieOpen || consent()) return; cookieOpen = true; cookie.classList.toggle('cookie--top', !!top); cookie.classList.add('is-on'); document.body.classList.add('has-cookie'); paintSticky(); }
function hideCookie(v) { try { localStorage.setItem('consent', JSON.stringify({ essential: true, analytics: v, marketing: v, at: Date.now() })); } catch {} cookieOpen = false; cookie.classList.remove('is-on'); document.body.classList.remove('has-cookie'); paintSticky(); }
$('#ck-yes').addEventListener('click', () => hideCookie(true)); $('#ck-no').addEventListener('click', () => hideCookie(false));
/* never over the hero panel: it waits for the hero to scroll away; if nobody scrolls, it appears at the top after a while */
if (!consent()) setTimeout(() => { if (!heroOut) showCookie(true); }, 12000);
$('#ver-x').addEventListener('click', () => { ver.dataset.off = '1'; paintSticky(); });
$('#year').textContent = String(new Date().getFullYear());

/* first paint is already lit; make sure the baked sign fits this viewport and the colour vars are set for the toggle */
paintSign(sign, signText, state);
