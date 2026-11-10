use serde::Serialize;
use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInfo {
    name: &'static str,
    version: &'static str,
    os: &'static str,
    arch: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerProbeResult {
    reachable: bool,
    latency_ms: Option<u64>,
    error: Option<String>,
}

fn format_host_port(host: &str, port: u16) -> Result<String, String> {
    let trimmed = host.trim();
    if trimmed.is_empty() || trimmed.contains(['/', '?', '#', ' ']) {
        return Err("Tên máy chủ không hợp lệ".to_string());
    }
    Ok(format!("{trimmed}:{port}"))
}

#[tauri::command]
fn get_desktop_info() -> DesktopInfo {
    DesktopInfo {
        name: "CineViet Desktop",
        version: env!("CARGO_PKG_VERSION"),
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
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
fn toggle_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
    let current = window.is_fullscreen().map_err(|e| e.to_string())?;
    let next = !current;
    window.set_fullscreen(next).map_err(|e| e.to_string())?;
    Ok(next)
}

#[tauri::command]
fn clear_desktop_cache(window: tauri::WebviewWindow) -> Result<(), String> {
    window
        .clear_all_browsing_data()
        .map_err(|e| format!("Không thể xóa bộ nhớ đệm WebView: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_desktop_info,
            probe_server,
            toggle_fullscreen,
            clear_desktop_cache
        ])
        .run(tauri::generate_context!())
        .expect("Lỗi khởi chạy ứng dụng CineViet Desktop");
}

#[cfg(test)]
mod tests {
    use super::format_host_port;

    #[test]
    fn validates_server_host_before_probing() {
        assert_eq!(
            format_host_port("cineviet.live", 443).unwrap(),
            "cineviet.live:443"
        );
        assert!(format_host_port("", 443).is_err());
        assert!(format_host_port("https://cineviet.live", 443).is_err());
    }
}
