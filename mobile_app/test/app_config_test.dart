import 'package:flutter_test/flutter_test.dart';
import 'package:ttphim/services/app_config.dart';

void main() {
  test('backend defaults to the project local port and accepts build overrides', () {
    const configured = String.fromEnvironment('BACKEND_URL', defaultValue: 'http://localhost:3001');
    expect(AppConfig.backendUrl, configured);
    expect(AppConfig.hasBackend, isTrue);
    final uri = AppConfig.backendUri('/api/auth/tv/status', {'token': 'a&b'});
    expect(uri.path, '/api/auth/tv/status');
    expect(uri.queryParameters['token'], 'a&b');
    if (!const bool.hasEnvironment('BACKEND_URL')) {
      expect(uri.host, 'localhost');
      expect(uri.port, 3001);
    }
  });
}
