const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dbService = require('../src/services/dbService');

test('popup banner default configuration is present and configurable', async () => {
  const settings = await dbService.getSettings();
  assert.ok(settings.popup_banner, 'popup_banner exists in settings');
  assert.equal(settings.popup_banner.href, 'https://sandeal.dealpulse.vn/');
  assert.equal(settings.popup_banner.image, '/images/banners/dealpulse-popup.png');
  assert.equal(settings.popup_banner.cooldown_hours, 12);
});

test('popup banner settings can be toggled and updated by admin', async () => {
  const original = (await dbService.getSettings()).popup_banner;

  await dbService.updateSettings({
    popup_banner: {
      ...original,
      enabled: false,
      cooldown_hours: 24
    }
  });

  const updated = (await dbService.getSettings()).popup_banner;
  assert.equal(updated.enabled, false);
  assert.equal(updated.cooldown_hours, 24);

  // Restore
  await dbService.updateSettings({ popup_banner: original });
  const restored = (await dbService.getSettings()).popup_banner;
  assert.equal(restored.enabled, true);
  assert.equal(restored.cooldown_hours, 12);
});

test('client displays popup banner on first visit, adheres to 12h cooldown, and dismisses on close', async () => {
  const editorialJs = fs.readFileSync('public/js/editorial.js', 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body class="editorial-home"><main></main></body></html>', {
    url: 'http://localhost:3001/',
    runScripts: 'dangerously'
  });
  const { window } = dom;

  window.fetch = async (url) => {
    if (url === '/api/popup-banner') {
      return {
        ok: true,
        json: async () => ({
          status: true,
          data: {
            enabled: true,
            title: 'ĐẠI TIỆC SĂN DEAL SHOPEE MALL',
            image: '/images/banners/dealpulse-popup.png',
            href: 'https://sandeal.dealpulse.vn/',
            cooldown_hours: 12,
            new_tab: true
          }
        })
      };
    }
    return { ok: false };
  };

  window.eval(editorialJs);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise(r => setTimeout(r, 700));

  const overlay1 = window.document.querySelector('.ad-popup-overlay');
  assert.ok(overlay1, 'Popup appears on first visit');
  const ts1 = window.localStorage.getItem('cineviet_popup_ad_last_shown');
  assert.ok(ts1, 'Timestamp saved in localStorage');

  overlay1.querySelector('.ad-popup-close').click();
  await new Promise(r => setTimeout(r, 350));
  assert.equal(window.document.querySelector('.ad-popup-overlay'), null, 'Popup removed on close');

  // Second visit within 12h -> should NOT appear
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise(r => setTimeout(r, 700));
  assert.equal(window.document.querySelector('.ad-popup-overlay'), null, 'Popup does not appear within 12h cooldown');

  // After 12h elapsed -> should appear
  const thirteenHoursAgo = Date.now() - (13 * 60 * 60 * 1000);
  window.localStorage.setItem('cineviet_popup_ad_last_shown', String(thirteenHoursAgo));
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await new Promise(r => setTimeout(r, 700));
  assert.ok(window.document.querySelector('.ad-popup-overlay'), 'Popup appears again after 12h elapsed');

  dom.window.close();
});
