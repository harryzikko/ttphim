document.addEventListener('DOMContentLoaded', () => {
  const pane = document.getElementById('tab-banners');
  if (!pane) return;
  document.body.classList.add('editorial-admin');
  let draft = null, dirty = false, busy = false, mode = 'desktop';
  const status = document.getElementById('banner-status');
  const save = document.getElementById('banner-save'), reload = document.getElementById('banner-reload');
  const choice = document.getElementById('banner-preview-choice');
  const hints = {
    header: 'Dưới thanh điều hướng, trước nội dung trang chủ/trang xem.',
    footer: 'Banner nổi cố định chân màn hình (Sticky Bottom Banner). Ghim ở đáy khi cuộn trang trên desktop và mobile.',
    side_left: 'Bên trái vùng nội dung, chỉ desktop rộng từ 1600 px. Không che phim.',
    side_right: 'Bên phải vùng nội dung, chỉ desktop rộng từ 1600 px. Không che phim.',
    below_featured: 'Ngay dưới phim nổi bật ở trang chủ, trước các hàng phim.',
    below_player: 'Ngay dưới khung video, không phủ lên video hoặc controls.'
  };
  const node = (tag, text, cls) => { const result = document.createElement(tag); if (text) result.textContent = text; if (cls) result.className = cls; return result; };
  const tell = message => { status.textContent = message; };
  const localDate = value => { if (!value) return ''; const d = new Date(value); return Number.isFinite(d.getTime()) ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''; };
  const mark = () => { dirty = true; tell('Bản nháp quảng cáo chưa lưu. Phim nổi bật không bị thay đổi.'); preview(); };
  function lock(value) {
    pane.querySelectorAll('input,textarea,select').forEach(control => { control.disabled = value; });
    save.disabled = value || !draft; reload.disabled = value;
  }
  function field(parent, item, key, label, type = 'text') {
    const wrap = node('label', label);
    const control = document.createElement(key === 'description' ? 'textarea' : 'input');
    if (control.tagName === 'INPUT') control.type = type;
    control.dataset.field = key;
    control.value = type === 'datetime-local' ? localDate(item[key]) : item[key] ?? (type === 'number' ? 50 : '');
    if (type === 'number') { control.min = 0; control.max = 100; }
    const max = { title: 120, description: 320, cta_label: 40, href: 2048, image_desktop: 2048, image_mobile: 2048 };
    if (max[key]) control.maxLength = max[key];
    control.addEventListener('input', () => {
      if (type === 'datetime-local') {
        const d = new Date(control.value);
        if (control.value && !Number.isFinite(d.getTime())) { tell('Ngày giờ không hợp lệ'); return; }
        item[key] = control.value ? d.toISOString() : '';
      } else item[key] = type === 'number' ? Number(control.value) : control.value;
      mark();
    });
    wrap.appendChild(control); parent.appendChild(wrap);
  }
  function check(parent, item, key, label) {
    const wrap = node('label', '', 'check-label'), control = document.createElement('input');
    control.type = 'checkbox'; control.checked = item[key] === true; control.dataset.field = key;
    control.addEventListener('change', () => {
      item[key] = control.checked;
      if (key === 'enabled') control.closest('details').querySelector('summary span').textContent = control.checked ? 'Bật' : 'Tắt';
      mark();
    });
    wrap.append(control, document.createTextNode(label)); parent.appendChild(wrap);
  }
  function render() {
    const container = document.getElementById('banner-ads'); container.replaceChildren();
    draft.ads.forEach(item => {
      const details = node('details', '', 'banner-editor'); details.dataset.slot = item.slot;
      const summary = node('summary'); summary.append(node('strong', item.label), node('span', item.enabled ? 'Bật' : 'Tắt')); details.appendChild(summary);
      const body = node('div', '', 'banner-editor-body'); body.appendChild(node('p', hints[item.slot]));
      check(body, item, 'enabled', 'Bật vị trí quảng cáo này');
      const fields = node('div', '', 'banner-fields');
      field(fields, item, 'title', 'Tiêu đề / mô tả ảnh'); field(fields, item, 'description', 'Nội dung ngắn · tùy chọn');
      field(fields, item, 'image_desktop', 'Ảnh desktop · URL HTTP(S) hoặc /đường-dẫn', 'text'); field(fields, item, 'image_mobile', 'Ảnh mobile · tùy chọn (URL hoặc /đường-dẫn)', 'text');
      field(fields, item, 'href', 'Liên kết · /đường-dẫn hoặc HTTP(S)'); field(fields, item, 'cta_label', 'Chữ nút · tùy chọn');
      field(fields, item, 'start', 'Bắt đầu · giờ địa phương', 'datetime-local'); field(fields, item, 'end', 'Kết thúc · giờ địa phương', 'datetime-local');
      field(fields, item, 'focal_x', 'Trọng tâm ngang (%)', 'number'); field(fields, item, 'focal_y', 'Trọng tâm dọc (%)', 'number');
      check(fields, item, 'new_tab', 'Mở liên kết ở tab mới'); body.appendChild(fields); details.appendChild(body); container.appendChild(details);
    });
    const old = choice.value; choice.replaceChildren();
    draft.ads.forEach(item => { const option = node('option', item.label); option.value = item.slot; choice.appendChild(option); });
    if (draft.ads.some(item => item.slot === old)) choice.value = old;
    preview();
  }
  function preview() {
    if (!draft) return;
    const item = draft.ads.find(ad => ad.slot === choice.value);
    const container = document.getElementById('banner-preview'); container.replaceChildren();
    container.dataset.mode = mode; container.dataset.kind = 'ad'; container.dataset.slot = item.slot;
    const side = ['side_left', 'side_right'].includes(item.slot);
    const active = item.enabled && (!item.start || Date.parse(item.start) <= Date.now()) && (!item.end || Date.parse(item.end) > Date.now());
    const hiddenOnMobile = mode === 'mobile' && side;
    container.hidden = hiddenOnMobile;
    document.getElementById('banner-preview-state').textContent = hiddenOnMobile ? 'Ẩn trên mobile · chỉ hiện ở desktop rộng từ 1600 px. Không hiển thị quảng cáo ở vị trí này trên mobile.' : `${active ? 'Đang trong lịch' : 'Tắt / ngoài lịch'} · ${hints[item.slot]}`;
    if (hiddenOnMobile) return;
    container.appendChild(node('small', 'Quảng cáo', 'ad-label'));
    const visual = node('div', '', 'preview-visual');
    const url = mode === 'mobile' ? item.image_mobile || item.image_desktop : item.image_desktop;
    try {
      const parsed = new URL(url, window.location.origin);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw Error();
      const img = document.createElement('img'); img.src = parsed.href; img.alt = item.title || 'Quảng cáo'; img.style.objectPosition = `${item.focal_x ?? 50}% ${item.focal_y ?? 50}%`;
      img.onerror = () => { img.hidden = true; visual.dataset.error = 'Không tải được ảnh'; }; visual.appendChild(img);
    } catch (_) { visual.dataset.error = 'Thêm URL ảnh để xem trước'; }
    const copy = node('div', '', 'preview-copy'); copy.appendChild(node('strong', item.title || 'Banner quảng cáo'));
    if (item.description) copy.appendChild(node('p', item.description)); copy.appendChild(node('span', item.cta_label || 'Tìm hiểu thêm'));
    visual.appendChild(copy); container.appendChild(visual);
  }
  async function load() {
    if (busy || (dirty && !confirm('Bỏ bản nháp quảng cáo chưa lưu?'))) return;
    busy = true; lock(true);
    try {
      const response = await API.request('/api/admin/advertising');
      if (!response.status) throw Error(response.message || 'Không thể tải quảng cáo');
      draft = response.data; dirty = false; render(); tell('Đã tải 6 vị trí quảng cáo. Phim nổi bật quản lý ở tab Ghim phim.');
    } catch (error) { tell(error.message); } finally { busy = false; lock(false); }
  }
  save.onclick = async () => {
    if (busy || !draft) return; busy = true; lock(true);
    try {
      const response = await API.request('/api/admin/advertising', { method: 'POST', body: JSON.stringify(draft) });
      if (!response.status) throw Error(response.message || 'Không thể lưu quảng cáo');
      draft = response.data; dirty = false; render(); tell('Đã lưu vị trí quảng cáo. Không thay đổi phim nổi bật.');
    } catch (error) { tell(error.message); } finally { busy = false; lock(false); }
  };
  reload.onclick = load; choice.onchange = preview;
  document.querySelectorAll('[data-preview]').forEach(button => button.onclick = () => { mode = button.dataset.preview; document.querySelectorAll('[data-preview]').forEach(b => b.setAttribute('aria-pressed', String(b === button))); preview(); });
  document.querySelector('[data-tab="tab-banners"]')?.addEventListener('click', () => { if (!draft) load(); });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  save.disabled = true;
});
