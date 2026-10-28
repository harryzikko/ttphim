import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import '../models/movie.dart';
import '../services/api_service.dart';
import '../services/session_service.dart';
import '../services/storage_service.dart';
import '../theme/app_theme.dart';
import 'account_screen.dart';
import 'detail_screen.dart';
import 'watchlist_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _autoNextEpisode = true;
  Map<String, dynamic>? _user;
  List<Movie> _favorites = [];
  List<WatchHistoryItem> _history = [];
  bool _isLoadingLibrary = true;

  @override
  void initState() {
    super.initState();
    StorageService.getAutoNext().then((enabled) {
      if (mounted) setState(() => _autoNextEpisode = enabled);
    });
    _loadUser();
    _loadLibraryData();
    SessionService.changes.addListener(_onSessionChanged);
  }

  @override
  void dispose() {
    SessionService.changes.removeListener(_onSessionChanged);
    super.dispose();
  }

  void _onSessionChanged() {
    _loadUser();
    _loadLibraryData();
  }

  Future<void> _loadUser() async {
    try {
      final u = await StorageService.getUser();
      if (mounted) setState(() => _user = u);
    } catch (_) {}
  }

  Future<void> _loadLibraryData() async {
    if (!mounted) return;
    final favs = await StorageService.getFavorites();
    final hist = await StorageService.getHistory();
    if (mounted) {
      setState(() {
        _favorites = favs;
        _history = hist;
        _isLoadingLibrary = false;
      });
    }
  }

  Future<void> _clearCache() async {
    await DefaultCacheManager().emptyCache();
    PaintingBinding.instance.imageCache.clear();
    PaintingBinding.instance.imageCache.clearLiveImages();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Đã dọn dẹp bộ nhớ đệm cache sạch sẽ!'),
        backgroundColor: AppTheme.surface,
        duration: Duration(seconds: 2),
      ),
    );
  }

  String _getDetectedPlatform(BuildContext context) {
    if (kIsWeb) return 'Web';
    final isTablet = MediaQuery.of(context).size.shortestSide >= 600;
    try {
      if (Platform.isIOS) {
        return isTablet ? 'iPadOS' : 'iOS';
      } else if (Platform.isAndroid) {
        return isTablet ? 'Android Tablet' : 'Android';
      } else if (Platform.isMacOS) {
        return 'macOS';
      } else if (Platform.isWindows) {
        return 'Windows';
      } else if (Platform.isLinux) {
        return 'Linux';
      }
    } catch (_) {}
    return isTablet ? 'Tablet' : 'Mobile';
  }

  @override
  Widget build(BuildContext context) {
    final platformName = _getDetectedPlatform(context);
    final username = _user?['username']?.toString() ?? _user?['email']?.toString() ?? 'Khách xem phim';
    final userSubtitle = _user != null
        ? (_user?['email']?.toString() ?? 'Đã đăng nhập tài khoản CineViet')
        : 'Chạm để đăng nhập & đồng bộ dữ liệu';
    final avatarInitial = username.isNotEmpty ? username[0].toUpperCase() : 'C';

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text(
          'Cá Nhân',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        physics: const BouncingScrollPhysics(),
        children: [
          // 1. Account Profile Card
          GestureDetector(
            onTap: () async {
              await Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const AccountScreen()),
              );
              _loadUser();
              _loadLibraryData();
            },
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppTheme.card,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppTheme.border),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.3),
                    blurRadius: 10,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Container(
                    width: 50,
                    height: 50,
                    decoration: BoxDecoration(
                      gradient: AppTheme.primaryGradient,
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Text(
                        avatarInitial,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          username,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          userSubtitle,
                          style: const TextStyle(
                            color: AppTheme.textMuted,
                            fontSize: 12,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  const Icon(
                    Icons.arrow_forward_ios_rounded,
                    color: AppTheme.textMuted,
                    size: 15,
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 24),

          // 2. Thư Viện Của Tôi (Danh Sách Yêu Thích)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 3.5,
                    height: 15,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      color: AppTheme.primary,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  Text(
                    'Danh Sách Của Tôi (${_favorites.length})',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              TextButton(
                onPressed: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const WatchlistScreen(initialTabIndex: 0)),
                  );
                  _loadLibraryData();
                },
                child: const Text(
                  'Xem tất cả',
                  style: TextStyle(color: AppTheme.primaryLight, fontSize: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          _isLoadingLibrary
              ? const SizedBox(
                  height: 140,
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.primary)),
                )
              : _favorites.isEmpty
                  ? Container(
                      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
                      decoration: BoxDecoration(
                        color: AppTheme.card,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppTheme.border),
                      ),
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _user == null
                                  ? 'Đăng nhập tài khoản CineViet để lưu & đồng bộ danh sách yêu thích của bạn.'
                                  : 'Chưa có phim nào trong danh sách yêu thích.\nThêm phim từ trang chi tiết để xem lại nhanh.',
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: AppTheme.textMuted, fontSize: 12, height: 1.4),
                            ),
                            if (_user == null) ...[
                              const SizedBox(height: 10),
                              ElevatedButton(
                                onPressed: () async {
                                  await Navigator.push(
                                    context,
                                    MaterialPageRoute(builder: (_) => const AccountScreen()),
                                  );
                                  _loadUser();
                                  _loadLibraryData();
                                },
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppTheme.primary,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                ),
                                child: const Text('Đăng nhập ngay', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                              ),
                            ],
                          ],
                        ),
                      ),
                    )
                  : SizedBox(
                      height: 160,
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        physics: const BouncingScrollPhysics(),
                        itemCount: _favorites.length,
                        itemBuilder: (context, idx) {
                          final movie = _favorites[idx];
                          return GestureDetector(
                            onTap: () async {
                              await Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => MovieDetailScreen(slug: movie.slug, initialMovie: movie),
                                ),
                              );
                              _loadLibraryData();
                            },
                            child: Container(
                              width: 105,
                              margin: const EdgeInsets.only(right: 10),
                              decoration: BoxDecoration(
                                color: AppTheme.cardElevated,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: Colors.white.withOpacity(0.08)),
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(7.2),
                                child: Stack(
                                  fit: StackFit.expand,
                                  children: [
                                    CachedNetworkImage(
                                      imageUrl: movie.fullPosterUrl,
                                      fit: BoxFit.cover,
                                      placeholder: (_, __) => Container(color: AppTheme.card),
                                      errorWidget: (_, __, ___) => const Icon(Icons.movie, color: AppTheme.textMuted),
                                    ),
                                    Positioned(
                                      bottom: 0,
                                      left: 0,
                                      right: 0,
                                      child: Container(
                                        padding: const EdgeInsets.all(6),
                                        decoration: BoxDecoration(
                                          gradient: LinearGradient(
                                            colors: [Colors.transparent, Colors.black.withOpacity(0.9)],
                                            begin: Alignment.topCenter,
                                            end: Alignment.bottomCenter,
                                          ),
                                        ),
                                        child: Text(
                                          movie.name,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w600),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    ),

          const SizedBox(height: 20),

          // 3. Lịch Sử Xem (Watch History)
          if (_history.isNotEmpty) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 3.5,
                      height: 15,
                      margin: const EdgeInsets.only(right: 8),
                      decoration: BoxDecoration(
                        color: AppTheme.gold,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    Text(
                      'Đang Xem Dở & Lịch Sử (${_history.length})',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                TextButton(
                  onPressed: () async {
                    await Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const WatchlistScreen(initialTabIndex: 1)),
                    );
                    _loadLibraryData();
                  },
                  child: const Text(
                    'Xem tất cả',
                    style: TextStyle(color: AppTheme.primaryLight, fontSize: 12),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 140,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                physics: const BouncingScrollPhysics(),
                itemCount: _history.length,
                itemBuilder: (context, idx) {
                  final item = _history[idx];
                  final progress = item.progressPercentage;

                  return GestureDetector(
                    onTap: () async {
                      await Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => MovieDetailScreen(slug: item.movieSlug),
                        ),
                      );
                      _loadLibraryData();
                    },
                    child: Container(
                      width: 140,
                      margin: const EdgeInsets.only(right: 10),
                      decoration: BoxDecoration(
                        color: AppTheme.cardElevated,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.white.withOpacity(0.08)),
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(7.2),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Stack(
                                fit: StackFit.expand,
                                children: [
                                  CachedNetworkImage(
                                    imageUrl: item.bestImageUrl.isNotEmpty ? item.bestImageUrl : item.posterUrl,
                                    fit: BoxFit.cover,
                                    placeholder: (_, __) => Container(color: AppTheme.card),
                                    errorWidget: (_, __, ___) => const Icon(Icons.movie, color: AppTheme.textMuted),
                                  ),
                                  Center(
                                    child: Container(
                                      padding: const EdgeInsets.all(6),
                                      decoration: BoxDecoration(
                                        color: Colors.black.withOpacity(0.6),
                                        shape: BoxShape.circle,
                                      ),
                                      child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 20),
                                    ),
                                  ),
                                  if (progress > 0)
                                    Positioned(
                                      left: 0,
                                      right: 0,
                                      bottom: 0,
                                      child: LinearProgressIndicator(
                                        value: progress,
                                        backgroundColor: Colors.white24,
                                        valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primary),
                                        minHeight: 3,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(6.0),
                              child: Text(
                                item.movieName.isNotEmpty ? item.movieName : item.movieSlug,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 24),
          ],

          // 4. Player Settings
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
                  onChanged: (val) {
                    setState(() => _autoNextEpisode = val);
                    StorageService.setAutoNext(val);
                  },
                ),
                const Divider(color: AppTheme.border, height: 1),
                const ListTile(
                  title: Text('Chất lượng tự thích ứng', style: TextStyle(color: Colors.white, fontSize: 14)),
                  subtitle: Text(
                    'Player tự chọn chất lượng mượt mà theo nguồn phát và tốc độ mạng.',
                    style: TextStyle(color: AppTheme.primaryLight, fontSize: 12),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // 5. Kết Nối Thiết Bị (Chỉ giữ Đăng nhập Android TV qua QR/mã)
          const Text(
            'Kết Nối Thiết Bị',
            style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 10),

          Container(
            decoration: BoxDecoration(
              color: AppTheme.card,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.border),
            ),
            child: ListTile(
              leading: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withOpacity(0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.qr_code_scanner_rounded, color: AppTheme.primaryLight, size: 22),
              ),
              title: const Text('Đăng nhập Android TV', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
              subtitle: const Text('Quét QR hoặc nhập mã 6 số hiển thị trên TV', style: TextStyle(color: AppTheme.textMuted, fontSize: 12)),
              trailing: const Icon(Icons.arrow_forward_ios_rounded, color: AppTheme.primary, size: 14),
              onTap: _showTvLoginDialog,
            ),
          ),

          const SizedBox(height: 24),

          // 6. Hệ Thống & Bộ Nhớ
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
            child: ListTile(
              leading: const Icon(Icons.cleaning_services_rounded, color: AppTheme.primaryLight),
              title: const Text('Xóa bộ nhớ đệm cache', style: TextStyle(color: Colors.white, fontSize: 14)),
              subtitle: const Text('Giải phóng dung lượng hình ảnh đã tải tạm', style: TextStyle(color: AppTheme.textMuted, fontSize: 12)),
              onTap: _clearCache,
            ),
          ),

          const SizedBox(height: 24),

          // 7. Thông Tin Ứng Dụng (CineViet, Đúng nền tảng, Phiên bản chỉ hiện số)
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
            child: Column(
              children: [
                const Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Tên ứng dụng', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                    Text('CineViet', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                  ],
                ),
                const SizedBox(height: 10),
                const Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Phiên bản', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                    Text('1.0.0', style: TextStyle(color: AppTheme.primaryLight, fontWeight: FontWeight.w600, fontSize: 13)),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Nền tảng', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                    Text(platformName, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500)),
                  ],
                ),
                const SizedBox(height: 10),
                const Row(
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

  void _showTvLoginDialog() {
    final codeController = TextEditingController();
    bool isSubmitting = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setModalState) => Container(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 24,
            bottom: MediaQuery.of(context).viewInsets.bottom + 24,
          ),
          decoration: const BoxDecoration(
            color: Color(0xFF141722),
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            boxShadow: [
              BoxShadow(
                color: Colors.black54,
                blurRadius: 20,
                offset: Offset(0, -5),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 18),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withOpacity(0.15),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.tv_rounded, color: AppTheme.primary, size: 36),
              ),
              const SizedBox(height: 12),
              const Text(
                'Đăng Nhập Android TV',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Mở ứng dụng CineViet trên Android TV, chọn Đăng Nhập QR và nhập mã kích hoạt 6 chữ số hiển thị trên TV:',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 20),
              TextField(
                controller: codeController,
                textAlign: TextAlign.center,
                autofocus: true,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 4,
                ),
                keyboardType: TextInputType.text,
                decoration: InputDecoration(
                  hintText: 'VD: 849201',
                  hintStyle: const TextStyle(color: Colors.white24, letterSpacing: 2, fontSize: 20),
                  filled: true,
                  fillColor: const Color(0xFF0B0D13),
                  contentPadding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: Colors.white12),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: AppTheme.primary, width: 1.5),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: isSubmitting
                      ? null
                      : () async {
                          final input = codeController.text.trim();
                          if (input.isEmpty) return;

                          setModalState(() => isSubmitting = true);
                          final result = await ApiService.authorizeTvSession(input);
                          if (!ctx.mounted || !mounted) return;
                          setModalState(() => isSubmitting = false);

                          if (mounted) {
                            Navigator.pop(ctx);
                            ScaffoldMessenger.of(this.context).showSnackBar(
                              SnackBar(
                                content: Row(
                                  children: [
                                    Icon(
                                      result['success'] == true ? Icons.check_circle_rounded : Icons.error_outline_rounded,
                                      color: result['success'] == true ? Colors.greenAccent : Colors.redAccent,
                                    ),
                                    const SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        result['message'] ?? '',
                                        style: const TextStyle(color: Colors.white),
                                      ),
                                    ),
                                  ],
                                ),
                                backgroundColor: const Color(0xFF1F2330),
                                duration: const Duration(seconds: 4),
                              ),
                            );
                          }
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primary,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  child: isSubmitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text(
                          'XÁC NHẬN ĐĂNG NHẬP TV',
                          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Colors.white),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    ).whenComplete(codeController.dispose);
  }
}
