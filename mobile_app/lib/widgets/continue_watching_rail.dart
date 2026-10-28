import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/movie_detail.dart';
import '../screens/detail_screen.dart';
import '../screens/player_screen.dart';
import '../services/api_service.dart';
import '../services/storage_service.dart';
import '../theme/app_theme.dart';

class ContinueWatchingRail extends StatefulWidget {
  final List<WatchHistoryItem> items;
  final VoidCallback? onSeeAll;
  final VoidCallback? onRefresh;

  const ContinueWatchingRail({
    super.key,
    required this.items,
    this.onSeeAll,
    this.onRefresh,
  });

  @override
  State<ContinueWatchingRail> createState() => _ContinueWatchingRailState();
}

class _ContinueWatchingRailState extends State<ContinueWatchingRail> {
  late List<WatchHistoryItem> _items;

  @override
  void initState() {
    super.initState();
    _items = List<WatchHistoryItem>.from(widget.items);
  }

  @override
  void didUpdateWidget(covariant ContinueWatchingRail oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.items != oldWidget.items) {
      setState(() {
        _items = List<WatchHistoryItem>.from(widget.items);
      });
    }
  }

  void _resumePlayback(BuildContext context, WatchHistoryItem item) async {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Đang mở ${item.movieName} - ${item.episodeName}...'),
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
      widget.onRefresh?.call();
    } else {
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => MovieDetailScreen(slug: item.movieSlug),
        ),
      );
      widget.onRefresh?.call();
    }
  }

  void _removeItem(BuildContext context, WatchHistoryItem item) async {
    // 1. Optimistic instant removal from UI state
    setState(() {
      _items.removeWhere((i) => i.movieSlug == item.movieSlug);
    });

    // 2. Clear SnackBar & display clear user feedback
    if (context.mounted) {
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.check_circle_outline_rounded, color: Colors.white, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Đã xóa "${item.movieName}" khỏi Tiếp tục xem',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          duration: const Duration(seconds: 2),
          backgroundColor: const Color(0xFF232838),
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
      );
    }

    // 3. Persist removal to local tombstone & remote backend
    await StorageService.removeHistoryItem(item.movieSlug);

    // 4. Trigger parent reload
    widget.onRefresh?.call();
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
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Pill drag handle
              Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),

              // Movie preview row
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
                child: Row(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: SizedBox(
                        width: 60,
                        height: 38,
                        child: CachedNetworkImage(
                          imageUrl: item.bestImageUrl,
                          fit: BoxFit.cover,
                          memCacheWidth: 200,
                          errorWidget: (_, __, ___) => Container(
                            color: AppTheme.card,
                            child: const Icon(Icons.movie_rounded, color: AppTheme.textMuted, size: 18),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.movieName,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${item.episodeName.isNotEmpty ? item.episodeName : item.serverName} • ${item.remainingTimeText}',
                            style: const TextStyle(
                              color: AppTheme.primaryLight,
                              fontSize: 12,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const Divider(color: AppTheme.border, height: 20),

              // Action 1: Resume Watching
              ListTile(
                leading: const Icon(Icons.play_circle_fill_rounded, color: AppTheme.primary, size: 24),
                title: const Text('Tiếp tục xem ngay', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                onTap: () {
                  Navigator.pop(ctx);
                  _resumePlayback(context, item);
                },
              ),

              // Action 2: Details & Episodes
              ListTile(
                leading: const Icon(Icons.info_outline_rounded, color: Colors.white70, size: 22),
                title: const Text('Xem thông tin & danh sách tập', style: TextStyle(color: Colors.white)),
                onTap: () {
                  Navigator.pop(ctx);
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => MovieDetailScreen(slug: item.movieSlug),
                    ),
                  ).then((_) => widget.onRefresh?.call());
                },
              ),

              // Action 3: Remove from Continue Watching
              ListTile(
                leading: const Icon(Icons.delete_outline_rounded, color: Colors.redAccent, size: 22),
                title: const Text('Xóa khỏi hàng Tiếp tục xem', style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w500)),
                onTap: () {
                  Navigator.pop(ctx);
                  _removeItem(context, item);
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
    if (_items.isEmpty) return const SizedBox.shrink();

    final isTablet = MediaQuery.of(context).size.shortestSide >= 600;
    final cardWidth = isTablet ? 260.0 : 215.0;
    final imageHeight = isTablet ? 146.0 : 121.0;
    final railHeight = isTablet ? 222.0 : 188.0;

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
              if (widget.onSeeAll != null)
                TextButton(
                  onPressed: widget.onSeeAll,
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

        // Horizontal List of 16:9 Landscape Cards
        SizedBox(
          height: railHeight,
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            itemCount: _items.length,
            itemBuilder: (context, index) {
              final item = _items[index];

              return Container(
                width: cardWidth,
                margin: const EdgeInsets.only(right: 12),
                child: GestureDetector(
                  onTap: () => _resumePlayback(context, item),
                  onLongPress: () => _showOptionsModal(context, item),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 16:9 Landscape Thumbnail Container
                      Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(10),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.35),
                              blurRadius: 6,
                              offset: const Offset(0, 3),
                            ),
                          ],
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: Stack(
                            children: [
                              // Backdrop / Poster Image
                              SizedBox(
                                width: cardWidth,
                                height: imageHeight,
                                child: CachedNetworkImage(
                                  imageUrl: item.bestImageUrl,
                                  fit: BoxFit.cover,
                                  memCacheWidth: 460,
                                  placeholder: (_, __) => Container(
                                    color: const Color(0xFF1B1F2D),
                                  ),
                                  errorWidget: (_, __, ___) => Container(
                                    color: AppTheme.card,
                                    child: const Center(
                                      child: Icon(Icons.movie_rounded, color: AppTheme.textMuted, size: 28),
                                    ),
                                  ),
                                ),
                              ),

                              // Cinematic Vignette Gradient Overlay
                              Positioned.fill(
                                child: Container(
                                  decoration: BoxDecoration(
                                    gradient: LinearGradient(
                                      begin: Alignment.topCenter,
                                      end: Alignment.bottomCenter,
                                      colors: [
                                        Colors.black.withOpacity(0.35),
                                        Colors.transparent,
                                        Colors.black.withOpacity(0.85),
                                      ],
                                      stops: const [0.0, 0.45, 1.0],
                                    ),
                                  ),
                                ),
                              ),

                              // Frosted Glass Center Play Button
                              Positioned.fill(
                                child: Center(
                                  child: Container(
                                    width: 42,
                                    height: 42,
                                    decoration: BoxDecoration(
                                      color: Colors.black.withOpacity(0.55),
                                      shape: BoxShape.circle,
                                      border: Border.all(color: Colors.white.withOpacity(0.7), width: 1.5),
                                      boxShadow: [
                                        BoxShadow(
                                          color: Colors.black.withOpacity(0.5),
                                          blurRadius: 8,
                                          offset: const Offset(0, 2),
                                        ),
                                      ],
                                    ),
                                    child: const Icon(
                                      Icons.play_arrow_rounded,
                                      color: Colors.white,
                                      size: 26,
                                    ),
                                  ),
                                ),
                              ),

                              // Top-Left Episode Pill Badge
                              Positioned(
                                top: 8,
                                left: 8,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withOpacity(0.75),
                                    borderRadius: BorderRadius.circular(5),
                                    border: Border.all(color: Colors.white12),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Container(
                                        width: 5,
                                        height: 5,
                                        decoration: const BoxDecoration(
                                          color: AppTheme.primary,
                                          shape: BoxShape.circle,
                                        ),
                                      ),
                                      const SizedBox(width: 4.5),
                                      Text(
                                        item.episodeName.isNotEmpty ? item.episodeName : 'Tập 1',
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 10.5,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),

                              // Red Netflix-Style Progress Indicator
                              Positioned(
                                left: 0,
                                right: 0,
                                bottom: 0,
                                child: LinearProgressIndicator(
                                  value: (item.progressPercentage > 0 ? item.progressPercentage : 0.05).clamp(0.0, 1.0),
                                  backgroundColor: Colors.white.withOpacity(0.22),
                                  valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primary),
                                  minHeight: 3.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),

                      const SizedBox(height: 7),

                      // Movie Name (Bold & Crisp)
                      Text(
                        item.movieName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: AppTheme.textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.1,
                        ),
                      ),

                      const SizedBox(height: 2),

                      // Metadata Subtitle: Remaining Time + 3-Dots Button
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              item.remainingTimeText,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: AppTheme.textSecondary.withOpacity(0.85),
                                fontSize: 11.5,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                          InkWell(
                            borderRadius: BorderRadius.circular(16),
                            onTap: () => _showOptionsModal(context, item),
                            child: const Padding(
                              padding: EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                              child: Icon(
                                Icons.more_vert_rounded,
                                color: AppTheme.textMuted,
                                size: 17,
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
