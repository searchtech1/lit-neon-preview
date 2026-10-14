/* Lit Neon v2 — 404 (brief §4.23; owner P6). A flickering "Not here" sign on the living-room plate (stage compositor,
   wide frame so the sofa shows, strike-on that falters every few seconds, still under reduced motion), a working site search over
   designs, collections, guides and help answers (core/search.js) with a "Design '{query}' as a sign" row that carries
   the words into the builder, and links to the builder, shop and help. Every asset path is root-absolute because this
   file is served for any unknown URL. data-qa="notfound.*". */
import { bootContent, $, t, esc, icon, R, router } from 'pages/info.js';
import stage from 'core/stage.js';

(async function boot() {
  await bootContent('notfound', ['info', 'notfound'], { data: [] });
  sign(); search();
  document.documentElement.dataset.ready = 'notfound';
})();

function sign() {
  const el = $('#nf-stage');
  const st = R.normalise({ ...R.DEFAULT_DESIGN, text: t('notfound.sign', {}, 'Not here'), font: 'hackney', colour: 'pink', size: 'm' });
  let api = null;
  try { api = stage.mount(el, { frame: 'wide', scene: 's01-living', design: st, view: { night: true, on: true, rulers: 'off' }, interactive: false, rulers: false, pill: true, qa: 'notfound.stage' }); } catch (e) { console.error(e); return; }
  const reduced = R.reducedMotion();
  /* the tube "falters": a short off-flicker every few seconds, never a strobe (≤ 3 flashes per second, WCAG 2.3.1) */
  let timer = 0;
  const falter = () => { if (!api || reduced) return; api.setView({ on: false }); setTimeout(() => api.setView({ on: true }), 140); setTimeout(() => api.setView({ on: false }), 520); setTimeout(() => { api.setView({ on: true }); api.strike && api.strike(); }, 760); };
  const loop = () => { clearTimeout(timer); timer = setTimeout(() => { falter(); loop(); }, 5200); };
  if (!reduced) { setTimeout(falter, 900); loop(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else if (!reduced) loop(); });
  $('#nf-replay').addEventListener('click', () => { if (reduced) { api.setView({ on: false }); setTimeout(() => api.setView({ on: true }), 400); } else falter(); });
}

const STOP = new Set(['no', 'such', 'page', 'not', 'found', 'html', 'htm', 'php', 'index', 'www', 'the', 'old', 'new', '404']);
function search() {
  const input = $('#nf-q'); const out = $('#nf-results');
  /* prefill from the dead URL: /neon-sign-mr-and-mrs → "neon sign mr and mrs" */
  const guess = decodeURIComponent(location.pathname.split('/').pop() || '').replace(/\.html?$/i, '').replace(/[-_+]+/g, ' ').replace(/[^\w &']/g, '').split(/\s+/).filter(w => w && !STOP.has(w.toLowerCase())).join(' ').trim();
  let mod = null; const load = () => mod || (mod = import('core/search.js').then(m => m.default || m).catch(() => null));
  let seq = 0;
  async function run() {
    const q = input.value.trim(); const my = ++seq;
    if (!q) { out.innerHTML = ''; return; }
    const s = await load(); if (my !== seq) return;
    let res = { designs: [], collections: [], guides: [], help: [] };
    try { if (s && s.ready) await s.ready(); res = s && s.query ? await s.query(q, { limit: 4 }) : res; } catch {}
    if (my !== seq) return;
    const groups = ['designs', 'collections', 'guides', 'help'].filter(g => (res[g] || []).length);
    const words = q.slice(0, 24);
    const design = `<a class="nf-row nf-row--design" href="${esc(router.builderLink(R.normalise({ ...R.DEFAULT_DESIGN, text: words })))}" data-qa="notfound.designit">${icon('pencil')}<span>${esc(t('notfound.designIt', { q: words }))}</span>${icon('arrow-right')}</a>`;
    out.innerHTML = (groups.length ? groups.map(g => `<div class="nf-group"><p class="nf-group__h">${esc(t(`notfound.groups.${g}`))}</p>${res[g].slice(0, 4).map(it => `<a class="nf-row" href="${esc(it.href)}" data-qa="notfound.result" data-type="${g}">${icon(g === 'guides' ? 'drawing' : g === 'help' ? 'info' : g === 'collections' ? 'grid' : 'image')}<span><b>${esc(it.title)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></a>`).join('')}</div>`).join('')
      : `<p class="nf-none">${esc(t('notfound.noResults', { q }))}</p>`) + design;
  }
  let deb = 0;
  input.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(run, 120); });
  $('#nf-search').addEventListener('submit', e => { e.preventDefault(); run().then(() => out.querySelector('a')?.focus()); });
  if (guess && guess.length > 2 && !/^404$/.test(guess)) { input.value = guess.slice(0, 40); run(); }
}
