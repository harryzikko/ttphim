import 'package:flutter/material.dart';
import '../services/api_service.dart';

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

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Đăng nhập tài khoản')),
    body: ListView(padding: const EdgeInsets.all(24), children: [
      if (_challengeId == null) ...[
        TextField(controller: _email, keyboardType: TextInputType.emailAddress,
          autofillHints: const [AutofillHints.email], decoration: const InputDecoration(labelText: 'Email')),
        const SizedBox(height: 16),
        TextField(controller: _password, obscureText: true,
          autofillHints: const [AutofillHints.password], decoration: const InputDecoration(labelText: 'Mật khẩu'),
          onSubmitted: (_) => _login()),
      ] else ...[
        const Text('Nhập mã từ ứng dụng xác thực hoặc mã khôi phục.'),
        TextField(controller: _code, autocorrect: false, enableSuggestions: false,
          decoration: const InputDecoration(labelText: 'Mã MFA / khôi phục'), onSubmitted: (_) => _login()),
        TextButton(onPressed: _busy ? null : () => setState(() { _challengeId = null; _code.clear(); _error = null; }), child: const Text('Quay lại đăng nhập')),
      ],
      const SizedBox(height: 24),
      if (_error != null) Text(_error!, style: const TextStyle(color: Colors.redAccent)),
      ElevatedButton(onPressed: _busy ? null : _login,
        child: _busy ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Đăng nhập')),
    ]),
  );
}
