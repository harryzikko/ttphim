# Rà ứng dụng Flutter: IPA, APK điện thoại, APK Android TV

## Phạm vi và môi trường

- Rà mã native Flutter trong `mobile_app`, hai entrypoint `lib/main.dart` và `lib/main_tv.dart`, manifest/plist và workflow GitHub tạo APK/IPA.
- Android/iOS ở gốc dự án là cấu trúc Capacitor khác, không phải platform project mà workflow Flutter dùng.
- Tải Flutter **3.24.5 / Dart 3.5.4** vào thư mục scratch để chạy analyze/test. Không scaffold đè platform project vào workspace; bản scaffold dùng để kiểm tra nằm trong scratch.
- Không sửa tài khoản/admin hoặc dữ liệu DB trong đợt này. Giữ các thay đổi web/backend có trước.

## Lỗi phát hiện và đã sửa

### Chung cho APK mobile và IPA

1. **23 lỗi compile ban đầu** (analyzer tổng 30 issue, còn lại cảnh báo/info): callback CachedNetworkImage thiếu tham số; player gọi saveHistory sai signature; kiểu WatchHistory không tồn tại; getter thumbUrl không tồn tại. Đã sửa các caller theo model/API hiện tại.
2. Request tìm kiếm cũ có thể ghi đè kết quả mới hoặc hiện lại kết quả sau khi xóa từ khóa: thêm generation guard.
3. Request phân trang cũ có thể thêm dữ liệu vào bộ lọc mới, tăng page quá sớm: guard theo lượt load, chỉ cập nhật page khi nhận dữ liệu, loại phim trùng khi append.
4. Player không lưu tiến trình cuối khi dispose; lưu xong có thể đánh dấu nhầm tập vừa đổi: lưu trước khi dispose, capture episode/server cho thao tác lưu.
5. Server trống có thể crash `.episodes.first`: guard trước switch server.
6. Native video init không có deadline: timeout 20 giây. Giữ generation guard đã có từ lượt trước.
7. Auto-next ở cài đặt không lưu và không ảnh hưởng player: lưu SharedPreferences và đọc vào player.
8. Nút xóa cache chỉ báo thành công: dùng DefaultCacheManager.emptyCache và xóa image cache thật; bỏ số dung lượng giả.
9. Sheet xác nhận TV gọi setModalState sau khi đóng: kiểm tra context.mounted, dispose TextEditingController khi sheet đóng.
10. API TV/person dò localhost/10.0.2.2 nên không hoạt động trên máy thật: dùng `BACKEND_URL` qua dart-define; không tự giả định địa chỉ production.
11. Mobile xác nhận TV không có Bearer token: thêm màn hình đăng nhập tài khoản, lưu phiên và gửi Authorization. Chưa cấu hình backend/chưa đăng nhập có thông báo rõ.
12. Banner/ranking tải nguyên db.json GitHub thay API và xếp hạng tải chi tiết tuần tự: chuyển sang API home, cache/gộp request home; chi tiết phim ưu tiên backend rồi fallback PhimAPI.

### Android TV

1. Card nhận focus nhưng OK/Enter không mở phim: xử lý select/enter/space.
2. QR dùng URL trang HTML làm URL ảnh: tạo QR local bằng qr_flutter từ destination URL thật.
3. Backend lỗi vẫn hiện mã demo không thể xác thực: bỏ demo, hiện trạng thái lỗi/chưa cấu hình; hạn QR sửa từ 10 về 5 phút theo server.
4. JWT được duyệt bị bỏ: kiểm tra token/user, lưu trước callback thành công; các request backend đọc lại token từ storage.
5. Poll chồng request và kết quả phiên cũ sau refresh: guard polling/generation, xử lý expired.
6. Lên/xuống luôn ẩn controls và chặn focus traversal: tách shortcuts khi controls ẩn và navigation khi hiện; bổ sung nút Phát/Tạm dừng focus được.
7. TV không resume tiến trình; nút Tiếp tục mở tập đầu dù nhãn ghi tập khác: chọn server/tập lịch sử và seek đúng tập còn xem dở.
8. TV không lưu trước đổi tập/thoát, HLS lỗi không dùng embed có sẵn: bổ sung lưu và fallback.
9. Ảnh card/banner dùng URL tương đối: dùng fullPosterUrl/fullThumbUrl.
10. Test QR phát hiện tràn ngang ở 1280 px: top status chuyển Wrap, retest đạt.

### Build/config

- Tách matrix mobile/TV với organization/application ID khác để không ghi đè nhau khi cài. Mobile bỏ LEANBACK_LAUNCHER.
- Mobile build một lần, TV build một lần, artifact riêng; không build mobile lặp lại để phục hồi output.
- Pin Flutter 3.24.5 và thêm pubspec.lock. CI resolve với --enforce-lockfile, chạy analyze/test trước build.
- CI truyền GitHub variable `BACKEND_URL` bằng dart-define cho cả APK/IPA. Test CI dùng backend giả để kiểm tra QR/token thật qua mock.
- Không patch toàn bộ plugin cache. Dependency đã kiểm tra dùng compileSdk 34/minSdk tối đa 21, giữ mức này.
- iOS Info.plist dùng PRODUCT_BUNDLE_IDENTIFIER/FLUTTER_BUILD_NAME/FLUTTER_BUILD_NUMBER, tránh mismatch signing/version.
- pod install không còn nuốt lỗi.
- Ignore cache/output Flutter, giữ lockfile/test/mã nguồn.

## Kiểm chứng đã chạy

- **Mã nguồn workspace cuối:** `flutter analyze --no-fatal-infos`: **No issues found**.
- **7/7 Flutter unit/widget tests đạt** với BACKEND_URL giả: history/progress, preference/session, parse API, remote card activation, request search sai thứ tự, QR thật/lưu token trước success, Bearer authorization.
- **Compile Dart bundle mobile và TV thành công** trên mã cuối; kernel_blob.bin được tạo cho hai entrypoint. Đây là Flutter/Dart bundle, KHÔNG phải APK/IPA native release.
- Bản scaffold giống CI: analyzer không có error/warning; còn 18 lint info (const, empty catch, interpolation...). CI dùng --no-fatal-infos, vẫn chặn error/warning.
- `flutter pub get --enforce-lockfile`: đạt.
- AndroidManifest.xml và Info.plist XML parse: đạt. Workflow YAML parse và matrix hai target: đạt. `git diff --check` phần app/workflow/gitignore: đạt.
- Plugin iOS đã kiểm tra yêu cầu tối đa iOS 12; template scaffold deployment target 12.0 tương thích.
- Artifact mobile cũ trong build_output là Flutter native; APK có arm64-v8a/armeabi-v7a/x86_64. IPA có Runner.app/Flutter framework, không có embedded.mobileprovision (không xác minh được signing hợp lệ trên Windows).

## Blocker và vấn đề còn lại

1. **Chưa tạo APK/IPA mới.** Flutter doctor xác nhận thiếu Android SDK; Windows không có Xcode/macOS. Các file cũ trong build_output không chứa các sửa mới. Chưa chạy GitHub build hoặc push/commit.
2. **BACKEND_URL thật chưa được cung cấp.** Đặt GitHub repository variable BACKEND_URL thành HTTPS của server app, hoặc build với `--dart-define=BACKEND_URL=https://...`. Nếu để rỗng, nguồn phim PhimAPI vẫn có fallback nhưng TV auth/person/admin home không thể đồng bộ. Không dùng localhost trên điện thoại/TV thật.
3. **Chưa chạy app trên iPhone/Android/Android TV thật.** HLS/WebView, đổi nguồn, thoát lúc init, fullscreen, bàn phím/remote và việc quay lại màn hình cần device integration test. Widget test card không chứng minh toàn bộ remote player trên thiết bị.
4. **APK release hiện scaffold vẫn dùng debug signing.** Cần keystore release bền vững và cấu hình signing cho cập nhật/phát hành. Các CI run dùng debug key không phải chiến lược ký production.
5. **IPA unsigned cần ký lại bằng certificate/provisioning phù hợp** trước cài; job zip không làm nó thành IPA App Store/TestFlight.
6. **Token đang lưu SharedPreferences**, không phải encrypted Keychain/Keystore. Cần secure storage, logout và quản lý phiên đầy đủ trước phát hành công khai. Favorites/history app vẫn local, chưa đồng bộ toàn bộ thư viện website theo tài khoản.
7. Chọn chất lượng ưu tiên trong profile vẫn là cài đặt UI, chưa điều khiển track HLS native. Không khẳng định 1080p/4K được áp dụng. TV banner vẫn dùng icon launcher thay banner 320x180 chuẩn store.
8. ATS iOS/cleartext Android còn cho phép HTTP rộng để tương thích nguồn media; cần rà domain/media và thu hẹp cho bản production. Target Android 34 cần đánh giá lại yêu cầu store tại thời điểm phát hành.
9. Đã dừng sau các lỗi có căn cứ được sửa/test; không khẳng định app hoàn toàn không còn bug.

## Chạy kiểm thử/build

```text
cd mobile_app
flutter pub get --enforce-lockfile
flutter analyze --no-fatal-infos
flutter test --dart-define=BACKEND_URL=https://backend.test
flutter build apk --release --dart-define=BACKEND_URL=https://YOUR_BACKEND
flutter build apk --release -t lib/main_tv.dart --dart-define=BACKEND_URL=https://YOUR_BACKEND
```

APK mobile/TV application ID riêng được cấu hình trong workflow matrix. Build local cần scaffold platform tương ứng và áp manifest như workflow. IPA cần macOS/Xcode; signing phát hành nằm ngoài kiểm chứng đợt này.
