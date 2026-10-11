import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SessionService {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );
  static final ValueNotifier<int> changes = ValueNotifier(0);

  static Future<void> save(String token, Map<String, dynamic> user) async {
    // Write token last: an interrupted write must not authenticate the wrong user.
    await _storage.delete(key: 'ttphim_token');
    await _storage.write(key: 'ttphim_user', value: json.encode(user));
    await _storage.write(key: 'ttphim_token', value: token);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('ttphim_token');
    await prefs.remove('ttphim_user');
    changes.value++;
  }

  static Future<String?> getToken() async {
    final token = await _storage.read(key: 'ttphim_token');
    if (token != null) return token;
    // Migrate sessions saved by the earlier app without losing a valid login.
    final prefs = await SharedPreferences.getInstance();
    final legacyToken = prefs.getString('ttphim_token');
    final legacyUser = prefs.getString('ttphim_user');
    if (legacyToken != null && legacyUser != null) {
      try {
        final user = json.decode(legacyUser);
        if (user is Map<String, dynamic>) {
          await save(legacyToken, user);
          return legacyToken;
        }
      } on FormatException { /* Ignore an invalid legacy session. */ }
    }
    return null;
  }

  static Future<Map<String, dynamic>?> getUser() async {
    if (await getToken() == null) return null;
    final raw = await _storage.read(key: 'ttphim_user');
    try {
      final decoded = raw == null ? null : json.decode(raw);
      return decoded is Map<String, dynamic> ? decoded : null;
    } on FormatException { return null; }
  }

  static Future<void> clear() async {
    await _storage.delete(key: 'ttphim_token');
    await _storage.delete(key: 'ttphim_user');
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('ttphim_token');
    await prefs.remove('ttphim_user');
    changes.value++;
  }
}
