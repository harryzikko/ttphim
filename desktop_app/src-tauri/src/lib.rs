use serde::{Deserialize, Serialize};
use std::fs;
use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

const DEFAULT_ORIGIN: &str = "https://cineviet.live";
const TELEGRAM_URL: &str = "https://t.me/cinevietlivee";
const SUPPORT_MAILTO: &str = "mailto:admin@cineviet.live";
const RELEASES_URL: &str = "https://github.com/harryzikko/ttphim/releases/tag/latest";
const UPDATE_MANIFEST_URL: &str =
    "https://github.com/harryzikko/ttphim/releases/download/latest/desktop-version.json";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInfo {
    name: &'static str,
    version: &'static str,
    os: &'static str,
    arch: &'static str,
    default_origin: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProbeResult {
    reachable: bool,
    latency_ms: Option<u64>,
    error: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DesktopConfig {
    selected_origin: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
struct DesktopUpdateManifest {
    version: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    windows_url: String,
    #[serde(default)]
    macos_url: String,
    #[serde(default)]
    linux_url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopUpdateStatus {
    has_update: bool,
    current_version: &'static str,
    latest_version: String,
    download_url: String,
    notes: String,
}

fn format_host_port(host: &str, port: u16) -> Result<String, String> {
    let trimmed = host.trim();
    if trimmed.is_empty() || trimmed.contains(['/', '?', '#', ' ']) {
        return Err("Tên máy chủ không hợp lệ".to_string());
    }
    Ok(format!("{trimmed}:{port}"))
}

fn is_allowed_external_popup(url: &tauri::Url) -> bool {
    let scheme = url.scheme();
    if scheme == "mailto" || scheme == "tg" {
        return true;
    }
    if scheme != "https" && scheme != "http" {
        return false;
    }
    matches!(
        url.host_str(),
        Some(
            "t.me"
                | "telegram.me"
                | "github.com"
                | "cineviet.live"
                | "www.cineviet.live"
        )
    )
}

fn is_cineviet_host(url: &tauri::Url) -> bool {
    matches!(
        url.host_str(),
        Some("cineviet.live" | "www.cineviet.live" | "localhost" | "127.0.0.1")
    )
}

fn should_open_externally_on_nav(url: &tauri::Url) -> bool {
    let scheme = url.scheme();
    if scheme == "mailto" || scheme == "tg" {
        return true;
    }
    if matches!(url.host_str(), Some("t.me" | "telegram.me")) {
        return true;
    }
    false
}

/// Lấy URL HTTP(S) của trang hiện tại để mở bằng trình duyệt mặc định khi người dùng cần.
fn resolve_external_browser_url(current_url: Option<&tauri::Url>, fallback_origin: &str) -> String {
    current_url
        .filter(|url| matches!(url.scheme(), "http" | "https"))
        .map(|url| url.to_string())
        .unwrap_or_else(|| fallback_origin.to_string())
}

fn parse_semver(value: &str) -> Vec<u32> {
    value
        .trim()
        .trim_start_matches(['v', 'V'])
        .split(['.', '-', '+'])
        .filter_map(|part| part.parse::<u32>().ok())
        .collect()
}

fn is_newer_semver(latest: &str, current: &str) -> bool {
    let l = parse_semver(latest);
    let c = parse_semver(current);
    let max_len = l.len().max(c.len());
    for i in 0..max_len {
        let lv = *l.get(i).unwrap_or(&0);
        let cv = *c.get(i).unwrap_or(&0);
        if lv > cv {
            return true;
        }
        if lv < cv {
            return false;
        }
    }
    false
}

fn pick_platform_download_url(manifest: &DesktopUpdateManifest) -> String {
    let candidate = match std::env::consts::OS {
        "windows" => &manifest.windows_url,
        "macos" => &manifest.macos_url,
        "linux" => &manifest.linux_url,
        _ => "",
    };
    if candidate.starts_with("https://") {
        candidate.to_string()
    } else {
        RELEASES_URL.to_string()
    }
}

fn config_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join("desktop_config.json"))
}

fn load_saved_origin(app: &AppHandle) -> String {
    let Some(path) = config_path(app) else {
        return DEFAULT_ORIGIN.to_string();
    };
    let Ok(raw) = fs::read_to_string(path) else {
        return DEFAULT_ORIGIN.to_string();
    };
    let Ok(cfg) = serde_json::from_str::<DesktopConfig>(&raw) else {
        return DEFAULT_ORIGIN.to_string();
    };
    match cfg.selected_origin {
        Some(origin)
            if origin == "https://cineviet.live" || origin == "http://localhost:3001" =>
        {
            origin
        }
        _ => DEFAULT_ORIGIN.to_string(),
    }
}

fn store_saved_origin(app: &AppHandle, origin: &str) {
    if origin != "https://cineviet.live" && origin != "http://localhost:3001" {
        return;
    }
    if let Some(path) = config_path(app) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let cfg = DesktopConfig {
            selected_origin: Some(origin.to_string()),
        };
        if let Ok(json) = serde_json::to_string_pretty(&cfg) {
            let _ = fs::write(path, json);
        }
    }
}

fn fetch_desktop_update() -> Result<DesktopUpdateStatus, String> {
    let current = env!("CARGO_PKG_VERSION");
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(7))
        .build();
    let resp = agent
        .get(UPDATE_MANIFEST_URL)
        .set("User-Agent", &format!("CineVietDesktop/{current}"))
        .call()
        .map_err(|e| format!("Không kiểm tra được bản cập nhật: {e}"))?;
    let manifest: DesktopUpdateManifest = resp
        .into_json()
        .map_err(|e| format!("Dữ liệu phiên bản không hợp lệ: {e}"))?;
    let has_update = is_newer_semver(&manifest.version, current);
    Ok(DesktopUpdateStatus {
        has_update,
        current_version: current,
        latest_version: manifest.version.clone(),
        download_url: pick_platform_download_url(&manifest),
        notes: manifest.notes,
    })
}

fn check_updates_with_dialog(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || match fetch_desktop_update() {
        Ok(status) if status.has_update => {
            let notes_text = if status.notes.trim().is_empty() {
                String::new()
            } else {
                format!("\n\n{}", status.notes.trim())
            };
            let msg = format!(
                "Đã có phiên bản CineViet Desktop v{} (bản hiện tại: v{}).{notes_text}\n\nNhấn OK để mở trang tải bản cài đặt mới nhất.",
                status.latest_version, status.current_version
            );
            let url = status.download_url;
            let open_handle = handle.clone();
            handle
                .dialog()
                .message(msg)
                .title("Cập nhật CineViet Desktop")
                .kind(MessageDialogKind::Info)
                .buttons(MessageDialogButtons::OkCancel)
                .show(move |confirmed| {
                    if confirmed {
                        let _ = open_handle.opener().open_url(url, None::<&str>);
                    }
                });
        }
        Ok(status) => {
            handle
                .dialog()
                .message(format!(
                    "Bạn đang sử dụng phiên bản mới nhất (v{}).",
                    status.current_version
                ))
                .title("Kiểm tra cập nhật")
                .kind(MessageDialogKind::Info)
                .show(|_| {});
        }
        Err(_) => {
            let open_handle = handle.clone();
            handle
                .dialog()
                .message(format!(
                    "Hiện chưa kiểm tra tự động được từ GitHub Releases (phiên bản hiện tại: v{}).\nNhấn OK để mở trang phát hành trên trình duyệt.",
                    env!("CARGO_PKG_VERSION")
                ))
                .title("Kiểm tra cập nhật")
                .kind(MessageDialogKind::Warning)
                .buttons(MessageDialogButtons::OkCancel)
                .show(move |confirmed| {
                    if confirmed {
                        let _ = open_handle.opener().open_url(RELEASES_URL, None::<&str>);
                    }
                });
        }
    });
}

#[tauri::command]
fn get_desktop_info(app: AppHandle) -> DesktopInfo {
    DesktopInfo {
        name: "CineViet Desktop",
        version: env!("CARGO_PKG_VERSION"),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        default_origin: load_saved_origin(&app),
    }
}

#[tauri::command]
fn save_selected_origin(app: AppHandle, origin: String) {
    store_saved_origin(&app, &origin);
}

#[tauri::command]
fn probe_server(host: String, port: u16) -> ServerProbeResult {
    let addr_str = match format_host_port(&host, port) {
        Ok(value) => value,
        Err(err) => {
            return ServerProbeResult {
                reachable: false,
                latency_ms: None,
                error: Some(err),
            }
        }
    };

    let start = Instant::now();
    let timeout = Duration::from_secs(4);
    let mut addrs = match addr_str.to_socket_addrs() {
        Ok(iter) => iter,
        Err(err) => {
            return ServerProbeResult {
                reachable: false,
                latency_ms: None,
                error: Some(format!("Không phân giải được DNS: {err}")),
            }
        }
    };

    if let Some(addr) = addrs.next() {
        match TcpStream::connect_timeout(&addr, timeout) {
            Ok(_) => ServerProbeResult {
                reachable: true,
                latency_ms: Some(start.elapsed().as_millis() as u64),
                error: None,
            },
            Err(err) => ServerProbeResult {
                reachable: false,
                latency_ms: None,
                error: Some(format!("Không thể kết nối: {err}")),
            },
        }
    } else {
        ServerProbeResult {
            reachable: false,
            latency_ms: None,
            error: Some("Không tìm thấy địa chỉ IP máy chủ".to_string()),
        }
    }
}

#[tauri::command]
fn toggle_fullscreen(window: WebviewWindow) -> Result<bool, String> {
    let current = window.is_fullscreen().map_err(|e| e.to_string())?;
    let next = !current;
    window.set_fullscreen(next).map_err(|e| e.to_string())?;
    Ok(next)
}

#[tauri::command]
fn clear_desktop_cache(window: WebviewWindow) -> Result<(), String> {
    window
        .clear_all_browsing_data()
        .map_err(|e| format!("Không thể xóa bộ nhớ đệm WebView: {e}"))
}

#[tauri::command]
fn check_desktop_update() -> Result<DesktopUpdateStatus, String> {
    fetch_desktop_update()
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn handle_menu_action(app: &AppHandle, action_id: &str) {
    match action_id {
        "show_window" => focus_main_window(app),
        "go_home" => {
            focus_main_window(app);
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(url) = load_saved_origin(app).parse() {
                    let _ = window.navigate(url);
                }
            }
        }
        "go_launcher" => {
            focus_main_window(app);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval("window.location.href = 'tauri://localhost/index.html'");
            }
        }
        "nav_back" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval("window.history.back()");
            }
        }
        "nav_forward" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval("window.history.forward()");
            }
        }
        "reload_page" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.reload();
            }
        }
        "open_in_browser" => {
            if let Some(window) = app.get_webview_window("main") {
                let current_url = window.url().ok();
                let target =
                    resolve_external_browser_url(current_url.as_ref(), &load_saved_origin(app));
                let _ = app.opener().open_url(target, None::<&str>);
            }
        }
        "toggle_fullscreen" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = toggle_fullscreen(window);
            }
        }
        "clear_cache" => {
            if let Some(window) = app.get_webview_window("main") {
                match window.clear_all_browsing_data() {
                    Ok(_) => {
                        app.dialog()
                            .message("Đã xóa sạch bộ nhớ đệm WebView (cookies & cache). Nếu đang xem phim, hãy tải lại trang để làm mới phiên.")
                            .title("CineViet Desktop")
                            .kind(MessageDialogKind::Info)
                            .show(|_| {});
                    }
                    Err(err) => {
                        app.dialog()
                            .message(format!("Không thể xóa cache WebView: {err}"))
                            .title("CineViet Desktop")
                            .kind(MessageDialogKind::Error)
                            .show(|_| {});
                    }
                }
            }
        }
        "check_update" => check_updates_with_dialog(app),
        "open_telegram" => {
            let _ = app.opener().open_url(TELEGRAM_URL, None::<&str>);
        }
        "open_support_email" => {
            let _ = app.opener().open_url(SUPPORT_MAILTO, None::<&str>);
        }
        "quit_app" => app.exit(0),
        _ => {}
    }
}

fn build_app_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let nav_menu = SubmenuBuilder::new(app, "Điều hướng")
        .item(
            &MenuItemBuilder::with_id("go_home", "Trang chủ CineViet")
                .accelerator("CmdOrCtrl+Shift+H")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("nav_back", "Quay lại")
                .accelerator("Alt+Left")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("nav_forward", "Đi tiếp")
                .accelerator("Alt+Right")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("reload_page", "Tải lại trang")
                .accelerator("CmdOrCtrl+R")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("open_in_browser", "Mở trang hiện tại bằng trình duyệt")
                .accelerator("CmdOrCtrl+Shift+O")
                .build(app)?,
        )
        .separator()
        .item(&MenuItemBuilder::with_id("go_launcher", "Đổi máy chủ / Trạng thái").build(app)?)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "Hiển thị · Hệ thống")
        .item(
            &MenuItemBuilder::with_id("toggle_fullscreen", "Toàn màn hình (F11)")
                .accelerator("F11")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("clear_cache", "Xóa bộ nhớ đệm WebView")
                .accelerator("CmdOrCtrl+Shift+C")
                .build(app)?,
        )
        .separator()
        .item(&MenuItemBuilder::with_id("check_update", "Kiểm tra cập nhật...").build(app)?)
        .item(&PredefinedMenuItem::quit(app, Some("Thoát CineViet"))?)
        .build()?;

    let support_menu = SubmenuBuilder::new(app, "Hỗ trợ")
        .item(&MenuItemBuilder::with_id("open_telegram", "Kênh Telegram @cinevietlivee").build(app)?)
        .item(&MenuItemBuilder::with_id("open_support_email", "Email: admin@cineviet.live").build(app)?)
        .build()?;

    MenuBuilder::new(app)
        .item(&nav_menu)
        .item(&view_menu)
        .item(&support_menu)
        .build()
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let tray_menu = MenuBuilder::new(app)
        .item(&MenuItemBuilder::with_id("show_window", "Mở cửa sổ CineViet").build(app)?)
        .item(&MenuItemBuilder::with_id("go_home", "Về Trang chủ").build(app)?)
        .item(&MenuItemBuilder::with_id("reload_page", "Tải lại trang").build(app)?)
        .item(&MenuItemBuilder::with_id("open_in_browser", "Mở bằng trình duyệt mặc định").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("clear_cache", "Xóa bộ nhớ đệm cache").build(app)?)
        .item(&MenuItemBuilder::with_id("check_update", "Kiểm tra cập nhật").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("open_telegram", "Telegram @cinevietlivee").build(app)?)
        .item(&MenuItemBuilder::with_id("quit_app", "Thoát").build(app)?)
        .build()?;

    let mut builder = TrayIconBuilder::with_id("cineviet-tray")
        .tooltip("CineViet Desktop")
        .menu(&tray_menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                focus_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}

fn create_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let nav_handle = app.clone();
    let popup_handle = app.clone();

    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("CineViet — Rạp Phim Trực Tuyến")
        .inner_size(1360.0, 840.0)
        .min_inner_size(960.0, 600.0)
        .center()
        .theme(Some(tauri::Theme::Dark))
        .background_color(tauri::window::Color(11, 13, 19, 255))
        .on_navigation(move |url| {
            if should_open_externally_on_nav(url) {
                let _ = nav_handle.opener().open_url(url.as_str(), None::<&str>);
                return false;
            }
            true
        })
        .on_new_window(move |url, _features| {
            if is_cineviet_host(&url) && !url.path().starts_with("/downloads/") {
                if let Some(win) = popup_handle.get_webview_window("main") {
                    let _ = win.navigate(url);
                }
                return NewWindowResponse::Deny;
            }
            if is_allowed_external_popup(&url) {
                let _ = popup_handle.opener().open_url(url.as_str(), None::<&str>);
            }
            NewWindowResponse::Deny
        })
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let menu = build_app_menu(app.handle())?;
            app.set_menu(menu)?;
            setup_tray(app.handle())?;
            create_main_window(app.handle())?;
            app.on_menu_event(|app_handle, event| {
                handle_menu_action(app_handle, event.id().as_ref());
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_desktop_info,
            save_selected_origin,
            probe_server,
            toggle_fullscreen,
            clear_desktop_cache,
            check_desktop_update
        ])
        .run(tauri::generate_context!())
        .expect("Lỗi khởi chạy ứng dụng CineViet Desktop");
}

#[cfg(test)]
mod tests {
    use super::{
        format_host_port, is_allowed_external_popup, is_newer_semver, resolve_external_browser_url,
        should_open_externally_on_nav,
    };

    #[test]
    fn validates_server_host_before_probing() {
        assert_eq!(
            format_host_port("cineviet.live", 443).unwrap(),
            "cineviet.live:443"
        );
        assert!(format_host_port("", 443).is_err());
        assert!(format_host_port("https://cineviet.live", 443).is_err());
    }

    #[test]
    fn compares_semver_versions_correctly() {
        assert!(is_newer_semver("1.0.1", "1.0.0"));
        assert!(is_newer_semver("v1.1.0", "1.0.9"));
        assert!(!is_newer_semver("1.0.0", "1.0.0"));
        assert!(!is_newer_semver("0.9.9", "1.0.0"));
    }

    #[test]
    fn routes_external_and_telegram_links_safely() {
        let tg: tauri::Url = "https://t.me/cinevietlivee".parse().unwrap();
        let mail: tauri::Url = "mailto:admin@cineviet.live".parse().unwrap();
        let spam: tauri::Url = "https://unknown-popup-ads.example/offer".parse().unwrap();
        let embed: tauri::Url = "https://player.example/embed/123".parse().unwrap();

        assert!(should_open_externally_on_nav(&tg));
        assert!(should_open_externally_on_nav(&mail));
        assert!(!should_open_externally_on_nav(&embed));

        assert!(is_allowed_external_popup(&tg));
        assert!(is_allowed_external_popup(&mail));
        assert!(!is_allowed_external_popup(&spam));
    }

    #[test]
    fn resolves_external_browser_url_safely() {
        let watch_url: tauri::Url = "https://cineviet.live/xem/test-phim".parse().unwrap();
        let internal_url: tauri::Url = "tauri://localhost/index.html".parse().unwrap();
        let fallback = "https://cineviet.live";

        assert_eq!(
            resolve_external_browser_url(Some(&watch_url), fallback),
            "https://cineviet.live/xem/test-phim"
        );
        assert_eq!(
            resolve_external_browser_url(Some(&internal_url), fallback),
            fallback
        );
        assert_eq!(resolve_external_browser_url(None, fallback), fallback);
    }
}
