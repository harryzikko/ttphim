// TTPhim - Client API SDK
let confirmedAccountId = null;
let accountIdentityChanged = false;
const isPrivateAccountPage = () => /^\/(?:mobile\/)?(?:tai-khoan|danh-sach)(?:\.html)?\/?$/i.test(window.location?.pathname || '') || /^\/(?:tu-phim|danh-sach-cua-toi)\/?$/i.test(window.location?.pathname || '');
function invalidateAccountPage() {
  if (!isPrivateAccountPage() || accountIdentityChanged) return;
  accountIdentityChanged = true;
  const main = document.querySelector('main');
  if (main) { main.inert = true; main.hidden = true; main.style.display = 'none'; main.querySelectorAll('input,textarea').forEach(input => { input.value = ''; }); }
  document.querySelectorAll('dialog').forEach(dialog => { dialog.close?.(); dialog.remove(); });
  window.location.reload?.();
}
function cacheUserProfile(user) {
  // Authentication stays in the server's HttpOnly cookie, never browser storage.
  if (confirmedAccountId && user.id && confirmedAccountId !== user.id) invalidateAccountPage();
  if (user.id) confirmedAccountId = user.id;
  const profile = {};
  for (const key of ['id', 'name', 'email', 'gender', 'avatar', 'role', 'created_at', 'is_vip', 'vip_tier', 'vip_level', 'vip_expire_date', 'days_left', 'max_devices', 'email_verified', 'email_verified_at', 'mfa_enabled']) {
    if (user[key] !== undefined) profile[key] = user[key];
  }
  try { localStorage.setItem('kk_user', JSON.stringify(profile)); } catch (_) { /* Display caching must not turn a committed save into a failure. */ }
}
const API = {
  getBaseUrl() {
    if (window.TTPhim_API_BASE) return window.TTPhim_API_BASE;
    try {
      const stored = localStorage.getItem('TTPhim_api_base');
      if (stored) return stored.replace(/\/$/, '');
    } catch(e) {}
    return '';
  },

  async request(endpoint, options = {}) {
    const base = this.getBaseUrl();
    const finalUrl = (endpoint.startsWith('http') || !base) ? endpoint : (base + endpoint);
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(String(options.method || 'GET').toUpperCase());
    if (mutation && accountIdentityChanged) return { status: false, httpStatus: 409, code: 'ACCOUNT_CHANGED', message: 'Tài khoản đã thay đổi. Vui lòng tải lại trang.' };
    const accountId = confirmedAccountId;
    const res = await fetch(finalUrl, {
      credentials: 'include',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(mutation && accountId ? { 'X-Account-ID': accountId } : {}),
        ...options.headers
      }
    });
    const data = await res.json();
    if (data && typeof data === 'object' && Number.isInteger(res.status) && res.status >= 400) data.httpStatus = res.status;
    if (data?.code === 'ACCOUNT_CHANGED') invalidateAccountPage();
    if (res.status === 401) localStorage.removeItem('kk_user');
    if (res.status === 429 && data && typeof data === 'object') {
      data.httpStatus = 429;
      const retryAfter = Number(res.headers?.get?.('Retry-After') || data.retryAfter);
      if (Number.isFinite(retryAfter) && retryAfter > 0) data.retryAfter = Math.ceil(retryAfter);
    }
    return data;
  },

  // Home
  async getHome() {
    const embedded = document.getElementById('home-data');
    if (embedded) {
      try { return JSON.parse(embedded.textContent); } catch (_) {}
    }
    const res = await this.request('/api/home');
    return res.data;
  },

  // Movie Details
  async getMovieDetail(slug) {
    const res = await this.request(`/api/movies/${slug}`);
    if (!res.status) throw new Error(res.message || 'Movie not found');
    return res.data;
  },

  async getMovieSeasons(slug) {
    try {
      const res = await this.request(`/api/movies/${encodeURIComponent(slug)}/seasons`);
      return res.status ? (res.data || []) : [];
    } catch (_) {
      return [];
    }
  },

  // Catalog / Explore
  async getCatalog(params = {}) {
    const query = new URLSearchParams(params).toString();
    const res = await this.request(`/api/catalog?${query}`);
    return res.data;
  },

  // Quick Search
  async quickSearch(q) {
    if (!q || !q.trim()) return [];
    const res = await this.request(`/api/search?q=${encodeURIComponent(q.trim())}`);
    return res.data || [];
  },

  // Categories & Countries
  async getCategories() {
    const res = await this.request('/api/categories');
    return res.data || { categories: [], countries: [] };
  },

  // Comments
  async getComments(slug) {
    const res = await this.request(`/api/comments/${slug}`);
    return res.data || [];
  },

  async postComment(slug, commentData, timeTag) {
    let body = {};
    if (typeof commentData === 'string') {
      body = { content: commentData, timestamp_tag: timeTag };
    } else {
      body = commentData || {};
    }
    const res = await this.request(`/api/comments/${slug}`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    return res;
  },

  async postReply(commentId, content, userName) {
    const res = await this.request(`/api/comments/${commentId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content, user_name: userName })
    });
    return res;
  },

  async likeComment(id, action = 'like') {
    const res = await this.request(`/api/comments/${id}/like`, {
      method: 'POST',
      body: JSON.stringify({ action })
    });
    if (!res.status || !Number.isFinite(res.data?.likes)) throw Object.assign(new Error(res.message || 'Không thể thích bình luận. Vui lòng thử lại.'), { httpStatus: res.httpStatus });
    return res.data?.likes;
  },

  // Auth
  async login(email, password) {
    const res = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (res.status && res.data?.user) {
      cacheUserProfile(res.data.user);
    }
    return res;
  },

  async register(email, password, name, gender) {
    const res = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, ...(gender != null && { gender }) })
    });
    if (res.status && res.data?.user) {
      cacheUserProfile(res.data.user);
    }
    return res;
  },
  async identityRequest(path, body, method = 'POST') {
    return this.request(`/api/auth/${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  },
  async forgotPassword(email) { return this.identityRequest('forgot-password', { email }); },
  async resetPassword(token, password) {
    const res = await this.identityRequest('reset-password', { token, password });
    if (res.status) localStorage.removeItem('kk_user');
    return res;
  },
  async verifyEmail(token) { return this.identityRequest('verify-email', { token }); },
  async requestVerification() { return this.identityRequest('verification/request', {}); },
  async getSessions() { return this.identityRequest('sessions', undefined, 'GET'); },
  async revokeSession(id) { return this.identityRequest(`sessions/${encodeURIComponent(id)}`, undefined, 'DELETE'); },
  async revokeOtherSessions() { return this.identityRequest('sessions/revoke-others', {}); },
  async setupMfa(password) { return this.identityRequest('mfa/setup', { password }); },
  async confirmMfa(code) {
    const res = await this.identityRequest('mfa/confirm', { code });
    if (res.status && res.data?.user) cacheUserProfile(res.data.user);
    return res;
  },
  async disableMfa(password, code) {
    const res = await this.identityRequest('mfa/disable', { password, code });
    if (res.status && res.data?.user) cacheUserProfile(res.data.user);
    return res;
  },
  async completeMfaLogin(challengeId, code) {
    const res = await this.identityRequest('login', { challengeId, code });
    if (res.status && res.data?.user) cacheUserProfile(res.data.user);
    return res;
  },

  async getMe() {
    const res = await this.request('/api/auth/me');
    if (res.status && res.data) {
      cacheUserProfile(res.data);
      return res.data;
    }
    if (res.httpStatus && res.httpStatus !== 401) throw new Error(res.message || 'Không thể xác minh phiên đăng nhập lúc này');
    localStorage.removeItem('kk_user');
    return null;
  },

  async logout() {
    const res = await this.request('/api/auth/logout', { method: 'POST' });
    if (!res?.status) throw Object.assign(new Error(res?.message || 'Chưa thể đăng xuất. Vui lòng thử lại.'), { httpStatus: res?.httpStatus });
    localStorage.removeItem('kk_user');
    window.dispatchEvent?.(new Event('ttphim:auth-changed'));
    return res;
  },

  // Library & Watchlist
  async getLibrary() {
    const res = await this.request('/api/user/library');
    if (!res.status) throw Object.assign(new Error(res.message || 'Không thể tải thư viện'), { httpStatus: res.httpStatus });
    return res.data || { watchlist: [], history: [], continueWatching: [] };
  },

  async toggleWatchlist(movieData) {
    const res = await this.request('/api/user/watchlist/toggle', {
      method: 'POST',
      body: JSON.stringify(movieData)
    });
    return res;
  },

  async removeFromWatchlist(slug) {
    const res = await this.request('/api/user/watchlist/remove', {
      method: 'POST',
      body: JSON.stringify({ movie_slug: slug })
    });
    return res;
  },

  async saveHistory(historyData) {
    return this.request('/api/user/history', {
      method: 'POST',
      body: JSON.stringify(historyData)
    });
  },

  clearLocalProgress(userId, slug = null) {
    if (typeof userId !== 'string' || !userId || userId === 'guest') return;
    try {
      const key = `TTPhim_progress_${userId}`;
      if (slug === null) localStorage.removeItem(key);
      else { const records = JSON.parse(localStorage.getItem(key) || '{}'); delete records[slug]; localStorage.setItem(key, JSON.stringify(records)); }
    } catch (_) { /* An unavailable local cache must not undo a confirmed server mutation. */ }
  },

  async setContinueHidden(slug, hidden) {
    const response = await this.request('/api/user/history/visibility', { method: 'POST', body: JSON.stringify({ movie_slug: slug, hidden }) });
    if (response.status && response.data?.user_id) {
      try {
        const key = `TTPhim_progress_${response.data.user_id}`;
        const records = JSON.parse(localStorage.getItem(key) || '{}');
        if (records[slug]) { records[slug].continue_hidden = hidden; localStorage.setItem(key, JSON.stringify(records)); }
      } catch (_) { /* Server history remains authoritative when local storage is unavailable. */ }
    }
    return response;
  },

  async clearHistory() {
    const response = await this.request('/api/user/history/clear', { method: 'POST' });
    if (response.status) this.clearLocalProgress(response.data?.user_id);
    return response;
  },

  async removeFromHistory(slug) {
    const response = await this.request('/api/user/history/remove', {
      method: 'POST',
      body: JSON.stringify({ movie_slug: slug })
    });
    if (response.status) this.clearLocalProgress(response.data?.user_id, slug);
    return response;
  },



  async rateMovie(slug, score) {
    return this.request(`/api/movies/${slug}/rate`, {
      method: 'POST',
      body: JSON.stringify({ score })
    });
  },

  async reportError(slug, episodeSlug, reason, details = '') {
    return this.request(`/api/movies/${slug}/report`, {
      method: 'POST',
      body: JSON.stringify({ episode_slug: episodeSlug, reason, details })
    });
  },

  async changePassword(oldPassword, newPassword) {
    const res = await this.request('/api/user/password', {
      method: 'POST',
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
    });
    if (res.status) localStorage.removeItem('kk_user');
    return res;
  },

  async batchRemoveWatchlist(slugs) {
    return this.request('/api/user/watchlist/batch-remove', {
      method: 'POST',
      body: JSON.stringify({ slugs })
    });
  },

  // User Profile Update
  async getAvatarOptions() { return this.request('/api/user/avatar/options'); },
  async chooseAvatar(avatar) {
    const result = await this.request('/api/user/avatar/default', { method:'POST', body:JSON.stringify({avatar}) });
    if (result.status && result.data) cacheUserProfile(result.data);
    return result;
  },
  async uploadAvatar(file, crop) {
    const query = crop ? '?crop=' + encodeURIComponent(JSON.stringify(crop)) : '';
    const result = await this.request('/api/user/avatar' + query, { method:'POST',headers:{'Content-Type':file.type},body:file });
    if (result.status && result.data) cacheUserProfile(result.data);
    return result;
  },
  async updateProfile(name, avatar) {
    const res = await this.request('/api/user/profile', {
      method: 'POST',
      body: JSON.stringify({ name, avatar })
    });
    if (res.status && res.data) {
      cacheUserProfile(res.data);
    }
    return res;
  },

  // Admin APIs
  async getAdminStats() {
    const res = await this.request('/api/admin/stats');
    return res.data;
  },

  async getAdminUsers() {
    const res = await this.request('/api/admin/users');
    return res.data || [];
  },

  async updateAdminUser(id, updates) {
    return this.request(`/api/admin/users/${id}/update`, {
      method: 'POST',
      body: JSON.stringify(updates)
    });
  },

  async getAdminReports() {
    const res = await this.request('/api/admin/reports');
    return res.data || [];
  },

  async updateAdminReportStatus(id, status) {
    return this.request(`/api/admin/reports/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status })
    });
  },

  async getAdminComments() {
    const res = await this.request('/api/admin/comments');
    return res.data || [];
  },

  async deleteAdminComment(id) {
    return this.request(`/api/admin/comments/${id}`, {
      method: 'DELETE'
    });
  },

  async clearAdminCache() {
    return this.request('/api/admin/cache/clear', {
      method: 'POST'
    });
  },

  async getAdminSources() {
    const res = await this.request('/api/admin/sources');
    return res.data;
  },

  async syncAdminSources() {
    return this.request('/api/admin/sources/sync', {
      method: 'POST'
    });
  },

  async getAdminSettings() {
    const res = await this.request('/api/admin/settings');
    return res.data;
  },

  async getAdminPopupBanner() {
    const res = await this.request('/api/admin/popup-banner');
    return res.data;
  },

  async updateAdminPopupBanner(data) {
    return this.request('/api/admin/popup-banner', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async getAdminAppBanner() {
    const res = await this.request('/api/admin/app-banner');
    return res.data;
  },

  async updateAdminAppBanner(data) {
    return this.request('/api/admin/app-banner', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async getAdminAppUpdate() {
    const res = await this.request('/api/admin/app-update');
    return res.data;
  },

  async updateAdminAppUpdate(data) {
    return this.request('/api/admin/app-update', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateAdminSettings(settings) {
    return this.request('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify(settings)
    });
  },

  async createAdminUser(userData) {
    return this.request('/api/admin/users/create', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  async deleteAdminUser(id) {
    return this.request(`/api/admin/users/${id}`, {
      method: 'DELETE'
    });
  },

  async searchAdminMovies(keyword, source = 'all') {
    const res = await this.request(`/api/admin/search-movie?keyword=${encodeURIComponent(keyword)}&source=${encodeURIComponent(source || 'all')}`);
    return res.data || [];
  },

  async getSiteAnnouncement() {
    const res = await this.request('/api/settings/announcement');
    return res.data;
  },

  async getNotifications() {
    const res = await this.request('/api/notifications');
    if (!res.status) throw new Error(res.message || 'Không thể tải thông báo');
    return res.data || [];
  },

  async markFollowNotificationRead(id) {
    return this.request(`/api/user/follow-notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}' });
  },

  // Watch Party APIs
  async createPartyRoom(partyData) {
    return this.request('/api/party/create', {
      method: 'POST',
      body: JSON.stringify(partyData)
    });
  },

  async getPartyRoom(code) {
    return this.request(`/api/party/${code}`);
  },

  async joinPartyRoom(code, userData) {
    return this.request(`/api/party/${code}/join`, {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  async leavePartyRoom(code, userId) {
    return this.request(`/api/party/${code}/leave`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  },

  async syncPartyPlayer(code, syncData) {
    return this.request(`/api/party/${code}/sync`, {
      method: 'POST',
      body: JSON.stringify(syncData)
    });
  },

  async sendPartyChat(code, chatData) {
    return this.request(`/api/party/${code}/chat`, {
      method: 'POST',
      body: JSON.stringify(chatData)
    });
  },

  async sendPartyReaction(code, reactionData) {
    return this.request(`/api/party/${code}/reaction`, {
      method: 'POST',
      body: JSON.stringify(reactionData)
    });
  }
};

window.API = API;





// A restored private page must revalidate the cookie, never trust a cached profile.
(() => {
  if (!window.location || typeof window.addEventListener !== 'function' || typeof document === 'undefined') return;
  const privatePage = /^\/(?:mobile\/)?(?:tai-khoan|danh-sach)(?:\.html)?\/?$/i.test(location.pathname) || /^\/(?:tu-phim|danh-sach-cua-toi)\/?$/i.test(location.pathname);
  if (!privatePage) return;
  let pending = false;
  const verify = async () => {
    if (pending) return;
    pending = true;
    const main = document.querySelector('main');
    if (main) main.inert = true;
    try {
      const user = await API.getMe();
      if (accountIdentityChanged) return;
      if (!user) { location.replace('/auth?redirect=' + encodeURIComponent(location.pathname + location.search)); return; }
      if (main) main.inert = false;
      document.getElementById('account-session-retry')?.remove();
    } catch (_) {
      if (!document.getElementById('account-session-retry')) {
        const warning = document.createElement('button'); warning.id = 'account-session-retry'; warning.type = 'button';
        warning.textContent = 'Chưa xác minh được phiên đăng nhập. Bấm để thử lại.';
        warning.style.cssText = 'position:fixed;top:90px;left:16px;right:16px;z-index:1000;min-height:48px;padding:12px;background:#3c2027;color:white;border:1px solid #e36b7b;border-radius:10px';
        warning.onclick = () => { warning.remove(); verify(); }; document.body.appendChild(warning);
      }
    } finally { pending = false; }
  };
  window.addEventListener('pageshow', verify);
  window.addEventListener('focus', verify);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verify(); });
})();

// Refresh display-only avatars from the authenticated server, never from storage payloads.
(() => {
  let pending = false;
  if (typeof window.addEventListener !== 'function') return;
  function apply(user) {
    if (!user?.id || typeof user.avatar !== 'string') return;
    let url;
    try { url = new URL(user.avatar, location.origin); } catch (_) { return; }
    if (!['http:', 'https:'].includes(url.protocol)) return;
    document.querySelectorAll('img[data-avatar-user]').forEach(image => {
      if (image.dataset.avatarUser === user.id) image.src = url.href;
    });
  }
  window.addEventListener('cineviet:profile-updated', event => apply(event.detail));
  async function refresh() {
    if (pending || !document.querySelector('[data-avatar-user], #profile-avatar-img, #userAvatar')) return;
    pending = true;
    try {
      const user = await API.getMe();
      if (user) window.dispatchEvent(new CustomEvent('cineviet:profile-updated', { detail: user }));
    } catch (_) { /* Keep the last confirmed avatar during an outage. */ }
    finally { pending = false; }
  }
  window.addEventListener('storage', event => { if (event.key === 'kk_user') refresh(); });
  window.addEventListener('focus', refresh);
})();
