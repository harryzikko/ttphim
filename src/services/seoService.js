const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const clean = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const pages = {
  '/': ['CineViet - Khám phá và xem phim', 'Khám phá phim, chọn nguồn phát, lưu yêu thích và xem tiếp trên CineViet.'],
  '/kham-pha': ['Khám phá phim | CineViet', 'Tìm phim theo tên tiếng Việt, tên gốc, thể loại, quốc gia và năm phát hành.'],
  '/gioi-thieu': ['Giới thiệu CineViet | CineViet', 'Tìm hiểu các tính năng khám phá phim, thư viện cá nhân và trải nghiệm xem trên CineViet.'],
  '/tro-giup': ['Trung tâm trợ giúp | CineViet', 'Hướng dẫn tìm phim, chọn tập, quản lý thư viện và xử lý sự cố phát.'],
  '/lien-he': ['Liên hệ & báo lỗi | CineViet', 'Liên hệ CineViet để gửi góp ý, báo lỗi hoặc yêu cầu xem xét nội dung.'],
  '/dieu-khoan': ['Điều khoản sử dụng | CineViet', 'Nguyên tắc sử dụng tài khoản, nội dung cộng đồng và giới hạn của dịch vụ CineViet.'],
  '/quyen-rieng-tu': ['Chính sách quyền riêng tư | CineViet', 'Tìm hiểu dữ liệu tài khoản, lịch sử xem, lưu trữ trình duyệt và nguồn bên thứ ba.'],
  '/ban-quyen': ['Bản quyền & yêu cầu nội dung | CineViet', 'Hướng dẫn gửi yêu cầu xem xét nội dung cho chủ thể quyền hoặc người được ủy quyền.']
};
function canonicalPath(pathname) {
  let path = pathname.replace(/\/$/, '') || '/';
  if (path === '/mobile' || path === '/index.html' || path === '/mobile/index.html') return '/';
  path = path.replace(/^\/mobile(?=\/)/, '').replace(/\.html$/, '');
  return path;
}
function originOf(value) {
  if (!value) return '';
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.origin : ''; } catch (_) { return ''; }
}
function metadata(req, movie, origin) {
  const pathname = canonicalPath(req.path), definition = pages[pathname];
  const detail = /^\/phim\/[^/]+$/.test(pathname), watch = pathname.startsWith('/xem-phim/');
  const privatePage = /^\/(?:auth|dang-nhap|dang-ky|admin|quan-tri|operations|tai-khoan|danh-sach|tu-phim|tv(?:\/|$)|tv-auth)/.test(pathname);
  const query = req.query || {};
  const index = Boolean(definition || detail) && !privatePage && !watch && !['keyword', 'q', 'page', 'sort', 'category', 'country', 'year', 'format', 'type'].some(key => query[key]);
  let [title, description] = definition || ['CineViet', 'Khám phá phim và trải nghiệm xem trên CineViet.'];
  let canonical = definition || detail ? pathname : null;
  if (movie && (detail || watch)) {
    title = `${clean(movie.name)}${movie.year ? ` (${clean(movie.year)})` : ''} | CineViet`;
    description = clean(movie.content).slice(0, 180) || `Thông tin, nguồn phát và các tập của ${clean(movie.name)} trên CineViet.`;
    canonical = `/phim/${encodeURIComponent(movie.slug)}`;
    if (watch) title = `Đang xem: ${clean(movie.name)} | CineViet`;
  }
  const image = [movie?.thumb_url, movie?.poster_url].find(url => typeof url === 'string' && /^https?:\/\//i.test(url));
  return { title, description, canonical: origin && canonical ? origin + canonical : null, image, index, detail, movie };
}
function decorate(html, meta) {
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '').replace(/<meta\b[^>]*(?:name=["'](?:description|robots)["']|property=["']og:[^"']*["'])[^>]*>/gi, '').replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '');
  const tags = [`<title>${escape(meta.title)}</title>`, `<meta name="description" content="${escape(meta.description)}">`, `<meta name="robots" content="${meta.index ? 'index,follow' : 'noindex,follow'}">`, `<meta property="og:title" content="${escape(meta.title)}">`, `<meta property="og:description" content="${escape(meta.description)}">`, `<meta property="og:type" content="${meta.detail ? 'video.movie' : 'website'}">`, '<meta property="og:site_name" content="CineViet">'];
  if (meta.canonical) tags.push(`<link rel="canonical" href="${escape(meta.canonical)}">`, `<meta property="og:url" content="${escape(meta.canonical)}">`);
  if (meta.image) tags.push(`<meta property="og:image" content="${escape(meta.image)}">`);
  if (meta.detail && meta.movie) {
    const data = { '@context': 'https://schema.org', '@type': /series|tv|phim-bo/.test(meta.movie.type || '') ? 'TVSeries' : 'Movie', name: clean(meta.movie.name), description: meta.description };
    if (meta.canonical) data.url = meta.canonical;
    if (meta.image) data.image = meta.image;
    tags.push(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);
  }
  return html.replace(/<\/head>/i, tags.join('\n') + '\n</head>');
}
function middleware(origin) {
  origin = originOf(origin);
  return (req, res, next) => {
    res.vary('User-Agent'); res.vary('Cookie');
    const send = res.send;
    res.send = function (body) {
      if (typeof body === 'string' && /<head[\s>]/i.test(body) && this.statusCode < 400 && !req.path.startsWith('/api/')) {
        const meta = metadata(req, res.locals.seoMovie, origin);
        this.set('X-Robots-Tag', meta.index ? 'index, follow' : 'noindex, follow');
        body = decorate(body, meta);
      }
      return send.call(this, body);
    };
    if (/\.html$/.test(req.path) || /^\/(?:auth|admin|quan-tri|operations|tai-khoan|danh-sach|tv)(?:[/.]|$)/.test(canonicalPath(req.path))) res.set('X-Robots-Tag', 'noindex, follow');
    next();
  };
}
function sitemap(origin, slugs = []) {
  origin = originOf(origin);
  if (!origin) return null;
  const paths = [...Object.keys(pages), ...slugs.filter(slug => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)).slice(0, 1000).map(slug => `/phim/${slug}`)];
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + [...new Set(paths)].map(path => `<url><loc>${escape(origin + path)}</loc></url>`).join('') + '</urlset>';
}
module.exports = { middleware, metadata, decorate, canonicalPath, sitemap, originOf, pages };
