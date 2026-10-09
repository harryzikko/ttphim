import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _autoNextEpisode = true;
  String _preferredQuality = '1080p Full HD';

  void _clearCache() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Đã dọn dẹp bộ nhớ đệm cache sạch sẽ!'),
        backgroundColor: AppTheme.surface,
        duration: Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Cá Nhân & Cài Đặt'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        physics: const BouncingScrollPhysics(),
        children: [
          // 100% Free VIP Pass Card
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF2E1C0C), Color(0xFF1F150B), Color(0xFF141722)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.gold.withOpacity(0.5), width: 1.2),
              boxShadow: [
                BoxShadow(
                  color: AppTheme.gold.withOpacity(0.15),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppTheme.gold.withOpacity(0.2),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.workspace_premium_rounded, color: AppTheme.gold, size: 28),
                        ),
                        const SizedBox(width: 12),
                        const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'TTPHIM VIP PASS',
                              style: TextStyle(
                                color: AppTheme.gold,
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 1,
                              ),
                            ),
                            Text(
                              'Đã Kích Hoạt Miễn Phí',
                              style: TextStyle(color: Colors.white70, fontSize: 12),
                            ),
                          ],
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppTheme.gold,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: const Text(
                        '100% FREE',
                        style: TextStyle(
                          color: Colors.black,
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                const Divider(color: Colors.white12),
                const SizedBox(height: 8),
                const Row(
                  children: [
                    Icon(Icons.check_circle_rounded, color: AppTheme.gold, size: 16),
                    SizedBox(width: 8),
                    Text('Xem không giới hạn mọi bộ phim', style: TextStyle(color: Colors.white, fontSize: 13)),
                  ],
                ),
                const SizedBox(height: 6),
                const Row(
                  children: [
                    Icon(Icons.check_circle_rounded, color: AppTheme.gold, size: 16),
                    SizedBox(width: 8),
                    Text('Không quảng cáo gây phiền toái', style: TextStyle(color: Colors.white, fontSize: 13)),
                  ],
                ),
                const SizedBox(height: 6),
                const Row(
                  children: [
                    Icon(Icons.check_circle_rounded, color: AppTheme.gold, size: 16),
                    SizedBox(width: 8),
                    Text('Chất lượng cao Full HD / 4K siêu nét', style: TextStyle(color: Colors.white, fontSize: 13)),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // Player Settings
          const Text(
            'Cài Đặt Trình Phát',
            style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 10),

          Container(
            decoration: BoxDecoration(
              color: AppTheme.card,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.border),
            ),
            child: Column(
              children: [
                SwitchListTile(
                  title: const Text('Tự động phát tập tiếp theo', style: TextStyle(color: Colors.white, fontSize: 14)),
                  subtitle: const Text('Tự chuyển tập khi xem hết phim bộ', style: TextStyle(color: AppTheme.textMuted, fontSize: 12)),
                  value: _autoNextEpisode,
                  activeColor: AppTheme.primary,
                  onChanged: (val) => setState(() => _autoNextEpisode = val),
                ),
                const Divider(color: AppTheme.border, height: 1),
                ListTile(
                  title: const Text('Chất lượng phát ưu tiên', style: TextStyle(color: Colors.white, fontSize: 14)),
                  subtitle: Text(_preferredQuality, style: const TextStyle(color: AppTheme.primaryLight, fontSize: 12)),
                  trailing: const Icon(Icons.chevron_right, color: AppTheme.textMuted),
                  onTap: () {
                    showModalBottomSheet(
                      context: context,
                      backgroundColor: AppTheme.surface,
                      builder: (ctx) => Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          ListTile(
                            title: const Text('1080p Full HD (Khuyên dùng)', style: TextStyle(color: Colors.white)),
                            onTap: () {
                              setState(() => _preferredQuality = '1080p Full HD');
                              Navigator.pop(ctx);
                            },
                          ),
                          ListTile(
                            title: const Text('720p HD (Tiết kiệm dữ liệu)', style: TextStyle(color: Colors.white)),
                            onTap: () {
                              setState(() => _preferredQuality = '720p HD');
                              Navigator.pop(ctx);
                            },
                          ),
                          ListTile(
                            title: const Text('Tự động thích ứng (Auto)', style: TextStyle(color: Colors.white)),
                            onTap: () {
                              setState(() => _preferredQuality = 'Tự động');
                              Navigator.pop(ctx);
                            },
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // App Storage & Cache
          const Text(
            'Hệ Thống & Bộ Nhớ',
            style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 10),

          Container(
            decoration: BoxDecoration(
              color: AppTheme.card,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.border),
            ),
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.cleaning_services_rounded, color: AppTheme.primaryLight),
                  title: const Text('Xóa bộ nhớ đệm cache', style: TextStyle(color: Colors.white, fontSize: 14)),
                  subtitle: const Text('Giải phóng dung lượng hình ảnh đã tải', style: TextStyle(color: AppTheme.textMuted, fontSize: 12)),
                  trailing: const Text('~12 MB', style: TextStyle(color: AppTheme.textMuted, fontSize: 12)),
                  onTap: _clearCache,
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // About App
          const Text(
            'Thông Tin Ứng Dụng',
            style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 10),

          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.card,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.border),
            ),
            child: const Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Tên ứng dụng', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                    Text('TTPhim', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                  ],
                ),
                SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Phiên bản', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                    Text('1.0.0 (Native Flutter)', style: TextStyle(color: AppTheme.primaryLight, fontSize: 13)),
                  ],
                ),
                SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Nền tảng', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                    Text('Android APK & iOS IPA', style: TextStyle(color: Colors.white, fontSize: 13)),
                  ],
                ),
                SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Bản quyền nội dung', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                    Text('Miễn phí 100%', style: TextStyle(color: AppTheme.gold, fontWeight: FontWeight.bold, fontSize: 13)),
                  ],
                ),
              ],
            ),
          ),

          const SizedBox(height: 36),
        ],
      ),
    );
  }
}
