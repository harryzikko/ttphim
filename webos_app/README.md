# CineViet LG webOS Smart TV App

Ứng dụng LG webOS TV (`live.cineviet.webos`, `v1.0.0`) thiết kế theo chuẩn **Nocturne Cinema** (`#0B0D13` + `#E50914` Cinema Red) đồng bộ với bản **CineViet Android TV**.

## Tính năng chính
- **Màn hình chính 10ft (`Nocturne Cinema`)**: Thanh điều hướng thu gọn bên trái (5 tab: Trang chủ, Phim bộ, Phim lẻ, Tìm kiếm, Tài khoản), Hero Spotlight Billboard, Tiếp tục xem, Bảng xếp hạng Top 10, Phim mới, Chiếu rạp, Phim bộ, Phim lẻ, TV Shows, Hoạt hình.
- **Điều khiển Remote & Magic Remote**: Hỗ trợ đầy đủ D-Pad (`Lên/Xuống/Trái/Phải/OK`), nút **Back (`461`)** qua cả `webOS.platformBack()` lẫn native `webOSSystem.platformBack()`, phím Media (`Play 415`, `Pause 19`, `Rewind 412`, `FastForward 417`, `Stop 413`, `Red 403`, `Green 404`) và Magic Remote hover.
- **Chi tiết phim & Trình phát TV HLS**: Tự động phục hồi kết nối HLS khi mạng TV chập chờn, nút **Tập sau** + đếm ngược tự chuyển tập khi hết phim, chọn server/tập, lưu tiến độ khi thoát hoặc chuyển nền.
- **Tìm kiếm bàn phím ảo TV** & **Đăng nhập TV QR + Mã 6 số**.

## Đóng gói `.ipk` (yêu cầu Node.js + `@webos-tools/cli`)
```bash
cd webos_app
npm install
npm run package
# File .ipk nằm tại webos_app/output/live.cineviet.webos_1.0.0_all.ipk
```

## Cài lên LG TV (Developer Mode / webOS Dev Manager)
1. Trên TV LG, vào **LG Content Store / Apps** cài ứng dụng **Developer Mode**, đăng nhập LG Developer Account, bật **Dev Mode Status** và **Key Server**.
2. Cài bằng giao diện **webOS Dev Manager** trên Windows/macOS (chọn `Install` -> tệp `.ipk`) hoặc qua CLI:
```bash
npx ares-setup-device    # thêm TV với IP, port 9922 và passphrase Developer Mode
npx ares-install --device <tên-tv> ./output/live.cineviet.webos_1.0.0_all.ipk
npx ares-launch --device <tên-tv> live.cineviet.webos
```
