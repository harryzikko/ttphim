import 'dart:async';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:flutter/material.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../services/storage_service.dart';
import '../../services/app_config.dart';

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
  String _qrUrl = '';
  String _authCode = '';
  String _sessionToken = '';
  String _authUrl = '';
  Timer? _pollTimer;
  bool _isAuthorized = false;
  String _userName = '';
  bool _isPolling = false;
  int _sessionGeneration = 0;
  String? _sessionError;

  @override
  void initState() {
    super.initState();
    _initTvSession();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _initTvSession() async {
    final generation = ++_sessionGeneration;
    _pollTimer?.cancel();
    setState(() { _isLoading = true; _sessionError = null; _qrUrl = ''; _authCode = ''; _sessionToken = ''; });
    final session = await ApiService.createTvSession();
    if (!mounted || generation != _sessionGeneration) return;
    if (session == null || session['token'] == null || session['qr_url'] == null) {
      setState(() {
        _isLoading = false;
        _sessionError = AppConfig.hasBackend ? 'Không thể tạo phiên. Vui lòng thử lại.' : 'Chưa cấu hình BACKEND_URL khi build app.';
      });
      return;
    }
    setState(() {
      _qrUrl = session['qr_url'].toString();
      _authCode = session['code']?.toString() ?? '';
      _sessionToken = session['token'].toString();
      final destination = Uri.tryParse(_qrUrl);
      _authUrl = destination?.replace(query: '').toString() ?? _qrUrl;
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
        setState(() { _sessionError = 'Phiên đã hết hạn. Vui lòng làm mới mã QR.'; _qrUrl = ''; _authCode = ''; });
        return;
      }
      if (result?['status'] != 'approved' || result?['token'] is! String || result?['user'] is! Map<String, dynamic>) return;
      _pollTimer?.cancel();
      await StorageService.saveSession(result!['token'] as String, result['user'] as Map<String, dynamic>);
      if (!mounted || generation != _sessionGeneration) return;
      setState(() { _isAuthorized = true; _userName = result['user']['name']?.toString() ?? 'Thành viên'; });
      await Future.delayed(const Duration(seconds: 2));
      if (!mounted || generation != _sessionGeneration) return;
      if (widget.onLoginSuccess != null) { widget.onLoginSuccess!(); }
      else { Navigator.pop(context, true); }
    } finally { _isPolling = false; }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C0E17),
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Ambient Theatrical Glows
          Positioned(
            top: -100,
            left: MediaQuery.of(context).size.width * 0.25,
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

          // Main TV Screen Content
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 28),
              child: Column(
                children: [
                  // TV Live Status Top Bar
                  Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    spacing: 24,
                    runSpacing: 12,
                    children: [
                      Row(
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
                                  style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 14),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: Colors.white.withOpacity(0.06),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 8,
                                  height: 8,
                                  decoration: const BoxDecoration(
                                    color: AppTheme.cyan,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                const Text(
                                  'Đang chờ kết nối từ thiết bị di động...',
                                  style: TextStyle(color: AppTheme.cyan, fontSize: 11.5, fontWeight: FontWeight.w600),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),

                      // Clock & Security
                      Row(
                        children: [
                          const Icon(Icons.verified_user_rounded, color: AppTheme.gold, size: 16),
                          const SizedBox(width: 6),
                          const Text(
                            'Kích hoạt VIP Miễn Phí',
                            style: TextStyle(color: AppTheme.gold, fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(width: 20),
                          Text(
                            TimeOfDay.now().format(context),
                            style: const TextStyle(color: Colors.white70, fontSize: 14, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ],
                  ),

                  const Spacer(),

                  // Dual Panel Content (QR on Left + Code/Instructions on Right)
                  if (_isAuthorized)
                    _buildSuccessView()
                  else
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        // LEFT PANEL: High Contrast Crisp QR Code Box
                        Expanded(
                          flex: 5,
                          child: Container(
                            padding: const EdgeInsets.all(28),
                            decoration: BoxDecoration(
                              color: const Color(0xFF191B24),
                              borderRadius: BorderRadius.circular(24),
                              border: Border.all(color: Colors.white12),
                              boxShadow: [
                                BoxShadow(
                                  color: AppTheme.primary.withOpacity(0.25),
                                  blurRadius: 30,
                                  offset: const Offset(0, 10),
                                ),
                              ],
                            ),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.all(8),
                                      decoration: BoxDecoration(
                                        color: AppTheme.primary.withOpacity(0.2),
                                        shape: BoxShape.circle,
                                      ),
                                      child: const Icon(Icons.qr_code_scanner_rounded, color: AppTheme.primaryLight, size: 20),
                                    ),
                                    const SizedBox(width: 12),
                                    const Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'QUÉT MÃ ĐĂNG NHẬP',
                                          style: TextStyle(color: AppTheme.primaryLight, fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1.1),
                                        ),
                                        Text(
                                          'Dùng Camera hoặc App CineViet',
                                          style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 20),

                                // Crisp QR Box
                                Container(
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                    color: Colors.white,
                                    borderRadius: BorderRadius.circular(16),
                                    boxShadow: const [
                                      BoxShadow(color: Colors.black54, blurRadius: 15),
                                    ],
                                  ),
                                  child: _isLoading
                                      ? const SizedBox(
                                          width: 220,
                                          height: 220,
                                          child: Center(child: CircularProgressIndicator(color: AppTheme.primary)),
                                        )
                                      : _qrUrl.isEmpty
                                          ? SizedBox(width: 220, height: 220, child: Center(child: Padding(
                                              padding: const EdgeInsets.all(12),
                                              child: Text(_sessionError ?? 'Chưa có phiên đăng nhập', textAlign: TextAlign.center, style: const TextStyle(color: Colors.black87)),
                                            )))
                                          : QrImageView(key: ValueKey(_qrUrl), data: _qrUrl, size: 220, backgroundColor: Colors.white),
                                ),
                                const SizedBox(height: 14),
                                const Text(
                                  'Mã QR có hiệu lực trong 5 phút',
                                  style: TextStyle(color: Colors.white54, fontSize: 11),
                                ),
                              ],
                            ),
                          ),
                        ),

                        const SizedBox(width: 40),

                        // RIGHT PANEL: 6-Digit Code & Step-by-Step Instructions
                        Expanded(
                          flex: 6,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Text(
                                'HOẶC NHẬP MÃ KÍCH HOẠT',
                                style: TextStyle(color: AppTheme.primaryLight, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1.2),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                'Kích Hoạt Tài Khoản Trực Tiếp',
                                style: TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900),
                              ),
                              const SizedBox(height: 16),

                              // Big 6-Digit Code Card
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF141722),
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(color: AppTheme.primary.withOpacity(0.6), width: 1.5),
                                  boxShadow: [
                                    BoxShadow(color: AppTheme.primary.withOpacity(0.2), blurRadius: 16),
                                  ],
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.key_rounded, color: AppTheme.primary, size: 28),
                                    const SizedBox(width: 16),
                                    Text(
                                      _authCode,
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 34,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: 8,
                                        fontFamily: 'monospace',
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 20),

                              // Steps
                              _buildStepRow('1', 'Mở ứng dụng CineViet trên điện thoại hoặc truy cập $_authUrl'),
                              const SizedBox(height: 10),
                              _buildStepRow('2', 'Chọn tính năng "Quét mã QR Android TV" hoặc nhập mã kích hoạt trên'),
                              const SizedBox(height: 10),
                              _buildStepRow('3', 'Bấm xác nhận, ứng dụng trên TV sẽ tự động kích hoạt ngay lập tức!'),

                              const SizedBox(height: 24),

                              // D-pad Action Buttons
                              Row(
                                children: [
                                  ElevatedButton.icon(
                                    onPressed: _initTvSession,
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: AppTheme.primary,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                    ),
                                    icon: const Icon(Icons.refresh_rounded, size: 20),
                                    label: const Text('Làm Mới Mã QR', style: TextStyle(fontWeight: FontWeight.bold)),
                                  ),
                                  const SizedBox(width: 14),
                                  OutlinedButton(
                                    onPressed: widget.onSkip ?? () => Navigator.pop(context),
                                    style: OutlinedButton.styleFrom(
                                      foregroundColor: Colors.white70,
                                      side: const BorderSide(color: Colors.white24),
                                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                    ),
                                    child: const Text('Bỏ Qua & Xem Ngay'),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),

                  const Spacer(),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepRow(String number, String text) {
    return Row(
      children: [
        Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            color: AppTheme.cardElevated,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white24),
          ),
          child: Center(
            child: Text(
              number,
              style: const TextStyle(color: AppTheme.gold, fontSize: 11, fontWeight: FontWeight.bold),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(color: Colors.white70, fontSize: 13, height: 1.3),
          ),
        ),
      ],
    );
  }

  Widget _buildSuccessView() {
    return Center(
      child: Container(
        padding: const EdgeInsets.all(40),
        decoration: BoxDecoration(
          color: const Color(0xFF191B24),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.greenAccent, width: 2),
          boxShadow: [
            BoxShadow(color: Colors.greenAccent.withOpacity(0.3), blurRadius: 30),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle_rounded, color: Colors.greenAccent, size: 80),
            const SizedBox(height: 18),
            Text(
              'ĐĂNG NHẬP THÀNH CÔNG!',
              style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w900),
            ),
            const SizedBox(height: 8),
            Text(
              'Chào mừng $_userName đến với rạp phim CineViet TV Edition!',
              style: const TextStyle(color: Colors.white70, fontSize: 15),
            ),
          ],
        ),
      ),
    );
  }
}
