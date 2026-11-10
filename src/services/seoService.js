const SUPPORT_EMAIL = 'admin@cineviet.live';

const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const clean = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const pages = {
  '/': [
    'CineViet - Xem Phim Online Full HD Vietsub, Thuyết Minh & Song Ngữ',
    'Xem phim bộ, phim lẻ, chiếu rạp, anime Full HD Vietsub, Thuyết minh và Song Ngữ miễn phí trên CineViet. Lưu yêu thích, xem tiếp đa thiết bị.'
  ],
  '/kham-pha': [
    'Khám phá kho phim Full HD Vietsub & Song Ngữ | CineViet',
    'Tìm phim theo tên tiếng Việt, tên gốc, thể loại, quốc gia và năm phát hành trên CineViet.'
  ],
  '/tai-ung-dung': [
    'Tải App CineViet — Android, iOS, Smart TV & Desktop | CineViet',
    'Tải ứng dụng CineViet chính thức cho Android (APK), iPhone/iPad (IPA), Android TV và Máy tính (Windows, macOS, Linux).'
  ],
  '/ung-ho': [
    'Ủng hộ CineViet — Tiếp sức duy trì máy chủ | CineViet',
    'Chung tay tiếp sức giúp CineViet duy trì máy chủ và băng thông phát phim miễn phí tốc độ cao.'
  ],
  '/dien-vien': [
    'Diễn viên & Đạo diễn | CineViet',
    'Tra cứu thông tin, tiểu sử và danh sách phim nổi bật của diễn viên, đạo diễn trên CineViet.'
  ],
  '/gioi-thieu': ['Giới thiệu CineViet | CineViet', 'Tìm hiểu các tính năng khám phá phim, thư viện cá nhân và trải nghiệm xem trên CineViet.'],
  '/tro-giup': ['Trung tâm trợ giúp | CineViet', 'Hướng dẫn tìm phim, chọn tập, quản lý thư viện và xử lý sự cố phát.'],
  '/lien-he': ['Liên hệ & báo lỗi | CineViet', `Liên hệ CineViet qua ${SUPPORT_EMAIL} để gửi góp ý, báo lỗi hoặc yêu cầu xem xét nội dung.`],
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
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.origin : '';
  } catch (_) {
    return '';
  }
}

function formatPersonSlug(raw) {
  try {
    return clean(decodeURIComponent(raw).replace(/-/g, ' '))
      .replace(/\b\w/g, c => c.toUpperCase());
  } catch (_) {
    return clean(String(raw || '').replace(/-/g, ' '));
  }
}

function metadata(req, movie, origin) {
  const pathname = canonicalPath(req.path);
  const definition = pages[pathname];
  const detail = /^\/phim\/[^/]+$/.test(pathname);
  const watch = pathname.startsWith('/xem-phim/');
  const personMatch = pathname.match(/^\/(?:dien-vien|dao-dien|nghe-si)\/([^/]+)$/);
  const privatePage = /^\/(?:auth|dang-nhap|dang-ky|admin|quan-tri|operations|tai-khoan|danh-sach|tu-phim|tv(?:\/|$)|tv-auth)/.test(pathname);
  const query = req.query || {};
  const index = Boolean(definition || detail) && !privatePage && !watch && !['keyword', 'q', 'page', 'sort', 'category', 'country', 'year', 'format', 'type'].some(key => query[key]);

  let [title, description] = definition || ['CineViet', 'Khám phá phim và trải nghiệm xem trên CineViet.'];
  let canonical = definition || detail ? pathname : null;

  if (personMatch && !definition) {
    const personName = formatPersonSlug(personMatch[1]);
    if (personName) {
      title = `${personName} — Tiểu sử & Phim tham gia | CineViet`;
      description = `Thông tin tiểu sử và danh sách các bộ phim có sự tham gia của ${personName} trên CineViet.`;
    }
    canonical = `/dien-vien/${encodeURIComponent(personMatch[1])}`;
  }

  if (movie && (detail || watch)) {
    const movieName = clean(movie.name);
    const originName = clean(movie.origin_name || '');
    const yearSuffix = movie.year ? ` (${clean(movie.year)})` : '';
    title = `${movieName}${originName && originName.toLowerCase() !== movieName.toLowerCase() ? ` - ${originName}` : ''}${yearSuffix} | CineViet`;
    description = clean(movie.content).slice(0, 180) || `Xem phim ${movieName}${yearSuffix} Full HD Vietsub, Thuyết minh và Song Ngữ trên CineViet.`;
    canonical = `/phim/${encodeURIComponent(movie.slug)}`;
    if (watch) title = `Đang xem: ${movieName}${yearSuffix} | CineViet`;
  }

  const movieImage = [movie?.thumb_url, movie?.poster_url].find(url => typeof url === 'string' && /^https?:\/\//i.test(url));
  const fallbackImage = origin
    ? `${origin}${pathname === '/tai-ung-dung' ? '/images/banners/app_showcase_banner.png' : '/images/banners/cineviet_devices_commercial.png'}`
    : null;
  const image = movieImage || (index ? fallbackImage : null);

  return {
    title,
    description,
    canonical: origin && canonical ? origin + canonical : null,
    image,
    index,
    detail,
    movie,
    pathname,
    origin
  };
}

function buildJsonLd(meta) {
  if (meta.detail && meta.movie) {
    const m = meta.movie;
    const data = {
      '@context': 'https://schema.org',
      '@type': /series|tv|phim-bo/.test(m.type || '') ? 'TVSeries' : 'Movie',
      name: clean(m.name),
      description: meta.description,
      inLanguage: 'vi'
    };
    if (m.origin_name) data.alternateName = clean(m.origin_name);
    if (meta.canonical) data.url = meta.canonical;
    if (meta.image) data.image = meta.image;
    if (m.year) data.datePublished = String(clean(m.year));
    if (Array.isArray(m.category) && m.category.length) {
      data.genre = m.category.map(c => clean(c?.name || c)).filter(Boolean);
    }
    if (Array.isArray(m.country) && m.country.length) {
      data.countryOfOrigin = m.country.map(c => ({ '@type': 'Country', name: clean(c?.name || c) })).filter(c => c.name);
    }
    const actors = (m.tmdb_cast || m.actor || []).slice(0, 8).map(a => clean(a?.name || a)).filter(Boolean);
    if (actors.length) data.actor = actors.map(name => ({ '@type': 'Person', name }));
    const directors = (m.tmdb_directors || m.director || []).slice(0, 3).map(d => clean(d?.name || d)).filter(Boolean);
    if (directors.length) data.director = directors.map(name => ({ '@type': 'Person', name }));
    return data;
  }

  if (meta.pathname === '/' && meta.origin) {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          name: 'CineViet',
          url: `${meta.origin}/`,
          description: meta.description,
          inLanguage: 'vi',
          potentialAction: {
            '@type': 'SearchAction',
            target: `${meta.origin}/kham-pha?keyword={search_term_string}`,
            'query-input': 'required name=search_term_string'
          }
        },
        {
          '@type': 'Organization',
          name: 'CineViet',
          url: `${meta.origin}/`,
          logo: `${meta.origin}/favicon.svg`,
          email: SUPPORT_EMAIL,
          sameAs: ['https://t.me/cinevietlivee']
        }
      ]
    };
  }

  if (meta.pathname === '/tai-ung-dung' && meta.origin) {
    return {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'CineViet App',
      operatingSystem: 'Android, iOS, Android TV, Windows, macOS, Linux',
      applicationCategory: 'EntertainmentApplication',
      url: meta.canonical || `${meta.origin}/tai-ung-dung`,
      description: meta.description,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'VND'
      },
      publisher: {
        '@type': 'Organization',
        name: 'CineViet',
        email: SUPPORT_EMAIL
      }
    };
  }

  if (meta.index && meta.canonical) {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: meta.title,
      url: meta.canonical,
      description: meta.description,
      inLanguage: 'vi',
      publisher: {
        '@type': 'Organization',
        name: 'CineViet',
        email: SUPPORT_EMAIL
      }
    };
  }

  return null;
}

function decorate(html, meta) {
  html = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\b[^>]*(?:name=["'](?:description|robots|twitter:[^"']*)["']|property=["']og:[^"']*["'])[^>]*>/gi, '')
    .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');

  const tags = [
    `<title>${escape(meta.title)}</title>`,
    `<meta name="description" content="${escape(meta.description)}">`,
    `<meta name="robots" content="${meta.index ? 'index,follow' : 'noindex,follow'}">`,
    '<meta property="og:locale" content="vi_VN">',
    `<meta property="og:title" content="${escape(meta.title)}">`,
    `<meta property="og:description" content="${escape(meta.description)}">`,
    `<meta property="og:type" content="${meta.detail ? 'video.movie' : 'website'}">`,
    '<meta property="og:site_name" content="CineViet">',
    `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escape(meta.title)}">`,
    `<meta name="twitter:description" content="${escape(meta.description)}">`
  ];
  if (meta.canonical) {
    tags.push(`<link rel="canonical" href="${escape(meta.canonical)}">`, `<meta property="og:url" content="${escape(meta.canonical)}">`);
  }
  if (meta.image) {
    tags.push(
      `<meta property="og:image" content="${escape(meta.image)}">`,
      `<meta property="og:image:alt" content="${escape(meta.title)}">`,
      `<meta name="twitter:image" content="${escape(meta.image)}">`
    );
  }
  const structuredData = buildJsonLd(meta);
  if (structuredData) {
    tags.push(`<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>`);
  }
  return html.replace(/<\/head>/i, tags.join('\n') + '\n</head>');
}

function middleware(origin) {
  origin = originOf(origin);
  return (req, res, next) => {
    res.vary('User-Agent');
    res.vary('Cookie');
    const send = res.send;
    res.send = function (body) {
      if (typeof body === 'string' && /<head[\s>]/i.test(body) && this.statusCode < 400 && !req.path.startsWith('/api/')) {
        const meta = metadata(req, res.locals.seoMovie, origin);
        this.set('X-Robots-Tag', meta.index ? 'index, follow' : 'noindex, follow');
        body = decorate(body, meta);
      }
      return send.call(this, body);
    };
    if (/\.html$/.test(req.path) || /^\/(?:auth|admin|quan-tri|operations|tai-khoan|danh-sach|tu-phim|tv)(?:[/.]|$)/.test(canonicalPath(req.path))) {
      res.set('X-Robots-Tag', 'noindex, follow');
    }
    next();
  };
}

function sitemap(origin, slugs = []) {
  origin = originOf(origin);
  if (!origin) return null;
  const staticEntries = Object.keys(pages).map(path => ({
    path,
    changefreq: path === '/' || path === '/kham-pha' ? 'daily' : 'monthly',
    priority: path === '/' ? '1.0' : ['/kham-pha', '/tai-ung-dung'].includes(path) ? '0.9' : '0.5'
  }));
  const cleanSlugs = [...new Set(slugs.filter(slug => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)))].slice(0, 1000);
  const movieEntries = cleanSlugs.map(slug => ({
    path: `/phim/${slug}`,
    changefreq: 'daily',
    priority: '0.7'
  }));
  const seen = new Set();
  const entries = [...staticEntries, ...movieEntries].filter(entry => {
    if (seen.has(entry.path)) return false;
    seen.add(entry.path);
    return true;
  });
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    entries.map(e => `<url><loc>${escape(origin + e.path)}</loc><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority></url>`).join('') +
    '</urlset>';
}

module.exports = { middleware, metadata, decorate, canonicalPath, sitemap, originOf, pages, SUPPORT_EMAIL };
