/* Lit Neon v2 — ix/quiz.js (brief §5.6): find your sign in three questions. A compact entry card (eyebrow, H2, one
   line, three rendered examples, "Find my sign · 3 questions"); the questions open in a modal sheet, one per screen,
   with a step indicator and Back; answers are large aria-pressed cards with mini renders; arrows move, Enter selects
   and advances. The result renders back into the card, expanding it in place: three picks from data/quiz.json
   (words by room × mood, face and colour by mood, the size whose width is closest to the wall answer), each a live
   stage with the real price and "Open in the designer"; "Try different words" reshuffles in the same bucket; "Email
   me these three" goes through forms.submit('quizEmail') (success only on a 2xx); the answers live in the URL hash
   (#quiz=bed.cheeky.above) so a result is shareable and reopens. No save/heart control (C14). */
import { boot, readState, link, t, esc, icon, R, stage, pricing, router, money, ui, roving, h, $, $$, reduced, uid } from './_ix.js';
import forms from 'core/forms.js';

let quizPromise = null; const loadQuiz = () => quizPromise || (quizPromise = fetch('/lit-neon-preview/data/quiz.json', { cache: 'no-store' }).then(r => r.json()));
const parseHash = () => { const m = location.hash.match(/(?:^#|&)quiz=([a-z]+)\.([a-z]+)\.([a-z]+)/i); return m ? { room: m[1], mood: m[2], wall: m[3] } : null; };
function writeHash(ans) {
  const parts = location.hash.replace(/^#/, '').split('&').filter(p => p && !/^quiz=/.test(p));
  if (ans) parts.push(`quiz=${ans.room}.${ans.mood}.${ans.wall}`);
  try { history.replaceState(null, '', parts.length ? '#' + parts.join('&') : location.pathname + location.search); } catch {}
}

export function mount(el, opts = {}) {
  el.classList.add('ix', 'ix-quiz'); el.dataset.qa = 'ix.quiz'; el.dataset.state = 'entry';
  const id = uid('qz'); let Q = null, killed = false, sheet = null, step = 0, ans = { room: null, mood: null, wall: null }, offset = 0; const stages = [];
  const api = { destroy, setState: () => {}, open: () => start(), result: () => showResult() };
  const enabledFonts = () => R.enabledFonts().map(f => f.id);

  function entryHtml() {
    const examples = [{ t: 'Sweet dreams', f: 'brighton', c: 'ice' }, { t: 'Mr & Mrs', f: 'notting', c: 'warm' }, { t: 'GG', f: 'brixton', c: 'green' }];
    return `<div class="ix-quiz__entry">
      <div class="ix-quiz__copy"><p class="t-eyebrow">${esc(t('quiz.eyebrow'))}</p><h2>${esc(t('quiz.h2'))}</h2><p class="t-lead">${esc(t('quiz.lede'))}</p>
        <button type="button" class="c-btn c-btn--primary c-btn--lg" data-qa="ix.quiz.start">${esc(t('quiz.start'))}</button></div>
      <div class="ix-quiz__examples" aria-hidden="true">${examples.map(x => ui.mini({ text: x.t, font: x.f, colour: x.c, large: true })).join('')}</div>
    </div>`;
  }
  function render() { el.innerHTML = entryHtml(); }

  /* ---------- the sheet: one question per screen ---------- */
  function start(at = 0) {
    step = at;
    if (!sheet) sheet = ui.sheet({ title: t('quiz.dialogTitle'), modal: true, qa: 'ix.quiz.sheet', onClose: () => { } });
    paintStep(); sheet.open($(el, '[data-qa="ix.quiz.start"]') || undefined);
  }
  function paintStep() {
    const s = Q.steps[step]; const chosen = ans[s.id];
    const sample = (o) => { const words = s.id === 'room' ? (o.sample && o.sample[0]) || o.label : s.id === 'mood' ? (o.sample && o.sample[0]) || o.label : o.label; const font = s.id === 'mood' ? firstFont(o.id) : (ans.mood ? firstFont(ans.mood) : 'soho'); const colour = s.id === 'mood' ? (Q.colours[o.id] || [])[0] || 'pink' : (ans.mood ? (Q.colours[ans.mood] || [])[0] : 'pink'); return { words, font, colour }; };
    sheet.setBody(`
      <div class="ix-quiz__step" data-step="${step + 1}">
        <p class="ix-quiz__stepof">${esc(t('quiz.stepOf', { n: step + 1, total: Q.steps.length }))}</p>
        <h3 class="ix-quiz__q">${esc(s.question)}</h3>
        <div class="ix-quiz__opts" role="group" aria-label="${esc(s.question)}">
          ${s.options.map((o, i) => { const sm = sample(o); return `<button type="button" class="ix-quiz__opt" aria-pressed="${o.id === chosen}" tabindex="${(chosen ? o.id === chosen : i === 0) ? 0 : -1}" data-id="${o.id}" data-qa="ix.quiz.opt">${s.id === 'wall' ? `<span class="ix-quiz__wall" aria-hidden="true"><i style="--w:${Math.min(100, Math.round(o.targetCm / 1.8))}%"></i></span>` : ui.mini({ text: sm.words, font: sm.font, colour: sm.colour })}<span class="lbl"><b>${esc(o.label)}</b>${o.hint ? `<span>${esc(o.hint)}</span>` : ''}</span></button>`; }).join('')}
        </div>
        <div class="ix-quiz__nav">${step > 0 ? `<button type="button" class="c-btn c-btn--ghost" data-qa="ix.quiz.back">${icon('arrow-left')}${esc(t('quiz.back'))}</button>` : '<span></span>'}<button type="button" class="c-btn c-btn--primary" data-qa="ix.quiz.next" ${chosen ? '' : 'disabled'}>${esc(step === Q.steps.length - 1 ? t('quiz.result', { room: '' }).replace(/\s+$/, '').replace(/ for your$/, '') : t('quiz.next'))}</button></div>
      </div>`);
    const body = sheet.body(); const opts = $(body, '.ix-quiz__opts');
    roving(opts, '.ix-quiz__opt', { orientation: 'horizontal' });
    opts.addEventListener('click', e => { const b = e.target.closest('.ix-quiz__opt'); if (!b) return; choose(b.dataset.id); });
    opts.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const b = e.target.closest('.ix-quiz__opt'); if (b) { e.preventDefault(); choose(b.dataset.id); } } });
    body.querySelector('[data-qa="ix.quiz.back"]')?.addEventListener('click', () => { step = Math.max(0, step - 1); paintStep(); });
    body.querySelector('[data-qa="ix.quiz.next"]')?.addEventListener('click', () => advance());
    const first = opts.querySelector('[tabindex="0"]'); setTimeout(() => first && first.focus(), 60);
  }
  function choose(idv) { const s = Q.steps[step]; ans[s.id] = idv; $$(sheet.body(), '.ix-quiz__opt').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === idv))); const nx = sheet.body().querySelector('[data-qa="ix.quiz.next"]'); if (nx) nx.disabled = false; setTimeout(advance, 220); }
  function advance() { if (!ans[Q.steps[step].id]) return; if (step < Q.steps.length - 1) { step++; paintStep(); } else { offset = 0; sheet.close('done'); showResult(); } }

  /* ---------- picks ---------- */
  const firstFont = mood => { const en = enabledFonts(); const pref = (Q.fonts[mood] || Q.fallback.fonts).filter(f => en.includes(f)); return pref[0] || en[0]; };
  function picks() {
    /* Every indoor pick must carry a payable price (adversarial finding: Living room → Snug → shelf returned three
       "Quoted" Smalls because Small's 7 cm letters sit under Notting Hill's 10 cm minimum). For each pick we search
       face × size × words: faces in the mood's preference order rotated by the pick index (so three picks spread
       across three faces), sizes closest to the wall answer first, the pick's own words first and the rest of the
       bucket (then the generic fallback) only if those words cannot be priced. A candidate is only kept when
       pricing.price() says kind:'price'; the best one is the nearest width to the wall with a small penalty for
       walking down the face list. If nothing in the catalogue prices, the pick is an honest quote (p.quoted). */
    const en = enabledFonts(); const room = Q.steps[0].options.find(o => o.id === ans.room), wall = Q.steps[2].options.find(o => o.id === ans.wall);
    const words = (Q.words[ans.room] && Q.words[ans.room][ans.mood]) || Q.fallback.words;
    const fonts = (Q.fonts[ans.mood] || Q.fallback.fonts).filter(f => en.includes(f)); const faces = fonts.length ? fonts : en;
    const colours = Q.colours[ans.mood] || Q.fallback.colours;
    const scene = (room && room.scene) || Q.fallback.scene;
    const target = wall ? wall.targetCm : 100; const used = new Set();
    const tryCombo = (lines, font, colour) => {
      const text = lines.join('\n'); let best = null;
      for (const sz of R.OPTIONS.sizes) {
        const st = R.normalise({ text, font, colour, size: sz.id, scene }); const res = R.resolve(st); const d = res.dims; if (!d) continue;
        const p = pricing.price(st, { res }); const diff = Math.abs(d.W - target);
        const cand = { state: st, res, price: p, scene, diff, payable: p.kind === 'price' };
        if (!best || (cand.payable && !best.payable) || (cand.payable === best.payable && diff < best.diff)) best = cand;
      }
      return best;
    };
    return [0, 1, 2].map(i => {
      const colour = colours[i % colours.length]; const own = words[(i + offset) % words.length];
      const wordSets = [own].concat(words.filter(w => w !== own && !used.has(w.join('\n'))), Q.fallback.words.filter(w => !words.includes(w)));
      const order = faces.slice(i % faces.length).concat(faces.slice(0, i % faces.length));
      let chosen = null;
      for (const lines of wordSets) {
        let bestHere = null;
        order.forEach((font, rank) => { const c = tryCombo(lines, font, colour); if (!c || !c.payable) return; const score = c.diff + rank * 4; if (!bestHere || score < bestHere.score) bestHere = Object.assign(c, { score }); });
        if (bestHere) { chosen = bestHere; break; }
      }
      if (!chosen) chosen = Object.assign(tryCombo(own, order[0], colour) || tryCombo(Q.fallback.words[0], order[0], colour), { quoted: true });
      used.add(chosen.res.text || chosen.state.text);
      return chosen;
    });
  }
  function showResult() {
    if (!ans.room || !ans.mood || !ans.wall) return;
    writeHash(ans); stages.splice(0).forEach(s => s.destroy());
    const room = Q.steps[0].options.find(o => o.id === ans.room); const P = picks();
    router.design.setDebounced(P[0].state, 'quiz', 300);
    el.dataset.state = 'result';
    el.innerHTML = `<div class="ix-quiz__result" data-qa="ix.quiz.result">
      <div class="ix-quiz__rhead"><div><p class="t-eyebrow">${esc(t('quiz.eyebrow'))}</p><h2>${esc(t('quiz.result', { room: (room ? room.label : '').toLowerCase() }))}</h2><p class="t-lead">${esc(t(P.some(p => p.quoted) ? 'quiz.resultLedeQuoted' : 'quiz.resultLede'))}</p></div>
        <div class="ix-quiz__ractions"><button type="button" class="c-btn c-btn--ghost" data-qa="ix.quiz.reshuffle">${icon('rotate')}${esc(t('quiz.reshuffle'))}</button><button type="button" class="c-btn c-btn--text" data-qa="ix.quiz.retake"><span class="label">${esc(t('quiz.retake'))}</span></button></div></div>
      <div class="ix-quiz__picks">${P.map((p, i) => { const d = p.res.dims; const sz = R.sizeOf(p.state.size); return `<article class="ix-quiz__pick" data-qa="ix.quiz.pick" aria-label="${esc(t('quiz.pickLabel', { words: p.res.words, font: p.res.font.name, colour: p.res.colour.name, size: sz.name }))}">
          <div class="ix-quiz__stage ix__stage"><div class="ix-quiz__mount"></div></div>
          <div class="ix-quiz__pbody"><h3>${esc(p.res.words)}</h3><p class="t-small">${esc(p.res.font.name)} · ${esc(p.res.colour.name)} · ${esc(t('quiz.sizeHint', { size: sz.name, dims: d ? money.fmtDims(d.W, d.H, 'cm') : '' }))}</p>
            <div class="ix-quiz__price c-price c-price--inline"><span class="amount" data-qa="ix.quiz.price">${p.price.kind === 'price' ? esc(money.gbp(p.price.payable)) : esc(t('common.quote'))}</span>${p.price.kind === 'price' ? '' : `<span class="ix-quiz__qnote t-small" data-qa="ix.quiz.quoteNote">${esc(pricing.quoteReason(p.price) || t('quiz.quoteNote'))}</span>`}</div>
            <a class="c-btn c-btn--primary" href="${esc(link(p.state))}" data-qa="ix.quiz.open">${esc(t('quiz.open'))}</a></div></article>`; }).join('')}</div>
      <p class="ix__caption" data-caption="rendered">${icon('image')}<span>${esc(t('common.rendered'))}</span></p>
      <div class="ix-quiz__email" data-qa="ix.quiz.email">
        <form class="ix-quiz__form" novalidate>
          <div class="ix-quiz__formrow"><div class="c-field"><label for="${id}-em">${esc(t('quiz.emailLabel'))}</label><input class="c-input" id="${id}-em" name="email" type="email" inputmode="email" autocomplete="email" placeholder="${esc(t('quiz.emailPlaceholder'))}" data-qa="ix.quiz.email.input"></div>
          <button type="submit" class="c-btn c-btn--ghost" data-qa="ix.quiz.email.submit">${icon('mail')}${esc(t('quiz.email'))}</button></div>
          <label class="c-check"><input type="checkbox" name="consent" data-qa="ix.quiz.email.consent"><span>${esc(t('quiz.consent'))} <a href="/lit-neon-preview/legal/privacy.html">${esc(t('quiz.privacy'))}</a></span></label>
        </form>
        <div class="ix-quiz__done" hidden></div>
      </div></div>`;
    P.forEach((p, i) => { const m = $$(el, '.ix-quiz__mount')[i]; stages.push(stage.mount(m, { frame: 'card', scene: p.scene, design: Object.assign({}, p.state, { on: true, night: true }), interactive: false, pill: true, rulers: false, qa: `ix.quiz.stage${i + 1}`, relight: i === 0 })); });
    $(el, '[data-qa="ix.quiz.reshuffle"]').addEventListener('click', () => { offset++; showResult(); });
    $(el, '[data-qa="ix.quiz.retake"]').addEventListener('click', () => { ans = { room: null, mood: null, wall: null }; writeHash(null); stages.splice(0).forEach(s => s.destroy()); el.dataset.state = 'entry'; render(); start(0); });
    const form = $(el, '.ix-quiz__form'), done = $(el, '.ix-quiz__done');
    forms.bind(form, { kind: 'quizEmail', qa: 'ix.quiz.email', extra: () => ({ picks: P.map(p => location.origin + link(p.state)).join('\n'), quiz: `${ans.room}.${ans.mood}.${ans.wall}` }), onSuccess: res => { form.hidden = true; done.hidden = false; forms.renderSuccess(done, { ref: res.ref, local: res.local, title: t('quiz.success'), body: esc(t('quiz.successBody')), qa: 'ix.quiz.email' }); } });
  }
  function destroy() { killed = true; sheet && sheet.destroy(); stages.splice(0).forEach(s => s.destroy()); el.innerHTML = ''; }

  boot().then(async () => {
    if (killed) return; Q = await loadQuiz(); if (killed) return;
    render();
    el.addEventListener('click', e => { if (e.target.closest('[data-qa="ix.quiz.start"]')) { ans = { room: null, mood: null, wall: null }; start(0); } });
    const fromHash = parseHash(); const valid = a => a && Q.steps[0].options.some(o => o.id === a.room) && Q.steps[1].options.some(o => o.id === a.mood) && Q.steps[2].options.some(o => o.id === a.wall);
    if (valid(fromHash)) { ans = fromHash; showResult(); } else if (opts.expanded || el.dataset.expanded === 'true') start(0);
    window.addEventListener('hashchange', () => { const a = parseHash(); if (valid(a) && (a.room !== ans.room || a.mood !== ans.mood || a.wall !== ans.wall)) { if (sheet && sheet.isOpen) sheet.close('hash'); ans = a; offset = 0; showResult(); }  /* a shared #quiz= link opened mid-quiz: the sheet closes onto the result */ });
  });
  return api;
}
export default { mount };
