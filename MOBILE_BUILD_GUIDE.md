# HƯỚNG DẪN TẢI & CÀI ĐẶT ỨNG DỤNG NATIVE TTPHIM (FLUTTER)

Dự án đã được chuyển đổi hoàn toàn sang **Ứng dụng Native Flutter 100% Thuần (Pure Native Mobile App)**, loại bỏ triệt để kiến trúc WebView cũ nhằm đảm bảo:
- **Không bao giờ bị lỗi màn hình trắng** khi mở trên iOS / Android (giao diện được biên dịch trực tiếp ra mã máy AOT Native Canvas / Impeller).
- **Phát luồng video HLS (.m3u8) siêu mượt** với giải mã phần cứng Native AVPlayer (iOS) và ExoPlayer (Android).
- **Kết nối trực tiếp API đám mây** `https://phimapi.com` độc lập, không cần bất kỳ máy chủ Node.js cục bộ nào.
- **Obsidian Cinema Dark Theme**: Giao diện rạp chiếu phim bóng đêm sang trọng `#0B0D13` cùng tông đỏ điện ảnh và vàng VIP.
- **100% Miễn Phí**: Toàn bộ tính năng VIP Pass đã mở khóa sẵn, không có bất kỳ màn hình thanh toán hay thu phí nào.

---

## 🚀 TẢI ỨNG DỤNG ĐÃ BIÊN DỊCH TRÊN GITHUB ACTIONS

Bạn có thể tải ngay file cài đặt đã được GitHub Actions tự động biên dịch thành công:

👉 **Trang tải Artifacts chính thức**: [https://github.com/harryzikko/ttphim/actions/runs/37956385360](https://github.com/harryzikko/ttphim/actions/runs/37956385360)

| Nền tảng | Tên Artifact | Dung lượng | Định dạng | Tương thích |
|---|---|---|---|---|
| **Android** | `TTPhim-Android-APK` | ~23.6 MB | `.apk` | Mọi điện thoại & máy tính bảng Android 5.0 - 15+ |
| **iOS (iPhone/iPad)** | `TTPhim-iOS-IPA` | ~23.3 MB | `.ipa` (Unsigned) | Mọi iPhone, iPad chạy iOS 12.0 - 18+ |

---

## 📲 HƯỚNG DẪN CÀI ĐẶT LÊN THIẾT BỊ

### 1. Dành cho điện thoại Android (.apk)
1. Bấm tải file `TTPhim-Android-APK` từ GitHub Actions (hoặc giải nén nếu tải file zip).
2. Chuyển file `TTPhim-v1.0.0-release.apk` vào điện thoại.
3. Bấm mở file và chọn **Cài đặt (Install)**.
4. Nếu máy hỏi cấp quyền "Cài đặt ứng dụng không rõ nguồn gốc", bấm **Cho phép (Allow)**.
5. Mở ứng dụng **TTPhim** và thưởng thức phim ngay lập tức!

---

### 2. Dành cho iPhone / iPad (.ipa)
File `.ipa` xuất ra là bản Unsigned chất lượng cao, bạn có thể cài đặt theo một trong các phương thức sau:

#### Cách 1: Sử dụng Sideloadly (Khuyên dùng - Cực nhanh trên Windows & Mac)
1. Tải công cụ miễn phí [Sideloadly](https://sideloadly.io/) trên máy tính.
2. Kết nối iPhone với máy tính bằng cáp sạc.
3. Kéo thả file `TTPhim-v1.0.0-unsigned.ipa` vào giao diện Sideloadly.
4. Nhập Apple ID miễn phí của bạn và bấm **Start**.
5. Sau khi Sideloadly báo **Done**, trên iPhone bạn vào:
   - **Cài đặt (Settings) -> Cài đặt chung (General) -> Quản lý VPN & Thiết bị (VPN & Device Management)**.
   - Bấm vào Apple ID của bạn và chọn **Tin cậy (Trust)**.
6. Mở app TTPhim và xem phim full màn hình mượt mà!

#### Cách 2: Sử dụng TrollStore (Dành cho máy tương thích TrollStore)
- Chỉ cần gửi file `.ipa` qua AirDrop hoặc mở trực tiếp trên iPhone -> Chọn **Open in TrollStore** -> Cài đặt vĩnh viễn không bao giờ bị thu hồi chứng chỉ (No Revoke).

#### Cách 3: Sử dụng AltStore / Scarlet / Esign
- Mở ứng dụng Scarlet hoặc AltStore trên điện thoại, bấm nút dấu `+` và chọn file `TTPhim-v1.0.0-unsigned.ipa` để ký và cài đặt trực tiếp không cần máy tính.

---

## 🛠️ CẤU TRÚC MÃ NGUỒN FLUTTER (`mobile_app/`)

- `mobile_app/lib/models/`:
  - `movie.dart`: Khung dữ liệu phim, poster, đánh giá, thể loại.
  - `movie_detail.dart`: Thông tin chi tiết, danh sách máy chủ (Vietsub, Lồng tiếng) và danh sách tập phim kèm luồng m3u8.
- `mobile_app/lib/services/`:
  - `api_service.dart`: Gọi trực tiếp các endpoint công khai của phimapi.com (Trang chủ, Phim Lẻ, Phim Bộ, Hoạt Hình, Tìm kiếm).
  - `storage_service.dart`: Lưu trữ yêu thích cục bộ và lịch sử đang xem (kèm % tiến độ).
- `mobile_app/lib/screens/`:
  - `home_screen.dart`: Spotlight Hero Carousel, Top 10 thịnh hành, các dải phim theo thể loại.
  - `explore_screen.dart`: Phân loại theo danh mục & thể loại, phân trang cuộn vô tận.
  - `search_screen.dart`: Tìm kiếm tức thì theo từ khóa và gợi ý hot search.
  - `watchlist_screen.dart`: Quản lý danh sách yêu thích và lịch sử xem tiếp tục.
  - `detail_screen.dart`: Xem chi tiết phim, chọn máy chủ, danh sách tập phim.
  - `player_screen.dart`: Trình phát video chuyên nghiệp hỗ trợ HLS `.m3u8`, xoay ngang toàn màn hình, chuyển tập nhanh 1 chạm.
  - `profile_screen.dart`: Thẻ thành viên VIP Miễn phí trọn đời, cài đặt chất lượng 1080p, dọn dẹp cache.
