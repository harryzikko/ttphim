import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/movie.dart';
import '../../services/api_service.dart';
import '../../services/storage_service.dart';
import '../../theme/app_theme.dart';
import 'tv_card.dart';
import 'tv_detail_screen.dart';

class TvHomeScreen extends StatefulWidget {
  final Function(Movie) onMovieSelect;

  const TvHomeScreen({
    super.key,
    required this.onMovieSelect,
  });

  @override
  State<TvHomeScreen> createState() => _TvHomeScreenState();
}

class _TvHomeScreenState extends State<TvHomeScreen> {
  bool _isLoading = true;
  Movie? _spotlight;
  List<Movie> _historyMovies = [];
  List<Movie> _trendingMovies = [];
  List<Movie> _singleMovies = [];
  List<Movie> _seriesMovies = [];
  List<Movie> _animeMovies = [];

  @override
  void initState() {
    super.initState();
    _loadAllRails();
  }

  Future<void> _loadAllRails() async {
    setState(() => _isLoading = true);

    final history = await StorageService.getHistory();
    List<Movie> histMovies = [];
    for (var h in history.take(6)) {
      histMovies.add(
        Movie(
          id: h.movieSlug,
          name: h.movieName,
          slug: h.movieSlug,
          originName: h.episodeName,
          posterUrl: h.posterUrl,
          thumbUrl: h.thumbUrl,
          quality: 'FHD',
        ),
      );
    }

    // Load feeds
    final featured = await ApiService.getFeaturedMovies();
    final singles = await ApiService.getSingleMovies();
    final series = await ApiService.getSeriesMovies();
    final anime = await ApiService.getAnimeMovies();

    if (mounted) {
      setState(() {
        _historyMovies = histMovies;
        _trendingMovies = featured;
        _spotlight = featured.isNotEmpty ? featured.first : (singles.isNotEmpty ? singles.first : null);
        _singleMovies = singles;
        _seriesMovies = series;
        _animeMovies = anime;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: AppTheme.primary, strokeWidth: 3.5),
            SizedBox(height: 16),
            Text('Đang tải danh mục rạp phim Android TV...', style: TextStyle(color: Colors.white70, fontSize: 13)),
          ],
        ),
      );
    }

    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 1. LEANBACK HERO BILLBOARD
          if (_spotlight != null) _buildHeroBillboard(_spotlight!),

          const SizedBox(height: 24),

          // 2. RAIL: TIẾP TỤC XEM DỞ
          if (_historyMovies.isNotEmpty) ...[
            _buildRailHeader('Tiếp Tục Xem Dở', Icons.history_rounded),
            _buildMovieRail(_historyMovies, showProgress: true),
            const SizedBox(height: 24),
          ],

          // 3. RAIL: THỊNH HÀNH HÔM NAY
          if (_trendingMovies.isNotEmpty) ...[
            _buildRailHeader('Thịnh Hành Hôm Nay', Icons.local_fire_department_rounded),
            _buildMovieRail(_trendingMovies),
            const SizedBox(height: 24),
          ],

          // 4. RAIL: PHIM CHIẾU RẠP & PHIM LẺ
          if (_singleMovies.isNotEmpty) ...[
            _buildRailHeader('Phim Chiếu Rạp Bom Tấn', Icons.movie_filter_rounded),
            _buildMovieRail(_singleMovies),
            const SizedBox(height: 24),
          ],

          // 5. RAIL: PHIM BỘ ĐẶC SẮC
          if (_seriesMovies.isNotEmpty) ...[
            _buildRailHeader('Phim Bộ Đặc Sắc', Icons.tv_rounded),
            _buildMovieRail(_seriesMovies),
            const SizedBox(height: 24),
          ],

          // 6. RAIL: HOẠT HÌNH & ANIME
          if (_animeMovies.isNotEmpty) ...[
            _buildRailHeader('Hoạt Hình & Anime Nhật Bản', Icons.animation_rounded),
            _buildMovieRail(_animeMovies),
            const SizedBox(height: 48),
          ],
        ],
      ),
    );
  }

  Widget _buildHeroBillboard(Movie m) {
    final backdrop = m.thumbUrl.isNotEmpty ? m.thumbUrl : m.posterUrl;

    return Container(
      height: 440,
      width: double.infinity,
      decoration: BoxDecoration(
        color: const Color(0xFF0C0E17),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Backdrop Image
          ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: CachedNetworkImage(
              imageUrl: backdrop,
              fit: BoxFit.cover,
              errorWidget: (_, __) => Container(color: const Color(0xFF191B24)),
            ),
          ),

          // Gradient Overlay
          ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    const Color(0xFF0C0E17),
                    const Color(0xFF0C0E17).withOpacity(0.85),
                    Colors.transparent,
                  ],
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                  stops: const [0.0, 0.45, 1.0],
                ),
              ),
            ),
          ),
          ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: Container(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.transparent,
                    const Color(0xFF0C0E17).withOpacity(0.9),
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  stops: const [0.6, 1.0],
                ),
              ),
            ),
          ),

          // Spotlight Metadata
          Positioned(
            left: 44,
            bottom: 36,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 620),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppTheme.primary,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(color: AppTheme.primary.withOpacity(0.5), blurRadius: 10),
                          ],
                        ),
                        child: const Row(
                          children: [
                            Icon(Icons.local_fire_department_rounded, color: Colors.white, size: 14),
                            SizedBox(width: 4),
                            Text('TOP #1 THỊNH HÀNH', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1)),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text('4K DOLBY ATMOS', style: TextStyle(color: AppTheme.cyan, fontSize: 10, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    m.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 34,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.5,
                      shadows: [Shadow(color: Colors.black, blurRadius: 10)],
                    ),
                  ),
                  if (m.originName.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      '${m.originName} (${m.year ?? 2026})',
                      style: const TextStyle(color: Colors.white70, fontSize: 14, fontWeight: FontWeight.w500),
                    ),
                  ],
                  const SizedBox(height: 10),
                  Text(
                    m.content.isNotEmpty
                        ? m.content.replaceAll(RegExp(r'<[^>]*>'), '').trim()
                        : 'Thưởng thức siêu phẩm điện ảnh chuẩn rạp chất lượng cao tại TTPhim.',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white60, fontSize: 13, height: 1.4),
                  ),
                  const SizedBox(height: 18),
                  Row(
                    children: [
                      Focus(
                        autofocus: true,
                        child: Builder(
                          builder: (ctx) {
                            final isFocused = Focus.of(ctx).hasFocus;
                            return ElevatedButton.icon(
                              onPressed: () => widget.onMovieSelect(m),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: isFocused ? Colors.white : AppTheme.primary,
                                foregroundColor: isFocused ? Colors.black : Colors.white,
                                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                elevation: isFocused ? 12 : 4,
                              ),
                              icon: const Icon(Icons.play_arrow_rounded, size: 24),
                              label: const Text('Xem Ngay', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14)),
                            );
                          },
                        ),
                      ),
                      const SizedBox(width: 14),
                      Focus(
                        child: Builder(
                          builder: (ctx) {
                            final isFocused = Focus.of(ctx).hasFocus;
                            return OutlinedButton.icon(
                              onPressed: () => widget.onMovieSelect(m),
                              style: OutlinedButton.styleFrom(
                                backgroundColor: isFocused ? Colors.white12 : Colors.transparent,
                                foregroundColor: Colors.white,
                                side: BorderSide(color: isFocused ? AppTheme.primary : Colors.white24, width: 1.5),
                                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              ),
                              icon: const Icon(Icons.info_outline_rounded, size: 20),
                              label: const Text('Chi Tiết', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRailHeader(String title, IconData icon) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            width: 3.5,
            height: 18,
            decoration: BoxDecoration(
              color: AppTheme.primary,
              borderRadius: BorderRadius.circular(2),
              boxShadow: [
                BoxShadow(color: AppTheme.primary.withOpacity(0.8), blurRadius: 6),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Icon(icon, color: AppTheme.primaryLight, size: 18),
          const SizedBox(width: 8),
          Text(
            title,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMovieRail(List<Movie> movies, {bool showProgress = false}) {
    return SizedBox(
      height: 250,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        itemCount: movies.length,
        separatorBuilder: (_, __) => const SizedBox(width: 16),
        itemBuilder: (context, index) {
          final movie = movies[index];
          return TvMovieCard(
            movie: movie,
            showProgress: showProgress,
            progress: 0.65,
            onSelect: () => widget.onMovieSelect(movie),
          );
        },
      ),
    );
  }
}
