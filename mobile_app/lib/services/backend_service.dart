import 'dart:convert';
import 'package:http/http.dart' as http;
import 'app_config.dart';
import 'session_service.dart';

class BackendService {
  static http.Client client = http.Client();

  static void setClientForTesting(http.Client value) => client = value;

  static Future<Map<String, dynamic>?> request(String path, {
    Map<String, String>? query, Map<String, dynamic>? body, String? token,
  }) async {
    if (!AppConfig.hasBackend) return null;
    final credential = token ?? await SessionService.getToken();
    final headers = <String, String>{'Content-Type': 'application/json', 'X-Client-Type': 'native',
      if (credential != null) 'Authorization': 'Bearer $credential'};
    final uri = AppConfig.backendUri(path, query);
    http.Response response;
    try {
      response = body == null
          ? await client.get(uri, headers: headers).timeout(const Duration(seconds: 15))
          : await client.post(uri, headers: headers, body: json.encode(body)).timeout(const Duration(seconds: 15));
    } catch (e) {
      return {
        'status': false,
        'message': 'Không thể kết nối đến máy chủ (${uri.host}): Vui lòng kiểm tra mạng hoặc địa chỉ máy chủ.',
      };
    }

    if (response.statusCode == 401 && credential != null && await SessionService.getToken() == credential) {
      await SessionService.clear();
    }

    // Upstream or Cloudflare error handling
    if (response.statusCode >= 500) {
      final bodyText = utf8.decode(response.bodyBytes, allowMalformed: true);
      final isCloudflare522 = response.statusCode == 522 || bodyText.contains('522') || bodyText.contains('Connection timed out');
      final msg = isCloudflare522
          ? 'Máy chủ ${uri.host} báo lỗi 522 (Cloudflare Timeout): Máy chủ gốc backend chưa được bật hoặc không phản hồi.'
          : 'Máy chủ ${uri.host} báo lỗi HTTP ${response.statusCode}.';
      return {'status': false, 'message': msg};
    }

    try {
      final decoded = json.decode(utf8.decode(response.bodyBytes));
      if (decoded is Map<String, dynamic>) return decoded;
      return {'status': false, 'message': 'Phản hồi từ máy chủ không đúng định dạng JSON'};
    } catch (_) {
      return {
        'status': false,
        'message': 'Máy chủ ${uri.host} phản hồi lỗi (HTTP ${response.statusCode})',
      };
    }
  }
}
