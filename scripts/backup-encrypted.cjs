const fs = require('fs/promises');
const path = require('path');
const { run, decrypt, keyFromEnvironment, validateDirectory } = require('../src/services/backupService');
const db = require('../src/services/dbService');
async function main(command, source, destination) {
  try {
    if (command === 'create') { console.log(JSON.stringify(await run())); return; }
    if (!['verify', 'extract'].includes(command) || !source || !path.isAbsolute(source)) throw new Error('Usage: backup-encrypted.cjs create | verify ABSOLUTE_BACKUP | extract ABSOLUTE_BACKUP ABSOLUTE_NEW_JSON');
    const snapshot = decrypt(await fs.readFile(source, 'utf8'), keyFromEnvironment());
    if (command === 'extract') {
      if (process.env.CONFIRM_BACKUP_EXTRACT !== 'yes') throw new Error('Set CONFIRM_BACKUP_EXTRACT=yes; output is a new file, never a live restore');
      if (!destination || !path.isAbsolute(destination)) throw new Error('Provide an absolute NEW output file path');
      const directory = await validateDirectory(path.dirname(destination));
      await fs.writeFile(path.join(directory, path.basename(destination)), JSON.stringify(snapshot, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    }
    console.log(JSON.stringify({ verified: true, extracted: command === 'extract', users: snapshot.users.length }));
  } finally { await db.close(); }
}
if (require.main === module) main(...process.argv.slice(2)).catch(() => { console.error('Backup operation failed; check configuration, encryption key and exclusive output path. No live database was replaced.'); process.exitCode = 1; });
module.exports = { main };
