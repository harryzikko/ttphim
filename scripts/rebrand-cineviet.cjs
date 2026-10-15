const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const targetFiles = [
  // Public HTML
  'public/index.html',
  'public/chi-tiet.html',
  'public/xem-phim.html',
  'public/kham-pha.html',
  'public/danh-sach.html',
  'public/tai-khoan.html',
  'public/auth.html',
  'public/admin.html',
  'public/dien-vien.html',
  'public/tv-auth.html',
  'public/manifest.json',

  // Mobile HTML
  'public/mobile/index.html',
  'public/mobile/chi-tiet.html',
  'public/mobile/xem-phim.html',
  'public/mobile/kham-pha.html',
  'public/mobile/danh-sach.html',
  'public/mobile/tai-khoan.html',

  // Public JS
  'public/js/header.js',
  'public/js/home.js',
  'public/js/detail.js',
  'public/js/watch.js',
  'public/js/catalog.js',
  'public/js/admin.js',
  'public/js/library.js',
  'public/js/account.js',
  'public/js/dien-vien.js',

  // Mobile JS
  'public/mobile/js/mobile-app.js',
  'public/mobile/js/home.js',
  'public/mobile/js/chi-tiet.js',
  'public/mobile/js/xem-phim.js',
  'public/mobile/js/tai-khoan.js',

  // Backend
  'src/server.js',
  'src/services/templateService.js',

  // Mobile App Configs
  'mobile_app/pubspec.yaml',
  'mobile_app/config/AndroidManifest.xml',
  'mobile_app/config/Info.plist',
  'mobile_app/lib/screens/home_screen.dart',
  'mobile_app/lib/screens/profile_screen.dart',
  '.github/workflows/build-mobile.yml'
];

let totalReplacements = 0;

for (const relPath of targetFiles) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    console.log('Skipping missing file:', relPath);
    continue;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  const original = content;

  // 1. External logo image replacement in HTML
  content = content.replace(
    /<img([^>]*?)alt="[^"]*Logo"([^>]*?)src="https:\/\/lh3\.googleusercontent\.com\/[^"]*"([^>]*?)>/gi,
    '<img$1alt="CineViet Logo"$2src="/logo.svg"$3>'
  );

  // 2. Logo span replacements: KKPHIM -> CINEVIET, TTPHIM -> CINEVIET
  content = content.replace(
    /(<span[^>]*class="[^"]*font-headline-sm[^"]*"[^>]*>)KK<span class="text-primary-container">PHIM<\/span>(<\/span>)/gi,
    '$1CINE<span class="text-primary-container">VIET</span>$2'
  );
  content = content.replace(
    /(<span[^>]*class="[^"]*font-headline-sm[^"]*"[^>]*>)TT<span class="text-primary-container">PHIM<\/span>(<\/span>)/gi,
    '$1CINE<span class="text-primary-container">VIET</span>$2'
  );
  content = content.replace(
    /KK<span class="text-primary-container">PHIM<\/span>/g,
    'CINE<span class="text-primary-container">VIET</span>'
  );
  content = content.replace(
    /TT<span class="text-primary-container">PHIM<\/span>/g,
    'CINE<span class="text-primary-container">VIET</span>'
  );

  // 3. Brand titles & headers
  content = content.replace(/TTPHIM - Nền Tảng Xem Phim Chuẩn Điện Ảnh 4K HDR/g, 'CineViet - Nền Tảng Xem Phim Chuẩn Điện Ảnh 4K HDR');
  content = content.replace(/TTPHIM - Xem phim online trực tuyến/g, 'CineViet - Xem phim online trực tuyến');
  content = content.replace(/TTPHIM Cinema Experience/g, 'CineViet Cinema Experience');
  content = content.replace(/TTPhim Cinema Experience/g, 'CineViet Cinema Experience');
  content = content.replace(/TTPhim Cinema/g, 'CineViet Cinema');
  content = content.replace(/TTPHIM CINEMA/g, 'CINEVIET CINEMA');
  content = content.replace(/TTPhim Mobile/g, 'CineViet Mobile');
  content = content.replace(/TTPhim - App Xem Phim/g, 'CineViet - App Xem Phim');

  // 4. Contact / Footer / Meta
  content = content.replace(/© 2026 TTPHIM/g, '© 2026 CineViet');
  content = content.replace(/© 2026 TTPhim/g, '© 2026 CineViet');
  content = content.replace(/member@ttphim\.com/g, 'member@cineviet.vip');
  content = content.replace(/tel:1900888TTPhim/g, 'tel:1900888CineViet');
  content = content.replace(/1900 888 TTPHIM/g, '1900 888 CINEVIET');
  content = content.replace(/https:\/\/TTPHIM\.vip/g, 'https://cineviet.vip');
  content = content.replace(/Chào mừng bạn đến với TTPhim/g, 'Chào mừng bạn đến với CineViet');
  content = content.replace(/Thành Viên TTPhim/g, 'Thành Viên CineViet');
  content = content.replace(/Hotline Hỗ Trợ TTPhim 24\/7/g, 'Hotline Hỗ Trợ CineViet 24/7');
  content = content.replace(/Đám Mây TTPhim/g, 'Đám Mây CineViet');
  content = content.replace(/TTPhim - Rạp Phim Miễn Phí Trong Tầm Tay/g, 'CineViet - Rạp Phim Trực Tuyến Đỉnh Cao');
  content = content.replace(/TTPhim - Rạp Chiếu Phim 4K HDR/g, 'CineViet - Rạp Chiếu Phim 4K HDR');

  // 5. Page Titles in HTML
  content = content.replace(/<title>(.*?)(?: - | \| )?(?:TTPhim|TTPHIM)(.*?)<\/title>/gi, (match, prefix, suffix) => {
    return `<title>${prefix ? prefix + ' - ' : ''}CineViet${suffix || ''}</title>`;
  });

  // 6. Manifest / Apple title
  content = content.replace(/"name":\s*"TTPhim - Rạp Chiếu Phim 4K HDR"/g, '"name": "CineViet - Rạp Chiếu Phim 4K HDR"');
  content = content.replace(/"short_name":\s*"TTPhim"/g, '"short_name": "CineViet"');
  content = content.replace(/content="TTPhim"/g, 'content="CineViet"');

  // 7. Backend log banner
  content = content.replace(/🎬 TTPHIM - OBSIDIAN CINEMA/g, '🎬 CINEVIET - OBSIDIAN CINEMA');
  content = content.replace(/TTPhim Cinema 4K/g, 'CineViet Cinema 4K');

  // 8. Mobile App configs
  content = content.replace(/android:label="TTPhim"/g, 'android:label="CineViet"');
  content = content.replace(/<string>TTPhim<\/string>/g, '<string>CineViet</string>');
  content = content.replace(/Build TTPhim Native Mobile App/g, 'Build CineViet Native Mobile App');
  content = content.replace(/TTPhim-Mobile-release\.apk/g, 'CineViet-Mobile-release.apk');
  content = content.replace(/TTPhim-AndroidTV-release\.apk/g, 'CineViet-AndroidTV-release.apk');
  content = content.replace(/TTPhim-unsigned\.ipa/g, 'CineViet-unsigned.ipa');
  content = content.replace(/TTPhim-\${{ matrix\.variant }}-APK/g, 'CineViet-${{ matrix.variant }}-APK');
  content = content.replace(/TTPhim-iOS-IPA-Unsigned/g, 'CineViet-iOS-IPA-Unsigned');

  if (content !== original) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('Updated:', relPath);
    totalReplacements++;
  }
}

console.log(`\nRebranding complete! ${totalReplacements} files updated.`);
