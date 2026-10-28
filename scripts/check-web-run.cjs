const https = require('https');

const runId = '40700027052';
https.get(`https://github.com/harryzikko/ttphim/actions/runs/${runId}`, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  }
}, res => {
  let html = '';
  res.on('data', c => html += c);
  res.on('end', () => {
    const idx = html.indexOf('build-ios');
    if (idx !== -1) {
      console.log('--- build-ios status in HTML ---');
      console.log(html.slice(idx - 100, idx + 400).replace(/\s+/g, ' '));
    }
  });
}).on('error', console.error);
