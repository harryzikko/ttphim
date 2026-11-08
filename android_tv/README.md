# 🎬 CineViet Android TV - Kotlin Native

Ứng dụng CineViet dành riêng cho Android TV được viết hoàn toàn bằng **Kotlin Native**, xây dựng trên nền tảng **Jetpack Compose for TV** (`androidx.tv.material3`, `androidx.tv.foundation`) và trình phát video chuẩn cao cấp **AndroidX Media3 (ExoPlayer)**.

---

## 🌟 Tính Năng Nổi Bật & Khắc Phục Triệt Để

### 1. 🔐 Đăng Nhập Bằng Mã Kích Hoạt 6 Số (Không dùng QR Code)
- Hiển thị mã 6 số kích thước lớn, font chữ số rõ nét, viền đỏ phát sáng trên nền tối với độ tương phản cao, dễ nhìn từ khoảng cách xa trên màn hình TV.
- 3 bước hướng dẫn trực quan:
  1. Truy cập `cineviet.live/tv-auth` trên điện thoại/máy tính hoặc mục Tài khoản trên App CineViet.
  2. Điền đúng 6 số vào ô xác thực.
  3. Bấm xác nhận, màn hình TV sẽ tự động đồng bộ tài khoản ngay lập tức.
- Cơ chế auto-polling 3 giây/lần tự động bắt trạng thái xác thực từ máy chủ và chuyển thẳng vào trang chủ khi người dùng xác nhận trên điện thoại.
- Nút **Làm Mới Mã 6 Số** và **Bỏ Qua & Xem Ngay** điều khiển hoàn toàn bằng D-pad remote.

### 2. 🧭 Navbar / Side Navigation & Focus D-Pad Mượt Mà
- **Thu gọn**: Chiều rộng 76dp, ở trên cùng hiển thị biểu tượng chữ **C** (favicon đỏ chuẩn CineViet) giống hệt website.
- **Mở rộng**: Tự động mở rộng 220dp khi di chuyển remote sang trái, hiển thị chữ **CineViet** cùng tiêu đề các mục:
  - `Khám phá` (Trang chủ)
  - `Phim bộ`
  - `Phim lẻ`
  - `Tìm kiếm`
  - `Tài khoản`
- **Khắc phục lỗi focus**: Di chuyển remote sang phải sẽ focus thẳng vào nội dung màn hình chính; di chuyển sang trái quay lại menu mượt mà, không bị kẹt hay nhảy focus sai.

### 3. 🔍 Tìm Kiếm Nhanh (Search Tab)
- Khi chuyển sang tab Tìm kiếm từ remote, tiêu điểm D-pad tự động chuyển thẳng vào ô nhập liệu (`BasicTextField`), sẵn sàng để nhập từ khóa.
- Đi kèm hàng gợi ý thể loại nhanh: *Chiếu rạp, Hành động, Kinh dị, Tình cảm, Hàn Quốc, Anime...*
- Lưới kết quả trực quan hiển thị ngay bên dưới.

### 4. 🏆 Trang Chủ & Phim Nổi Bật Chuẩn Website
- **Banner Phim Nổi Bật (Spotlights)**: Hiển thị đầy đủ **tất cả 7 phim nổi bật** (không bị giới hạn 1 phim như cũ), có backdrop mờ viền, badge Nổi Bật/Chất lượng/Năm, tóm tắt nội dung và các chấm chuyển phim.
- **Nút "Xem phim" & "Chi tiết"**: Đã gắn D-pad click handler chuẩn xác, bấm phím giữa remote (Enter/Center) là phát ngay hoặc mở trang chi tiết.
- **Bảng Xếp Hạng / Thịnh Hành Hôm Nay**: Lấy đúng dữ liệu Bảng xếp hạng (`rankings` Top 10) với số thứ tự phóng to 1, 2, 3... 10 nổi bật và lượt xem thực tế của từng phim.
- Các hàng phim chuyên mục: Phim Mới Cập Nhật, Phim Chiếu Rạp, Phim Bộ Hot, Phim Lẻ, Hoạt Hình, TV Shows.

### 5. 🎭 Chi Tiết Phim & Đạo Diễn / Diễn Viên
- Hiển thị đầy đủ backdrop, poster, thể loại, quốc gia, thời lượng, tóm tắt.
- Phần **Đạo diễn & Diễn viên (TMDb Cast & Directors)**: Được làm lại thành các thẻ avatar tròn bo viền nổi bật, có ảnh chân dung diễn viên/đạo diễn lấy từ TMDb, tên thật và vai diễn rõ ràng, focus phóng to đẹp mắt.
- Bộ chọn Server (KKPhim, Nguồn C, Song Ngữ) và danh sách tập phim dạng lưới dễ chọn.

### 6. 📺 Media3 ExoPlayer - Trình Phát Video TV Hiện Đại
- **Tự động ẩn thanh điều khiển**: Sau 3 giây không có thao tác từ remote, toàn bộ thanh điều khiển tự động ẩn để xem phim trọn vẹn màn hình. Nhấn bất kỳ phím nào trên remote sẽ hiện lại thanh điều khiển.
- **Tua liên tục khi giữ phím (Fast-Forward / Rewind)**:
  - Nhấn 1 lần phím Phải: Tua tới 10 giây (+10s).
  - Nhấn 1 lần phím Trái: Tua lùi 10 giây (-10s).
  - **Giữ lì phím Phải/Trái**: Kích hoạt chế độ tua liên tục gia tốc (+30s, +60s, +120s...) kèm giao diện hiển thị mốc thời gian sẽ nhảy tới. Khi thả phím remote ra, video sẽ lập tức nhảy đến điểm đã tua.
- **Danh sách tập nhanh khi ấn phím Xuống**: Đang xem phim, chỉ cần bấm phím **XUỐNG (DPAD_DOWN)**, khay chọn tập phim sẽ trượt lên từ dưới cùng để người dùng chọn đổi tập ngay lập tức bằng phím Trái/Phải/Center mà không cần thoát khỏi player.

---

## 🛠️ Hướng Dẫn Biên Dịch (Build APK)

### Cách 1: Sử dụng file lệnh 1-click `build-android-tv.bat`
Chỉ cần nhấp đúp chạy file `build-android-tv.bat` tại thư mục gốc:
```bat
build-android-tv.bat
```
File APK sẽ được tạo tại: `android_tv/output/CineViet-AndroidTV-debug.apk`

### Cách 2: Biên dịch qua lệnh Terminal
```powershell
$env:JAVA_HOME = "E:\VTC Game\Android Studio\jbr"
$env:ANDROID_HOME = "E:\VTC Game\Sdk"
cd "E:\VTC Game\project\vps\cineviet.live\android_tv"
.\gradlew.bat assembleDebug
```

### Cách 3: Mở bằng Android Studio
Mở thư mục `E:\VTC Game\project\vps\cineviet.live\android_tv` trong Android Studio (`E:\VTC Game\Android Studio`) để chạy trực tiếp trên Android TV Emulator hoặc cắm Android TV Box qua ADB.
