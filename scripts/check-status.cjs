const https = require('https');

const runId = '40703847460';
https.get(`https://github.com/harryzikko/ttphim/actions/runs/${runId}`, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const idx = d.indexOf('Matrix: build-android');
    if (idx !== -1) {
      console.log(d.slice(idx, idx + 1800).replace(/\s+/g, ' '));
    }
  });
}).on('error', console.error);
