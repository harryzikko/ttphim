const https = require('https');

const runId = process.argv[2] || '40702920109';
https.get(`https://github.com/harryzikko/ttphim/actions/runs/${runId}`, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
  }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    // Check for artifacts
    const artifactRegex = new RegExp(`href="/harryzikko/ttphim/actions/runs/${runId}/artifacts/(\\d+)"[^>]*>([\\s\\S]*?)</a>`, 'g');
    let m;
    const artifacts = [];
    while ((m = artifactRegex.exec(d)) !== null) {
      artifacts.push({ id: m[1], name: m[2].replace(/<[^>]+>/g, '').trim() });
    }
    console.log('Artifacts:', artifacts);

    // Check for annotations
    const annMatches = d.match(/<strong>(.*?)<\/strong>[\s\S]*?<div[^>]*data-target="annotation-message.annotationContainer"[^>]*>([\s\S]*?)<\/div>/g) || [];
    console.log('Annotation count:', annMatches.length);
    for (const a of annMatches) {
      console.log('Annotation:', a.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 350));
    }
  });
}).on('error', console.error);
