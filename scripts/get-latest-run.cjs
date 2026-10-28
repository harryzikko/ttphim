const https = require('https');

function getLatestRuns() {
  https.get('https://github.com/harryzikko/ttphim/actions', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      const matches = d.match(/\/harryzikko\/ttphim\/actions\/runs\/\d+/g);
      const unique = [...new Set(matches || [])];
      console.log('Latest run paths:');
      console.log(unique.slice(0, 6));
    });
  }).on('error', console.error);
}

getLatestRuns();
