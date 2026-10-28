const https = require('https');

const runId = process.argv[2] || '40701928158';
https.get(`https://github.com/harryzikko/ttphim/actions/runs/${runId}`, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  }
}, res => {
  let html = '';
  res.on('data', c => html += c);
  res.on('end', () => {
    // Print all annotations
    const regex = /<strong>(.*?)<\/strong>[\s\S]*?<div[^>]*data-target="annotation-message.annotationContainer"[^>]*>([\s\S]*?)<\/div>/g;
    let m;
    let found = 0;
    while ((m = regex.exec(html)) !== null) {
      found++;
      const title = m[1].replace(/<[^>]+>/g, '').trim();
      const content = m[2].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
      console.log(`[ANNOTATION ${found}] [${title}] => ${content}`);
    }
    if (found === 0) {
      console.log('No annotations yet, jobs may be running or queued.');
    }
  });
}).on('error', console.error);
