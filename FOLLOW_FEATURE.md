# Theo doi phim va thong bao tap moi

## Trang thai trien khai

Da tich hop backend, nut Theo doi tren chi tiet desktop/mobile, bang thong bao header desktop va hop thoai mobile. Theo doi doc lap voi watchlist: luu phim khong tu bat theo doi, bo theo doi khong xoa phim da luu.

- Lan theo doi dau lay danh sach tap co link HTTP(S) lam moc; khong bao lai cac tap cu.
- Mo bang thong bao moi kiem tra cap nhat. Khong co scheduler, email, push hay cam ket realtime.
- Moi lan kiem tra toi da 10 phim; throttle 5 phut theo slug duoc luu ben vung. Cache chi tiet provider hien co the giu du lieu 30 phut, nen tap moi co the duoc phat hien tre hon.
- Toi da 100 phim theo doi va 100 thong bao moi nhat moi tai khoan. Nhieu hon 10 phim den han can mo bang o cac lan sau.
- Tap trung lap tren nhieu server, sap xep lai, xoa roi xuat hien lai khong tao thong bao lap. Ten/slug khong so bi doi hoac so tap duoc tai su dung giua cac mua khong the suy luan chac chan khi nguon thieu season ID.
- Link ton tai khong dong nghia stream phat thanh cong; khong probe hay vuot gioi han provider.

## API va du lieu

Tat ca endpoint rieng tu chi dung req.user.id, khong tin user ID trong body/query, va tra Cache-Control: private, no-store. Loi dung status HTTP va envelope status/message; thanh cong tra status/data.

| Method | URL | Du lieu |
| --- | --- | --- |
| GET | /api/user/follows | Danh sach theo doi cua chinh tai khoan |
| POST | /api/user/follows/:slug | following: true, follow |
| DELETE | /api/user/follows/:slug | following: false, movie_slug |
| GET | /api/user/follow-notifications | Kiem tra co gioi han roi tra feed rieng |
| POST | /api/user/follow-notifications/:id/read | Danh dau da doc; ID tai khoan khac tra 404 |
| GET | /api/notifications | Thong bao rieng truoc thong bao danh muc/chung |

Trang thai doc cua follow_episode duoc luu tren server. LocalStorage cua thong bao chung khong ghi de trang thai nay. Giao dien chi chuyen trang/bao da doc sau phan hoi thanh cong; loi co the thu lai. Mobile chuyen URL xem sang route /mobile.

Cac mang JSON bo sung: follows, follow_notifications, follow_checks. Ghi qua db.mutate de giu du lieu khac; kho PostgreSQL JSON document khong can tao bang moi. Fetch provider nam ngoai transaction. Generation ID ngan refresh dang cho khoi phuc follow da huy hoac ap baseline cu cho lan theo doi moi.

Service: src/services/followService.js, factory createFollowService({ db, provider, now, refreshMs, maxLookups, id }). Router: src/routes/followRoutes.js, da mount trong apiRoutes. Frontend: public/js/follows.js va public/css/follows.css, da gan trong hai template chi tiet. Public helper MovieFollows.mount co the inject API/DOM de kiem thu; auto-mount chi tren /phim/:slug va /mobile/phim/:slug.

## Kiem chung

- tests/follows.test.js: 17 ca isolated, bao gom baseline, tap that, dedupe, throttle, cap, race huy/theo doi lai, account isolation, router va nut desktop/mobile.
- tests/notifications-ui.test.js: 3 ca DOM, bao gom trang thai doc server, ban phim, loi ghi va mark-all mot phan, mobile retry va safe text.
- Edge tich hop desktop 1440 px/mobile 390 px: nut khong doi watchlist, tap cu im lang, tap moi dung URL va khong lap, doc duoc luu tren server; khong pageerror.
- Bo test chung luot chot: 211 pass, 3 skip co dieu kien. Player E2E 10/10 va security E2E 1/1 chay rieng.
- Cac test mutation dung du lieu tam; khong seed tai khoan/banner/lich su that. Khong kiem chung PostgreSQL lai trong dot nay, SMTP/push, Safari/iPhone/Android that hoac production hosting.
