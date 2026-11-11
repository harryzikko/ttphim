import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../models/short_drama.dart';
import '../services/shortflix_service.dart';
import '../theme/app_theme.dart';
import 'short_player_screen.dart';

class ShortPhimScreen extends StatefulWidget {
  const ShortPhimScreen({super.key});

  @override
  State<ShortPhimScreen> createState() => _ShortPhimScreenState();
}

class _ShortPhimScreenState extends State<ShortPhimScreen> {
  final TextEditingController _searchController = TextEditingController();

  bool _isLoading = true;
  String? _error;
  int _page = 1;
  bool _hasMore = false;
  String _selectedGenre = 'all';
  String _keyword = '';
  List<String> _genres = const [
    'Tổng tài',
    'Lồng tiếng',
    'Cổ đại',
    'Ngôn tình',
    'Xuyên không',
    'Trọng sinh',
    'Báo thù',
    'Nữ cường',
    'Hài hước',
  ];
  List<ShortDramaItem> _items = const [];

  @override
  void initState() {
    super.initState();
    _loadCatalog();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadCatalog() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final result = await ShortflixService.getCatalog(
        page: _page,
        genre: _selectedGenre,
        keyword: _keyword,
        limit: 24,
      );
      if (!mounted) return;
      setState(() {
        _items = result.items;
        if (result.genres.isNotEmpty) {
          _genres = result.genres;
        }
        _page = result.page;
        _hasMore = result.hasMore;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _isLoading = false;
      });
    }
  }

  void _onSearchSubmitted() {
    setState(() {
      _keyword = _searchController.text.trim();
      _selectedGenre = 'all';
      _page = 1;
    });
    _loadCatalog();
  }

  void _onGenreSelected(String genre) {
    _searchController.clear();
    setState(() {
      _keyword = '';
      _selectedGenre = genre;
      _page = 1;
    });
    _loadCatalog();
  }

  void _openShortPlayer(ShortDramaItem item) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ShortPlayerScreen(item: item),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final allChips = <String>['all', ..._genres];

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.surface,
        elevation: 0,
        titleSpacing: 16,
        title: const Row(
          children: [
            Icon(Icons.bolt_rounded, color: AppTheme.gold, size: 22),
            SizedBox(width: 6),
            Text(
              'Short Phim',
              style: TextStyle(
                color: AppTheme.textPrimary,
                fontSize: 19,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 14, top: 12, bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: AppTheme.primary.withOpacity(0.16),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppTheme.primary.withOpacity(0.5)),
            ),
            child: const Center(
              child: Text(
                '9:16 FULL HD',
                style: TextStyle(
                  color: AppTheme.primaryLight,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          // Search Bar
          Container(
            color: AppTheme.surface,
            padding: const EdgeInsets.fromLTRB(14, 4, 14, 10),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    height: 40,
                    decoration: BoxDecoration(
                      color: AppTheme.cardElevated,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: TextField(
                      controller: _searchController,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                      textInputAction: TextInputAction.search,
                      onSubmitted: (_) => _onSearchSubmitted(),
                      decoration: const InputDecoration(
                        hintText: 'Tìm phim ngắn dọc...',
                        hintStyle: TextStyle(color: AppTheme.textMuted, fontSize: 13),
                        prefixIcon: Icon(Icons.search_rounded, color: AppTheme.textSecondary, size: 19),
                        border: InputBorder.none,
                        contentPadding: EdgeInsets.symmetric(vertical: 10),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: _onSearchSubmitted,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primary,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    minimumSize: const Size(0, 40),
                  ),
                  child: const Text('Tìm', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),

          // Genre Chips
          Container(
            color: AppTheme.surface,
            height: 44,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              scrollDirection: Axis.horizontal,
              itemCount: allChips.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, idx) {
                final genre = allChips[idx];
                final active = (_selectedGenre == genre) && _keyword.isEmpty;
                return GestureDetector(
                  onTap: () => _onGenreSelected(genre),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: active ? AppTheme.primary : AppTheme.cardElevated,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: active ? AppTheme.primaryLight : AppTheme.border,
                      ),
                    ),
                    child: Center(
                      child: Text(
                        genre == 'all' ? 'Tất cả' : genre,
                        style: TextStyle(
                          color: active ? Colors.white : AppTheme.textSecondary,
                          fontSize: 12,
                          fontWeight: active ? FontWeight.bold : FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),

          // Body Grid
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: AppTheme.primary))
                : _error != null
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.error_outline, color: AppTheme.primaryLight, size: 42),
                              const SizedBox(height: 12),
                              Text(
                                _error!,
                                textAlign: TextAlign.center,
                                style: const TextStyle(color: AppTheme.textSecondary, fontSize: 14),
                              ),
                              const SizedBox(height: 16),
                              ElevatedButton(
                                onPressed: _loadCatalog,
                                style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
                                child: const Text('Thử lại', style: TextStyle(color: Colors.white)),
                              ),
                            ],
                          ),
                        ),
                      )
                    : _items.isEmpty
                        ? const Center(
                            child: Text(
                              'Chưa tìm thấy Short Phim phù hợp.',
                              style: TextStyle(color: AppTheme.textSecondary, fontSize: 14),
                            ),
                          )
                        : RefreshIndicator(
                            color: AppTheme.primary,
                            onRefresh: _loadCatalog,
                            child: CustomScrollView(
                              slivers: [
                                SliverPadding(
                                  padding: const EdgeInsets.all(12),
                                  sliver: SliverGrid(
                                    delegate: SliverChildBuilderDelegate(
                                      (context, index) => _ShortPosterCard(
                                        item: _items[index],
                                        onTap: () => _openShortPlayer(_items[index]),
                                      ),
                                      childCount: _items.length,
                                    ),
                                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                      crossAxisCount: 3,
                                      mainAxisSpacing: 12,
                                      crossAxisSpacing: 10,
                                      childAspectRatio: 0.54,
                                    ),
                                  ),
                                ),
                                SliverToBoxAdapter(
                                  child: Padding(
                                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                                    child: Row(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        OutlinedButton.icon(
                                          onPressed: _page > 1
                                              ? () {
                                                  setState(() => _page -= 1);
                                                  _loadCatalog();
                                                }
                                              : null,
                                          icon: const Icon(Icons.arrow_back_rounded, size: 16),
                                          label: const Text('Trước'),
                                        ),
                                        Padding(
                                          padding: const EdgeInsets.symmetric(horizontal: 16),
                                          child: Text(
                                            'Trang $_page',
                                            style: const TextStyle(
                                              color: AppTheme.textPrimary,
                                              fontWeight: FontWeight.bold,
                                              fontSize: 13,
                                            ),
                                          ),
                                        ),
                                        OutlinedButton.icon(
                                          onPressed: _hasMore
                                              ? () {
                                                  setState(() => _page += 1);
                                                  _loadCatalog();
                                                }
                                              : null,
                                          icon: const Icon(Icons.arrow_forward_rounded, size: 16),
                                          label: const Text('Sau'),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
          ),
        ],
      ),
    );
  }
}

class _ShortPosterCard extends StatelessWidget {
  final ShortDramaItem item;
  final VoidCallback onTap;

  const _ShortPosterCard({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _ShortPosterImage(
                    primaryUrl: item.posterUrl,
                    fallbackUrl: item.posterFallbackUrl,
                    title: item.name,
                  ),
                  Positioned(
                    top: 6,
                    left: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppTheme.primary,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Text(
                        'SHORT',
                        style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800),
                      ),
                    ),
                  ),
                  if (item.episodeCountHint != null)
                    Positioned(
                      bottom: 6,
                      left: 6,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.75),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          '${item.episodeCountHint} tập',
                          style: const TextStyle(color: AppTheme.gold, fontSize: 10, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            item.name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: AppTheme.textPrimary,
              fontSize: 12,
              fontWeight: FontWeight.w600,
              height: 1.25,
            ),
          ),
        ],
      ),
    );
  }
}

class _ShortPosterImage extends StatelessWidget {
  final String primaryUrl;
  final String fallbackUrl;
  final String title;

  const _ShortPosterImage({
    required this.primaryUrl,
    required this.fallbackUrl,
    required this.title,
  });

  @override
  Widget build(BuildContext context) {
    final initial = primaryUrl.isNotEmpty ? primaryUrl : fallbackUrl;
    if (initial.isEmpty) return _placeholder();

    return CachedNetworkImage(
      imageUrl: initial,
      fit: BoxFit.cover,
      memCacheWidth: 320,
      placeholder: (_, __) => Container(color: AppTheme.card),
      errorWidget: (_, __, ___) {
        if (fallbackUrl.isNotEmpty && fallbackUrl != initial) {
          return CachedNetworkImage(
            imageUrl: fallbackUrl,
            fit: BoxFit.cover,
            memCacheWidth: 320,
            errorWidget: (_, __, ___) => _placeholder(),
          );
        }
        return _placeholder();
      },
    );
  }

  Widget _placeholder() {
    return Container(
      color: AppTheme.cardElevated,
      padding: const EdgeInsets.all(8),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.bolt_rounded, color: AppTheme.primary, size: 28),
          const SizedBox(height: 6),
          Text(
            title,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(color: AppTheme.textSecondary, fontSize: 11, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
