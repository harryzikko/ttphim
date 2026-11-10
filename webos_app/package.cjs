'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = __dirname;
const stage = path.join(root, '.ipk-stage');
const outDir = path.join(root, 'output');

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

for (const item of ['appinfo.json', 'index.html', 'icon.png', 'largeIcon.png', 'splashBackground.png']) {
  fs.cpSync(path.join(root, item), path.join(stage, item));
}

const aresBin = require.resolve('@webos-tools/cli/bin/ares-package.js');
execFileSync(process.execPath, [aresBin, '--no-minify', '-o', outDir, stage], {
  stdio: 'inherit'
});
fs.rmSync(stage, { recursive: true, force: true });
