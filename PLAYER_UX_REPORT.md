# Cải thiện trải nghiệm player web

## Phạm vi hoàn tất

Tập trung player desktop/mobile: mở phim, đổi tập/server, resume, xử lý nguồn chậm/lỗi và điều khiển cảm ứng. Không thay UI toàn dự án, không sửa Flutter, không thay DB hay tài khoản admin trong đợt này.

### Thay đổi

- Lớp `public/js/player-ux.js` dùng chung quản lý vòng đời HLS/native Safari, hủy callback/listener/timer nguồn cũ.
- Retry lỗi mạng giới hạn 2 lần, lỗi media 1 lần; nguồn chậm quá 20 giây chuyển fallback hoặc hiện lỗi có nút thử lại/đổi server.
- Autoplay bị chặn hiện hướng dẫn và nút Phát, không để loader chạy mãi.
- Mobile tôn trọng deep link `?server=`, giữ tập và thời điểm khi đổi server nếu cùng tập.
- Chỉ resume đúng tập chưa xem xong; không áp dụng thời gian tập cũ lên tập mới.
- Lưu tiến trình thật mỗi 10 giây, pause, chuyển nguồn/tập, ẩn trang và pagehide. Request khi rời trang dùng keepalive. Khách lưu cục bộ, user đăng nhập đồng bộ backend; local history phân tách theo user.
- Backend lưu tên server trong history. Desktop bỏ ghi tiến trình giả 10 giây/3600 giây khi vừa mở tập.
- Dọn listener fullscreen/tua và timer auto-next desktop mỗi lần đổi tập. Mobile có nút hủy auto-next và hủy timer khi tự chọn tập khác.
- Player status dùng aria-live, nút cao tối thiểu 44 px, focus-visible; mobile có nhãn cho các nút điều khiển.
- Mobile yêu thích dùng API thật; bình luận mobile dùng backend thay demo và render text an toàn.
- HLS.js cố định phiên bản 1.7.3, phục vụ local `/vendor/hls-1.7.3.min.js`, cache immutable và compression của server. Không còn phụ thuộc CDN @latest trên các trang player được server phục vụ.
- Khi dùng embed có thông báo giới hạn resume và tình trạng phản hồi chậm. Không khẳng định iframe đã load là video bên trong phát thành công.

## Kiểm chứng đã chạy

- `npm.cmd test`: **38/38 test đạt**, gồm 13 test player và test history server bổ sung cùng các test hồi quy backend/web/performance.
- Test controller dùng HTML thật qua jsdom: đúng deep link/server, không resume nhầm tập, đổi server giữ thời điểm, callback nguồn cũ không hoạt động, pagehide cleanup.
- Test autoplay bị chặn, native HLS khi thiếu Hls.js, timeout, bounded retry/fallback, cancel auto-next, bình luận backend/text an toàn, lưu timestamp trước khi xóa nguồn.
- **Edge headless + HLS.js thật + video HLS mẫu công khai**: cả controller mobile/desktop có currentTime tăng, readyState 4, video không paused; tua đến 20 giây và đổi server giữ thời điểm đạt; không có pageerror. Kiểm tra playback dùng layout tối giản và click server qua DOM nên không được coi là chứng minh layout/cảm ứng.
- **Edge headless với layout Tailwind đầy đủ**, nguồn 404 chủ đích: desktop 1440 px và mobile 390 px không tràn ngang; thông báo lỗi hiện rõ; nút Thử lại/Đổi server cao 44 px; click thật Đổi server rồi chọn server mới thành công; không có pageerror.
- Kiểm tra cú pháp **37 file JavaScript**, `git diff --check`: đạt.
- Server đã restart, `/api/health` OK. HLS local HTTP 200, Cache-Control immutable. `/xem-phim.html` được phục vụ không còn script HLS CDN cũ; mobile có HLS local và player UX.
- npm sau cài HLS báo 0 lỗ hổng dependency.

## Giới hạn còn lại

- Chưa kiểm thử Safari/iPhone/Android thật, fullscreen thực, remote TV, Flutter build hoặc Lighthouse/Core Web Vitals. Browser panel tích hợp không mở được; đã dùng Edge headless cho các kiểm tra nêu trên.
- Nguồn HLS mẫu phát được không chứng minh mọi phim/codec/CDN đều hoạt động; cần kiểm tra nguồn KKPhim/ViCDN thực trên thiết bị.
- Embed bên thứ ba không có giao thức chung để lấy tiến trình/seek; không hứa resume hoặc đồng bộ 100% cho iframe. Iframe load chỉ cho biết trang nhúng đã tải, không xác nhận video bên trong.
- `public/xem-phim.html` còn script CDN legacy trong file nguồn do công cụ Edit bị từ chối 3 lần (`EDIT_PARSE_FAILED`/`EDIT_REGISTER_EMPTY`). Không tiếp tục sửa path đó. `readWatchTemplate()` loại script này trước khi phục vụ mọi route desktop player kể cả fallback, và file HLS local được dùng. Nếu build lại views hoặc dùng HTML ngoài Express cần bỏ script CDN trong template gốc.
- Tailwind CDN/font bên ngoài và dữ liệu nguồn phim vẫn ảnh hưởng cold load; đây chưa phải chứng nhận production-ready toàn bộ website.

Server hiện chạy ở **http://localhost:3001**. Tải lại player để nhận asset mới; giữ terminal server mở.
