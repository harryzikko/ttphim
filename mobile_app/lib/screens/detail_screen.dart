import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/movie.dart';
import '../models/movie_detail.dart';
import '../services/api_service.dart';
import '../services/storage_service.dart';
import '../theme/app_theme.dart';
import 'player_screen.dart';
import 'person_screen.dart';

class MovieDetailScreen extends StatefulWidget {
  final String slug;
  final Movie? initialMovie;

  const MovieDetailScreen({
    super.key,
    required this.slug,
    this.initialMovie,
  });

  @override
  State<MovieDetailScreen> createState() => _MovieDetailScreenState();
}

class _MovieDetailScreenState extends State<MovieDetailScreen> {
  MovieDetailResponse? _detail;
  bool _isLoading = true;
  bool _isFavorite = false;
  int _selectedServerIndex = 0;
  bool _isDescriptionExpanded = false;

  WatchHistoryItem? _lastHistory;

  @override
  void initState() {
    super.initState();
    _checkFavorite();
    _checkHistory();
    _fetchDetail();
  }

  Future<void> _checkFavorite() async {
    final fav = await StorageService.isFavorite(widget.slug);
    if (mounted) setState(() => _isFavorite = fav);
  }

  Future<void> _checkHistory() async {
    final history = await StorageService.getHistoryForMovie(widget.slug);
    if (mounted) setState(() => _lastHistory = history);
  }

  Future<void> _toggleFavorite() async {
    final movieToSave = _detail?.movie ?? widget.initialMovie;
    if (movieToSave != null) {
      final newState = await StorageService.toggleFavorite(movieToSave);
      if (mounted) {
        setState(() => _isFavorite = newState);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(newState ? 'Đã thêm vào danh sách yêu thích' : 'Đã xóa khỏi danh sách yêu thích'),
            backgroundColor: AppTheme.surface,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    }
  }

  Future<void> _fetchDetail() async {
    final res = await ApiService.getMovieDetail(widget.slug);
    if (mounted) {
      setState(() {
        _detail = res;
        _isLoading = false;
      });
    }
  }

  void _playEpisode(EpisodeItem episode, [ServerItem? targetServer]) {
    if (_detail == null) return;
    final server = targetServer ?? _detail!.servers[_selectedServerIndex];
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PlayerScreen(
          movie: _detail!.movie,
          servers: _detail!.servers,
          initialServer: server,
          initialEpisode: episode,
        ),
      ),
    ).then((_) {
      _checkFavorite();
      _checkHistory();
    });
  }

  @override
  Widget build(BuildContext context) {
    final movie = _detail?.movie ?? widget.initialMovie;

    return Scaffold(
      backgroundColor: AppTheme.background,
      body: CustomScrollView(
        physics: const BouncingScrollPhysics(),
        slivers: [
          // App Bar with Backdrop Image
          SliverAppBar(
            expandedHeight: 320,
            pinned: true,
            backgroundColor: AppTheme.surface,
            leading: Padding(
              padding: const EdgeInsets.all(8.0),
              child: CircleAvatar(
                backgroundColor: Colors.black.withOpacity(0.6),
                child: IconButton(
                  icon: const Icon(Icons.arrow_back, color: Colors.white, size: 20),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
            ),
            actions: [
              Padding(
                padding: const EdgeInsets.all(8.0),
                child: CircleAvatar(
                  backgroundColor: Colors.black.withOpacity(0.6),
                  child: IconButton(
                    icon: Icon(
                      _isFavorite ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
                      color: _isFavorite ? AppTheme.gold : Colors.white,
                      size: 22,
                    ),
                    onPressed: _toggleFavorite,
                  ),
                ),
              ),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: Stack(
                fit: StackFit.expand,
                children: [
                  if (movie != null)
                    CachedNetworkImage(
                      imageUrl: movie.fullThumbUrl,
                      fit: BoxFit.cover,
                      placeholder: (context, url) => Container(color: AppTheme.card),
                      errorWidget: (context, url, error) => CachedNetworkImage(
                        imageUrl: movie.fullPosterUrl,
                        fit: BoxFit.cover,
                      ),
                    ),
                  // Dark Fade Gradient
                  Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          Color(0x66000000),
                          Color(0x990B0D13),
                          Color(0xFF0B0D13),
                        ],
                        stops: [0.0, 0.7, 1.0],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Content
          SliverToBoxAdapter(
            child: movie == null && _isLoading
                ? const SizedBox(
                    height: 300,
                    child: Center(child: CircularProgressIndicator(color: AppTheme.primary)),
                  )
                : Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Title
                        Text(
                          movie!.name,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 0.3,
                          ),
                        ),
                        if (movie.originName.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            movie.originName,
                            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
                          ),
                        ],
                        const SizedBox(height: 12),

                        // Badges Row
                        Wrap(
                          spacing: 8,
                          runSpacing: 6,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            if (movie.voteAverage > 0)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: AppTheme.gold.withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(4),
                                  border: Border.all(color: AppTheme.gold, width: 0.8),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.star, color: AppTheme.gold, size: 12),
                                    const SizedBox(width: 3),
                                    Text(
                                      movie.voteAverage.toStringAsFixed(1),
                                      style: const TextStyle(color: AppTheme.gold, fontSize: 11, fontWeight: FontWeight.bold),
                                    ),
                                  ],
                                ),
                              ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppTheme.primary.withOpacity(0.2),
                                borderRadius: BorderRadius.circular(4),
                                border: Border.all(color: AppTheme.primary, width: 0.8),
                              ),
                              child: Text(
                                movie.quality.isNotEmpty ? movie.quality : 'FHD',
                                style: const TextStyle(color: AppTheme.primaryLight, fontSize: 11, fontWeight: FontWeight.bold),
                              ),
                            ),
                            if (movie.year != null)
                              _buildMetaChip('${movie.year}'),
                            if (movie.time.isNotEmpty)
                              _buildMetaChip(movie.time),
                            if (movie.episodeCurrent.isNotEmpty)
                              _buildMetaChip(movie.episodeCurrent),
                            if (movie.lang.isNotEmpty)
                              _buildMetaChip(movie.lang),
                          ],
                        ),
                        const SizedBox(height: 18),

                        // Big Action Buttons
                        Row(
                          children: [
                            Expanded(
                              child: ElevatedButton.icon(
                                onPressed: () {
                                  if (_detail != null && _detail!.servers.isNotEmpty) {
                                    if (_lastHistory != null) {
                                      // Search for matching server & episode from history
                                      for (var s in _detail!.servers) {
                                        for (var ep in s.episodes) {
                                          if (ep.slug == _lastHistory!.episodeSlug) {
                                            _playEpisode(ep, s);
                                            return;
                                          }
                                        }
                                      }
                                    }
                                    if (_detail!.servers[_selectedServerIndex].episodes.isNotEmpty) {
                                      _playEpisode(_detail!.servers[_selectedServerIndex].episodes.first);
                                    }
                                  } else {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(content: Text('Đang tải danh sách tập, vui lòng đợi giây lát...')),
                                    );
                                  }
                                },
                                icon: Icon(
                                  _lastHistory != null ? Icons.history_toggle_off_rounded : Icons.play_arrow_rounded,
                                  color: Colors.white,
                                  size: 24,
                                ),
                                label: Text(
                                  _lastHistory != null
                                      ? 'TIẾP TỤC (${_lastHistory!.episodeName.toUpperCase()})'
                                      : 'XEM PHIM NGAY',
                                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                                ),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppTheme.primary,
                                  padding: const EdgeInsets.symmetric(vertical: 13),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 18),

                        // Categories Tags
                        if (movie.categories.isNotEmpty) ...[
                          Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: movie.categories.map((c) {
                              return Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: AppTheme.card,
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(color: AppTheme.border, width: 0.5),
                                ),
                                child: Text(c, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 11)),
                              );
                            }).toList(),
                          ),
                          const SizedBox(height: 16),
                        ],

                        // Synopsis / Nội Dung
                        if (movie.content.isNotEmpty) ...[
                          const Text(
                            'Nội Dung Phim',
                            style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(height: 6),
                          GestureDetector(
                            onTap: () => setState(() => _isDescriptionExpanded = !_isDescriptionExpanded),
                            child: Text(
                              _cleanHtml(movie.content),
                              maxLines: _isDescriptionExpanded ? null : 4,
                              overflow: _isDescriptionExpanded ? TextOverflow.visible : TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: AppTheme.textSecondary,
                                fontSize: 13,
                                height: 1.5,
                              ),
                            ),
                          ),
                          TextButton(
                            onPressed: () => setState(() => _isDescriptionExpanded = !_isDescriptionExpanded),
                            style: TextButton.styleFrom(
                              padding: EdgeInsets.zero,
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                            child: Text(
                              _isDescriptionExpanded ? 'Thu gọn ▲' : 'Xem thêm ▼',
                              style: const TextStyle(color: AppTheme.primaryLight, fontSize: 12),
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],

                        // Actors & Directors Cast Rail
                        _buildCastRail(movie),

                        const Divider(color: AppTheme.border, height: 24),

                        // Episodes Section
                        const Text(
                          'Danh Sách Tập',
                          style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 10),

                        // Server Selector Tabs
                        if (_isLoading)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 24),
                            child: Center(
                              child: CircularProgressIndicator(color: AppTheme.primary),
                            ),
                          )
                        else if (_detail != null && _detail!.servers.isNotEmpty) ...[
                          if (_detail!.servers.length > 1)
                            SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Row(
                                children: List.generate(_detail!.servers.length, (sIdx) {
                                  final server = _detail!.servers[sIdx];
                                  final isSel = sIdx == _selectedServerIndex;
                                  return Padding(
                                    padding: const EdgeInsets.only(right: 8),
                                    child: ChoiceChip(
                                      label: Text(server.serverName),
                                      selected: isSel,
                                      selectedColor: AppTheme.primary,
                                      backgroundColor: AppTheme.card,
                                      labelStyle: TextStyle(
                                        color: isSel ? Colors.white : AppTheme.textSecondary,
                                        fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                                        fontSize: 12,
                                      ),
                                      onSelected: (_) => setState(() => _selectedServerIndex = sIdx),
                                    ),
                                  );
                                }),
                              ),
                            ),
                          const SizedBox(height: 12),

                          // Episodes Grid
                          GridView.builder(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 4,
                              childAspectRatio: 2.2,
                              crossAxisSpacing: 8,
                              mainAxisSpacing: 8,
                            ),
                            itemCount: _detail!.servers[_selectedServerIndex].episodes.length,
                            itemBuilder: (context, eIdx) {
                              final ep = _detail!.servers[_selectedServerIndex].episodes[eIdx];
                              return OutlinedButton(
                                onPressed: () => _playEpisode(ep),
                                style: OutlinedButton.styleFrom(
                                  backgroundColor: AppTheme.card,
                                  side: const BorderSide(color: AppTheme.border),
                                  padding: EdgeInsets.zero,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                ),
                                child: Text(
                                  ep.name,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              );
                            },
                          ),
                        ] else
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 16),
                            child: Text(
                              'Đang cập nhật tập phim...',
                              style: TextStyle(color: AppTheme.textMuted),
                            ),
                          ),

                        const SizedBox(height: 50),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildMetaChip(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: AppTheme.card,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        text,
        style: const TextStyle(color: AppTheme.textSecondary, fontSize: 11),
      ),
    );
  }

  String _cleanHtml(String html) {
    return html.replaceAll(RegExp(r'<[^>]*>'), '').replaceAll('&nbsp;', ' ').trim();
  }

  Widget _buildCastRail(Movie movie) {
    final rawDirectors = movie.directors.where((d) => d.trim().isNotEmpty && d != 'Đang cập nhật').toList();
    final rawActors = movie.actors.where((a) => a.trim().isNotEmpty && a != 'Đang cập nhật').toList();
    if (rawDirectors.isEmpty && rawActors.isEmpty) return const SizedBox.shrink();

    final List<Map<String, dynamic>> items = [
      ...rawDirectors.map((d) => {'name': d.trim(), 'isDirector': true}),
      ...rawActors.map((a) => {'name': a.trim(), 'isDirector': false}),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Đạo Diễn & Diễn Viên',
          style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 116,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 14),
            itemBuilder: (context, index) {
              final item = items[index];
              final name = item['name'] as String;
              final isDirector = item['isDirector'] as bool;
              final avatarUrl = 'https://ui-avatars.com/api/?name=${Uri.encodeComponent(name)}&background=${isDirector ? "e5a914" : "e50914"}&color=fff&size=160&bold=true';

              return GestureDetector(
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => PersonScreen(name: name, isDirector: isDirector),
                    ),
                  );
                },
                child: SizedBox(
                  width: 74,
                  child: Column(
                    children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: isDirector ? AppTheme.gold : AppTheme.primary,
                            width: 2,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: (isDirector ? AppTheme.gold : AppTheme.primary).withOpacity(0.35),
                              blurRadius: 8,
                              offset: const Offset(0, 3),
                            ),
                          ],
                        ),
                        child: ClipOval(
                          child: CachedNetworkImage(
                            imageUrl: avatarUrl,
                            fit: BoxFit.cover,
                            placeholder: (_, __) => Container(color: AppTheme.card),
                            errorWidget: (_, __) => const Icon(Icons.person, color: Colors.white54),
                          ),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          height: 1.15,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        isDirector ? 'Đạo diễn' : 'Diễn viên',
                        style: TextStyle(
                          color: isDirector ? AppTheme.gold : AppTheme.textMuted,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}
