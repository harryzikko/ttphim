import 'dart:async';
import 'package:flutter/material.dart';
import '../models/movie.dart';
import '../services/api_service.dart';
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
  List<Movie> _results = [];
  bool _hasSearched = false;

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
  ];

  @override
  void dispose() {
    _controller.dispose();
    _debounceTimer?.cancel();
    super.dispose();
  }

  void _onQueryChanged(String query) {
    _debounceTimer?.cancel();
    if (query.trim().isEmpty) {
      setState(() {
        _results = [];
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
    setState(() {
      _isSearching = true;
      _hasSearched = true;
    });

    final res = await ApiService.searchMovies(query);

    if (mounted) {
      setState(() {
        _results = res;
        _isSearching = false;
      });
    }
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
            autofocus: true,
            style: const TextStyle(color: Colors.white, fontSize: 14),
            onChanged: _onQueryChanged,
            decoration: InputDecoration(
              hintText: 'Tìm kiếm tên phim, diễn viên...',
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
              : _results.isEmpty
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Text(
            'Tìm thấy ${_results.length} kết quả:',
            style: const TextStyle(color: AppTheme.textMuted, fontSize: 13),
          ),
        ),
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.all(16),
            physics: const BouncingScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              childAspectRatio: 0.52,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
            ),
            itemCount: _results.length,
            itemBuilder: (context, index) {
              return MovieCard(
                movie: _results[index],
                width: double.infinity,
                height: 155,
              );
            },
          ),
        ),
      ],
    );
  }
}
