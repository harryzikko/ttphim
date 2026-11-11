import '../services/app_config.dart';

String resolveShortflixUrl(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  final base = AppConfig.backendUrl.trim().replaceAll(RegExp(r'/+$'), '');
  if (base.isEmpty) return trimmed;
  return trimmed.startsWith('/') ? '$base$trimmed' : '$base/$trimmed';
}

class ShortDramaItem {
  final String slug;
  final String name;
  final String posterUrl;
  final String posterFallbackUrl;
  final String description;
  final int? episodeCountHint;

  const ShortDramaItem({
    required this.slug,
    required this.name,
    required this.posterUrl,
    required this.posterFallbackUrl,
    required this.description,
    this.episodeCountHint,
  });

  factory ShortDramaItem.fromJson(Map<String, dynamic> json) {
    final hint = json['episode_count_hint'];
    return ShortDramaItem(
      slug: (json['slug'] ?? '').toString().trim(),
      name: (json['name'] ?? json['slug'] ?? 'Short Phim').toString().trim(),
      posterUrl: (json['poster_url'] ?? '').toString().trim(),
      posterFallbackUrl: (json['poster_fallback_url'] ?? '').toString().trim(),
      description: (json['description'] ?? '').toString().trim(),
      episodeCountHint: hint is int ? hint : int.tryParse(hint?.toString() ?? ''),
    );
  }
}

class ShortCatalogResult {
  final List<ShortDramaItem> items;
  final List<String> genres;
  final int page;
  final bool hasMore;

  const ShortCatalogResult({
    required this.items,
    required this.genres,
    required this.page,
    required this.hasMore,
  });

  factory ShortCatalogResult.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'] as List? ?? const [];
    final rawGenres = json['genres'] as List? ?? const [];
    final pagination = json['pagination'] as Map<String, dynamic>? ?? const {};
    final parsedPage = pagination['page'] is int
        ? pagination['page'] as int
        : int.tryParse(pagination['page']?.toString() ?? '') ?? 1;

    return ShortCatalogResult(
      items: rawItems
          .whereType<Map>()
          .map((e) => ShortDramaItem.fromJson(Map<String, dynamic>.from(e)))
          .where((e) => e.slug.isNotEmpty)
          .toList(),
      genres: rawGenres.map((e) => e.toString()).where((e) => e.isNotEmpty).toList(),
      page: parsedPage < 1 ? 1 : parsedPage,
      hasMore: pagination['hasMore'] == true,
    );
  }
}

class ShortEpisode {
  final int episode;
  final String videoId;
  final String title;
  final String thumbnailUrl;

  const ShortEpisode({
    required this.episode,
    required this.videoId,
    required this.title,
    required this.thumbnailUrl,
  });

  factory ShortEpisode.fromJson(Map<String, dynamic> json, int index) {
    final epRaw = json['episode'];
    final ep = epRaw is int ? epRaw : int.tryParse(epRaw?.toString() ?? '') ?? (index + 1);
    return ShortEpisode(
      episode: ep < 1 ? 1 : ep,
      videoId: (json['video_id'] ?? '').toString(),
      title: (json['title'] ?? 'Tập $ep').toString(),
      thumbnailUrl: (json['thumbnail_url'] ?? '').toString().trim(),
    );
  }
}

class ShortDetailResult {
  final ShortDramaItem item;
  final List<ShortEpisode> episodes;

  const ShortDetailResult({
    required this.item,
    required this.episodes,
  });

  factory ShortDetailResult.fromJson(Map<String, dynamic> json) {
    final itemMap = json['item'] as Map<String, dynamic>? ?? const {};
    final rawEpisodes = json['episodes'] as List? ?? const [];
    final eps = <ShortEpisode>[];
    for (var i = 0; i < rawEpisodes.length; i++) {
      final raw = rawEpisodes[i];
      if (raw is Map) {
        eps.add(ShortEpisode.fromJson(Map<String, dynamic>.from(raw), i));
      }
    }
    return ShortDetailResult(
      item: ShortDramaItem.fromJson(itemMap),
      episodes: eps,
    );
  }
}

class ShortStreamServer {
  final String name;
  final String rawTitle;
  final bool isFull;
  final String url;
  final List<String> subtitleUrls;

  const ShortStreamServer({
    required this.name,
    required this.rawTitle,
    required this.isFull,
    required this.url,
    required this.subtitleUrls,
  });

  factory ShortStreamServer.fromJson(Map<String, dynamic> json) {
    final rawSubs = json['subtitles'] as List? ?? const [];
    final subs = rawSubs
        .whereType<Map>()
        .map((s) => resolveShortflixUrl((s['proxy_url'] ?? s['url'] ?? '').toString()))
        .where((u) => u.isNotEmpty)
        .toList();

    return ShortStreamServer(
      name: (json['name'] ?? 'Server').toString(),
      rawTitle: (json['raw_title'] ?? '').toString(),
      isFull: json['is_full'] == true,
      url: resolveShortflixUrl((json['url'] ?? '').toString()),
      subtitleUrls: subs,
    );
  }
}
