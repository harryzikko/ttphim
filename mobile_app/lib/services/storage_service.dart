import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/movie.dart';
import 'session_service.dart';
import 'backend_service.dart';
import 'app_config.dart';

class WatchHistoryItem {
  final String movieSlug, movieName, posterUrl, thumbUrl, serverName, episodeName, episodeSlug;
  final int positionSeconds, durationSeconds;
  final DateTime updatedAt;

  WatchHistoryItem({
    required this.movieSlug,
    required this.movieName,
    required this.posterUrl,
    this.thumbUrl = '',
    required this.serverName,
    required this.episodeName,
    required this.episodeSlug,
    required this.positionSeconds,
    required this.durationSeconds,
    required this.updatedAt,
  });

  double get progressPercentage => durationSeconds <= 0 ? 0 : (positionSeconds / durationSeconds).clamp(0.0, 1.0);

  /// Get the best 16:9 landscape image URL for cards, falling back to poster
  String get bestImageUrl {
    final url = thumbUrl.isNotEmpty ? thumbUrl : posterUrl;
    if (url.isEmpty) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    final clean = url.startsWith('/') ? url.substring(1) : url;
    return 'https://phimimg.com/$clean';
  }

  /// Format friendly remaining watch time (e.g. "Còn 24 phút" or "Đã xem 65%")
  String get remainingTimeText {
    if (durationSeconds > positionSeconds && positionSeconds > 0) {
      final mins = ((durationSeconds - positionSeconds) / 60).ceil();
      if (mins > 0) return 'Còn $mins phút';
    }
    if (progressPercentage > 0) {
      return 'Đã xem ${(progressPercentage * 100).round()}%';
    }
    return episodeName.isNotEmpty ? episodeName : serverName;
  }

  Map<String, dynamic> toJson() => {
    'movie_slug': movieSlug,
    'movie_name': movieName,
    'poster_url': posterUrl,
    'thumb_url': thumbUrl,
    'server_name': serverName,
    'episode_name': episodeName,
    'episode_slug': episodeSlug,
    'position_seconds': positionSeconds,
    'duration_seconds': durationSeconds,
    'updated_at': updatedAt.toIso8601String(),
  };

  Map<String, dynamic> toBackend() => {
    ...toJson(),
    'current_time': positionSeconds,
    'duration': durationSeconds,
  };

  factory WatchHistoryItem.fromJson(Map<String, dynamic> value) {
    int number(dynamic input) => num.tryParse(input?.toString() ?? '')?.round() ?? 0;
    final pUrl = value['poster_url']?.toString() ?? '';
    final tUrl = value['thumb_url']?.toString() ?? '';
    return WatchHistoryItem(
      movieSlug: value['movie_slug']?.toString() ?? '',
      movieName: value['movie_name']?.toString() ?? '',
      posterUrl: pUrl.isNotEmpty ? pUrl : tUrl,
      thumbUrl: tUrl.isNotEmpty ? tUrl : pUrl,
      serverName: value['server_name']?.toString() ?? '',
      episodeName: value['episode_name']?.toString() ?? '',
      episodeSlug: value['episode_slug']?.toString() ?? '',
      positionSeconds: number(value['position_seconds'] ?? value['current_time']),
      durationSeconds: number(value['duration_seconds'] ?? value['duration']),
      updatedAt: DateTime.tryParse(value['updated_at']?.toString() ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0),
    );
  }
}

class StorageService {
  static Future<void> saveSession(String token, Map<String, dynamic> user) => SessionService.save(token, user);
  static Future<String?> getToken() => SessionService.getToken();
  static Future<Map<String, dynamic>?> getUser() => SessionService.getUser();
  static Future<void> clearSession() => SessionService.clear();
  static Future<bool> getAutoNext() async => (await SharedPreferences.getInstance()).getBool('ttphim_auto_next') ?? true;
  static Future<void> setAutoNext(bool enabled) async => (await SharedPreferences.getInstance()).setBool('ttphim_auto_next', enabled);
  static Future<String?> getCustomServerUrl() async => (await SharedPreferences.getInstance()).getString('ttphim_custom_server_url');
  static Future<void> setCustomServerUrl(String? url) async {
    final prefs = await SharedPreferences.getInstance();
    if (url == null || url.trim().isEmpty) {
      await prefs.remove('ttphim_custom_server_url');
      AppConfig.setCustomUrl(null);
    } else {
      final clean = url.trim().replaceAll(RegExp(r'/+$'), '');
      await prefs.setString('ttphim_custom_server_url', clean);
      AppConfig.setCustomUrl(clean);
    }
  }

  static Future<String> _scope() async => (await getUser())?['id']?.toString() ?? 'guest';
  static String _key(String name, String scope) => scope == 'guest' ? 'ttphim_${name}_v1' : 'ttphim_${name}_user_$scope';
  static List<Map<String, dynamic>> _read(SharedPreferences prefs, String key) {
    final result = <Map<String, dynamic>>[];
    for (final raw in prefs.getStringList(key) ?? <String>[]) {
      try { final item = json.decode(raw); if (item is Map<String, dynamic>) result.add(item); }
      on FormatException { /* Skip corrupt cached entries. */ }
    }
    return result;
  }
  static Future<void> _write(SharedPreferences prefs, String key, Iterable<Map<String, dynamic>> values) async {
    await prefs.setStringList(key, values.map((item) => json.encode(item)).toList());
  }
  static Future<Map<String, dynamic>?> _library(String scope) async {
    if (scope == 'guest' || !AppConfig.hasBackend) return null;
    if (await _scope() != scope) return null;
    final token = await getToken();
    try {
      final response = await BackendService.request('/api/user/library', token: token);
      if (await _scope() != scope) return null;
      if (response?['status'] == true && response?['data'] is Map<String, dynamic>) return response!['data'] as Map<String, dynamic>;
    } catch (_) { /* Keep account-local cache available while offline. */ }
    return null;
  }

  static Future<bool> toggleFavorite(Movie movie) async {
    final token = await getToken();
    if (token == null) {
      throw StateError('Vui lòng đăng nhập để lưu phim yêu thích');
    }
    final scope = await _scope();
    final prefs = await SharedPreferences.getInstance();
    final key = _key('favorites', scope);
    final items = _read(prefs, key);
    bool added;
    if (scope != 'guest' && AppConfig.hasBackend) {
      final response = await BackendService.request('/api/user/watchlist/toggle', token: token, body: {
        'movie_slug': movie.slug, 'movie_name': movie.name, 'origin_name': movie.originName,
        'poster_url': movie.fullPosterUrl, 'thumb_url': movie.fullThumbUrl, 'year': movie.year,
        'quality': movie.quality, 'lang': movie.lang,
      });
      if (response?['status'] != true) throw StateError(response?['message']?.toString() ?? 'Không thể cập nhật yêu thích');
      added = response!['data']['added'] == true;
    } else { added = !items.any((item) => item['slug'] == movie.slug); }
    items.removeWhere((item) => item['slug'] == movie.slug);
    if (added) items.insert(0, movie.toJson());
    await _write(prefs, key, items);
    return added;
  }

  static Future<bool> isFavorite(String slug) async => (await getFavorites()).any((movie) => movie.slug == slug);
  static Future<List<Movie>> getFavorites() async {
    final token = await getToken();
    if (token == null) return [];
    final scope = await _scope();
    // Re-check account after the network request, not just before it.
    final prefs = await SharedPreferences.getInstance();
    final key = _key('favorites', scope);
    final library = await _library(scope);
    if (await _scope() != scope) return getFavorites();
    if (library?['watchlist'] is List) {
      final movies = (library!['watchlist'] as List).whereType<Map<String, dynamic>>().map((item) => Movie.fromJson({
        ...item, 'slug': item['movie_slug'], 'name': item['movie_name'],
      })).toList();
      await _write(prefs, key, movies.map((movie) => movie.toJson()));
      return movies;
    }
    return _read(prefs, key).map(Movie.fromJson).toList();
  }

  static Future<void> saveHistory(WatchHistoryItem item) async {
    final scope = await _scope();
    final prefs = await SharedPreferences.getInstance();

    // Revive from deleted tombstone if user watches again
    final tombstoneKey = _key('deleted_history', scope);
    final deleted = (prefs.getStringList(tombstoneKey) ?? <String>[]).toSet();
    if (deleted.remove(item.movieSlug)) {
      await prefs.setStringList(tombstoneKey, deleted.toList());
    }

    final token = await getToken();
    final key = _key('history', scope);
    final items = _read(prefs, key)..removeWhere((entry) => entry['movie_slug'] == item.movieSlug);
    items.insert(0, {...item.toJson(), if (scope != 'guest') 'pending_sync': true});
    await _write(prefs, key, items.take(100));
    if (scope != 'guest' && AppConfig.hasBackend) {
      try {
        final response = await BackendService.request('/api/user/history', token: token, body: item.toBackend());
        if (response?['status'] == true) {
          final current = _read(prefs, key);
          for (final entry in current) {
            if (entry['movie_slug'] == item.movieSlug && entry['updated_at'] == item.updatedAt.toIso8601String()) entry.remove('pending_sync');
          }
          await _write(prefs, key, current);
        }
      } catch (_) { /* Retry account-local progress when connectivity returns. */ }
    }
  }

  static Future<List<WatchHistoryItem>> getHistory() async {
    final scope = await _scope();
    final prefs = await SharedPreferences.getInstance();
    final key = _key('history', scope);
    final tombstoneKey = _key('deleted_history', scope);
    final deleted = (prefs.getStringList(tombstoneKey) ?? <String>[]).toSet();

    final local = _read(prefs, key);
    local.removeWhere((entry) => deleted.contains(entry['movie_slug']));

    final token = await getToken();
    if (scope != 'guest' && AppConfig.hasBackend) {
      for (final raw in local.where((entry) => entry['pending_sync'] == true)) {
        if (await _scope() != scope) return getHistory();
        try {
          final response = await BackendService.request('/api/user/history', token: token, body: WatchHistoryItem.fromJson(raw).toBackend());
          if (response?['status'] == true) raw.remove('pending_sync');
        } catch (_) { /* Keep progress pending while offline. */ }
      }
      await _write(prefs, key, local);
    }
    final library = await _library(scope);
    if (await _scope() != scope) return getHistory();
    final merged = <String, WatchHistoryItem>{};
    final hasRemote = library?['history'] is List;
    for (final raw in local.where((entry) => !hasRemote || entry['pending_sync'] == true)) {
      final item = WatchHistoryItem.fromJson(raw);
      if (!deleted.contains(item.movieSlug)) {
        merged[item.movieSlug] = item;
      }
    }
    if (hasRemote) {
      for (final raw in (library!['history'] as List).whereType<Map<String, dynamic>>()) {
        final item = WatchHistoryItem.fromJson(raw);
        if (!deleted.contains(item.movieSlug)) {
          if (merged[item.movieSlug] == null || item.updatedAt.isAfter(merged[item.movieSlug]!.updatedAt)) {
            merged[item.movieSlug] = item;
          }
        }
      }
    }
    final items = merged.values.toList()..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    final pendingSlugs = local.where((entry) => entry['pending_sync'] == true).map((entry) => entry['movie_slug']).toSet();
    await _write(prefs, key, items.take(100).map((item) => {...item.toJson(), if (pendingSlugs.contains(item.movieSlug)) 'pending_sync': true}));
    return items;
  }

  static Future<WatchHistoryItem?> getHistoryForMovie(String slug) async {
    for (final item in await getHistory()) { if (item.movieSlug == slug) return item; }
    return null;
  }

  static Future<Set<String>> getWatchedEpisodes(String slug) async {
    final prefs = await SharedPreferences.getInstance();
    final scope = await _scope();
    return (prefs.getStringList(_key('watched_$slug', scope)) ?? []).toSet();
  }

  static Future<void> markEpisodeWatched(String slug, String episode) async {
    if (episode.isEmpty) return;
    final scope = await _scope();
    final prefs = await SharedPreferences.getInstance();
    final key = _key('watched_$slug', scope);
    final entries = (prefs.getStringList(key) ?? []).toSet()..add(episode);
    await prefs.setStringList(key, entries.toList());
  }

  static Future<void> removeHistoryItem(String slug) async {
    final scope = await _scope();
    final prefs = await SharedPreferences.getInstance();
    final key = _key('history', scope);
    final items = _read(prefs, key)..removeWhere((entry) => entry['movie_slug'] == slug);
    await _write(prefs, key, items);

    // Save tombstone in deleted_history to prevent remote re-merge resurrection
    final tombstoneKey = _key('deleted_history', scope);
    final deleted = (prefs.getStringList(tombstoneKey) ?? <String>[]).toSet()..add(slug);
    await prefs.setStringList(tombstoneKey, deleted.toList());

    if (scope != 'guest' && AppConfig.hasBackend) {
      try {
        final token = await getToken();
        await BackendService.request('/api/user/history/remove', token: token, body: {'movie_slug': slug});
      } catch (_) { /* Offline tombstone preserves deletion. */ }
    }
  }

  static Future<void> clearHistory() async {
    final scope = await _scope();
    final token = await getToken();
    if (scope != 'guest' && AppConfig.hasBackend) {
      final response = await BackendService.request('/api/user/history/clear', token: token, body: {});
      if (response?['status'] != true) throw StateError(response?['message']?.toString() ?? 'Không thể xóa lịch sử');
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key('history', scope));
    await prefs.remove(_key('deleted_history', scope));
  }
}
