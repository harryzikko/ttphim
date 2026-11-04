const { escapeHtml } = require('./htmlSafety');

function sendPageError(res, error = {}) {
  const status = error.status === 404 || (!error.status && error.message === 'Movie not found') ? 404 : 503;
  const is404 = status === 404;
  const title = error.title || (is404 ? 'Không tìm thấy nội dung' : 'Nguồn phim tạm thời không khả dụng');
  const description = error.description || (is404
    ? 'Phim, tập hoặc đường dẫn này không tồn tại hoặc đã được gỡ bỏ. Bạn có thể tìm kiếm phim khác hoặc quay lại Khám phá.'
    : 'Chưa thể tải dữ liệu từ nguồn phim lúc này. Vui lòng thử tải lại sau; không có tập thay thế nào được phát tự động.');

  res.status(status).set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex, follow');
  if (status === 503) res.set('Retry-After', '30');

  const html = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, follow">
  <meta name="theme-color" content="#090b12">
  <title>${escapeHtml(title)} | CineViet</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #090b12;
      background-image: 
        radial-gradient(circle at 50% 0%, rgba(229, 9, 20, 0.22), transparent 45%),
        radial-gradient(circle at 100% 100%, rgba(30, 41, 59, 0.4), transparent 50%),
        radial-gradient(circle at 0% 100%, rgba(17, 24, 39, 0.6), transparent 50%);
      color: #e4e7ef;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .error-card {
      width: 100%;
      max-width: 580px;
      background: rgba(17, 20, 29, 0.85);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      padding: clamp(28px, 6vw, 44px);
      text-align: center;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7), 0 0 40px rgba(229, 9, 20, 0.08);
      position: relative;
      overflow: hidden;
    }
    .error-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 20%;
      right: 20%;
      height: 2px;
      background: linear-gradient(90deg, transparent, #e50914, transparent);
    }
    .brand {
      display: inline-block;
      font-size: 22px;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: #ffffff;
      text-decoration: none;
      margin-bottom: 24px;
    }
    .brand span { color: #e50914; }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 14px;
      border-radius: 9999px;
      background: rgba(229, 9, 20, 0.15);
      border: 1px solid rgba(229, 9, 20, 0.35);
      color: #ff4d5a;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 18px;
    }
    .error-code {
      font-size: clamp(72px, 14vw, 110px);
      font-weight: 900;
      line-height: 1;
      letter-spacing: -0.04em;
      background: linear-gradient(135deg, #ffffff 0%, #a3a6ae 50%, #4b5563 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 12px;
      user-select: none;
    }
    h1 {
      font-size: clamp(20px, 4vw, 26px);
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.02em;
      margin-bottom: 12px;
      line-height: 1.3;
    }
    p {
      font-size: clamp(14px, 2.5vw, 15px);
      color: #94a3b8;
      max-width: 480px;
      margin: 0 auto 28px;
      line-height: 1.6;
    }
    .search-box {
      margin-bottom: 24px;
    }
    .search-form {
      display: flex;
      align-items: center;
      background: rgba(30, 35, 48, 0.65);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 4px 6px 4px 14px;
      transition: all 0.2s ease;
    }
    .search-form:focus-within {
      border-color: rgba(229, 9, 20, 0.7);
      box-shadow: 0 0 0 3px rgba(229, 9, 20, 0.2);
      background: rgba(30, 35, 48, 0.95);
    }
    .search-input {
      flex: 1;
      background: transparent;
      border: none;
      color: #ffffff;
      font-family: inherit;
      font-size: 14px;
      padding: 10px 4px;
      outline: none;
    }
    .search-input::placeholder { color: #64748b; }
    .search-button {
      background: #e50914;
      border: none;
      color: #ffffff;
      border-radius: 8px;
      padding: 8px 16px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s ease;
    }
    .search-button:hover { background: #b80914; transform: translateY(-1px); }
    .nav-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 11px 22px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s ease;
      cursor: pointer;
      min-width: 140px;
    }
    .btn-primary {
      background: #e50914;
      color: #ffffff;
      border: 1px solid #e50914;
      box-shadow: 0 4px 16px rgba(229, 9, 20, 0.35);
    }
    .btn-primary:hover {
      background: #b80914;
      border-color: #b80914;
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(229, 9, 20, 0.5);
    }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
      transform: translateY(-2px);
    }
    .material-symbols-outlined { font-size: 18px; vertical-align: middle; }
    footer {
      margin-top: 24px;
      color: #64748b;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="error-card">
    <a href="/" class="brand">CINE<span>VIET</span></a>
    <div>
      <span class="status-badge">
        <span class="material-symbols-outlined">error</span>
        Mã phản hồi ${status}
      </span>
    </div>
    <div class="error-code">${status}</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(description)}</p>

    <div class="search-box">
      <form class="search-form" action="/tim-kiem" method="GET">
        <input class="search-input" name="q" type="text" placeholder="Tìm tên phim, diễn viên hoặc thể loại..." autocomplete="off">
        <button type="submit" class="search-button">
          <span class="material-symbols-outlined">search</span>
          <span>Tìm kiếm</span>
        </button>
      </form>
    </div>

    <div class="nav-actions">
      <a href="/kham-pha" class="btn btn-primary">
        <span class="material-symbols-outlined">movie</span>
        <span>Khám phá phim</span>
      </a>
      <a href="/" class="btn btn-secondary">
        <span class="material-symbols-outlined">home</span>
        <span>Về trang chủ</span>
      </a>
    </div>
  </div>
  <footer>CineViet &copy; 2026 &bull; Nền tảng xem phim trực tuyến</footer>
</body>
</html>`;

  return res.type('html').send(html);
}

function episodeExists(data, episode, server) {
  const key = value => {
    const text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const match = text.match(/^(?:(?:tap|episode|ep)[\s_-]*)?(\d+)$/);
    return match ? String(Number(match[1])) : text;
  };
  const episodeMatches = (a, b) => Boolean(a && b && key(a) === key(b));
  const all = data.episodes || [];
  let srvIdx = null;
  if (server != null && server !== '') {
    if (/^\d+$/.test(String(server))) {
      srvIdx = Number(server);
    } else if (/^song[-_]?ngu$/i.test(String(server))) {
      srvIdx = all.findIndex(s => s.is_song_ngu || s.server_type === 'song_ngu' || /song ngu/i.test(s.server_name));
    } else {
      return false;
    }
    if (srvIdx < 0 || !all[srvIdx]) return false;
  }
  if (!episode) return true;
  const selected = srvIdx != null ? [all[srvIdx]] : all;
  return selected.some(source => (source.server_data || []).some(item => episodeMatches(item.slug, episode) || episodeMatches(item.name, episode)));
}

module.exports = { sendPageError, episodeExists };
