# Kết quả sửa lỗi sau audit CineViet

## Phạm vi và dữ liệu

Thực hiện các nhóm lỗi trong SITE_AUDIT.md: thư viện, Watch Party, SSR spoiler, tài khoản mobile, báo lỗi, cache riêng tư/reaction, export backup legacy, alias quản trị, metadata/404/SEO và Tailwind local. Không đổi thông tin quản trị, signing/MFA key, cấu hình bật MFA, dữ liệu thư viện/bình luận/histories thật. Các bài ghi dữ liệu dùng DB/phiên giả lập hoặc scratch. Thông tin gốc của audit là snapshot trước sửa; tài liệu này mô tả trạng thái sau sửa.

## Đã sửa

- Batch thư viện phân biệt yêu thích / Xem tiếp / lịch sử: xóa yêu thích, ẩn khỏi Xem tiếp hoặc xóa lịch sử có xác nhận đúng ngữ nghĩa. Không dùng API watchlist cho mọi tab. Nút Chuyển mục chưa có backend được bỏ khỏi toolbar. Mỗi thao tác dùng tab/selection đã chốt, chặn trùng và giữ khả năng thử lại khi thất bại.
- Watch Party dùng namespace KP- với bảy ký tự ngẫu nhiên mật mã, tối đa 32 lần thử cấp mã, trần 500 phòng và 3 phòng/current host. Mã cũ vẫn nhận. Hết dung lượng trả 503; vượt trần host trả 429, không vòng lặp đồng bộ vô hạn.
- SSR detail/watch không nhúng nội dung bình luận. Container tải an toàn được thay theo ID có xử lý div lồng; frontend lấy dữ liệu, lọc tập và che spoiler sau đó. Nội dung spoiler/khác tập không chớp lộ trước hydration. Comment episode_slug được lưu ngay cả khi không có timestamp.
- Like/unlike bình luận/phản hồi gắn tài khoản và idempotent trong transaction. Unlike không trừ lượt của người khác. Tổng legacy được bảo toàn; không tạo danh sách người thích giả để giải thích số cũ. API chỉ trả liked của viewer, không trả liked_by/reaction_base; frontend dùng liked từ server thay vì trạng thái localStorage cũ.
- Báo lỗi player gửi đầy đủ details, chỉ báo thành công khi status true, giữ nội dung/modal khi lỗi, giải phóng nút gửi và chống gửi trùng.
- Link bảo mật mobile đi đến trang desktop với view=desktop#tab-security; controller tài khoản mở đúng tab theo hash. Nút lịch sử mobile đi đến quản lý lịch sử thay vì xóa một localStorage key không còn dùng.
- API admin/auth/user, movie detail có dữ liệu viewer và comments có private/no-store + Vary theo cookie/authorization. Static HTML không ghi đè no-store. /quan-tri và .html alias có cùng guard admin.
- Xuất raw database JSON tại /api/admin/backup được ngừng (410 cho admin, guest/member vẫn bị chặn). UI dẫn tới Backup mã hóa trong Vận hành, không còn gọi JSON plaintext là an toàn. Hệ backup mã hóa/verify hiện có được giữ, không tự chạy backup thật.
- Category/country metadata cache độc lập: coalesce request, giữ last-known-good, retry phần lỗi sau 30s, không cache lỗi thành rỗng thành công 24h. Response có partial/stale/errors khi phù hợp; rỗng hợp lệ vẫn được cache theo TTL chuẩn.
- Catalog và Top10 dùng anchor thật, giữ mã hóa đường dẫn và escape dữ liệu nguồn, có thể focus/Enter bằng bàn phím.
- Số view 0 vẫn là 0, missing/invalid là chưa có dữ liệu. Bỏ các fallback giả 128000, 4K, Full HD, Vietsub, Trọn bộ, năm và điểm cố định ở các controller/SSR đã sửa. Storage keys cũ không đổi để bảo toàn dữ liệu.
- Phim/tập/Server không tồn tại trả 404 thật; lỗi network/malformed upstream trả 503 với Retry-After. Đường dẫn sai có trang lỗi riêng, không dùng trang chủ hay phim mẫu. Chỉ tăng view sau khi xác nhận phim hợp lệ.

## SEO và domain

`src/services/seoService.js` áp dụng title/description/Open Graph an toàn từ dữ liệu thật trên URL phim thường/mobile. Canonical mobile trỏ về URL thường khi PUBLIC_ORIGIN được cấu hình. Detail có structured data Movie/TVSeries không bịa rating, license hoặc video URL. Search/filter/player/private/error có chính sách noindex; URL static HTML được đánh dấu tránh index trùng.

- `/robots.txt` phục vụ được và chặn khu vực API/private.
- `/sitemap.xml` liệt kê trang công khai và một tập phim đã biết từ feed trang chủ, không crawl toàn kho/không tuyên bố sitemap bao phủ mọi provider.
- **Chưa có PUBLIC_ORIGIN trong cấu hình server local đang chạy**: metadata vẫn có, nhưng canonical để trống và sitemap trả 503 có chủ đích. Đặt PUBLIC_ORIGIN thành origin HTTPS chính thức đã xác nhận rồi restart để bật URL công khai. Không lấy domain từ Host header hoặc tự đoán domain.
- Chưa thực hiện xác minh Search Console, crawl Google hoặc preview chia sẻ trên hạ tầng production.

## CSS local

19 trang còn dùng Tailwind runtime đã chuyển sang 11 bundle theo theme, giữ cấu hình theme độc lập trong scripts/site-tailwind.themes.json. Trang chủ giữ build riêng hiện có. Mọi HTML public hiện không còn cdn.tailwindcss.com hay tailwind.config executable.

Lệnh:

```powershell
npm run build:css
npm run check:site-css
node scripts/build-site-footer.cjs --check
```

Builder quét HTML/JS và template SSR, dựng CSS minify, có --check read-only/idempotent. Các bundle theme tổng khoảng 608KB raw / 105KB gzip, mỗi trang chỉ dùng một bundle phù hợp. Font/ảnh bên thứ ba vẫn có thể phát sinh request; không tuyên bố đã self-host toàn bộ font/ảnh. Đã giữ khung icon 1em trong stylesheet nền để font icon tải lỗi/chậm không đẩy vỡ header.

## Production preflight

```powershell
node scripts/production-preflight.cjs
```

Công cụ chỉ đọc biến môi trường được cấp cho tiến trình, không tự load .env, không in giá trị secret, không gửi mail/webhook và không tạo backup. Exit 1 khi thiếu yêu cầu. Kiểm tra origin HTTPS, key ổn định/tách biệt, DB persistent, replica storage, SMTP, backup, policy email/MFA và trust proxy không quá rộng. Kiểm tra này không chứng nhận khóa đang được giữ an toàn hoặc cấu hình hạ tầng có hoạt động thật.

Lần chạy trong môi trường shell hiện tại chưa đủ biến production; không dùng kết quả này để suy đoán nội dung file .env hay kết luận cấu hình máy production khác. Cần chạy bằng environment của deployment thật.

Các gate còn cần chủ hạ tầng xác nhận: domain/origin chính thức, TLS/proxy/CORS/SSE, gửi/nhận SMTP và recovery, administrator MFA enrollment trước khi bật bắt buộc, backup offsite + restore drill, load/replica topology, Safari/iPhone/iPad/Android thật. Không tự bật policy hoặc thay key có thể khóa tài khoản hiện tại.

## Kiểm chứng đã chạy

- Suite toàn bộ trước kiểm tra cuối: 387 đạt, 3 conditional skips (390 bài), không bài lỗi.
- HLS E2E local media/database tạm: 11/11.
- Security browser E2E với mail giả lập: 1/1.
- test:production: 33/33 (production guards/DB readiness/proxy/shutdown và frontend security).
- 20 ca trang phim thường/mobile ở 320/390/820/1440/1720px sau CSS local: ảnh/tập/nguồn, current-episode comments, spoiler và không tràn ngang/page errors.
- 24 ca trang chủ/catalog/library/account thường/mobile ở 320/820/1440px: CSS local, keyboard anchor, batch tiếp tục xem và mở hash bảo mật. Chặn tài nguyên ngoài trong phép đo DOM/CSS để tách lỗi mạng; đã sửa một lỗi fallback font icon khiến header tràn khi font không về.
- Live local GET: phim/tập/Server sai trả 404 + no-store/noindex; /quan-tri và /admin.html redirect đăng nhập; API admin guest 401 + no-store; API movie/comment 200 + private/no-store. Home/mobile/detail/watch/info có metadata server; robots 200, sitemap 503 vì chưa có origin cấu hình.
- npm audit --omit=dev: 0 lỗ hổng đã biết tại thời điểm chạy. Footer generator không thay output; site CSS check current.
- Một lượt review hẹp phát hiện guard thiếu kiểm tra Server khi URL không có tập; đã sửa và thêm test desktop/mobile.

Server local giữ ở http://localhost:3001; không triển khai lên host production trong phiên này.
