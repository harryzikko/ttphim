import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/movie.dart';
import '../models/movie_detail.dart';
import '../services/api_service.dart';
import '../services/storage_service.dart';
import '../services/session_service.dart';
import '../theme/app_theme.dart';
import 'detail_screen.dart';
import 'player_screen.dart';

class WatchlistScreen extends StatefulWidget {
  final Function(int tabIndex)? onNavigateTab;
  final int refreshVersion;
  final int initialTabIndex;

  const WatchlistScreen({
    super.key,
    this.onNavigateTab,
    this.refreshVersion = 0,
    this.initialTabIndex = 0,
  });

  @override
  State<WatchlistScreen> createState() => _WatchlistScreenState();
}

class _WatchlistScreenState extends State<WatchlistScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<Movie> _favorites = [];
  List<WatchHistoryItem> _history = [];
  bool _isLoading = true;
  int _loadGeneration = 0;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: 2,
      vsync: this,
      initialIndex: widget.initialTabIndex.clamp(0, 1),
    );
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) setState(() {});
    });
    SessionService.changes.addListener(_loadData);
    _loadData();
  }

  @override
  void dispose() {
    SessionService.changes.removeListener(_loadData);
    _tabController.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant WatchlistScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.refreshVersion != oldWidget.refreshVersion) _loadData();
  }

  Future<void> _loadData() async {
    if (!mounted) return;
    final generation = ++_loadGeneration;
    setState(() {
      _isLoading = true;
    });
    final favs = await StorageService.getFavorites();
    final hist = await StorageService.getHistory();
    if (mounted && generation == _loadGeneration) {
      setState(() {
        _favorites = favs;
        _history = hist;
        _isLoading = false;
      });
    }
  }

  Future<void> _deleteFavorite(int index, Movie movie) async {
    setState(() {
      _favorites.removeAt(index);
    });

    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Đã xóa "${movie.name}" khỏi danh sách yêu thích'),
        action: SnackBarAction(
          label: 'Hoàn tác',
          textColor: AppTheme.primaryLight,
          onPressed: () {
            setState(() {
              _favorites.insert(index, movie);
            });
            StorageService.toggleFavorite(movie);
          },
        ),
        duration: const Duration(seconds: 3),
        backgroundColor: const Color(0xFF1E2230),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    );

    await StorageService.removeFavorite(movie.slug);
  }

  Future<void> _deleteHistory(int index, WatchHistoryItem item) async {
    setState(() {
      _history.removeAt(index);
    });

    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Đã xóa "${item.movieName}" khỏi danh sách tiếp tục xem'),
        action: SnackBarAction(
          label: 'Hoàn tác',
          textColor: AppTheme.primaryLight,
          onPressed: () {
            setState(() {
              _history.insert(index, item);
            });
            StorageService.saveHistory(item);
          },
        ),
        duration: const Duration(seconds: 3),
        backgroundColor: const Color(0xFF1E2230),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    );

    await StorageService.removeHistoryItem(item.movieSlug);
  }

  Future<void> _clearHistory() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        title: const Text('Xóa toàn bộ lịch sử xem?', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        content: const Text(
          'Tất cả các phim bạn đã xem dở sẽ bị xóa vĩnh viễn khỏi danh sách tiếp tục xem.',
          style: TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Hủy', style: TextStyle(color: AppTheme.textMuted)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primary,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: const Text('Xóa Hết'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await StorageService.clearHistory();
        if (mounted) _loadData();
      } catch (error) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(error.toString())),
          );
        }
      }
    }
  }

  void _resumePlayback(BuildContext context, WatchHistoryItem item) async {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Đang mở ${item.movieName}...'),
        duration: const Duration(seconds: 1),
        backgroundColor: const Color(0xFF1E2230),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    );

    final detail = await ApiService.getMovieDetail(item.movieSlug);
    if (!context.mounted) return;

    if (detail != null && detail.servers.isNotEmpty) {
      var server = detail.servers.firstWhere(
        (s) => s.serverName == item.serverName,
        orElse: () => detail.servers.first,
      );

      var episode = server.episodes.firstWhere(
        (e) => e.slug == item.episodeSlug || e.name == item.episodeName,
        orElse: () => server.episodes.isNotEmpty ? server.episodes.first : EpisodeItem(
          name: item.episodeName,
          slug: item.episodeSlug,
          filename: '',
          linkEmbed: '',
          linkM3u8: '',
        ),
      );

      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => PlayerScreen(
            movie: detail.movie,
            servers: detail.servers,
            initialServer: server,
            initialEpisode: episode,
          ),
        ),
      );
      _loadData();
    } else {
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => MovieDetailScreen(slug: item.movieSlug),
        ),
      );
      _loadData();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Thư Viện Của Tôi', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        actions: [
          if (_tabController.index == 1 && _history.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_sweep_rounded, color: AppTheme.textSecondary),
              tooltip: 'Xóa toàn bộ lịch sử xem',
              onPressed: _clearHistory,
            ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppTheme.primary,
          indicatorWeight: 3,
          labelColor: Colors.white,
          unselectedLabelColor: AppTheme.textMuted,
          tabs: [
            Tab(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.favorite_rounded, color: Colors.redAccent, size: 16),
                  const SizedBox(width: 6),
                  Text('Yêu Thích (${_favorites.length})'),
                ],
              ),
            ),
            Tab(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.history_rounded, color: AppTheme.gold, size: 18),
                  const SizedBox(width: 6),
                  Text('Đang Xem (${_history.length})'),
                ],
              ),
            ),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.primary))
          : TabBarView(
              controller: _tabController,
              children: [
                _buildFavoritesTab(),
                _buildHistoryTab(),
              ],
            ),
    );
  }

  Widget _buildFavoritesTab() {
    if (_favorites.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.favorite_border_rounded, color: AppTheme.textMuted, size: 64),
              const SizedBox(height: 14),
              const Text(
                'Chưa có phim nào trong danh sách yêu thích',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              const Text(
                'Nhấn biểu tượng hình trái tim trên trang phim để lưu lại và xem bất kỳ lúc nào.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppTheme.textMuted, fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 18),
              ElevatedButton.icon(
                onPressed: () => widget.onNavigateTab?.call(1),
                icon: const Icon(Icons.explore_rounded, size: 18),
                label: const Text('Khám Phá Phim Ngay'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 11),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      physics: const BouncingScrollPhysics(),
      itemCount: _favorites.length,
      separatorBuilder: (_, __) => const Divider(color: AppTheme.border, height: 16),
      itemBuilder: (context, idx) {
        final movie = _favorites[idx];

        return Dismissible(
          key: ValueKey('fav_${movie.slug}'),
          direction: DismissDirection.endToStart,
          background: Container(
            alignment: Alignment.centerRight,
            padding: const EdgeInsets.only(right: 20),
            decoration: BoxDecoration(
              color: Colors.redAccent.shade700,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Xóa', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                SizedBox(width: 6),
                Icon(Icons.delete_outline_rounded, color: Colors.white, size: 22),
              ],
            ),
          ),
          onDismissed: (_) => _deleteFavorite(idx, movie),
          child: InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => MovieDetailScreen(slug: movie.slug, initialMovie: movie),
                ),
              );
              _loadData();
            },
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  // Poster Thumbnail
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: SizedBox(
                      width: 55,
                      height: 80,
                      child: CachedNetworkImage(
                        imageUrl: movie.fullPosterUrl,
                        fit: BoxFit.cover,
                        memCacheWidth: 200,
                        placeholder: (_, __) => Container(color: AppTheme.card),
                        errorWidget: (_, __, ___) => Container(
                          color: AppTheme.card,
                          child: const Icon(Icons.movie_rounded, color: AppTheme.textMuted),
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(width: 12),

                  // Metadata
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          movie.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                        if (movie.originName.isNotEmpty && movie.originName != movie.name) ...[
                          const SizedBox(height: 2),
                          Text(
                            movie.originName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppTheme.textMuted,
                              fontSize: 11.5,
                            ),
                          ),
                        ],
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            if (movie.year != null && movie.year! > 0)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                margin: const EdgeInsets.only(right: 6),
                                decoration: BoxDecoration(
                                  color: Colors.white.withOpacity(0.08),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  '${movie.year}',
                                  style: const TextStyle(color: Colors.white70, fontSize: 10.5),
                                ),
                              ),
                            if (movie.quality.isNotEmpty)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                                margin: const EdgeInsets.only(right: 6),
                                decoration: BoxDecoration(
                                  color: AppTheme.primary.withOpacity(0.2),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  movie.quality,
                                  style: const TextStyle(color: AppTheme.primaryLight, fontSize: 10.5, fontWeight: FontWeight.w600),
                                ),
                              ),
                            if (movie.lang.isNotEmpty)
                              Text(
                                movie.lang,
                                style: const TextStyle(color: AppTheme.textSecondary, fontSize: 11),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  // Delete Favorite Button
                  IconButton(
                    icon: const Icon(Icons.favorite_rounded, color: Colors.redAccent, size: 22),
                    tooltip: 'Xóa khỏi yêu thích (hoặc vuốt sang trái)',
                    onPressed: () => _deleteFavorite(idx, movie),
                  ),

                  // Play Button
                  IconButton(
                    icon: const Icon(Icons.play_circle_fill_rounded, color: AppTheme.primary, size: 30),
                    tooltip: 'Xem phim',
                    onPressed: () async {
                      await Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => MovieDetailScreen(slug: movie.slug, initialMovie: movie),
                        ),
                      );
                      _loadData();
                    },
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildHistoryTab() {
    if (_history.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.history_rounded, color: AppTheme.textMuted, size: 64),
              const SizedBox(height: 14),
              const Text(
                'Chưa có lịch sử xem phim',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 6),
              const Text(
                'Khi bạn xem bất kỳ bộ phim nào, tiến độ xem sẽ tự động lưu lại ở đây để bạn xem tiếp.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppTheme.textMuted, fontSize: 13, height: 1.4),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      physics: const BouncingScrollPhysics(),
      itemCount: _history.length,
      separatorBuilder: (_, __) => const Divider(color: AppTheme.border, height: 16),
      itemBuilder: (context, idx) {
        final item = _history[idx];

        return Dismissible(
          key: ValueKey('hist_${item.movieSlug}'),
          direction: DismissDirection.endToStart,
          background: Container(
            alignment: Alignment.centerRight,
            padding: const EdgeInsets.only(right: 20),
            decoration: BoxDecoration(
              color: Colors.redAccent.shade700,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Xóa', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                SizedBox(width: 6),
                Icon(Icons.delete_outline_rounded, color: Colors.white, size: 22),
              ],
            ),
          ),
          onDismissed: (_) => _deleteHistory(idx, item),
          child: InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: () => _resumePlayback(context, item),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  // 16:9 Landscape Thumbnail
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: SizedBox(
                      width: 80,
                      height: 48,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          CachedNetworkImage(
                            imageUrl: item.bestImageUrl,
                            fit: BoxFit.cover,
                            memCacheWidth: 240,
                            placeholder: (_, __) => Container(color: AppTheme.card),
                            errorWidget: (_, __, ___) => Container(
                              color: AppTheme.card,
                              child: const Icon(Icons.movie_rounded, color: AppTheme.textMuted, size: 18),
                            ),
                          ),
                          Center(
                            child: Container(
                              padding: const EdgeInsets.all(4),
                              decoration: BoxDecoration(
                                color: Colors.black.withOpacity(0.55),
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 16),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(width: 12),

                  // Metadata & Progress
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.movieName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          '${item.episodeName.isNotEmpty ? item.episodeName : item.serverName} • ${item.remainingTimeText}',
                          style: const TextStyle(color: AppTheme.primaryLight, fontSize: 12),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 6),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(2),
                          child: LinearProgressIndicator(
                            value: (item.progressPercentage > 0 ? item.progressPercentage : 0.05).clamp(0.0, 1.0),
                            backgroundColor: Colors.white12,
                            valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primary),
                            minHeight: 3.5,
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Delete Button
                  IconButton(
                    icon: const Icon(Icons.delete_outline_rounded, color: Colors.white54, size: 21),
                    tooltip: 'Xóa khỏi tiếp tục xem (hoặc vuốt sang trái)',
                    onPressed: () => _deleteHistory(idx, item),
                  ),

                  // Play Button
                  IconButton(
                    icon: const Icon(Icons.play_circle_fill, color: AppTheme.primary, size: 30),
                    tooltip: 'Tiếp tục xem',
                    onPressed: () => _resumePlayback(context, item),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
