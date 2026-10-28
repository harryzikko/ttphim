import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/movie_detail.dart';
import '../screens/detail_screen.dart';
import '../screens/player_screen.dart';
import '../services/api_service.dart';
import '../services/storage_service.dart';
import '../theme/app_theme.dart';

class ContinueWatchingRail extends StatelessWidget {
  final List<WatchHistoryItem> items;
  final VoidCallback? onSeeAll;
  final VoidCallback? onRefresh;

  const ContinueWatchingRail({
    super.key,
    required this.items,
    this.onSeeAll,
    this.onRefresh,
  });

  void _resumePlayback(BuildContext context, WatchHistoryItem item) async {
    // Show quick feedback while loading detail
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Đang mở ${item.movieName} - ${item.episodeName}...'),
        duration: const Duration(seconds: 1),
        backgroundColor: AppTheme.surface,
      ),
    );

    final detail = await ApiService.getMovieDetail(item.movieSlug);
    if (!context.mounted) return;

    if (detail != null && detail.servers.isNotEmpty) {
      // Find matching server or fallback
      var server = detail.servers.firstWhere(
        (s) => s.serverName == item.serverName,
        orElse: () => detail.servers.first,
      );

      // Find matching episode or fallback
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
      onRefresh?.call();
    } else {
      // Fallback directly to MovieDetailScreen
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => MovieDetailScreen(slug: item.movieSlug),
        ),
      );
      onRefresh?.call();
    }
  }

  void _showOptionsModal(BuildContext context, WatchHistoryItem item) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF141722),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        item.movieName,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              const Divider(color: AppTheme.border, height: 16),
              ListTile(
                leading: const Icon(Icons.info_outline_rounded, color: Colors.white),
                title: const Text('Xem chi tiết & danh sách tập', style: TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.pop(ctx);
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => MovieDetailScreen(slug: item.movieSlug),
                    ),
                  ).then((_) => onRefresh?.call());
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline_rounded, color: Colors.redAccent),
                title: const Text('Xóa khỏi hàng Tiếp tục xem', style: TextStyle(color: Colors.redAccent)),
                onTap: () async {
                  Navigator.pop(ctx);
                  await StorageService.removeHistoryItem(item.movieSlug);
                  onRefresh?.call();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section Header
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    width: 3.5,
                    height: 16,
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(
                      color: AppTheme.primary,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const Text(
                    'Tiếp Tục Xem',
                    style: TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.3,
                    ),
                  ),
                ],
              ),
              if (onSeeAll != null)
                TextButton(
                  onPressed: onSeeAll,
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: const Row(
                    children: [
                      Text(
                        'Xem tất cả',
                        style: TextStyle(color: AppTheme.textSecondary, fontSize: 12),
                      ),
                      SizedBox(width: 2),
                      Icon(Icons.chevron_right, color: AppTheme.textSecondary, size: 16),
                    ],
                  ),
                ),
            ],
          ),
        ),

        // Horizontal List
        SizedBox(
          height: 200,
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            itemCount: items.length,
            itemBuilder: (context, index) {
              final item = items[index];
              final imageUrl = item.posterUrl.startsWith('http')
                  ? item.posterUrl
                  : 'https://phimimg.com/${item.posterUrl.startsWith('/') ? item.posterUrl.substring(1) : item.posterUrl}';

              return Container(
                width: 135,
                margin: const EdgeInsets.only(right: 12),
                child: GestureDetector(
                  onTap: () => _resumePlayback(context, item),
                  onLongPress: () => _showOptionsModal(context, item),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Poster Thumbnail with Progress Bar & Play Icon
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Stack(
                          children: [
                            SizedBox(
                              width: 135,
                              height: 140,
                              child: CachedNetworkImage(
                                imageUrl: imageUrl,
                                fit: BoxFit.cover,
                                memCacheWidth: 400,
                                errorWidget: (_, __, ___) => Container(
                                  color: AppTheme.card,
                                  child: const Icon(Icons.movie_rounded, color: AppTheme.textMuted),
                                ),
                              ),
                            ),
                            // Dark Gradient
                            Positioned.fill(
                              child: Container(
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    begin: Alignment.topCenter,
                                    end: Alignment.bottomCenter,
                                    colors: [
                                      Colors.transparent,
                                      Colors.black.withOpacity(0.65),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            // Centered Play Button
                            Positioned.fill(
                              child: Center(
                                child: Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withOpacity(0.65),
                                    shape: BoxShape.circle,
                                    border: Border.all(color: Colors.white38, width: 1.2),
                                  ),
                                  child: const Icon(
                                    Icons.play_arrow_rounded,
                                    color: Colors.white,
                                    size: 24,
                                  ),
                                ),
                              ),
                            ),
                            // Red Progress Indicator
                            Positioned(
                              left: 0,
                              right: 0,
                              bottom: 0,
                              child: ClipRRect(
                                child: LinearProgressIndicator(
                                  value: item.progressPercentage > 0 ? item.progressPercentage : 0.05,
                                  backgroundColor: Colors.white24,
                                  valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primary),
                                  minHeight: 3.5,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),

                      const SizedBox(height: 6),

                      // Movie Name
                      Text(
                        item.movieName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                        ),
                      ),

                      const SizedBox(height: 2),

                      // Episode and Info button
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              item.episodeName.isNotEmpty ? item.episodeName : item.serverName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: AppTheme.primaryLight,
                                fontSize: 11,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                          GestureDetector(
                            onTap: () => _showOptionsModal(context, item),
                            child: const Padding(
                              padding: EdgeInsets.only(left: 4),
                              child: Icon(
                                Icons.more_vert_rounded,
                                color: AppTheme.textMuted,
                                size: 16,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
