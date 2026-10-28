import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppConfig {
  static String? _customUrl;

  static void setCustomUrl(String? url) {
    if (url == null || url.trim().isEmpty) {
      _customUrl = null;
    } else {
      _customUrl = url.trim().replaceAll(RegExp(r'/+$'), '');
    }
  }

  static Future<void> init() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString('ttphim_custom_server_url');
      if (saved != null && saved.trim().isNotEmpty) {
        _customUrl = saved.trim().replaceAll(RegExp(r'/+$'), '');
      }
    } catch (_) {}
  }

  // Local development default. On devices, forward port 3001 or override with a reachable LAN/HTTPS URL.
  static const String _defaultBackendUrl = String.fromEnvironment(
    'BACKEND_URL', defaultValue: kReleaseMode ? 'https://cineviet.live' : 'http://localhost:3001',
  );

  static String get backendUrl {
    if (_customUrl != null && _customUrl!.isNotEmpty) return _customUrl!;
    return _defaultBackendUrl;
  }

  static bool get hasBackend => backendUrl.trim().isNotEmpty;

  static Uri backendUri(String path, [Map<String, String>? query]) {
    final base = backendUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(base);
    if (uri == null || !['http', 'https'].contains(uri.scheme) || uri.host.isEmpty) {
      throw StateError('Chưa cấu hình BACKEND_URL hợp lệ cho ứng dụng');
    }
    return Uri.parse('$base$path').replace(queryParameters: query);
  }

  static bool isProductionBackendUrl(String value) {
    final uri = Uri.tryParse(value);
    if (uri == null || uri.scheme != 'https' || uri.host.isEmpty ||
        uri.userInfo.isNotEmpty || uri.hasQuery || uri.hasFragment ||
        (uri.path.isNotEmpty && uri.path != '/') || uri.port != 443) return false;
    final host = uri.host.toLowerCase();
    return host.contains('.') && host != 'localhost' &&
        !host.startsWith('127.') && !host.startsWith('10.') &&
        !host.startsWith('192.168.') && !host.startsWith('169.254.') &&
        !RegExp(r'^172\.(1[6-9]|2\d|3[01])\.').hasMatch(host) &&
        !['.localhost', '.local', '.test', '.invalid', '.example'].any(host.endsWith);
  }
}
