# Nghiệm thu website CineViet

Ngày kiểm tra local: 2026-10-25. Phạm vi: website desktop/mobile, tài khoản, thư viện, player và quản trị banner. Đây không phải chứng nhận production hoặc cam kết mọi phim/thiết bị đều hoạt động.

## Kết luận

Có thể dùng thử nội bộ/nhóm nhỏ trên môi trường đã kiểm tra. Chưa đủ bằng chứng để mở công khai ở quy mô lớn: SMTP/domain/HTTPS thật, backup ngoài máy chủ và phục hồi, thiết bị Safari/iOS/Android thực, tải production và quyền phân phối nội dung còn cần nghiệm thu riêng.

Không thay tài khoản, mật khẩu, banner hoặc lịch sử thật bằng dữ liệu kiểm thử. Các thao tác thêm/xóa dùng database tạm; server local tiếp tục phục vụ người dùng riêng.

## Bài học từ Netflix được đối chiếu

Các trang trợ giúp công khai đã đọc, không đăng nhập hoặc sao chép giao diện:

- [Danh sách của tôi](https://help.netflix.com/vi/node/10523): thêm/xóa và quản lý nội dung có trạng thái rõ ràng.
- [Xóa khỏi Tiếp tục xem](https://help.netflix.com/vi/node/115312): thao tác trên máy tính và thiết bị cảm ứng phải có đường truy cập rõ.
- [Tự động phát tập tiếp theo](https://help.netflix.com/vi/node/121518): người dùng kiểm soát tùy chọn tự động phát.
- [Chất lượng video](https://help.netflix.com/vi/node/11559): khả năng thực tế phụ thuộc nội dung, thiết bị và kết nối; nhãn không chứng minh đang phát 4K/HDR.
- [Hệ thống đề xuất](https://help.netflix.com/vi/node/100639): cá nhân hóa cần tín hiệu lịch sử/đánh giá/metadata thật, không phải danh sách ngẫu nhiên kèm phần trăm phù hợp.

Đã áp dụng: Xem tiếp chung cho desktop/mobile, tiến trình và thời lượng thật, thao tác xóa có phản hồi xác nhận/lỗi, nút truy cập được bằng bàn phím/cảm ứng, hủy chuyển tập khi phát lại, giới thiệu tài khoản không hứa offline/4K chưa kiểm chứng. Không sao chép logo, artwork, mã nguồn hay thiết kế Netflix. Chưa xây hệ thống hồ sơ, tải offline hay thuật toán đề xuất như Netflix.

## Các lỗi đã sửa trong đợt này

### Xem tiếp / thư viện

- Mobile đọc khóa localStorage cũ, khác khóa player đang lưu: thay bằng module `public/js/continue-watching.js` dùng chung với desktop.
- Khối Xem tiếp trên trang chủ chỉ đọc lịch sử từ API sau khi xác minh tài khoản. Khách hoặc chưa xác minh được phiên: ẩn toàn bộ khối, không đọc tiến trình guest/cache để hiện thẻ hay số lượng phim đã ẩn.
- Không gán tiến độ 45%, thời lượng 110 phút hoặc chất lượng FHD khi thiếu dữ liệu; thẻ không có thời lượng ghi rõ điều đó.
- Ẩn khỏi Xem tiếp chỉ đặt `continue_hidden`, giữ tập/server/vị trí và lịch sử. Đã bỏ danh sách “Phim đã ẩn” và nút khôi phục khỏi trang chủ desktop/mobile; khôi phục trong tab Lịch sử. Nếu chỉ còn phim đã ẩn, toàn bộ khối Xem tiếp sẽ ẩn. Dữ liệu local cũ không bị xóa.
- Thao tác chỉ cập nhật sau phản hồi thành công. Xóa lịch sử vẫn là thao tác riêng, có xác nhận và dọn snapshot local tương ứng. Nút truy cập được bằng bàn phím/cảm ứng; dữ liệu lưu được render an toàn.
- Bộ lọc thể loại chấp nhận chuỗi hoặc mảng; phim bộ/phim lẻ dùng metadata loại thay vì suy đoán từ thời gian xem. Các lần lưu mới giữ loại/thể loại; không suy diễn bản ghi cũ thiếu thông tin.
- Số theo dõi đếm tựa phim duy nhất, không cộng trùng watchlist và Xem tiếp; lịch sử ghi số tựa phim, không gọi là tổng tập đã xem.
- Bỏ nhãn đồng bộ cố định và lời hứa tải ngoại tuyến/4K không có kiểm chứng.

Ẩn không làm mất tiến trình. Lưu lại cùng vị trí vẫn giữ ẩn; xem tiếp có thay đổi tiến trình hoặc chuyển tập sẽ hiện lại. Tiến trình lưu gần nhất không tương đương tổng thời gian thực xem theo tháng.

### Player

- Đổi server ưu tiên slug tập chính xác trước tên; server rỗng được từ chối trước khi hủy player cũ.
- Quay lại HLS sau iframe khôi phục mốc HLS đã lưu. Không giả nhận biết thời gian xem bên trong iframe cross-origin.
- Phát lại hoặc tua lùi hủy timer tự chuyển tập trên desktop/mobile.
- Lỗi chấm điểm 500/429/network giữ ngữ cảnh để thử lại; chỉ 401 chuyển sang đăng nhập.
- Khi lỗi nguồn desktop/mobile, gợi ý nguồn khác có đúng tập; không chuyển trước khi người xem xác nhận. Bỏ URL đã lỗi/trùng và hủy callback cũ khi đổi tập. HLS thử khôi phục mốc đã lưu; iframe giải thích không bảo đảm tua tiếp cross-origin.

### Theo dõi tập mới

- Nút theo dõi độc lập với watchlist trên chi tiết desktop/mobile; lần đầu lấy tập thực có link HTTP(S) làm mốc, không báo dồn tập cũ.
- Mở bảng thông báo mới kiểm tra cập nhật, tối đa 10 phim/lần, throttle 5 phút. Cache chi tiết nguồn có thể trễ 30 phút hoặc hơn khi không mở bảng; không phải push/email/realtime.
- Chống báo lặp giữa các server, lưu trạng thái đọc theo tài khoản trên server, xử lý lỗi/thử lại. Có kiểm tra race bỏ theo dõi/theo dõi lại và cách ly tài khoản.

### Banner admin

- Preview dựa vào chế độ Desktop/Mobile, độc lập kích thước cửa sổ admin.
- Desktop: header/footer 6:1, dưới phim nổi bật 4:1, dưới player 5:1, hai hông 160:600.
- Mobile: header/footer/dưới player 3:1, dưới phim nổi bật 3:2; hai hông chỉ có giải thích ẩn, không dựng ảnh quảng cáo.
- Kiểu chữ/ẩn mô tả của preview mobile khớp quy tắc banner frontend. Không đổi tỷ lệ quảng cáo thật hoặc cấu hình đã lưu.

## Bằng chứng kiểm thử

- Test tự động lượt chốt 2/4/6: `npm test` 241 test, 238 pass, 3 skip có điều kiện (PostgreSQL/browser opt-in); dữ liệu ghi dùng DB tạm. Browser player và bảo mật chạy riêng.
- `npm run test:player-e2e`: 11/11 pass với Edge, Hls.js và media H.264/MPEG-TS local. Có decode, pause/play, tua, chuyển tập/server, teardown, resume, xác nhận đổi nguồn đúng tập/vị trí, đồng bộ tốc độ/ngôn ngữ/tự chuyển tập giữa hai context desktop/mobile độc lập.
- `npm run test:security-e2e`: 1/1 pass trên database tạm; xác minh/reset email giả lập, MFA, mã khôi phục và thu hồi phiên. Không phải kiểm chứng SMTP thật.
- Edge tích hợp lượt 1/3/5: desktop 1440 px/mobile 390 px, tài khoản/DB/provider tạm; theo dõi không đổi watchlist, tập cũ không báo, tập mới đúng URL và không lặp, đọc được lưu server; ẩn/khôi phục trang chủ giữ tập 2 và 120 giây, nút ẩn trong Lịch sử hoạt động. Không pageerror, trang Lịch sử không tràn ngang. Sửa header thu gọn menu để nút thông báo không ra ngoài viewport 1440 px.
- Probe player trước/sau: server rỗng vẫn giữ phiên đang phát; chọn đúng tập 2 theo slug; HLS 3 giây -> iframe -> HLS trả về khoảng 3 giây; phát lại không còn nhảy tập; HTTP 500 khi chấm điểm không yêu cầu đăng nhập lại.
- Preview banner: 24 tổ hợp mode/slot tại cửa sổ 1440 và 390 px; đo tỷ lệ, chữ/mô tả, trạng thái hai hông, so sánh markup thật. Dùng dữ liệu giả lập, không bật quảng cáo thật.
- `npm audit --omit=dev`: 0 lỗ hổng được báo tại thời điểm kiểm tra; không bao gồm advisories của toolchain dev.
- Kết quả smoke của đợt trước (không chạy lại lượt 1/3/5): `node scripts/load-smoke.cjs` 200 request, concurrency 10, HTTP 200 toàn bộ; 50/50 lượt ghi còn đủ, p95 khoảng 107 ms. JSON local không gọi provider; không phải benchmark media/CDN hay chứng nhận tải production.

### Mẫu nguồn phát thật

Kiểm tra có giới hạn ba phim từ API thật: `danh-sach-tu-tu-phan-2`, `toi-dang-tim-kiem-thay-ma`, `yeu-nham-canh-sat-thanh-tra-theer-yeu-dau-vo-sap-cuoi-cua-thanh-tra`.

Cả ba trả chi tiết HTTP 200, manifest HLS bắt đầu `#EXTM3U`, phản hồi range HTTP 206, CORS `*`, và đoạn media đầu HTTP 206 với loại `video/mp2t`. Hai host mẫu: `a.kvp726.com`, `v7.kkphimplayer7.com`.

Đây chỉ là kiểm tra metadata/manifest/đoạn đầu tại một thời điểm và một mạng; không chứng minh decode trọn phim, toàn bộ tập, mọi nguồn, phụ đề/âm thanh, mạng nhà người dùng hoặc TV/native.

## Bổ sung 2 / 4 / 6

- Âm thanh chỉ hiện khi có nhiều track thật; phụ đề chỉ hiện khi HLS/browser cung cấp track. Có tắt phụ đề rời, áp ngôn ngữ ưu tiên nếu nguồn hỗ trợ, giữ track cụ thể khi nhiều track cùng ngôn ngữ. Iframe tự quản lý điều khiển; không có nút giả hoặc hứa tắt phụ đề đã ghi vào hình.
- Tùy chọn phát trong trang xem/tài khoản desktop và mobile: tự chuyển tập, tốc độ, ngôn ngữ âm thanh/phụ đề ưu tiên. Lưu theo tài khoản trên server, tải lại khi mở trang hoặc quay về tab; khách chỉ lưu máy. Ghi lỗi không báo đồng bộ giả, API lỗi không biến tài khoản thành khách. Âm lượng vẫn là thiết lập thiết bị.
- Tìm kiếm không dấu kể cả đ/Đ, tên Việt/tên gốc; giữ bộ lọc/từ khóa/trang trên URL qua phân trang/Back/reload. Bộ lọc định dạng áp trước phân trang trong phạm vi đã tra cứu, không suy diễn năm/FHD/Vietsub khi thiếu metadata. Kết quả rỗng có gợi ý bỏ lọc giữ từ khóa, lỗi nguồn có thử lại riêng.
- Edge 1440 px/390 px với nguồn/DB tạm: HLS nhiều track tự sinh tải âm thanh Vietnamese và cue WebVTT thật; thiết lập đồng bộ qua hai context độc lập, lưu bị từ chối giữ tốc độ đã xác nhận, nguồn một track không hiện menu; hai trang tài khoản có thiết lập mới. Tìm kiếm 70 phim giả lập kiểm tra không dấu/tên gốc, lọc trước phân trang, trang 2/Back/reload/empty/retry. Không pageerror, các trang đo không tràn ngang.
- Tìm kiếm không phải chỉ mục toàn kho; chỉ bảo đảm trên dữ liệu provider trả về/phạm vi quét hữu hạn và chỉ mục ViCDN đã đồng bộ. Xem `SEARCH_FEATURE.md` và `PLAYBACK_OPTIONS.md` về giới hạn và API.

## Điều kiện trước khi mở công khai

- [ ] Domain/HTTPS/reverse proxy/cookie/CORS trên hosting thật; chạy lại security và luồng đăng nhập ở đó.
- [ ] SMTP gửi/nhận thật cho email xác minh/quên mật khẩu, liên kết domain đúng, giới hạn gửi và bảo mật DNS/email.
- [ ] Backup mã hóa có khóa độc lập và lưu ngoài máy chủ; phục hồi thành công vào môi trường khác.
- [ ] iPhone/Safari, Android thật, fullscreen, background/foreground, mạng yếu, thao tác cảm ứng và nhiều tập/server.
- [ ] Tải production thực tế phù hợp hạ tầng và mô hình lưu trữ; không suy ra từ smoke local.
- [ ] Kiểm tra nguồn/thiết bị hỗ trợ âm thanh/phụ đề/chất lượng trước khi quảng cáo các khả năng đó.
- [ ] Nội dung Điều khoản/Quyền riêng tư/Liên hệ thực và quyền sử dụng/phân phối phim. Các liên kết footer placeholder không được coi là trang pháp lý hoàn chỉnh.

Ngoài phạm vi: deploy hosting, cấu hình bí mật/SMTP thật, tự động di chuyển dữ liệu thật sang PostgreSQL, native Flutter/TV build, mô hình đề xuất, profile trẻ em, thanh toán và tải offline. Không tắt bảo vệ nguồn hoặc lách giới hạn iframe/CDN.

## Bổ sung: Xem tiếp chỉ hiển thị khi đăng nhập

- Trước khi kiểm tra phiên, khối và badge được làm trống; chỉ render dữ liệu sau khi xác minh tài khoản và tải lịch sử thành công. Không dùng `TTPhim_progress_guest` hoặc `kk_user` để render thay thế.
- Đăng xuất cùng tab, thay tài khoản/đăng xuất ở tab khác, focus/visibility/pageshow đều xác minh lại; dữ liệu phản hồi từ phiên cũ không được render lại. API lịch sử trả 401 giữ khối ẩn.
- Nâng module trang chủ desktop/mobile lên continue-watching 1.2.0 và SDK 3.2.0. Tiến trình đã lưu không bị xóa.
- Kiểm chứng lượt này: npm test 259 pass/3 skip; 14 ca tập trung sau khi siết spy; Edge desktop/mobile với DB/tài khoản tạm xác nhận khách không có thẻ/count/phim đã ẩn, không gọi API thư viện, thành viên có đúng count, đăng xuất/Back giữ khối ẩn và storage nguyên vẹn. Không pageerror.

## Bỏ mục Phim đã ẩn trên trang chủ

- Module Xem tiếp 1.3.0 chỉ dựng thẻ phim chưa ẩn; không dựng danh sách/count/nút hiện lại phim đã ẩn cạnh thẻ. Không thay API hay xóa lịch sử.
- Kiểm chứng: 265 test pass, 3 skip có điều kiện; Edge desktop/mobile với API mô phỏng xác nhận một thẻ chưa ẩn hiển thị đúng, ẩn thẻ cuối làm mất khối, tiến trình giữ nguyên và khôi phục qua Lịch sử thành công. Không pageerror; hai trang chủ local và module mới trả 200.
