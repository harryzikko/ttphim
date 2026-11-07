class CastMember {
  final String name;
  final String character;
  final String avatar;
  final bool isDirector;

  CastMember({
    required this.name,
    this.character = '',
    required this.avatar,
    this.isDirector = false,
  });

  factory CastMember.fromJson(Map<String, dynamic> json) {
    return CastMember(
      name: json['name']?.toString() ?? '',
      character: json['character']?.toString() ?? '',
      avatar: json['avatar']?.toString() ?? '',
      isDirector: json['isDirector'] == true,
    );
  }
}

class Movie {
  final String id;
  final String name;
  final String slug;
  final String originName;
  final String type;
  final String posterUrl;
  final String thumbUrl;
  final int? year;
  final String time;
  final String quality;
  final String lang;
  final String episodeCurrent;
  final double voteAverage;
  final String content;
  final List<String> categories;
  final List<String> countries;
  final List<String> actors;
  final List<String> directors;
  final List<CastMember> castMembers;
  final bool hasSongNgu;

  Movie({
    required this.id,
    required this.name,
    required this.slug,
    required this.originName,
    this.type = 'single',
    required this.posterUrl,
    required this.thumbUrl,
    this.year,
    this.time = '',
    this.quality = 'HD',
    this.lang = 'Vietsub',
    this.episodeCurrent = '',
    this.voteAverage = 0.0,
    this.content = '',
    this.categories = const [],
    this.countries = const [],
    this.actors = const [],
    this.directors = const [],
    this.castMembers = const [],
    this.hasSongNgu = false,
  });

  factory Movie.fromJson(Map<String, dynamic> json) {
    // Parse TMDB / IMDB vote average
    double vote = 0.0;
    if (json['tmdb'] is Map && json['tmdb']['vote_average'] != null) {
      vote = (json['tmdb']['vote_average'] as num).toDouble();
    } else if (json['vote_average'] != null) {
      vote = (json['vote_average'] as num).toDouble();
    }

    // Parse categories
    List<String> cats = [];
    if (json['category'] is List) {
      for (var c in json['category']) {
        if (c is Map && c['name'] != null) {
          cats.add(c['name'].toString());
        } else if (c is String) {
          cats.add(c);
        }
      }
    }

    // Parse countries
    List<String> counts = [];
    if (json['country'] is List) {
      for (var c in json['country']) {
        if (c is Map && c['name'] != null) {
          counts.add(c['name'].toString());
        } else if (c is String) {
          counts.add(c);
        }
      }
    }

    // Parse actors
    List<String> acts = [];
    if (json['actor'] is List) {
      for (var a in json['actor']) {
        acts.add(a.toString());
      }
    }

    // Parse directors
    List<String> dirs = [];
    if (json['director'] is List) {
      for (var d in json['director']) {
        dirs.add(d.toString());
      }
    }

    // Parse year safely
    int? parsedYear;
    if (json['year'] != null) {
      if (json['year'] is int) {
        parsedYear = json['year'];
      } else if (json['year'] is String) {
        parsedYear = int.tryParse(json['year']);
      }
    }

    // Parse TMDb Cast & Directors if present
    List<CastMember> members = [];
    if (json['tmdb_directors'] is List) {
      for (var d in json['tmdb_directors']) {
        if (d is Map<String, dynamic>) {
          members.add(CastMember.fromJson(d));
        }
      }
    }
    if (json['tmdb_cast'] is List) {
      for (var c in json['tmdb_cast']) {
        if (c is Map<String, dynamic>) {
          members.add(CastMember.fromJson(c));
        }
      }
    }
    if (members.isEmpty && json['credits'] is Map) {
      final creds = json['credits'];
      if (creds['directors'] is List) {
        for (var d in creds['directors']) {
          if (d is Map<String, dynamic>) members.add(CastMember.fromJson(d));
        }
      }
      if (creds['cast'] is List) {
        for (var c in creds['cast']) {
          if (c is Map<String, dynamic>) members.add(CastMember.fromJson(c));
        }
      }
    }

    final rawPoster = json['poster_url']?.toString().trim() ?? '';
    final heroPoster = json['hero_poster_url']?.toString().trim() ?? '';
    final heroPosterFallback = json['hero_poster_fallback']?.toString().trim() ?? '';
    final resolvedPoster = rawPoster.isNotEmpty
        ? rawPoster
        : (heroPoster.isNotEmpty ? heroPoster : heroPosterFallback);

    final rawThumb = json['thumb_url']?.toString().trim() ?? '';
    final heroBackdrop = json['hero_backdrop_url']?.toString().trim() ?? '';
    final heroBackdropFallback = json['hero_backdrop_fallback']?.toString().trim() ?? '';
    final resolvedThumb = rawThumb.isNotEmpty
        ? rawThumb
        : (heroBackdrop.isNotEmpty ? heroBackdrop : heroBackdropFallback);

    final rawHasSongNgu = json['has_song_ngu'] == true ||
        json['hasSongNgu'] == true ||
        (json['lang'] != null && json['lang'].toString().toLowerCase().contains('song ngữ')) ||
        (json['type'] != null && json['type'].toString().toLowerCase() == 'song-ngu');

    return Movie(
      id: json['_id'] ?? json['id'] ?? '',
      name: json['name'] ?? '',
      slug: json['slug'] ?? '',
      originName: json['origin_name'] ?? '',
      type: (json['type']?.toString().toLowerCase().trim() ?? 'single'),
      posterUrl: resolvedPoster,
      thumbUrl: resolvedThumb,
      year: parsedYear,
      time: json['time'] ?? '',
      quality: json['quality'] ?? 'HD',
      lang: json['lang'] ?? 'Vietsub',
      episodeCurrent: json['episode_current'] ?? '',
      voteAverage: vote,
      content: json['content'] ?? '',
      categories: cats,
      countries: counts,
      actors: acts,
      directors: dirs,
      castMembers: members,
      hasSongNgu: rawHasSongNgu,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      '_id': id,
      'name': name,
      'slug': slug,
      'origin_name': originName,
      'type': type,
      'poster_url': posterUrl,
      'thumb_url': thumbUrl,
      'year': year,
      'time': time,
      'quality': quality,
      'lang': lang,
      'episode_current': episodeCurrent,
      'vote_average': voteAverage,
      'content': content,
      'category': categories,
      'country': countries,
      'actor': actors,
      'director': directors,
      'has_song_ngu': hasSongNgu,
    };
  }

  /// Get absolute URL for poster image
  String get fullPosterUrl {
    return _resolveImageUrl(posterUrl.isNotEmpty ? posterUrl : thumbUrl, isBackdrop: false);
  }

  /// Get absolute URL for thumbnail/backdrop image
  String get fullThumbUrl {
    return _resolveImageUrl(thumbUrl.isNotEmpty ? thumbUrl : posterUrl, isBackdrop: true);
  }

  /// Alias for actors
  List<String> get casts => actors;

  static String _resolveImageUrl(String url, {bool isBackdrop = false}) {
    if (url.isEmpty) return 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba';
    String resolved = url.trim();
    if (!resolved.startsWith('http://') && !resolved.startsWith('https://')) {
      final cleanPath = resolved.startsWith('/') ? resolved.substring(1) : resolved;
      resolved = 'https://phimimg.com/$cleanPath';
    }
    // Optimize high-res TMDb original assets to avoid OOM, network lag and decode crashes on Android TV
    if (resolved.contains('image.tmdb.org/t/p/original/')) {
      resolved = resolved.replaceAll(
        'image.tmdb.org/t/p/original/',
        isBackdrop ? 'image.tmdb.org/t/p/w1280/' : 'image.tmdb.org/t/p/w780/',
      );
    }
    return resolved;
  }
}
