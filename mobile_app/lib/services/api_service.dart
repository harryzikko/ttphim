import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/movie.dart';
import '../models/movie_detail.dart';

class ApiService {
  static const String baseUrl = 'https://phimapi.com';
  static final http.Client _client = http.Client();

  /// Helper to safely parse movie list from varying PhimAPI response shapes
  static List<Movie> _parseMovieList(dynamic jsonBody) {
    if (jsonBody is! Map<String, dynamic>) return [];

    List<dynamic>? items;
    if (jsonBody['items'] is List) {
      items = jsonBody['items'];
    } else if (jsonBody['data'] is Map && jsonBody['data']['items'] is List) {
      items = jsonBody['data']['items'];
    }

    if (items == null) return [];

    return items
        .whereType<Map<String, dynamic>>()
        .map((m) => Movie.fromJson(m))
        .toList();
  }

  /// Get newest updated movies (Trang Chủ)
  static Future<List<Movie>> getNewMovies({int page = 1}) async {
    try {
      final uri = Uri.parse('$baseUrl/danh-sach/phim-moi-cap-nhat?page=$page');
      final res = await _client.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        return _parseMovieList(data);
      }
    } catch (e) {
      // Return empty list on failure
    }
    return [];
  }

  /// Get Single Movies (Phim Lẻ)
  static Future<List<Movie>> getSingleMovies({int page = 1}) async {
    try {
      final uri = Uri.parse('$baseUrl/v1/api/danh-sach/phim-le?page=$page');
      final res = await _client.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        return _parseMovieList(data);
      }
    } catch (e) {}
    return [];
  }

  /// Get TV Series (Phim Bộ)
  static Future<List<Movie>> getSeriesMovies({int page = 1}) async {
    try {
      final uri = Uri.parse('$baseUrl/v1/api/danh-sach/phim-bo?page=$page');
      final res = await _client.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        return _parseMovieList(data);
      }
    } catch (e) {}
    return [];
  }

  /// Get Anime & Animation (Hoạt Hình)
  static Future<List<Movie>> getAnimeMovies({int page = 1}) async {
    try {
      final uri = Uri.parse('$baseUrl/v1/api/danh-sach/hoat-hinh?page=$page');
      final res = await _client.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        return _parseMovieList(data);
      }
    } catch (e) {}
    return [];
  }

  /// Get TV Shows
  static Future<List<Movie>> getTvShows({int page = 1}) async {
    try {
      final uri = Uri.parse('$baseUrl/v1/api/danh-sach/tv-shows?page=$page');
      final res = await _client.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        return _parseMovieList(data);
      }
    } catch (e) {}
    return [];
  }

  /// Search movies by keyword
  static Future<List<Movie>> searchMovies(String keyword, {int page = 1}) async {
    if (keyword.trim().isEmpty) return [];
    try {
      final encoded = Uri.encodeComponent(keyword.trim());
      final uri = Uri.parse('$baseUrl/v1/api/tim-kiem?keyword=$encoded&page=$page');
      final res = await _client.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        return _parseMovieList(data);
      }
    } catch (e) {}
    return [];
  }

  /// Get movies by category slug
  static Future<List<Movie>> getMoviesByCategory(String categorySlug, {int page = 1}) async {
    try {
      final uri = Uri.parse('$baseUrl/v1/api/the-loai/$categorySlug?page=$page');
      final res = await _client.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        return _parseMovieList(data);
      }
    } catch (e) {}
    return [];
  }

  /// Get movies by country slug
  static Future<List<Movie>> getMoviesByCountry(String countrySlug, {int page = 1}) async {
    try {
      final uri = Uri.parse('$baseUrl/v1/api/quoc-gia/$countrySlug?page=$page');
      final res = await _client.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        return _parseMovieList(data);
      }
    } catch (e) {}
    return [];
  }

  /// Get complete movie details & streaming episodes
  static Future<MovieDetailResponse?> getMovieDetail(String slug) async {
    try {
      final uri = Uri.parse('$baseUrl/phim/$slug');
      final res = await _client.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        if (data is Map<String, dynamic> && data['status'] == true) {
          return MovieDetailResponse.fromJson(data);
        }
      }
    } catch (e) {}
    return null;
  }
}
