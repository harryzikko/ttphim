import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/movie.dart';
import '../../models/movie_detail.dart';
import '../../services/api_service.dart';
import '../../services/storage_service.dart';
import '../../theme/app_theme.dart';
import '../person_screen.dart';
import 'tv_player_screen.dart';

class TvDetailScreen extends StatefulWidget {
  final Movie movie;

  const TvDetailScreen({
    super.key,
    required this.movie,
  });

  @override
  State<TvDetailScreen> createState() => _TvDetailScreenState();
}

class _TvDetailScreenState extends State<TvDetailScreen> {
  MovieDetailResponse? _detail;
  bool _isLoading = true;
  int _selectedServerIndex = 0;
  WatchHistory? _history;
  bool _isFavorite = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);

    final res = await ApiService.getMovieDetail(widget.movie.slug);
    final hist = await StorageService.getHistoryForMovie(widget.movie.slug);
    final fav = await StorageService.isFavorite(widget.movie.slug);

    if (mounted) {
      setState(() {
        _detail = res;
        _history = hist;
        _isFavorite = fav;
        _isLoading = false;
      });
    }
  }

  void _playEpisode(EpisodeItem episode) {
    if (_detail == null || _detail!.servers.isEmpty) return;
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => TvPlayerScreen(
          movie: _detail!.movie,
          servers: _detail!.servers,
          initialServer: _detail!.servers[_selectedServerIndex],
          initialEpisode: episode,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final movie = _detail?.movie ?? widget.movie;
    final backdrop = movie.thumbUrl.isNotEmpty ? movie.thumbUrl : movie.posterUrl;

    return Scaffold(
      backgroundColor: const Color(0xFF0C0E17),
      body: Stack(
        fit: StackFit.expand,
        children: [
          // 1. Fullscreen Widescreen Backdrop Banner
          Positioned.fill(
            child: CachedNetworkImage(
              imageUrl: backdrop,
              fit: BoxFit.cover,
              placeholder: (_, __) => Container(color: const Color(0xFF0C0E17)),
              errorWidget: (_, __) => Container(color: const Color(0xFF0C0E17)),
            ),
          ),

          // 2. Cinematic Scrims
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    const Color(0xFF0C0E17),
                    const Color(0xFF0C0E17).withOpacity(0.92),
                    const Color(0xFF0C0E17).withOpacity(0.4),
                    Colors.transparent,
                  ],
                  stops: const [0.0, 0.45, 0.75, 1.0],
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                ),
              ),
            ),
          ),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.transparent,
                    const Color(0xFF0C0E17).withOpacity(0.7),
                    const Color(0xFF0C0E17),
                  ],
                  stops: const [0.5, 0.8, 1.0],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ),

          // 3. 10-Foot Content Scroll
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 24),
              child: CustomScrollView(
                slivers: [
                  // Top Back & Time Header
                  SliverToBoxAdapter(
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.arrow_back_rounded, color: Colors.white, size: 28),
                          onPressed: () => Navigator.pop(context),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                          decoration: BoxDecoration(
                            color: Colors.white10,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.tv_rounded, color: AppTheme.primary, size: 16),
                              const SizedBox(width: 8),
                              const Text('Android TV Edition', style: TextStyle(color: Colors.white70, fontSize: 12)),
                              const SizedBox(width: 14),
                              Text(TimeOfDay.now().format(context), style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Hero Details Info
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.only(top: 24, bottom: 20),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 720),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            // Badges
                            Row(
                              children: [
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: AppTheme.primary,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    movie.quality.isNotEmpty ? movie.quality : '4K UHD',
                                    style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w900),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                if (movie.voteAverage > 0) ...[
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: Colors.black54,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Row(
                                      children: [
                                        const Icon(Icons.star_rounded, color: AppTheme.gold, size: 14),
                                        const SizedBox(width: 4),
                                        Text(
                                          movie.voteAverage.toStringAsFixed(1),
                                          style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                ],
                                if (movie.year != null) ...[
                                  Text('${movie.year}', style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.bold)),
                                  const SizedBox(width: 8),
                                ],
                                Text(
                                  movie.episodeCurrent.isNotEmpty ? movie.episodeCurrent : 'Bản Đẹp',
                                  style: const TextStyle(color: AppTheme.primaryLight, fontSize: 12, fontWeight: FontWeight.bold),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),

                            // Title
                            Text(
                              movie.name,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 36,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -0.5,
                                shadows: [
                                  Shadow(color: Colors.black, blurRadius: 10),
                                ],
                              ),
                            ),
                            if (movie.originName.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                movie.originName,
                                style: const TextStyle(color: Colors.white54, fontSize: 16, fontWeight: FontWeight.w500),
                              ),
                            ],
                            const SizedBox(height: 14),

                            // Synopsis
                            Text(
                              movie.content.isNotEmpty
                                  ? movie.content.replaceAll(RegExp(r'<[^>]*>'), '').trim()
                                  : 'Khám phá thế giới điện ảnh sắc nét với độ phân giải cao và âm thanh vòm sống động trên TTPhim Android TV.',
                              maxLines: 4,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white70, fontSize: 14, height: 1.5),
                            ),
                            const SizedBox(height: 24),

                            // D-pad Action Buttons
                            Row(
                              children: [
                                ElevatedButton.icon(
                                  autofocus: true,
                                  onPressed: () {
                                    if (_detail != null && _detail!.servers.isNotEmpty && _detail!.servers[_selectedServerIndex].episodes.isNotEmpty) {
                                      _playEpisode(_detail!.servers[_selectedServerIndex].episodes.first);
                                    }
                                  },
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AppTheme.primary,
                                    foregroundColor: Colors.white,
                                    padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 16),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                    elevation: 8,
                                    shadowColor: AppTheme.primary.withOpacity(0.6),
                                  ),
                                  icon: const Icon(Icons.play_arrow_rounded, size: 28),
                                  label: Text(
                                    _history != null ? 'TIẾP TỤC (${_history!.episodeName.toUpperCase()})' : 'XEM NGAY',
                                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900),
                                  ),
                                ),
                                const SizedBox(width: 16),
                                OutlinedButton.icon(
                                  onPressed: () async {
                                    await StorageService.toggleFavorite(movie);
                                    final fav = await StorageService.isFavorite(movie.slug);
                                    if (mounted) setState(() => _isFavorite = fav);
                                  },
                                  style: OutlinedButton.styleFrom(
                                    foregroundColor: Colors.white,
                                    side: const BorderSide(color: Colors.white24, width: 1.5),
                                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                  ),
                                  icon: Icon(_isFavorite ? Icons.bookmark_added_rounded : Icons.bookmark_add_outlined, size: 22, color: _isFavorite ? AppTheme.gold : Colors.white),
                                  label: Text(_isFavorite ? 'Đã Lưu' : 'Danh Sách Của Tôi'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  // TMDb Cast & Crew Rail
                  if (movie.castMembers.isNotEmpty)
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.only(top: 20, bottom: 24),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'ĐẠO DIỄN & DIỄN VIÊN (TMDb Verified)',
                              style: TextStyle(color: AppTheme.gold, fontSize: 13, fontWeight: FontWeight.bold, letterSpacing: 1),
                            ),
                            const SizedBox(height: 14),
                            SizedBox(
                              height: 110,
                              child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                itemCount: movie.castMembers.length,
                                separatorBuilder: (_, __) => const SizedBox(width: 16),
                                itemBuilder: (context, idx) {
                                  final person = movie.castMembers[idx];
                                  return GestureDetector(
                                    onTap: () {
                                      Navigator.push(
                                        context,
                                        MaterialPageRoute(
                                          builder: (_) => PersonScreen(name: person.name, isDirector: person.isDirector),
                                        ),
                                      );
                                    },
                                    child: Row(
                                      children: [
                                        ClipOval(
                                          child: CachedNetworkImage(
                                            imageUrl: person.avatar,
                                            width: 60,
                                            height: 60,
                                            fit: BoxFit.cover,
                                            errorWidget: (_, __) => const Icon(Icons.person, color: Colors.white38),
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          mainAxisAlignment: MainAxisAlignment.center,
                                          children: [
                                            Text(person.name, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
                                            Text(
                                              person.character.isNotEmpty ? person.character : (person.isDirector ? 'Đạo diễn' : 'Diễn viên'),
                                              style: const TextStyle(color: Colors.white54, fontSize: 11),
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  );
                                },
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),

                  // Episodes Rail
                  if (_isLoading)
                    const SliverToBoxAdapter(
                      child: Center(child: CircularProgressIndicator(color: AppTheme.primary)),
                    )
                  else if (_detail != null && _detail!.servers.isNotEmpty) ...[
                    SliverToBoxAdapter(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Text(
                                'DANH SÁCH TẬP PHIM',
                                style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w900, letterSpacing: 1),
                              ),
                              const SizedBox(width: 20),
                              // Server Chips
                              ...List.generate(_detail!.servers.length, (sIdx) {
                                final isSel = sIdx == _selectedServerIndex;
                                return Padding(
                                  padding: const EdgeInsets.only(right: 8),
                                  child: ChoiceChip(
                                    label: Text(_detail!.servers[sIdx].serverName),
                                    selected: isSel,
                                    selectedColor: AppTheme.primary,
                                    backgroundColor: const Color(0xFF191B24),
                                    labelStyle: TextStyle(
                                      color: isSel ? Colors.white : Colors.white70,
                                      fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                                    ),
                                    onSelected: (_) => setState(() => _selectedServerIndex = sIdx),
                                  ),
                                );
                              }),
                            ],
                          ),
                          const SizedBox(height: 16),
                        ],
                      ),
                    ),

                    SliverGrid(
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 8,
                        childAspectRatio: 2.2,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, eIdx) {
                          final ep = _detail!.servers[_selectedServerIndex].episodes[eIdx];
                          return Focus(
                            child: Builder(
                              builder: (ctx) {
                                final isFocused = Focus.of(ctx).hasFocus;
                                return AnimatedScale(
                                  scale: isFocused ? 1.08 : 1.0,
                                  duration: const Duration(milliseconds: 150),
                                  child: ElevatedButton(
                                    onPressed: () => _playEpisode(ep),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: isFocused ? AppTheme.primary : const Color(0xFF191B24),
                                      foregroundColor: Colors.white,
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(10),
                                        side: BorderSide(
                                          color: isFocused ? AppTheme.gold : Colors.white12,
                                          width: isFocused ? 2 : 1,
                                        ),
                                      ),
                                    ),
                                    child: Text(
                                      ep.name,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                        fontWeight: isFocused ? FontWeight.w900 : FontWeight.w600,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                                );
                              },
                            ),
                          );
                        },
                        childCount: _detail!.servers[_selectedServerIndex].episodes.length,
                      ),
                    ),
                    const SliverToBoxAdapter(child: SizedBox(height: 40)),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
