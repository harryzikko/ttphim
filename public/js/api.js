// TTPhim - Client API SDK
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
    const res = await fetch(finalUrl, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers
      },
      ...options
    });
    const data = await res.json();
    return data;
  },

  // Home
  async getHome() {
    const res = await this.request('/api/home');
    return res.data;
  },

  // Movie Details
  async getMovieDetail(slug) {
    const res = await this.request(`/api/movies/${slug}`);
    if (!res.status) throw new Error(res.message || 'Movie not found');
    return res.data;
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
    return res.data?.likes;
  },

  // Auth
  async login(email, password) {
    const res = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (res.status && res.data?.user) {
      localStorage.setItem('kk_user', JSON.stringify(res.data.user));
    }
    return res;
  },

  async register(email, password, name) {
    const res = await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name })
    });
    if (res.status && res.data?.user) {
      localStorage.setItem('kk_user', JSON.stringify(res.data.user));
    }
    return res;
  },

  async getMe() {
    const res = await this.request('/api/auth/me');
    if (res.status && res.data) {
      localStorage.setItem('kk_user', JSON.stringify(res.data));
      return res.data;
    }
    // Fallback to local storage or demo user
    const local = localStorage.getItem('kk_user');
    if (local) {
      try { return JSON.parse(local); } catch(e) {}
    }
    return null;
  },

  async logout() {
    await this.request('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('kk_user');
  },

  // Library & Watchlist
  async getLibrary() {
    const res = await this.request('/api/user/library');
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

  async clearHistory() {
    return this.request('/api/user/history/clear', { method: 'POST' });
  },

  async removeFromHistory(slug) {
    return this.request('/api/user/history/remove', {
      method: 'POST',
      body: JSON.stringify({ movie_slug: slug })
    });
  },



  async rateMovie(slug, score) {
    return this.request(`/api/movies/${slug}/rate`, {
      method: 'POST',
      body: JSON.stringify({ score })
    });
  },

  async reportError(slug, episodeSlug, reason) {
    return this.request(`/api/movies/${slug}/report`, {
      method: 'POST',
      body: JSON.stringify({ episode_slug: episodeSlug, reason })
    });
  },

  async changePassword(oldPassword, newPassword) {
    return this.request('/api/user/password', {
      method: 'POST',
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
    });
  },

  async batchRemoveWatchlist(slugs) {
    return this.request('/api/user/watchlist/batch-remove', {
      method: 'POST',
      body: JSON.stringify({ slugs })
    });
  },

  // User Profile Update
  async updateProfile(name, avatar) {
    const res = await this.request('/api/user/profile', {
      method: 'POST',
      body: JSON.stringify({ name, avatar })
    });
    if (res.status && res.data) {
      localStorage.setItem('kk_user', JSON.stringify(res.data));
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
    return res.data || [];
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




