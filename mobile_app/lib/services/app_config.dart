class AppConfig {
  // Local development default. On devices, forward port 3001 or override with a reachable LAN/HTTPS URL.
  static const String backendUrl = String.fromEnvironment(
    'BACKEND_URL', defaultValue: 'http://localhost:3001',
  );
  static bool get hasBackend => backendUrl.trim().isNotEmpty;

  static Uri backendUri(String path, [Map<String, String>? query]) {
    final base = backendUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(base);
    if (uri == null || !['http', 'https'].contains(uri.scheme) || uri.host.isEmpty) {
      throw StateError('Chưa cấu hình BACKEND_URL hợp lệ cho ứng dụng');
    }
    return Uri.parse('$base$path').replace(queryParameters: query);
  }
}
