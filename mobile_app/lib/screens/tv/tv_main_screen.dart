import 'package:flutter/material.dart';
import '../../models/movie.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import 'tv_card.dart';
import 'tv_detail_screen.dart';
import 'tv_home_screen.dart';
import 'tv_qr_login_screen.dart';

class TvMainScreen extends StatefulWidget {
  const TvMainScreen({super.key});

  @override
  State<TvMainScreen> createState() => _TvMainScreenState();
}

class _TvMainScreenState extends State<TvMainScreen> {
  int _selectedNavIndex = 0;
  bool _isSidebarExpanded = false;

  final List<Map<String, dynamic>> _navItems = [
    {'title': 'Trang Chủ', 'icon': Icons.home_rounded},
    {'title': 'Khám Phá', 'icon': Icons.grid_view_rounded},
    {'title': 'Tìm Kiếm', 'icon': Icons.search_rounded},
    {'title': 'Đăng Nhập QR', 'icon': Icons.qr_code_scanner_rounded},
  ];

  void _onMovieSelected(Movie movie) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => TvDetailScreen(movie: movie),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0C0E17),
      body: Row(
        children: [
          // 1. LEANBACK D-PAD SIDEBAR
          AnimatedContainer(
            duration: const Duration(milliseconds: 240),
            curve: Curves.easeOutCubic,
            width: _isSidebarExpanded ? 240 : 80,
            decoration: BoxDecoration(
              color: const Color(0xFF11131C).withOpacity(0.95),
              border: Border(
                right: BorderSide(color: Colors.white.withOpacity(0.06)),
              ),
            ),
            child: Focus(
              onFocusChange: (hasParentFocus) {
                setState(() => _isSidebarExpanded = hasParentFocus);
              },
              child: Column(
                children: [
                  const SizedBox(height: 28),
                  // App Brand Logo
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: AppTheme.primary,
                          borderRadius: BorderRadius.circular(12),
                          boxShadow: [
                            BoxShadow(color: AppTheme.primary.withOpacity(0.5), blurRadius: 16),
                          ],
                        ),
                        child: const Icon(Icons.movie_rounded, color: Colors.white, size: 24),
                      ),
                      if (_isSidebarExpanded) ...[
                        const SizedBox(width: 12),
                        const Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'TTPHIM',
                              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: 1),
                            ),
                            Text(
                              'TV EDITION',
                              style: TextStyle(color: AppTheme.cyan, fontWeight: FontWeight.bold, fontSize: 9, letterSpacing: 1.5),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),

                  const SizedBox(height: 36),

                  // Navigation Tabs
                  Expanded(
                    child: ListView.separated(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      itemCount: _navItems.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, index) {
                        final item = _navItems[index];
                        final isSelected = index == _selectedNavIndex;

                        return Focus(
                          onFocusChange: (focused) {
                            if (focused) {
                              setState(() {
                                _selectedNavIndex = index;
                                _isSidebarExpanded = true;
                              });
                            }
                          },
                          child: Builder(
                            builder: (ctx) {
                              final isFocused = Focus.of(ctx).hasFocus;
                              return GestureDetector(
                                onTap: () => setState(() => _selectedNavIndex = index),
                                child: AnimatedContainer(
                                  duration: const Duration(milliseconds: 150),
                                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                  decoration: BoxDecoration(
                                    color: isSelected
                                        ? AppTheme.primary
                                        : (isFocused ? Colors.white12 : Colors.transparent),
                                    borderRadius: BorderRadius.circular(12),
                                    border: Border.all(
                                      color: isFocused ? Colors.white : Colors.transparent,
                                      width: 1.5,
                                    ),
                                    boxShadow: isSelected
                                        ? [
                                            BoxShadow(color: AppTheme.primary.withOpacity(0.4), blurRadius: 10),
                                          ]
                                        : null,
                                  ),
                                  child: Row(
                                    mainAxisAlignment: _isSidebarExpanded ? MainAxisAlignment.start : MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        item['icon'] as IconData,
                                        color: isSelected ? Colors.white : (isFocused ? Colors.white : Colors.white60),
                                        size: 22,
                                      ),
                                      if (_isSidebarExpanded) ...[
                                        const SizedBox(width: 14),
                                        Text(
                                          item['title'] as String,
                                          style: TextStyle(
                                            color: isSelected ? Colors.white : (isFocused ? Colors.white : Colors.white70),
                                            fontWeight: isSelected ? FontWeight.w900 : FontWeight.w600,
                                            fontSize: 13,
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
                        );
                      },
                    ),
                  ),

                  // TV Clock
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.wifi_rounded, color: AppTheme.cyan, size: 16),
                        if (_isSidebarExpanded) ...[
                          const SizedBox(width: 8),
                          Text(
                            TimeOfDay.now().format(context),
                            style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // 2. MAIN 10-FOOT VIEW CANVAS
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(36, 28, 36, 16),
              child: _buildCurrentView(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCurrentView() {
    switch (_selectedNavIndex) {
      case 0:
        return TvHomeScreen(onMovieSelect: _onMovieSelected);
      case 1:
        return _buildTvExploreView();
      case 2:
        return _buildTvSearchView();
      case 3:
        return TvQrLoginScreen(
          onLoginSuccess: () {
            setState(() => _selectedNavIndex = 0);
          },
          onSkip: () {
            setState(() => _selectedNavIndex = 0);
          },
        );
      default:
        return TvHomeScreen(onMovieSelect: _onMovieSelected);
    }
  }

  Widget _buildTvExploreView() {
    return FutureBuilder<List<Movie>>(
      future: ApiService.getSingleMovies(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator(color: AppTheme.primary));
        }
        final movies = snapshot.data!;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'KHÁM PHÁ DANH MỤC PHIM',
              style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 0.5),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: GridView.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 6,
                  childAspectRatio: 0.65,
                  crossAxisSpacing: 16,
                  mainAxisSpacing: 16,
                ),
                itemCount: movies.length,
                itemBuilder: (context, idx) {
                  return TvMovieCard(
                    movie: movies[idx],
                    onSelect: () => _onMovieSelected(movies[idx]),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildTvSearchView() {
    final searchCtrl = TextEditingController();
    return StatefulBuilder(
      builder: (context, setInnerState) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'TÌM KIẾM PHIM TRÊN ANDROID TV',
              style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 0.5),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: const Color(0xFF191B24),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white12),
              ),
              child: TextField(
                controller: searchCtrl,
                style: const TextStyle(color: Colors.white, fontSize: 16),
                decoration: const InputDecoration(
                  hintText: 'Nhập tên phim, diễn viên hoặc đạo diễn...',
                  hintStyle: TextStyle(color: Colors.white38),
                  border: InputBorder.none,
                  icon: Icon(Icons.search, color: AppTheme.primary),
                ),
                onSubmitted: (query) async {
                  if (query.trim().isEmpty) return;
                  final results = await ApiService.searchMovies(query);
                  if (mounted) {
                    showDialog(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        backgroundColor: const Color(0xFF141722),
                        title: Text('Kết quả tìm kiếm cho: $query', style: const TextStyle(color: Colors.white)),
                        content: SizedBox(
                          width: 800,
                          height: 400,
                          child: results.isEmpty
                              ? const Center(child: Text('Không tìm thấy phim phù hợp', style: TextStyle(color: Colors.white70)))
                              : GridView.builder(
                                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                    crossAxisCount: 4,
                                    childAspectRatio: 0.65,
                                    crossAxisSpacing: 12,
                                    mainAxisSpacing: 12,
                                  ),
                                  itemCount: results.length,
                                  itemBuilder: (_, i) => TvMovieCard(
                                    movie: results[i],
                                    onSelect: () {
                                      Navigator.pop(ctx);
                                      _onMovieSelected(results[i]);
                                    },
                                  ),
                                ),
                        ),
                      ),
                    );
                  }
                },
              ),
            ),
          ],
        );
      },
    );
  }
}
