# CineViet Desktop (Tauri v2 · Rust Prototype)

Khung ứng dụng Desktop thử nghiệm cho **CineViet** sử dụng **Tauri v2** (nhân Rust + WebView2 trên Windows / WebKit trên macOS / WebKitGTK trên Linux).

## Cấu trúc
- `src-tauri/` — Backend Rust (`probe_server`, `get_desktop_info`, `toggle_fullscreen`, `clear_desktop_cache`) và cấu hình `tauri.conf.json`.
- `ui/` — Giao diện preflight tối giản, tự kiểm tra độ trễ kết nối rồi mở trực tiếp `https://cineviet.live` (hoặc `http://localhost:3001` khi phát triển).

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

## Build file cài đặt (.exe / .msi / .dmg / .AppImage)
```bash
cd desktop_app
npm run build
```
