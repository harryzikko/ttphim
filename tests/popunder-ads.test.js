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
