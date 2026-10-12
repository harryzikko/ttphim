const crypto = require('crypto');
const slots = ['header', 'footer', 'side_left', 'side_right', 'below_featured', 'below_player'];
const slotLabels = { header: 'Header · đầu nội dung', footer: 'Footer · cuối nội dung', side_left: 'Bên trái · desktop rộng', side_right: 'Bên phải · desktop rộng', below_featured: 'Dưới phim nổi bật · trang chủ', below_player: 'Dưới video player · trang xem' };
const text = (value, max, label) => {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label} không hợp lệ (tối đa ${max} ký tự)`);
  return value.trim();
};
function url(value, image = false) {
  const clean = text(value, 2048, 'URL');
  if (!clean) return '';
  if (!image && /^\/(?!\/|\\)/.test(clean) && !/[\x00-\x20\\]/.test(clean)) return clean;
  try {
    const parsed = new URL(clean);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    return parsed.href.replace(/'/g, '%27').replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E');
  } catch (_) { throw new Error('URL phải là HTTP(S) hoặc đường dẫn nội bộ hợp lệ'); }
}
function fields(item, ad = false) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Nội dung banner không hợp lệ');
  const result = {
    enabled: item.enabled !== false,
    title: text(item.title, 120, 'Tiêu đề'), description: text(item.description, 320, 'Mô tả'),
    image_desktop: url(item.image_desktop, true), image_mobile: url(item.image_mobile, true),
    cta_label: text(item.cta_label, 40, 'Nút hành động'),
    start: text(item.start, 40, 'Lịch bắt đầu'), end: text(item.end, 40, 'Lịch kết thúc'),
    focal_x: Number(item.focal_x ?? 50), focal_y: Number(item.focal_y ?? 50)
  };
  if (![result.focal_x, result.focal_y].every(n => Number.isFinite(n) && n >= 0 && n <= 100)) throw new Error('Điểm trọng tâm phải nằm trong 0–100');
  for (const field of ['start', 'end']) {
    if (result[field]) {
      if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result[field]) || !Number.isFinite(Date.parse(result[field]))) throw new Error('Lịch phải có múi giờ hợp lệ');
      result[field] = new Date(result[field]).toISOString();
    }
  }
  if (result.start && result.end && result.start >= result.end) throw new Error('Kết thúc phải sau bắt đầu');
  if (ad) {
    result.slot = ({ home_middle: 'below_featured', home_footer: 'footer' })[item.slot] || item.slot;
    result.href = url(item.href);
    result.new_tab = item.new_tab === true;
    if (!slots.includes(result.slot)) throw new Error('Vị trí quảng cáo không hợp lệ');
    if (result.enabled && (!result.image_desktop || !result.title || !result.href)) throw new Error('Quảng cáo đang bật cần tiêu đề, ảnh desktop và liên kết');
  } else {
    result.slug = text(item.slug, 200, 'Slug');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(result.slug)) throw new Error('Slug phim không hợp lệ');
  }
  return result;
}
function normalize(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.slides) || !Array.isArray(input.ads)) throw new Error('Cấu hình banner không hợp lệ');
  if (input.slides.length > 10 || input.ads.length > slots.length) throw new Error('Tối đa 10 phim và 6 vị trí quảng cáo');
  const slides = input.slides.map(item => fields(item));
  const ads = normalizeAds(input).ads;
  if (new Set(slides.map(item => item.slug)).size !== slides.length || new Set(ads.map(item => item.slot)).size !== ads.length) throw new Error('Không được trùng phim/vị trí quảng cáo');
  return { hero_enabled: input.hero_enabled !== false, slides, ads };
}
function revision(settings) {
  return crypto.createHash('sha256').update(JSON.stringify([settings.featured_slugs || [], settings.banner_config || null])).digest('hex');
}
function getConfig(settings = {}) {
  const stored = settings.banner_config || {};
  const pinned = (settings.featured_slugs || []).slice(0, 10);
  const edits = new Map((stored.slides || []).map(item => [item.slug, item]));
  return {
    revision: revision(settings), hero_enabled: stored.hero_enabled !== false,
    slides: pinned.map(item => {
      const movie = typeof item === 'string' ? { slug: item, name: item } : item;
      return { enabled: true, ...edits.get(movie.slug), slug: movie.slug, name: movie.name || movie.slug, poster_url: movie.poster_url || '', thumb_url: movie.thumb_url || '' };
    }),
    ads: getAds(settings).ads
  };
}
function active(item, now = Date.now()) {
  return item.enabled !== false && (!item.start || Date.parse(item.start) <= now) && (!item.end || Date.parse(item.end) > now);
}
function applyHome(data, settings, now = Date.now()) {
  const config = getConfig(settings);
  const movies = new Map((data.spotlights || []).map(movie => [movie.slug, movie]));
  const spotlights = config.hero_enabled ? config.slides.filter(item => active(item, now) && movies.has(item.slug)).map(item => {
    const movie = movies.get(item.slug);
    return { ...movie, banner_title: item.title || movie.name, banner_description: item.description || movie.content,
      thumb_url: item.image_desktop || movie.thumb_url, banner_mobile: item.image_mobile || item.image_desktop || movie.thumb_url,
      banner_position: `${item.focal_x ?? 50}% ${item.focal_y ?? 50}%`, cta_label: item.cta_label || 'Xem ngay' };
  }) : [];
  return { ...data, spotlights, hero_enabled: config.hero_enabled && spotlights.length > 0 };
}
const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function getAds(settings = {}) {
  const stored = settings.advertising?.ads || settings.banner_config?.ads || [];
  const migrated = stored.map(item => ({ ...item, slot: ({ home_middle: 'below_featured', home_footer: 'footer' })[item.slot] || item.slot }));
  return {
    revision: crypto.createHash('sha256').update(JSON.stringify(stored)).digest('hex'),
    ads: slots.map(slot => ({ slot, enabled: false, ...migrated.find(item => item.slot === slot), label: slotLabels[slot] }))
  };
}
function normalizeAds(input) {
  if (!input || !Array.isArray(input.ads) || input.ads.length > slots.length) throw new Error('Cấu hình cần danh sách tối đa 6 vị trí quảng cáo');
  const ads = input.ads.map(item => fields(item, true));
  if (new Set(ads.map(item => item.slot)).size !== ads.length) throw new Error('Không được trùng vị trí quảng cáo');
  return { ads };
}
function renderAd(item, mobile = false) {
  if (!item || !active(item)) return '';
  const slot = ({ home_middle: 'below_featured', home_footer: 'footer' })[item.slot] || item.slot;
  if (mobile && ['side_left', 'side_right'].includes(slot)) return '';
  return `<aside class="ad-placement ad-${slot}" data-ad-slot="${slot}" aria-label="Quảng cáo"><span class="ad-label">Quảng cáo</span><a class="ad-banner" href="${escape(item.href)}"${item.new_tab ? ' target="_blank" rel="sponsored noopener noreferrer"' : ' rel="sponsored"'}><picture>${item.image_mobile ? `<source media="(max-width: 640px)" srcset="${escape(item.image_mobile)}">` : ''}<img src="${escape(item.image_desktop)}" alt="${escape(item.title)}" loading="lazy" decoding="async" style="object-position:${item.focal_x ?? 50}% ${item.focal_y ?? 50}%"></picture><div class="ad-copy"><strong>${escape(item.title)}</strong>${item.description ? `<p>${escape(item.description)}</p>` : ''}<span>${escape(item.cta_label || 'Tìm hiểu thêm')}</span></div></a></aside>`;
}
function decorate(html, settings, mobile = false) {
  const ads = getAds(settings).ads;
  const render = slot => renderAd(ads.find(item => item.slot === slot), mobile);
  if (!html.includes('/css/editorial.css')) html = html.replace('</head>', '<link rel="stylesheet" href="/css/editorial.css?v=1.1.0"></head>');
  html = html.replace('<!-- banner:home_middle -->', '').replace('<!-- banner:home_footer -->', '');
  html = html.replace('<!-- banner:below_featured -->', render('below_featured'))
    .replace('<!-- banner:below_player -->', render('below_player'));
  const header = render('header');
  if (header) {
    html = html.replace(/(<main\b[^>]*>)/, `$1${header}`);
    html = html.replace(/(<body\b[^>]*class=")/, '$1ad-header-active ');
  }
  const footer = render('footer');
  if (html.includes('<footer')) html = html.replace(/(<footer\b)/, `${footer}$1`);
  else html = html.replace('</main>', `${footer}</main>`);
  html = html.replace('</body>', `${render('side_left')}${render('side_right')}</body>`);
  return html;
}
module.exports = { normalize, getConfig, revision, active, applyHome, decorate, renderAd, getAds, normalizeAds };
