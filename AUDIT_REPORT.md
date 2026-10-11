# Báo cáo rà lỗi và sửa chữa

## Phạm vi

Rà backend Node/Express, hợp đồng API của web desktop/mobile/TV và vòng đời player Flutter. Ưu tiên lỗi phân quyền, mất dữ liệu và các luồng giao diện không hoạt động. Không sửa dữ liệu thật `data/db.json`, không nâng dependency hoặc thay kiến trúc DB.

## Đã sửa

| Nhóm | Lỗi | Sửa đổi |
| --- | --- | --- |
| Quản trị | `/admin/*` chưa dùng middleware phân quyền, khách có thể gọi API quản trị/backup | Yêu cầu đăng nhập và role admin trước tất cả route admin |
| Thư viện/tài khoản | Khách đọc/ghi vào user demo hoặc user test | `/user/*` yêu cầu đăng nhập, dùng `req.user.id` |
| Mật khẩu | Lưu mật khẩu thô và trả về trong login/register/me/profile | Hash scrypt có salt, loại password khỏi phản hồi tài khoản; chuyển mật khẩu cũ sang hash khi đăng nhập thành công |
| Đồng thời | Đọc–sửa–ghi JSON song song mất cập nhật | Xếp hàng toàn bộ thao tác DB trong một tiến trình; file tạm dùng UUID và rename |
| Độ tin cậy DB | Nuốt lỗi ghi và có thể dùng DB rỗng khi JSON hỏng | Trả lỗi khi ghi thất bại; không ghi đè file JSON hỏng bằng dữ liệu rỗng |
| Đăng ký | Request song song có thể tạo trùng email | Kiểm tra email trong thao tác tạo user đã xếp hàng |
| Token | Thiếu kiểm tra kiểu dữ liệu/hạn dùng và so sánh chữ ký thường | Kiểm tra payload/expiration, so sánh timing-safe |
| TV auth | Tin danh tính gửi từ client, cho phép ghi đè phiên đã duyệt, có thể trùng mã | Dùng user đã xác thực; phiên chỉ duyệt một lần; mã ngẫu nhiên crypto không trùng mã đang tồn tại |
| Routes | Khai báo đánh giá/báo lỗi trùng, handler phía sau không chạy | Bỏ handler trùng không thể tới |
| Mobile detail | Lấy episodes từ movie thay vì root của response | Truyền episodes và movie slug tường minh; URL xem dùng tập đầu thật |
| Mobile library | Nút lưu dùng backend nhưng thư viện đọc localStorage | Đọc/xóa qua API và chuẩn hóa movie_slug/movie_name/episode_name |
| Client auth | Server báo chưa đăng nhập nhưng UI dùng user cũ trong localStorage | Xóa danh tính cũ; thư viện trả lỗi đăng nhập thay vì dữ liệu rỗng giả thành công |
| TV web | Dùng featuredMovies/seriesMovies/singleMovies không tồn tại | Đọc spotlights/series/singles |
| Flutter QR | Chờ `authorized` trong khi backend trả `approved` | Sửa điều kiện trạng thái |
| Flutter players | Controller tải xong sau dispose/đổi tập vẫn phát hoặc ghi đè controller mới | Generation guard, giữ episode cố định, kiểm tra sau các await và dispose controller chưa được nhận |

## Kiểm chứng đã chạy

- Tái hiện trên mã DB cũ bằng DB tạm: **30 lần tăng lượt xem đồng thời, tất cả báo thành công nhưng chỉ lưu 1 lượt**.
- `npm test`: **16/16 test đạt** — 12 test backend qua HTTP/DB tạm và 4 test web bằng DOM giả lập.
- Test ghi đồng thời bản sửa: lưu đủ 30 lượt xem và 20 mục watchlist.
- `node --check`: **35 file JavaScript trong src/public hợp lệ**. Script inline TV được thực thi trong test frontend.
- `npm audit --json`: **0 lỗ hổng được báo cáo**.
- `git diff --check` cho phần sửa backend/web/tests: đạt.

Test không gọi nguồn phim bên ngoài, không sửa DB thật. Chạy lại bằng:

```powershell
npm.cmd test
```

## Giới hạn và việc cần xác minh trước phát hành

1. Máy không có Flutter/Dart trên PATH: chưa chạy `flutter analyze`, Flutter tests hoặc build APK/TV. Sửa player/QR mới được kiểm tra bằng đọc mã và diff.
2. Chưa kiểm thử playback HLS/Embed và thao tác remote TV trên thiết bị thật. Cần kiểm tra mở video mạng chậm rồi thoát/đổi tập để xác nhận không còn phát nền.
3. Flutter QR đã khớp trạng thái nhưng app chưa có luồng lưu/khôi phục token đăng nhập backend hoàn chỉnh; API TV/person vẫn dò host localhost/emulator. Cần cấu hình backend thực tế và tích hợp lưu phiên nếu phát hành ứng dụng đăng nhập đầy đủ.
4. Hàng đợi DB chỉ bảo vệ **một tiến trình Node**. Không chạy nhiều worker/server cùng ghi `db.json`; nếu cần scale, chuyển sang DB hỗ trợ transaction.
5. Mật khẩu cũ được nâng cấp khi user đăng nhập, không sửa hàng loạt dữ liệu hiện có. Khi triển khai thật cần đổi thông tin tài khoản demo/admin công khai và bảo vệ bản backup DB.

Đây là đợt rà/sửa các lỗi có căn cứ, không phải xác nhận toàn bộ dự án không còn bug.
