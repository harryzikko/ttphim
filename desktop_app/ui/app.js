const invoke = window.__TAURI__?.core?.invoke;
const openExternal = window.__TAURI__?.opener?.openUrl;
const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');
const serverSelect = document.getElementById('server-select');
const metaLine = document.getElementById('meta-line');
const btnLaunch = document.getElementById('btn-launch');
const btnLaunchShort = document.getElementById('btn-launch-short');
const btnRetry = document.getElementById('btn-retry');
const btnClearCache = document.getElementById('btn-clear-cache');
const btnCheckUpdate = document.getElementById('btn-check-update');

let autoLaunchTimer = null;

function selectedOrigin() {
  return serverSelect.value;
}

function launch(pathSuffix = '') {
  if (autoLaunchTimer) {
    clearTimeout(autoLaunchTimer);
    autoLaunchTimer = null;
  }
  const base = selectedOrigin().replace(/\/+$/, '');
  window.location.replace(pathSuffix ? `${base}${pathSuffix}` : selectedOrigin());
}

async function checkServer() {
  if (autoLaunchTimer) {
    clearTimeout(autoLaunchTimer);
    autoLaunchTimer = null;
  }
  statusPill.className = 'status-pill';
  statusText.textContent = 'Đang kiểm tra kết nối...';

  const url = new URL(selectedOrigin());
  const host = url.hostname;
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));

  if (!invoke) {
    statusText.textContent = 'Chế độ trình duyệt — sẵn sàng mở';
    return;
  }

  try {
    const res = await invoke('probe_server', { host, port });
    if (res.reachable) {
      statusPill.className = 'status-pill ok';
      statusText.textContent = `Kết nối sẵn sàng (${res.latencyMs ?? 0} ms) — đang mở...`;
      autoLaunchTimer = setTimeout(() => launch(''), 600);
    } else {
      statusPill.className = 'status-pill err';
      statusText.textContent = res.error || 'Không thể kết nối máy chủ';
    }
  } catch (err) {
    statusPill.className = 'status-pill err';
    statusText.textContent = String(err);
  }
}

async function init() {
  if (invoke) {
    try {
      const info = await invoke('get_desktop_info');
      metaLine.textContent = `${info.name} v${info.version} (${info.os}/${info.arch}) · F11 Toàn màn hình`;
      if (info.defaultOrigin && [...serverSelect.options].some((o) => o.value === info.defaultOrigin)) {
        serverSelect.value = info.defaultOrigin;
      }
    } catch (err) {
      metaLine.textContent = `Rust IPC lỗi: ${err}`;
    }
  } else {
    metaLine.textContent = 'Đang chạy ngoài Tauri runtime';
  }
  await checkServer();
}

btnLaunch.addEventListener('click', () => launch(''));
btnLaunchShort?.addEventListener('click', () => launch('/short-phim'));
btnRetry.addEventListener('click', checkServer);

serverSelect.addEventListener('change', async () => {
  if (invoke) {
    invoke('save_selected_origin', { origin: selectedOrigin() }).catch(() => {});
  }
  await checkServer();
});

btnClearCache.addEventListener('click', async () => {
  if (!invoke) return;
  try {
    await invoke('clear_desktop_cache');
    statusPill.className = 'status-pill ok';
    statusText.textContent = 'Đã xóa bộ nhớ đệm WebView desktop!';
  } catch (err) {
    statusPill.className = 'status-pill err';
    statusText.textContent = String(err);
  }
});

btnCheckUpdate?.addEventListener('click', async () => {
  if (!invoke) return;
  if (autoLaunchTimer) {
    clearTimeout(autoLaunchTimer);
    autoLaunchTimer = null;
  }
  statusPill.className = 'status-pill';
  statusText.textContent = 'Đang kiểm tra phiên bản mới...';
  try {
    const res = await invoke('check_desktop_update');
    if (res.hasUpdate) {
      statusPill.className = 'status-pill ok';
      statusText.textContent = `Có bản mới v${res.latestVersion} (đang dùng v${res.currentVersion})`;
      if (res.downloadUrl && openExternal) {
        await openExternal(res.downloadUrl);
      }
    } else {
      statusPill.className = 'status-pill ok';
      statusText.textContent = `Bạn đang dùng bản mới nhất v${res.currentVersion}`;
    }
  } catch (err) {
    statusPill.className = 'status-pill err';
    statusText.textContent = 'Chưa kiểm tra được bản cập nhật lúc này';
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'F11' && invoke) {
    e.preventDefault();
    invoke('toggle_fullscreen').catch(() => {});
  }
});

init();
