import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/movie.dart';

class WatchHistoryItem {
  final String movieSlug;
  final String movieName;
  final String posterUrl;
  final String serverName;
  final String episodeName;
  final String episodeSlug;
  final int positionSeconds;
  final int durationSeconds;
  final DateTime updatedAt;

  WatchHistoryItem({
    required this.movieSlug,
    required this.movieName,
    required this.posterUrl,
    required this.serverName,
    required this.episodeName,
    required this.episodeSlug,
    required this.positionSeconds,
    required this.durationSeconds,
    required this.updatedAt,
  });

  double get progressPercentage {
    if (durationSeconds <= 0) return 0.0;
    final pct = positionSeconds / durationSeconds;
    return pct.clamp(0.0, 1.0);
  }

  Map<String, dynamic> toJson() => {
    'movie_slug': movieSlug,
    'movie_name': movieName,
    'poster_url': posterUrl,
    'server_name': serverName,
    'episode_name': episodeName,
    'episode_slug': episodeSlug,
    'position_seconds': positionSeconds,
    'duration_seconds': durationSeconds,
    'updated_at': updatedAt.toIso8601String(),
  };

  factory WatchHistoryItem.fromJson(Map<String, dynamic> json) => WatchHistoryItem(
    movieSlug: json['movie_slug'] ?? '',
    movieName: json['movie_name'] ?? '',
    posterUrl: json['poster_url'] ?? '',
    serverName: json['server_name'] ?? 'Server 1',
    episodeName: json['episode_name'] ?? 'Tập 1',
    episodeSlug: json['episode_slug'] ?? '',
    positionSeconds: json['position_seconds'] ?? 0,
    durationSeconds: json['duration_seconds'] ?? 0,
    updatedAt: json['updated_at'] != null
        ? DateTime.tryParse(json['updated_at']) ?? DateTime.now()
        : DateTime.now(),
  );
}

class StorageService {
  static const String _keyFavorites = 'ttphim_favorites_v1';
  static const String _keyHistory = 'ttphim_history_v1';

  /// Toggle or set favorite
  static Future<bool> toggleFavorite(Movie movie) async {
    final prefs = await SharedPreferences.getInstance();
    List<String> rawList = prefs.getStringList(_keyFavorites) ?? [];
    
    int existingIndex = -1;
    for (int i = 0; i < rawList.length; i++) {
      try {
        final decoded = json.decode(rawList[i]);
        if (decoded['slug'] == movie.slug) {
          existingIndex = i;
          break;
        }
      } catch (_) {}
    }

    if (existingIndex >= 0) {
      rawList.removeAt(existingIndex);
      await prefs.setStringList(_keyFavorites, rawList);
      return false; // Removed
    } else {
      rawList.insert(0, json.encode(movie.toJson()));
      await prefs.setStringList(_keyFavorites, rawList);
      return true; // Added
    }
  }

  /// Check if movie is favorited
  static Future<bool> isFavorite(String slug) async {
    final prefs = await SharedPreferences.getInstance();
    List<String> rawList = prefs.getStringList(_keyFavorites) ?? [];
    for (var raw in rawList) {
      try {
        final decoded = json.decode(raw);
        if (decoded['slug'] == slug) return true;
      } catch (_) {}
    }
    return false;
  }

  /// Get all favorites
  static Future<List<Movie>> getFavorites() async {
    final prefs = await SharedPreferences.getInstance();
    List<String> rawList = prefs.getStringList(_keyFavorites) ?? [];
    List<Movie> list = [];
    for (var raw in rawList) {
      try {
        final decoded = json.decode(raw);
        list.add(Movie.fromJson(decoded));
      } catch (_) {}
    }
    return list;
  }

  /// Save playback history progress
  static Future<void> saveHistory(WatchHistoryItem item) async {
    final prefs = await SharedPreferences.getInstance();
    List<String> rawList = prefs.getStringList(_keyHistory) ?? [];
    
    // Remove if already exists for this movie
    rawList.removeWhere((raw) {
      try {
        final decoded = json.decode(raw);
        return decoded['movie_slug'] == item.movieSlug;
      } catch (_) {
        return false;
      }
    });

    rawList.insert(0, json.encode(item.toJson()));
    // Keep max 50 items
    if (rawList.length > 50) {
      rawList = rawList.sublist(0, 50);
    }
    await prefs.setStringList(_keyHistory, rawList);
  }

  /// Get watch history
  static Future<List<WatchHistoryItem>> getHistory() async {
    final prefs = await SharedPreferences.getInstance();
    List<String> rawList = prefs.getStringList(_keyHistory) ?? [];
    List<WatchHistoryItem> list = [];
    for (var raw in rawList) {
      try {
        final decoded = json.decode(raw);
        list.add(WatchHistoryItem.fromJson(decoded));
      } catch (_) {}
    }
    return list;
  }

  /// Get watch history for a specific movie
  static Future<WatchHistoryItem?> getHistoryForMovie(String movieSlug) async {
    final list = await getHistory();
    for (var item in list) {
      if (item.movieSlug == movieSlug) {
        return item;
      }
    }
    return null;
  }

  /// Get set of watched episode slugs for a movie
  static Future<Set<String>> getWatchedEpisodes(String movieSlug) async {
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList('ttphim_watched_${movieSlug}') ?? [];
    return list.toSet();
  }

  /// Mark an episode as watched
  static Future<void> markEpisodeWatched(String movieSlug, String episodeSlug) async {
    if (episodeSlug.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    final key = 'ttphim_watched_${movieSlug}';
    final list = prefs.getStringList(key) ?? [];
    if (!list.contains(episodeSlug)) {
      list.add(episodeSlug);
      await prefs.setStringList(key, list);
    }
  }

  /// Clear all history
  static Future<void> clearHistory() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyHistory);
  }
}
