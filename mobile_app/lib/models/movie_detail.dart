import 'movie.dart';

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
    return EpisodeItem(
      name: json['name']?.toString() ?? '',
      slug: json['slug']?.toString() ?? '',
      filename: json['filename']?.toString() ?? '',
      linkEmbed: json['link_embed']?.toString() ?? '',
      linkM3u8: json['link_m3u8']?.toString() ?? '',
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

    final movie = Movie.fromJson(movieData);

    List<ServerItem> servers = [];
    if (json['episodes'] is List) {
      for (var s in json['episodes']) {
        if (s is Map<String, dynamic>) {
          servers.add(ServerItem.fromJson(s));
        }
      }
    }

    return MovieDetailResponse(
      movie: movie,
      servers: servers,
    );
  }
}
