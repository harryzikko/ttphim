# Bản cài ngoài Android và IPA unsigned

## Trạng thái hoàn thiện

Tài liệu này cập nhật các mục còn thiếu trong MOBILE_APP_AUDIT.md của đợt rà trước.

- Token/user dùng flutter_secure_storage: Android encrypted preferences/Keystore, iOS Keychain. Phiên cũ từ SharedPreferences được migrate và xóa bản plaintext.
- Có màn hình Tài khoản trên mobile và Android TV: đăng nhập, khôi phục phiên, đăng xuất. Response khôi phục đến muộn sau logout không đăng nhập lại tài khoản cũ. HTTP 401 xóa phiên hiện tại, lỗi mạng không tự logout.
- Yêu thích và lịch sử tài khoản đọc/cập nhật API website. Cache phân tách theo user; dữ liệu khách được giữ riêng. Yêu thích bị backend từ chối sẽ báo lỗi, không báo thành công giả.
- Tiến trình offline lưu local và đánh dấu pending; gửi lại khi đọc lịch sử có kết nối. Lịch sử đã xóa từ website không bị cache đã đồng bộ làm hiện lại.
- Thư viện mobile làm mới khi thay đổi phiên và khi vào tab. Request dữ liệu của tài khoản cũ không được hiển thị sau logout.
- Bỏ lựa chọn chất lượng 1080p/720p chỉ đổi nhãn. Hiện ghi đúng khả năng: player tự thích ứng theo nguồn/mạng, không cam kết nguồn có 4K hay ép chất lượng.
- Banner TV drawable 320×180 đã có và được áp trong workflow. Android tắt backup để tránh khôi phục token mã hóa sang thiết bị khác; giữ HTTP cho LAN/media tương thích.
- Workflow kiểm tra BACKEND_URL có http/https, không rỗng và không trỏ localhost/emulator trước khi build.
- APK mobile/TV application ID riêng; build release tối ưu bằng debug signing mặc định, không cần release keystore. Android vẫn yêu cầu chữ ký để cài ngoài. Debug key của các lần CI có thể khác nhau: nếu cài cập nhật báo signature mismatch, cần gỡ bản cũ (mất dữ liệu local) hoặc dùng cùng key.
- IPA build --no-codesign, loại thư mục chữ ký/provisioning và chữ ký Mach-O trước zip. Không dùng certificate hoặc profile phát hành. IPA unsigned là gói để ký/sideload theo công cụ của bạn, không phải file iOS thường có thể cài trực tiếp mà không có cơ chế ký phù hợp.

## Cấu hình khi build

Theo lựa chọn của bạn, không có ô đổi server trong app. Đặt GitHub repository variable **BACKEND_URL** tại Settings → Secrets and variables → Actions → Variables.

Ví dụ:

- HTTPS: `https://your-server.example`
- LAN: `http://192.168.1.10:3001` (điện thoại/TV phải cùng mạng và firewall cho phép cổng này).

Không đặt `http://localhost:3001`: trên thiết bị thật đó là chính điện thoại/TV, không phải máy tính chạy server. Nếu thay IP/domain cần build lại.

Workflow: `.github/workflows/build-mobile.yml` → Run workflow. Hiện chưa push hoặc chạy workflow cho các sửa đổi này.

## Đã kiểm chứng trên mã cuối

- Flutter 3.24.5/Dart 3.5.4: `flutter pub get --enforce-lockfile` đạt.
- `flutter analyze --no-fatal-infos`: No issues found.
- **14/14 Flutter tests đạt**, gồm secure storage/mock, migration, logout, 401, response đến muộn, cách ly tài khoản/khách, đồng bộ offline, QR và remote OK.
- Compile Dart bundle `lib/main.dart` và `lib/main_tv.dart`: đạt. Đây không phải APK hoặc IPA native.
- Workflow YAML, Android manifest, iOS plist, TV banner XML: parse hợp lệ.
- Kiểm tra dependency secure storage dùng compileSdk 34/minSdk 19, tương thích workflow compileSdk 34/minSdk 21.
- `git diff --check` app/workflow: đạt.

## Giới hạn còn lại

- Bạn chọn cấu hình BACKEND_URL sau; chưa có URL thật nên chưa kiểm chứng kết nối app với backend của bạn.
- Máy này thiếu Android SDK và là Windows không có Xcode: **chưa tạo APK/IPA mới**, chưa chạy CI. Artifact cũ không tự nhận mã mới.
- Chưa kiểm thử Keychain/Keystore, HLS/WebView, fullscreen và remote trên thiết bị Android/iPhone/TV thật. Unit/widget test dùng mock cho native storage/API.
- Giữ hỗ trợ HTTP/ATS rộng cho bản cài ngoài; nên dùng HTTPS cho dữ liệu đăng nhập, kể cả không phát hành store.
- Đồng bộ pending progress diễn ra khi app đọc lịch sử, không phải tác vụ nền khi app đã tắt. Các bản APK/IPA chỉ có sửa đổi sau khi build lại.
