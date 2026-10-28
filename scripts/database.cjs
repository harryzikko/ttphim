const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const db = require('../src/services/dbService');

const { validateDatabase } = require('../src/services/dbSchema');
async function run(command, filename) {
  if (!['backup', 'verify'].includes(command) || !filename) throw new Error('Usage: node scripts/database.cjs backup|verify ABSOLUTE_PATH');
  if (!path.isAbsolute(filename)) throw new Error('Use an absolute backup path outside the checkout');
  const target = path.resolve(filename);
  const root = path.resolve(__dirname, '..');
  const relative = path.relative(root, target);
  if (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw new Error('Backups must be outside the checkout');
  let text;
  if (command === 'backup') {
    const snapshot = validateDatabase(await db.getRawDatabase());
    text = JSON.stringify(snapshot, null, 2);
    await fs.writeFile(target, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  } else {
    text = await fs.readFile(target, 'utf8');
    validateDatabase(JSON.parse(text));
  }
  console.log(JSON.stringify({ command, path: target, sha256: crypto.createHash('sha256').update(text).digest('hex'), valid: true }));
}

if (require.main === module) run(process.argv[2], process.argv[3]).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
module.exports = { run, validateDatabase };
