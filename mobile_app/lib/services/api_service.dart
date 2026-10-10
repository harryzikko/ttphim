import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/movie.dart';
import '../models/movie_detail.dart';

class ApiService {
  static const String baseUrl = 'https://phimapi.com';
  static final http.Client _client = http.Client();

  /// Default fallback list of pinned featured movies from website settings
  static final List<Movie> _defaultFeaturedMovies = [
    Movie(
      id: 'truy-sat-salazar',
      name: 'Truy Sát Salazar',
      slug: 'truy-sat-salazar',
      originName: 'Killing Salazar',
      posterUrl: 'https://phimimg.com/upload/vod/20240102-1/db187d4de77346ccf1e48e7d3672d4e1.jpg',
      thumbUrl: 'https://phimimg.com/upload/vod/20240102-1/db187d4de77346ccf1e48e7d3672d4e1.jpg',
      year: 2017,
      quality: 'HD',
      voteAverage: 8.8,
    ),
    Movie(
      id: 'truy-lung-sat-thu',
      name: 'Truy Lùng Sát Thủ',
      slug: 'truy-lung-sat-thu',
      originName: 'One in the Chamber',
      posterUrl: 'https://img.nguonc.com/images/img-f7fdc0f999763d1d0881690ccc94c1eada35d759c6e3e8edc8f0775c6ceb2137.webp',
      thumbUrl: 'https://img.nguonc.com/images/img-ffc9757228654e8673f01461da4dcdabceade4f5f44bb29d6fc106938e8af5dc.webp',
      year: 2012,
      quality: 'HD',
      voteAverage: 8.5,
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

  /// Get Featured / Spotlight Movies (Synchronized 100% with Website Admin Settings)
  static Future<List<Movie>> getFeaturedMovies() async {
    try {
      // Fetch dynamic db.json from GitHub repo (always up-to-date with website commits)
      final uri = Uri.parse('https://raw.githubusercontent.com/harryzikko/ttphim/main/data/db.json');
      final res = await _client.get(uri).timeout(const Duration(seconds: 4));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        if (data is Map && data['settings'] is Map && data['settings']['featured_slugs'] is List) {
          final list = (data['settings']['featured_slugs'] as List)
              .whereType<Map<String, dynamic>>()
              .map((item) => Movie(
                    id: item['slug']?.toString() ?? '',
                    name: item['name']?.toString() ?? '',
                    slug: item['slug']?.toString() ?? '',
                    originName: item['origin_name']?.toString() ?? '',
                    posterUrl: item['poster_url']?.toString() ?? '',
                    thumbUrl: item['thumb_url']?.toString() ?? item['poster_url']?.toString() ?? '',
                    year: item['year'] is int ? item['year'] : int.tryParse(item['year']?.toString() ?? ''),
                    quality: item['quality']?.toString() ?? 'HD',
                    lang: item['has_song_ngu'] == true ? 'Song Ngữ' : 'Vietsub',
                    episodeCurrent: item['episode_current']?.toString() ?? 'Full',
                    voteAverage: 9.0,
                  ))
              .toList();
          if (list.isNotEmpty) return list;
        }
      }
    } catch (_) {}

    return _defaultFeaturedMovies;
  }

  /// Get Top 10 Ranking Movies (Synchronized with Website View Counts)
  static Future<List<Movie>> getTopRankings() async {
    try {
      final uri = Uri.parse('https://raw.githubusercontent.com/harryzikko/ttphim/main/data/db.json');
      final res = await _client.get(uri).timeout(const Duration(seconds: 4));
      if (res.statusCode == 200) {
        final data = json.decode(utf8.decode(res.bodyBytes));
        if (data is Map && data['movie_views'] is Map) {
          final viewsMap = data['movie_views'] as Map<String, dynamic>;
          // Sort slugs by views descending
          final sortedEntries = viewsMap.entries.toList()
            ..sort((a, b) => ((b.value as num?) ?? 0).compareTo((a.value as num?) ?? 0));

          // Fetch details for top 10 slugs
          final top10Slugs = sortedEntries.take(10).map((e) => e.key).toList();
          final List<Movie> rankingMovies = [];
          
          for (final slug in top10Slugs) {
            final detailRes = await getMovieDetail(slug);
            if (detailRes != null) {
              rankingMovies.add(detailRes.movie);
            }
          }

          if (rankingMovies.isNotEmpty) return rankingMovies;
        }
      }
    } catch (_) {}

    // Fallback to newest movies if ranking fetch fails
    return getNewMovies(page: 1);
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

  /// Authorize Android TV session via QR Token or 6-digit PIN
  static Future<Map<String, dynamic>> authorizeTvSession(String codeOrToken) async {
    try {
      String cleanCode = codeOrToken.trim();
      if (cleanCode.contains('token=')) {
        final uri = Uri.tryParse(cleanCode);
        if (uri != null && uri.queryParameters.containsKey('token')) {
          cleanCode = uri.queryParameters['token']!;
        }
      }

      final serverUrls = [
        'http://localhost:3001',
        'http://10.0.2.2:3001',
        'http://localhost:3000',
        'http://10.0.2.2:3000',
      ];

      for (final host in serverUrls) {
        try {
          final uri = Uri.parse('$host/api/auth/tv/authorize');
          final res = await _client.post(
            uri,
            headers: {'Content-Type': 'application/json'},
            body: json.encode({'token': cleanCode, 'code': cleanCode}),
          ).timeout(const Duration(seconds: 4));

          if (res.statusCode == 200) {
            final data = json.decode(utf8.decode(res.bodyBytes));
            return {'success': true, 'message': data['message'] ?? 'Xác thực TV thành công!'};
          } else if (res.statusCode == 400) {
            final data = json.decode(utf8.decode(res.bodyBytes));
            return {'success': false, 'message': data['message'] ?? 'Mã kích hoạt không đúng hoặc đã hết hạn'};
          }
        } catch (_) {}
      }

      return {'success': false, 'message': 'Không thể kết nối đến máy chủ xác thực TV'};
    } catch (e) {
      return {'success': false, 'message': 'Lỗi kết nối: ${e.toString()}'};
    }
  }

  /// Get person details with TMDb biography and filmography
  static Future<Map<String, dynamic>?> getPersonDetail(String name) async {
    final serverUrls = [
      'http://localhost:3001',
      'http://10.0.2.2:3001',
      'http://localhost:3000',
      'http://10.0.2.2:3000',
    ];
    for (final host in serverUrls) {
      try {
        final uri = Uri.parse('$host/api/person/${Uri.encodeComponent(name)}');
        final res = await _client.get(uri).timeout(const Duration(seconds: 5));
        if (res.statusCode == 200) {
          final data = json.decode(utf8.decode(res.bodyBytes));
          if (data['status'] == true && data['data'] != null) {
            return data['data'] as Map<String, dynamic>;
          }
        }
      } catch (_) {}
    }
    return null;
  }

  /// Request a new TV QR login session
  static Future<Map<String, dynamic>?> createTvSession() async {
    final serverUrls = [
      'http://localhost:3001',
      'http://10.0.2.2:3001',
      'http://localhost:3000',
      'http://10.0.2.2:3000',
    ];
    for (final host in serverUrls) {
      try {
        final uri = Uri.parse('$host/api/auth/tv/session');
        final res = await _client.post(uri).timeout(const Duration(seconds: 4));
        if (res.statusCode == 200) {
          final data = json.decode(utf8.decode(res.bodyBytes));
          if (data['status'] == true && data['data'] != null) {
            return data['data'] as Map<String, dynamic>;
          }
        }
      } catch (_) {}
    }
    return null;
  }

  /// Poll status of a TV QR login session
  static Future<Map<String, dynamic>?> checkTvSessionStatus(String token) async {
    final serverUrls = [
      'http://localhost:3001',
      'http://10.0.2.2:3001',
      'http://localhost:3000',
      'http://10.0.2.2:3000',
    ];
    for (final host in serverUrls) {
      try {
        final uri = Uri.parse('$host/api/auth/tv/status?token=$token');
        final res = await _client.get(uri).timeout(const Duration(seconds: 3));
        if (res.statusCode == 200) {
          final data = json.decode(utf8.decode(res.bodyBytes));
          return data as Map<String, dynamic>;
        }
      } catch (_) {}
    }
    return null;
  }
}

