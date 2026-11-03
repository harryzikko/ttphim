import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class AppConfig {
  static String? _activeUrl;
  static bool _hasDiscovered = false;

  static const String remoteConfigUrl =
      'https://raw.githubusercontent.com/harryzikko/ttphim/main/mobile_app/config/endpoints.json';

  static const List<String> defaultMirrors = [
    'https://cineviet.live',
    'http://192.168.10.158:3001',
    'http://10.0.2.2:3001',
    'http://127.0.0.1:3001',
  ];

  static void setCustomUrl(String? url) {
    if (url == null || url.trim().isEmpty) {
      _activeUrl = null;
    } else {
      _activeUrl = url.trim().replaceAll(RegExp(r'/+$'), '');
    }
  }

  /// Initialize config and auto-discover active domain in background
  static Future<void> init() async {
    try {
      final prefs = await SharedPreferences.getInstance();

      // 1. Check if user manually pinned a server URL
      final manual = prefs.getString('ttphim_custom_server_url');
      if (manual != null && manual.trim().isNotEmpty) {
        _activeUrl = manual.trim().replaceAll(RegExp(r'/+$'), '');
        return;
      }

      // 2. Check if we have a previously verified working domain
      final cached = prefs.getString('ttphim_active_backend_url');
      if (cached != null && cached.trim().isNotEmpty) {
        _activeUrl = cached.trim().replaceAll(RegExp(r'/+$'), '');
      }

      // 3. Trigger async auto-discovery without blocking app startup
      autoDiscoverActiveDomain();
    } catch (_) {}
  }

  /// Automatically discovers which domain is currently alive and active in parallel
  static Future<String?> autoDiscoverActiveDomain() async {
    if (_hasDiscovered) return _activeUrl;
    _hasDiscovered = true;

    final candidates = <String>{};

    // Fetch dynamic domain list from GitHub with a short timeout
    try {
      final res = await http.get(Uri.parse(remoteConfigUrl)).timeout(const Duration(seconds: 2));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        if (data is Map<String, dynamic>) {
          if (data['active'] is String && (data['active'] as String).isNotEmpty) {
            candidates.add((data['active'] as String).trim().replaceAll(RegExp(r'/+$'), ''));
          }
          if (data['mirrors'] is List) {
            for (final m in data['mirrors']) {
              if (m is String && m.isNotEmpty) {
                candidates.add(m.trim().replaceAll(RegExp(r'/+$'), ''));
              }
            }
          }
        }
      }
    } catch (_) {}

    // Add default mirrors in priority order
    for (final mirror in defaultMirrors) {
      candidates.add(mirror.trim().replaceAll(RegExp(r'/+$'), ''));
    }

    // Test candidates in PARALLEL for near-instant health discovery
    final candidateList = candidates.toList();
    final pingFutures = candidateList.map((clean) async {
      if (await _pingDomain(clean)) {
        return clean;
      }
      return null;
    }).toList();

    final results = await Future.wait(pingFutures);
    for (final clean in results) {
      if (clean != null && clean.isNotEmpty) {
        _activeUrl = clean;
        try {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('ttphim_active_backend_url', clean);
        } catch (_) {}
        return clean;
      }
    }
    return _activeUrl;
  }

  static Future<bool> _pingDomain(String domain) async {
    try {
      final uri = Uri.parse('$domain/api/ready');
      final res = await http.get(uri).timeout(const Duration(milliseconds: 2000));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  // Local development default. On devices, forward port 3001 or override with a reachable LAN/HTTPS URL.
  static const String _defaultBackendUrl = String.fromEnvironment(
    'BACKEND_URL', defaultValue: kReleaseMode ? 'https://cineviet.live' : 'http://localhost:3001',
  );

  static String get backendUrl {
    if (_activeUrl != null && _activeUrl!.isNotEmpty) return _activeUrl!;
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
