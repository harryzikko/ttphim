import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';
import '../models/app_update_info.dart';
import 'api_service.dart';

class UpdateService {
  static const String currentVersion = '1.0.0';
  static const int currentBuildNumber = 1;
  static const MethodChannel _channel = MethodChannel('com.ttphim.app/updater');

  /// Compare two semantic version strings (e.g. "1.0.1" vs "1.0.0")
  static bool isNewerVersion(String latest, String current) {
    try {
      final lParts = latest.trim().split('.').map((e) => int.tryParse(e) ?? 0).toList();
      final cParts = current.trim().split('.').map((e) => int.tryParse(e) ?? 0).toList();
      final maxLen = lParts.length > cParts.length ? lParts.length : cParts.length;

      for (int i = 0; i < maxLen; i++) {
        final l = i < lParts.length ? lParts[i] : 0;
        final c = i < cParts.length ? cParts[i] : 0;
        if (l > c) return true;
        if (l < c) return false;
      }
    } catch (_) {}
    return false;
  }

  /// Check if a newer version is available from server
  static Future<AppUpdateInfo?> checkUpdate() async {
    try {
      final info = await ApiService.getAppUpdate();
      if (!info.enabled) return null;

      final hasNewerBuild = info.latestBuild > currentBuildNumber;
      final hasNewerVer = isNewerVersion(info.latestVersion, currentVersion);

      if (hasNewerBuild || hasNewerVer) {
        return info;
      }
    } catch (e) {
      debugPrint('[UpdateService] Check update error: $e');
    }
    return null;
  }

  /// Get the appropriate download URL based on OS and device type
  static String getDownloadUrl(AppUpdateInfo info, {bool isTv = false}) {
    if (kIsWeb) return info.apkMobileUrl;

    if (Platform.isAndroid) {
      if (isTv) {
        return info.apkTvUrl.isNotEmpty ? info.apkTvUrl : info.apkMobileUrl;
      }
      return info.apkMobileUrl.isNotEmpty ? info.apkMobileUrl : info.apkTvUrl;
    } else if (Platform.isIOS || Platform.isMacOS) {
      return info.iosUrl;
    }
    return info.apkMobileUrl;
  }

  /// Download the APK directly in the app and invoke installation
  static Future<void> downloadAndInstallApk({
    required String downloadUrl,
    required void Function(double progress) onProgress,
    required void Function(String error) onError,
    required void Function() onSuccess,
  }) async {
    http.Client? client;
    try {
      final uri = Uri.parse(downloadUrl);
      client = http.Client();
      final request = http.Request('GET', uri);
      final response = await client.send(request);

      if (response.statusCode != 200) {
        onError('Máy chủ trả về mã lỗi ${response.statusCode}');
        client.close();
        return;
      }

      final contentLength = response.contentLength ?? 0;
      final tempDir = Directory.systemTemp;
      final apkFile = File('${tempDir.path}/CineViet_update.apk');
      if (await apkFile.exists()) {
        try { await apkFile.delete(); } catch (_) {}
      }

      final sink = apkFile.openWrite();
      int received = 0;

      await for (final chunk in response.stream) {
        received += chunk.length;
        sink.add(chunk);
        if (contentLength > 0) {
          onProgress(received / contentLength);
        } else {
          onProgress(-1.0); // Indeterminate
        }
      }

      await sink.flush();
      await sink.close();
      client.close();

      onProgress(1.0);

      // Trigger Android native package installer
      try {
        final result = await _channel.invokeMethod('installApk', {
          'filePath': apkFile.path,
        });

        if (result == true) {
          onSuccess();
          return;
        }
      } catch (channelErr) {
        debugPrint('[UpdateService] MethodChannel failed, falling back to external launcher: $channelErr');
      }

      // Fallback: Open URL externally if native channel fails
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
        onSuccess();
      } else {
        onError('Không thể khởi chạy trình cài đặt tệp APK');
      }
    } catch (e) {
      client?.close();
      debugPrint('[UpdateService] Download error: $e');
      onError('Lỗi khi tải bản cập nhật: ${e.toString().replaceAll('Exception:', '').trim()}');
    }
  }

  /// Open iOS update link (IPA / TestFlight / Web)
  static Future<void> openIosUpdate(String url) async {
    try {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (e) {
      debugPrint('[UpdateService] iOS open update error: $e');
    }
  }
}
