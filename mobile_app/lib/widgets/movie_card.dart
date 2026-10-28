import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/movie.dart';
import '../theme/app_theme.dart';
import '../screens/detail_screen.dart';

/// Premium Netflix-style Movie Card for Mobile & Tablet (iPad)
class MovieCard extends StatelessWidget {
  final Movie movie;
  final double? width;
  final double? height;
  final EdgeInsetsGeometry? margin;
  final bool showRating;
  final double aspectRatio;

  const MovieCard({
    super.key,
    required this.movie,
    this.width = 125,
    this.height,
    this.margin = const EdgeInsets.only(right: 12),
    this.showRating = true,
    this.aspectRatio = 2 / 3,
  });

  @override
  Widget build(BuildContext context) {
    Widget cardContent = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        // Theatrical 2:3 Poster Container with Netflix Badges
        AspectRatio(
          aspectRatio: aspectRatio,
          child: Container(
            decoration: BoxDecoration(
              color: AppTheme.cardElevated,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: Colors.white.withOpacity(0.08),
                width: 0.8,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.35),
                  blurRadius: 8,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(7.2),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Poster Image
                  CachedNetworkImage(
                    imageUrl: movie.fullPosterUrl,
                    fit: BoxFit.cover,
                    memCacheWidth: 360,
                    placeholder: (context, url) => Container(
                      color: AppTheme.card,
                      child: const Center(
                        child: SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppTheme.primary,
                          ),
                        ),
                      ),
                    ),
                    errorWidget: (context, url, error) => Container(
                      color: AppTheme.cardElevated,
                      child: const Center(
                        child: Icon(
                          Icons.movie_creation_outlined,
                          color: AppTheme.textMuted,
                          size: 32,
                        ),
                      ),
                    ),
                  ),

                  // Vignette Bottom Scrim for Badge Contrast
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            Colors.transparent,
                            Colors.black.withOpacity(0.15),
                            Colors.black.withOpacity(0.78),
                          ],
                          stops: const [0.55, 0.78, 1.0],
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                        ),
                      ),
                    ),
                  ),

                  // Top-Right Quality Badge (Netflix Style)
                  Positioned(
                    top: 6,
                    right: 6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.75),
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(
                          color: AppTheme.primary.withOpacity(0.6),
                          width: 0.6,
                        ),
                      ),
                      child: Text(
                        movie.quality.isNotEmpty ? movie.quality : 'FHD',
                        style: const TextStyle(
                          color: AppTheme.primaryLight,
                          fontSize: 9,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.2,
                        ),
                      ),
                    ),
                  ),

                  // Bottom Episode / Lang Tag
                  if (movie.episodeCurrent.isNotEmpty)
                    Positioned(
                      bottom: 6,
                      left: 6,
                      right: 6,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.75),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          movie.episodeCurrent,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),

        const SizedBox(height: 7),

        // Movie Name
        Text(
          movie.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: AppTheme.textPrimary,
            fontSize: 13,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.2,
          ),
        ),

        const SizedBox(height: 2),

        // Year & Star Rating
        Row(
          children: [
            if (movie.year != null)
              Text(
                '${movie.year}',
                style: const TextStyle(color: AppTheme.textMuted, fontSize: 11),
              ),
            if (movie.year != null && movie.voteAverage > 0 && showRating)
              const Text(' • ', style: TextStyle(color: AppTheme.textMuted, fontSize: 11)),
            if (movie.voteAverage > 0 && showRating) ...[
              const Icon(Icons.star_rounded, color: AppTheme.gold, size: 13),
              const SizedBox(width: 2),
              Text(
                movie.voteAverage.toStringAsFixed(1),
                style: const TextStyle(
                  color: AppTheme.gold,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ],
        ),
      ],
    );

    if (width != null) {
      cardContent = SizedBox(width: width, child: cardContent);
    }

    if (margin != null) {
      cardContent = Padding(padding: margin!, child: cardContent);
    }

    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => MovieDetailScreen(slug: movie.slug, initialMovie: movie),
          ),
        );
      },
      child: cardContent,
    );
  }
}
