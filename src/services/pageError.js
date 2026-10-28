const { escapeHtml } = require('./htmlSafety');
function sendPageError(res, error = {}) {
  const status = error.status === 404 || (!error.status && error.message === 'Movie not found') ? 404 : 503;
  const title = status === 404 ? 'Không tìm thấy nội dung' : 'Nguồn phim tạm thời không khả dụng';
  const description = status === 404 ? 'Phim, tập hoặc đường dẫn này không tồn tại. Bạn có thể tìm phim khác trong Khám phá.' : 'Chưa thể tải dữ liệu từ nguồn phim. Bạn có thể thử tải lại sau; không có tập thay thế nào được phát tự động.';
  res.status(status).set('Cache-Control', 'no-store').set('X-Robots-Tag', 'noindex, follow');
  if (status === 503) res.set('Retry-After', '30');
  return res.type('html').send(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>${escapeHtml(title)} | CineViet</title><link rel="icon" href="/favicon.svg"><style>body{margin:0;background:radial-gradient(ellipse at top,#29202a,#11131c 65%);color:#e4e7ef;font:16px/1.7 Georgia,serif;min-height:100vh;display:grid;place-items:center}main{max-width:620px;padding:32px}a{color:inherit;text-decoration:none}header{font-weight:bold;letter-spacing:.08em}header span{color:#ef2634}small{display:block;color:#ed9298;margin-top:56px}h1{font-size:clamp(30px,5vw,46px);line-height:1.2}p{color:#aeb7c8}nav{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}nav a{padding:10px 18px;border:1px solid #ffffff25;border-radius:7px;min-height:24px}nav a:first-child{background:#d50815;border-color:#d50815}a:focus-visible{outline:2px solid white;outline-offset:4px}</style></head><body><main><header><a href="/">CINE<span>VIET</span></a></header><small>${status}</small><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><nav><a href="/kham-pha">Khám phá phim</a><a href="/">Về trang chủ</a></nav></main></body></html>`);
}
function episodeExists(data, episode, server) {
  const key = value => {
    const text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const match = text.match(/^(?:(?:tap|episode|ep)[\s_-]*)?(\d+)$/);
    return match ? String(Number(match[1])) : text;
  };
  const episodeMatches = (a, b) => Boolean(a && b && key(a) === key(b));
  const all = data.episodes || [];
  if (server != null && (!/^\d+$/.test(String(server)) || !all[Number(server)])) return false;
  if (!episode) return true;
  const selected = server != null ? [all[Number(server)]] : all;
  return selected.some(source => (source.server_data || []).some(item => episodeMatches(item.slug, episode) || episodeMatches(item.name, episode)));
}
module.exports = { sendPageError, episodeExists };
