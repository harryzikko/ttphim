import 'dart:async';
import 'package:flutter/material.dart';
import '../models/movie.dart';
import '../services/api_service.dart';
import '../services/shortflix_service.dart';
import '../theme/app_theme.dart';
import '../widgets/movie_card.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final TextEditingController _controller = TextEditingController();
  Timer? _debounceTimer;

  bool _isSearching = false;
  List<Movie> _movieResults = [];
  List<Movie> _shortResults = [];
  String _selectedFilter = 'all';
  bool _hasSearched = false;
  int _searchGeneration = 0;

  final List<String> _trendingKeywords = [
    'Batman',
    'One Piece',
    'Conan',
    'Doraemon',
    'Lật Mặt',
    'Spider-Man',
    'Avengers',
    'Naruto',
    'Harry Potter',
    'John Wick',
    'Short Phim',
  ];

  @override
  void dispose() {
    _controller.dispose();
    _debounceTimer?.cancel();
    super.dispose();
  }

  void _onQueryChanged(String query) {
    _debounceTimer?.cancel();
    _searchGeneration++;
    if (query.trim().isEmpty) {
      setState(() {
        _movieResults = [];
        _shortResults = [];
        _hasSearched = false;
        _isSearching = false;
      });
      return;
    }

    _debounceTimer = Timer(const Duration(milliseconds: 500), () {
      _performSearch(query.trim());
    });
  }

  Future<void> _performSearch(String query) async {
    if (!mounted) return;
    _debounceTimer?.cancel();
    final generation = ++_searchGeneration;
    setState(() {
      _isSearching = true;
      _hasSearched = true;
    });

    final movieFuture = ApiService.searchMovies(query);
    final shortFuture = ShortflixService.getCatalog(keyword: query, limit: 18)
        .then((cat) => cat.items.map((s) => Movie.fromShortDrama(s)).toList())
        .catchError((_) => <Movie>[]);

    final results = await Future.wait([movieFuture, shortFuture]);
    final movies = results[0];
    final shorts = results[1];

    if (mounted && generation == _searchGeneration) {
      setState(() {
        _movieResults = movies;
        _shortResults = shorts;
        _isSearching = false;
      });
    }
  }

  List<Movie> get _filteredResults {
    if (_selectedFilter == 'movies') return _movieResults;
    if (_selectedFilter == 'shorts') return _shortResults;
    return [..._movieResults, ..._shortResults];
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        titleSpacing: 0,
        title: Container(
          height: 42,
          margin: const EdgeInsets.only(right: 16),
          decoration: BoxDecoration(
            color: AppTheme.card,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppTheme.border, width: 0.8),
          ),
          child: TextField(
            controller: _controller,
            autofocus: false,
            style: const TextStyle(color: Colors.white, fontSize: 14),
            onChanged: _onQueryChanged,
            decoration: InputDecoration(
              hintText: 'Tìm kiếm tên phim, short phim...',
              hintStyle: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
              prefixIcon: const Icon(Icons.search, color: AppTheme.textSecondary, size: 20),
              suffixIcon: _controller.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, color: AppTheme.textSecondary, size: 18),
                      onPressed: () {
                        _controller.clear();
                        _onQueryChanged('');
                      },
                    )
                  : null,
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(vertical: 10),
            ),
          ),
        ),
      ),
      body: _isSearching
          ? const Center(
              child: CircularProgressIndicator(color: AppTheme.primary),
            )
          : !_hasSearched
              ? _buildTrendingSection()
              : (_movieResults.isEmpty && _shortResults.isEmpty)
                  ? _buildEmptyResults()
                  : _buildResultsGrid(),
    );
  }

  Widget _buildTrendingSection() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            const Icon(Icons.trending_up, color: AppTheme.primaryLight, size: 20),
            const SizedBox(width: 8),
            const Text(
              'Từ Khóa Thịnh Hành',
              style: TextStyle(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _trendingKeywords.map((keyword) {
            return ActionChip(
              label: Text(keyword),
              backgroundColor: AppTheme.card,
              side: const BorderSide(color: AppTheme.border),
              labelStyle: const TextStyle(color: AppTheme.textSecondary, fontSize: 12),
              onPressed: () {
                _controller.text = keyword;
                _performSearch(keyword);
              },
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildEmptyResults() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.search_off_rounded, color: AppTheme.textMuted, size: 64),
          const SizedBox(height: 12),
          Text(
            'Không tìm thấy phim phù hợp với "${_controller.text}"',
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 14),
          ),
          const SizedBox(height: 6),
          const Text(
            'Hãy thử tìm kiếm với từ khóa khác',
            style: TextStyle(color: AppTheme.textMuted, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildResultsGrid() {
    final list = _filteredResults;
    final total = _movieResults.length + _shortResults.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Filter Tabs
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              _buildFilterChip('all', 'Tất cả ($total)'),
              const SizedBox(width: 8),
              _buildFilterChip('movies', '🎬 Phim (${_movieResults.length})'),
              const SizedBox(width: 8),
              _buildFilterChip('shorts', '⚡ Short Phim (${_shortResults.length})'),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          child: Text(
            'Hiển thị ${list.length} kết quả:',
            style: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
          ),
        ),
        Expanded(
          child: list.isEmpty
              ? const Center(
                  child: Text(
                    'Không có nội dung trong mục này',
                    style: TextStyle(color: AppTheme.textMuted, fontSize: 13),
                  ),
                )
              : GridView.builder(
                  padding: const EdgeInsets.all(16),
                  physics: const BouncingScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: MediaQuery.of(context).size.width >= 1000 ? 6 : (MediaQuery.of(context).size.width >= 600 ? 4 : 3),
                    childAspectRatio: MediaQuery.of(context).size.width >= 600 ? 0.58 : 0.54,
                    crossAxisSpacing: 12,
                    mainAxisSpacing: 14,
                  ),
                  itemCount: list.length,
                  itemBuilder: (context, index) {
                    return MovieCard(
                      movie: list[index],
                      width: null,
                      margin: EdgeInsets.zero,
                    );
                  },
                ),
        ),
      ],
    );
  }

  Widget _buildFilterChip(String key, String label) {
    final isActive = _selectedFilter == key;
    return GestureDetector(
      onTap: () {
        setState(() => _selectedFilter = key);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isActive ? AppTheme.primary : AppTheme.card,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isActive ? AppTheme.primary : AppTheme.border,
            width: 0.8,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isActive ? Colors.white : AppTheme.textSecondary,
            fontSize: 12,
            fontWeight: isActive ? FontWeight.bold : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}
