const { spawnSync } = require('child_process');
const path = require('path');
const root = path.resolve(__dirname, '..');
const cli = require.resolve('tailwindcss/lib/cli.js');
const result = spawnSync(process.execPath, [cli, '-c', 'scripts/home-tailwind.config.cjs', '-i', 'scripts/home-tailwind.css', '-o', 'public/css/mobile-home-tailwind.css', '--minify'], {
  cwd: root,
  env: { ...process.env, HOME_CSS_TARGET: 'mobile' },
  stdio: 'inherit'
});
if (result.error) throw result.error;
process.exitCode = result.status || 0;
