const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dbService = require('../src/services/dbService');

test('popunder default configuration is present in settings and api', async () => {
  const settings = await dbService.getSettings();
  assert.ok(settings.popunder_ads, 'popunder_ads exists in settings');
  assert.equal(settings.popunder_ads.enabled, true);
  assert.equal(settings.popunder_ads.clocid, '2119458');
  assert.equal(settings.popunder_ads.frequency_minutes, 30);
});

test('popunder configuration can be toggled and updated by admin', async () => {
  const original = (await dbService.getSettings()).popunder_ads;

  await dbService.updateSettings({
    popunder_ads: {
      ...original,
      enabled: false,
      frequency_minutes: 60,
      clocid: '1234567'
    }
  });

  const updated = (await dbService.getSettings()).popunder_ads;
  assert.equal(updated.enabled, false);
  assert.equal(updated.frequency_minutes, 60);
  assert.equal(updated.clocid, '1234567');

  // Restore original
  await dbService.updateSettings({ popunder_ads: original });
  const restored = (await dbService.getSettings()).popunder_ads;
  assert.equal(restored.enabled, true);
  assert.equal(restored.clocid, '2119458');
  assert.equal(restored.frequency_minutes, 30);
});

test('popunder.js gatekeepers exclude Smart TV and Desktop App', () => {
  const code = fs.readFileSync('public/js/popunder.js', 'utf8');

  // 1. Test webOS TV exclusion
  const domTv = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://cineviet.live/?platform=webos',
    runScripts: 'outside-only'
  });
  domTv.window.webOS = { platformBack: () => {} };
  domTv.window.eval(code);
  assert.equal(domTv.window.__CINEVIET_CLICKADU_INITIALIZED__, undefined, 'webOS TV must not initialize popunder');

  // 2. Test Tauri Desktop App exclusion
  const domDesktop = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://cineviet.live/',
    runScripts: 'outside-only'
  });
  domDesktop.window.__TAURI__ = {};
  domDesktop.window.eval(code);
  assert.equal(domDesktop.window.__CINEVIET_CLICKADU_INITIALIZED__, undefined, 'Tauri desktop app must not initialize popunder');
});

test('header.js loads popunder.js asynchronously', () => {
  const headerJs = fs.readFileSync('public/js/header.js', 'utf8');
  assert.ok(headerJs.includes('popunder.js'), 'header.js must reference popunder.js');
  assert.ok(headerJs.includes('initPopunderScript'), 'header.js must call initPopunderScript');
});

test('admin.html has popunder-on-close toggle, popunder-href input and fresh script versions', () => {
  const adminHtml = fs.readFileSync('public/admin.html', 'utf8');
  assert.ok(adminHtml.includes('id="setting-app-ad-popunder-close"'), 'admin.html must contain setting-app-ad-popunder-close');
  assert.ok(adminHtml.includes('id="setting-app-ad-popunder-href"'), 'admin.html must contain setting-app-ad-popunder-href');
  assert.ok(/admin\.js\?v=(?:2\.9\.8|[3-9]\.\d+\.\d+)/.test(adminHtml), 'admin.js cache version must be >= 2.9.8');
  assert.ok(/api\.js\?v=(?:3\.6\.7|[3-9]\.[7-9]\.\d+|[4-9]\.\d+\.\d+)/.test(adminHtml), 'api.js cache version must be >= 3.6.7');
  assert.ok(adminHtml.includes('analytics-popunder-today'), 'admin.html must contain analytics popunder widget');
});

test('dbService tracks popunder clicks and returns aggregated metrics', async () => {
  const dbService = require('../src/services/dbService');
  await dbService.recordPopunderClick({ platform: 'desktop', path: '/phim/test', ip: '113.161.12.34' });
  await dbService.recordPopunderClick({ platform: 'mobile_app', path: '/app-banner-close', ip: '14.162.55.77' });
  const stats = await dbService.getPopunderStats();
  assert.ok(stats.total_clicks >= 2, 'Total clicks should increment');
  assert.ok(stats.today_clicks >= 2, 'Today clicks should increment');
  assert.ok(stats.by_platform.desktop >= 1, 'Desktop clicks recorded');
  assert.ok(stats.by_platform.mobile_app >= 1, 'Mobile app clicks recorded');
  assert.ok(stats.recent_clicks.length >= 2, 'Recent clicks logged');
  assert.ok(stats.recent_clicks[0].ip.includes('***'), 'IP must be anonymized');
});
