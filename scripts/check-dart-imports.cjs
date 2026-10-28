const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) results = results.concat(getFiles(file));
    else if (file.endsWith('.dart')) results.push(file);
  });
  return results;
}

const files = getFiles('mobile_app/lib');
let missing = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    const m = line.match(/import\s+['"]package:ttphim\/([^'"]+)['"]/);
    if (m) {
      const rel = m[1];
      const target = path.join('mobile_app/lib', rel);
      if (!fs.existsSync(target)) {
        console.error('MISSING IMPORT in', file, '->', target);
        missing++;
      }
    }
  }
}
console.log('Checked', files.length, 'Dart files. Missing internal imports:', missing);
