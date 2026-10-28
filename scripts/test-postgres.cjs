const { spawnSync } = require('child_process');
const path = require('path');
if (!process.env.TEST_DATABASE_URL) {
  console.error('Set TEST_DATABASE_URL to an isolated PostgreSQL test service with CREATE DATABASE permission. Never use production credentials.');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, ['--test', path.join(__dirname, '../tests/postgres.test.js')], { stdio: 'inherit', env: process.env, timeout: 120000 });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
