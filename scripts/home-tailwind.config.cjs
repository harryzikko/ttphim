const fs = require('fs');
const path = require('path');
// Keep both home themes in JSON script tags so the build and browser share one source.

const root = path.resolve(__dirname, '..');
const mobile = process.env.HOME_CSS_TARGET === 'mobile';
const html = fs.readFileSync(path.join(root, mobile ? 'public/mobile/index.html' : 'public/index.html'), 'utf8');
const id = mobile ? 'tailwind-mobile-config' : 'tailwind-config';
const match = html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/script>`));
if (!match) throw new Error(`Missing ${id} theme in home HTML`);
const configText = match[1].trim();
const config = JSON.parse(configText);
module.exports = {
  ...config,
  content: mobile
    ? [path.join(root, 'public/mobile/index.html'), path.join(root, 'public/mobile/js/**/*.js'), path.join(root, 'public/js/editorial.js')]
    : [path.join(root, 'public/index.html'), path.join(root, 'public/js/home.js'), path.join(root, 'public/js/header.js'), path.join(root, 'public/js/editorial.js')]
};
