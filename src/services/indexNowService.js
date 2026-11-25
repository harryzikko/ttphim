const INDEXNOW_KEY = process.env.INDEXNOW_KEY || 'c4b189a6230f4e1981d9f485e921d7bf';
const HOST = 'cineviet.live';
const ORIGIN = `https://${HOST}`;

class IndexNowService {
  constructor() {
    this.pushedAt = new Map();
    this.maxTracked = 10000;
    this.cooldownMs = 12 * 60 * 60 * 1000;
  }

  expandMovieUrls(slugs = []) {
    const urls = [];
    const seen = new Set();
    for (const raw of slugs) {
      const slug = String(raw || '').trim().toLowerCase();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) continue;
      const variants = [
        `${ORIGIN}/phim/${slug}`,
        `${ORIGIN}/${slug}-vietsub`,
        `${ORIGIN}/${slug}-tap-moi-nhat`,
        `${ORIGIN}/${slug}-thuyet-minh`,
        `${ORIGIN}/phim-giong-${slug}`
      ];
      for (const u of variants) {
        if (!seen.has(u)) {
          seen.add(u);
          urls.push(u);
        }
      }
    }
    return urls;
  }

  async submitUrls(rawUrls = [], { force = false } = {}) {
    const now = Date.now();
    const urlList = [];
    for (const u of rawUrls) {
      if (typeof u !== 'string' || !u.startsWith(ORIGIN + '/')) continue;
      if (!force) {
        const last = this.pushedAt.get(u);
        if (last && now - last < this.cooldownMs) continue;
      }
      urlList.push(u);
    }

    if (urlList.length === 0) {
      return { submitted: 0, status: 200, skipped: rawUrls.length };
    }

    const batch = urlList.slice(0, 9500);
    const payload = {
      host: HOST,
      key: INDEXNOW_KEY,
      keyLocation: `${ORIGIN}/${INDEXNOW_KEY}.txt`,
      urlList: batch
    };

    let primaryStatus = 0;
    let bingStatus = 0;

    try {
      const res = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
      });
      primaryStatus = res.status;
    } catch (_) {}

    try {
      const bRes = await fetch('https://www.bing.com/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000)
      });
      bingStatus = bRes.status;
    } catch (_) {}

    if (primaryStatus === 200 || primaryStatus === 202 || bingStatus === 200 || bingStatus === 202) {
      for (const u of batch) {
        if (this.pushedAt.size >= this.maxTracked) {
          const oldest = this.pushedAt.keys().next().value;
          if (oldest) this.pushedAt.delete(oldest);
        }
        this.pushedAt.set(u, now);
      }
    }

    return {
      submitted: batch.length,
      indexnow_status: primaryStatus,
      bing_status: bingStatus
    };
  }

  async submitMovieSlugs(slugs = [], options = {}) {
    const urls = this.expandMovieUrls(slugs);
    return this.submitUrls(urls, options);
  }
}

module.exports = new IndexNowService();
