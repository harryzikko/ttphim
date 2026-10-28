const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const postcss = require('postcss');
const selectorParser = require('postcss-selector-parser');
const { build, parseConfig, extractRuntime, filesUnder } = require('../scripts/build-site-css.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('scripts/site-tailwind.themes.json'));
const digest = value => createHash('sha256').update(value).digest('hex').slice(0, 12);

function classesFor(file) {
  const key = manifest.pages[file];
  assert.ok(key, `Saved theme for ${file}`);
  const classes = new Set();
  postcss.parse(read(`public/css/site-${key}.css`)).walkRules(rule => {
    selectorParser(selectors => selectors.walkClasses(node => classes.add(node.value))).processSync(rule.selector);
  });
  return classes;
}

test('all public HTML is free of runtime Tailwind CDN and executable config', () => {
  for (const file of filesUnder('public', '.html')) {
    const html = read(file);
    assert.doesNotMatch(html, /cdn\.tailwindcss\.com/i, file);
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      if (/type\s*=\s*["']application\/json["']/i.test(script[1])) continue;
      assert.doesNotMatch(script[2], /\btailwind\s*\.\s*config\s*=/, file);
    }
  }
});

test('every migrated page has one existing content-versioned stylesheet before custom styles', () => {
  assert.equal(Object.keys(manifest.pages).length, 19);
  for (const [file, key] of Object.entries(manifest.pages)) {
    const html = read(file);
    const links = [...html.matchAll(/href="(\/css\/site-[a-f0-9]+\.css)\?v=([a-f0-9]+)"/g)];
    assert.equal(links.length, 1, file);
    assert.equal(links[0][1], `/css/site-${key}.css`, file);
    const css = read(`public${links[0][1]}`);
    assert.equal(links[0][2], digest(css), `CSS cache version for ${file}`);
    const custom = html.search(/href="\/(?:css\/custom|mobile\/css\/mobile)\.css/);
    if (custom !== -1) assert.ok(links[0].index < custom, `Custom cascade for ${file}`);
  }
});

test('generated CSS includes representative arbitrary, responsive, SSR and controller classes', () => {
  for (const [file, expected] of [
    ['public/chi-tiet.html', ['sm:text-[13px]', 'hover:bg-surface-container/60', 'shadow-[0_4px_24px_rgba(229,9,20,0.45)]']],
    ['public/tai-khoan.html', ['ring-primary', 'scale-110', 'hidden']],
    ['public/admin.html', ['bg-success', 'text-error', 'font-display']],
    ['public/mobile/kham-pha.html', ['bg-primary-container', 'bg-surface-container', 'text-white']],
    ['public/tv/index.html', ['w-[700px]', 'blur-[140px]', 'shadow-[0_0_35px_rgba(255,255,255,0.6)]']],
    ['public/auth.html', ['bg-background', 'text-primary-container']],
  ]) {
    const classes = classesFor(file);
    for (const name of expected) assert.ok(classes.has(name), `${file}: ${name}`);
  }
});

test('saved themes preserve distinct fonts, palettes and mobile radii independently of HTML', () => {
  const theme = file => manifest.themes[manifest.pages[file]].theme.extend;
  assert.equal(theme('public/admin.html').colors.primary, '#E50914');
  assert.equal(theme('public/chi-tiet.html').colors.primary, '#ffb4aa');
  assert.deepEqual(theme('public/tai-khoan.html').fontFamily.sans, ['"Plus Jakarta Sans"', 'sans-serif']);
  assert.deepEqual(theme('public/chi-tiet.html').fontFamily['headline-lg'], ['Montserrat']);
  assert.equal(theme('public/mobile/chi-tiet.html').borderRadius.xl, '1rem');
  assert.equal(theme('public/chi-tiet.html').borderRadius.xl, '0.75rem');
  assert.equal(theme('public/tv/index.html').colors.background, '#0B0D13');
});

test('literal config extraction handles syntax without executing JavaScript', () => {
  const parsed = parseConfig(`/* config */ tailwind.config = {darkMode:'class', theme:{extend:{fontFamily:{sans:['"Plus Jakarta Sans"','sans-serif',],},colors:{primary:'#E50914',},},},}; // end`);
  assert.equal(parsed.theme.extend.colors.primary, '#E50914');
  assert.deepEqual(parsed.theme.extend.fontFamily.sans, ['"Plus Jakarta Sans"', 'sans-serif']);
  for (const source of [
    'tailwind.config = {theme: (() => { throw Error("executed"); })()}',
    'tailwind.config = {get theme() { return {}; }}',
    'tailwind.config = {theme: {__proto__: {polluted: true}}}',
    'tailwind.config = {theme: {colors: process.env}}',
    'tailwind.config = {}; process.exit(0);',
    'tailwind.config = {theme: {}, theme: {}}',
  ]) assert.throws(() => parseConfig(source), /Unsafe or unsupported/);
});

test('migration removes only runtime scripts and preserves JSON home config and other HTML', () => {
  const keep = '<style>.x{color:red}</style><script src="/js/controller.js"></script><main class="w-[17px]">unchanged</main>';
  const home = '<script id="tailwind-config" type="application/json">{"theme":{}}</script>';
  const input = '<script src="https://cdn.tailwindcss.com?plugins=forms"></script>' + keep + '<script id="tailwind-config">tailwind.config={darkMode:"class",theme:{}};</script>' + home;
  const result = extractRuntime(input, 'fixture.html');
  assert.equal(result.stripped, keep + home);
  assert.equal(result.runtime, true);
  assert.equal(result.config.darkMode, 'class');
  assert.throws(() => extractRuntime('<script src="https://cdn.tailwindcss.com"></script>', 'bad.html'), /expected exactly one/);
});

test('--check is reproducible, current and read-only after inline configs are removed', async () => {
  const files = ['scripts/site-tailwind.themes.json', ...Object.keys(manifest.pages),
    ...[...new Set(Object.values(manifest.pages))].map(key => `public/css/site-${key}.css`)];
  const snapshot = () => files.map(file => [file, digest(read(file)), fs.statSync(path.join(root, file)).mtimeMs]);
  const before = snapshot();
  const result = await build({ check: true, quiet: true });
  assert.deepEqual(result.changed, [], 'Run npm run build:site-css after changing HTML, controllers or SSR templates');
  assert.deepEqual(snapshot(), before, '--check must not write any asset or HTML');
});
