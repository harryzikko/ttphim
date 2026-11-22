const fs = require('fs');
const path = require('path');

function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (ch === '\r') {
        // ignore CR
      } else if (ch === '\n') {
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += ch;
      }
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
      rows.push(currentRow);
    }
  }
  return rows;
}

class ProgrammaticService {
  constructor() {
    this.entries = new Map();
    this.loaded = false;
    this.csvPath = null;
  }

  resolveCsvPath() {
    const candidates = [
      process.env.PROGRAMMATIC_CSV_PATH,
      path.resolve(__dirname, '../../cineviet-programmatic-plan.csv'),
      path.resolve(__dirname, '../cineviet-programmatic-plan.csv'),
      path.resolve(__dirname, '../../data/cineviet-programmatic-plan.csv'),
      path.resolve(__dirname, '../data/cineviet-programmatic-plan.csv')
    ].filter(Boolean);

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p;
      } catch (_) {}
    }
    return candidates[1];
  }

  load() {
    if (this.loaded) return this.entries;
    const resolved = this.resolveCsvPath();
    this.csvPath = resolved;

    if (!fs.existsSync(resolved)) {
      console.warn(`[ProgrammaticService] CSV file not found at ${resolved}`);
      this.loaded = true;
      return this.entries;
    }

    try {
      const content = fs.readFileSync(resolved, 'utf8');
      const rows = parseCSV(content);
      if (rows.length < 2) {
        this.loaded = true;
        return this.entries;
      }

      const headers = rows[0].map(h => h.trim().toLowerCase());
      const kindIdx = headers.indexOf('kind');
      const slugIdx = headers.indexOf('url_slug');
      const titleIdx = headers.indexOf('title');
      const h1Idx = headers.indexOf('h1');
      const descIdx = headers.indexOf('meta_description');
      const sourceIdx = headers.indexOf('source');

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const slug = (row[slugIdx] || '').trim();
        if (!slug) continue;

        this.entries.set(slug, {
          kind: (row[kindIdx] || '').trim(),
          url_slug: slug,
          title: (row[titleIdx] || '').trim(),
          h1: (row[h1Idx] || '').trim(),
          meta_description: (row[descIdx] || '').trim(),
          source: (row[sourceIdx] || '').trim()
        });
      }
      this.loaded = true;
      console.log(`[ProgrammaticService] Loaded ${this.entries.size} programmatic routes from ${path.basename(resolved)}`);
    } catch (err) {
      console.error('[ProgrammaticService] Failed to parse CSV:', err.message);
      this.loaded = true;
    }

    return this.entries;
  }

  get(slug) {
    if (!this.loaded) this.load();
    return this.entries.get(slug) || null;
  }

  has(slug) {
    if (!this.loaded) this.load();
    return this.entries.has(slug);
  }

  count() {
    if (!this.loaded) this.load();
    return this.entries.size;
  }

  getAll() {
    if (!this.loaded) this.load();
    return Array.from(this.entries.values());
  }
}

const programmaticService = new ProgrammaticService();
module.exports = programmaticService;
