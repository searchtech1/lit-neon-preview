/* Lit Neon v2 — guides hub (brief §4.10; owner P6). The ten cards are in the HTML (crawlable); this module draws
   their neon tiles with the renderer, mounts ONE live stage for the lead feature (perf budget: ≤ 1 live stage),
   and runs the live search + topic chips (filter as you type, count in a live region, an honest empty state that
   routes to the help centre). ?q= and ?topic= are kept in the URL so a filtered view is shareable. data-qa="guides.*". */
import { bootContent, neonTile, $, $$, t, DATA, R, copy } from 'pages/info.js';
import stage from 'core/stage.js';

const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').trim();

(async function boot() {
  await bootContent('guides', ['info', 'guides'], { data: ['guides'] });
  tiles(); feature(); filter();
  document.documentElement.dataset.ready = 'guides';
})();

function tileOf(slug) { const v = copy.get(`guides.tiles.${slug}`); return v && typeof v === 'object' ? v : { text: 'Lit', font: 'shoreditch', colour: 'warm' }; }
function tiles() {
  $$('[data-card-tile]').forEach(el => neonTile(el, tileOf(el.dataset.cardTile), { rendered: true }));
}

function feature() {
  const el = $('[data-feature-stage]'); if (!el) return;
  const card = el.closest('[data-slug]'); const g = (DATA.guides.guides || []).find(x => x.slug === card.dataset.slug) || {};
  const st = tileOf(g.slug);
  try {
    stage.mount(el, { frame: 'card', scene: g.scene || 's01-living', design: R.normalise({ ...R.DEFAULT_DESIGN, text: st.text, font: st.font, colour: st.colour, size: 'm' }), view: { night: true, on: true, rulers: 'off' }, interactive: false, rulers: false, pill: true, qa: 'guides.feature.stage' });
  } catch (e) { console.error('guides: feature stage', e); }
}

function filter() {
  const input = $('#gh-q'); const chips = $$('.gh-chips [data-cat]'); const cards = $$('#gh-grid [data-qa="guides.card"]');
  const count = $('[data-qa="guides.count"]'); const empty = $('#gh-empty'); const featured = $('.gh-featured');
  const q0 = new URLSearchParams(location.search);
  let cat = chips.some(c => c.dataset.cat === q0.get('topic')) ? q0.get('topic') : 'all';
  input.value = (q0.get('q') || '').slice(0, 60);
  const apply = ({ push = true } = {}) => {
    const terms = norm(input.value).split(/\s+/).filter(Boolean);
    let n = 0;
    cards.forEach(c => {
      const hay = norm(c.dataset.hay);
      const ok = (cat === 'all' || c.dataset.cat === cat) && terms.every(w => hay.includes(w));
      c.hidden = !ok; if (ok) n++;
    });
    chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.cat === cat)));
    $('#gh-grid').classList.toggle('is-filtered', !!terms.length || cat !== 'all');
    count.textContent = n === 0 ? t('guides.hub.countNone') : n === 1 ? t('guides.hub.countOne') : t('guides.hub.count', { n });
    empty.hidden = n > 0;
    if (!n) {
      $('#gh-empty-t').textContent = terms.length ? t('guides.hub.emptyTitle', { q: input.value.trim() }) : t('guides.hub.countNone');
      $('#gh-empty-help').href = `/lit-neon-preview/rework/help.html${input.value.trim() ? `?s=${encodeURIComponent(input.value.trim())}` : ''}`;
    }
    /* the featured strip only makes sense for the unfiltered view */
    featured.hidden = !!terms.length || cat !== 'all';
    if (push) {
      const u = new URL(location.href); terms.length ? u.searchParams.set('q', input.value.trim()) : u.searchParams.delete('q'); cat !== 'all' ? u.searchParams.set('topic', cat) : u.searchParams.delete('topic');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    }
  };
  input.addEventListener('input', () => apply());
  input.addEventListener('keydown', e => { if (e.key === 'Escape' && input.value) { input.value = ''; apply(); } });
  chips.forEach(c => c.addEventListener('click', () => { cat = c.dataset.cat; apply(); }));
  $('#gh-clear').addEventListener('click', () => { input.value = ''; cat = 'all'; apply(); input.focus(); });
  apply({ push: false });
}
