import 'package:flutter/foundation.dart';

class AppConfig {
  // Local development default. On devices, forward port 3001 or override with a reachable LAN/HTTPS URL.
  static const String backendUrl = String.fromEnvironment(
    'BACKEND_URL', defaultValue: kReleaseMode ? '' : 'http://localhost:3001',
  );
  static bool get hasBackend => backendUrl.trim().isNotEmpty;

  static Uri backendUri(String path, [Map<String, String>? query]) {
    final base = backendUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(base);
    if (uri == null || !['http', 'https'].contains(uri.scheme) || uri.host.isEmpty) {
      throw StateError('Chưa cấu hình BACKEND_URL hợp lệ cho ứng dụng');
    }
    if (kReleaseMode && !isProductionBackendUrl(base)) {
      throw StateError('Release builds require a public HTTPS BACKEND_URL');
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
