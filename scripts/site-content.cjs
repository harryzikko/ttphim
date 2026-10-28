const email = 'admin@cineviet.live';
const pages = [
  {
    slug: 'gioi-thieu', title: 'Giới thiệu CineViet', description: 'Tìm hiểu CineViet, các tính năng khám phá phim, thư viện cá nhân và trải nghiệm xem trên nhiều kích thước màn hình.',
    intro: 'Một nơi để khám phá phim và tiếp tục những câu chuyện bạn yêu thích.',
    sections: [
      ['CineViet là gì?', 'CineViet cung cấp giao diện khám phá phim bộ, phim lẻ, hoạt hình, chương trình truyền hình và các nguồn Song Ngữ khi có sẵn. Thông tin, hình ảnh và khả năng phát phụ thuộc dữ liệu của từng nguồn.'],
      ['Những gì bạn có thể làm', 'Tìm kiếm theo tên tiếng Việt hoặc tên gốc, lọc theo thể loại và quốc gia, chọn tập và nguồn phát. Khi đăng nhập, bạn có thể lưu yêu thích, theo dõi tập mới, quản lý lịch sử và tùy chọn phát.'],
      ['Trải nghiệm có giới hạn rõ ràng', 'Không phải phim nào cũng có 4K, nhiều giọng đọc hay phụ đề. Chất lượng thực tế phụ thuộc nguồn, kết nối và trình duyệt. Trình phát nhúng có thể có quảng cáo hoặc hạn chế do nhà cung cấp quyết định. Web hiện chưa hỗ trợ tải phim để xem offline.'],
      ['Góp ý cho CineViet', `Nếu gặp thông tin chưa đúng hoặc vấn đề trải nghiệm, hãy gửi URL trang và mô tả tới ${email}. Chúng tôi không yêu cầu bạn cung cấp mật khẩu hoặc mã xác thực qua email.`]
    ]
  },
  {
    slug: 'tro-giup', title: 'Trung tâm trợ giúp', description: 'Hướng dẫn tìm phim, chọn tập và nguồn phát, quản lý yêu thích, lịch sử và xử lý sự cố thường gặp trên CineViet.',
    intro: 'Hướng dẫn ngắn để tìm đúng phim, xem thuận tiện và xử lý lỗi thường gặp.',
    sections: [
      ['Tìm phim và bắt đầu xem', 'Dùng mục Khám phá để tìm tên phim, tên gốc hoặc kết hợp các bộ lọc. Mở chi tiết phim, chọn máy chủ và tập muốn xem. Không có kết quả có thể do phạm vi dữ liệu nguồn, không đồng nghĩa phim chắc chắn không tồn tại.'],
      ['Video không chạy hoặc bị đứng', 'Kiểm tra kết nối, tải lại trang một lần và bấm Phát nếu trình duyệt không cho tự phát. Bạn có thể chọn một nguồn khác có cùng tập; hệ thống không bảo đảm mọi nguồn đều có đầy đủ tập. Nếu xuất hiện đề nghị khôi phục, bạn tự xác nhận trước khi đổi nguồn.'],
      ['Nguồn Song Ngữ và trình phát nhúng', 'Âm thanh và phụ đề chỉ hiện khi nguồn thực sự có các track đó. Với player nhúng, hãy dùng điều khiển bên trong khung phim. Một số nhà cung cấp có quảng cáo hoặc chặn khi mở công cụ Inspect/F12; CineViet không kiểm soát hay vượt qua những hạn chế này.'],
      ['Yêu thích, theo dõi và lịch sử', 'Trái tim lưu phim vào Yêu thích. Chuông theo dõi tập mới là chức năng riêng; thông báo được kiểm tra khi bạn mở bảng thông báo và có thể trễ theo nguồn. Ẩn khỏi Xem tiếp không xóa lịch sử; bạn có thể hiện lại từ mục Lịch sử.'],
      ['Tài khoản và an toàn', 'Cần đăng nhập để dùng các tính năng cá nhân. Bạn có thể quản lý phiên đăng nhập và tùy chọn được hỗ trợ trong trang Tài khoản. Không gửi mật khẩu, cookie đăng nhập, mã QR đăng nhập hoặc mã khôi phục cho bất kỳ ai.'],
      ['Báo lỗi chính xác hơn', `Gửi tới ${email}: URL trang, tên phim/tập, máy chủ đã chọn, tên trình duyệt/thiết bị và thời điểm xảy ra lỗi. Ảnh chụp nên che thông tin cá nhân; không gửi toàn bộ cookie hoặc khóa truy cập.`]
    ]
  },
  {
    slug: 'lien-he', title: 'Liên hệ & báo lỗi', description: 'Liên hệ CineViet để gửi góp ý, báo thông tin phim không chính xác, sự cố phát hoặc yêu cầu hỗ trợ tài khoản.',
    intro: 'Gửi thông tin đủ rõ để vấn đề của bạn có thể được kiểm tra đúng trường hợp.',
    sections: [
      ['Kênh liên hệ công khai', `Email: ${email}. Đây là địa chỉ nhận hỗ trợ, góp ý và yêu cầu liên quan nội dung. Hiện chưa công bố số điện thoại, địa chỉ giao dịch hoặc kênh mạng xã hội chính thức trên trang này. Không có cam kết phản hồi tức thì hoặc hỗ trợ 24/7.`],
      ['Thông tin nên gửi khi báo lỗi', 'Tiêu đề email nên ghi “Báo lỗi CineViet”. Trong nội dung, kèm URL phim/tập, máy chủ, thao tác gây lỗi, trình duyệt/thiết bị và ảnh chụp nếu có. Với lỗi đăng nhập, chỉ cung cấp email tài khoản khi cần, không cung cấp mật khẩu hoặc mã xác thực.'],
      ['Yêu cầu về dữ liệu tài khoản', 'Gửi yêu cầu từ email bạn đang dùng cho tài khoản nếu có thể. Nêu rõ dữ liệu hoặc hành động bạn muốn được hỗ trợ. Việc xác minh cần bảo đảm không tiết lộ dữ liệu cho người không có quyền truy cập.'],
      ['Yêu cầu bản quyền', 'Vui lòng đọc trang Bản quyền trước khi gửi, nêu URL nội dung và căn cứ quyền sở hữu hoặc đại diện. Không cần đính kèm giấy tờ nhạy cảm không liên quan đến yêu cầu.']
    ]
  },
  {
    slug: 'dieu-khoan', title: 'Điều khoản sử dụng', description: 'Các nguyên tắc sử dụng CineViet, trách nhiệm tài khoản, nội dung cộng đồng và giới hạn của dữ liệu, nguồn phát bên ngoài.',
    intro: 'Những nguyên tắc cơ bản khi sử dụng website và các tính năng cộng đồng.',
    sections: [
      ['Sử dụng phù hợp', 'Sử dụng dịch vụ theo pháp luật áp dụng và quyền của bên liên quan. Không tìm cách truy cập tài khoản của người khác, khai thác lỗ hổng, phá hoại dịch vụ, thu thập dữ liệu cá nhân trái phép hoặc gây tải bất thường bằng công cụ tự động.'],
      ['Tài khoản của bạn', 'Bạn có trách nhiệm bảo vệ thông tin đăng nhập và chỉ sử dụng tài khoản được phép. Các thao tác lưu phim, theo dõi, bình luận và đánh giá phải được thực hiện bằng phiên đăng nhập hợp lệ. Báo ngay cho bộ phận hỗ trợ nếu nghi ngờ tài khoản bị truy cập trái phép.'],
      ['Bình luận và nội dung cộng đồng', 'Không đăng nội dung xúc phạm, đe dọa, lừa đảo, spam, thông tin cá nhân của người khác hoặc nội dung xâm phạm quyền sở hữu trí tuệ. Đánh dấu spoiler khi tiết lộ tình tiết. Nội dung và tài khoản vi phạm có thể bị kiểm duyệt hoặc hạn chế theo mức độ.'],
      ['Dữ liệu và nguồn phát', 'Thông tin phim có thể thiếu, chậm cập nhật hoặc thay đổi theo nguồn. Liên kết và player bên ngoài có điều khoản riêng. CineViet không bảo đảm mọi nội dung luôn khả dụng, mọi thiết bị đều tương thích hoặc tất cả phim đều có cùng chất lượng.'],
      ['Quyền đối với nội dung', 'Tên phim, hình ảnh, video, nhãn hiệu và dữ liệu của bên thứ ba thuộc các chủ thể quyền tương ứng. Việc hiển thị thông tin không mặc nhiên trao quyền sao chép, phân phối hoặc sử dụng lại nội dung.'],
      ['Thay đổi và liên hệ', `Các nguyên tắc có thể được cập nhật khi chức năng hoặc yêu cầu vận hành thay đổi. Hãy kiểm tra nội dung hiện hành tại trang này. Với câu hỏi hoặc tranh chấp liên quan, liên hệ ${email}; các quyền bắt buộc theo pháp luật áp dụng không bị loại trừ bởi phần giới hạn trên.`]
    ]
  },
  {
    slug: 'quyen-rieng-tu', title: 'Chính sách quyền riêng tư', description: 'Thông tin về dữ liệu tài khoản, lịch sử xem, lưu trữ trình duyệt và nguồn phát bên thứ ba khi sử dụng CineViet.',
    intro: 'Giải thích các nhóm dữ liệu liên quan đến những tính năng website đang cung cấp.',
    sections: [
      ['Dữ liệu tài khoản và thư viện', 'Khi sử dụng tài khoản, website xử lý thông tin hồ sơ và xác thực cần thiết, các phiên đăng nhập, yêu thích, theo dõi, lịch sử xem và tùy chọn phát. Bình luận, trả lời và phiếu đánh giá bạn gửi được xử lý để hiển thị hoặc vận hành chức năng tương ứng.'],
      ['Cookie và lưu trữ trên thiết bị', 'Cookie hỗ trợ phiên đăng nhập và lựa chọn giao diện. Trình duyệt có thể lưu tiến độ khách, âm lượng, tùy chọn thiết bị, hồ sơ hiển thị tạm và tài nguyên PWA. Xóa dữ liệu trình duyệt có thể làm mất các tùy chọn/tiến độ chỉ lưu cục bộ và yêu cầu đăng nhập lại.'],
      ['Dữ liệu kỹ thuật và bảo vệ dịch vụ', 'Website xử lý thông tin yêu cầu, thời điểm, lỗi và chỉ số vận hành để bảo vệ tài khoản, giới hạn lạm dụng và chẩn đoán sự cố. Các nhóm dữ liệu này không có cùng mục đích với nội dung thư viện cá nhân. Chính sách này không đưa ra thời hạn lưu giữ cố định chưa được xác nhận cho mọi môi trường triển khai.'],
      ['Bên thứ ba', 'Hình ảnh, font hoặc player nhúng có thể được tải từ máy chủ bên ngoài. Khi kết nối, nhà cung cấp có thể nhận địa chỉ IP, thông tin trình duyệt và dữ liệu theo chính sách riêng của họ; iframe có thể sử dụng cookie hoặc quảng cáo. CineViet không kiểm soát nội dung và cơ chế theo dõi bên trong các player đó.'],
      ['Lựa chọn và yêu cầu của bạn', 'Bạn có thể cập nhật các thông tin được hỗ trợ trong Tài khoản, quản lý phiên đăng nhập, xóa lịch sử hoặc bỏ yêu thích/theo dõi. Việc ẩn Xem tiếp không phải xóa dữ liệu. Với yêu cầu truy cập, chỉnh sửa hoặc xóa dữ liệu khác, liên hệ email hỗ trợ để được xác minh và xem xét.'],
      ['Liên hệ và lưu ý an toàn', `Email: ${email}. Không gửi mật khẩu, cookie, mã xác thực hoặc mã khôi phục. Dữ liệu chỉ nên được yêu cầu ở mức cần thiết để xác minh và xử lý vấn đề; không có phương thức truyền/lưu trữ nào được bảo đảm an toàn tuyệt đối.`]
    ]
  },
  {
    slug: 'ban-quyen', title: 'Bản quyền & yêu cầu nội dung', description: 'Hướng dẫn chủ thể quyền hoặc người được ủy quyền gửi yêu cầu xem xét nội dung hiển thị trên CineViet.',
    intro: 'Kênh tiếp nhận yêu cầu liên quan quyền sở hữu trí tuệ và nội dung hiển thị.',
    sections: [
      ['Tôn trọng quyền của chủ thể nội dung', 'Phim, hình ảnh, logo, tên gọi và dữ liệu có thể thuộc các chủ thể quyền khác nhau. CineViet không tuyên bố sở hữu hoặc có giấy phép đối với mọi nội dung bên thứ ba chỉ vì nội dung đó xuất hiện trên website.'],
      ['Cách gửi yêu cầu', `Gửi tới ${email} với tiêu đề “Yêu cầu bản quyền CineViet”. Nêu tác phẩm/nội dung liên quan, URL cụ thể trên CineViet, mô tả quyền bị ảnh hưởng, căn cứ sở hữu hoặc ủy quyền, tên và phương thức liên lạc của người gửi. Nếu biết URL nguồn bên ngoài, bạn có thể cung cấp thêm để việc kiểm tra chính xác hơn.`],
      ['Tính chính xác và dữ liệu cần thiết', 'Chỉ gửi yêu cầu khi bạn là chủ thể quyền hoặc có quyền đại diện, và bảo đảm thông tin trung thực. Không gửi giấy tờ tùy thân hoặc dữ liệu nhạy cảm vượt quá nhu cầu chứng minh liên quan. Yêu cầu chưa đủ thông tin có thể cần bổ sung để xác định nội dung.'],
      ['Phạm vi xem xét', 'Yêu cầu sẽ được xem xét trong phạm vi nội dung/liên kết do website quản lý và pháp luật áp dụng. Việc gỡ hoặc hạn chế một liên kết trên CineViet không xóa tài nguyên tại máy chủ nguồn; bạn có thể cần liên hệ riêng chủ thể vận hành nguồn đó. Trang này không cam kết thời hạn xử lý cố định hoặc kết quả tự động cho mọi yêu cầu.']
    ]
  }
];
const groups = [
  ['Khám phá', [['Phim bộ', '/kham-pha?type=phim-bo'], ['Phim lẻ', '/kham-pha?type=phim-le'], ['Chiếu rạp', '/kham-pha?type=chieu-rap'], ['Song Ngữ', '/kham-pha?type=song-ngu'], ['Anime & hoạt hình', '/kham-pha?type=hoat-hinh'], ['TV Show', '/kham-pha?type=tv-shows']]],
  ['Thư viện của bạn', [['Yêu thích', '/danh-sach?tab=watchlist'], ['Xem tiếp', '/danh-sach?tab=continue'], ['Lịch sử xem', '/danh-sach?tab=history'], ['Tài khoản', '/tai-khoan']]],
  ['CineViet & hỗ trợ', [['Giới thiệu', '/gioi-thieu'], ['Trợ giúp', '/tro-giup'], ['Liên hệ & báo lỗi', '/lien-he'], ['Điều khoản sử dụng', '/dieu-khoan'], ['Quyền riêng tư', '/quyen-rieng-tu'], ['Bản quyền', '/ban-quyen']]]
];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function href(url, mobile) {
  if (!mobile) return url;
  if (url.startsWith('/danh-sach?tab=continue')) return '/mobile/danh-sach?tab=history';
  return /^\/(?:kham-pha|danh-sach|tai-khoan)(?:\?|$)/.test(url) ? '/mobile' + url : url;
}
function footer(mobile = false) {
  return `<footer class="cv-footer" aria-label="Thông tin CineViet">
  <div class="cv-footer-inner">
    <div class="cv-footer-intro"><a class="cv-footer-brand" href="${mobile ? '/mobile' : '/'}" aria-label="CineViet - Trang chủ">Cine<span>Viet</span></a><p>Khám phá phim hay. Lưu câu chuyện bạn thích. Xem tiếp khi thuận tiện.</p><a class="cv-footer-email" href="mailto:${email}">${email}</a><span class="cv-footer-note">Hỗ trợ · Góp ý · Yêu cầu bản quyền</span></div>
    <nav class="cv-footer-nav" aria-label="Liên kết cuối trang">${groups.map(([title, links]) => `<div class="cv-footer-group"><h2>${escape(title)}</h2><ul>${links.map(([label, url]) => `<li><a href="${escape(href(url, mobile))}">${escape(label)}</a></li>`).join('')}</ul></div>`).join('')}</nav>
    <div class="cv-footer-bottom"><p>© ${new Date().getFullYear()} CineViet</p><p>Chất lượng và khả năng phát phụ thuộc nguồn, thiết bị và kết nối. Nội dung bên thứ ba thuộc các chủ thể quyền tương ứng.</p><button type="button" class="cv-footer-top" data-footer-top hidden>Về đầu trang <span aria-hidden="true">↑</span></button></div>
  </div>
</footer>`;
}
function informationPage(page) {
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${escape(page.title)} | CineViet</title><meta name="description" content="${escape(page.description)}"><meta property="og:type" content="website"><meta property="og:locale" content="vi_VN"><meta property="og:site_name" content="CineViet"><meta property="og:title" content="${escape(page.title)} | CineViet"><meta property="og:description" content="${escape(page.description)}"><meta name="theme-color" content="#11131c"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/css/site-footer.css?v=1.0.0"><script defer src="/js/site-footer.js?v=1.0.0"></script></head>
<body class="cv-info-page"><header class="cv-info-header"><a class="cv-footer-brand" href="/" aria-label="CineViet - Trang chủ">Cine<span>Viet</span></a><a href="/kham-pha">Khám phá phim <span aria-hidden="true">↗</span></a></header><main id="noi-dung" class="cv-info-main"><nav class="cv-info-breadcrumb" aria-label="Đường dẫn"><a href="/">Trang chủ</a><span aria-hidden="true">/</span><span aria-current="page">${escape(page.title)}</span></nav><div class="cv-info-lead"><span class="cv-info-kicker">CINEVIET · THÔNG TIN & HỖ TRỢ</span><h1>${escape(page.title)}</h1><p>${escape(page.intro)}</p></div><div class="cv-info-layout"><nav class="cv-info-menu" aria-label="Các trang thông tin">${pages.map(item => `<a href="/${item.slug}"${item.slug === page.slug ? ' aria-current="page"' : ''}>${escape(item.title)}</a>`).join('')}</nav><article class="cv-info-article" aria-label="${escape(page.title)}">${page.sections.map(([title, text]) => `<section><h2>${escape(title)}</h2><p>${escape(text).replaceAll(email, `<a href="mailto:${email}">${email}</a>`)}</p></section>`).join('')}<div class="cv-info-contact"><h2>Cần trao đổi thêm?</h2><p>Gửi nội dung và URL liên quan tới <a href="mailto:${email}">${email}</a>. Không gửi mật khẩu hoặc mã xác thực.</p></div></article></div></main>
${footer()}
</body></html>\n`;
}
module.exports = { email, pages, footer, informationPage };
