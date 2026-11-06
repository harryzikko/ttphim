const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const dbService = require('../src/services/dbService');

describe('Donations Management & RutXu Claim', () => {
  const testRef = 'RXTEST_UNIT_' + Date.now();
  let createdDonationId = null;

  test('dbService.recordDonation saves a new donation and retrieves it via getDonations', async () => {
    const record = await dbService.recordDonation({
      ref: testRef,
      user_id: 'vip_user_test_123',
      days_left: 30,
      max_ips: 2,
      already_claimed: false,
      client_ip: '127.0.0.1',
      status: 'success'
    });

    assert.ok(record);
    assert.strictEqual(record.ref, testRef);
    assert.strictEqual(record.user_id, 'vip_user_test_123');
    assert.strictEqual(record.days_left, 30);
    createdDonationId = record.id;

    const list = await dbService.getDonations();
    const found = list.find(d => d.ref === testRef);
    assert.ok(found, 'Donation should exist in getDonations()');
    assert.strictEqual(found.id, createdDonationId);
  });

  test('dbService.recordDonation updates existing donation when called with same ref', async () => {
    const updated = await dbService.recordDonation({
      ref: testRef,
      user_id: 'vip_user_updated',
      days_left: 60,
      max_ips: 3,
      already_claimed: true
    });

    assert.ok(updated);
    assert.strictEqual(updated.ref, testRef);
    assert.strictEqual(updated.user_id, 'vip_user_updated');
    assert.strictEqual(updated.days_left, 60);
    assert.strictEqual(updated.already_claimed, true);
  });

  test('getAdminStats includes totalDonations', async () => {
    const stats = await dbService.getAdminStats();
    assert.ok(typeof stats.totalDonations === 'number');
    assert.ok(stats.totalDonations >= 1);
  });

  test('dbService.deleteDonation cleans up donation record', async () => {
    if (createdDonationId) {
      const ok = await dbService.deleteDonation(createdDonationId);
      assert.strictEqual(ok, true);

      const list = await dbService.getDonations();
      const found = list.find(d => d.id === createdDonationId);
      assert.strictEqual(found, undefined, 'Deleted donation should not exist in list');
    }
  });

  test('ung-ho.html contains the new wallet address and calls /api/donate/claim', () => {
    const fs = require('fs');
    const html = fs.readFileSync('public/ung-ho.html', 'utf8');
    assert.ok(html.includes('0x098f7e6accdad2c9897766bb40b5cd28701ca2a3'), 'Must contain new wallet address');
    assert.ok(html.includes('/api/donate/claim'), 'Must call /api/donate/claim');
    assert.ok(!html.includes('0x76e2416910ad277519d63ce932497F93207B5A97'), 'Must not contain old wallet address');
  });

  test('admin.html and admin.js include tab-donations', () => {
    const fs = require('fs');
    const adminHtml = fs.readFileSync('public/admin.html', 'utf8');
    const adminJs = fs.readFileSync('public/js/admin.js', 'utf8');
    const apiJs = fs.readFileSync('public/js/api.js', 'utf8');

    assert.ok(adminHtml.includes('data-tab="tab-donations"'), 'admin.html must have tab-donations nav button');
    assert.ok(adminHtml.includes('id="tab-donations"'), 'admin.html must have tab-donations section');
    assert.ok(adminHtml.includes('id="donations-table-body"'), 'admin.html must have donations table body');

    assert.ok(adminJs.includes('loadDonationsTab'), 'admin.js must have loadDonationsTab function');
    assert.ok(apiJs.includes('getAdminDonations'), 'api.js must have getAdminDonations method');
  });
});
