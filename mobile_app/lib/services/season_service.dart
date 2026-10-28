import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/movie.dart';

/// Client-side Franchise and Multi-Season Detection (Netflix-Style)
/// Fully synchronized with server-side seasonService.js algorithms.
class SeasonService {
  static const String _baseUrl = 'https://phimapi.com';
  static http.Client _client = http.Client();

  static final Map<String, List<Map<String, dynamic>>> _memoryCache = {};

  static void setClientForTesting(http.Client client) {
    _client = client;
    _memoryCache.clear();
  }

  /// Remove Vietnamese diacritics and normalize string for accurate matching
  static String normalizeName(String? str) {
    if (str == null || str.isEmpty) return '';
    var s = str.toLowerCase();

    // Mapping of Vietnamese accented characters to plain Latin
    const vietnamese = [
      'aáàảãạăắằẳẵặâấầẩẫậ',
      'eéèẻẽẹêếềểễệ',
      'iíìỉĩị',
      'oóòỏõọôốồổỗộơớờởỡợ',
      'uúùủũụưứừửữự',
      'yýỳỷỹỵ',
      'dđ'
    ];
    const latin = ['a', 'e', 'i', 'o', 'u', 'y', 'd'];

    for (var i = 0; i < vietnamese.length; i++) {
      for (final char in vietnamese[i].runes) {
        s = s.replaceAll(String.fromCharCode(char), latin[i]);
      }
    }

    return s
        .replaceAll(RegExp(r'[^a-z0-9]'), ' ')
        .trim()
        .replaceAll(RegExp(r'\s+'), ' ');
  }

  /// Detect if a title is strictly a Live-Action adaptation
  static bool isLiveAction(String name) {
    return RegExp(r'(?:live action|người đóng|bản người đóng)', caseSensitive: false).hasMatch(name);
  }

  /// Detect if a movie is Anime/Hoạt hình or Donghua
  static bool isAnime(Movie movie) {
    final name = movie.name;
    final origin = movie.originName;

    // Explicit Live Action is NEVER anime
    if (isLiveAction(name) || RegExp(r'live action', caseSensitive: false).hasMatch(origin)) {
      return false;
    }

    // Explicit type from provider
    if (movie.type == 'hoathinh') return true;

    // Check categories if present
    for (final c in movie.categories) {
      final s = c.toLowerCase();
      if (s == 'hoat-hinh' || RegExp(r'hoạt hình|anime|manga', caseSensitive: false).hasMatch(s)) {
        return true;
      }
    }

    // Chinese 3D Donghua / Animation indicators
    if (RegExp(r'bản đặc biệt|hoạt hình|donghua|3d animation', caseSensitive: false).hasMatch(name)) {
      return true;
    }

    return false;
  }

  /// Distinguish multi-episode TV series vs standalone single movies
  static bool isSeries(Movie movie) {
    if (movie.type == 'series' || movie.type == 'tvshows') return true;
    if (movie.type == 'single') return false;

    final ep = movie.episodeCurrent.toLowerCase();
    if (ep == 'full') return false;
    if (RegExp(r'tập\s*\d+|hoàn tất\s*\(\d+\/\d+\)', caseSensitive: false).hasMatch(ep)) {
      return true;
    }
    return false;
  }

  /// Extract base franchise title without season suffixes
  static String extractFranchiseName(String name) {
    if (name.isEmpty) return '';
    return name
        .replaceAll(RegExp(r'\s*\(\s*(?:phần|mùa|season|ss|part|bản)\s*[\d\w\s–-]+\).*$', caseSensitive: false), '')
        .replaceAll(RegExp(r'\s*[-–:]?\s*(?:phần|mùa|season|ss|part)\s*\d+.*$', caseSensitive: false), '')
        .replaceAll(RegExp(r'\s*[-–:]?\s*bản đặc biệt.*$', caseSensitive: false), '')
        .replaceAll(RegExp(r'\s+\d+\s*[:–-].*$', caseSensitive: false), '')
        .replaceAll(RegExp(r'\s+\d+$', caseSensitive: false), '')
        .trim();
  }

  /// Check if title contains explicit season indicator
  static bool hasSeasonIndicator(String name) {
    if (name.isEmpty) return false;
    return RegExp(r'(?:phần|mùa|season|ss|part)\s*\d+', caseSensitive: false).hasMatch(name) ||
        RegExp(r'bản đặc biệt', caseSensitive: false).hasMatch(name) ||
        RegExp(r'\s+\d+(?:\s*[:–-]|(?:\s+\(.*?\))?$)').hasMatch(name) ||
        RegExp(r'\b(?:phần|mùa|season)\s*(?:đầu|cuối|mới)\b', caseSensitive: false).hasMatch(name);
  }

  /// Extract season number
  static int extractSeasonNumber(String name) {
    if (name.isEmpty) return 1;
    final match = RegExp(r'(?:phần|mùa|season|ss|part)\s*(\d+)', caseSensitive: false).firstMatch(name);
    if (match != null) {
      return int.tryParse(match.group(1) ?? '1') ?? 1;
    }

    if (RegExp(r'bản đặc biệt', caseSensitive: false).hasMatch(name)) {
      return 100;
    }

    final movieNum = RegExp(r'\s+(\d+)(?:\s*[:–-]|(?:\s+\(.*?\))?$)').firstMatch(name);
    if (movieNum != null) {
      final n = int.tryParse(movieNum.group(1) ?? '1') ?? 1;
      if (n < 1900 || n > 2100) return n;
    }

    return 1;
  }

  /// Format clean season display label for the dropdown / TV tabs
  static String formatSeasonLabel(String name, int seasonNumber, int? year) {
    final yearText = year != null && year > 0 ? ' ($year)' : '';
    if (RegExp(r'bản đặc biệt', caseSensitive: false).hasMatch(name)) {
      return '$name$yearText';
    }
    if (seasonNumber > 0 && seasonNumber < 100) {
      final subMatch = RegExp(r'(?:phần|mùa|season|ss|part)\s*\d+[:\s-]+([^)]+)', caseSensitive: false).firstMatch(name) ??
          RegExp(r'\s+\d+\s*[:–-]\s*([^)]+)', caseSensitive: false).firstMatch(name);
      if (subMatch != null && subMatch.group(1) != null) {
        final cleanSub = subMatch.group(1)!
            .replaceAll(RegExp(r'\s*\(\s*(?:phần|mùa|season|ss|part)\s*\d+.*?\)', caseSensitive: false), '')
            .trim();
        if (cleanSub.length > 1) {
          return 'Phần $seasonNumber: $cleanSub$yearText';
        }
      }
      return 'Phần $seasonNumber$yearText';
    }
    return '$name$yearText';
  }

  /// Discover all seasons for a movie by querying PhimAPI directly
  static Future<List<Map<String, dynamic>>> getSeasonsDirect(String slug, {Movie? knownMovie}) async {
    if (slug.isEmpty) return [];

    if (_memoryCache.containsKey(slug)) {
      return _memoryCache[slug]!;
    }

    try {
      Movie? currentMovie = knownMovie;
      if (currentMovie == null || currentMovie.name.isEmpty) {
        // Fetch movie detail to discover base name
        final detailUri = Uri.parse('$_baseUrl/phim/$slug');
        final res = await _client.get(detailUri).timeout(const Duration(seconds: 10));
        if (res.statusCode == 200) {
          final data = json.decode(utf8.decode(res.bodyBytes));
          if (data is Map && data['status'] == true && data['movie'] is Map) {
            currentMovie = Movie.fromJson(data['movie'] as Map<String, dynamic>);
          }
        }
      }

      if (currentMovie == null || currentMovie.name.isEmpty) return [];

      final baseName = extractFranchiseName(currentMovie.name);
      if (baseName.isEmpty || baseName.length < 3) return [];

      final currentIsAnime = isAnime(currentMovie);
      final currentIsLiveAction = isLiveAction(currentMovie.name);
      final currentIsSeries = isSeries(currentMovie);
      final baseNorm = normalizeName(baseName);

      // Search base name, and base name + ' Phần'
      final searchQueries = [
        baseName,
        '$baseName Phần',
      ];

      final List<Movie> candidates = [];
      final Set<String> seenSlugs = {};

      for (final q in searchQueries) {
        try {
          final searchUri = Uri.parse('$_baseUrl/v1/api/tim-kiem?keyword=${Uri.encodeComponent(q)}&limit=30');
          final sRes = await _client.get(searchUri).timeout(const Duration(seconds: 10));
          if (sRes.statusCode == 200) {
            final sData = json.decode(utf8.decode(sRes.bodyBytes));
            List<dynamic>? items;
            if (sData is Map && sData['data'] is Map && sData['data']['items'] is List) {
              items = sData['data']['items'];
            } else if (sData is Map && sData['items'] is List) {
              items = sData['items'];
            }
            if (items != null) {
              for (final it in items) {
                if (it is Map<String, dynamic>) {
                  final movie = Movie.fromJson(it);
                  if (movie.slug.isNotEmpty && seenSlugs.add(movie.slug)) {
                    candidates.add(movie);
                  }
                }
              }
            }
          }
        } catch (_) {}
      }

      if (candidates.isEmpty) return [];

      final List<Map<String, dynamic>> matched = [];
      final Set<String> matchedSlugs = {};

      // Always include current movie
      matched.add({
        'name': currentMovie.name,
        'slug': currentMovie.slug,
        'year': currentMovie.year,
        'season_number': extractSeasonNumber(currentMovie.name),
        'is_current': true,
      });
      matchedSlugs.add(currentMovie.slug);

      for (final item in candidates) {
        if (matchedSlugs.contains(item.slug)) continue;

        // 1. Medium Check: Live Action vs Anime
        final itemIsLiveAction = isLiveAction(item.name);
        final itemIsAnime = isAnime(item);
        if (currentIsLiveAction != itemIsLiveAction) continue;
        if (currentIsAnime != itemIsAnime) continue;

        // 2. Format Check: Series vs Single Movie
        final itemIsSeries = isSeries(item);
        if (currentIsSeries != itemIsSeries) continue;

        // 3. Franchise Name Match
        final itemBase = extractFranchiseName(item.name);
        final itemBaseNorm = normalizeName(itemBase);
        if (itemBaseNorm != baseNorm) continue;

        // 4. Season Qualifier Check
        final itemHasSeason = hasSeasonIndicator(item.name);
        final itemIsPureBase = normalizeName(item.name) == baseNorm;
        if (!itemHasSeason && !itemIsPureBase) continue;

        matchedSlugs.add(item.slug);
        matched.add({
          'name': item.name,
          'slug': item.slug,
          'year': item.year,
          'season_number': extractSeasonNumber(item.name),
          'is_current': false,
        });
      }

      // Must have at least one explicit season indicator or distinct season numbers
      final anyExplicitSeason = matched.any((m) => hasSeasonIndicator(m['name'].toString()) || (m['season_number'] as int) > 1);
      if (!anyExplicitSeason || matched.length <= 1) {
        _memoryCache[slug] = [];
        return [];
      }

      // Sort by season number, then year
      matched.sort((a, b) {
        final numA = a['season_number'] as int;
        final numB = b['season_number'] as int;
        if (numA != numB) return numA.compareTo(numB);
        final yrA = (a['year'] as int?) ?? 0;
        final yrB = (b['year'] as int?) ?? 0;
        return yrA.compareTo(yrB);
      });

      // Add clean labels
      for (final item in matched) {
        item['label'] = formatSeasonLabel(
          item['name'].toString(),
          item['season_number'] as int,
          item['year'] as int?,
        );
      }

      _memoryCache[slug] = matched;
      return matched;
    } catch (_) {
      return [];
    }
  }
}
