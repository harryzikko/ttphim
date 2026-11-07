import 'movie.dart';
import '../services/app_config.dart';

class EpisodeItem {
  final String name;
  final String slug;
  final String filename;
  final String linkEmbed;
  final String linkM3u8;

  EpisodeItem({
    required this.name,
    required this.slug,
    required this.filename,
    required this.linkEmbed,
    required this.linkM3u8,
  });

  factory EpisodeItem.fromJson(Map<String, dynamic> json) {
    String embed = json['link_embed']?.toString().trim() ?? '';
    String m3u8 = json['link_m3u8']?.toString().trim() ?? '';

    // Auto-resolve relative CineViet endpoints
    if (embed.startsWith('/')) {
      final base = AppConfig.backendUrl.replaceAll(RegExp(r'/+$'), '');
      embed = '$base$embed';
    }
    if (m3u8.startsWith('/')) {
      final base = AppConfig.backendUrl.replaceAll(RegExp(r'/+$'), '');
      m3u8 = '$base$m3u8';
    }

    String rawName = json['name']?.toString().trim() ?? '';
    final intVal = int.tryParse(rawName);
    if (intVal != null) {
      rawName = 'Tập $intVal';
    } else if (RegExp(r'^(?:tập|tap)\s*(\d+)$', caseSensitive: false).hasMatch(rawName)) {
      final m = RegExp(r'^(?:tập|tap)\s*(\d+)$', caseSensitive: false).firstMatch(rawName);
      if (m != null) rawName = 'Tập ${int.tryParse(m.group(1)!) ?? m.group(1)}';
    }

    return EpisodeItem(
      name: rawName,
      slug: json['slug']?.toString() ?? '',
      filename: json['filename']?.toString() ?? '',
      linkEmbed: embed,
      linkM3u8: m3u8,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'slug': slug,
      'filename': filename,
      'link_embed': linkEmbed,
      'link_m3u8': linkM3u8,
    };
  }
}

class ServerItem {
  final String serverName;
  final List<EpisodeItem> episodes;

  ServerItem({
    required this.serverName,
    required this.episodes,
  });

  factory ServerItem.fromJson(Map<String, dynamic> json) {
    List<EpisodeItem> eps = [];
    if (json['server_data'] is List) {
      for (var ep in json['server_data']) {
        if (ep is Map<String, dynamic>) {
          eps.add(EpisodeItem.fromJson(ep));
        }
      }
    }

    return ServerItem(
      serverName: json['server_name']?.toString() ?? 'Server 1',
      episodes: eps,
    );
  }
}

class MovieDetailResponse {
  final Movie movie;
  final List<ServerItem> servers;

  MovieDetailResponse({
    required this.movie,
    required this.servers,
  });

  factory MovieDetailResponse.fromJson(Map<String, dynamic> json) {
    final movieData = json['movie'] is Map<String, dynamic>
        ? json['movie'] as Map<String, dynamic>
        : <String, dynamic>{};

    List<ServerItem> servers = [];
    if (json['episodes'] is List) {
      for (var s in json['episodes']) {
        if (s is Map<String, dynamic>) {
          servers.add(ServerItem.fromJson(s));
        }
      }
    }

    final hasSongNgu = movieData['has_song_ngu'] == true ||
        movieData['hasSongNgu'] == true ||
        (movieData['lang'] != null && movieData['lang'].toString().toLowerCase().contains('song ngữ')) ||
        servers.any((s) => s.serverName.toLowerCase().contains('song ngữ'));

    final movie = Movie.fromJson({
      ...movieData,
      'has_song_ngu': hasSongNgu,
    });

    return MovieDetailResponse(
      movie: movie,
      servers: servers,
    );
  }
}
