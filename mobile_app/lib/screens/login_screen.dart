import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../services/api_service.dart';
import '../services/app_config.dart';
import '../services/storage_service.dart';
import '../theme/app_theme.dart';

class LoginScreen extends StatefulWidget {
  final int initialTab;
  const LoginScreen({super.key, this.initialTab = 0});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  // Login controllers & state
  final _loginEmail = TextEditingController();
  final _loginPassword = TextEditingController();
  final _code = TextEditingController();
  String? _challengeId;
  bool _loginBusy = false;
  String? _loginError;
  bool _obscureLoginPassword = true;

  // Register controllers & state
  final _regName = TextEditingController();
  final _regEmail = TextEditingController();
  final _regPassword = TextEditingController();
  final _regConfirmPassword = TextEditingController();
  bool _regBusy = false;
  String? _regError;
  bool _obscureRegPassword = true;
  bool _obscureRegConfirm = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: 2,
      vsync: this,
      initialIndex: widget.initialTab.clamp(0, 1),
    );
  }

  @override
  void dispose() {
    _tabController.dispose();
    _loginEmail.dispose();
    _loginPassword.dispose();
    _code.dispose();
    _regName.dispose();
    _regEmail.dispose();
    _regPassword.dispose();
    _regConfirmPassword.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_loginBusy) return;
    if (_challengeId == null && (_loginEmail.text.trim().isEmpty || _loginPassword.text.isEmpty)) {
      setState(() => _loginError = 'Vui lòng nhập đầy đủ Email và Mật khẩu');
      return;
    }
    if (_challengeId != null && _code.text.trim().isEmpty) {
      setState(() => _loginError = 'Vui lòng nhập mã xác thực');
      return;
    }

    setState(() {
      _loginBusy = true;
      _loginError = null;
    });

    final result = await ApiService.login(
      _loginEmail.text.trim(),
      _loginPassword.text,
      challengeId: _challengeId,
      code: _code.text.trim(),
    );

    if (!mounted) return;

    final data = result['data'];
    if (result['status'] == true && data is Map && data['mfaRequired'] == true) {
      setState(() {
        _loginBusy = false;
        _challengeId = data['challengeId']?.toString();
        _loginPassword.clear();
        _code.clear();
      });
    } else if (result['status'] == true && data is Map && data['token'] is String) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Đăng nhập thành công! Chào mừng bạn trở lại.'),
          backgroundColor: AppTheme.surface,
          duration: Duration(seconds: 2),
        ),
      );
      Navigator.pop(context, true);
    } else {
      setState(() {
        _loginBusy = false;
        _loginError = result['message']?.toString() ?? 'Không thể đăng nhập. Vui lòng thử lại.';
      });
    }
  }

  Future<void> _register() async {
    if (_regBusy) return;

    final name = _regName.text.trim();
    final email = _regEmail.text.trim();
    final password = _regPassword.text;
    final confirm = _regConfirmPassword.text;

    if (email.isEmpty || !email.contains('@') || !email.contains('.')) {
      setState(() => _regError = 'Vui lòng nhập địa chỉ email hợp lệ');
      return;
    }
    if (password.length < 6) {
      setState(() => _regError = 'Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
    if (password != confirm) {
      setState(() => _regError = 'Mật khẩu xác nhận không khớp');
      return;
    }

    setState(() {
      _regBusy = true;
      _regError = null;
    });

    final result = await ApiService.register(
      email,
      password,
      name: name.isNotEmpty ? name : null,
    );

    if (!mounted) return;

    final data = result['data'];
    if (result['status'] == true && data is Map && data['token'] is String) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Đăng ký tài khoản thành công!'),
          backgroundColor: AppTheme.surface,
          duration: Duration(seconds: 2),
        ),
      );
      Navigator.pop(context, true);
    } else {
      setState(() {
        _regBusy = false;
        _regError = result['message']?.toString() ?? 'Không thể đăng ký tài khoản. Vui lòng thử lại.';
      });
    }
  }

  void _showServerConfigDialog() {
    final controller = TextEditingController(text: AppConfig.backendUrl);
    String? pingResult;
    bool pinging = false;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF191D2A),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: const Row(
            children: [
              Icon(Icons.dns_rounded, color: AppTheme.primary, size: 22),
              SizedBox(width: 8),
              Text('Cấu Hình Máy Chủ API', style: TextStyle(fontSize: 16, color: Colors.white, fontWeight: FontWeight.bold)),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Địa chỉ máy chủ Website CineViet (Backend URL):',
                style: TextStyle(color: AppTheme.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: controller,
                style: const TextStyle(color: Colors.white, fontSize: 13),
                decoration: InputDecoration(
                  hintText: 'https://cineviet.live',
                  hintStyle: const TextStyle(color: Colors.white30),
                  filled: true,
                  fillColor: AppTheme.surface,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: BorderSide.none),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  OutlinedButton.icon(
                    onPressed: pinging
                        ? null
                        : () async {
                            setDialogState(() {
                              pinging = true;
                              pingResult = null;
                            });
                            try {
                              final testUrl = controller.text.trim().replaceAll(RegExp(r'/+$'), '');
                              final uri = Uri.parse('$testUrl/api/home');
                              final res = await http.get(uri).timeout(const Duration(seconds: 8));
                              setDialogState(() {
                                pinging = false;
                                if (res.statusCode == 200) {
                                  pingResult = '✓ Kết nối thành công (HTTP 200 OK)';
                                } else if (res.statusCode == 522) {
                                  pingResult = '✗ Lỗi 522: Cloudflare Timeout (máy chủ gốc chưa bật)';
                                } else {
                                  pingResult = '✗ Phản hồi HTTP ${res.statusCode}';
                                }
                              });
                            } catch (e) {
                              setDialogState(() {
                                pinging = false;
                                pingResult = '✗ Lỗi kết nối: ${e.toString().replaceAll("Exception:", "").trim()}';
                              });
                            }
                          },
                    icon: pinging
                        ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.primary))
                        : const Icon(Icons.network_check_rounded, size: 16, color: AppTheme.primaryLight),
                    label: const Text('Kiểm tra', style: TextStyle(fontSize: 12, color: AppTheme.primaryLight)),
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: AppTheme.primary.withOpacity(0.5)),
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    ),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () {
                      controller.text = 'https://cineviet.live';
                      setDialogState(() => pingResult = null);
                    },
                    child: const Text('Mặc định', style: TextStyle(color: AppTheme.textMuted, fontSize: 12)),
                  ),
                ],
              ),
              if (pingResult != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: pingResult!.startsWith('✓') ? Colors.green.withOpacity(0.12) : Colors.red.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    pingResult!,
                    style: TextStyle(
                      color: pingResult!.startsWith('✓') ? Colors.greenAccent : Colors.redAccent,
                      fontSize: 12,
                      height: 1.3,
                    ),
                  ),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Đóng', style: TextStyle(color: AppTheme.textSecondary)),
            ),
            ElevatedButton(
              onPressed: () async {
                final url = controller.text.trim();
                await StorageService.setCustomServerUrl(url.isEmpty ? null : url);
                if (mounted) setState(() { _loginError = null; _regError = null; });
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Đã cập nhật máy chủ: ${AppConfig.backendUrl}'),
                    backgroundColor: AppTheme.surface,
                  ),
                );
              },
              child: const Text('Lưu máy chủ'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Tài Khoản CineViet', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        actions: [
          IconButton(
            icon: const Icon(Icons.dns_outlined, size: 22),
            tooltip: 'Cấu hình máy chủ',
            onPressed: _showServerConfigDialog,
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 4),
            decoration: BoxDecoration(
              color: AppTheme.card,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppTheme.border),
            ),
            child: TabBar(
              controller: _tabController,
              indicator: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                gradient: AppTheme.primaryGradient,
              ),
              indicatorSize: TabBarIndicatorSize.tab,
              dividerColor: Colors.transparent,
              labelColor: Colors.white,
              unselectedLabelColor: AppTheme.textMuted,
              labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
              tabs: const [
                Tab(text: 'Đăng Nhập'),
                Tab(text: 'Đăng Ký'),
              ],
            ),
          ),
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // TAB 1: ĐĂNG NHẬP
          _buildLoginTab(),

          // TAB 2: ĐĂNG KÝ
          _buildRegisterTab(),
        ],
      ),
    );
  }

  Widget _buildLoginTab() {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
      physics: const BouncingScrollPhysics(),
      children: [
        if (_challengeId == null) ...[
          const SizedBox(height: 8),
          TextField(
            controller: _loginEmail,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: 'Địa chỉ Email',
              prefixIcon: const Icon(Icons.email_outlined, color: AppTheme.textMuted, size: 20),
              filled: true,
              fillColor: AppTheme.card,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: AppTheme.border)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: AppTheme.border)),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _loginPassword,
            obscureText: _obscureLoginPassword,
            autofillHints: const [AutofillHints.password],
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: 'Mật khẩu',
              prefixIcon: const Icon(Icons.lock_outline_rounded, color: AppTheme.textMuted, size: 20),
              suffixIcon: IconButton(
                icon: Icon(_obscureLoginPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: AppTheme.textMuted, size: 20),
                onPressed: () => setState(() => _obscureLoginPassword = !_obscureLoginPassword),
              ),
              filled: true,
              fillColor: AppTheme.card,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: AppTheme.border)),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: AppTheme.border)),
            ),
            onSubmitted: (_) => _login(),
          ),
        ] else ...[
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppTheme.card,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppTheme.primary.withOpacity(0.5)),
            ),
            child: const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Xác thực 2 bước (MFA)', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                SizedBox(height: 4),
                Text('Nhập mã gồm 6 số từ ứng dụng xác thực của bạn.', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
              ],
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _code,
            autocorrect: false,
            enableSuggestions: false,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: 'Mã MFA / Mã khôi phục',
              prefixIcon: const Icon(Icons.security_rounded, color: AppTheme.textMuted, size: 20),
              filled: true,
              fillColor: AppTheme.card,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: AppTheme.border)),
            ),
            onSubmitted: (_) => _login(),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: _loginBusy ? null : () => setState(() { _challengeId = null; _code.clear(); _loginError = null; }),
            child: const Text('Quay lại đăng nhập thường', style: TextStyle(color: AppTheme.textSecondary)),
          ),
        ],

        const SizedBox(height: 20),

        if (_loginError != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.red.withOpacity(0.12),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.redAccent.withOpacity(0.5)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_loginError!, style: const TextStyle(color: Colors.redAccent, fontSize: 13, height: 1.4)),
                const SizedBox(height: 8),
                InkWell(
                  onTap: _showServerConfigDialog,
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.settings_ethernet_rounded, color: Colors.white70, size: 14),
                      SizedBox(width: 4),
                      Text('Kiểm tra hoặc đổi địa chỉ máy chủ API', style: TextStyle(color: Colors.white, fontSize: 12, decoration: TextDecoration.underline)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],

        SizedBox(
          height: 46,
          child: ElevatedButton(
            onPressed: _loginBusy ? null : _login,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primary,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              elevation: 3,
            ),
            child: _loginBusy
                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
                : const Text('Đăng Nhập', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
          ),
        ),

        const SizedBox(height: 18),

        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Chưa có tài khoản? ', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
            GestureDetector(
              onTap: () {
                _tabController.animateTo(1);
                setState(() => _loginError = null);
              },
              child: const Text(
                'Đăng ký ngay',
                style: TextStyle(
                  color: AppTheme.primaryLight,
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),

        const SizedBox(height: 24),
        Center(
          child: TextButton.icon(
            onPressed: _showServerConfigDialog,
            icon: const Icon(Icons.dns_rounded, size: 14, color: Colors.white38),
            label: Text(
              'Máy chủ: ${Uri.tryParse(AppConfig.backendUrl)?.host ?? AppConfig.backendUrl}',
              style: const TextStyle(color: Colors.white38, fontSize: 11),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildRegisterTab() {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
      physics: const BouncingScrollPhysics(),
      children: [
        const SizedBox(height: 8),
        TextField(
          controller: _regName,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            labelText: 'Họ và tên / Biệt danh (tùy chọn)',
            prefixIcon: const Icon(Icons.person_outline_rounded, color: AppTheme.textMuted, size: 20),
            filled: true,
            fillColor: AppTheme.card,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: AppTheme.border)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: AppTheme.border)),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _regEmail,
          keyboardType: TextInputType.emailAddress,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            labelText: 'Địa chỉ Email *',
            prefixIcon: const Icon(Icons.email_outlined, color: AppTheme.textMuted, size: 20),
            filled: true,
            fillColor: AppTheme.card,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: AppTheme.border)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: AppTheme.border)),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _regPassword,
          obscureText: _obscureRegPassword,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            labelText: 'Mật khẩu (tối thiểu 6 ký tự) *',
            prefixIcon: const Icon(Icons.lock_outline_rounded, color: AppTheme.textMuted, size: 20),
            suffixIcon: IconButton(
              icon: Icon(_obscureRegPassword ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: AppTheme.textMuted, size: 20),
              onPressed: () => setState(() => _obscureRegPassword = !_obscureRegPassword),
            ),
            filled: true,
            fillColor: AppTheme.card,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: AppTheme.border)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: AppTheme.border)),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _regConfirmPassword,
          obscureText: _obscureRegConfirm,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            labelText: 'Xác nhận lại mật khẩu *',
            prefixIcon: const Icon(Icons.lock_reset_rounded, color: AppTheme.textMuted, size: 20),
            suffixIcon: IconButton(
              icon: Icon(_obscureRegConfirm ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: AppTheme.textMuted, size: 20),
              onPressed: () => setState(() => _obscureRegConfirm = !_obscureRegConfirm),
            ),
            filled: true,
            fillColor: AppTheme.card,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: AppTheme.border)),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: BorderSide(color: AppTheme.border)),
          ),
          onSubmitted: (_) => _register(),
        ),

        const SizedBox(height: 20),

        if (_regError != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.red.withOpacity(0.12),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.redAccent.withOpacity(0.5)),
            ),
            child: Text(_regError!, style: const TextStyle(color: Colors.redAccent, fontSize: 13, height: 1.4)),
          ),
          const SizedBox(height: 16),
        ],

        SizedBox(
          height: 46,
          child: ElevatedButton(
            onPressed: _regBusy ? null : _register,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primary,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              elevation: 3,
            ),
            child: _regBusy
                ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white))
                : const Text('Tạo Tài Khoản Mới', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
          ),
        ),

        const SizedBox(height: 18),

        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Đã có tài khoản? ', style: TextStyle(color: AppTheme.textMuted, fontSize: 13)),
            GestureDetector(
              onTap: () {
                _tabController.animateTo(0);
                setState(() => _regError = null);
              },
              child: const Text(
                'Đăng nhập ngay',
                style: TextStyle(
                  color: AppTheme.primaryLight,
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ),

        const SizedBox(height: 24),
        Center(
          child: TextButton.icon(
            onPressed: _showServerConfigDialog,
            icon: const Icon(Icons.dns_rounded, size: 14, color: Colors.white38),
            label: Text(
              'Máy chủ: ${Uri.tryParse(AppConfig.backendUrl)?.host ?? AppConfig.backendUrl}',
              style: const TextStyle(color: Colors.white38, fontSize: 11),
            ),
          ),
        ),
      ],
    );
  }
}
