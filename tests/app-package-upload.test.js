const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');

const temp = fs.mkdtempSync(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), 'pkg-upload-'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_PATH: path.join(temp, 'db.json'),
  DATABASE_URL: '',
  PUBLIC_ORIGIN: '',
  ALLOWED_ORIGINS: '',
  REQUIRE_ADMIN_MFA: 'false',
  REQUIRE_VERIFIED_EMAIL: 'false'
});

for (const [name, exports] of Object.entries({
  kkphimService: { getHomeData: async () => ({}), getMovieDetail: async () => ({}), getCategoriesAndCountries: async () => ({}), getCatalog: async () => ({ items: [], pagination: {} }), clearHomeCache() {} },
  vicdnService: { hasBilingualMatch: () => false },
  tmdbService: {},
  personService: {}
})) {
  const id = require.resolve('../src/services/' + name);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const { app } = require('../src/server');
const db = require('../src/services/dbService');
let server, base, adminCookie, guestCookie;

before(async () => {
  await db.getRawDatabase();
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;

  // Create admin user
  const adminRes = await fetch(base + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin-pkg@qa.test', password: 'admin-password-123', name: 'AdminPkg' })
  });
  const adminData = await adminRes.json();
  assert.equal(adminData.status, true);
  adminCookie = adminRes.headers.get('set-cookie').split(';')[0];

  // Elevate to admin
  const rawDb = await db.read();
  const user = rawDb.users.find(u => u.email === 'admin-pkg@qa.test');
  user.role = 'admin';
  await db.write(rawDb);

  // Normal user
  const guestRes = await fetch(base + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user-pkg@qa.test', password: 'user-password-123', name: 'UserPkg' })
  });
  guestCookie = guestRes.headers.get('set-cookie').split(';')[0];
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  await db.close();
  fs.rmSync(temp, { recursive: true, force: true });
});

test('upload-app-package rejects unauthenticated or non-admin users', async () => {
  const unauth = await fetch(base + '/api/admin/upload-app-package?type=apk_mobile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from('FAKE')
  });
  assert.equal(unauth.status, 401);

  const nonAdmin = await fetch(base + '/api/admin/upload-app-package?type=apk_mobile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cookie': guestCookie
    },
    body: Buffer.from('FAKE')
  });
  assert.equal(nonAdmin.status, 403);
});

test('upload-app-package validates file extension strictly', async () => {
  const badExt = await fetch(base + '/api/admin/upload-app-package?type=apk_mobile&filename=malicious.exe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cookie': adminCookie
    },
    body: Buffer.from('FAKE')
  });
  assert.equal(badExt.status, 400);

  const badIos = await fetch(base + '/api/admin/upload-app-package?type=ios&filename=wrong.apk', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cookie': adminCookie
    },
    body: Buffer.from('FAKE')
  });
  assert.equal(badIos.status, 400);
});

test('upload-app-package streams APK and IPA files directly to public/downloads', async () => {
  const apkPayload = Buffer.from('APK_BINARY_TEST_DATA_HELLO_WORLD');
  const apkRes = await fetch(base + '/api/admin/upload-app-package?type=apk_mobile&filename=my-test-app.apk', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cookie': adminCookie
    },
    body: apkPayload
  });
  assert.equal(apkRes.status, 200);
  const apkJson = await apkRes.json();
  assert.equal(apkJson.status, true);
  assert.equal(apkJson.data.filename, 'my-test-app.apk');
  assert.equal(apkJson.data.url, '/downloads/my-test-app.apk');

  // Verify file saved on disk
  const savedApk = path.join(__dirname, '../public/downloads/my-test-app.apk');
  assert.ok(fs.existsSync(savedApk));
  assert.equal(fs.readFileSync(savedApk, 'utf8'), 'APK_BINARY_TEST_DATA_HELLO_WORLD');
  fs.unlinkSync(savedApk);

  // Test IPA upload
  const ipaPayload = Buffer.from('IPA_BINARY_TEST_DATA_HELLO_IOS');
  const ipaRes = await fetch(base + '/api/admin/upload-app-package?type=ios&filename=my-ios-app.ipa', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cookie': adminCookie
    },
    body: ipaPayload
  });
  assert.equal(ipaRes.status, 200);
  const ipaJson = await ipaRes.json();
  assert.equal(ipaJson.status, true);
  assert.equal(ipaJson.data.filename, 'my-ios-app.ipa');
  assert.equal(ipaJson.data.url, '/downloads/my-ios-app.ipa');

  const savedIpa = path.join(__dirname, '../public/downloads/my-ios-app.ipa');
  assert.ok(fs.existsSync(savedIpa));
  assert.equal(fs.readFileSync(savedIpa, 'utf8'), 'IPA_BINARY_TEST_DATA_HELLO_IOS');
  fs.unlinkSync(savedIpa);
});
