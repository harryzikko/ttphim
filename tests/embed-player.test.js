const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../public/js/player-ux');
const UX = globalThis.PlayerUX;
const frame = () => ({ src: '' });

test('iframe load shows guidance instead of claiming video playback success', () => {
  const iframe = frame(), states = [];
  const session = UX.createEmbedSession({ iframe, url: 'https://player.example/embed', onState: state => states.push(state) });
  assert.equal(iframe.src, 'https://player.example/embed');
  iframe.onload();
  assert.deepEqual(states, ['embed', 'embed-help']);
  session.destroy();
});

test('destroyed iframe session cannot update a reused player from stale events', () => {
  const iframe = frame(), states = [];
  const session = UX.createEmbedSession({ iframe, url: 'https://player.example/embed', onState: state => states.push(state) });
  const staleLoad = iframe.onload, staleError = iframe.onerror;
  session.destroy();
  iframe.src = 'https://new.example/embed';
  staleLoad(); staleError();
  assert.equal(iframe.src, 'https://new.example/embed');
  assert.deepEqual(states, ['embed']);
  assert.equal(iframe.onload, null);
  assert.equal(iframe.onerror, null);
});

test('slow iframe loads show actionable errors and cleanup cancels deadlines', async () => {
  const iframe = frame(), states = [];
  const session = UX.createEmbedSession({ iframe, url: 'https://player.example/embed', timeout: 5,
    onState: state => states.push(state) });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(states, ['embed', 'error']);
  session.destroy();
  assert.equal(iframe.src, 'about:blank');
  const cancelled = UX.createEmbedSession({ iframe, url: 'https://player.example/embed', timeout: 5,
    onState: state => states.push(state) });
  cancelled.destroy();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(states, ['embed', 'error', 'embed']);
});

test('embed guidance renders below the player while errors and play confirmation stay inside', () => {
  const { JSDOM } = require('jsdom');
  const fs = require('node:fs'), path = require('node:path');
  const dom = new JSDOM('<div id="viewport"><iframe></iframe></div><div id="help" hidden></div>', { runScripts: 'outside-only' });
  try {
    dom.window.eval(fs.readFileSync(path.join(__dirname, '../public/js/player-ux.js'), 'utf8'));
    const doc = dom.window.document, viewport = doc.getElementById('viewport'), help = doc.getElementById('help');
    let changes = 0, plays = 0;
    const status = dom.window.PlayerUX.createStatus(viewport, { embedHelpContainer: help, changeServer: () => changes++, play: () => plays++ });
    status('embed', 'Loading');
    const panel = viewport.querySelector('.player-status');
    assert.equal(help.hidden, true);
    status('embed-help', 'Provider help');
    assert.equal(panel.parentElement, help); assert.equal(help.hidden, false);
    assert.equal(viewport.querySelector('.player-status'), null);
    assert.equal(panel.classList.contains('player-status-outside'), true);
    panel.querySelector('button').click(); assert.equal(changes, 1);
    panel.querySelectorAll('button')[1].click(); assert.equal(help.hidden, true);
    status('embed-help', 'Next episode'); assert.equal(help.hidden, false);
    status('ready'); assert.equal(help.hidden, true); assert.equal(panel.parentElement, viewport); assert.equal(panel.hidden, true);
    status('paused', 'Press play'); assert.equal(panel.parentElement, viewport); assert.equal(panel.classList.contains('player-status-outside'), false);
    panel.querySelector('button').click(); assert.equal(plays, 1);
    status('error', 'Failed'); assert.equal(panel.parentElement, viewport); assert.equal(help.hidden, true);
  } finally { dom.window.close(); }
});

test('both watch pages provide an embed notice outside the clipped video viewport', () => {
  const { JSDOM } = require('jsdom');
  const fs = require('node:fs'), path = require('node:path');
  for (const mobile of [false, true]) {
    const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../public', mobile ? 'mobile/xem-phim.html' : 'xem-phim.html'), 'utf8'));
    try {
      const doc = dom.window.document, notice = doc.getElementById(mobile ? 'm-embed-player-help' : 'embed-player-help');
      const viewport = doc.getElementById(mobile ? 'm-player-wrapper' : 'player-viewport');
      assert.ok(notice); assert.equal(notice.hidden, true); assert.equal(viewport.contains(notice), false);
    } finally { dom.window.close(); }
  }
});

test('server-rendered watch page keeps embed guidance outside the player replacement boundary', () => {
  const { JSDOM } = require('jsdom');
  const fs = require('node:fs'), path = require('node:path');
  const template = require('../src/services/templateService');
  const html = fs.readFileSync(path.join(__dirname, '../public/xem-phim.html'), 'utf8');
  const data = { movie: { slug: 'fixture', name: 'Fixture', year: 2026, category: [], actor: [], director: [] }, episodes: [{ server_name: 'Song Ngữ', server_data: [{ slug: 'tap-1', name: '1', link_embed: 'https://provider.test/embed' }] }] };
  const dom = new JSDOM(template.renderWatch(html, data));
  try {
    const doc = dom.window.document, help = doc.getElementById('embed-player-help'), viewport = doc.getElementById('player-viewport');
    assert.ok(help); assert.equal(viewport.contains(help), false); assert.equal(help.hidden, true);
    assert.equal(doc.querySelectorAll('#embed-player-help').length, 1);
  } finally { dom.window.close(); }
});
