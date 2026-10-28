# Tai khoan, avatar va che do xem

## Da trien khai

- `/mobile/tai-khoan` co giao dien bao mat/thiet bi rieng, khong chuyen sang desktop: xac minh email/gui lai theo cooldown server, doi mat khau, bat/xac nhan/tat TOTP, ma khoi phuc hien mot lan trong DOM, xem va thu hoi phien dang nhap.
- Doi avatar tren desktop/mobile: chon JPG/PNG/WebP tu thiet bi, xem truoc, phong va di chuyen vung cat vuong; huy khong luu. Chi cap nhat avatar tai khoan/header/binh luan sau server thanh cong. Loi cho phep thu lai va giu avatar cu.
- Bo mac dinh hien tai chi gom 2 anh do nguoi dung cung cap: `vietnam-boy-v1.webp` / `vietnam-girl-v1.webp`, khong dung bo SVG tu ve. Anh goc giu tai `assets/avatar-sources`, generator resize khong crop sang WebP 512x512. Form dang ky web bat buoc chon Nam/Nu (radio co preview), server luu `gender: male/female` va gan avatar tuong ung. Khong doan gioi tinh tu ten, khong ghi de anh ca nhan.
- Client cu chua gui gender van duoc ho tro; khong ghi gender gia, fallback dung anh nam. Gia tri gender khac male/female (khi co gui) bi tu choi. Avatar SVG mac dinh cu duoc anh xa sang bo moi khi doc, khong migrate DB that.
- Binh luan va tra loi cu lay avatar hien tai cua chu tai khoan khi doc. Trang dang mo dong bo theo ID, khong theo ten; tab khac xac nhan lai bang `/api/auth/me`, khong tin du lieu localStorage lam danh tinh.
- **Tat den**: lam toi xung quanh, chi player va nut thoat noi len, giao dien xung quanh inert. Khong glow, pulse, phong/doi kich thuoc player. Bam nen toi/nut thoat hoac Escape de bat lai; khoi phuc focus/inert/vi tri cuon.
- **Rap rong**: player full chieu ngang cua so trinh duyet tren trang watch thuong, chieu cao bi gioi han theo cua so, giu ti le/contain; tap phim va noi dung phu xuong duoi. Doc lap voi tat den va Fullscreen API. Mobile dedicated da co player full width, bo sung tat den. Khong tao lai hay chuyen node video/iframe, khong doi URL provider.
- Khi con tro dang nam trong iframe khac origin, phim Escape do provider giu co the khong den trang cha; nut thoat hien ro van dung duoc.

## Gioi han va bao ve upload

- Toi da 5 MiB, 20 megapixel, moi chieu it nhat 32px; chi JPEG/PNG/WebP tinh. Khong nhan SVG/GIF/anh dong/du lieu gia anh.
- Server decode bytes that bang sharp, kiem tra crop, xu ly xoay EXIF, resize 512x512 WebP va bo metadata. Trinh duyet gui file goc, khong chi canvas da xu ly.
- Session/Origin/rate limit san co + 15 lan doi anh/15 phut/IP (shared limiter khi PostgreSQL duoc bat), toi da 3 tac vu decode dong thoi moi process.
- Ten file ngau nhien 128 bit, khong chua ID/email; chi duong dan 32 hex + `.webp` duoc phuc vu. Avatar la anh cong khai, khong phai tep rieng tu.
- File moi duoc ghi truoc, DB commit sau; ghi file/commit loi se don file moi va giu avatar cu. Chi xoa file cu sau commit. Form doi ten khong duoc ghi avatar, tranh khoi phuc URL cu khi upload dong thoi.

## Luu tru / backup production

- `AVATAR_DIR` chon thu muc anh ben vung ngoai checkout, quyen ghi chi cho service. Mac dinh local: thu muc `avatars` canh DB_PATH, thuong `data/avatars`; da ignore Git.
- Production nen dat duong dan tuyet doi. Nhieu replica phai cung mount mot thu muc anh ben vung va co quyen doc/ghi nhat quan; PostgreSQL khong tu luu bytes anh. Khong deploy upload tren filesystem ephemeral.
- Backup ma hoa DB hien tai **khong chua tep avatar**. Can snapshot/sao luu ca AVATAR_DIR theo chinh sach bao mat va thu phuc hoi DB + tep anh nhat quan. Khong co backup/restore anh production nao duoc thuc hien trong dot nay.
- Reverse proxy phai cho body it nhat 5 MiB (cong overhead neu can); khong cache API private. URL avatar doi moi sau moi upload nen khong can cache-busting tren cung ten file.

## Kiem chung SMTP that

Cong cu `node scripts/check-smtp.cjs` chi doc bien moi truong cua process, **khong load `.env`**, khong in gia tri SMTP/mat khau/raw error, khong tu gui thu.

1. Nap cau hinh production qua secret manager/process env: SMTP_HOST, SMTP_PORT (mac dinh 465), SMTP_FROM, SMTP_USER, SMTP_PASS. PUBLIC_ORIGIN HTTPS dung van can cho link xac minh/reset cua ung dung.
2. Chay `node scripts/check-smtp.cjs` de verify ket noi/TLS/auth; khong dong nghia thu da duoc giao.
3. Chi gui khi chi dinh ro: `node scripts/check-smtp.cjs --send --to recipient@example.com`. Gui mot thu chan doan, khong tao token tai khoan. `message_accepted` chi la SMTP chap nhan, **khong phai da nhan thu**.
4. Nguoi nhan kiem tra inbox/spam va header SPF/DKIM/DMARC. Sau do thu luong xac minh/reset voi tai khoan test tren domain HTTPS production, xac nhan link dung domain, token mot lan/het han va cooldown.

Lan kiem tra local nay dung o `configuration`: shell khong co SMTP_HOST/FROM/USER/PASS. Khong gui thu that; chua xac nhan production send/receive.

## Kiem thu

- `npm test`: 424 tests, 421 pass, 3 conditional skips, 0 fail. Bao gom dang ky Nam/Nu qua SDK/route/service that tren browser, kiem tra DB/login va gia tri sai; avatar backend/browser, mobile security va view modes.
- `npm run test:player-e2e`: 11/11 pass (HLS that tren Edge, DB/server/media thu nghiem).
- `npm run test:security-e2e`: 1/1 pass (verification/reset/MFA/session fixture, khong chung nhan SMTP production).
- Avatar browser: upload goc, crop/zoom/EXIF so sanh pixel voi preview, file WebP 512x512 khong EXIF, DB loi/thu lai, reload, header va hai tab, owner-only comment sync, 320/390/820/1440px.
- View modes browser: 390x844, 844x390, 1024x768, 1920x1080, 2560x1080; full bleed, ti le, dimmer hit test, focus/inert/Escape/fullscreen, iframe node/load count va video position khong doi.
- `npm run build:css`, `npm run check:site-css`, footer/default-avatar generator checks pass. Production dependency audit: 0 known vulnerabilities.
- Dang ky browser da kiem tra 320/390/820/1440px, khong tran ngang, radio ban phim, bat buoc chon, chuyen dang nhap khong bi required an, anh 512px tai thanh cong. Screenshot duoc luu; khong thay the kiem chung thiet bi vat ly.
- Chua chung nhan Safari/iPhone/iPad/Android vat ly, production SMTP/TLS/shared media storage hay offsite restore.
