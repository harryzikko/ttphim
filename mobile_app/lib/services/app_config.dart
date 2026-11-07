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
      final manual = prefs.getString('cineviet_custom_server_url') ?? prefs.getString('ttphim_custom_server_url');
      if (manual != null && manual.trim().isNotEmpty) {
        _activeUrl = manual.trim().replaceAll(RegExp(r'/+$'), '');
        return;
      }

      // 2. Check if we have a previously verified working domain
      final cached = prefs.getString('cineviet_active_backend_url') ?? prefs.getString('ttphim_active_backend_url');
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

    // Use the first one that responds successfully
    for (final future in pingFutures) {
      final result = await future;
      if (result != null) {
        _activeUrl = result;
        // Save verified working domain to warm disk cache
        try {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('cineviet_active_backend_url', result);
        } catch (_) {}
        return result;
      }
    }

    return _activeUrl;
  }

  static Future<bool> _pingDomain(String domain) async {
    try {
      final uri = Uri.parse('$domain/api/health').replace(
        path: '$domain/api/health'.replaceAll(RegExp(r'^https?://[^/]+'), ''),
      );
      final res = await http.get(uri).timeout(const Duration(milliseconds: 1500));
      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// The active backend base URL (e.g. "https://cineviet.live")
  /// Returns null if no backend is reachable (Offline/Standalone Mode)
  static String? get backendUrl {
    const defined = String.fromEnvironment('BACKEND_URL');
    if (defined.isNotEmpty && _activeUrl == null) {
      return defined.replaceAll(RegExp(r'/+$'), '');
    }
    return _activeUrl;
  }

  /// Whether a backend server is currently connected and active
  static bool get hasBackend => backendUrl != null && backendUrl!.isNotEmpty;
}
