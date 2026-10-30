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
import '../models/app_update_info.dart';
import '../services/update_service.dart';
import '../widgets/update_dialog.dart';

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
  AppUpdateInfo? _availableUpdate;
  bool _isCheckingUpdate = false;

  @override
  void initState() {
    super.initState();
    StorageService.getAutoNext().then((enabled) {
      if (mounted) setState(() => _autoNextEpisode = enabled);
    });
    _loadUser();
    _loadLibraryData();
    SessionService.changes.addListener(_onSessionChanged);
    _checkAppUpdateSilently();
  }

  void _checkAppUpdateSilently() {
    UpdateService.initVersion().then((_) {
      if (mounted) setState(() {});
    });
    UpdateService.checkUpdate().then((update) {
      if (mounted) {
        setState(() => _availableUpdate = update);
        if (update != null && update.forceUpdate) {
          UpdateDialog.show(context, update);
        }
      }
    });
  }

  Future<void> _checkForUpdateManually() async {
    if (_isCheckingUpdate) return;
    setState(() => _isCheckingUpdate = true);
    final update = await UpdateService.checkUpdate();
    if (!mounted) return;
    setState(() {
      _isCheckingUpdate = false;
      _availableUpdate = update;
    });

    if (update != null) {
      UpdateDialog.show(context, update);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Row(
            children: [
              Icon(Icons.check_circle_rounded, color: Colors.greenAccent),
              SizedBox(width: 10),
              Text('Bạn đang sử dụng phiên bản mới nhất (v${UpdateService.currentVersion})'),
            ],
          ),
          backgroundColor: Color(0xFF1E2330),
          duration: Duration(seconds: 3),
        ),
      );
    }
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

          // 2. Thư Viện Của Tôi (Gộp Yêu Thích & Đang Xem)
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
              const Text(
                'Thư Viện Của Tôi',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),

          Container(
            decoration: BoxDecoration(
              color: AppTheme.cardElevated,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white.withOpacity(0.08)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.2),
                  blurRadius: 8,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: Material(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(14),
              child: InkWell(
                borderRadius: BorderRadius.circular(14),
                onTap: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const WatchlistScreen()),
                  );
                  _loadLibraryData();
                },
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: AppTheme.primary.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: AppTheme.primary.withOpacity(0.3)),
                            ),
                            child: const Icon(
                              Icons.video_library_rounded,
                              color: AppTheme.primary,
                              size: 24,
                            ),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Xem & Quản Lý Thư Viện',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 15,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  _user == null
                                      ? 'Đăng nhập để đồng bộ phim yêu thích & đang xem'
                                      : '${_favorites.length} phim yêu thích • ${_history.length} phim đang xem',
                                  style: const TextStyle(
                                    color: AppTheme.textSecondary,
                                    fontSize: 12.5,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const Icon(
                            Icons.chevron_right_rounded,
                            color: AppTheme.textMuted,
                            size: 22,
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: InkWell(
                              borderRadius: BorderRadius.circular(8),
                              onTap: () async {
                                await Navigator.push(
                                  context,
                                  MaterialPageRoute(builder: (_) => const WatchlistScreen(initialTabIndex: 0)),
                                );
                                _loadLibraryData();
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 10),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF1B202D),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: Colors.white.withOpacity(0.06)),
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    const Icon(Icons.favorite_rounded, color: Colors.redAccent, size: 15),
                                    const SizedBox(width: 6),
                                    Text(
                                      'Yêu thích (${_favorites.length})',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 12.5,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: InkWell(
                              borderRadius: BorderRadius.circular(8),
                              onTap: () async {
                                await Navigator.push(
                                  context,
                                  MaterialPageRoute(builder: (_) => const WatchlistScreen(initialTabIndex: 1)),
                                );
                                _loadLibraryData();
                              },
                              child: Container(
                                padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 10),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF1B202D),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: Colors.white.withOpacity(0.06)),
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    const Icon(Icons.history_rounded, color: AppTheme.gold, size: 16),
                                    const SizedBox(width: 6),
                                    Text(
                                      'Đang xem (${_history.length})',
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 12.5,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),

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

          // Banner Thông Báo Có Bản Cập Nhật Mới
          if (_availableUpdate != null) ...[
            Container(
              margin: const EdgeInsets.only(bottom: 24),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF2C140E), Color(0xFF1E1410)],
                ),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0x66FF5722)),
                boxShadow: const [
                  BoxShadow(color: Color(0x33FF5722), blurRadius: 10, offset: Offset(0, 2)),
                ],
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFF5722).withOpacity(0.2),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.system_update_rounded, color: Color(0xFFFF9800), size: 24),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Đã có phiên bản mới v${_availableUpdate!.latestVersion}',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13.5),
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'Chạm để tải về và cài đặt trực tiếp',
                          style: TextStyle(color: Colors.white60, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  ElevatedButton(
                    onPressed: () => UpdateDialog.show(context, _availableUpdate!),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFFF5722),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    child: const Text('Cập nhật', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ),
          ],

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
                InkWell(
                  onTap: _checkForUpdateManually,
                  borderRadius: BorderRadius.circular(6),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Row(
                          children: [
                            Text('Phiên bản', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
                            SizedBox(width: 6),
                            Icon(Icons.sync_rounded, color: AppTheme.textMuted, size: 14),
                          ],
                        ),
                        if (_isCheckingUpdate)
                          const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.primary),
                          )
                        else if (_availableUpdate != null)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [Color(0xFFFF5722), Color(0xFFFF9800)],
                              ),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'Có bản v${_availableUpdate!.latestVersion}',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(width: 4),
                                const Icon(Icons.arrow_upward_rounded, color: Colors.white, size: 13),
                              ],
                            ),
                          )
                        else
                          Text(
                            'v${UpdateService.currentVersion} (Mới nhất ✓)',
                            style: const TextStyle(
                              color: AppTheme.primaryLight,
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                      ],
                    ),
                  ),
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
