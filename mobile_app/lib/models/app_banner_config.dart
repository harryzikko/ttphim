class AppBannerConfig {
  final bool enabled;
  final String title;
  final String description;
  final String href;
  final String ctaText;
  final int countdownSeconds;
  final String imageMobileVertical;
  final String imageIpadVertical;
  final String imageIpadLandscape;
  final int cooldownHours;

  const AppBannerConfig({
    required this.enabled,
    required this.title,
    required this.description,
    required this.href,
    required this.ctaText,
    required this.countdownSeconds,
    required this.imageMobileVertical,
    required this.imageIpadVertical,
    required this.imageIpadLandscape,
    required this.cooldownHours,
  });

  factory AppBannerConfig.defaults() {
    return const AppBannerConfig(
      enabled: true,
      title: 'SĂN DEAL SHOPEE GIẢM SỐC 50% - 80%',
      description: 'Tự động quét kho Flash Sale Shopee Mall, bắt trọn deal lỗi giá & nhận voucher Freeship 0Đ độc quyền!',
      href: 'https://sandeal.dealpulse.vn/',
      ctaText: 'SĂN DEAL NGAY BÂY GIỜ',
      countdownSeconds: 5,
      imageMobileVertical: '/images/banners/banner_mobile_vertical.png',
      imageIpadVertical: '/images/banners/banner_ipad_vertical.png',
      imageIpadLandscape: '/images/banners/banner_ipad_portrait.png',
      cooldownHours: 0,
    );
  }

  factory AppBannerConfig.fromJson(Map<String, dynamic> json) {
    return AppBannerConfig(
      enabled: json['enabled'] == true,
      title: json['title'] as String? ?? 'SĂN DEAL SHOPEE GIẢM SỐC 50% - 80%',
      description: json['description'] as String? ?? '',
      href: json['href'] as String? ?? 'https://sandeal.dealpulse.vn/',
      ctaText: json['cta_text'] as String? ?? 'SĂN DEAL NGAY BÂY GIỜ',
      countdownSeconds: (json['countdown_seconds'] as num?)?.toInt() ?? 5,
      imageMobileVertical: json['image_mobile_vertical'] as String? ?? '/images/banners/banner_mobile_vertical.png',
      imageIpadVertical: json['image_ipad_vertical'] as String? ?? '/images/banners/banner_ipad_vertical.png',
      imageIpadLandscape: json['image_ipad_landscape'] as String? ?? '/images/banners/banner_ipad_portrait.png',
      cooldownHours: (json['cooldown_hours'] as num?)?.toInt() ?? 0,
    );
  }
}
