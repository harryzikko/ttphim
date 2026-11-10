#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK trên Linux dễ gặp màn hình đen hoặc treo khung video qua DMA-BUF (Wayland/NVIDIA/VM).
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    cineviet_desktop_lib::run()
}
