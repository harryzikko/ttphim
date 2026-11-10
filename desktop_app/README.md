# CineViet Desktop (Tauri v2 · Rust)

Ứng dụng Desktop đa nền tảng cho **CineViet** (`v1.0.0`) sử dụng **Tauri v2** (nhân Rust + WebView2 trên Windows / WebKit trên macOS / WebKitGTK trên Linux).

## Tính năng đã tích hợp
- **Single Instance (`tauri-plugin-single-instance`):** bấm lại biểu tượng app sẽ focus cửa sổ đang mở thay vì mở trùng nhiều cửa sổ.
- **Menu bar & System Tray:** luôn có Trang chủ, Quay lại (`Alt+Left`), Đi tiếp (`Alt+Right`), Tải lại (`Ctrl+R`), Toàn màn hình (`F11`), Đổi máy chủ, Xóa bộ nhớ đệm WebView (`Ctrl+Shift+C`), Kiểm tra cập nhật và link Telegram `@cinevietlivee` / `admin@cineviet.live`.
- **Chặn popup quảng cáo & mở link ngoài thông minh:** `target="_blank"` từ player lạ bị chặn ngay trong `on_new_window`; các link `t.me`, `mailto:`, `github.com` mở tự động bằng trình duyệt / ứng dụng mặc định qua `tauri-plugin-opener`.
- **Kiểm tra cập nhật (`desktop-version.json`):** đối chiếu phiên bản semver từ GitHub Releases `latest` và mở link tải bộ cài đúng hệ điều hành.

## Chạy thử nghiệm local
```bash
cd desktop_app
npm install
npm run dev
```

## Kiểm tra biên dịch Rust & test
```bash
cd desktop_app
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

## Build bộ cài đặt phát hành (`.exe` / `.msi` / `.dmg` / `.AppImage`)
```bash
cd desktop_app
npm install
npm run build
```
CI tự động build bộ cài đặt cho Windows, macOS và Linux nằm tại [`.github/workflows/build-desktop.yml`](../.github/workflows/build-desktop.yml).
