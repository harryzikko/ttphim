const fs = require('fs/promises');
const path = require('path');
const { PostgresStore } = require('../src/services/postgresStore');
const { validateDatabase } = require('../src/services/dbSchema');
async function migrate(source, connectionString = process.env.DATABASE_URL) {
  if (!source || !path.isAbsolute(source)) throw new Error('Provide an absolute source JSON backup path');
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const data = validateDatabase(JSON.parse(await fs.readFile(source, 'utf8')));
  const store = new PostgresStore(connectionString);
  try {
    await store.provision(data);
    const copied = validateDatabase(await store.read());
    if (!require('util').isDeepStrictEqual(copied, data)) throw new Error('Migration verification failed');
    console.log(JSON.stringify({ migrated: true, users: copied.users.length, comments: copied.comments.length, history: copied.history.length, source_preserved: true }));
  } finally { await store.close(); }
}
if (require.main === module) migrate(process.argv[2]).catch(() => { console.error('Migration failed; check source schema, destination connectivity and empty-state requirement. Source is unchanged.'); process.exitCode = 1; });
module.exports = { migrate };
