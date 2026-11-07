import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
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
  static const String _storageKey = 'cineviet_downloaded_episodes';
  static const String _legacyStorageKey = 'ttphim_downloaded_episodes';
  static final ChangeNotifier changes = ChangeNotifier();
  static final Map<String, double> activeDownloadProgress = {};
  static final Set<String> _canceledDownloads = {};
  static http.Client _client = http.Client();

  @visibleForTesting
  static void setClientForTesting(http.Client client) {
    _client = client;
  }

  /// Checks if an episode can be downloaded offline
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
      final raw = prefs.getString(_storageKey) ?? prefs.getString(_legacyStorageKey);
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

  static String _resolveUrl(String baseUrl, String relativeOrAbsolute) {
    final trimmed = relativeOrAbsolute.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    final baseUri = Uri.parse(baseUrl);
    if (trimmed.startsWith('/')) {
      return '${baseUri.scheme}://${baseUri.host}$trimmed';
    }
    final lastSlash = baseUrl.lastIndexOf('/');
    final baseDir = lastSlash >= 0 ? baseUrl.substring(0, lastSlash + 1) : '$baseUrl/';
    return '$baseDir$trimmed';
  }

  /// Download an episode for offline playback (supports direct MP4 & HLS chunk merging)
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
    _canceledDownloads.remove(downloadKey);
    activeDownloadProgress[downloadKey] = 0.02;
    changes.notifyListeners();

    IOSink? sink;
    File? outputFile;

    try {
      final docDir = await getApplicationDocumentsDirectory();
      final downloadsDir = Directory('${docDir.path}/cineviet_downloads');
      if (!await downloadsDir.exists()) {
        await downloadsDir.create(recursive: true);
      }

      // Check if target stream is HLS M3U8
      if (streamUrl.contains('.m3u8')) {
        // Step 1: Fetch master or variant playlist
        final playlistRes = await _client.get(
          Uri.parse(streamUrl),
          headers: const {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://phimapi.com/',
          },
        ).timeout(const Duration(seconds: 15));

        if (playlistRes.statusCode != 200) {
          throw StateError('Không thể tải danh sách phát HLS (HTTP ${playlistRes.statusCode})');
        }

        var playlistBody = playlistRes.body;
        var mediaPlaylistUrl = streamUrl;

        // If this is a master playlist, find variant with highest bandwidth
        if (playlistBody.contains('#EXT-X-STREAM-INF:')) {
          final lines = playlistBody.split(RegExp(r'\r?\n'));
          String? bestVariant;
          for (int i = 0; i < lines.length; i++) {
            final line = lines[i].trim();
            if (line.startsWith('#EXT-X-STREAM-INF:') && i + 1 < lines.length) {
              final nextLine = lines[i + 1].trim();
              if (nextLine.isNotEmpty && !nextLine.startsWith('#')) {
                bestVariant = nextLine;
                break;
              }
            }
          }
          if (bestVariant != null) {
            mediaPlaylistUrl = _resolveUrl(streamUrl, bestVariant);
            final mediaRes = await _client.get(
              Uri.parse(mediaPlaylistUrl),
              headers: const {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://phimapi.com/',
              },
            ).timeout(const Duration(seconds: 15));
            if (mediaRes.statusCode == 200) {
              playlistBody = mediaRes.body;
            }
          }
        }

        // Step 2: Extract all .ts video chunks
        final segmentUrls = <String>[];
        final mediaLines = playlistBody.split(RegExp(r'\r?\n'));
        for (final rawLine in mediaLines) {
          final line = rawLine.trim();
          if (line.isNotEmpty && !line.startsWith('#')) {
            segmentUrls.add(_resolveUrl(mediaPlaylistUrl, line));
          }
        }

        if (segmentUrls.isEmpty) {
          throw StateError('Không tìm thấy phân đoạn video nào trong luồng phát.');
        }

        outputFile = File('${downloadsDir.path}/${movie.slug}_${episode.slug}.ts');
        sink = outputFile.openWrite();

        // Step 3: Stream segments and append into single TS video file
        final total = segmentUrls.length;
        for (int i = 0; i < total; i++) {
          if (_canceledDownloads.contains(downloadKey)) {
            throw StateError('Đã hủy tải phim.');
          }

          final segUrl = segmentUrls[i];
          final segRes = await _client.get(
            Uri.parse(segUrl),
            headers: const {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          ).timeout(const Duration(seconds: 25));

          if (segRes.statusCode == 200) {
            sink.add(segRes.bodyBytes);
          }

          final progress = ((i + 1) / total).clamp(0.05, 0.99);
          activeDownloadProgress[downloadKey] = progress;
          onProgress?.call(progress);
          changes.notifyListeners();
        }

        await sink.flush();
        await sink.close();
        sink = null;
      } else {
        // Direct MP4 file download
        outputFile = File('${downloadsDir.path}/${movie.slug}_${episode.slug}.mp4');
        sink = outputFile.openWrite();

        final req = http.Request('GET', Uri.parse(streamUrl));
        final streamedRes = await _client.send(req).timeout(const Duration(seconds: 15));
        final totalBytes = streamedRes.contentLength ?? 0;
        int receivedBytes = 0;

        await for (final chunk in streamedRes.stream) {
          if (_canceledDownloads.contains(downloadKey)) {
            throw StateError('Đã hủy tải phim.');
          }
          sink.add(chunk);
          receivedBytes += chunk.length;
          if (totalBytes > 0) {
            final progress = (receivedBytes / totalBytes).clamp(0.05, 0.99);
            activeDownloadProgress[downloadKey] = progress;
            onProgress?.call(progress);
            changes.notifyListeners();
          }
        }

        await sink.flush();
        await sink.close();
        sink = null;
      }

      final fileSizeBytes = await outputFile.length();

      final downloaded = DownloadedEpisode(
        movieSlug: movie.slug,
        movieName: movie.name,
        posterUrl: movie.posterUrl,
        thumbUrl: movie.thumbUrl,
        serverName: server.serverName,
        episodeName: episode.name,
        episodeSlug: episode.slug,
        downloadUrl: streamUrl,
        localFilePath: outputFile.path,
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
      if (sink != null) {
        try { await sink.close(); } catch (_) {}
      }
      if (outputFile != null && await outputFile.exists()) {
        try { await outputFile.delete(); } catch (_) {}
      }
      activeDownloadProgress.remove(downloadKey);
      changes.notifyListeners();
      rethrow;
    }
  }

  /// Remove a downloaded episode
  static Future<void> removeDownload(String movieSlug, String episodeSlug) async {
    final downloadKey = '${movieSlug}_$episodeSlug';
    _canceledDownloads.add(downloadKey);
    activeDownloadProgress.remove(downloadKey);

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
      final docDir = await getApplicationDocumentsDirectory();
      final downloadsDir = Directory('${docDir.path}/cineviet_downloads');
      if (await downloadsDir.exists()) {
        await downloadsDir.delete(recursive: true);
      }
    } catch (_) {}

    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_storageKey);
    await prefs.remove(_legacyStorageKey);
    changes.notifyListeners();
  }
}
