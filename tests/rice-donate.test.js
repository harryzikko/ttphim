const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Cứu tui chén cơm - donate button and support page are well configured', () => {
  const root = path.resolve(__dirname, '..');

  // 1. Check ung-ho.html exists and links to noza.site
  const supportHtml = fs.readFileSync(path.join(root, 'public/ung-ho.html'), 'utf8');
  assert.ok(supportHtml.includes('https://noza.site'), 'ung-ho.html must link to https://noza.site');
  assert.ok(supportHtml.includes('Cứu Tui Chén Cơm'), 'ung-ho.html must include Cứu Tui Chén Cơm title');
  assert.ok(supportHtml.includes('btn-rice-donate'), 'ung-ho.html header should also include donate button');

  // 2. Check viewRoutes.js has route for /ung-ho and /cuu-tui-chen-com
  const viewRoutes = fs.readFileSync(path.join(root, 'src/routes/viewRoutes.js'), 'utf8');
  assert.ok(viewRoutes.includes('/ung-ho'), 'viewRoutes must handle /ung-ho');
  assert.ok(viewRoutes.includes('/cuu-tui-chen-com'), 'viewRoutes must handle /cuu-tui-chen-com');

  // 3. Check custom.css has styles for .btn-rice-donate
  const customCss = fs.readFileSync(path.join(root, 'public/css/custom.css'), 'utf8');
  assert.ok(customCss.includes('.btn-rice-donate'), 'custom.css must style .btn-rice-donate');

  // 4. Check main pages have the button
  const pagesToCheck = [
    'public/index.html',
    'public/xem-phim.html',
    'public/chi-tiet.html',
    'public/kham-pha.html',
    'public/danh-sach.html',
    'public/tai-khoan.html'
  ];

  for (const page of pagesToCheck) {
    const content = fs.readFileSync(path.join(root, page), 'utf8');
    assert.ok(content.includes('btn-rice-donate'), `${page} must contain .btn-rice-donate button`);
    assert.ok(content.includes('href="/ung-ho"'), `${page} button must link to /ung-ho`);
  }
});
