const fs = require('node:fs');
const path = require('node:path');
const { footer, pages, informationPage } = require('./site-content.cjs');
const root = path.join(__dirname, '..');
const targets = ['index', 'kham-pha', 'chi-tiet', 'xem-phim', 'danh-sach', 'tai-khoan', 'dien-vien'].map(name => `public/${name}.html`).concat(['index', 'kham-pha', 'chi-tiet', 'xem-phim', 'danh-sach', 'tai-khoan'].map(name => `public/mobile/${name}.html`));
function updateTemplate(html, mobile) {
  if ((html.match(/<\/head>/gi) || []).length !== 1 || (html.match(/<\/body>/gi) || []).length !== 1) throw Error('Expected exactly one head/body close');
  const matches = [...html.matchAll(/<footer\b[\s\S]*?<\/footer>/gi)];
  if (matches.length > 1) throw Error('Unexpected multiple footers');
  const markup = footer(mobile);
  let next = matches.length ? html.replace(matches[0][0], markup) : html.replace(/<\/body>/i, `${markup}\n</body>`);
  if (!next.includes('/css/site-footer.css?v=1.0.0')) next = next.replace(/<\/head>/i, '<link rel="stylesheet" href="/css/site-footer.css?v=1.0.0">\n</head>');
  if (!next.includes('/js/site-footer.js?v=1.0.0')) next = next.replace(/<\/body>/i, '<script defer src="/js/site-footer.js?v=1.0.0"></script>\n</body>');
  return next;
}
function build(check = false) {
  const outputs = targets.map(file => ({ file, content: updateTemplate(fs.readFileSync(path.join(root, file), 'utf8'), file.includes('/mobile/')) }));
  for (const page of pages) outputs.push({ file: `public/${page.slug}.html`, content: informationPage(page) });
  // Compute every output before writing so invalid template structure aborts the build.
  for (const output of outputs) {
    const destination = path.join(root, output.file);
    const changed = !fs.existsSync(destination) || fs.readFileSync(destination, 'utf8') !== output.content;
    if (!check && changed) fs.writeFileSync(destination, output.content, 'utf8');
    if (require.main === module) console.log(`${changed ? check ? 'WOULD UPDATE' : 'UPDATED' : 'UNCHANGED'} ${output.file}`);
  }
  return outputs;
}
if (require.main === module) build(process.argv.includes('--check'));
module.exports = { targets, updateTemplate, build };
