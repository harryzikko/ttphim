const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
// Use the same bundled prefixer/minifier as the installed Tailwind CLI, without downloads.
const { loadAutoprefixer, loadCssNano } = require('tailwindcss/lib/cli/build/deps');

const root = path.resolve(__dirname, '..');
const themesFile = 'scripts/site-tailwind.themes.json';
const assignment = /\btailwind\s*\.\s*config\s*=/;
const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const runtimeCdn = /\bsrc\s*=\s*["']https?:\/\/cdn\.tailwindcss\.com(?:[/?][^"']*)?["']/i;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 12);

function filesUnder(directory, extension) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true })
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    .flatMap(entry => entry.isDirectory() ? filesUnder(`${directory}/${entry.name}`, extension)
      : entry.isFile() && entry.name.endsWith(extension) ? [`${directory}/${entry.name}`] : []);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

// Parse only data literals, never eval/vm/require HTML-supplied JavaScript. Supports
// existing unquoted keys, single quotes, comments and trailing commas; rejects code.
function parseConfig(source) {
  let i = 0;
  const fail = () => { throw Error(`Unsafe or unsupported Tailwind config literal at offset ${i}`); };
  function skip() {
    while (i < source.length) {
      if (/\s/.test(source[i])) { i++; continue; }
      if (source.startsWith('//', i)) { const end = source.indexOf('\n', i + 2); i = end < 0 ? source.length : end; continue; }
      if (source.startsWith('/*', i)) { const end = source.indexOf('*/', i + 2); if (end < 0) fail(); i = end + 2; continue; }
      break;
    }
  }
  function string() {
    const quote = source[i++];
    let result = '';
    while (i < source.length) {
      const char = source[i++];
      if (char === quote) return result;
      if (char === '\n' || char === '\r') fail();
      if (char !== '\\') { result += char; continue; }
      const escaped = source[i++];
      const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '/': '/' };
      if (Object.hasOwn(escapes, escaped)) result += escapes[escaped];
      else if (escaped === 'u' || escaped === 'x') {
        const length = escaped === 'u' ? 4 : 2;
        const digits = source.slice(i, i + length);
        if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(digits)) fail();
        result += String.fromCharCode(parseInt(digits, 16)); i += length;
      } else fail();
    }
    fail();
  }
  function value(depth = 0) {
    if (depth > 50) fail();
    skip();
    if (source[i] === '"' || source[i] === "'") return string();
    const object = source[i] === '{';
    if (object || source[i] === '[') {
      const result = object ? {} : [];
      const close = object ? '}' : ']';
      i++; skip();
      while (source[i] !== close) {
        if (object) {
          let key;
          if (source[i] === '"' || source[i] === "'") key = string();
          else { const match = source.slice(i).match(/^[A-Za-z_$][\w$]*/); if (!match) fail(); key = match[0]; i += key.length; }
          if (['__proto__', 'constructor', 'prototype'].includes(key) || Object.hasOwn(result, key)) fail();
          skip(); if (source[i++] !== ':') fail();
          result[key] = value(depth + 1);
        } else result.push(value(depth + 1));
        skip();
        if (source[i] === close) break;
        if (source[i++] !== ',') fail();
        skip();
      }
      i++; return result;
    }
    const match = source.slice(i).match(/^(?:true\b|false\b|null\b|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/);
    if (!match) fail();
    i += match[0].length;
    return JSON.parse(match[0]);
  }
  skip();
  const prefix = source.slice(i).match(/^tailwind\s*\.\s*config\s*=/);
  if (!prefix) fail();
  i += prefix[0].length;
  const config = value();
  skip(); if (source[i] === ';') i++;
  skip(); if (i !== source.length || !config || Array.isArray(config) || typeof config !== 'object') fail();
  if (Object.keys(config).some(key => !['darkMode', 'theme', 'safelist', 'corePlugins', 'important', 'prefix', 'separator'].includes(key))) fail();
  return canonical(config);
}

function extractRuntime(html, file) {
  const configs = [];
  let cdns = 0;
  const stripped = html.replace(scriptPattern, (script, attrs, body) => {
    if (runtimeCdn.test(attrs)) { cdns++; return ''; }
    if (!assignment.test(body)) return script;
    if (/\btype\s*=\s*["']application\/json["']/i.test(attrs)) return script;
    try { configs.push(parseConfig(body)); } catch (error) { throw Error(`${file}: ${error.message}`); }
    return '';
  });
  if (configs.length > 1 || cdns > 1 || (cdns && configs.length !== 1) || (configs.length && !cdns)) {
    throw Error(`${file}: expected exactly one runtime CDN and one data-only Tailwind config`);
  }
  return { stripped, config: configs[0], runtime: cdns > 0 };
}

function cssLink(file, version) {
  return `<link rel="stylesheet" href="/css/${file}?v=${version}">`;
}

async function build({ check = false, quiet = false } = {}) {
  const previous = fs.existsSync(path.join(root, themesFile)) ? JSON.parse(read(themesFile)) : { version: 1, pages: {}, themes: {} };
  if (previous.version !== 1) throw Error('Unsupported site CSS theme manifest version');
  const manifest = structuredClone(previous);
  const htmlFiles = filesUnder('public', '.html');
  const pages = new Map();
  for (const file of htmlFiles) {
    const html = read(file);
    const extracted = extractRuntime(html, file);
    if (extracted.runtime) {
      const key = hash(JSON.stringify(extracted.config));
      manifest.themes[key] = extracted.config;
      manifest.pages[file] = key;
    }
    if (manifest.pages[file]) pages.set(file, { html, ...extracted });
  }
  for (const file of Object.keys(manifest.pages)) {
    if (!pages.has(file)) throw Error(`Missing site CSS page: ${file}`);
    if (!manifest.themes[manifest.pages[file]]) throw Error(`Missing saved theme for ${file}`);
  }
  // All client controllers are included: shared UI can be injected on any page.
  // Literal conditional class strings and arbitrary values are extracted by Tailwind.
  const shared = filesUnder('public', '.js').map(file => ({ raw: read(file), extension: 'js' }));
  shared.push({ raw: read('src/services/templateService.js'), extension: 'js' });
  const input = read('scripts/site-tailwind.css');
  const outputs = [];
  const assets = [];
  const activeThemes = [...new Set(Object.values(manifest.pages))].sort();
  for (const key of activeThemes) {
    const group = [...pages].filter(([file]) => manifest.pages[file] === key);
    const content = [...shared, ...group.map(([, page]) => ({ raw: page.stripped, extension: 'html' }))];
    const result = await postcss([tailwind({ ...manifest.themes[key], content }), loadAutoprefixer(), loadCssNano()])
      .process(input, { from: path.join(root, 'scripts/site-tailwind.css'), map: false });
    const css = result.css + '\n';
    const filename = `site-${key}.css`;
    const version = hash(css);
    outputs.push({ file: `public/css/${filename}`, content: css });
    assets.push({ file: `public/css/${filename}`, bytes: Buffer.byteLength(css), pages: group.map(([file]) => file) });
    for (const [file, page] of group) {
      const link = cssLink(filename, version);
      let html;
      if (page.runtime) {
        // Replace at the original CDN position so existing custom CSS keeps its cascade order.
        html = page.html.replace(scriptPattern, (script, attrs, body) => runtimeCdn.test(attrs) ? link
          : assignment.test(body) && !/\btype\s*=\s*["']application\/json["']/i.test(attrs) ? '' : script);
      } else {
        let count = 0;
        html = page.html.replace(/<link\b[^>]*\bhref=["']\/css\/site-[a-f0-9]+\.css\?v=[^"']+["'][^>]*>/gi, () => { count++; return link; });
        if (count !== 1) throw Error(`${file}: expected exactly one generated site CSS link`);
      }
      outputs.push({ file, content: html });
    }
  }
  outputs.push({ file: themesFile, content: JSON.stringify(canonical(manifest), null, 2) + '\n' });
  const changed = outputs.filter(output => !fs.existsSync(path.join(root, output.file)) || read(output.file) !== output.content);
  if (!check) for (const output of changed) fs.writeFileSync(path.join(root, output.file), output.content, 'utf8');
  if (!quiet) {
    for (const asset of assets) console.log(`${asset.file}: ${asset.bytes} bytes (${asset.pages.length} pages)`);
    console.log(check ? changed.length ? `STALE: ${changed.map(output => output.file).join(', ')}` : 'Site CSS is current.'
      : `Built ${assets.length} themes for ${pages.size} pages; updated ${changed.length} files.`);
  }
  return { changed: changed.map(output => output.file), assets };
}

if (require.main === module) {
  if (process.argv.slice(2).some(arg => arg !== '--check')) {
    console.error('Usage: node scripts/build-site-css.cjs [--check]'); process.exitCode = 1;
  } else build({ check: process.argv.includes('--check') }).then(result => {
    if (process.argv.includes('--check') && result.changed.length) process.exitCode = 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { build, parseConfig, extractRuntime, filesUnder };
