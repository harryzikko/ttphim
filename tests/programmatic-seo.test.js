const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

describe('Programmatic SEO & Routes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'programmatic-seo-test-'));
  const testDbPath = path.join(tmpDir, 'test-db.json');
  fs.copyFileSync(path.resolve(__dirname, '../data/db.json'), testDbPath);
  process.env.DB_PATH = testDbPath;
  process.env.PUBLIC_ORIGIN = 'https://cineviet.live';

  const programmaticService = require('../src/services/programmaticService');
  const { app } = require('../src/server');

  test('programmaticService loads all 2968 entries from CSV', () => {
    assert.strictEqual(programmaticService.count(), 2968);
    const entry = programmaticService.get('100-ngay-lua-doi-vietsub');
    assert.ok(entry, 'Entry should exist');
    assert.strictEqual(entry.kind, 'vietsub');
    assert.strictEqual(entry.source, '100-ngay-lua-doi');
    assert.strictEqual(entry.title, 'Xem 100 Ngày Lừa Dối (2026) Vietsub Full HD | CineViet');
    assert.strictEqual(entry.h1, '100 Ngày Lừa Dối Vietsub Full HD (2026)');
  });

  test('GET /robots.txt includes sitemap-index.xml and sitemap-programmatic.xml', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/robots.txt`);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('Sitemap: https://cineviet.live/sitemap-index.xml'), 'Includes sitemap index');
      assert.ok(text.includes('Sitemap: https://cineviet.live/sitemap.xml'), 'Includes main sitemap');
      assert.ok(text.includes('Sitemap: https://cineviet.live/sitemap-programmatic.xml'), 'Includes programmatic sitemap');
    } finally {
      server.close();
    }
  });

  test('GET /sitemap-index.xml returns valid sitemapindex XML and /sitemap redirects 301', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/sitemap-index.xml`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('xml'));
      const text = await res.text();
      assert.ok(text.includes('<sitemapindex'));
      assert.ok(text.includes('<loc>https://cineviet.live/sitemap.xml</loc>'));
      assert.ok(text.includes('<loc>https://cineviet.live/sitemap-programmatic.xml</loc>'));

      const aliasRes = await fetch(`http://127.0.0.1:${port}/sitemap`, { redirect: 'manual' });
      assert.strictEqual(aliasRes.status, 301);
      assert.strictEqual(aliasRes.headers.get('location'), '/sitemap-index.xml');
    } finally {
      server.close();
    }
  });

  test('Legacy /movie/* and /watch/* routes 301-redirect to canonical /phim/* and /xem-phim/*', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const movieRes = await fetch(`http://127.0.0.1:${port}/movie/100-ngay-lua-doi`, { redirect: 'manual' });
      assert.strictEqual(movieRes.status, 301);
      assert.strictEqual(movieRes.headers.get('location'), '/phim/100-ngay-lua-doi');

      const watchRes = await fetch(`http://127.0.0.1:${port}/watch/100-ngay-lua-doi`, { redirect: 'manual' });
      assert.strictEqual(watchRes.status, 301);
      assert.strictEqual(watchRes.headers.get('location'), '/phim/100-ngay-lua-doi');

      const watchEpQueryRes = await fetch(`http://127.0.0.1:${port}/watch/100-ngay-lua-doi?ep=1`, { redirect: 'manual' });
      assert.strictEqual(watchEpQueryRes.status, 301);
      assert.strictEqual(watchEpQueryRes.headers.get('location'), '/xem-phim/100-ngay-lua-doi/tap-1');

      const watchEpPathRes = await fetch(`http://127.0.0.1:${port}/watch/100-ngay-lua-doi/tap-2`, { redirect: 'manual' });
      assert.strictEqual(watchEpPathRes.status, 301);
      assert.strictEqual(watchEpPathRes.headers.get('location'), '/xem-phim/100-ngay-lua-doi/tap-2');
    } finally {
      server.close();
    }
  });

  test('GET /sitemap-programmatic.xml returns XML with all entries', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/sitemap-programmatic.xml`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('xml'));
      const text = await res.text();
      assert.ok(text.includes('<loc>https://cineviet.live/100-ngay-lua-doi-vietsub</loc>'));
      assert.ok(text.includes('<loc>https://cineviet.live/top-phim-ai-2026</loc>'));
    } finally {
      server.close();
    }
  });

  test('GET /c4b189a6230f4e1981d9f485e921d7bf.txt returns IndexNow key', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/c4b189a6230f4e1981d9f485e921d7bf.txt`);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.strictEqual(text.trim(), 'c4b189a6230f4e1981d9f485e921d7bf');
    } finally {
      server.close();
    }
  });

  test('GET /top-phim-ai-2026 renders 200 OK indexable SSR genre landing page with ItemList schema', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/top-phim-ai-2026`, { redirect: 'manual' });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('x-robots-tag'), 'index, follow');
      const html = await res.text();
      assert.ok(html.includes('<title>Top Phim AI Hay Nhất 2026 Vietsub | CineViet</title>'));
      assert.ok(html.includes('<meta name="robots" content="index,follow">'));
      assert.ok(html.includes('"@type":"CollectionPage"'));
      assert.ok(html.includes('"@type":"ItemList"'));
      assert.ok(html.includes('id="programmatic-seo-links"'));
    } finally {
      server.close();
    }
  });

  test('GET /sitemap-movies-1.xml returns expanded multi-variant movie URLs', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/sitemap-movies-1.xml`);
      assert.strictEqual(res.status, 200);
      const xml = await res.text();
      assert.ok(xml.includes('/phim/100-ngay-lua-doi</loc>'));
      assert.ok(xml.includes('/100-ngay-lua-doi-vietsub</loc>'));
      assert.ok(xml.includes('/100-ngay-lua-doi-tap-moi-nhat</loc>'));
      assert.ok(xml.includes('/100-ngay-lua-doi-thuyet-minh</loc>'));
    } finally {
      server.close();
    }
  });

  test('GET /non-existent-random-slug-999 falls through to 404', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/non-existent-random-slug-999`);
      assert.strictEqual(res.status, 404);
    } finally {
      server.close();
    }
  });

  test('GET /100-ngay-lua-doi-vietsub and dynamic /100-ngay-lua-doi-thuyet-minh serve Rich Snippets & anti-dedup content', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/100-ngay-lua-doi-vietsub`);
      assert.strictEqual(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('<title>Xem 100 Ngày Lừa Dối (2026) Vietsub Full HD | CineViet</title>'), 'HTML contains programmatic title');
      assert.ok(html.includes('content="Xem phim 100 Ngày Lừa Dối (2026) vietsub full HD'), 'HTML contains programmatic description');
      assert.ok(html.includes('href="https://cineviet.live/100-ngay-lua-doi-vietsub"'), 'HTML contains programmatic canonical link');
      assert.ok(html.includes('id="programmatic-seo-links"'), 'HTML contains programmatic internal link section');
      assert.ok(html.includes('id="seo-rich-brief"'), 'HTML contains anti-dedup semantic SEO brief');
      assert.ok(html.includes('"@type":"AggregateRating"'), 'JSON-LD contains AggregateRating rich snippet');
      assert.ok(html.includes('"@type":"VideoObject"'), 'JSON-LD contains VideoObject rich snippet');
      assert.ok(html.includes('"@type":"FAQPage"'), 'JSON-LD contains FAQPage rich snippet');
      assert.ok(html.includes('href="/100-ngay-lua-doi-tap-moi-nhat"'), 'HTML links to episode programmatic page');
      assert.ok(html.includes('href="/phim-giong-100-ngay-lua-doi"'), 'HTML links to similar programmatic page');

      // Dynamic non-CSV pattern route (-thuyet-minh)
      const dynRes = await fetch(`http://127.0.0.1:${port}/100-ngay-lua-doi-thuyet-minh`);
      assert.strictEqual(dynRes.status, 200);
      const dynHtml = await dynRes.text();
      assert.ok(dynHtml.includes('Thuyết Minh &amp; Song Ngữ'));
      assert.ok(dynHtml.includes('href="https://cineviet.live/100-ngay-lua-doi-thuyet-minh"'));
    } finally {
      server.close();
    }
  });
});
