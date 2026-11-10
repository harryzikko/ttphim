const invoke = window.__TAURI__?.core?.invoke;
const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');
const serverSelect = document.getElementById('server-select');
const metaLine = document.getElementById('meta-line');
const btnLaunch = document.getElementById('btn-launch');
const btnRetry = document.getElementById('btn-retry');
const btnClearCache = document.getElementById('btn-clear-cache');

let autoLaunchTimer = null;

function selectedOrigin() {
  return serverSelect.value;
}

function launch() {
  if (autoLaunchTimer) {
    clearTimeout(autoLaunchTimer);
    autoLaunchTimer = null;
  }
  window.location.replace(selectedOrigin());
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
      autoLaunchTimer = setTimeout(launch, 650);
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
      metaLine.textContent = `${info.name} v${info.version} (${info.os}/${info.arch})`;
    } catch (err) {
      metaLine.textContent = `Rust IPC lỗi: ${err}`;
    }
  } else {
    metaLine.textContent = 'Đang chạy ngoài Tauri runtime';
  }
  await checkServer();
}

btnLaunch.addEventListener('click', launch);
btnRetry.addEventListener('click', checkServer);
serverSelect.addEventListener('change', checkServer);

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

window.addEventListener('keydown', (e) => {
  if (e.key === 'F11' && invoke) {
    e.preventDefault();
    invoke('toggle_fullscreen').catch(() => {});
  }
});

init();
