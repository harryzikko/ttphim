import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/movie.dart';
import '../services/storage_service.dart';
import '../theme/app_theme.dart';
import '../widgets/movie_card.dart';
import 'detail_screen.dart';

class WatchlistScreen extends StatefulWidget {
  final Function(int tabIndex)? onNavigateTab;

  const WatchlistScreen({super.key, this.onNavigateTab});

  @override
  State<WatchlistScreen> createState() => _WatchlistScreenState();
}

class _WatchlistScreenState extends State<WatchlistScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<Movie> _favorites = [];
  List<WatchHistoryItem> _history = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final favs = await StorageService.getFavorites();
    final hist = await StorageService.getHistory();
    if (mounted) {
      setState(() {
        _favorites = favs;
        _history = hist;
        _isLoading = false;
      });
    }
  }

  Future<void> _clearHistory() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.card,
        title: const Text('Xóa lịch sử xem?', style: TextStyle(color: Colors.white)),
        content: const Text(
          'Tất cả các phim bạn đã xem sẽ bị xóa khỏi lịch sử xem.',
          style: TextStyle(color: AppTheme.textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Hủy', style: TextStyle(color: AppTheme.textMuted)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
            child: const Text('Xóa', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await StorageService.clearHistory();
      _loadData();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Thư Viện Của Tôi'),
        actions: [
          if (_tabController.index == 1 && _history.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_outline, color: AppTheme.textSecondary),
              tooltip: 'Xóa lịch sử xem',
              onPressed: _clearHistory,
            ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppTheme.primary,
          indicatorWeight: 3,
          labelColor: Colors.white,
          unselectedLabelColor: AppTheme.textMuted,
          onTap: (_) => setState(() {}),
          tabs: [
            Tab(text: 'Yêu Thích (${_favorites.length})'),
            Tab(text: 'Đang Xem (${_history.length})'),
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
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.bookmark_border_rounded, color: AppTheme.textMuted, size: 64),
            const SizedBox(height: 12),
            const Text(
              'Chưa có phim nào trong danh sách',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 15),
            ),
            const SizedBox(height: 6),
            const Text(
              'Nhấn biểu tượng lưu trên trang chi tiết phim để thêm vào đây',
              style: TextStyle(color: AppTheme.textMuted, fontSize: 12),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => widget.onNavigateTab?.call(1),
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
              child: const Text('Khám Phá Phim Ngay', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      );
    }

    return GridView.builder(
      padding: const EdgeInsets.all(16),
      physics: const BouncingScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        childAspectRatio: 0.52,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
      ),
      itemCount: _favorites.length,
      itemBuilder: (context, idx) {
        return MovieCard(
          movie: _favorites[idx],
          width: double.infinity,
          height: 155,
        );
      },
    );
  }

  Widget _buildHistoryTab() {
    if (_history.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.history_rounded, color: AppTheme.textMuted, size: 64),
            const SizedBox(height: 12),
            const Text(
              'Chưa có lịch sử xem phim',
              style: TextStyle(color: AppTheme.textSecondary, fontSize: 15),
            ),
            const SizedBox(height: 6),
            const Text(
              'Khi bạn xem phim, tiến độ sẽ tự động lưu tại đây',
              style: TextStyle(color: AppTheme.textMuted, fontSize: 12),
            ),
          ],
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

        return ListTile(
          contentPadding: EdgeInsets.zero,
          onTap: () {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => MovieDetailScreen(slug: item.movieSlug),
              ),
            );
          },
          leading: ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: SizedBox(
              width: 55,
              height: 80,
              child: CachedNetworkImage(
                imageUrl: item.posterUrl.startsWith('http')
                    ? item.posterUrl
                    : 'https://phimimg.com/${item.posterUrl.startsWith('/') ? item.posterUrl.substring(1) : item.posterUrl}',
                fit: BoxFit.cover,
                errorWidget: (_, __, ___) => Container(color: AppTheme.card),
              ),
            ),
          ),
          title: Text(
            item.movieName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14),
          ),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 4),
              Text(
                '${item.episodeName} • ${item.serverName}',
                style: const TextStyle(color: AppTheme.primaryLight, fontSize: 12),
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(2),
                child: LinearProgressIndicator(
                  value: item.progressPercentage,
                  backgroundColor: Colors.white12,
                  valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primary),
                  minHeight: 4,
                ),
              ),
            ],
          ),
          trailing: const Icon(Icons.play_circle_fill, color: AppTheme.primary, size: 32),
        );
      },
    );
  }
}
