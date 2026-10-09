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
    {'title': 'Phim Lẻ', 'slug': 'phim-le'},
    {'title': 'Phim Bộ', 'slug': 'phim-bo'},
    {'title': 'Hoạt Hình', 'slug': 'hoat-hinh'},
    {'title': 'TV Shows', 'slug': 'tv-shows'},
  ];

  final List<Map<String, String>> _categoryFilters = [
    {'title': 'Tất Cả', 'slug': ''},
    {'title': 'Hành Động', 'slug': 'hanh-dong'},
    {'title': 'Viễn Tưởng', 'slug': 'vien-tuong'},
    {'title': 'Kinh Dị', 'slug': 'kinh-di'},
    {'title': 'Hài Hước', 'slug': 'hai-huoc'},
    {'title': 'Cổ Trang', 'slug': 'co-trang'},
    {'title': 'Tình Cảm', 'slug': 'tinh-cam'},
    {'title': 'Tâm Lý', 'slug': 'tam-ly'},
    {'title': 'Võ Thuật', 'slug': 'vo-thuat'},
    {'title': 'Phiêu Lưu', 'slug': 'phieu-luu'},
  ];

  int _selectedTypeIndex = 0;
  int _selectedCategoryIndex = 0;

  List<Movie> _movies = [];
  int _currentPage = 1;
  bool _isLoading = true;
  bool _isLoadingMore = false;
  bool _hasMore = true;

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

  Future<void> _loadMovies({bool isRefresh = false}) async {
    if (isRefresh) {
      _currentPage = 1;
      _hasMore = true;
    }

    setState(() => _isLoading = true);

    List<Movie> results = [];
    final catSlug = _categoryFilters[_selectedCategoryIndex]['slug']!;
    final typeSlug = _typeFilters[_selectedTypeIndex]['slug']!;

    if (catSlug.isNotEmpty) {
      results = await ApiService.getMoviesByCategory(catSlug, page: _currentPage);
    } else {
      switch (typeSlug) {
        case 'phim-le':
          results = await ApiService.getSingleMovies(page: _currentPage);
          break;
        case 'phim-bo':
          results = await ApiService.getSeriesMovies(page: _currentPage);
          break;
        case 'hoat-hinh':
          results = await ApiService.getAnimeMovies(page: _currentPage);
          break;
        case 'tv-shows':
          results = await ApiService.getTvShows(page: _currentPage);
          break;
        default:
          results = await ApiService.getNewMovies(page: _currentPage);
          break;
      }
    }

    if (mounted) {
      setState(() {
        _movies = results;
        _isLoading = false;
        _hasMore = results.isNotEmpty;
      });
    }
  }

  Future<void> _loadMore() async {
    setState(() => _isLoadingMore = true);
    _currentPage++;

    List<Movie> results = [];
    final catSlug = _categoryFilters[_selectedCategoryIndex]['slug']!;
    final typeSlug = _typeFilters[_selectedTypeIndex]['slug']!;

    if (catSlug.isNotEmpty) {
      results = await ApiService.getMoviesByCategory(catSlug, page: _currentPage);
    } else {
      switch (typeSlug) {
        case 'phim-le':
          results = await ApiService.getSingleMovies(page: _currentPage);
          break;
        case 'phim-bo':
          results = await ApiService.getSeriesMovies(page: _currentPage);
          break;
        case 'hoat-hinh':
          results = await ApiService.getAnimeMovies(page: _currentPage);
          break;
        case 'tv-shows':
          results = await ApiService.getTvShows(page: _currentPage);
          break;
        default:
          results = await ApiService.getNewMovies(page: _currentPage);
          break;
      }
    }

    if (mounted) {
      setState(() {
        if (results.isEmpty) {
          _hasMore = false;
        } else {
          _movies.addAll(results);
        }
        _isLoadingMore = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Khám Phá Phim'),
      ),
      body: Column(
        children: [
          // Type Filter Chips Row
          SizedBox(
            height: 44,
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              scrollDirection: Axis.horizontal,
              itemCount: _typeFilters.length,
              itemBuilder: (context, idx) {
                final isSel = idx == _selectedTypeIndex && _selectedCategoryIndex == 0;
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
                        _selectedCategoryIndex = 0; // Reset category filter
                      });
                      _loadMovies(isRefresh: true);
                    },
                  ),
                );
              },
            ),
          ),

          const SizedBox(height: 6),

          // Categories Filter Row
          SizedBox(
            height: 38,
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
                    selectedColor: AppTheme.primaryLight.withOpacity(0.3),
                    backgroundColor: AppTheme.cardElevated,
                    checkmarkColor: AppTheme.primaryLight,
                    side: BorderSide(
                      color: isSel ? AppTheme.primary : AppTheme.border,
                      width: 0.8,
                    ),
                    labelStyle: TextStyle(
                      color: isSel ? AppTheme.primaryLight : AppTheme.textMuted,
                      fontSize: 11,
                      fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                    ),
                    onSelected: (_) {
                      setState(() {
                        _selectedCategoryIndex = idx;
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
                          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 3,
                            childAspectRatio: 0.52,
                            crossAxisSpacing: 10,
                            mainAxisSpacing: 10,
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
                              width: double.infinity,
                              height: 155,
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
