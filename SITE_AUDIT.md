# Rà soát CineViet - 26/10/2026

> Đây là snapshot phát hiện trước sửa. Các nhóm lỗi đã được xử lý trong lượt tiếp theo; xem AUDIT_REMEDIATION.md để biết thay đổi, kiểm thử và các điều kiện production còn cần xác nhận.

Phạm vi: mã frontend web thường và /mobile, route/view/API, tài khoản và bảo mật, player/bình luận, thư viện, Watch Party, quản trị/vận hành, SEO và phụ thuộc production. Chỉ kiểm tra; không sửa mã ứng dụng, không ghi thử vào tài khoản/bình luận/settings thật, không đọc .env hoặc bản ghi cá nhân. Các thử nghiệm ghi dùng fixture/database tạm. Báo cáo này không phải chứng nhận bảo mật hay hiệu năng production.

## Kết quả kiểm chứng

- npm test: 341 đạt, 3 bỏ qua có điều kiện, 0 lỗi (344 bài).
- Player HLS E2E: 11/11 đạt trên server/database/media tạm.
- Security browser E2E: 1/1 đạt; xác minh email, reset, MFA/recovery và thu hồi phiên với mail giả lập.
- npm audit --omit=dev: 0 lỗ hổng đã biết tại thời điểm kiểm tra.
- 23 GET mẫu: trang công khai hợp lệ trả 200; tài khoản/thư viện/admin/operations yêu cầu đăng nhập. robots.txt và sitemap.xml trả 404.
- Không có JS/CSS nội bộ bị thiếu hoặc ID trùng trong 15 template đã kiểm tra.
- Tái hiện SSR spoiler bằng render thuần trong bộ nhớ; kiểm tra mềm lỗi 404 bằng GET giới hạn; các kiểm tra mã phòng/metadata/reaction bằng trạng thái giả lập.

## Ưu tiên sửa trước

### 1. Xóa hàng loạt từ Xem tiếp gọi nhầm API xóa yêu thích [P1]

`public/js/library.js:255` luôn gọi API.batchRemoveWatchlist(slugs). Trong khi thẻ Xem tiếp cũng có checkbox và nút chọn hàng loạt được dùng chung. Nếu phim vừa ở yêu thích vừa ở Xem tiếp, thao tác từ Xem tiếp có thể xóa yêu thích mà không ẩn mục xem tiếp.

Nên tách hành động theo tab hoặc chỉ bật batch xóa yêu thích trong tab yêu thích. Không chạy tái hiện trên tài khoản thật; hợp đồng handler/endpoint đã được đối chiếu. Nút Chuyển mục ở `public/danh-sach.html:129` cũng chưa có handler.

### 2. Cấp mã phòng có thể lặp vô hạn khi hết mã ở chế độ local [P1]

`src/services/partyService.js:24` chỉ có 9.000 mã KP-1000..KP-9999, do/while không giới hạn. Tạo phòng local không có trần tổng/per-account tương ứng. Nếu đầy namespace, vòng lặp đồng bộ chặn Node. Đã xác nhận trong VM chứa đầy map giả với deadline 100ms; không tạo phòng thật. Chế độ PostgreSQL có giới hạn phòng riêng, không áp dụng kết luận local này cho mọi topology.

Nên tăng namespace bằng crypto, giới hạn số phòng/account/toàn cục, giới hạn số lần thử và trả lỗi capacity có kiểm soát.

### 3. SSR trang xem lộ nội dung spoiler và bình luận khác tập [P2]

`src/services/templateService.js:1237` render mọi c.content ra đoạn p mà không xét is_spoil/episode_slug. Thử bình luận giả spoiler của tập 9 khi render tập 1: nội dung hiện, display block, visibility visible, không có control mở spoiler. Frontend sửa sau khi tải API, nhưng có thể lộ trước đó hoặc khi JavaScript không chạy.

Nên SSR cùng quy tắc scope/spoiler, hoặc chỉ render shell bình luận an toàn trước hydration. Không phải rò rỉ dữ liệu bí mật của API; đây là vi phạm hành vi che spoiler và phạm vi tập.

## Các lỗi chức năng và tính toàn vẹn tiếp theo

### 4. Báo lỗi player mất mô tả và báo thành công cả khi thất bại [P2]

`public/js/watch.js:1909` bỏ qua status trả về và catch ở dòng 1914 vẫn thông báo đã ghi nhận. `public/js/api.js:264` chỉ nhận ba tham số, bỏ details mà form truyền vào; backend có hỗ trợ details. Nên gửi đủ trường, chỉ đóng form sau confirmed success, giữ bản nháp và cho thử lại khi thất bại.

### 5. Nút quản lý phiên mobile quay lại chính trang tài khoản [P2]

`public/mobile/js/tai-khoan.js:110` dẫn tới /tai-khoan, nhưng middleware mobile ở `src/routes/viewRoutes.js:50` lại chuyển về /mobile/tai-khoan. Nên có UI bảo mật mobile hoặc link rõ /tai-khoan?view=desktop. Không thử đăng nhập tài khoản thật.

### 6. Xóa lịch sử trên trang chủ mobile không xóa nguồn dữ liệu đang hiển thị [P2]

`public/mobile/index.html:138` xóa localStorage TTPHIM_continue_watching; rail hiện tại dùng lịch sử máy chủ qua ContinueWatching.mount. Reload sẽ hiện lại. Nên dẫn tới quản lý lịch sử hoặc thực hiện hành động API có xác nhận, phân biệt ẩn Xem tiếp với xóa lịch sử.

### 7. Metadata thể loại/quốc gia lỗi bị cache như thành công trong 24 giờ [P2]

`src/services/kkphimService.js:693` đổi lỗi provider thành items rỗng rồi cache tại dòng 710 với TTL CATEGORIES 24h. VM giả lập fail rồi phục hồi vẫn nhận rỗng ở lần gọi tiếp theo. Nên giữ last-known-good, tách lỗi với rỗng hợp lệ và retry/backoff ngắn cho phần lỗi.

### 8. Like bình luận không gắn quyền sở hữu theo tài khoản [P2]

`src/routes/apiRoutes.js:261` không truyền user ID vào likeComment; `src/services/dbService.js:415` tăng/giảm aggregate cho mỗi request. Một account có thể tăng lặp hoặc unlike điểm của người khác; limiter chỉ làm chậm. Nên reaction theo user/comment, action enum và idempotency trong transaction.

### 9. Cache riêng tư chưa nhất quán [P2]

`src/routes/apiRoutes.js:77` trả inWatchlist/watchedHistory của người đăng nhập mà thiếu private/no-store. Các admin legacy cũng thiếu chính sách này. `src/server.js:82` có thể thay private/no-store của pageAccess thành no-cache khi phục vụ .html qua static. no-cache cho phép lưu rồi revalidate, không tương đương no-store.

Chưa chứng minh rò rỉ giữa hai người dùng trên production; tác động phụ thuộc cấu hình cache/proxy. Nên tập trung chính sách cache cho dữ liệu cá nhân/admin và không ghi đè header bảo vệ đã có.

### 10. Backup legacy cho tải toàn DB dạng plaintext, thiếu audit export [P2]

`src/routes/apiRoutes.js:745` xuất raw database JSON dù đã có hệ backup mã hóa. `src/routes/operationsRoutes.js:50` bỏ qua audit GET, nên export không có audit hành động tương ứng. API có kiểm tra admin; không phải lỗi tải DB không cần đăng nhập. Chưa tải backup thật.

Nên bỏ route legacy ở production hoặc thay bằng export mã hóa/audited, cân nhắc recent-auth cho xuất dữ liệu nhạy cảm.

### 11. Alias quản trị thiếu guard HTML [P2/Low impact]

`src/services/pageAccess.js:8` không nhận /quan-tri trong khi `src/routes/viewRoutes.js:219` phục vụ admin.html tại alias này. GET khách đã xác nhận /quan-tri trả 200 và public max-age=0; /admin được chuyển đăng nhập. API admin vẫn bảo vệ. Nên dùng registry alias chung hoặc redirect qua canonical được bảo vệ.

### 12. Card phim không sử dụng được bằng bàn phím ở một số rail/catalog [P2]

`public/js/catalog.js:399` dựng article onclick không có anchor/button/tabindex/keyboard; Top 10 ở `public/js/home.js:490` có kiểu tương tự. Nên dùng liên kết thật làm hành động chính, focus-visible và keyboard navigation.

### 13. Số lượt xem và metadata còn giá trị dựng sẵn [P2]

`public/js/detail.js:95` dùng movie.view || 128000, biến 0/missing thành 128.000 lượt xem ở web rộng. `src/services/templateService.js` còn một số fallback Full HD/Vietsub/Trọn Bộ và SSR khác frontend. Nên phân biệt số 0, thiếu dữ liệu và giá trị provider; không suy chất lượng/ngôn ngữ từ giá trị mặc định. Một số tiêu đề JS vẫn ghi TTPhim/Cinema 4K dù branding CineViet và nguồn không nhất thiết 4K.

## SEO và hiệu năng

### 14. Phim không tồn tại trả 200 và template mẫu [P2]

`src/routes/viewRoutes.js:122`, 143, 168, 188 trả template fallback với mã 200; các route mobile trả shell bất kể slug. GET kiểm tra slug không tồn tại đã xác nhận 200 ở cả bốn route. Route lạ chung trả 404 nhưng body là trang chủ (`src/server.js:89`). Nên có 404 rõ, tách outage provider thành 503/retry thay vì soft-404 hoặc nội dung phim mẫu.

### 15. SEO toàn site chưa hoàn thành [P2]

GET /robots.txt và /sitemap.xml: 404. Các trang mẫu home/catalog/detail/watch không có canonical/OpenGraph phù hợp; detail/watch thiếu meta description. Mobile detail/watch trả title chung khi chưa chạy JavaScript (`src/routes/viewRoutes.js:65`, 71). Sáu trang thông tin có mô tả/OpenGraph riêng nhưng vẫn chưa có canonical.

Nên chốt production origin, canonical giữa URL thường/mobile/static alias, chính sách index filter/search/watch, metadata động server-rendered, sitemap nội dung hợp lệ và robots có chủ đích. Sau đó mới xác minh Search Console/share preview. Không tự giả định domain production trong lượt rà.

### 16. CSS runtime phụ thuộc CDN trên nhiều trang [P3]

12/15 template được quét vẫn dùng cdn.tailwindcss.com (catalog/detail/watch/library/account/auth/admin và nhiều trang mobile). Home đã build CSS. Nên mở rộng build CSS local/pinned cho những trang còn lại; kiểm tra kích thước/font/ảnh bằng Lighthouse hoặc WebPageTest trên hạ tầng thật trước khi tuyên bố điểm hiệu năng.

## Cần kiểm chứng trước production, không phải lỗi triển khai đã chứng minh

- HTTPS/proxy trust/CORS/SSE thực tế, SMTP gửi và nhận email, recovery bằng email trên domain thật.
- Bắt buộc MFA/email verification theo chính sách; bảo quản signing/MFA keys ổn định và tách biệt. Không đọc hoặc suy đoán giá trị .env trong lượt này.
- Backup mã hóa lên nơi độc lập, theo dõi lịch chạy/cảnh báo và diễn tập restore; không coi việc có code backup là đã có vận hành offsite.
- Safari/iPhone/iPad/Android thật, bàn phím/safe-area/fullscreen/autoplay; tải đồng thời và topology PostgreSQL/replica chưa kiểm chứng lại ở lượt rà này.
- Khả dụng/điều khoản/quyền nhúng nguồn phim: iframe tải được không đảm bảo mọi tập phát được; không vượt CAPTCHA/chặn domain của provider.

## Thứ tự đề xuất

1. Ngăn xóa nhầm Xem tiếp và vòng lặp mã phòng; đồng bộ SSR spoiler.
2. Sửa report/mobile account/mobile history, reaction, cache riêng tư, backup export và alias admin.
3. Sửa 404, metadata thật và keyboard navigation; hoàn thiện SEO.
4. Build CSS còn lại; kiểm chứng production và thiết bị thật. Chưa nên thêm tính năng lớn trước các nhóm trên.
