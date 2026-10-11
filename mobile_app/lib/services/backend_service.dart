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
    final headers = <String, String>{'Content-Type': 'application/json',
      if (credential != null) 'Authorization': 'Bearer $credential'};
    final uri = AppConfig.backendUri(path, query);
    final response = body == null
        ? await client.get(uri, headers: headers).timeout(const Duration(seconds: 15))
        : await client.post(uri, headers: headers, body: json.encode(body)).timeout(const Duration(seconds: 15));
    if (response.statusCode == 401 && credential != null && await SessionService.getToken() == credential) {
      await SessionService.clear();
    }
    final decoded = json.decode(utf8.decode(response.bodyBytes));
    if (decoded is! Map<String, dynamic>) throw const FormatException('Invalid backend response');
    return decoded;
  }
}
