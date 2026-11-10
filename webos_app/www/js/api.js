(function (global) {
  'use strict';

  var STORAGE_TOKEN = 'cv_webos_token';
  var STORAGE_USER = 'cv_webos_user';
  var STORAGE_HOME = 'cv_webos_home_cache';
  var STORAGE_LOCAL_CW = 'cv_webos_cw_local';

  function ApiClient() {}

  function readJsonStorage(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJsonStorage(key, val) {
    try {
      if (val == null) global.localStorage.removeItem(key);
      else global.localStorage.setItem(key, JSON.stringify(val));
    } catch (_) {}
  }

  ApiClient.getToken = function () {
    try { return global.localStorage.getItem(STORAGE_TOKEN) || ''; } catch (_) { return ''; }
  };

  ApiClient.getUser = function () {
    return readJsonStorage(STORAGE_USER, null);
  };

  ApiClient.isLoggedIn = function () {
    return Boolean(ApiClient.getToken());
  };

  ApiClient.saveSession = function (token, user) {
    try {
      if (token) global.localStorage.setItem(STORAGE_TOKEN, token);
    } catch (_) {}
    if (user) writeJsonStorage(STORAGE_USER, user);
  };

  ApiClient.logout = function () {
    try {
      global.localStorage.removeItem(STORAGE_TOKEN);
      global.localStorage.removeItem(STORAGE_USER);
    } catch (_) {}
  };

  ApiClient.getCachedHome = function () {
    return readJsonStorage(STORAGE_HOME, null);
  };

  ApiClient.setCachedHome = function (data) {
    if (data) writeJsonStorage(STORAGE_HOME, data);
  };

  ApiClient.fullImg = function (url) {
    if (!url || typeof url !== 'string') return '';
    var s = url.trim();
    if (!s) return '';
    if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0) return s;
    if (s.indexOf('/') === 0) return 'https://cineviet.live' + s;
    return 'https://phimimg.com/' + s;
  };

  ApiClient.request = function (path, options) {
    options = options || {};
    var method = options.method || 'GET';
    var headers = { 'Accept': 'application/json' };
    var token = ApiClient.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var bodyStr = null;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      bodyStr = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    }
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, '/api' + path, true);
      xhr.timeout = options.timeout || 14000;
      Object.keys(headers).forEach(function (k) {
        xhr.setRequestHeader(k, headers[k]);
      });
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        var data = null;
        try { data = JSON.parse(xhr.responseText || '{}'); } catch (_) {}
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data || { status: true });
        } else {
          var errMsg = (data && data.message) ? data.message : ('HTTP ' + xhr.status);
          var err = new Error(errMsg);
          err.status = xhr.status;
          err.payload = data;
          reject(err);
        }
      };
      xhr.ontimeout = function () { reject(new Error('Kết nối tới máy chủ quá chậm.')); };
      xhr.onerror = function () { reject(new Error('Lỗi mạng khi kết nối CineViet.')); };
      xhr.send(bodyStr);
    });
  };

  ApiClient.getHome = function () {
    return ApiClient.request('/home').then(function (res) {
      var data = res && res.data ? res.data : res;
      if (data) ApiClient.setCachedHome(data);
      return data;
    });
  };

  ApiClient.getCatalog = function (type, page, limit) {
    var q = '?type=' + encodeURIComponent(type || 'phim-moi-cap-nhat') + '&page=' + (page || 1) + '&limit=' + (limit || 40);
    return ApiClient.request('/catalog' + q).then(function (res) {
      var d = res && res.data ? res.data : {};
      if (Array.isArray(d)) return d;
      return d.items || d.movies || [];
    });
  };

  ApiClient.searchMovies = function (query) {
    return ApiClient.request('/search?q=' + encodeURIComponent(query || '')).then(function (res) {
      return Array.isArray(res && res.data) ? res.data : [];
    });
  };

  ApiClient.getMovieDetail = function (slug) {
    return ApiClient.request('/movies/' + encodeURIComponent(slug)).then(function (res) {
      return res && res.data ? res.data : {};
    });
  };

  ApiClient.trackView = function (slug) {
    return ApiClient.request('/movies/' + encodeURIComponent(slug) + '/view', { method: 'POST', body: {} }).catch(function () {});
  };

  ApiClient.createTvSession = function () {
    return ApiClient.request('/auth/tv/session', { method: 'POST', body: {} }).then(function (res) {
      return res && res.data ? res.data : {};
    });
  };

  ApiClient.getTvStatus = function (token) {
    return ApiClient.request('/auth/tv/status?token=' + encodeURIComponent(token));
  };

  ApiClient.getUserLibrary = function () {
    if (!ApiClient.isLoggedIn()) {
      return Promise.resolve({ history: ApiClient.getLocalHistory(), watchlist: [] });
    }
    return ApiClient.request('/user/library').then(function (res) {
      return (res && res.data) ? res.data : { history: [], watchlist: [] };
    });
  };

  ApiClient.getLocalHistory = function () {
    var map = readJsonStorage(STORAGE_LOCAL_CW, {});
    return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
      return String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
    });
  };

  ApiClient.saveHistory = function (payload) {
    if (!payload || !payload.movie_slug) return Promise.resolve();
    var map = readJsonStorage(STORAGE_LOCAL_CW, {});
    payload.updated_at = new Date().toISOString();
    map[payload.movie_slug] = payload;
    writeJsonStorage(STORAGE_LOCAL_CW, map);
    if (!ApiClient.isLoggedIn()) return Promise.resolve();
    return ApiClient.request('/user/history', { method: 'POST', body: payload }).catch(function () {});
  };

  ApiClient.removeHistory = function (slug) {
    var map = readJsonStorage(STORAGE_LOCAL_CW, {});
    delete map[slug];
    writeJsonStorage(STORAGE_LOCAL_CW, map);
    if (!ApiClient.isLoggedIn()) return Promise.resolve();
    return ApiClient.request('/user/history/remove', { method: 'POST', body: { movie_slug: slug } }).catch(function () {});
  };

  ApiClient.toggleWatchlist = function (moviePayload) {
    if (!ApiClient.isLoggedIn()) return Promise.reject(new Error('Vui lòng đăng nhập QR để lưu yêu thích.'));
    return ApiClient.request('/user/watchlist/toggle', { method: 'POST', body: moviePayload });
  };

  global.TvApi = ApiClient;
})(window);
