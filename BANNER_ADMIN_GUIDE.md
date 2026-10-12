# Quản lý banner quảng cáo

Mở `/admin` → **Banner quảng cáo**. Phim nổi bật vẫn được quản lý riêng trong **Tra Cứu & Ghim Phim**; lưu quảng cáo không thay đổi phim ghim hoặc nội dung hero.

## Sáu vị trí

| Vị trí | Hiển thị |
| --- | --- |
| Header | Sau thanh điều hướng, trước nội dung trang chủ/trang xem |
| Footer | Cuối nội dung, trước footer |
| Bên trái / bên phải | Hai mép ngoài nội dung trên desktop rộng **từ 1600 px**, ẩn ở màn hình hẹp và mobile |
| Dưới phim nổi bật | Sau hero trang chủ, trước các hàng phim |
| Dưới video player | Sau khung player trên trang xem, bên ngoài video và điều khiển |

Các vị trí mặc định **tắt**. Mỗi vị trí có bật/tắt, tiêu đề, mô tả, URL ảnh desktop/mobile, liên kết, chữ nút, trọng tâm ảnh và lịch bắt đầu/kết thúc. Quảng cáo bật cần tiêu đề, ảnh desktop và liên kết HTTP(S) hoặc đường dẫn nội bộ. Ảnh mobile là tùy chọn. Lịch nhập giờ địa phương và lưu UTC; website kiểm tra lịch khi trả trang mới. Banner tắt/ngoài lịch không để lại khoảng trống.

Preview desktop/mobile không mở liên kết. Bấm **Lưu quảng cáo** để áp dụng; nếu quản trị viên khác đã thay đổi cấu hình, API trả 409 và giữ nguyên bản nháp để cân nhắc trước khi tải lại. URL và ngày giờ không hợp lệ trả 400. Dữ liệu lưu riêng trong `settings.advertising` qua `/api/admin/advertising`; các vị trí `home_middle`/`home_footer` cũ được đọc thành `below_featured`/`footer`. API cũ cho phim nổi bật vẫn được giữ để tương thích.

## Nguồn KKPhim

Dashboard hiển thị tên **KKPhim API**, lấy tổng phim/trang từ `https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=1`, cache 10 phút. Khi nguồn không phản hồi, hiển thị dữ liệu đã xác minh trước đó với trạng thái cũ hoặc **Chưa xác minh**, không gán tổng phim KKPhim bằng số cố định.

## Kiểm tra và giới hạn

- Test tự động dùng DB tạm và API giả lập, không ghi quảng cáo mẫu vào DB thật.
- Banner hông không hiện dưới 1600 px; không chồng lên vùng nội dung tối đa 1200 px. Trên màn hình đang mở cần tải lại để nhận thay đổi.
- Hiện nhập ảnh bằng URL, chưa có chức năng tải ảnh lên. Chưa đo CLS/Lighthouse hoặc kiểm tra Safari/iPhone thật.
