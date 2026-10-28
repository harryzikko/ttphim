import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../models/movie.dart';
import '../../theme/app_theme.dart';

/// Reusable D-pad focusable movie card for Android TV 10-foot Leanback UI (Netflix-Style)
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
    this.height = 255,
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
    final poster = widget.movie.fullPosterUrl;

    return Focus(
      onFocusChange: (focused) {
        setState(() => _isFocused = focused);
      },
      onKeyEvent: (node, event) {
        if (event is KeyDownEvent &&
            [LogicalKeyboardKey.select, LogicalKeyboardKey.enter, LogicalKeyboardKey.space].contains(event.logicalKey)) {
          widget.onSelect();
          return KeyEventResult.handled;
        }
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
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: _isFocused ? AppTheme.primary : Colors.white.withOpacity(0.08),
                width: _isFocused ? 2.8 : 1.0,
              ),
              boxShadow: _isFocused
                  ? [
                      BoxShadow(
                        color: AppTheme.primary.withOpacity(0.7),
                        blurRadius: 22,
                        spreadRadius: 3,
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
              borderRadius: BorderRadius.circular(8.5),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Poster Image
                  CachedNetworkImage(
                    imageUrl: poster,
                    fit: BoxFit.cover,
                    placeholder: (_, __) => Container(color: AppTheme.card),
                    errorWidget: (_, __, ___) => Container(
                      color: AppTheme.cardElevated,
                      child: const Center(
                        child: Icon(Icons.movie_creation_rounded, color: Colors.white24, size: 40),
                      ),
                    ),
                  ),

                  // Rich Gradient Scrim for 10-foot Readability
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            Colors.transparent,
                            Colors.black.withOpacity(0.2),
                            Colors.black.withOpacity(0.92),
                          ],
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          stops: const [0.45, 0.7, 1.0],
                        ),
                      ),
                    ),
                  ),

                  // Quality Badge Top-Left (Netflix Signature)
                  Positioned(
                    top: 8,
                    left: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2.5),
                      decoration: BoxDecoration(
                        color: AppTheme.primary,
                        borderRadius: BorderRadius.circular(4),
                        boxShadow: const [
                          BoxShadow(color: Colors.black54, blurRadius: 4),
                        ],
                      ),
                      child: Text(
                        widget.movie.quality.isNotEmpty ? widget.movie.quality : 'FHD',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                  ),

                  // Rating / Year Badge Top-Right
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2.5),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.75),
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: Colors.white12, width: 0.5),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (widget.movie.voteAverage > 0) ...[
                            const Icon(Icons.star_rounded, color: AppTheme.gold, size: 12),
                            const SizedBox(width: 2),
                            Text(
                              widget.movie.voteAverage.toStringAsFixed(1),
                              style: const TextStyle(
                                color: AppTheme.gold,
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ] else if (widget.movie.year != null) ...[
                            Text(
                              '${widget.movie.year}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),

                  // Watch Progress Bar if applicable
                  if (widget.showProgress)
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 54,
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
                    left: 9,
                    right: 9,
                    bottom: 8,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          widget.movie.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: _isFocused ? Colors.white : Colors.white.withOpacity(0.92),
                            fontSize: 12.5,
                            height: 1.25,
                            fontWeight: FontWeight.bold,
                            shadows: const [
                              Shadow(color: Colors.black, blurRadius: 4),
                            ],
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          widget.movie.episodeCurrent.isNotEmpty
                              ? widget.movie.episodeCurrent
                              : (widget.movie.originName.isNotEmpty ? widget.movie.originName : 'CineViet'),
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
