import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../services/app_config.dart';
import '../services/storage_service.dart';
import 'login_screen.dart';
import '../services/session_service.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});
  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  Map<String, dynamic>? _user;
  bool _loading = true;
  @override
  void initState() {
    super.initState();
    SessionService.changes.addListener(_sessionChanged);
    _restore();
  }
  @override
  void dispose() { SessionService.changes.removeListener(_sessionChanged); super.dispose(); }
  Future<void> _sessionChanged() async {
    try {
      final user = await StorageService.getUser();
      if (mounted) setState(() => _user = user);
    } catch (_) { if (mounted) setState(() => _user = null); }
  }
  Future<void> _restore() async {
    Map<String, dynamic>? saved;
    try { saved = await StorageService.getUser(); } catch (_) { saved = null; }
    if (!mounted) return;
    setState(() { _user = saved; _loading = false; });
    final user = await ApiService.restoreSession();
    if (mounted) setState(() => _user = user);
  }
  Future<void> _login() async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => const LoginScreen()));
    if (mounted) await _restore();
  }
  Future<void> _logout() async {
    setState(() => _loading = true);
    try {
      await ApiService.logout();
      if (mounted) setState(() => _user = null);
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Không thể xóa phiên. Vui lòng thử lại.')));
    } finally { if (mounted) setState(() => _loading = false); }
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Tài khoản')),
    body: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 560),
      child: ListView(shrinkWrap: true, padding: const EdgeInsets.all(24), children: [
        if (_loading) const Center(child: CircularProgressIndicator())
        else ...[
          Text(_user?['name']?.toString() ?? 'Chưa đăng nhập', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          if (_user != null) Text(_user!['email']?.toString() ?? ''),
          const SizedBox(height: 16),
          Text(AppConfig.hasBackend ? 'Server: ${AppConfig.backendUrl}' : 'Bản build này chưa có BACKEND_URL. Cần build lại với địa chỉ server.'),
          const SizedBox(height: 24),
          ElevatedButton(autofocus: true, onPressed: _user == null ? _login : _logout,
            child: Text(_user == null ? 'Đăng nhập' : 'Đăng xuất')),
          const SizedBox(height: 12),
          const Text('Yêu thích và lịch sử của tài khoản được đồng bộ với website. Dữ liệu khách trên thiết bị được giữ riêng.'),
        ],
      ]),
    )),
  );
}
