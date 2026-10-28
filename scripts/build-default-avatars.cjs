'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const variants = [
  { id: 'vietnam-boy-v1', source: 'vietnam-boy.png' },
  { id: 'vietnam-girl-v1', source: 'vietnam-girl.png' }
];
async function build(check = false) {
  const directory = path.join(__dirname, '../public/images/avatars');
  if (!check) await fs.mkdir(directory, { recursive: true });
  for (const variant of variants) {
    const source = path.join(__dirname, '../assets/avatar-sources', variant.source);
    const expected = await sharp(source).rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 90, effort: 6 }).toBuffer();
    const file = path.join(directory, variant.id + '.webp');
    if (check) {
      const actual = await fs.readFile(file).catch(() => null);
      if (!actual?.equals(expected)) throw Error('Default avatar assets are stale');
    } else await fs.writeFile(file, expected);
  }
  return variants.map(variant => variant.id);
}
if (require.main === module) build(process.argv.includes('--check')).then(ids => console.log(ids.join('\n'))).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { build, variants };
