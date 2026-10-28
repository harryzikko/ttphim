// Explicit opt-in: ordinary `npm test` never launches a browser.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, ['--test', path.join(__dirname, '../tests/player-e2e.test.js')], {
  stdio: 'inherit', env: { ...process.env, PLAYER_E2E: '1' }, timeout: 180000
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
