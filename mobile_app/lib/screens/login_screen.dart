import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../services/api_service.dart';
import '../services/app_config.dart';
import '../services/storage_service.dart';
import '../theme/app_theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _code = TextEditingController();
  String? _challengeId;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_busy || (_challengeId == null && (_email.text.trim().isEmpty || _password.text.isEmpty)) || (_challengeId != null && _code.text.trim().isEmpty)) return;
    setState(() { _busy = true; _error = null; });
    final result = await ApiService.login(_email.text.trim(), _password.text,
        challengeId: _challengeId, code: _code.text.trim());
    if (!mounted) return;
    final data = result['data'];
    if (result['status'] == true && data is Map && data['mfaRequired'] == true) {
      setState(() { _busy = false; _challengeId = data['challengeId']?.toString(); _password.clear(); _code.clear(); });
    } else if (result['status'] == true && data is Map && data['token'] is String) {
      Navigator.pop(context, true);
    } else {
      setState(() { _busy = false; _error = result['message']?.toString() ?? 'Không thể đăng nhập'; });
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
                if (mounted) setState(() { _error = null; });
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
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Đăng nhập tài khoản'),
      actions: [
        IconButton(
          icon: const Icon(Icons.dns_outlined, size: 22),
          tooltip: 'Cấu hình máy chủ',
          onPressed: _showServerConfigDialog,
        ),
      ],
    ),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        if (_challengeId == null) ...[
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            decoration: const InputDecoration(labelText: 'Email'),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _password,
            obscureText: true,
            autofillHints: const [AutofillHints.password],
            decoration: const InputDecoration(labelText: 'Mật khẩu'),
            onSubmitted: (_) => _login(),
          ),
        ] else ...[
          const Text('Nhập mã từ ứng dụng xác thực hoặc mã khôi phục.'),
          TextField(
            controller: _code,
            autocorrect: false,
            enableSuggestions: false,
            decoration: const InputDecoration(labelText: 'Mã MFA / khôi phục'),
            onSubmitted: (_) => _login(),
          ),
          TextButton(
            onPressed: _busy ? null : () => setState(() { _challengeId = null; _code.clear(); _error = null; }),
            child: const Text('Quay lại đăng nhập'),
          ),
        ],
        const SizedBox(height: 24),
        if (_error != null) ...[
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
                Text(_error!, style: const TextStyle(color: Colors.redAccent, fontSize: 13, height: 1.4)),
                const SizedBox(height: 8),
                InkWell(
                  onTap: _showServerConfigDialog,
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.settings_ethernet_rounded, color: Colors.white70, size: 14),
                      SizedBox(width: 4),
                      Text('Đổi địa chỉ máy chủ kết nối', style: TextStyle(color: Colors.white, fontSize: 12, decoration: TextDecoration.underline)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
        ElevatedButton(
          onPressed: _busy ? null : _login,
          child: _busy
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Đăng nhập'),
        ),
        const SizedBox(height: 24),
        Center(
          child: TextButton.icon(
            onPressed: _showServerConfigDialog,
            icon: const Icon(Icons.dns_rounded, size: 15, color: Colors.white54),
            label: Text(
              'Máy chủ: ${Uri.tryParse(AppConfig.backendUrl)?.host ?? AppConfig.backendUrl}',
              style: const TextStyle(color: Colors.white54, fontSize: 12),
            ),
          ),
        ),
      ],
    ),
  );
}
