import 'dart:async';
import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../services/storage_service.dart';
import '../../services/app_config.dart';

typedef TvPinLoginScreen = TvQrLoginScreen;

class TvQrLoginScreen extends StatefulWidget {
  final VoidCallback? onLoginSuccess;
  final VoidCallback? onSkip;

  const TvQrLoginScreen({
    super.key,
    this.onLoginSuccess,
    this.onSkip,
  });

  @override
  State<TvQrLoginScreen> createState() => _TvQrLoginScreenState();
}

class _TvQrLoginScreenState extends State<TvQrLoginScreen> {
  bool _isLoading = true;
  String _authCode = '';
  String _sessionToken = '';
  Timer? _pollTimer;
  bool _isAuthorized = false;
  String _userName = '';
  bool _isPolling = false;
  int _sessionGeneration = 0;
  String? _sessionError;

  final FocusNode _refreshFocus = FocusNode();
  final FocusNode _skipFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    _initTvSession();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _refreshFocus.dispose();
    _skipFocus.dispose();
    super.dispose();
  }

  Future<void> _initTvSession() async {
    final generation = ++_sessionGeneration;
    _pollTimer?.cancel();
    setState(() {
      _isLoading = true;
      _sessionError = null;
      _authCode = '';
      _sessionToken = '';
    });

    final session = await ApiService.createTvSession();
    if (!mounted || generation != _sessionGeneration) return;

    if (session == null || session['token'] == null || session['code'] == null) {
      setState(() {
        _isLoading = false;
        _sessionError = AppConfig.hasBackend
            ? 'Không thể tạo mã đăng nhập. Vui lòng thử lại.'
            : 'Chưa cấu hình BACKEND_URL khi build app.';
      });
      return;
    }

    setState(() {
      _authCode = session['code']?.toString() ?? '';
      _sessionToken = session['token'].toString();
      _isLoading = false;
    });

    _pollTimer = Timer.periodic(const Duration(seconds: 2), (_) => _checkAuthStatus());
  }

  Future<void> _checkAuthStatus() async {
    if (_sessionToken.isEmpty || _isAuthorized || _isPolling) return;
    final token = _sessionToken;
    final generation = _sessionGeneration;
    _isPolling = true;

    try {
      final result = await ApiService.checkTvSessionStatus(token);
      if (!mounted || generation != _sessionGeneration) return;

      if (result?['status'] == 'expired') {
        _pollTimer?.cancel();
        setState(() {
          _sessionError = 'Mã đăng nhập đã hết hạn. Vui lòng bấm làm mới mã.';
          _authCode = '';
        });
        return;
      }

      if (result?['status'] != 'approved' || result?['token'] is! String || result?['user'] is! Map<String, dynamic>) {
        return;
      }

      _pollTimer?.cancel();
      await StorageService.saveSession(result!['token'] as String, result['user'] as Map<String, dynamic>);
      if (!mounted || generation != _sessionGeneration) return;

      setState(() {
        _isAuthorized = true;
        _userName = result['user']['name']?.toString() ?? 'Thành viên CineViet';
      });

      await Future.delayed(const Duration(seconds: 2));
      if (!mounted || generation != _sessionGeneration) return;

      if (widget.onLoginSuccess != null) {
        widget.onLoginSuccess!();
      } else {
        Navigator.pop(context, true);
      }
    } finally {
      _isPolling = false;
    }
  }

  Widget _buildDigitBox(String char) {
    final hasValue = char.isNotEmpty;
    return Container(
      width: 58,
      height: 74,
      decoration: BoxDecoration(
        color: const Color(0xFF1E2230),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: hasValue ? AppTheme.primary : Colors.white24,
          width: hasValue ? 2.5 : 1.0,
        ),
        boxShadow: hasValue
            ? [
                BoxShadow(
                  color: AppTheme.primary.withOpacity(0.45),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ]
            : null,
      ),
      child: Center(
        child: Text(
          char,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 40,
            fontWeight: FontWeight.w900,
            fontFamily: 'monospace',
          ),
        ),
      ),
    );
  }

  Widget _buildPinDisplay() {
    if (_isLoading) {
      return Container(
        height: 80,
        alignment: Alignment.center,
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(color: AppTheme.primary, strokeWidth: 3),
            ),
            SizedBox(width: 16),
            Text(
              'Đang tạo mã kích hoạt 6 số...',
              style: TextStyle(color: Colors.white70, fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      );
    }

    if (_sessionError != null || _authCode.isEmpty) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
        decoration: BoxDecoration(
          color: Colors.red.withOpacity(0.12),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.redAccent.withOpacity(0.4)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline_rounded, color: Colors.redAccent, size: 24),
            const SizedBox(width: 12),
            Text(
              _sessionError ?? 'Chưa tạo được mã kích hoạt',
              style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      );
    }

    final code = _authCode.padRight(6, ' ');
    final part1 = code.substring(0, 3);
    final part2 = code.substring(3, 6);

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _buildDigitBox(part1[0].trim()),
        const SizedBox(width: 10),
        _buildDigitBox(part1[1].trim()),
        const SizedBox(width: 10),
        _buildDigitBox(part1[2].trim()),
        const Padding(
          padding: EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            '—',
            style: TextStyle(color: AppTheme.primaryLight, fontSize: 26, fontWeight: FontWeight.bold),
          ),
        ),
        _buildDigitBox(part2[0].trim()),
        const SizedBox(width: 10),
        _buildDigitBox(part2[1].trim()),
        const SizedBox(width: 10),
        _buildDigitBox(part2[2].trim()),
      ],
    );
  }

  Widget _buildStepItem(String number, String title, String subtitle) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: AppTheme.primary.withOpacity(0.2),
            shape: BoxShape.circle,
            border: Border.all(color: AppTheme.primary, width: 1.5),
          ),
          child: Center(
            child: Text(
              number,
              style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
            ),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(color: Colors.white, fontSize: 14.5, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: const TextStyle(color: Colors.white60, fontSize: 12.5, height: 1.3),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSuccessView() {
    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 56, vertical: 42),
        decoration: BoxDecoration(
          color: const Color(0xFF191B24),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.greenAccent, width: 2),
          boxShadow: [
            BoxShadow(color: Colors.greenAccent.withOpacity(0.3), blurRadius: 36),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle_rounded, color: Colors.greenAccent, size: 84),
            const SizedBox(height: 20),
            const Text(
              'ĐĂNG NHẬP THÀNH CÔNG!',
              style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            Text(
              'Chào mừng $_userName đến với rạp phim CineViet TV!',
              style: const TextStyle(color: Colors.white70, fontSize: 16),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C0E17),
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Ambient Glow Background
          Positioned(
            top: -100,
            left: MediaQuery.of(context).size.width * 0.3,
            child: Container(
              width: 500,
              height: 500,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppTheme.primary.withOpacity(0.12),
              ),
            ),
          ),
          Positioned(
            bottom: -80,
            right: 80,
            child: Container(
              width: 450,
              height: 450,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppTheme.cyan.withOpacity(0.08),
              ),
            ),
          ),

          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 24),
              child: _isAuthorized
                  ? _buildSuccessView()
                  : SingleChildScrollView(
                      physics: const BouncingScrollPhysics(),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          // Header Status
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                                decoration: BoxDecoration(
                                  color: AppTheme.primary,
                                  borderRadius: BorderRadius.circular(20),
                                  boxShadow: [
                                    BoxShadow(color: AppTheme.primary.withOpacity(0.5), blurRadius: 10),
                                  ],
                                ),
                                child: const Row(
                                  children: [
                                    Icon(Icons.tv_rounded, color: Colors.white, size: 16),
                                    SizedBox(width: 6),
                                    Text(
                                      'CINEVIET ANDROID TV',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: 1,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Row(
                                children: [
                                  Container(
                                    width: 9,
                                    height: 9,
                                    decoration: const BoxDecoration(
                                      color: Color(0xFF10B981),
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  const Text(
                                    'Đang chờ kích hoạt tài khoản...',
                                    style: TextStyle(color: Color(0xFF10B981), fontSize: 13, fontWeight: FontWeight.bold),
                                  ),
                                ],
                              ),
                            ],
                          ),

                          const SizedBox(height: 32),

                          // Main Central Card (Netflix 10-foot Style)
                          Container(
                            constraints: const BoxConstraints(maxWidth: 820),
                            padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 36),
                            decoration: BoxDecoration(
                              color: const Color(0xFF141722),
                              borderRadius: BorderRadius.circular(28),
                              border: Border.all(color: Colors.white.withOpacity(0.08)),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withOpacity(0.6),
                                  blurRadius: 32,
                                  offset: const Offset(0, 10),
                                ),
                              ],
                            ),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Text(
                                  'ĐĂNG NHẬP BẰNG MÃ KÍCH HOẠT',
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontSize: 26,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                                const SizedBox(height: 10),
                                const Text(
                                  'Nhập mã hiển thị bên dưới trên điện thoại hoặc máy tính để đăng nhập TV',
                                  style: TextStyle(color: Colors.white60, fontSize: 14),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 24),

                                // Web URL Pill Badge
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 10),
                                  decoration: BoxDecoration(
                                    color: AppTheme.cyan.withOpacity(0.12),
                                    borderRadius: BorderRadius.circular(30),
                                    border: Border.all(color: AppTheme.cyan.withOpacity(0.6), width: 1.5),
                                  ),
                                  child: const Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(Icons.language_rounded, color: AppTheme.cyan, size: 20),
                                      SizedBox(width: 10),
                                      Text(
                                        'cineviet.live/tv-auth',
                                        style: TextStyle(
                                          color: AppTheme.cyan,
                                          fontSize: 18,
                                          fontWeight: FontWeight.w900,
                                          letterSpacing: 0.8,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),

                                const SizedBox(height: 28),

                                // Big 6-Digit PIN Display
                                _buildPinDisplay(),

                                const SizedBox(height: 32),

                                // 3 Step Guide
                                Container(
                                  padding: const EdgeInsets.all(20),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFF0F111A),
                                    borderRadius: BorderRadius.circular(16),
                                    border: Border.all(color: Colors.white.withOpacity(0.05)),
                                  ),
                                  child: Column(
                                    children: [
                                      _buildStepItem(
                                        '1',
                                        'Truy cập website trên điện thoại/máy tính',
                                        'Mở trình duyệt vào cineviet.live/tv-auth hoặc vào mục Tài khoản trên App CineViet',
                                      ),
                                      const Padding(
                                        padding: EdgeInsets.symmetric(vertical: 10),
                                        child: Divider(color: Colors.white10, height: 1),
                                      ),
                                      _buildStepItem(
                                        '2',
                                        'Nhập mã kích hoạt 6 số ở trên',
                                        'Đăng nhập tài khoản của bạn và điền đúng 6 số vào ô xác thực',
                                      ),
                                      const Padding(
                                        padding: EdgeInsets.symmetric(vertical: 10),
                                        child: Divider(color: Colors.white10, height: 1),
                                      ),
                                      _buildStepItem(
                                        '3',
                                        'Hoàn tất liên kết ngay lập tức',
                                        'Bấm "Xác Nhận Đăng Nhập TV", màn hình TV sẽ tự động đồng bộ tài khoản!',
                                      ),
                                    ],
                                  ),
                                ),

                                const SizedBox(height: 28),

                                // Action Buttons (D-pad focusable)
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Focus(
                                      focusNode: _refreshFocus,
                                      child: Builder(
                                        builder: (ctx) {
                                          final isFocused = Focus.of(ctx).hasFocus;
                                          return ElevatedButton.icon(
                                            onPressed: _initTvSession,
                                            style: ElevatedButton.styleFrom(
                                              backgroundColor: isFocused ? Colors.white : AppTheme.primary,
                                              foregroundColor: isFocused ? Colors.black : Colors.white,
                                              padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 14),
                                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                              elevation: isFocused ? 12 : 4,
                                            ),
                                            icon: const Icon(Icons.refresh_rounded, size: 20),
                                            label: const Text(
                                              'Làm Mới Mã 6 Số',
                                              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
                                            ),
                                          );
                                        },
                                      ),
                                    ),
                                    const SizedBox(width: 16),
                                    Focus(
                                      focusNode: _skipFocus,
                                      child: Builder(
                                        builder: (ctx) {
                                          final isFocused = Focus.of(ctx).hasFocus;
                                          return OutlinedButton(
                                            onPressed: widget.onSkip ?? () => Navigator.pop(context),
                                            style: OutlinedButton.styleFrom(
                                              backgroundColor: isFocused ? Colors.white12 : Colors.transparent,
                                              foregroundColor: Colors.white,
                                              side: BorderSide(
                                                color: isFocused ? AppTheme.primary : Colors.white24,
                                                width: isFocused ? 2.0 : 1.0,
                                              ),
                                              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                            ),
                                            child: const Text(
                                              'Bỏ Qua & Xem Ngay',
                                              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                            ),
                                          );
                                        },
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
