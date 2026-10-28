import 'package:flutter/material.dart';
import '../models/movie.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/movie_card.dart';

class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  final ScrollController _scrollController = ScrollController();

  final List<Map<String, String>> _typeFilters = [
    {'title': 'Phim Mới', 'slug': 'phim-moi'},
    {'title': 'Chiếu Rạp', 'slug': 'phim-chieu-rap'},
    {'title': 'Phim Lẻ', 'slug': 'phim-le'},
    {'title': 'Phim Bộ', 'slug': 'phim-bo'},
    {'title': 'TV Shows', 'slug': 'tv-shows'},
    {'title': 'Hoạt Hình', 'slug': 'hoat-hinh'},
  ];

  final List<Map<String, String>> _categoryFilters = [
    {'title': 'Tất Cả Thể Loại', 'slug': ''},
    {'title': 'Hành Động', 'slug': 'hanh-dong'},
    {'title': 'Viễn Tưởng', 'slug': 'vien-tuong'},
    {'title': 'Kinh Dị', 'slug': 'kinh-di'},
    {'title': 'Hài Hước', 'slug': 'hai-huoc'},
    {'title': 'Cổ Trang', 'slug': 'co-trang'},
    {'title': 'Tình Cảm', 'slug': 'tinh-cam'},
    {'title': 'Tâm Lý', 'slug': 'tam-ly'},
    {'title': 'Võ Thuật', 'slug': 'vo-thuat'},
    {'title': 'Phiêu Lưu', 'slug': 'phieu-luu'},
    {'title': 'Chiếu Rạp', 'slug': 'chieu-rap'},
    {'title': 'Bí Ẩn', 'slug': 'bi-an'},
    {'title': 'Chiến Tranh', 'slug': 'chien-tranh'},
    {'title': 'Âm Nhạc', 'slug': 'am-nhac'},
  ];

  final List<Map<String, String>> _countryFilters = [
    {'title': 'Tất Cả Quốc Gia', 'slug': ''},
    {'title': 'Việt Nam', 'slug': 'viet-nam'},
    {'title': 'Trung Quốc', 'slug': 'trung-quoc'},
    {'title': 'Hàn Quốc', 'slug': 'han-quoc'},
    {'title': 'Nhật Bản', 'slug': 'nhat-ban'},
    {'title': 'Âu Mỹ', 'slug': 'au-my'},
    {'title': 'Thái Lan', 'slug': 'thai-lan'},
    {'title': 'Đài Loan', 'slug': 'dai-loan'},
    {'title': 'Ấn Độ', 'slug': 'an-do'},
    {'title': 'Hồng Kông', 'slug': 'hong-kong'},
  ];

  int _selectedTypeIndex = 0;
  int _selectedCategoryIndex = 0;
  int _selectedCountryIndex = 0;

  List<Movie> _movies = [];
  int _currentPage = 1;
  bool _isLoading = true;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  int _loadGeneration = 0;

  @override
  void initState() {
    super.initState();
    _loadMovies();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >= _scrollController.position.maxScrollExtent - 200 &&
        !_isLoading &&
        !_isLoadingMore &&
        _hasMore) {
      _loadMore();
    }
  }

  Future<List<Movie>> _fetchByCurrentFilters(int page) async {
    final countrySlug = _countryFilters[_selectedCountryIndex]['slug']!;
    final catSlug = _categoryFilters[_selectedCategoryIndex]['slug']!;
    final typeSlug = _typeFilters[_selectedTypeIndex]['slug']!;

    if (countrySlug.isNotEmpty) {
      return await ApiService.getMoviesByCountry(countrySlug, page: page);
    } else if (catSlug.isNotEmpty) {
      return await ApiService.getMoviesByCategory(catSlug, page: page);
    } else {
      switch (typeSlug) {
        case 'phim-chieu-rap':
        case 'chieu-rap':
          return await ApiService.getCinemaMovies(page: page);
        case 'phim-le':
          return await ApiService.getSingleMovies(page: page);
        case 'phim-bo':
          return await ApiService.getSeriesMovies(page: page);
        case 'hoat-hinh':
          return await ApiService.getAnimeMovies(page: page);
        case 'tv-shows':
          return await ApiService.getTvShows(page: page);
        default:
          return await ApiService.getNewMovies(page: page);
      }
    }
  }

  Future<void> _loadMovies({bool isRefresh = false}) async {
    final generation = ++_loadGeneration;
    _isLoadingMore = false;
    if (isRefresh) {
      _currentPage = 1;
      _hasMore = true;
    }

    setState(() => _isLoading = true);

    final results = await _fetchByCurrentFilters(_currentPage);

    if (mounted && generation == _loadGeneration) {
      setState(() {
        _movies = results;
        _isLoading = false;
        _hasMore = results.isNotEmpty;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_isLoading || _isLoadingMore || !_hasMore) return;
    final generation = _loadGeneration;
    final page = _currentPage + 1;
    setState(() => _isLoadingMore = true);

    final results = await _fetchByCurrentFilters(page);

    if (mounted && generation == _loadGeneration) {
      setState(() {
        if (results.isEmpty) {
          _hasMore = false;
        } else {
          _currentPage = page;
          final known = _movies.map((movie) => movie.slug).toSet();
          _movies.addAll(results.where((movie) => known.add(movie.slug)));
        }
        _isLoadingMore = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final activeCat = _categoryFilters[_selectedCategoryIndex]['slug']!.isNotEmpty;
    final activeCountry = _countryFilters[_selectedCountryIndex]['slug']!.isNotEmpty;

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text(
          'Khám Phá Phim',
          style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        actions: [
          if (activeCat || activeCountry || _selectedTypeIndex != 0)
            TextButton.icon(
              onPressed: () {
                setState(() {
                  _selectedTypeIndex = 0;
                  _selectedCategoryIndex = 0;
                  _selectedCountryIndex = 0;
                });
                _loadMovies(isRefresh: true);
              },
              icon: const Icon(Icons.refresh_rounded, size: 16, color: AppTheme.primaryLight),
              label: const Text(
                'Đặt lại',
                style: TextStyle(color: AppTheme.primaryLight, fontSize: 12),
              ),
            ),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: [
          // 1. Định Dạng Phim (Type Filter Chips)
          SizedBox(
            height: 42,
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              itemCount: _typeFilters.length,
              itemBuilder: (context, idx) {
                final isSel = idx == _selectedTypeIndex && !activeCat && !activeCountry;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(_typeFilters[idx]['title']!),
                    selected: isSel,
                    selectedColor: AppTheme.primary,
                    backgroundColor: AppTheme.card,
                    labelStyle: TextStyle(
                      color: isSel ? Colors.white : AppTheme.textSecondary,
                      fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                      fontSize: 12,
                    ),
                    onSelected: (_) {
                      setState(() {
                        _selectedTypeIndex = idx;
                        _selectedCategoryIndex = 0;
                        _selectedCountryIndex = 0;
                      });
                      _loadMovies(isRefresh: true);
                    },
                  ),
                );
              },
            ),
          ),

          const SizedBox(height: 6),

          // 2. Lọc Thể Loại (Category / Genre Filter Row)
          SizedBox(
            height: 36,
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              itemCount: _categoryFilters.length,
              itemBuilder: (context, idx) {
                final isSel = idx == _selectedCategoryIndex;
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilterChip(
                    label: Text(_categoryFilters[idx]['title']!),
                    selected: isSel,
                    selectedColor: AppTheme.primary.withOpacity(0.25),
                    backgroundColor: AppTheme.cardElevated,
                    checkmarkColor: AppTheme.primary,
                    side: BorderSide(
                      color: isSel ? AppTheme.primary : AppTheme.border,
                      width: 0.8,
                    ),
                    labelStyle: TextStyle(
                      color: isSel ? Colors.white : AppTheme.textMuted,
                      fontSize: 11,
                      fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                    ),
                    onSelected: (_) {
                      setState(() {
                        _selectedCategoryIndex = idx;
                        if (idx > 0) _selectedCountryIndex = 0;
                      });
                      _loadMovies(isRefresh: true);
                    },
                  ),
                );
              },
            ),
          ),

          const SizedBox(height: 6),

          // 3. Lọc Quốc Gia (Country Filter Row)
          SizedBox(
            height: 36,
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              itemCount: _countryFilters.length,
              itemBuilder: (context, idx) {
                final isSel = idx == _selectedCountryIndex;
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilterChip(
                    label: Text(_countryFilters[idx]['title']!),
                    selected: isSel,
                    selectedColor: AppTheme.gold.withOpacity(0.2),
                    backgroundColor: AppTheme.cardElevated,
                    checkmarkColor: AppTheme.gold,
                    side: BorderSide(
                      color: isSel ? AppTheme.gold : AppTheme.border,
                      width: 0.8,
                    ),
                    labelStyle: TextStyle(
                      color: isSel ? AppTheme.gold : AppTheme.textMuted,
                      fontSize: 11,
                      fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                    ),
                    onSelected: (_) {
                      setState(() {
                        _selectedCountryIndex = idx;
                        if (idx > 0) _selectedCategoryIndex = 0;
                      });
                      _loadMovies(isRefresh: true);
                    },
                  ),
                );
              },
            ),
          ),

          const SizedBox(height: 8),

          // Movie Grid
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: AppTheme.primary))
                : _movies.isEmpty
                    ? const Center(
                        child: Text(
                          'Không có phim nào trong danh mục này',
                          style: TextStyle(color: AppTheme.textMuted),
                        ),
                      )
                    : RefreshIndicator(
                        color: AppTheme.primary,
                        backgroundColor: AppTheme.surface,
                        onRefresh: () => _loadMovies(isRefresh: true),
                        child: GridView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.all(16),
                          physics: const AlwaysScrollableScrollPhysics(
                            parent: BouncingScrollPhysics(),
                          ),
                          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: MediaQuery.of(context).size.width >= 1000 ? 6 : (MediaQuery.of(context).size.width >= 600 ? 4 : 3),
                            childAspectRatio: MediaQuery.of(context).size.width >= 600 ? 0.58 : 0.54,
                            crossAxisSpacing: 12,
                            mainAxisSpacing: 14,
                          ),
                          itemCount: _movies.length + (_isLoadingMore ? 1 : 0),
                          itemBuilder: (context, index) {
                            if (index == _movies.length) {
                              return const Center(
                                child: Padding(
                                  padding: EdgeInsets.all(16.0),
                                  child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.primary),
                                ),
                              );
                            }
                            return MovieCard(
                              movie: _movies[index],
                              margin: EdgeInsets.zero,
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}
