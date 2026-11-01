import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter_cache_manager/flutter_cache_manager.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/movie.dart';
import '../models/movie_detail.dart';

class DownloadedEpisode {
  final String movieSlug;
  final String movieName;
  final String posterUrl;
  final String thumbUrl;
  final String serverName;
  final String episodeName;
  final String episodeSlug;
  final String downloadUrl;
  final String localFilePath;
  final int fileSizeBytes;
  final DateTime downloadedAt;
  final bool isCompleted;

  DownloadedEpisode({
    required this.movieSlug,
    required this.movieName,
    required this.posterUrl,
    this.thumbUrl = '',
    required this.serverName,
    required this.episodeName,
    required this.episodeSlug,
    required this.downloadUrl,
    required this.localFilePath,
    required this.fileSizeBytes,
    required this.downloadedAt,
    this.isCompleted = true,
  });

  String get formattedSize {
    if (fileSizeBytes <= 0) return 'Không xác định';
    if (fileSizeBytes < 1024 * 1024) {
      return '${(fileSizeBytes / 1024).toStringAsFixed(1)} KB';
    }
    return '${(fileSizeBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  Map<String, dynamic> toJson() => {
    'movie_slug': movieSlug,
    'movie_name': movieName,
    'poster_url': posterUrl,
    'thumb_url': thumbUrl,
    'server_name': serverName,
    'episode_name': episodeName,
    'episode_slug': episodeSlug,
    'download_url': downloadUrl,
    'local_file_path': localFilePath,
    'file_size_bytes': fileSizeBytes,
    'downloaded_at': downloadedAt.toIso8601String(),
    'is_completed': isCompleted,
  };

  factory DownloadedEpisode.fromJson(Map<String, dynamic> json) => DownloadedEpisode(
    movieSlug: json['movie_slug']?.toString() ?? '',
    movieName: json['movie_name']?.toString() ?? '',
    posterUrl: json['poster_url']?.toString() ?? '',
    thumbUrl: json['thumb_url']?.toString() ?? '',
    serverName: json['server_name']?.toString() ?? 'Server 1',
    episodeName: json['episode_name']?.toString() ?? 'Tập 1',
    episodeSlug: json['episode_slug']?.toString() ?? 'tap-1',
    downloadUrl: json['download_url']?.toString() ?? '',
    localFilePath: json['local_file_path']?.toString() ?? '',
    fileSizeBytes: (json['file_size_bytes'] is num) ? (json['file_size_bytes'] as num).toInt() : 0,
    downloadedAt: DateTime.tryParse(json['downloaded_at']?.toString() ?? '') ?? DateTime.now(),
    isCompleted: json['is_completed'] == true,
  );
}

class DownloadService {
  static const String _storageKey = 'ttphim_downloaded_episodes';
  static final ChangeNotifier changes = ChangeNotifier();
  static final Map<String, double> activeDownloadProgress = {};

  /// Checks if an episode can be downloaded offline
  /// True if direct HLS/M3U8 is available; False if only 3rd-party Embed iframe
  static bool canDownloadEpisode(EpisodeItem episode) {
    final m3u8 = episode.linkM3u8.trim();
    if (m3u8.isNotEmpty && (m3u8.startsWith('http://') || m3u8.startsWith('https://'))) {
      return true;
    }
    return false;
  }

  /// Checks if a server supports offline downloading
  static bool serverSupportsOffline(ServerItem server) {
    return server.episodes.any((ep) => canDownloadEpisode(ep));
  }

  /// Find an alternative server that has direct M3U8 for the given episode
  static ({ServerItem server, EpisodeItem episode})? findM3u8Alternative(
    List<ServerItem> servers,
    String episodeSlug,
  ) {
    for (final s in servers) {
      for (final ep in s.episodes) {
        if (ep.slug == episodeSlug && canDownloadEpisode(ep)) {
          return (server: s, episode: ep);
        }
      }
    }
    return null;
  }

  /// Retrieve all downloaded episodes from storage
  static Future<List<DownloadedEpisode>> getDownloads() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_storageKey);
      if (raw == null || raw.isEmpty) return [];

      final decoded = json.decode(raw);
      if (decoded is! List) return [];

      final list = <DownloadedEpisode>[];
      for (final item in decoded) {
        if (item is Map<String, dynamic>) {
          final ep = DownloadedEpisode.fromJson(item);
          list.add(ep);
        }
      }
      return list;
    } catch (_) {
      return [];
    }
  }

  /// Check if a specific episode is already downloaded
  static Future<bool> isEpisodeDownloaded(String movieSlug, String episodeSlug) async {
    final all = await getDownloads();
    return all.any((item) => item.movieSlug == movieSlug && item.episodeSlug == episodeSlug && item.isCompleted);
  }

  /// Get the downloaded item for playback
  static Future<DownloadedEpisode?> getDownloadedEpisode(String movieSlug, String episodeSlug) async {
    final all = await getDownloads();
    for (final item in all) {
      if (item.movieSlug == movieSlug && item.episodeSlug == episodeSlug && item.isCompleted) {
        return item;
      }
    }
    return null;
  }

  /// Download an episode for offline playback
  static Future<DownloadedEpisode?> downloadEpisode({
    required Movie movie,
    required ServerItem server,
    required EpisodeItem episode,
    Function(double progress)? onProgress,
  }) async {
    final streamUrl = episode.linkM3u8.trim();
    if (streamUrl.isEmpty) {
      throw StateError('Nguồn phát Embed không hỗ trợ tải offline. Vui lòng chọn server HLS (M3U8).');
    }

    final downloadKey = '${movie.slug}_${episode.slug}';
    activeDownloadProgress[downloadKey] = 0.05;
    changes.notifyListeners();

    try {
      // Use DefaultCacheManager to download and cache the media stream locally
      final cacheManager = DefaultCacheManager();
      final fileInfo = await cacheManager.downloadFile(
        streamUrl,
        key: downloadKey,
      );

      final file = fileInfo.file;
      final fileSizeBytes = await file.length();

      final downloaded = DownloadedEpisode(
        movieSlug: movie.slug,
        movieName: movie.name,
        posterUrl: movie.posterUrl,
        thumbUrl: movie.thumbUrl,
        serverName: server.serverName,
        episodeName: episode.name,
        episodeSlug: episode.slug,
        downloadUrl: streamUrl,
        localFilePath: file.path,
        fileSizeBytes: fileSizeBytes,
        downloadedAt: DateTime.now(),
        isCompleted: true,
      );

      // Persist to SharedPreferences
      final all = await getDownloads();
      all.removeWhere((item) => item.movieSlug == movie.slug && item.episodeSlug == episode.slug);
      all.insert(0, downloaded);

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_storageKey, json.encode(all.map((e) => e.toJson()).toList()));

      activeDownloadProgress.remove(downloadKey);
      changes.notifyListeners();
      return downloaded;
    } catch (e) {
      activeDownloadProgress.remove(downloadKey);
      changes.notifyListeners();
      rethrow;
    }
  }

  /// Remove a downloaded episode
  static Future<void> removeDownload(String movieSlug, String episodeSlug) async {
    final all = await getDownloads();
    final targetIndex = all.indexWhere((item) => item.movieSlug == movieSlug && item.episodeSlug == episodeSlug);
    if (targetIndex >= 0) {
      final target = all[targetIndex];
      try {
        final file = File(target.localFilePath);
        if (await file.exists()) {
          await file.delete();
        }
      } catch (_) {}

      try {
        await DefaultCacheManager().removeFile('${movieSlug}_${episodeSlug}');
      } catch (_) {}

      all.removeAt(targetIndex);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_storageKey, json.encode(all.map((e) => e.toJson()).toList()));
      changes.notifyListeners();
    }
  }

  /// Clear all offline downloads
  static Future<void> clearAllDownloads() async {
    final all = await getDownloads();
    for (final item in all) {
      try {
        final file = File(item.localFilePath);
        if (await file.exists()) {
          await file.delete();
        }
      } catch (_) {}
    }
    try {
      await DefaultCacheManager().emptyCache();
    } catch (_) {}

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_storageKey);
    changes.notifyListeners();
  }
}
