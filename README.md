# 🎬 KKPHIM - OBSIDIAN CINEMA STREAMING PLATFORM

Website xem phim trực tuyến cao cấp được xây dựng trên giao diện **Obsidian Cinema (Dark Cinema Mode)** và kết nối với nguồn dữ liệu phim từ **KKPhim API** (`https://phimapi.com`).

---

## 🌟 Tính Năng Nổi Bật

### 1. Giữ Trọn Vẹn Thiết Kế Obsidian Cinema
- Tông màu chủ đạo **Deep Obsidian** (`#11131c`, `#090A0F`), kết hợp điểm nhấn đỏ rạp chiếu **Cinema Red** (`#e50914`) và viền sáng **Atmospheric Cyan** (`#00eefc`).
- Chuẩn font typography: **Montserrat** cho tiêu đề & **Inter** cho nội dung.
- Hiệu ứng kính mờ (Glassmorphism), ambient glow và bố cục thích ứng (Responsive).

### 2. Tích Hợp Đầy Đủ KKPhim API
- Tự động lấy danh sách phim mới nhất, phim bộ, phim lẻ, phim hoạt hình / anime, TV shows từ hệ thống KKPhim.
- Tự động chuẩn hóa ảnh từ CDN (`https://phimimg.com`).
- Bộ nhớ đệm **In-Memory Cache (TTL)** giúp phản hồi API siêu tốc (dưới 50ms) và tránh bị giới hạn tốc độ (rate limit).

### 3. Trình Phát Phim Đỉnh Cao
- **Hỗ trợ 2 chế độ phát linh hoạt**:
  - **Player Cinema HLS.js**: Phát trực tiếp luồng `.m3u8` với giao diện điều khiển tùy biến (Play/Pause, thanh tua video, bỏ qua 90s intro, tốc độ 0.75x - 2.0x, chỉnh âm lượng, toàn màn hình).
  - **Server Embed Iframe**: Dự phòng tức thì khi luồng HLS gặp hạn chế mạng, đảm bảo 100% phim đều xem được.
- **Chế độ Tắt Đèn Rạp (Cinema Lights-off Mode)**: Tạo màn đen mờ bao phủ toàn màn hình, tập trung tối đa vào khung video.
- **Chế độ Mở Rộng Rạp Hát (Theater Mode)**: Mở rộng khung phát chiếm toàn bộ chiều rộng trang.
- **Drawer Danh Sách Tập Thông Minh**: Tích hợp ô tìm kiếm tập phim, hiển thị trạng thái đang phát với sóng âm thanh equalizer, tự động lưu tiến trình xem phim.
- **Bình Luận Thời Gian Thực**: Cho phép bình luận, gắn mốc thời gian xem phim (ví dụ: `12:15`), và thả tim yêu thích.

### 4. Tìm Kiếm & Bộ Lọc Đa Chiều
- **Tìm kiếm tức thì (Live Search)**: Gõ từ khóa trên thanh header để nhận gợi ý ngay lập tức kèm ảnh poster và năm phát hành. Phím tắt `Ctrl + K` tiện lợi.
- **Bộ lọc chuyên sâu**: Lọc theo Phân loại (Phim Bộ, Phim Lẻ, Hoạt Hình, TV Shows), Quốc gia (Hàn Quốc, Trung Quốc, Âu Mỹ, Nhật Bản, Việt Nam...), Năm phát hành (2026, 2025, 2024...), và Sắp xếp có phân trang đầy đủ.

### 5. Thư Viện Cá Nhân & Quản Lý Tài Khoản VIP
- **Đang xem dở**: Lưu thời lượng và thanh tiến trình phần trăm (%) để người dùng xem tiếp bất kỳ lúc nào.
- **Danh sách yêu thích**: Lưu và quản lý các bộ phim muốn xem.
- **Lịch sử xem**: Xem lại danh sách phim đã xem, hỗ trợ nút xóa lịch sử.
- **Xác thực người dùng**: Đăng ký, đăng nhập với mật khẩu và JWT token cookie.
- **Tài khoản Demo VIP sẵn sàng**: `dienvippro@kkphim.vn` / `123456` (Minh Triết - VIP Master).
- **Trang Gói VIP**: Quản lý gói cước, số lượng thiết bị, và kích hoạt / gia hạn gói VIP ngay lập tức.

---

## 📁 Cấu Trúc Dự Án

```
f:\Tài\film\
├── src\
│   ├── config.js               # Cấu hình cổng, đường dẫn API KKPhim, secret key
│   ├── server.js               # Khởi tạo Express server, static files, middleware
│   ├── services\
│   │   ├── kkphimService.js    # Service gọi API KKPhim, resolver ảnh, in-memory cache
│   │   ├── dbService.js        # Service quản lý cơ sở dữ liệu JSON (users, watchlist, history, comments)
│   │   └── authService.js      # Mã hóa mật khẩu, tạo và xác thực token JWT
│   └── routes\
│       ├── apiRoutes.js        # Các REST API endpoint (/api/*)
│       └── viewRoutes.js       # Định tuyến phục vụ giao diện HTML
├── public\
│   ├── index.html              # Trang chủ (Spotlight + Content Rails)
│   ├── chi-tiet.html           # Trang chi tiết phim (Poster, Metadata, Danh sách tập)
│   ├── xem-phim.html           # Trang xem phim (Player HLS/Embed, Drawer, Comments)
│   ├── kham-pha.html           # Trang khám phá & bộ lọc danh mục
│   ├── danh-sach.html          # Trang thư viện cá nhân (Đang xem dở, Yêu thích, Lịch sử)
│   ├── auth.html               # Trang đăng nhập / đăng ký
│   ├── vip.html                # Trang quản lý tài khoản & gói VIP
│   ├── css\
│   │   └── custom.css          # Tùy chỉnh thanh cuộn cinema, skeleton loading, toasts
│   └── js\
│       ├── api.js              # Client SDK gọi backend
│       ├── header.js           # Xử lý thanh điều hướng, tìm kiếm live Ctrl+K, avatar profile
│       ├── home.js             # Controller render trang chủ
│       ├── detail.js           # Controller render chi tiết phim
│       ├── watch.js            # Controller trình phát video & bình luận
│       ├── catalog.js          # Controller bộ lọc và phân trang
│       ├── library.js          # Controller thư viện phim cá nhân
│       ├── auth.js             # Controller đăng nhập / đăng ký
│       └── vip.js              # Controller tài khoản VIP
├── data\
│   └── db.json                 # File dữ liệu JSON lưu trữ người dùng, watchlist, lịch sử, bình luận
├── build-views.js              # Script build liên kết template frontend vào public/
└── package.json                # Dependencies và scripts
```

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Website

### 1. Yêu Cầu Môi Trường
- **Node.js**: Phiên bản 18+ (Dự án đã kiểm tra tương thích hoàn hảo trên Node v20).
- **NPM**: Đã đi kèm với Node.js.

### 2. Cài Đặt Dependencies
Mở terminal tại thư mục dự án và chạy:
```bash
npm install
```

### 3. Khởi Chạy Server
Chạy lệnh:
```bash
npm start
```
Hoặc:
```bash
node src/server.js
```

Sau khi chạy, server sẽ hoạt động tại:
👉 **http://localhost:3000**

---

## 📡 Danh Sách API Endpoints

| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| `GET` | `/api/home` | Lấy dữ liệu tổng hợp cho trang chủ (Spotlights, Mới nhất, Rạp, Bộ, Hoạt hình, Xếp hạng) |
| `GET` | `/api/movies/:slug` | Chi tiết phim, danh sách servers, tập phim, phim tương tự |
| `GET` | `/api/catalog` | Lọc phim theo loại (`type`), thể loại (`category`), quốc gia (`country`), năm (`year`), sắp xếp (`sort`), trang (`page`), từ khóa (`keyword`) |
| `GET` | `/api/search?q=...` | Gợi ý tìm kiếm nhanh cho thanh search |
| `GET` | `/api/categories` | Lấy danh sách toàn bộ thể loại và quốc gia |
| `GET` | `/api/comments/:slug` | Lấy danh sách bình luận của phim |
| `POST` | `/api/comments/:slug` | Gửi bình luận mới kèm mốc thời gian |
| `POST` | `/api/comments/:id/like` | Thả tim bình luận |
| `POST` | `/api/auth/login` | Đăng nhập tài khoản |
| `POST` | `/api/auth/register` | Đăng ký tài khoản mới |
| `GET` | `/api/auth/me` | Lấy thông tin tài khoản hiện tại |
| `POST` | `/api/auth/logout` | Đăng xuất |
| `GET` | `/api/user/library` | Lấy danh sách đang xem dở, phim yêu thích, lịch sử |
| `POST` | `/api/user/watchlist/toggle` | Thêm / xóa phim khỏi danh sách yêu thích |
| `POST` | `/api/user/history` | Lưu tiến trình xem phim (thời gian, tổng thời lượng, %) |
| `POST` | `/api/user/history/clear` | Xóa toàn bộ lịch sử xem |
| `POST` | `/api/user/vip/upgrade` | Kích hoạt hoặc nâng cấp gói VIP |

---

## 🔑 Tài Khoản Demo VIP
- **Email**: `dienvippro@kkphim.vn`
- **Mật khẩu**: `123456`
- **Tên**: Minh Triết (VIP 4K Cinema Master)
*(Tại trang đăng nhập, bạn cũng có thể bấm vào banner "Ưu đãi tân thủ" ở trên để tự động điền tài khoản demo này).*
