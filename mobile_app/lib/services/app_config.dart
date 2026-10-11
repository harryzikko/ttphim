class AppConfig {
  // Build with --dart-define=BACKEND_URL=https://your-server.example
  // Empty is intentional: localhost on a phone/TV is not the development PC.
  static const String backendUrl = String.fromEnvironment('BACKEND_URL');
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
