(function (root) {
  root.renderAdminSources = function (sources, doc = document) {
    const number = value => value != null && Number.isFinite(Number(value)) ? Number(value).toLocaleString('vi-VN') : 'Chưa xác minh';
    const put = (id, text) => { const el = doc.getElementById(id); if (el) el.textContent = text; };
    put('sources-total-web', number(sources.total_web_movies));
    put('sources-total-all-sub', `Tổng 3 nguồn: ${number(sources.total_all_sources)} bản ghi`);
    for (const key of ['kkphim', 'vicdn', 'nguonc']) {
      const source = sources[key] || {};
      put(`sources-stat-${key}`, number(source.total_movies));
      put(`sources-stat-${key}-sub`, `${number(source.total_pages)} trang (${source.endpoint || key})`);
      put(`source-${key}-${key === 'kkphim' ? 'count' : 'total'}`, `${number(source.total_movies)} phim`);
      put(`source-${key}-pages`, `${number(source.total_pages)} trang`);
      if (key !== 'kkphim') put(`source-${key}-count`, `${number(source.indexed_movies ?? 0)} phim`);
    }
    put('source-kkphim-status', sources.kkphim?.status === 'online' ? 'Đã xác minh từ KKPhim' : sources.kkphim?.total_movies != null ? 'Dữ liệu lần kiểm tra trước' : 'Chưa lấy được dữ liệu');
  };
})(typeof window === 'undefined' ? globalThis : window);
