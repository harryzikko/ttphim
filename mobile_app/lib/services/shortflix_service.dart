import 'dart:convert';
import 'package:video_player/video_player.dart';
import '../models/short_drama.dart';
import 'backend_service.dart';

class ShortflixService {
  static Future<ShortCatalogResult> getCatalog({
    int page = 1,
    String genre = 'all',
    String keyword = '',
    int limit = 24,
  }) async {
    final query = <String, String>{
      'page': '${page < 1 ? 1 : page}',
      'limit': '$limit',
    };
    final cleanKeyword = keyword.trim();
    final cleanGenre = genre.trim();
    if (cleanKeyword.isNotEmpty) {
      query['keyword'] = cleanKeyword;
    } else if (cleanGenre.isNotEmpty && cleanGenre != 'all') {
      query['genre'] = cleanGenre;
    }

    final res = await BackendService.request('/api/shortflix/catalog', query: query);
    if (res?['status'] == true && res?['data'] is Map) {
      return ShortCatalogResult.fromJson(Map<String, dynamic>.from(res!['data'] as Map));
    }
    throw Exception(res?['message']?.toString() ?? 'Không tải được danh mục Short Phim');
  }

  static Future<ShortDetailResult> getDetail(String slug) async {
    final res = await BackendService.request('/api/shortflix/detail/${Uri.encodeComponent(slug)}');
    if (res?['status'] == true && res?['data'] is Map) {
      return ShortDetailResult.fromJson(Map<String, dynamic>.from(res!['data'] as Map));
    }
    throw Exception(res?['message']?.toString() ?? 'Không tải được chi tiết Short Phim');
  }

  static Future<List<ShortStreamServer>> getStreams(String slug, int episode) async {
    final ep = episode < 1 ? 1 : episode;
    final res = await BackendService.request('/api/shortflix/stream/${Uri.encodeComponent(slug)}/$ep');
    if (res?['status'] == true && res?['data'] is Map) {
      final data = Map<String, dynamic>.from(res!['data'] as Map);
      final rawServers = data['servers'] as List? ?? const [];
      return rawServers
          .whereType<Map>()
          .map((s) => ShortStreamServer.fromJson(Map<String, dynamic>.from(s)))
          .where((s) => s.url.isNotEmpty)
          .toList();
    }
    throw Exception(res?['message']?.toString() ?? 'Không lấy được luồng phát Short Phim');
  }

  static Future<ClosedCaptionFile> fetchWebVttCaption(String subtitleUrl) async {
    final resolved = resolveShortflixUrl(subtitleUrl);
    if (resolved.isEmpty) return WebVTTCaptionFile('WEBVTT\n\n');
    try {
      final res = await BackendService.client
          .get(Uri.parse(resolved))
          .timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final content = utf8.decode(res.bodyBytes, allowMalformed: true).trim();
        if (content.isNotEmpty) {
          return WebVTTCaptionFile(content.startsWith('WEBVTT') ? content : 'WEBVTT\n\n$content');
        }
      }
    } catch (_) {
      // Never block video initialization when subtitles fail to load
    }
    return WebVTTCaptionFile('WEBVTT\n\n');
  }
}
