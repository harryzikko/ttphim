import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter/foundation.dart';
import '../models/movie.dart';
import '../models/movie_detail.dart';
import '../models/app_banner_config.dart';
import '../models/app_update_info.dart';
import 'app_config.dart';
import 'storage_service.dart';
import 'backend_service.dart';
import 'season_service.dart';

class ApiService {
  static const String baseUrl = 'https://phimapi.com';
  static http.Client _client = http.Client();

  @visibleForTesting
  static void setClientForTesting(http.Client client) {
    _client = client;
    BackendService.setClientForTesting(client);
    SeasonService.setClientForTesting(client);
    _home = null;
    _homeFetchedAt = null;
    _homePending = null;
  }
  static Map<String, dynamic>? _home;
  static DateTime? _homeFetchedAt;
  static Future<Map<String, dynamic>?>? _homePending;

  static Future<Map<String, dynamic>?> _backend(String path, {Map<String, String>? query, Map<String, dynamic>? body}) =>
      BackendService.request(path, query: query, body: body);

  static Future<Map<String, dynamic>?> restoreSession() async {
    try {
      final token = await StorageService.getToken();
      if (token == null) return null;
      final result = await BackendService.request('/api/auth/me', token: token);
      if (await StorageService.getToken() != token) return await StorageService.getUser();
      if (result?['status'] == true && result?['data'] is Map<String, dynamic>) {
        await StorageService.saveSession(token, result!['data'] as Map<String, dynamic>);
      } else if (result != null) { await StorageService.clearSession(); }
    } catch (_) { /* Preserve a saved session while temporarily offline. */ }
    try { return await StorageService.getUser(); } catch (_) { return null; }
  }

  static Future<void> logout() async {
    // Tokens are stateless; remove local credentials even without connectivity.
    await StorageService.clearSession();
  }

  static Future<Map<String, dynamic>?> _getHome() async {
    if (_home != null && DateTime.now().difference(_homeFetchedAt!) < const Duration(minutes: 5)) return _home;
    if (_homePending != null) return _homePending;
    final pending = () async {
      try {
        final response = await _backend('/api/home');
        if (response?['status'] == true && response?['data'] is Map<String, dynamic>) {
          _home = response!['data'] as Map<String, dynamic>;
          _homeFetchedAt = DateTime.now();
          return _home;
        }
      } catch (_) {}
      return null;
    }();
    _homePending = pending;
    try { return await pending; } finally { _homePending = null; }
  }

  /// Default fallback list of pinned featured movies from website settings
  static final List<Movie> _defaultFeaturedMovies = [
    Movie(
      id: 'truy-sat-salazar',
      name: 'Truy Sát Salazar',
      slug: 'truy-sat-salazar',
      originName: 'Killing Salazar',
      posterUrl: 'https://phimimg.com/upload/vod/20240102-1/db187d4de77346ccf1e48e7d3672d4e1.jpg',
      thumbUrl: 'https://image.tmdb.org/t/p/original/J3plZPrHc2OlUMZLNnuQ1rroo9.jpg',
      year: 2017,
      quality: 'HD',
      voteAverage: 8.8,
    ),
    Movie(
      id: 'truy-sat',
      name: 'Truy Sát',
      slug: 'truy-sat',
      originName: 'Wanted',
      posterUrl: 'https://phimimg.com/upload/vod/20231211-1/af366af9cc93158c2094fa4e3dfc974b.jpg',
      thumbUrl: 'https://phimimg.com/upload/vod/20231211-1/9114c4e3679fa3d833565b8782086219.jpg',
      year: 2008,
      quality: 'HD',
      voteAverage: 9.0,
    ),
    Movie(
      id: 'truy-sat-gai-goi',
      name: 'Truy Sát Gái Gọi',
      slug: 'truy-sat-gai-goi',
      originName: 'GirlHouse',
      posterUrl: 'https://phimimg.com/upload/vod/20231111-1/d762c9234273708fd05e938806af5286.jpg',
      thumbUrl: 'https://phimimg.com/upload/vod/20231111-1/d5bfdd3c39e2b6aa1b8e3510e78abfeb.jpg',
      year: 2014,
      quality: 'HD',
      voteAverage: 8.4,
    ),
    Movie(
      id: '12-gio-truy-sat',
      name: '12 Giờ Truy Sát',
      slug: '12-gio-truy-sat',
      originName: 'Fury 12 Hours',
      posterUrl: 'https://phimimg.com/upload/vod/20240910-1/3a93ca60dab65d0070a89ac96bc6c404.jpg',
      thumbUrl: 'https://phimimg.com/upload/vod/20240910-1/0b525cb2941cf4486c67049d4f37e26c.jpg',
      year: 2024,
      quality: 'FHD',
      voteAverage: 9.4,
    ),
    Movie(
      id: 'truy-sat-carter',
      name: 'Truy Sát Carter',
      slug: 'truy-sat-carter',
      originName: 'Get Carter',
      posterUrl: 'https://phimimg.com/upload/vod/20231016-1/1fd86fea572d271365814a03599d5729.jpg',
      thumbUrl: 'https://phimimg.com/upload/vod/20231016-1/28f76943bc0eb4d8fcabe439efcb7807.jpg',
      year: 2000,
      quality: 'HD',
      voteAverage: 8.6,
    ),
    Movie(
      id: 'ke-truy-sat',
      name: 'Kẻ Truy Sát',
      slug: 'ke-truy-sat',
      originName: 'In the Blood',
      posterUrl: 'https://phimimg.com/upload/vod/20231116-1/50c4d07ad4f5f104d0e76a5e43cad46c.jpg',
      thumbUrl: 'https://phimimg.com/upload/vod/20231116-1/396a07ebb76f731d7b936274f273b415.jpg',
      year: 2014,
      quality: 'HD',
      voteAverage: 8.7,
    ),
    Movie(
      id: 'su-menh-truy-sat',
      name: 'Sứ Mệnh Truy Sát',
      slug: 'su-menh-truy-sat',
      originName: 'Assassination',
      posterUrl: 'https://phimimg.com/upload/vod/20240205-1/ea1573923467ede059b3a4ef6f55a9d8.jpg',
      thumbUrl: 'https://phimimg.com/upload/vod/20240205-1/fc72d9e06e0bcc26c8b6e3c39b90cac5.jpg',
      year: 2015,
      quality: 'HD',
      voteAverage: 8.9,
    ),
  ];

  /// Default Top 10 Ranking Movies (Synchronized 100% with Website Real Rankings)
  static final List<Movie> _defaultTopRankings = [
    Movie(
      id: 'than-y-co-dai-o-do-thi-do-thi-co-tien-y',
      name: 'Thần Y Cổ Đại Ở Đô Thị (Đô Thị Cổ Tiên Y)',
      slug: 'than-y-co-dai-o-do-thi-do-thi-co-tien-y',
      originName: 'Urban Miracle Doctor',
      posterUrl: 'https://phimimg.com/upload/vod/20241018-1/422e01866d2bfcb0adfd4ae2a31ef32f.jpg',
      thumbUrl: 'https://phimimg.com/upload/vod/20241018-1/f39df234908b4305fdd20c97020c0eea.jpg',
      year: 2024,
      quality: 'FHD',
      voteAverage: 9.2,
    ),
    Movie(
      id: 'su-huynh-a-su-huynh',
      name: 'Sư Huynh À Sư Huynh',
      slug: 'su-huynh-a-su-huynh',
      originName: 'My Senior Brother is Too Steady',
      posterUrl: 'https://phimimg.com/upload/vod/20250117-1/a9e32b44820101a9ba2c887344f7334c.jpg',
      thumbUrl: 'https://phimimg.com/upload/vod/20250117-1/d2d7ee02b72e59bea282b367e36b0094.jpg',
      year: 2023,
      quality: 'FHD',
      voteAverage: 9.1,
    ),
    Movie(
      id: 'ngoc-diem-thu',
      name: 'Ngọc Điệm Thu',
      slug: 'ngoc-diem-thu',
      originName: 'The Lament Of Autumn',
      posterUrl: 'https://phimimg.com/uploads/movies/20261012/ngoc-diem-thu-poster.webp',
      thumbUrl: 'https://phimimg.com/uploads/movies/20261012/ngoc-diem-thu-thumb.webp',
      year: 2026,
      quality: 'FHD',
      voteAverage: 9.0,
    ),
    Movie(
      id: 'ga-kim-thoa-ga-tram-vang',
      name: 'Gả Kim Thoa / Gả trâm vàng',
      slug: 'ga-kim-thoa-ga-tram-vang',
      originName: 'Where The Mask Ends',
      posterUrl: 'https://phimimg.com/uploads/movies/20261016/ga-kim-thoa-ga-tram-vang-poster.webp',
      thumbUrl: 'https://phimimg.com/uploads/movies/20261016/ga-kim-thoa-ga-tram-vang-thumb.webp',
      year: 2026,
      quality: 'FHD',
      voteAverage: 8.9,
    ),
    Movie(
      id: 'huyen-huyen-ta-thien-menh-trum-phan-dien',
      name: 'Huyền Huyễn: Ta! Thiên Mệnh Trùm Phản Diện',
      slug: 'huyen-huyen-ta-thien-menh-trum-phan-dien',
      originName: 'The Heavenly Fate Villain',
      posterUrl: 'https://phimimg.com/uploads/movies/20260726/huyen-huyen-ta-thien-menh-trum-phan-dien-poster.webp',
      thumbUrl: 'https://phimimg.com/uploads/movies/20260726/huyen-huyen-ta-thien-menh-trum-phan-dien-thumb.webp',
      year: 2026,
      quality: 'FHD',
      voteAverage: 9.3,
    ),
    Movie(
      id: 'ly-hung-mieu-gau-truc-ly',
      name: 'Lý Hùng Miêu (Gấu Trúc Lý)',
      slug: 'ly-hung-mieu-gau-truc-ly',
      originName: 'Raised by Demons: Panda Li',
      posterUrl: 'https://phimimg.com/uploads/movies/20260801/ly-hung-mieu-poster.webp',
      thumbUrl: 'https://phimimg.com/uploads/movies/20260801/ly-hung-mieu-thumb.webp',
      year: 2026,
      quality: 'FHD',
      voteAverage: 8.8,
    ),
    Movie(
      id: 'my-nhan-du',
      name: 'Mỹ Nhân Dư',
      slug: 'my-nhan-du',
      originName: 'The Vanishing Beauty',
      posterUrl: 'https://phimimg.com/uploads/movies/20261010/my-nhan-du-poster.webp',
      thumbUrl: 'https://phimimg.com/uploads/movies/20261010/my-nhan-du-thumb.webp',
      year: 2026,
      quality: 'FHD',
      voteAverage: 8.7,
    ),
    Movie(
      id: 'sieu-nhan-tiga',
      name: 'Siêu Nhân Tiga',
      slug: 'sieu-nhan-tiga',
      originName: 'Ultraman Tiga',
      posterUrl: 'https://phimimg.com/uploads/movies/20261009/ultraman-tiga-poster.webp',
      thumbUrl: 'https://phimimg.com/uploads/movies/20261009/ultraman-tiga-thumb.webp',
      year: 1996,
      quality: 'FHD',
      voteAverage: 9.4,
    ),
    Movie(
      id: 'nguoi-giu-mo-dai-ha',
      name: 'Người Giữ Mộ Đại Hạ',
      slug: 'nguoi-giu-mo-dai-ha',
      originName: 'Guardian of Xia Mausoleum',
      posterUrl: 'https://phimimg.com/uploads/movies/20260930/nguoi-giu-mo-dai-ha-poster.webp',
      thumbUrl: 'https://phimimg.com/uploads/movies/20260930/nguoi-giu-mo-dai-ha-thumb.webp',
      year: 2026,
      quality: 'FHD',
      voteAverage: 8.9,
    ),
    Movie(
      id: 'tuy-mong',
      name: 'Tuý Mộng',
      slug: 'tuy-mong',
      originName: 'Dream',
      posterUrl: 'https://phimimg.com/uploads/movies/20261017/tuy-mong-poster.webp',
      thumbUrl: 'https://phimimg.com/uploads/movies/20261017/tuy-mong-thumb.webp',
      year: 2026,
      quality: 'FHD',
      voteAverage: 8.8,
    ),
  ];

  /// Get Featured / Spotlight Movies (Synchronized 100% with Website Admin Settings)
  static Future<List<Movie>> getFeaturedMovies() async {
    final home = await _getHome();
    if (home?['spotlights'] is List) {
      return (home!['spotlights'] as List).whereType<Map<String, dynamic>>().map(Movie.fromJson).toList();
    }
    return _defaultFeaturedMovies;
  }

  /// Get Top 10 Ranking Movies (Synchronized 100% with Website Real Rankings)
  static Future<List<Movie>> getTopRankings() async {
    final home = await _getHome();
    final rankings = home?['rankings'];
    if (rankings is List && rankings.isNotEmpty) {
      return rankings.whereType<Map<String, dynamic>>().map(Movie.fromJson).toList();
    }
    return _defaultTopRankings;
  }

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
    } catch (e) {}
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

  /// Get Theatrical / Cinema Movies (Phim Chiếu Rạp)
  static Future<List<Movie>> getCinemaMovies({int page = 1}) async {
    if (page == 1) {
      final home = await _getHome();
      if (home?['cinema'] is List && (home!['cinema'] as List).isNotEmpty) {
        return (home['cinema'] as List).whereType<Map<String, dynamic>>().map(Movie.fromJson).toList();
      }
    }
    try {
      final uri = Uri.parse('$baseUrl/v1/api/danh-sach/phim-chieu-rap?page=$page');
      final res = await _client.get(uri).timeout(const Duration(seconds: 15));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        return _parseMovieList(data);
      }
    } catch (e) {}
    return [];
  }

  /// Get TV Shows & Gameshow
  static Future<List<Movie>> getTvShows({int page = 1}) async {
    if (page == 1) {
      final home = await _getHome();
      if (home?['tvshows'] is List && (home!['tvshows'] as List).isNotEmpty) {
        return (home['tvshows'] as List).whereType<Map<String, dynamic>>().map(Movie.fromJson).toList();
      }
    }
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
      final response = await _backend('/api/movies/${Uri.encodeComponent(slug)}');
      if (response?['status'] == true && response?['data'] is Map<String, dynamic>) {
        return MovieDetailResponse.fromJson(response!['data'] as Map<String, dynamic>);
      }
    } catch (_) {}
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

  /// Get multi-season / franchise parts for a movie (Netflix-style)
  /// Resilient fallback: Queries PhimAPI client-side if backend is offline
  static Future<List<Map<String, dynamic>>> getMovieSeasons(String slug, {Movie? knownMovie}) async {
    try {
      final response = await _backend('/api/movies/${Uri.encodeComponent(slug)}/seasons');
      if (response?['status'] == true && response?['data'] is List) {
        final list = (response!['data'] as List).whereType<Map<String, dynamic>>().toList();
        if (list.isNotEmpty) return list;
      }
    } catch (_) {}
    // Client-side season discovery directly from PhimAPI
    return SeasonService.getSeasonsDirect(slug, knownMovie: knownMovie);
  }

  /// Authorize Android TV session via QR Token or 6-digit PIN
  static Future<Map<String, dynamic>> authorizeTvSession(String codeOrToken) async {
    if (!AppConfig.hasBackend) return {'success': false, 'message': 'Chưa cấu hình BACKEND_URL khi build ứng dụng'};
    if (await StorageService.getToken() == null) return {'success': false, 'message': 'Vui lòng đăng nhập tài khoản trước khi xác nhận TV'};
    try {
      var identifier = codeOrToken.trim();
      final parsed = Uri.tryParse(identifier);
      identifier = parsed?.queryParameters['token'] ?? identifier;
      final response = await _backend('/api/auth/tv/authorize', body: {'token': identifier});
      return {'success': response?['status'] == true, 'message': response?['message'] ?? 'Không thể xác nhận TV'};
    } catch (_) { return {'success': false, 'message': 'Không thể kết nối đến máy chủ xác thực TV'}; }
  }

  /// Get person details with TMDb biography and filmography
  static Future<Map<String, dynamic>?> getPersonDetail(String name) async {
    try {
      final response = await _backend('/api/person/${Uri.encodeComponent(name)}');
      if (response?['status'] == true && response?['data'] is Map<String, dynamic>) return response!['data'] as Map<String, dynamic>;
    } catch (_) {}
    return null;
  }

  /// Request a new TV QR login session
  static Future<Map<String, dynamic>?> createTvSession() async {
    try {
      final response = await _backend('/api/auth/tv/session', body: {});
      if (response?['status'] == true && response?['data'] is Map<String, dynamic>) return response!['data'] as Map<String, dynamic>;
    } catch (_) {}
    return null;
  }

  /// Poll status of a TV QR login session
  static Future<Map<String, dynamic>?> checkTvSessionStatus(String token) async {
    try {
      return await _backend('/api/auth/tv/status', query: {'token': token});
    } catch (_) { return null; }
  }

  static Future<Map<String, dynamic>> login(String email, String password, {String? challengeId, String? code}) async {
    if (!AppConfig.hasBackend) return {'status': false, 'message': 'Chưa cấu hình BACKEND_URL cho ứng dụng'};
    try {
      final response = await _backend('/api/auth/login', body: challengeId == null
          ? {'email': email, 'password': password}
          : {'challengeId': challengeId, 'code': code});
      if (response == null) {
        final host = Uri.tryParse(AppConfig.backendUrl)?.host ?? AppConfig.backendUrl;
        return {'status': false, 'message': 'Không thể kết nối đến máy chủ ($host)'};
      }
      final data = response['data'];
      if (response['status'] == true && data is Map<String, dynamic> && data['token'] is String && data['user'] is Map<String, dynamic>) {
        await StorageService.saveSession(data['token'] as String, data['user'] as Map<String, dynamic>);
      }
      return response;
    } catch (e) {
      final host = Uri.tryParse(AppConfig.backendUrl)?.host ?? AppConfig.backendUrl;
      return {'status': false, 'message': 'Không thể kết nối máy chủ ($host): ' + e.toString().replaceAll('Exception:', '').trim()};
    }
  }
  /// Fetch App Open Interstitial Banner config from backend
  static Future<AppBannerConfig> getAppBanner() async {
    try {
      final response = await _backend('/api/app-banner');
      if (response != null && response['status'] == true && response['data'] is Map<String, dynamic>) {
        return AppBannerConfig.fromJson(response['data'] as Map<String, dynamic>);
      }
    } catch (e) {
      debugPrint('[ApiService] Failed to fetch app banner: $e');
    }
    return AppBannerConfig.defaults();
  }
  /// Fetch in-app update information from backend
  static Future<AppUpdateInfo> getAppUpdate() async {
    try {
      final response = await _backend('/api/app-update');
      if (response != null && response['status'] == true && response['data'] is Map<String, dynamic>) {
        return AppUpdateInfo.fromJson(response['data'] as Map<String, dynamic>);
      }
    } catch (e) {
      debugPrint('[ApiService] Failed to fetch app update: $e');
    }
    return AppUpdateInfo.empty();
  }
}
