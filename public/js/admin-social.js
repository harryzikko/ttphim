(function (root) {
  'use strict';

  const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
  const THREADS_MAX_CHARS = 500;

  let initialized = false;
  let activeFilter = 'all';
  let lastDashboard = null;
  let busy = false;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw, 'https://cineviet.live');
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return raw.startsWith('http://') || raw.startsWith('https://') ? parsed.toString() : '';
      }
      return '';
    } catch {
      return '';
    }
  }

  function formatVnDateTime(iso) {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return '--';
    return new Intl.DateTimeFormat('vi-VN', {
      timeZone: VN_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour12: false
    }).format(new Date(ms));
  }

  function toVnDatetimeLocal(iso) {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return '';
    return new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 16);
  }

  function vnDatetimeLocalToIso(localValue) {
    const raw = String(localValue || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return null;
    const ms = Date.parse(`${raw}:00.000+07:00`);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }

  function toast(message, type = 'info') {
    if (typeof root.showToast === 'function') {
      root.showToast(message, type);
    }
  }

  function statusBadgeHtml(status) {
    const map = {
      scheduled: { cls: 'bg-sky-500/15 text-sky-400 border-sky-500/30', label: 'Đã lên lịch' },
      publishing: { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30', label: 'Đang đăng...' },
      published: { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', label: 'Đã đăng' },
      partial: { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30', label: 'Đăng 1 phần' },
      failed: { cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30', label: 'Thất bại' },
      skipped: { cls: 'bg-surface-container-highest text-on-surface-variant border-surface-container-highest', label: 'Bỏ qua' }
    };
    const cfg = map[status] || { cls: 'bg-surface-container-highest text-on-surface-variant border-surface-container-highest', label: status || 'Không rõ' };
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${cfg.cls}">${escapeHtml(cfg.label)}</span>`;
  }

  function platformPillHtml(name, state) {
    const status = state?.status || 'pending';
    let cls = 'bg-surface-container text-on-surface-variant border-surface-container-highest/60';
    let label = `${name}: Chờ`;
    if (status === 'published') {
      cls = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      label = `${name}: Đã đăng${state?.post_id ? ` (${String(state.post_id).slice(0, 18)})` : ''}`;
    } else if (status === 'failed') {
      cls = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      label = `${name}: Lỗi`;
    } else if (status === 'disabled') {
      cls = 'bg-surface-container text-on-surface-variant/70 border-surface-container-highest/40';
      label = `${name}: Tắt`;
    }
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${cls}">${escapeHtml(label)}</span>`;
  }

  function showOfflineBanner(message) {
    const banner = document.getElementById('social-offline-banner');
    const msgEl = document.getElementById('social-offline-message');
    if (!banner) return;
    if (!message) {
      banner.classList.add('hidden');
      if (msgEl) msgEl.textContent = '';
      return;
    }
    banner.classList.remove('hidden');
    if (msgEl) msgEl.textContent = message;
  }

  function renderStatusPills(data) {
    const container = document.getElementById('social-status-pills');
    if (!container) return;
    const integrations = data?.integrations || {};
    const settings = data?.settings || {};

    const pills = [
      {
        ok: Boolean(integrations.tmdb_configured),
        text: integrations.tmdb_configured ? 'TMDb: Đã kết nối' : 'TMDb: Thiếu API Key'
      },
      {
        ok: Boolean(integrations.facebook_configured),
        text: integrations.facebook_configured ? 'Facebook Page: Đã kết nối' : 'Facebook Page: Chưa cấu hình'
      },
      {
        ok: Boolean(integrations.threads_configured),
        text: integrations.threads_configured ? 'Threads: Đã kết nối' : 'Threads: Chưa cấu hình'
      },
      {
        ok: !settings.dry_run,
        warn: Boolean(settings.dry_run),
        text: settings.dry_run ? 'Chế độ: DRY RUN (Thử nghiệm)' : 'Chế độ: LIVE (Đăng thật)'
      },
      {
        ok: Boolean(settings.auto_schedule_enabled),
        text: settings.auto_schedule_enabled ? 'Lập lịch tự động: ĐANG BẬT' : 'Lập lịch tự động: ĐANG TẮT'
      }
    ];

    container.innerHTML = pills.map((pill) => {
      const cls = pill.warn
        ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
        : pill.ok
          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
          : 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${cls}">${escapeHtml(pill.text)}</span>`;
    }).join('');
  }

  function renderStats(stats) {
    const s = stats || {};
    const map = {
      'social-stat-published': s.total_published ?? 0,
      'social-stat-scheduled': s.scheduled_count ?? 0,
      'social-stat-queue-done': s.published_queue_count ?? 0,
      'social-stat-failed': s.failed_or_partial_count ?? 0
    };
    for (const [id, val] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el) el.textContent = Number(val || 0).toLocaleString('vi-VN');
    }
  }

  function renderSettings(settings, openSlots) {
    const s = settings || {};
    const setCheck = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.checked = Boolean(val);
    };
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val ?? '';
    };

    setCheck('social-set-auto', s.auto_schedule_enabled);
    setCheck('social-set-dry-run', s.dry_run);
    setCheck('social-set-fb', s.fb_enabled !== false);
    setCheck('social-set-threads', s.threads_enabled !== false);
    setCheck('social-set-require-tmdb', s.require_tmdb_image !== false);
    setVal('social-set-slots', Array.isArray(s.slots_vn) ? s.slots_vn.join(', ') : '');
    setVal('social-set-lookahead', s.lookahead_days ?? 2);
    setVal('social-set-min-gap', s.min_hours_between_posts ?? 3);
    setVal('social-set-max-day', s.max_posts_per_day ?? 3);

    const previewEl = document.getElementById('social-open-slots-preview');
    if (previewEl) {
      const slots = Array.isArray(openSlots) ? openSlots.slice(0, 6) : [];
      if (slots.length === 0) {
        previewEl.innerHTML = '<span class="text-xs text-on-surface-variant">Hiện không còn khung giờ trống nào trong khoảng tìm trước.</span>';
      } else {
        previewEl.innerHTML = slots
          .map(slot => `<span class="px-2.5 py-1 rounded-lg bg-surface-container text-on-surface text-xs font-medium border border-surface-container-highest/50">${escapeHtml(formatVnDateTime(slot))}</span>`)
          .join('');
      }
    }
  }

  function setStatusBadge(id, configured, maskedText, labelUnset = 'Chưa cấu hình') {
    const el = document.getElementById(id);
    if (!el) return;
    if (configured) {
      el.className = 'px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400';
      el.textContent = maskedText ? `Đã lưu (${maskedText})` : 'Đã kết nối';
    } else {
      el.className = 'px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-400';
      el.textContent = labelUnset;
    }
  }

  function renderIntegrations(integrations) {
    const info = integrations || {};
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val ?? '';
    };
    const resetSecret = (inputId, clearId, configured, masked, fallbackPlaceholder) => {
      const input = document.getElementById(inputId);
      const chk = document.getElementById(clearId);
      if (input) {
        input.value = '';
        input.placeholder = configured
          ? `Đã lưu (${masked || '••••'}) - để trống nếu giữ nguyên`
          : fallbackPlaceholder;
      }
      if (chk) chk.checked = false;
    };

    setStatusBadge('social-int-badge-tmdb', info.tmdb_configured, info.tmdb_api_key_masked);
    setStatusBadge('social-int-badge-fb', info.facebook_configured, info.fb_page_access_token_masked);
    setStatusBadge('social-int-badge-threads', info.threads_configured, info.threads_access_token_masked);
    setStatusBadge('social-int-badge-openai', info.openai_configured, info.openai_api_key_masked, 'Chưa bật');
    setStatusBadge('social-int-badge-gemini', info.gemini_configured, info.gemini_api_key_masked, 'Chưa bật');

    resetSecret('social-int-tmdb-key', 'social-int-tmdb-clear', info.tmdb_configured, info.tmdb_api_key_masked, 'Nhập TMDb API Key mới...');
    setVal('social-int-tmdb-lang', info.tmdb_language || 'vi-VN');

    setVal('social-int-fb-page-id', info.fb_page_id || '');
    setVal('social-int-fb-version', info.fb_graph_version || 'v21.0');
    resetSecret('social-int-fb-token', 'social-int-fb-clear', info.facebook_configured, info.fb_page_access_token_masked, 'Nhập Page Access Token mới...');

    setVal('social-int-th-user-id', info.threads_user_id || '');
    setVal('social-int-th-version', info.threads_api_version || 'v1.0');
    resetSecret('social-int-th-token', 'social-int-th-clear', info.threads_configured, info.threads_access_token_masked, 'Nhập Threads Token mới...');

    setVal('social-int-tg-url', info.telegram_url || 'https://t.me/cinevietlivee');
    setVal('social-int-tg-handle', info.telegram_handle || '@cinevietlivee');

    resetSecret('social-int-openai-key', 'social-int-openai-clear', info.openai_configured, info.openai_api_key_masked, 'OpenAI API Key (tùy chọn)');
    setVal('social-int-openai-model', info.openai_model || 'gpt-4o-mini');

    resetSecret('social-int-gemini-key', 'social-int-gemini-clear', info.gemini_configured, info.gemini_api_key_masked, 'Gemini API Key (tùy chọn)');
    setVal('social-int-gemini-model', info.gemini_model || 'gemini-3.1-flash-lite');
  }

  function renderVerifyResults(data) {
    const box = document.getElementById('social-verify-result');
    if (!box) return;
    if (!data) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }

    const cards = [
      { title: 'TMDb API', res: data.tmdb },
      { title: 'Facebook Page', res: data.facebook },
      { title: 'Meta Threads', res: data.threads }
    ];
    box.classList.remove('hidden');
    box.innerHTML = cards.map(({ title, res }) => {
      const ok = Boolean(res?.ok);
      const cls = ok
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
        : 'bg-rose-500/10 border-rose-500/30 text-rose-300';
      return `
        <div class="p-3 rounded-xl border text-xs ${cls}">
          <p class="font-bold">${escapeHtml(title)}: ${ok ? 'Hợp lệ' : 'Chưa đạt'}</p>
          <p class="mt-0.5 opacity-90 break-words">${escapeHtml(res?.detail || '')}</p>
        </div>`;
    }).join('');
  }

  function renderQueue(queue) {
    const listEl = document.getElementById('social-queue-list');
    if (!listEl) return;

    const all = Array.isArray(queue) ? queue : [];
    const filtered = all.filter((item) => {
      if (activeFilter === 'scheduled') return item.status === 'scheduled' || item.status === 'publishing';
      if (activeFilter === 'failed') return item.status === 'failed' || item.status === 'partial';
      if (activeFilter === 'published') return item.status === 'published';
      return true;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="p-8 rounded-2xl bg-surface-container-low border border-surface-container-highest/40 text-center text-sm text-on-surface-variant">
          Chưa có bài viết nào trong bộ lọc hiện tại. Nhấn <strong>"Tạo &amp; Lên Lịch Tự Động"</strong> để bot quét phim mới và soạn bài.
        </div>`;
      return;
    }

    listEl.innerHTML = filtered.map((item) => {
      const id = String(item.id || '');
      const slug = String(item.slug || '');
      const movieUrl = slug ? `/phim/${encodeURIComponent(slug)}` : '#';
      const fbImg = safeUrl(item.facebook_image_url);
      const thImg = safeUrl(item.threads_image_url);
      const threadsText = String(item.threads_caption || '');
      const threadsLen = threadsText.length;
      const thLenCls = threadsLen > THREADS_MAX_CHARS ? 'text-rose-400' : 'text-on-surface-variant';
      const fbErr = item.platforms?.facebook?.error;
      const thErr = item.platforms?.threads?.error;
      const disabledPublish = item.status === 'published' || item.status === 'publishing' ? 'disabled' : '';
      const scheduleLocal = toVnDatetimeLocal(item.scheduled_at);

      return `
        <article class="social-queue-card rounded-2xl bg-surface-container-low border border-surface-container-highest/50 p-5 space-y-4 shadow-md" data-post-id="${escapeHtml(id)}">
          <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-surface-container-highest/40 pb-3.5">
            <div class="space-y-1 min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                ${statusBadgeHtml(item.status)}
                <a href="${escapeHtml(movieUrl)}" target="_blank" rel="noopener noreferrer" class="font-display font-bold text-base text-on-surface hover:text-primary transition-colors truncate">
                  ${escapeHtml(item.name || slug || 'Phim chưa rõ tên')}
                </a>
                ${item.year ? `<span class="text-xs text-on-surface-variant">(${escapeHtml(item.year)})</span>` : ''}
                ${item.vote_average ? `<span class="text-xs font-bold text-amber-400">★ ${escapeHtml(Number(item.vote_average).toFixed(1))}</span>` : ''}
              </div>
              <div class="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                ${item.origin_name ? `<span>${escapeHtml(item.origin_name)}</span><span>•</span>` : ''}
                <span>Lịch VN: <strong class="text-on-surface">${escapeHtml(formatVnDateTime(item.scheduled_at))}</strong></span>
                ${item.template_id ? `<span>•</span><span>Mẫu #${escapeHtml(item.template_id)}</span>` : ''}
                ${item.retry_count ? `<span>•</span><span class="text-amber-400">Thử lại: ${escapeHtml(item.retry_count)}/3</span>` : ''}
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 shrink-0">
              ${platformPillHtml('FB', item.platforms?.facebook)}
              ${platformPillHtml('Threads', item.platforms?.threads)}
            </div>
          </div>

          ${(fbErr || thErr) ? `
            <div class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 space-y-1">
              ${fbErr ? `<p><strong>Lỗi Facebook:</strong> ${escapeHtml(fbErr)}</p>` : ''}
              ${thErr ? `<p><strong>Lỗi Threads:</strong> ${escapeHtml(thErr)}</p>` : ''}
            </div>
          ` : ''}

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div class="lg:col-span-4 space-y-3">
              <div class="grid grid-cols-2 gap-2.5">
                <div class="space-y-1">
                  <span class="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Ảnh Facebook</span>
                  ${fbImg
                    ? `<img src="${escapeHtml(fbImg)}" alt="Ảnh Facebook" referrerpolicy="no-referrer" class="w-full h-28 object-cover rounded-xl bg-surface-container border border-surface-container-highest/40">`
                    : `<div class="w-full h-28 rounded-xl bg-surface-container border border-surface-container-highest/40 flex items-center justify-center text-[11px] text-on-surface-variant">Chưa có ảnh</div>`}
                </div>
                <div class="space-y-1">
                  <span class="block text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Ảnh Threads</span>
                  ${thImg
                    ? `<img src="${escapeHtml(thImg)}" alt="Ảnh Threads" referrerpolicy="no-referrer" class="w-full h-28 object-cover rounded-xl bg-surface-container border border-surface-container-highest/40">`
                    : `<div class="w-full h-28 rounded-xl bg-surface-container border border-surface-container-highest/40 flex items-center justify-center text-[11px] text-on-surface-variant">Chưa có ảnh</div>`}
                </div>
              </div>

              <label class="block space-y-1">
                <span class="text-xs font-semibold text-on-surface-variant">Giờ đăng (Giờ VN UTC+7)</span>
                <input type="datetime-local" value="${escapeHtml(scheduleLocal)}" class="social-input-schedule w-full px-3 py-2 rounded-xl bg-surface-container text-on-surface text-xs font-medium border border-surface-container-highest/60 focus:outline-none focus:border-primary">
              </label>
            </div>

            <div class="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-3">
              <label class="block space-y-1">
                <span class="flex items-center justify-between text-xs font-semibold text-on-surface-variant">
                  <span>Nội dung Facebook</span>
                </span>
                <textarea rows="6" class="social-input-fb w-full px-3 py-2.5 rounded-xl bg-surface-container text-on-surface text-xs leading-relaxed border border-surface-container-highest/60 focus:outline-none focus:border-primary">${escapeHtml(item.facebook_caption || '')}</textarea>
              </label>

              <label class="block space-y-1">
                <span class="flex items-center justify-between text-xs font-semibold text-on-surface-variant">
                  <span>Nội dung Threads (tối đa 500 ký tự)</span>
                  <span class="social-threads-count text-[11px] font-bold ${thLenCls}">${threadsLen}/${THREADS_MAX_CHARS}</span>
                </span>
                <textarea rows="6" maxlength="500" class="social-input-threads w-full px-3 py-2.5 rounded-xl bg-surface-container text-on-surface text-xs leading-relaxed border border-surface-container-highest/60 focus:outline-none focus:border-primary">${escapeHtml(threadsText)}</textarea>
              </label>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-surface-container-highest/30">
            <button type="button" class="btn-social-save-post inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold border border-surface-container-highest/60 transition-colors cursor-pointer" data-post-id="${escapeHtml(id)}">
              <span class="material-symbols-outlined text-[16px]">save</span>
              <span>Lưu sửa</span>
            </button>
            <button type="button" ${disabledPublish} class="btn-social-publish-post inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-white text-xs font-bold transition-colors cursor-pointer" data-post-id="${escapeHtml(id)}">
              <span class="material-symbols-outlined text-[16px]">send</span>
              <span>Đăng ngay</span>
            </button>
            <button type="button" class="btn-social-delete-post inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 text-xs font-semibold border border-rose-500/30 transition-colors cursor-pointer" data-post-id="${escapeHtml(id)}">
              <span class="material-symbols-outlined text-[16px]">delete</span>
              <span>Xóa</span>
            </button>
          </div>
        </article>`;
    }).join('');
  }

  function renderPublishedHistory(published) {
    const el = document.getElementById('social-published-list');
    if (!el) return;
    const rows = Array.isArray(published) ? published : [];
    if (rows.length === 0) {
      el.innerHTML = '<p class="text-xs text-on-surface-variant py-4 text-center">Chưa có phim nào được ghi nhận đã đăng.</p>';
      return;
    }

    el.innerHTML = rows.slice(0, 20).map((row) => `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-surface-container border border-surface-container-highest/40 text-xs">
        <div class="min-w-0">
          <p class="font-bold text-on-surface truncate">${escapeHtml(row.name || row.slug)}${row.year ? ` (${escapeHtml(row.year)})` : ''}</p>
          <p class="text-on-surface-variant text-[11px]">Đăng lúc: ${escapeHtml(formatVnDateTime(row.published_at))}</p>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 shrink-0">
          ${row.facebook_post_id ? `<span class="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-400 font-semibold">FB: ${escapeHtml(row.facebook_post_id)}</span>` : ''}
          ${row.threads_post_id ? `<span class="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-semibold">Threads: ${escapeHtml(row.threads_post_id)}</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  function renderRunLogs(logs) {
    const el = document.getElementById('social-logs-list');
    if (!el) return;
    const rows = Array.isArray(logs) ? logs : [];
    if (rows.length === 0) {
      el.innerHTML = '<p class="text-xs text-on-surface-variant py-4 text-center">Chưa có nhật ký chạy bot.</p>';
      return;
    }

    el.innerHTML = rows.slice(0, 20).map((log) => {
      const isErr = String(log.action || '').includes('error');
      const badgeCls = isErr ? 'bg-rose-500/15 text-rose-400' : 'bg-surface-container-highest text-on-surface-variant';
      return `
        <div class="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface-container/70 border border-surface-container-highest/30 text-xs">
          <span class="px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${badgeCls}">${escapeHtml(log.action || 'log')}</span>
          <div class="min-w-0 flex-1">
            <p class="text-on-surface leading-snug break-words">${escapeHtml(log.summary || '')}</p>
            <p class="text-[11px] text-on-surface-variant mt-0.5">${escapeHtml(formatVnDateTime(log.at))}</p>
          </div>
        </div>`;
    }).join('');
  }

  function renderDashboard(data) {
    lastDashboard = data;
    showOfflineBanner('');
    renderStatusPills(data);
    renderStats(data?.stats);
    renderSettings(data?.settings, data?.open_slots);
    renderIntegrations(data?.integrations);
    renderQueue(data?.queue);
    renderPublishedHistory(data?.published_movies);
    renderRunLogs(data?.run_logs);
  }

  async function loadSocialTab() {
    if (!root.API?.getAdminSocialDashboard) return;
    bindEvents();
    try {
      const data = await root.API.getAdminSocialDashboard();
      if (!data) return;
      renderDashboard(data);
    } catch (err) {
      const message = err?.message || 'Không thể kết nối tới dịch vụ CineViet Social (127.0.0.1:4100).';
      showOfflineBanner(message);
      console.error('[CineViet Social Admin] Load failed:', err);
    }
  }

  async function withLock(fn) {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } finally {
      busy = false;
    }
  }

  function bindEvents() {
    if (initialized) return;
    initialized = true;

    document.getElementById('btn-social-refresh')?.addEventListener('click', () => {
      toast('Đang tải lại dữ liệu CineViet Social...');
      loadSocialTab();
    });

    document.getElementById('btn-social-fill')?.addEventListener('click', () => withLock(async () => {
      try {
        toast('Đang quét phim mới & ảnh TMDb để lên lịch...');
        const res = await root.API.fillAdminSocialQueue({});
        const count = Array.isArray(res?.added) ? res.added.length : 0;
        toast(count > 0 ? `Đã tạo và lên lịch thêm ${count} bài mới!` : `Không thêm bài mới (${res?.reason || 'đã đủ lịch hoặc trùng phim'}).`);
        await loadSocialTab();
      } catch (err) {
        toast(err?.message || 'Lỗi khi quét phim lên lịch', 'error');
      }
    }));

    document.getElementById('btn-social-tick')?.addEventListener('click', () => withLock(async () => {
      try {
        toast('Đang chạy kiểm tra & đăng bài tới hạn...');
        const res = await root.API.tickAdminSocial();
        const published = Array.isArray(res?.published) ? res.published.length : 0;
        toast(`Đã hoàn tất chu kỳ kiểm tra (${published} bài được xử lý).`);
        await loadSocialTab();
      } catch (err) {
        toast(err?.message || 'Lỗi khi chạy tick', 'error');
      }
    }));

    document.getElementById('social-settings-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      withLock(async () => {
        try {
          const payload = {
            auto_schedule_enabled: Boolean(document.getElementById('social-set-auto')?.checked),
            dry_run: Boolean(document.getElementById('social-set-dry-run')?.checked),
            fb_enabled: Boolean(document.getElementById('social-set-fb')?.checked),
            threads_enabled: Boolean(document.getElementById('social-set-threads')?.checked),
            require_tmdb_image: Boolean(document.getElementById('social-set-require-tmdb')?.checked),
            slots_vn: document.getElementById('social-set-slots')?.value || '',
            lookahead_days: Number.parseInt(document.getElementById('social-set-lookahead')?.value || '2', 10),
            min_hours_between_posts: Number.parseInt(document.getElementById('social-set-min-gap')?.value || '3', 10),
            max_posts_per_day: Number.parseInt(document.getElementById('social-set-max-day')?.value || '3', 10)
          };
          await root.API.saveAdminSocialSettings(payload);
          toast('Đã lưu cấu hình lịch đăng & kênh MXH!');
          await loadSocialTab();
        } catch (err) {
          toast(err?.message || 'Lỗi khi lưu cấu hình MXH', 'error');
        }
      });
    });

    document.getElementById('social-integrations-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!root.API?.saveAdminSocialIntegrations) return;
      withLock(async () => {
        try {
          const val = id => String(document.getElementById(id)?.value || '').trim();
          const chk = id => Boolean(document.getElementById(id)?.checked);
          const payload = {
            tmdb_language: val('social-int-tmdb-lang') || 'vi-VN',
            fb_page_id: val('social-int-fb-page-id'),
            fb_graph_version: val('social-int-fb-version') || 'v21.0',
            threads_user_id: val('social-int-th-user-id'),
            threads_api_version: val('social-int-th-version') || 'v1.0',
            telegram_url: val('social-int-tg-url'),
            telegram_handle: val('social-int-tg-handle'),
            openai_model: val('social-int-openai-model') || 'gpt-4o-mini',
            gemini_model: val('social-int-gemini-model') || 'gemini-3.1-flash-lite',
            clear_tmdb_api_key: chk('social-int-tmdb-clear'),
            clear_fb_token: chk('social-int-fb-clear'),
            clear_threads_token: chk('social-int-th-clear'),
            clear_openai_key: chk('social-int-openai-clear'),
            clear_gemini_key: chk('social-int-gemini-clear')
          };

          const tmdbKey = val('social-int-tmdb-key');
          const fbTok = val('social-int-fb-token');
          const thTok = val('social-int-th-token');
          const openaiKey = val('social-int-openai-key');
          const geminiKey = val('social-int-gemini-key');
          if (tmdbKey) payload.tmdb_api_key = tmdbKey;
          if (fbTok) payload.fb_page_access_token = fbTok;
          if (thTok) payload.threads_access_token = thTok;
          if (openaiKey) payload.openai_api_key = openaiKey;
          if (geminiKey) payload.gemini_api_key = geminiKey;

          await root.API.saveAdminSocialIntegrations(payload);
          toast('Đã lưu cấu hình API TMDb / Facebook / Threads!');
          await loadSocialTab();
        } catch (err) {
          toast(err?.message || 'Lỗi khi lưu cấu hình API', 'error');
        }
      });
    });

    document.getElementById('btn-social-verify-integrations')?.addEventListener('click', () => {
      if (!root.API?.verifyAdminSocialIntegrations) return;
      withLock(async () => {
        try {
          toast('Đang kiểm tra kết nối TMDb, Facebook & Threads...');
          const res = await root.API.verifyAdminSocialIntegrations();
          renderVerifyResults(res);
          const allOk = res?.tmdb?.ok && res?.facebook?.ok && res?.threads?.ok;
          toast(allOk ? 'Cả 3 kết nối TMDb, Facebook & Threads đều hợp lệ!' : 'Đã hoàn tất kiểm tra kết nối — xem chi tiết bên dưới.');
        } catch (err) {
          toast(err?.message || 'Lỗi khi kiểm tra kết nối API', 'error');
        }
      });
    });

    document.querySelectorAll('.social-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeFilter = btn.getAttribute('data-social-filter') || 'all';
        document.querySelectorAll('.social-filter-btn').forEach((b) => {
          const active = b === btn;
          b.classList.toggle('bg-primary', active);
          b.classList.toggle('text-white', active);
          b.classList.toggle('bg-surface-container', !active);
          b.classList.toggle('text-on-surface-variant', !active);
        });
        if (lastDashboard) renderQueue(lastDashboard.queue);
      });
    });

    const queueList = document.getElementById('social-queue-list');
    queueList?.addEventListener('input', (e) => {
      const ta = e.target.closest('.social-input-threads');
      if (!ta) return;
      const card = ta.closest('.social-queue-card');
      const counter = card?.querySelector('.social-threads-count');
      if (!counter) return;
      const len = ta.value.length;
      counter.textContent = `${len}/${THREADS_MAX_CHARS}`;
      counter.classList.toggle('text-rose-400', len > THREADS_MAX_CHARS);
      counter.classList.toggle('text-on-surface-variant', len <= THREADS_MAX_CHARS);
    });

    queueList?.addEventListener('click', (e) => {
      const saveBtn = e.target.closest('.btn-social-save-post');
      const publishBtn = e.target.closest('.btn-social-publish-post');
      const deleteBtn = e.target.closest('.btn-social-delete-post');
      const targetBtn = saveBtn || publishBtn || deleteBtn;
      if (!targetBtn) return;

      const postId = targetBtn.getAttribute('data-post-id');
      const card = targetBtn.closest('.social-queue-card');
      if (!postId || !card) return;

      if (saveBtn) {
        withLock(async () => {
          try {
            const fbCaption = card.querySelector('.social-input-fb')?.value || '';
            const threadsCaption = card.querySelector('.social-input-threads')?.value || '';
            const scheduleLocal = card.querySelector('.social-input-schedule')?.value || '';
            const scheduledAtIso = vnDatetimeLocalToIso(scheduleLocal);
            await root.API.updateAdminSocialPost(postId, {
              facebook_caption: fbCaption,
              threads_caption: threadsCaption,
              ...(scheduledAtIso ? { scheduled_at: scheduledAtIso } : {})
            });
            toast('Đã lưu nội dung & lịch đăng bài viết!');
            await loadSocialTab();
          } catch (err) {
            toast(err?.message || 'Lỗi khi lưu bài viết', 'error');
          }
        });
      } else if (publishBtn) {
        withLock(async () => {
          try {
            toast('Đang đăng bài lên Facebook / Threads...');
            await root.API.publishAdminSocialPost(postId);
            toast('Đã xử lý đăng bài!');
            await loadSocialTab();
          } catch (err) {
            toast(err?.message || 'Lỗi khi đăng bài', 'error');
          }
        });
      } else if (deleteBtn) {
        withLock(async () => {
          try {
            await root.API.deleteAdminSocialPost(postId);
            toast('Đã xóa bài khỏi hàng đợi.');
            await loadSocialTab();
          } catch (err) {
            toast(err?.message || 'Lỗi khi xóa bài viết', 'error');
          }
        });
      }
    });
  }

  root.loadAdminSocialTab = loadSocialTab;
  root.renderAdminSocialDashboard = renderDashboard;

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', bindEvents);
  }
})(typeof window === 'undefined' ? globalThis : window);
