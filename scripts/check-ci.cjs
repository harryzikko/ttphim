const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Node-CI-Checker' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const runId = process.argv[2] || '40691510963';
  const data = await get(`https://api.github.com/repos/harryzikko/ttphim/actions/runs/${runId}/jobs`);
  if (!data.jobs) {
    console.log('No jobs found or rate limited:', data);
    return;
  }
  for (const j of data.jobs) {
    console.log(`JOB: ${j.name} | Status: ${j.status} | Conclusion: ${j.conclusion}`);
    for (const s of (j.steps || [])) {
      if (s.status !== 'completed' || s.conclusion !== 'success') {
        console.log(`   -> Step: [${s.name}] Status: ${s.status} Conclusion: ${s.conclusion}`);
      }
    }
  }
}

main().catch(console.error);
