const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function replaceInFile(filePath, transforms) {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(fullPath, 'utf8');
  let original = content;

  for (const { from, to } of transforms) {
    if (typeof from === 'string') {
      content = content.split(from).join(to);
    } else if (from instanceof RegExp) {
      content = content.replace(from, to);
    }
  }

  if (content !== original) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Updated: ${filePath}`);
  } else {
    console.log(`No changes needed: ${filePath}`);
  }
}

// 1. Remove logo image in header and footer across all HTML files
const htmlFiles = [
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
  'public/tv/index.html',
  'public/tv/chi-tiet.html',
  'public/tv/xem-phim.html',
  'public/tv/dang-nhap.html',
  'public/tv/tim-kiem.html',
  'public/mobile/index.html',
  'public/mobile/chi-tiet.html',
  'public/mobile/xem-phim.html',
  'public/mobile/kham-pha.html',
  'public/mobile/danh-sach.html',
  'public/mobile/tai-khoan.html'
];

htmlFiles.forEach(file => {
  replaceInFile(file, [
    // Remove logo img tag from header
    {
      from: /<img[^>]*src=["']\/logo\.svg["'][^>]*>\s*/g,
      to: ''
    },
    // Remove remaining TTPHIM API footer string
    {
      from: 'Nguồn dữ liệu TTPHIM API.',
      to: ''
    },
    {
      from: 'Nguồn dữ liệu TTPhim API.',
      to: ''
    },
    // Replace remaining TTPHIM / TTPhim text
    {
      from: 'TTPHIM Master',
      to: 'CineViet Master'
    },
    {
      from: 'TTPHIM Rating',
      to: 'CineViet Rating'
    },
    {
      from: 'FHD • TTPHIM Cinema',
      to: 'FHD • CineViet Cinema'
    },
    {
      from: 'TTPHIM Server',
      to: 'CineViet Server'
    },
    {
      from: 'TTPHIM TV 4K',
      to: 'CINEVIET TV 4K'
    },
    {
      from: 'TTPhim Android TV',
      to: 'CineViet Android TV'
    },
    {
      from: 'TTPHIM VIP Pass',
      to: 'CineViet VIP Pass'
    },
    {
      from: 'Tài khoản TTPHIM',
      to: 'Tài khoản CineViet'
    },
    {
      from: 'Đăng nhập tài khoản TTPHIM',
      to: 'Đăng nhập tài khoản CineViet'
    },
    {
      from: 'Đăng Nhập Vào TTPHIM',
      to: 'Đăng Nhập Vào CineViet'
    },
    {
      from: 'Hệ thống TTPHIM',
      to: 'Hệ thống CineViet'
    },
    {
      from: 'Bộ nhớ đệm TTPHIM',
      to: 'Bộ nhớ đệm CineViet'
    },
    {
      from: 'ttphim.vn/tv',
      to: 'cineviet.vn/tv'
    },
    {
      from: 'của TTPHIM',
      to: 'của CineViet'
    },
    {
      from: 'Diễn viên TTPhim',
      to: 'Diễn viên CineViet'
    },
    {
      from: '"name": "TTPHIM"',
      to: '"name": "CineViet"'
    }
  ]);
});

console.log('HTML files branding and logo removal completed.');
