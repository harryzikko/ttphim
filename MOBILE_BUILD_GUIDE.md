# HƯỚNG DẪN XUẤT FILE CÀI ĐẶT APK (ANDROID) VÀ IPA (IOS) - TTPHIM

Dự án đã được tích hợp **Capacitor Native Engine** chuyển đổi toàn bộ màn hình điện ảnh Obsidian Cinema thành **2 dự án Native độc lập hoàn chỉnh**:
- **Android Native Project**: Nằm tại thư mục `android/` (Package: `com.ttphim.cinema`)
- **iOS Native Project**: Nằm tại thư mục `ios/App/` (Bundle ID: `com.ttphim.cinema`)

---

## 🤖 PHẦN 1: XUẤT FILE APK (CHO ANDROID)

### Cách 1: Sử dụng Android Studio (Khuyên Dùng Nhất - Cực Dễ)
1. Tải và cài đặt [Android Studio](https://developer.android.com/studio) (nếu máy chưa có).
2. Mở Android Studio, chọn **Open** và chọn thư mục:
   ```
   f:\Tài\film\android
   ```
3. Đợi Android Studio nạp xong Gradle (khoảng 1 - 2 phút).
4. Trên thanh menu trên cùng, bấm:
   ```
   Build -> Build Bundle(s) / APK(s) -> Build APK(s)
   ```
5. Khi build xong, Android Studio sẽ hiện thông báo ở góc phải bên dưới: **"APK(s) generated successfully"**. Bấm nút **locate** để lấy ngay file `app-debug.apk` cài đặt trực tiếp lên điện thoại Android!

---

### Cách 2: Build Nhanh Bằng Dòng Lệnh (Nếu Máy Có Cài JDK 17+)
Bạn chỉ cần nhấp đúp chuột vào file:
```
build-apk.bat
```
hoặc mở Terminal gõ:
```bash
npm run build:apk
```
File APK sẽ xuất hiện tại:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

### Cách 3: Tự Động Build Trên GitHub Actions (Không Cần Cài Gì Lên Máy)
Đã cấu hình sẵn file CI/CD: [`.github/workflows/build-mobile.yml`](.github/workflows/build-mobile.yml).
Khi bạn đẩy code lên repository GitHub (hoặc bấm **Run workflow**):
- Máy chủ Ubuntu Cloud sẽ tự động biên dịch và tạo link tải trực tiếp file `TTPhim-Android-APK` trong tab **Actions > Artifacts**.

---

## 🍏 PHẦN 2: XUẤT FILE IPA (CHO IPHONE / IOS)

### ⚠️ Lưu ý kỹ thuật quan trọng của Apple:
Apple **bắt buộc** phải sử dụng hệ điều hành **macOS** kết hợp với **Xcode** (`xcodebuild`) để biên dịch mã nguồn Swift/Objective-C và ký chứng chỉ bảo mật cho file `.ipa`. Hệ điều hành **Windows không thể tạo trực tiếp file .ipa cục bộ** nếu không thông qua máy Mac hoặc Cloud CI/CD.

---

### Cách 1: Mở Bằng Xcode Trên Máy Mac
1. Sao chép thư mục `f:\Tài\film\ios\App` sang máy Mac (hoặc mở trực tiếp nếu dùng máy ảo / Mac mini).
2. Nhấp đúp mở file:
   ```
   ios/App/App.xcworkspace
   ```
3. Trong Xcode:
   - Chọn thiết bị đích: **Any iOS Device (arm64)**.
   - Chọn menu: **Product -> Archive**.
   - Khi cửa sổ Archives hiện ra, bấm **Distribute App** -> Chọn **Ad Hoc** hoặc **Development** -> Bấm **Export** để lưu file `.ipa`.

---

### Cách 2: Tự Động Build File IPA Trên GitHub Actions (Cloud macOS Miễn Phí)
Bạn **không cần sở hữu máy Mac**! File [`.github/workflows/build-mobile.yml`](.github/workflows/build-mobile.yml) đã được cấu hình chạy trên runner **macOS 14 (Sonoma)** miễn phí của GitHub:
1. Đẩy mã nguồn lên GitHub.
2. Vào mục **Actions** trên GitHub, chọn workflow **Build TTPhim APK & IPA** và bấm **Run workflow**.
3. Máy chủ macOS của GitHub sẽ tự động:
   - Cài CocoaPods.
   - Biên dịch Xcode Archive.
   - Đóng gói thành file `TTPhim-unsigned.ipa`.
4. Bạn chỉ cần tải file `.ipa` từ mục **Artifacts** về máy.
5. Để cài file `.ipa` lên iPhone:
   - Sử dụng phần mềm **Sideloadly**, **AltStore**, hoặc **TrollStore** cài qua dây cáp USB trong 1 phút!

---

## ⚡ PHẦN 3: ĐỒNG BỘ DỮ LIỆU KHI CHỈNH SỬA GIAO DIỆN
Bất cứ khi nào bạn chỉnh sửa HTML/CSS/JS trong `public/` hoặc `public/mobile/`, chỉ cần chạy lệnh sau để cập nhật sang cả Android và iOS:
```bash
npm run cap:sync
```
Lệnh này sẽ tự động copy toàn bộ nội dung mới nhất vào cả thư mục `android/` và `ios/`!
