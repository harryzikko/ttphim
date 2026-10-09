const fs = require('fs');
const path = require('path');
const kkphimService = require('./src/services/kkphimService');
const templateService = require('./src/services/templateService');
const dbService = require('./src/services/dbService');

const baseDir = path.join(__dirname, 'stitch_kkphim_movie_streaming_platform', 'stitch_kkphim_movie_streaming_platform');
const publicDir = path.join(__dirname, 'public');

const pages = [
  {
    src: 'trang_ch_kkphim/code.html',
    dest: 'index.html',
    scripts: ['/js/api.js', '/js/header.js', '/js/home.js']
  },
  {
    src: 'chi_ti_t_phim_kkphim/code.html',
    dest: 'chi-tiet.html',
    scripts: ['/js/api.js', '/js/header.js', '/js/detail.js']
  },
  {
    src: 'xem_phim_r_p_chi_u_kkphim/code.html',
    dest: 'xem-phim.html',
    scripts: ['https://cdn.jsdelivr.net/npm/hls.js@latest', '/js/api.js', '/js/header.js', '/js/watch.js']
  },
  {
    src: 'kh_m_ph_b_l_c_kkphim/code.html',
    dest: 'kham-pha.html',
    scripts: ['/js/api.js', '/js/header.js', '/js/catalog.js']
  },
  {
    src: 'danh_s_ch_c_a_t_i_l_ch_s_xem_kkphim/code.html',
    dest: 'danh-sach.html',
    scripts: ['/js/api.js', '/js/header.js', '/js/library.js']
  },
  {
    src: 'ng_nh_p_ng_k_kkphim/code.html',
    dest: 'auth.html',
    scripts: ['/js/api.js', '/js/header.js', '/js/auth.js']
  },
  {
    src: 'qu_n_l_t_i_kho_n_g_i_vip_kkphim/code.html',
    dest: 'vip.html',
    scripts: ['/js/api.js', '/js/header.js', '/js/vip.js']
  }
];

function processHtml(html, scripts) {
  // Update navigation links
  html = html.replace(/data-path="trang-chu"\s+href="#"/g, 'data-path="trang-chu" href="/"');
  html = html.replace(/data-path="phim-bo"\s+href="#"/g, 'data-path="phim-bo" href="/kham-pha?type=phim-bo"');
  html = html.replace(/data-path="phim-le"\s+href="#"/g, 'data-path="phim-le" href="/kham-pha?type=phim-le"');
  html = html.replace(/data-path="hoat-hinh"\s+href="#"/g, 'data-path="hoat-hinh" href="/kham-pha?type=hoat-hinh"');
  html = html.replace(/data-path="kham-pha"\s+href="#"/g, 'data-path="kham-pha" href="/kham-pha"');
  html = html.replace(/data-path="bang-xep-hang"\s+href="#"/g, 'data-path="bang-xep-hang" href="/kham-pha?sort=view"');
  html = html.replace(/data-path="danh-sach-cua-toi"\s+href="#"/g, 'data-path="danh-sach-cua-toi" href="/danh-sach-cua-toi"');
  html = html.replace(/data-path="goi-vip"\s+href="#"/g, 'data-path="goi-vip" href="/goi-vip"');
  html = html.replace(/data-path="chi-tiet-phim"\s+href="#"/g, 'data-path="chi-tiet-phim" href="/"');

  // Insert custom.css in head
  const customCssTag = '<link rel="stylesheet" href="/css/custom.css"/>';
  if (!html.includes(customCssTag)) {
    html = html.replace('</head>', `  ${customCssTag}\n</head>`);
  }

  // Insert script tags before </body>
  const scriptTags = scripts.map(s => `<script src="${s}"></script>`).join('\n  ');
  html = html.replace('</body>', `  ${scriptTags}\n</body>`);

  return html;
}

function cleanLibraryHtml(html) {
  // Replace static mock cards with loading skeleton grid
  const skeletonGrid = `
  <div class="mt-space-lg grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-space-md" id="library-cards-container">
    <div class="rounded-xl bg-surface-container overflow-hidden animate-pulse flex flex-col">
      <div class="w-full aspect-[2/3] bg-surface-container-high"></div>
      <div class="p-3 space-y-2">
        <div class="h-4 bg-surface-container-high rounded w-3/4"></div>
        <div class="h-3 bg-surface-container-highest rounded w-1/2"></div>
      </div>
    </div>
    <div class="rounded-xl bg-surface-container overflow-hidden animate-pulse flex flex-col">
      <div class="w-full aspect-[2/3] bg-surface-container-high"></div>
      <div class="p-3 space-y-2">
        <div class="h-4 bg-surface-container-high rounded w-3/4"></div>
        <div class="h-3 bg-surface-container-highest rounded w-1/2"></div>
      </div>
    </div>
    <div class="rounded-xl bg-surface-container overflow-hidden animate-pulse flex flex-col">
      <div class="w-full aspect-[2/3] bg-surface-container-high"></div>
      <div class="p-3 space-y-2">
        <div class="h-4 bg-surface-container-high rounded w-3/4"></div>
        <div class="h-3 bg-surface-container-highest rounded w-1/2"></div>
      </div>
    </div>
    <div class="rounded-xl bg-surface-container overflow-hidden animate-pulse flex flex-col">
      <div class="w-full aspect-[2/3] bg-surface-container-high"></div>
      <div class="p-3 space-y-2">
        <div class="h-4 bg-surface-container-high rounded w-3/4"></div>
        <div class="h-3 bg-surface-container-highest rounded w-1/2"></div>
      </div>
    </div>
    <div class="rounded-xl bg-surface-container overflow-hidden animate-pulse flex flex-col">
      <div class="w-full aspect-[2/3] bg-surface-container-high"></div>
      <div class="p-3 space-y-2">
        <div class="h-4 bg-surface-container-high rounded w-3/4"></div>
        <div class="h-3 bg-surface-container-highest rounded w-1/2"></div>
      </div>
    </div>
    <div class="rounded-xl bg-surface-container overflow-hidden animate-pulse flex flex-col">
      <div class="w-full aspect-[2/3] bg-surface-container-high"></div>
      <div class="p-3 space-y-2">
        <div class="h-4 bg-surface-container-high rounded w-3/4"></div>
        <div class="h-3 bg-surface-container-highest rounded w-1/2"></div>
      </div>
    </div>
  </div>`;

  html = html.replace(
    /(<!-- MAIN MEDIA CARDS GRID \(6 Columns Responsive\) -->[\s\S]*?<div class="mt-space-lg grid[^"]*">)[\s\S]*?(<\/div>\s*<!-- INSIGHTS & STATISTICAL DASHBOARD BANNER -->)/,
    `<!-- MAIN MEDIA CARDS GRID (6 Columns Responsive) -->\n${skeletonGrid}\n<!-- INSIGHTS & STATISTICAL DASHBOARD BANNER -->`
  );

  // Replace mock recommendation tile in bottom banner
  html = html.replace(
    /<h5 class="font-label-md text-label-md text-on-surface truncate">Trò Chơi Kim Cương \(The Glory\)<\/h5>\s*<div[^>]*>[\s\S]*?<\/div>\s*<p class="font-body-sm text-body-sm text-on-surface-variant truncate">Cùng dàn diễn viên với Vincenzo<\/p>/,
    `<h5 class="font-label-md text-label-md text-on-surface truncate">Quỷ Quyệt: Ranh Giới Vô Định</h5>\n<div class="flex items-center gap-1.5 text-on-surface-variant font-body-sm text-body-sm"><span class="text-amber-400">★ 8.9</span><span>•</span><span class="text-secondary-fixed">Chiếu Rạp</span></div>\n<p class="font-body-sm text-body-sm text-on-surface-variant truncate">Phim điện ảnh kinh dị kịch tính</p>`
  );

  // Sanitize data-alt
  html = html.replace(/data-alt="[^"]*"/g, 'data-alt="KKPhim Thư Viện"');

  return html;
}

async function run() {
  console.log('[Build] Fetching live data from KKPhim API for pre-rendering...');
  let homeData = null;
  let catalogData = null;
  let sampleDetail = null;
  let comments = [];

  try {
    homeData = await kkphimService.getHomeData();
    catalogData = await kkphimService.getCatalog({ page: 1, limit: 20 });
    const sampleSlug = homeData?.spotlights?.[0]?.slug || homeData?.latest?.[0]?.slug || 'quy-quyet-ranh-gioi-vo-dinh';
    sampleDetail = await kkphimService.getMovieDetail(sampleSlug);
    comments = await dbService.getComments(sampleSlug);
    console.log('[Build] API data successfully retrieved for sample slug:', sampleSlug);
  } catch (e) {
    console.warn('[Build] Warning: Could not pre-fetch API data:', e.message);
  }

  for (const p of pages) {
    const srcPath = path.join(baseDir, p.src);
    const destPath = path.join(publicDir, p.dest);

    if (!fs.existsSync(srcPath)) {
      console.error(`Source file not found: ${srcPath}`);
      continue;
    }

    let content = fs.readFileSync(srcPath, 'utf8');
    content = processHtml(content, p.scripts);

    if (p.dest === 'index.html' && homeData) {
      content = templateService.renderHome(content, homeData);
    } else if (p.dest === 'kham-pha.html' && catalogData) {
      content = templateService.renderCatalog(content, catalogData);
    } else if (p.dest === 'chi-tiet.html' && sampleDetail) {
      content = templateService.renderDetail(content, sampleDetail);
    } else if (p.dest === 'xem-phim.html' && sampleDetail) {
      content = templateService.renderWatch(content, sampleDetail, null, comments);
    } else if (p.dest === 'danh-sach.html') {
      content = cleanLibraryHtml(content);
    }

    fs.writeFileSync(destPath, content, 'utf8');
    console.log(`Generated: ${p.dest} (${content.length} bytes)`);
  }

  console.log('All frontend HTML templates successfully processed and pre-hydrated into public/');
}

run();
