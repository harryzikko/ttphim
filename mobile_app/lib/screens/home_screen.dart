import 'package:flutter/material.dart';
import '../models/movie.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/hero_banner.dart';
import '../widgets/movie_rail.dart';
import '../widgets/top10_reel.dart';
import 'search_screen.dart';

class HomeScreen extends StatefulWidget {
  final Function(int tabIndex)? onNavigateTab;

  const HomeScreen({super.key, this.onNavigateTab});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _isLoading = true;
  List<Movie> _newMovies = [];
  List<Movie> _singleMovies = [];
  List<Movie> _seriesMovies = [];
  List<Movie> _animeMovies = [];

  @override
  void initState() {
    super.initState();
    _loadAllContent();
  }

  Future<void> _loadAllContent() async {
    setState(() => _isLoading = true);

    try {
      final results = await Future.wait([
        ApiService.getNewMovies(page: 1),
        ApiService.getSingleMovies(page: 1),
        ApiService.getSeriesMovies(page: 1),
        ApiService.getAnimeMovies(page: 1),
      ]);

      if (mounted) {
        setState(() {
          _newMovies = results[0];
          _singleMovies = results[1];
          _seriesMovies = results[2];
          _animeMovies = results[3];
          _isLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(
          children: [
            // TTPhim Logo
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                gradient: AppTheme.primaryGradient,
                borderRadius: BorderRadius.circular(6),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.primary.withOpacity(0.4),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: const Text(
                'TT',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 16,
                  letterSpacing: 1,
                ),
              ),
            ),
            const SizedBox(width: 8),
            const Text(
              'Phim',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 20,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(width: 8),
            // VIP Pass 100% Free Tag
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: AppTheme.gold.withOpacity(0.15),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: AppTheme.gold, width: 0.8),
              ),
              child: const Text(
                'VIP MIỄN PHÍ',
                style: TextStyle(
                  color: AppTheme.gold,
                  fontSize: 9,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.search_rounded, color: Colors.white, size: 24),
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const SearchScreen()),
              );
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircularProgressIndicator(color: AppTheme.primary),
                  SizedBox(height: 16),
                  Text('Đang tải danh sách phim...', style: TextStyle(color: AppTheme.textSecondary)),
                ],
              ),
            )
          : RefreshIndicator(
              color: AppTheme.primary,
              backgroundColor: AppTheme.surface,
              onRefresh: _loadAllContent,
              child: ListView(
                physics: const BouncingScrollPhysics(),
                children: [
                  // Spotlight Hero Banner
                  HeroBanner(movies: _newMovies),

                  const SizedBox(height: 12),

                  // Top 10 Today Reel
                  Top10Reel(movies: _newMovies),

                  const SizedBox(height: 16),

                  // Rail 1: Phim Mới Cập Nhật
                  MovieRail(
                    title: 'Phim Mới Cập Nhật',
                    subtitle: 'Kho phim mới nhất hôm nay',
                    movies: _newMovies,
                    onSeeAll: () => widget.onNavigateTab?.call(1),
                  ),

                  const SizedBox(height: 12),

                  // Rail 2: Phim Chiếu Rạp & Phim Lẻ
                  MovieRail(
                    title: 'Phim Lẻ Tuyển Chọn',
                    subtitle: 'Bom tấn điện ảnh đỉnh cao',
                    movies: _singleMovies,
                    onSeeAll: () => widget.onNavigateTab?.call(1),
                  ),

                  const SizedBox(height: 12),

                  // Rail 3: Phim Bộ Đang Hot
                  MovieRail(
                    title: 'Phim Bộ Đặc Sắc',
                    subtitle: 'Cập nhật từng tập liên tục',
                    movies: _seriesMovies,
                    onSeeAll: () => widget.onNavigateTab?.call(1),
                  ),

                  const SizedBox(height: 12),

                  // Rail 4: Anime & Hoạt Hình
                  MovieRail(
                    title: 'Anime & Hoạt Hình',
                    subtitle: 'Thế giới hoạt họa muôn màu',
                    movies: _animeMovies,
                    onSeeAll: () => widget.onNavigateTab?.call(1),
                  ),

                  const SizedBox(height: 36),
                ],
              ),
            ),
    );
  }
}
