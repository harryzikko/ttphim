# Tối ưu tải website

## Các thay đổi

- Nén gzip HTML/JSON/JS/CSS bằng middleware compression. Loại SSE `/stream` khỏi nén để giữ cập nhật phòng xem phim tức thời.
- Cache tài nguyên tĩnh: URL có `v` dùng max-age 1 ngày, URL không phiên bản 5 phút; giữ ETag/304. HTML không dùng cache dài hạn.
- Gộp request home/movie trùng đang chạy để tránh nhiều người cùng tải gây lặp request nguồn phim.
- Các phim admin ghim được tải song song và vẫn giữ thứ tự.
- Bảng xếp hạng lấy metadata lượt xem/quality/year từ nguồn chính hoặc cache chi tiết có sẵn, không tải toàn bộ server video dự phòng và related chỉ để tính lượt xem.
- Timeout nguồn chính bao gồm cả thời gian tải JSON body.
- Cache HTML trang chủ trong RAM theo dữ liệu home và mtime của template. Dữ liệu mới hoặc template sửa sẽ render lại.
- Nhúng JSON home đã escape vào trang desktop; API.getHome tái sử dụng dữ liệu này và vẫn fallback API khi thiếu/hỏng.
- Preconnect CDN ảnh, preload ảnh banner đầu tiên nếu có phim ghim.
- Không cache công khai dữ liệu cá nhân, không đổi giao diện hay dữ liệu tài khoản.

## Số đo HTTP localhost thực tế

Đo số byte trên đường truyền với `Accept-Encoding: gzip`, không phải kích thước file sau giải nén.

| Nội dung | Trước | Sau | Giảm |
| --- | ---: | ---: | ---: |
| Trang chủ desktop + dữ liệu home | 384.934 B HTML + 107.452 B API | 44.154 B HTML gồm dữ liệu nhúng | khoảng 91% |
| API home độc lập (mobile/TV) | 107.452 B | 14.995 B | khoảng 86% |
| home.js | 47.075 B | 11.463 B | khoảng 76% |
| custom.css | 17.868 B | 4.071 B | khoảng 77% |

- TTFB trang chủ cache nóng trước: 54 ms và 116 ms trong hai lần đo.
- TTFB trang chủ cache nóng sau: 8 ms trong lần đo tương ứng.
- Lần tải đầu sau restart bản mới: TTFB 2.983 ms, có truy vấn nguồn phim ngoài. Không có số đo cold cache bản cũ tương đương nên không đưa phần trăm cải thiện cold load.
- Các con số thời gian là mẫu đo localhost, không đại diện mạng/thiết bị của mọi người dùng.

## Kiểm chứng

- `npm.cmd test`: **24/24 test đạt** (16 test hồi quy cũ + 8 test tối ưu).
- Test gộp 10 request home đồng thời chỉ chạy một bộ 5 request danh sách.
- Test ranking không gọi full movie detail/server dự phòng.
- Test thứ tự và tải song song phim ghim, cleanup request lỗi, cache metadata, timeout body.
- Test JSON nhúng không đóng được script, client dùng dữ liệu nhúng với 0 request home và fallback đúng.
- Kiểm tra HTTP: trang chủ 200, gzip giải nén hợp lệ, dữ liệu nhúng khớp `/api/home`, JS có ETag trả 304.
- `node --check`: **36 file JS src/public hợp lệ**.
- `git diff --check` cho phần backend/web/config/tests: đạt.
- Cài compression xong npm báo 0 lỗ hổng dependency.
- Server đã restart với mã mới và đang chạy tại http://localhost:3001.

## Giới hạn

- Browser panel không khả dụng trong phiên kiểm tra: chưa đo Lighthouse/LCP hay kiểm tra trực quan trên trình duyệt.
- Trang vẫn dùng Tailwind CDN runtime, font/ảnh ngoài; các tài nguyên này và cold request nguồn phim vẫn ảnh hưởng lần tải đầu.
- Cache RAM phục vụ một tiến trình và mất sau restart. Đây không phải benchmark production hay CDN.
