/* Catalog presentation only; query state and provider requests stay in page controllers. */
(() => {
  'use strict';
  const types = { 'phim-bo': 'Phim bộ', 'phim-le': 'Phim lẻ', 'chieu-rap': 'Phim chiếu rạp', 'phim-chieu-rap': 'Phim chiếu rạp', 'song-ngu': 'Phim Song Ngữ', 'hoat-hinh': 'Anime & hoạt hình', 'tv-shows': 'TV Show & Gameshow' };
  const formats = { '4k': '4K', fhd: 'Full HD', vietsub: 'Vietsub', thuyetminh: 'Thuyết minh', longtieng: 'Lồng tiếng' };
  const active = value => value && value !== 'all';
  const nameOf = (items, slug) => (items || []).find(item => item.slug === slug)?.name || slug;
  function update(filters, meta = {}) {
    const type = types[filters.type];
    const category = active(filters.category) ? nameOf(meta.categories, filters.category) : '';
    const country = active(filters.country) ? nameOf(meta.countries, filters.country) : '';
    const title = filters.keyword ? 'Kết quả tìm kiếm' : category ? `Phim ${category}` : country ? `Phim ${country}` : type || 'Khám phá phim';
    const heading = document.getElementById('catalog-page-title');
    if (heading) heading.textContent = title;
    document.title = `${title} | CineViet`;
    const labels = [type, category, country, active(filters.year) ? filters.year === 'pre-2020' ? 'Trước 2020' : filters.year : '', active(filters.format) ? formats[filters.format] || filters.format : ''].filter(Boolean);
    const summary = document.getElementById('catalog-filter-summary');
    if (summary) summary.textContent = labels.join(' · ') || 'Tất cả phim';
    const count = ['country', 'year', 'format', 'category'].filter(key => active(filters[key])).length;
    const badge = document.getElementById('catalog-filter-count');
    if (badge) { badge.textContent = count ? String(count) : ''; badge.hidden = !count; }
  }
  window.CatalogLayout = { update };
  const start = () => {
    const toggle = document.getElementById('catalog-filter-toggle'), advanced = document.getElementById('catalog-advanced-filters');
    if (!toggle || !advanced) return;
    const phone = window.matchMedia('(max-width: 767px)');
    const panel = document.getElementById('catalog-filter-panel');
    const render = expanded => {
      toggle.setAttribute('aria-expanded', String(expanded));
      panel.classList.toggle('is-filter-collapsed', !expanded);
      advanced.inert = !expanded;
    };
    panel.classList.add('catalog-layout-ready');
    render(!phone.matches);
    toggle.addEventListener('click', () => render(toggle.getAttribute('aria-expanded') !== 'true'));
    phone.addEventListener?.('change', () => {
      if (phone.matches && advanced.contains(document.activeElement)) toggle.focus({ preventScroll: true });
      render(!phone.matches);
    });
    advanced.addEventListener('keydown', event => {
      if (event.key === 'Escape' && phone.matches) { event.preventDefault(); render(false); toggle.focus({ preventScroll: true }); }
    });
    document.getElementById('btn-apply-filters')?.addEventListener('click', () => {
      if (phone.matches) { render(false); toggle.focus({ preventScroll: true }); }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
