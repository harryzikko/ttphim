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
  List<Map<String, dynamic>> _seasons = [];
  int _selectedEpisodeTab = 0;
  static const int _episodesPerChunk = 50;

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
      try {
        final newState = await StorageService.toggleFavorite(movieToSave);
        if (!mounted) return;
        setState(() => _isFavorite = newState);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(newState ? 'Đã thêm vào danh sách yêu thích' : 'Đã xóa khỏi danh sách yêu thích'),
          backgroundColor: AppTheme.surface, duration: const Duration(seconds: 2),
        ));
      } catch (error) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
      }
    }
  }

  Future<void> _fetchDetail() async {
    final res = await ApiService.getMovieDetail(widget.slug);
    final seasons = await ApiService.getMovieSeasons(widget.slug);
    if (mounted) {
      setState(() {
        _detail = res;
        _seasons = seasons;
        _isLoading = false;
      });
    }
  }

  String _getCurrentSeasonLabel() {
    for (final s in _seasons) {
      if (s['slug'] == widget.slug || s['is_current'] == true) {
        return s['label']?.toString() ?? s['name']?.toString() ?? 'Chọn Phần';
      }
    }
    return _seasons.isNotEmpty ? (_seasons.first['label']?.toString() ?? 'Chọn Phần') : 'Chọn Phần';
  }

  void _showSeasonSelector() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF141722),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.layers_rounded, color: AppTheme.primary, size: 20),
                const SizedBox(width: 8),
                const Text(
                  'Chọn Mùa / Phần Phim',
                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close_rounded, color: Colors.white54, size: 20),
                  onPressed: () => Navigator.pop(ctx),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ConstrainedBox(
              constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.45),
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: _seasons.length,
                separatorBuilder: (_, __) => const Divider(color: AppTheme.border, height: 1),
                itemBuilder: (context, idx) {
                  final s = _seasons[idx];
                  final isCurrent = s['slug'] == widget.slug || s['is_current'] == true;
                  final label = s['label']?.toString() ?? s['name']?.toString() ?? 'Phần ${idx + 1}';
                  return ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    title: Text(
                      label,
                      style: TextStyle(
                        color: isCurrent ? AppTheme.primaryLight : Colors.white,
                        fontWeight: isCurrent ? FontWeight.bold : FontWeight.w500,
                        fontSize: 14,
                      ),
                    ),
                    trailing: isCurrent
                        ? const Icon(Icons.check_circle_rounded, color: AppTheme.primary, size: 20)
                        : null,
                    onTap: () {
                      Navigator.pop(ctx);
                      if (!isCurrent) {
                        Navigator.pushReplacement(
                          context,
                          MaterialPageRoute(
                            builder: (_) => MovieDetailScreen(slug: s['slug'].toString()),
                          ),
                        );
                      }
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
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
                        Row(
                          children: [
                            const Text(
                              'Danh Sách Tập',
                              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                            ),
                            const Spacer(),
                            if (_detail != null && _detail!.servers.isNotEmpty)
                              Text(
                                '${_detail!.servers[_selectedServerIndex].episodes.length} tập',
                                style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12),
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),

                        // Netflix-Style Season Selector Button
                        if (_seasons.length > 1) ...[
                          GestureDetector(
                            onTap: _showSeasonSelector,
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 12),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              decoration: BoxDecoration(
                                color: AppTheme.card,
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: AppTheme.primary.withOpacity(0.5), width: 1),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.layers_rounded, color: AppTheme.primary, size: 18),
                                  const SizedBox(width: 8),
                                  Flexible(
                                    child: Text(
                                      _getCurrentSeasonLabel(),
                                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  const Icon(Icons.expand_more_rounded, color: AppTheme.textSecondary, size: 18),
                                ],
                              ),
                            ),
                          ),
                        ],

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
                                  final sLabel = '${server.serverName} (${server.episodes.length})';
                                  return Padding(
                                    padding: const EdgeInsets.only(right: 8),
                                    child: ChoiceChip(
                                      label: Text(sLabel),
                                      selected: isSel,
                                      selectedColor: AppTheme.primary,
                                      backgroundColor: AppTheme.card,
                                      labelStyle: TextStyle(
                                        color: isSel ? Colors.white : AppTheme.textSecondary,
                                        fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                                        fontSize: 12,
                                      ),
                                      onSelected: (_) => setState(() {
                                        _selectedServerIndex = sIdx;
                                        _selectedEpisodeTab = 0;
                                      }),
                                    ),
                                  );
                                }),
                              ),
                            ),
                          const SizedBox(height: 12),

                          // Smart Episode Chunk Tabs (for > 25 episodes)
                          () {
                            final currentEpisodes = _detail!.servers[_selectedServerIndex].episodes;
                            final totalChunks = (currentEpisodes.length / _episodesPerChunk).ceil();
                            if (totalChunks <= 1) return const SizedBox.shrink();

                            return Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: Row(
                                  children: List.generate(totalChunks, (chunkIdx) {
                                    final start = chunkIdx * _episodesPerChunk + 1;
                                    final end = (chunkIdx + 1) * _episodesPerChunk > currentEpisodes.length
                                        ? currentEpisodes.length
                                        : (chunkIdx + 1) * _episodesPerChunk;
                                    final isSel = chunkIdx == _selectedEpisodeTab;
                                    return Padding(
                                      padding: const EdgeInsets.only(right: 8),
                                      child: ChoiceChip(
                                        label: Text('Tập $start - $end'),
                                        selected: isSel,
                                        selectedColor: AppTheme.surface,
                                        backgroundColor: AppTheme.card,
                                        side: BorderSide(color: isSel ? AppTheme.primary : AppTheme.border, width: isSel ? 1.5 : 0.5),
                                        labelStyle: TextStyle(
                                          color: isSel ? AppTheme.primaryLight : AppTheme.textSecondary,
                                          fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                                          fontSize: 11,
                                        ),
                                        onSelected: (_) => setState(() => _selectedEpisodeTab = chunkIdx),
                                      ),
                                    );
                                  }),
                                ),
                              ),
                            );
                          }(),

                          // Episodes Grid (Slice current chunk)
                          () {
                            final currentEpisodes = _detail!.servers[_selectedServerIndex].episodes;
                            final totalChunks = (currentEpisodes.length / _episodesPerChunk).ceil();
                            final displayedEpisodes = totalChunks > 1
                                ? currentEpisodes.skip(_selectedEpisodeTab * _episodesPerChunk).take(_episodesPerChunk).toList()
                                : currentEpisodes;

                            return GridView.builder(
                              shrinkWrap: true,
                              physics: const NeverScrollableScrollPhysics(),
                              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 4,
                                childAspectRatio: 2.2,
                                crossAxisSpacing: 8,
                                mainAxisSpacing: 8,
                              ),
                              itemCount: displayedEpisodes.length,
                              itemBuilder: (context, eIdx) {
                                final ep = displayedEpisodes[eIdx];
                                final isWatched = _lastHistory?.episodeSlug == ep.slug;
                                return OutlinedButton(
                                  onPressed: () => _playEpisode(ep),
                                  style: OutlinedButton.styleFrom(
                                    backgroundColor: isWatched ? AppTheme.primary.withOpacity(0.15) : AppTheme.card,
                                    side: BorderSide(color: isWatched ? AppTheme.primary : AppTheme.border, width: isWatched ? 1.2 : 0.5),
                                    padding: EdgeInsets.zero,
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                  ),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      if (isWatched) ...[
                                        const Icon(Icons.play_arrow_rounded, color: AppTheme.primary, size: 14),
                                        const SizedBox(width: 2),
                                      ],
                                      Text(
                                        ep.name,
                                        style: TextStyle(
                                          color: isWatched ? AppTheme.primaryLight : Colors.white,
                                          fontSize: 12,
                                          fontWeight: isWatched ? FontWeight.bold : FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              },
                            );
                          }(),
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
    final List<Map<String, dynamic>> items = [];

    if (movie.castMembers.isNotEmpty) {
      for (final m in movie.castMembers) {
        items.add({
          'name': m.name,
          'isDirector': m.isDirector,
          'role': m.character.isNotEmpty ? m.character : (m.isDirector ? 'Đạo Diễn' : 'Diễn Viên'),
          'avatar': m.avatar.isNotEmpty
              ? m.avatar
              : 'https://ui-avatars.com/api/?name=${Uri.encodeComponent(m.name)}&background=${m.isDirector ? "e5a914" : "e50914"}&color=fff&size=160&bold=true',
        });
      }
    } else {
      final rawDirectors = movie.directors.where((d) => d.trim().isNotEmpty && d != 'Đang cập nhật').toList();
      final rawActors = movie.actors.where((a) => a.trim().isNotEmpty && a != 'Đang cập nhật').toList();
      if (rawDirectors.isEmpty && rawActors.isEmpty) return const SizedBox.shrink();

      for (final d in rawDirectors) {
        items.add({
          'name': d.trim(),
          'isDirector': true,
          'role': 'Đạo Diễn',
          'avatar': 'https://ui-avatars.com/api/?name=${Uri.encodeComponent(d)}&background=e5a914&color=fff&size=160&bold=true',
        });
      }
      for (final a in rawActors) {
        items.add({
          'name': a.trim(),
          'isDirector': false,
          'role': 'Diễn Viên',
          'avatar': 'https://ui-avatars.com/api/?name=${Uri.encodeComponent(a)}&background=e50914&color=fff&size=160&bold=true',
        });
      }
    }

    if (items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Đạo Diễn & Diễn Viên',
              style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
            ),
            Text(
              'TMDb Verified',
              style: TextStyle(color: AppTheme.gold.withOpacity(0.8), fontSize: 11, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        const SizedBox(height: 12),
        SizedBox(
          height: 124,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            itemCount: items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 14),
            itemBuilder: (context, index) {
              final item = items[index];
              final name = item['name'] as String;
              final isDirector = item['isDirector'] as bool;
              final role = item['role'] as String;
              final avatarUrl = item['avatar'] as String;

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
                  width: 78,
                  child: Column(
                    children: [
                      Container(
                        width: 58,
                        height: 58,
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
                            errorWidget: (_, __, ___) => const Icon(Icons.person, color: Colors.white54),
                          ),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        role,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
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
