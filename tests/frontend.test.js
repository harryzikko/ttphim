const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function element() {
  return {
    innerHTML: '', innerText: '', textContent: '', style: {}, children: [], listeners: {},
    classList: { add() {}, remove() {} },
    setAttribute() {},
    querySelectorAll() { return []; },
    appendChild(child) { this.children.push(child); },
    addEventListener(name, callback) { this.listeners[name] = callback; }
  };
}
function fixture(ids) {
  const elements = Object.fromEntries(ids.map(id => [id, element()]));
  const events = {};
  return {
    elements, events,
    document: {
      getElementById(id) { return elements[id] || null; },
      createElement() { return element(); },
      addEventListener(name, callback) { events[name] = callback; }
    }
  };
}

test('mobile detail renders root-level episodes and the correct first play URL', async () => {
  const dom = fixture(['m-detail-play-btn', 'm-server-pills', 'm-episode-grid', 'm-episode-count']);
  const detail = {
    movie: { slug: 'test-film', name: 'Test Film' },
    episodes: [{ server_name: 'Test Server', server_data: [{ slug: 'full', name: 'Full' }] }]
  };
  const context = vm.createContext({
    document: dom.document,
    window: { location: { pathname: '/mobile/phim/test-film', search: '' } },
    URLSearchParams, console,
    API: { getMovieDetail: async () => detail }
  });
  vm.runInContext(source('public/mobile/js/chi-tiet.js'), context);
  await dom.events.DOMContentLoaded();
  assert.equal(dom.elements['m-detail-play-btn'].href, '/mobile/xem-phim/test-film/full?server=0');
  assert.match(dom.elements['m-episode-grid'].innerHTML, /\/mobile\/xem-phim\/test-film\/full\?server=0/);
  assert.equal(dom.elements['m-episode-count'].innerText, '1 tập');
});

test('TV home hydrates all rails from the backend feed contract', async () => {
  const dom = fixture(['hero-backdrop', 'hero-title', 'hero-origin-name', 'hero-play-btn', 'hero-detail-btn', 'rail-featured', 'rail-series', 'rail-singles']);
  const movie = { slug: 'test-film', name: 'Test Film', thumb_url: '/poster.jpg' };
  const context = vm.createContext({
    document: dom.document, window: { addEventListener() {} }, console,
    setTimeout: callback => callback(),
    fetch: async () => ({ json: async () => ({ status: true, data: { spotlights: [movie], series: [movie], singles: [movie] } }) })
  });
  const html = source('public/tv/index.html');
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(match => match[1].includes('async function loadTvHome'))[1];
  vm.runInContext(script, context);
  await vm.runInContext('loadTvHome()', context);
  assert.equal(dom.elements['hero-title'].textContent, movie.name);
  for (const id of ['rail-featured', 'rail-series', 'rail-singles']) {
    assert.match(dom.elements[id].innerHTML, /\/tv\/chi-tiet\/test-film/);
  }
});

test('mobile library reads backend fields and clears history through the API', async () => {
  const dom = fixture(['tabBtnWatchlist', 'tabBtnHistory', 'tabBtnDownloads', 'panelWatchlist', 'panelHistory', 'panelDownloads', 'watchlistGrid', 'watchlistEmpty', 'historyList', 'historyEmpty', 'badgeWatchlist', 'badgeHistory', 'tabCountSummary', 'clearListBtn']);
  let cleared = false;
  const context = vm.createContext({
    document: dom.document, window: { location: { search: '', href: 'https://site.test/mobile/danh-sach' }, history: { replaceState() {} } }, URLSearchParams, URL,
    confirm: () => true,
    API: {
      getLibrary: async () => ({
        watchlist: [{ movie_slug: 'saved-film', movie_name: 'Saved Film' }],
        history: cleared ? [] : [{ movie_slug: 'history-film', movie_name: 'History Film', episode_slug: 'full', episode_name: 'Full' }]
      }),
      clearHistory: async () => { cleared = true; return { status: true }; }
    }
  });
  vm.runInContext(source('public/mobile/js/danh-sach.js'), context);
  await dom.events.DOMContentLoaded();
  assert.equal(dom.elements.badgeWatchlist.textContent, '1');
  assert.equal(dom.elements.badgeHistory.textContent, '1');
  assert.match(dom.elements.watchlistGrid.children[0].innerHTML, /\/mobile\/phim\/saved-film/);
  assert.match(dom.elements.historyList.children[0].innerHTML, /\/mobile\/xem-phim\/history-film\/full/);
  assert.equal(dom.elements.tabCountSummary.textContent, '1 phim trong danh sách');
  dom.elements.tabBtnHistory.listeners.click();
  dom.elements.clearListBtn.listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cleared, true);
  assert.equal(dom.elements.badgeHistory.textContent, '0');
});

test('client clears stale local identity and surfaces unauthorized library errors', async () => {
  const storage = new Map([['kk_user', JSON.stringify({ id: 'stale' })]]);
  const context = vm.createContext({
    window: {},
    localStorage: { getItem: key => storage.get(key), removeItem: key => storage.delete(key), setItem: (key, value) => storage.set(key, value) },
    fetch: async () => ({ json: async () => ({ status: false, data: null, message: 'Login required' }) })
  });
  vm.runInContext(source('public/js/api.js'), context);
  assert.equal(await vm.runInContext('API.getMe()', context), null);
  assert.equal(storage.has('kk_user'), false);
  await assert.rejects(vm.runInContext('API.getLibrary()', context), /Login required/);
});
