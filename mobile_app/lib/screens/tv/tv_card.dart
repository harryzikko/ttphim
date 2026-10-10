import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../models/movie.dart';
import '../../theme/app_theme.dart';

/// Reusable D-pad focusable movie card for Android TV 10-foot Leanback UI
class TvMovieCard extends StatefulWidget {
  final Movie movie;
  final VoidCallback onSelect;
  final double width;
  final double height;
  final bool showProgress;
  final double progress;

  const TvMovieCard({
    super.key,
    required this.movie,
    required this.onSelect,
    this.width = 170,
    this.height = 250,
    this.showProgress = false,
    this.progress = 0.0,
  });

  @override
  State<TvMovieCard> createState() => _TvMovieCardState();
}

class _TvMovieCardState extends State<TvMovieCard> {
  bool _isFocused = false;

  @override
  Widget build(BuildContext context) {
    final poster = widget.movie.posterUrl.isNotEmpty
        ? widget.movie.posterUrl
        : widget.movie.thumbUrl;

    return Focus(
      onFocusChange: (focused) {
        setState(() => _isFocused = focused);
      },
      onKeyEvent: (node, event) {
        return KeyEventResult.ignored;
      },
      child: GestureDetector(
        onTap: widget.onSelect,
        child: AnimatedScale(
          scale: _isFocused ? 1.08 : 1.0,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            width: widget.width,
            height: widget.height,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: _isFocused ? AppTheme.primary : Colors.white.withOpacity(0.08),
                width: _isFocused ? 2.5 : 1.0,
              ),
              boxShadow: _isFocused
                  ? [
                      BoxShadow(
                        color: AppTheme.primary.withOpacity(0.55),
                        blurRadius: 20,
                        spreadRadius: 2,
                        offset: const Offset(0, 6),
                      ),
                    ]
                  : [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.35),
                        blurRadius: 8,
                        offset: const Offset(0, 4),
                      ),
                    ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Poster Image
                  CachedNetworkImage(
                    imageUrl: poster,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => Container(color: AppTheme.card),
                    errorWidget: (_, __) => Container(
                      color: AppTheme.card,
                      child: const Center(
                        child: Icon(Icons.movie_creation_rounded, color: Colors.white24, size: 40),
                      ),
                    ),
                  ),

                  // Gradient Scrim for Readability
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            Colors.transparent,
                            Colors.black.withOpacity(0.1),
                            Colors.black.withOpacity(0.85),
                          ],
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          stops: const [0.4, 0.65, 1.0],
                        ),
                      ),
                    ),
                  ),

                  // Quality & Episode Badges
                  Positioned(
                    top: 8,
                    left: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppTheme.primary,
                        borderRadius: BorderRadius.circular(4),
                        boxShadow: const [
                          BoxShadow(color: Colors.black45, blurRadius: 4),
                        ],
                      ),
                      child: Text(
                        widget.movie.quality.isNotEmpty ? widget.movie.quality : 'FHD',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ),

                  if (widget.movie.year != null)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.7),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          '${widget.movie.year}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),

                  // Watch Progress Bar if applicable
                  if (widget.showProgress)
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 46,
                      child: Container(
                        height: 3.5,
                        color: Colors.white24,
                        child: FractionallySizedBox(
                          alignment: Alignment.centerLeft,
                          widthFactor: widget.progress.clamp(0.05, 1.0),
                          child: Container(color: AppTheme.primary),
                        ),
                      ),
                    ),

                  // Movie Title & Episode Metadata
                  Positioned(
                    left: 8,
                    right: 8,
                    bottom: 8,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          widget.movie.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: _isFocused ? Colors.white : Colors.white.withOpacity(0.9),
                            fontSize: 12.5,
                            fontWeight: FontWeight.bold,
                            shadows: const [
                              Shadow(color: Colors.black, blurRadius: 4),
                            ],
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          widget.movie.episodeCurrent.isNotEmpty
                              ? widget.movie.episodeCurrent
                              : (widget.movie.originName.isNotEmpty ? widget.movie.originName : 'TTPHIM'),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppTheme.primaryLight,
                            fontSize: 10.5,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
