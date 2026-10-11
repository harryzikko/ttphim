import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/movie.dart';
import 'session_service.dart';
import 'backend_service.dart';
import 'app_config.dart';

class WatchHistoryItem {
  final String movieSlug, movieName, posterUrl, serverName, episodeName, episodeSlug;
  final int positionSeconds, durationSeconds;
  final DateTime updatedAt;
  WatchHistoryItem({required this.movieSlug, required this.movieName, required this.posterUrl,
    required this.serverName, required this.episodeName, required this.episodeSlug,
    required this.positionSeconds, required this.durationSeconds, required this.updatedAt});
  double get progressPercentage => durationSeconds <= 0 ? 0 : (positionSeconds / durationSeconds).clamp(0.0, 1.0);
  Map<String, dynamic> toJson() => {
    'movie_slug': movieSlug, 'movie_name': movieName, 'poster_url': posterUrl,
    'server_name': serverName, 'episode_name': episodeName, 'episode_slug': episodeSlug,
    'position_seconds': positionSeconds, 'duration_seconds': durationSeconds, 'updated_at': updatedAt.toIso8601String(),
  };
  Map<String, dynamic> toBackend() => {...toJson(), 'current_time': positionSeconds, 'duration': durationSeconds};
  factory WatchHistoryItem.fromJson(Map<String, dynamic> value) {
    int number(dynamic input) => num.tryParse(input?.toString() ?? '')?.round() ?? 0;
    return WatchHistoryItem(movieSlug: value['movie_slug']?.toString() ?? '', movieName: value['movie_name']?.toString() ?? '',
      posterUrl: (value['poster_url'] ?? value['thumb_url'])?.toString() ?? '', serverName: value['server_name']?.toString() ?? '',
      episodeName: value['episode_name']?.toString() ?? '', episodeSlug: value['episode_slug']?.toString() ?? '',
      positionSeconds: number(value['position_seconds'] ?? value['current_time']),
      durationSeconds: number(value['duration_seconds'] ?? value['duration']),
      updatedAt: DateTime.tryParse(value['updated_at']?.toString() ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0));
  }
}

class StorageService {
  static Future<void> saveSession(String token, Map<String, dynamic> user) => SessionService.save(token, user);
  static Future<String?> getToken() => SessionService.getToken();
  static Future<Map<String, dynamic>?> getUser() => SessionService.getUser();
  static Future<void> clearSession() => SessionService.clear();
  static Future<bool> getAutoNext() async => (await SharedPreferences.getInstance()).getBool('ttphim_auto_next') ?? true;
  static Future<void> setAutoNext(bool enabled) async => (await SharedPreferences.getInstance()).setBool('ttphim_auto_next', enabled);

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
    final scope = await _scope();
    final token = await getToken();
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
    final token = await getToken();
    final prefs = await SharedPreferences.getInstance();
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
    final local = _read(prefs, key);
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
      merged[item.movieSlug] = item;
    }
    if (hasRemote) {
      for (final raw in (library!['history'] as List).whereType<Map<String, dynamic>>()) {
        final item = WatchHistoryItem.fromJson(raw);
        if (merged[item.movieSlug] == null || item.updatedAt.isAfter(merged[item.movieSlug]!.updatedAt)) merged[item.movieSlug] = item;
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
  static Future<void> clearHistory() async {
    final scope = await _scope();
    if (scope != 'guest' && AppConfig.hasBackend) {
      final response = await BackendService.request('/api/user/history/clear', body: {});
      if (response?['status'] != true) throw StateError(response?['message']?.toString() ?? 'Không thể xóa lịch sử');
    }
    await (await SharedPreferences.getInstance()).remove(_key('history', scope));
  }
}
