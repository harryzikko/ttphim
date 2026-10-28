const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} detail has no trailers and keeps favorite hearts across confirmed toggles`, async () => {
    const html = read(mobile ? 'public/mobile/chi-tiet.html' : 'public/chi-tiet.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const dom = new JSDOM(html, { url: `https://fixture.test/${mobile ? 'mobile/' : ''}phim/movie`, runScripts: 'outside-only' });
    try {
      const win = dom.window;
      const detail = { movie: { slug: 'movie', name: 'Test', origin_name: 'Test', year: 2026, category: [], actor: [], director: [], trailer_url: 'https://youtu.be/abcdefghijk' }, episodes: [], related: [], inWatchlist: true };
      let added = true, fail = false, mutations = 0;
      win.console = { log() {}, error() {} };
      win.showToast = () => {};
      win.MobileApp = { toast() {} };
      win.API = {
        getMovieDetail: async () => detail,
        getMe: async () => ({ id: 'fixture-user' }),
        getComments: async () => [],
        getMovies: async () => ({ items: [] }),
        request: async () => ({ status: true, data: { total: 0 } }),
        toggleWatchlist: async payload => {
          mutations++;
          assert.equal(payload.movie_slug, 'movie');
          if (fail) return { status: false, message: 'Test error' };
          added = !added;
          return { status: true, data: { added } };
        }
      };
      win.eval(read(mobile ? 'public/mobile/js/chi-tiet.js' : 'public/js/detail.js'));
      await tick(); await tick();
      const doc = win.document;
      assert.equal(doc.querySelector('[id*="trailer" i]'), null);
      const button = doc.getElementById(mobile ? 'm-action-watchlist' : 'detail-favorite-btn');
      const icon = button.querySelector('.material-symbols-outlined');
      assert.equal(button.getAttribute('aria-pressed'), 'true');
      assert.equal(icon.textContent, 'favorite');
      await button.onclick();
      assert.equal(button.getAttribute('aria-pressed'), 'false');
      assert.equal(icon.textContent, 'favorite');
      await button.onclick();
      assert.equal(button.getAttribute('aria-pressed'), 'true');
      assert.equal(icon.textContent, 'favorite');
      fail = true;
      await button.onclick();
      assert.equal(button.getAttribute('aria-pressed'), 'true');
      assert.equal(mutations, 3);
    } finally { dom.window.close(); }
  });
}
