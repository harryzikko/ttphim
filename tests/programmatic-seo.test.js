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

  test('GET /robots.txt includes sitemap-programmatic.xml', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/robots.txt`);
      assert.strictEqual(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('Sitemap: https://cineviet.live/sitemap.xml'), 'Includes main sitemap');
      assert.ok(text.includes('Sitemap: https://cineviet.live/sitemap-programmatic.xml'), 'Includes programmatic sitemap');
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

  test('GET /top-phim-ai-2026 redirects 301 to category search', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/top-phim-ai-2026`, { redirect: 'manual' });
      assert.strictEqual(res.status, 301);
      assert.ok(res.headers.get('location').includes('/kham-pha?category='));
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

  test('GET /100-ngay-lua-doi-vietsub serves movie page with programmatic SEO metadata', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/100-ngay-lua-doi-vietsub`);
      assert.strictEqual(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('<title>Xem 100 Ngày Lừa Dối (2026) Vietsub Full HD | CineViet</title>'), 'HTML contains programmatic title');
      assert.ok(html.includes('content="Xem phim 100 Ngày Lừa Dối (2026) vietsub full HD'), 'HTML contains programmatic description');
      assert.ok(html.includes('href="https://cineviet.live/100-ngay-lua-doi-vietsub"'), 'HTML contains programmatic canonical link');
    } finally {
      server.close();
    }
  });
});
