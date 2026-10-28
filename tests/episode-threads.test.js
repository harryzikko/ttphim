'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function fixture() {
  const dom = new JSDOM('<div id="sources"></div><textarea id="input"></textarea><div id="comments"></div>', { runScripts: 'outside-only' });
  dom.window.eval(read('public/js/episode-sources.js'));
  dom.window.eval(read('public/js/comment-threads.js'));
  return dom;
}
const ep = (slug, extra = {}) => ({ slug, name: `Tập ${slug.replace('tap-', '')}`, link_embed: 'https://example.invalid/' + slug, ...extra });
const servers = () => [
  { server_name: 'Vietsub #1', server_data: [ep('tap-1'), ep('tap-01'), ep('tap-2'), ep('tap-3', { link_embed: '' }), ep('tap-4', { link_embed: 'javascript:alert(1)' })] },
  { server_name: 'Thuyết Minh #1', server_data: [ep('tap-1')] },
  { server_name: 'Vietsub #2', server_data: [ep('tap-1')] },
  { server_name: 'Song Ngữ (Đa Giọng & Phụ Đề)', server_data: [ep('tap-1')] },
  { server_name: 'Nguồn chưa rõ', server_data: [] }
];
test('source groups count unique linked episodes and preserve original server indices', () => {
  const dom = fixture();
  try {
    const groups = dom.window.EpisodeSources.groups(servers());
    assert.deepEqual(JSON.parse(JSON.stringify(groups.map(group => ({ id: group.id, indices: group.sources.map(s => s.index), counts: group.sources.map(s => s.count) })))), [
      { id: 'sub', indices: [0, 2], counts: [2, 1] }, { id: 'voice', indices: [1], counts: [1] }, { id: 'multi', indices: [3], counts: [1] }, { id: 'unknown', indices: [4], counts: [0] }
    ]);
    assert.equal(servers()[0].server_data.length, 5);
  } finally { dom.window.close(); }
});
test('source UI separates language/server, disables empty groups and never injects provider markup', () => {
  const dom = fixture();
  try {
    const { document, EpisodeSources } = dom.window;
    const root = document.getElementById('sources'), data = servers();
    data[0].server_name = 'Vietsub <img onerror=alert(1)>';
    let chosen = null;
    const render = selected => EpisodeSources.render(root, data, selected, index => { chosen = index; render(index); });
    render(0);
    assert.equal(root.querySelector('img'), null);
    assert.equal(root.querySelectorAll('[data-source-index]').length, 2);
    assert.equal(root.querySelector('[data-language="unknown"]').disabled, true);
    root.querySelector('[data-language="voice"]').click();
    assert.equal(chosen, 1);
    assert.equal(root.querySelector('[data-source-index="1"]').getAttribute('aria-pressed'), 'true');
    root.querySelector('[data-language="sub"]').click();
    root.querySelector('[data-source-index="2"]').click();
    assert.equal(chosen, 2);
    assert.match(root.textContent, /1 tập/);
  } finally { dom.window.close(); }
});
test('comment scopes deduplicate episode aliases and distinguish current/general/all without losing drafts', () => {
  const dom = fixture();
  try {
    const { document, CommentThreads } = dom.window;
    let current = 'tap-1', changed = 0;
    const input = document.getElementById('input'); input.value = 'Bản nháp';
    const scope = CommentThreads.scope({ list: document.getElementById('comments'), servers: servers(), current: () => current, watch: true, onChange: () => changed++ });
    const comments = [{ id: 'a', episode_slug: '1' }, { id: 'b', episode_slug: 'tap-2' }, { id: 'c', episode_slug: null }];
    assert.equal(scope.filter(comments)[0].id, 'a');
    current = 'tap-2'; assert.equal(scope.filter(comments)[0].id, 'b');
    scope.select.value = 'general'; assert.equal(scope.filter(comments)[0].id, 'c');
    scope.select.value = 'all'; assert.equal(scope.filter(comments).length, 3);
    scope.select.dispatchEvent(new dom.window.Event('change')); assert.equal(changed, 1);
    assert.equal(input.value, 'Bản nháp');
    const picker = scope.composer(input, '01'); assert.equal(picker.value, 'tap-1');
    assert.equal([...picker.options].filter(option => CommentThreads.key(option.value) === '1').length, 1);
  } finally { dom.window.close(); }
});
test('spoiler body and replies are hidden from rendering until explicit accessible reveal', () => {
  const dom = fixture();
  try {
    const { document, CommentThreads } = dom.window;
    const list = document.getElementById('comments');
    list.innerHTML = '<article id="card-a"><button data-spoiler-toggle></button><p class="spoiler-body blur-[5px]">Secret</p><div data-comment-replies>Reply spoiler</div></article>';
    CommentThreads.protect(list, [{ id: 'a', episode_slug: 'tap-2', is_spoil: true }], 'card-');
    const toggle = list.querySelector('button'), body = list.querySelector('.spoiler-body'), replies = list.querySelector('[data-comment-replies]');
    assert.equal(body.hidden, true); assert.equal(replies.hidden, true);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(toggle.getAttribute('aria-controls'), body.id);
    assert.match(list.querySelector('.comment-episode-badge').textContent, /Tập 2/);
    toggle.click(); assert.equal(body.hidden, false); assert.equal(replies.hidden, false); assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    toggle.click(); assert.equal(body.hidden, true); assert.equal(replies.hidden, true);
  } finally { dom.window.close(); }
});
test('all four movie templates load grouped sources before their controllers and watch pages share spoiler helper', () => {
  for (const file of ['public/chi-tiet.html', 'public/xem-phim.html', 'public/mobile/chi-tiet.html', 'public/mobile/xem-phim.html']) {
    const html = read(file);
    assert.match(html, /episode-sources\.css\?v=1\.2\.1/);
    assert.match(html, /episode-sources\.js\?v=1\.2\.2/);
    assert.ok(html.indexOf('/js/episode-sources.js') < html.search(/src="\/(?:mobile\/)?js\/(?:detail|watch|chi-tiet|xem-phim)\.js/));
    if (!file.endsWith('mobile/chi-tiet.html')) assert.match(html, /comment-threads\.js\?v=1\.1\.0/);
  }
});

test('mobile detail renders hostile source and episode labels as text with encoded watch paths', () => {
  const dom = fixture();
  try {
    const { document } = dom.window;
    document.body.innerHTML = '<div id="m-server-pills"></div><div id="m-episode-grid"></div><span id="m-episode-count"></span>';
    dom.window.eval(read('public/mobile/js/chi-tiet.js'));
    dom.window.renderEpisodes([{ server_name: 'Vietsub <img src=x onerror=alert(1)>', server_data: [ep('bad\"/slug', { name: '<img src=x onerror=alert(1)>' })] }], 'film/\"bad');
    assert.equal(document.querySelector('[onerror]'), null);
    const link = document.querySelector('#m-episode-grid a');
    assert.equal(link.textContent.trim(), '<img src=x onerror=alert(1)>');
    assert.match(link.getAttribute('href'), /film%2F%22bad\/bad%22%2Fslug\?server=0/);
  } finally { dom.window.close(); }
});

test('spoiler timestamps carry the owning episode just like ordinary timestamps', () => {
  const source = read('public/js/watch.js');
  const start = source.indexOf('<p class="spoiler-body');
  const body = source.slice(start, source.indexOf('</p>', start));
  assert.match(body, /data-episode="\$\{escapeHtml\(c\.episode_slug \|\| ''\)\}"/);
});

test('compact source UI removes numbered instructions and redundant language-only source names', () => {
  const dom = fixture();
  try {
    const root = dom.window.document.getElementById('sources');
    dom.window.EpisodeSources.render(root, [{ server_name: 'Vietsub', server_data: [ep('tap-1')] }], 0, () => {});
    assert.equal(root.querySelector('.episode-sources-note'), null);
    assert.equal(root.querySelector('.episode-sources-label').textContent, 'Bản xem');
    assert.match(root.querySelector('.episode-source-btn').textContent, /Server 1/);
    assert.match(root.querySelector('.episode-source-btn').title, /Vietsub/);
  } finally { dom.window.close(); }
});

test('watch composers use multiline fields and place spoiler beside existing send controls', () => {
  for (const mobile of [false, true]) {
    const dom = new JSDOM(read(mobile ? 'public/mobile/xem-phim.html' : 'public/xem-phim.html'), { runScripts: 'outside-only' });
    try {
      const doc = dom.window.document;
      dom.window.eval(read('public/js/comment-threads.js'));
      const input = doc.getElementById(mobile ? 'm-comment-input' : 'watch-comment-input');
      assert.equal(input.tagName, 'TEXTAREA');
      const checkbox = dom.window.CommentThreads.spoilerInput(input);
      assert.ok(checkbox.closest('.comment-compose-tools'));
      assert.equal(checkbox.closest('.comment-compose-tools').querySelectorAll('#watch-send-btn,#m-comment-send').length, 1);
      assert.doesNotMatch(doc.querySelector('h3')?.textContent || '', /Thời Gian Thực/);
    } finally { dom.window.close(); }
  }
});

test('episode thumbnails prefer episode artwork, safely fall back to movie art and handle a broken image once', () => {
  const dom = fixture();
  try {
    const sources = dom.window.EpisodeSources;
    const movie = { thumb_url: 'https://images.test/movie.webp' };
    assert.equal(sources.thumbnail({ thumb_url: 'https://images.test/episode.webp' }, movie), 'https://images.test/episode.webp');
    assert.equal(sources.thumbnail({ thumb_url: 'javascript:alert(1)' }, movie), movie.thumb_url);
    assert.equal(sources.thumbnail({}, {}), '/images/episode-placeholder.svg');
    const img = sources.image({}, movie);
    assert.equal(img.alt, ''); assert.equal(img.loading, 'lazy');
    img.dispatchEvent(new dom.window.Event('error'));
    assert.equal(img.getAttribute('src'), '/images/episode-placeholder.svg');
    img.setAttribute('src', '/second-error'); img.dispatchEvent(new dom.window.Event('error'));
    assert.equal(img.getAttribute('src'), '/second-error');
    const container = dom.window.document.getElementById('sources');
    container.innerHTML = '<a data-episode-thumb href="/first">Tập 1</a><a data-episode-thumb href="/second">Tập 2</a>';
    sources.decorateThumbnails(container, [{ thumb_url: 'https://images.test/first.webp' }, {}], movie);
    assert.equal(container.querySelectorAll('img.episode-thumb').length, 2);
    assert.equal(container.querySelector('a').getAttribute('href'), '/first');
    assert.equal(container.querySelector('img').src, 'https://images.test/first.webp');
    assert.equal(container.querySelectorAll('img')[1].src, movie.thumb_url);
  } finally { dom.window.close(); }
});
