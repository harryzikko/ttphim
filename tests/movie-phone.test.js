const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('movie phone helper moves the same aside on resize and preserves its handlers/state', async () => {
  const dom = new JSDOM('<div id="player-grid-container"><div id="primary-player-column"><div id="watch-film-info"></div></div><aside id="watch-side-column"><input value="draft"><button id="tab-btn-party">Party</button><button id="tab-btn-episodes">Episodes</button></aside></div><a data-watch-tab="party"></a>', { url: 'https://site.test/xem-phim/film/1', runScripts: 'outside-only' });
  try {
    let change, selected = 0;
    const media = { matches: true, addEventListener(name, handler) { change = handler; } };
    dom.window.matchMedia = () => media;
    const doc = dom.window.document, aside = doc.getElementById('watch-side-column');
    doc.getElementById('tab-btn-party').onclick = () => selected++;
    dom.window.eval(read('public/js/movie-phone.js')); await tick();
    assert.equal(aside.parentElement.id, 'primary-player-column');
    assert.equal(aside.nextElementSibling.id, 'watch-film-info');
    doc.querySelector('[data-watch-tab]').click(); assert.equal(selected, 1);
    media.matches = false; change();
    assert.equal(aside.parentElement.id, 'player-grid-container');
    assert.equal(aside.querySelector('input').value, 'draft');
    assert.equal(doc.querySelectorAll('#watch-side-column').length, 1);
  } finally { dom.window.close(); }
});

test('detail synopsis has a real expanded/collapsed state and updates after asynchronous text arrives', async () => {
  const dom = new JSDOM('<p id="synopsis-text">Loading</p><button id="detail-synopsis-toggle" aria-expanded="false" hidden>More</button>', { runScripts: 'outside-only' });
  try {
    dom.window.eval(read('public/js/movie-phone.js')); await tick();
    const doc = dom.window.document, button = doc.getElementById('detail-synopsis-toggle');
    assert.equal(button.hidden, true);
    doc.getElementById('synopsis-text').textContent = 'Long synopsis. '.repeat(30); await tick();
    assert.equal(button.hidden, false); button.click();
    assert.equal(button.getAttribute('aria-expanded'), 'true'); assert.equal(doc.getElementById('synopsis-text').dataset.expanded, 'true');
    button.click(); assert.equal(button.getAttribute('aria-expanded'), 'false');
  } finally { dom.window.close(); }
});

test('detail server selection updates the main watch action to the selected episode and server', async () => {
  const html = read('public/chi-tiet.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const dom = new JSDOM(html, { url: 'https://site.test/phim/film', runScripts: 'outside-only' });
  try {
    dom.window.console = { log() {}, error() {} }; dom.window.showToast = () => {};
    dom.window.API = { getMovieDetail: async () => ({ movie: { name: 'Test', slug: 'film', year: 2026, actor: [], director: [], category: [] }, related: [], episodes: [{ server_name: 'First', server_data: [{ name: '1', slug: 'tap-1' }] }, { server_name: 'Second', server_data: [{ name: 'Full', slug: 'full' }] }] }), getComments: async () => [] };
    const errors = []; dom.window.addEventListener('error', event => errors.push(event.error));
    dom.window.eval(read('public/js/detail.js')); await tick();
    dom.window.document.querySelectorAll('#episode-selector .server-btn')[1].click();
    assert.equal(dom.window.document.querySelector('#detail-action-deck > a').getAttribute('href'), '/xem-phim/film/full?server=1');
    assert.deepEqual(errors, []);
  } finally { dom.window.close(); }
});

test('SSR retains mobile layout hooks and renders metadata in the updated detail/watch containers', () => {
  const template = require('../src/services/templateService');
  const data = { movie: { name: 'Fixture', slug: 'fixture', year: 2025, quality: 'HD', lang: 'Fixture Language', category: [{ name: 'Fixture Genre', slug: 'fixture-genre' }], actor: [], director: [] }, episodes: [{ server_name: 'Fixture Server', server_data: [{ name: '1', slug: '1' }] }], related: [] };
  for (const [file, method] of [['public/chi-tiet.html', 'renderDetail'], ['public/xem-phim.html', 'renderWatch']]) {
    const dom = new JSDOM(template[method](read(file), data));
    try {
      const doc = dom.window.document;
      assert.ok(doc.querySelector('link[href="/css/movie-phone.css?v=1.0.0"]'));
      if (method === 'renderDetail') { assert.ok(doc.getElementById('detail-meta').textContent.includes('Fixture Language')); assert.ok(doc.getElementById('detail-genres').textContent.includes('Fixture Genre')); }
      else { assert.ok(doc.getElementById('watch-film-info').textContent.includes('Fixture')); assert.ok(doc.getElementById('watch-side-column')); }
    } finally { dom.window.close(); }
  }
});
