import 'dart:io';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/painting.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:path_provider/path_provider.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'api_service.dart';
import 'season_service.dart';
import 'update_service.dart';

/// Measures and safely clears temporary image, feed, APK, and WebView caches
/// while leaving user credentials, library data, and Cloudflare cookies intact.
class CacheService {
  static String formatBytes(int bytes) {
    if (bytes <= 0) return '0 KB';
    const kb = 1024;
    const mb = 1024 * kb;
    const gb = 1024 * mb;
    if (bytes >= gb) return '${(bytes / gb).toStringAsFixed(2)} GB';
    if (bytes >= mb) return '${(bytes / mb).toStringAsFixed(1)} MB';
    return '${(bytes / kb).ceil()} KB';
  }

  static Future<int> _directoryBytes(Directory dir) async {
    var total = 0;
    try {
      if (!await dir.exists()) return 0;
      await for (final entity in dir.list(
        recursive: true,
        followLinks: false,
      )) {
        if (entity is File) {
          try {
            total += await entity.length();
          } catch (_) {}
        }
      }
    } catch (_) {}
    return total;
  }

  static Future<int> _imageDiskCacheBytes() async {
    if (kIsWeb) return 0;
    try {
      final tempDir = await getTemporaryDirectory();
      final cacheDir = Directory(
        '${tempDir.path}${Platform.pathSeparator}libCachedImageData',
      );
      return await _directoryBytes(cacheDir);
    } catch (_) {
      return 0;
    }
  }

  /// Estimate total disk bytes occupied by temporary images and update APK installers.
  static Future<int> estimateCacheBytes() async {
    if (kIsWeb) return 0;
    final results = await Future.wait<int>([
      _imageDiskCacheBytes(),
      UpdateService.getCachedUpdateApkBytes(),
    ]);
    return results[0] + results[1];
  }

  /// Clear cached images, temporary update APK, feed caches, and WebView static cache.
  /// Returns estimated disk bytes freed.
  static Future<int> clearAllCaches() async {
    final beforeBytes = await estimateCacheBytes();

    try {
      await DefaultCacheManager().emptyCache();
    } catch (_) {}

    try {
      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();
    } catch (_) {}

    final freedApk = await UpdateService.clearCachedUpdateApk();
    await ApiService.clearHomeCache();
    SeasonService.clearCache();

    if (!kIsWeb && (Platform.isAndroid || Platform.isIOS)) {
      try {
        await WebViewController().clearCache();
      } catch (_) {}
    }

    final afterBytes = await estimateCacheBytes();
    final delta = beforeBytes - afterBytes;
    if (delta > 0) return delta;
    return freedApk > 0 ? freedApk : 0;
  }
}
