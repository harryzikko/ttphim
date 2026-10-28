const { spawnSync } = require('child_process');
const path = require('path');
const result = spawnSync(process.execPath, ['--test', path.join(__dirname, '../tests/security-e2e.test.js')], {
  stdio: 'inherit', env: { ...process.env, SECURITY_E2E: '1' }, timeout: 120000
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
