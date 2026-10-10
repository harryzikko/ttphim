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

  Movie({
    required this.id,
    required this.name,
    required this.slug,
    required this.originName,
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

    return Movie(
      id: json['_id'] ?? json['id'] ?? '',
      name: json['name'] ?? '',
      slug: json['slug'] ?? '',
      originName: json['origin_name'] ?? '',
      posterUrl: json['poster_url'] ?? '',
      thumbUrl: json['thumb_url'] ?? '',
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
    );
  }

  Map<String, dynamic> toJson() {
    return {
      '_id': id,
      'name': name,
      'slug': slug,
      'origin_name': originName,
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
    };
  }

  /// Get absolute URL for poster image
  String get fullPosterUrl {
    return _resolveImageUrl(posterUrl.isNotEmpty ? posterUrl : thumbUrl);
  }

  /// Get absolute URL for thumbnail/backdrop image
  String get fullThumbUrl {
    return _resolveImageUrl(thumbUrl.isNotEmpty ? thumbUrl : posterUrl);
  }

  static String _resolveImageUrl(String url) {
    if (url.isEmpty) return 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // Handle relative path like 'uploads/movies/...' or '/uploads/...'
    final cleanPath = url.startsWith('/') ? url.substring(1) : url;
    return 'https://phimimg.com/$cleanPath';
  }
}
