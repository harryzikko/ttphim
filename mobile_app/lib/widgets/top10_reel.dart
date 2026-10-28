import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/movie.dart';
import '../theme/app_theme.dart';
import '../screens/detail_screen.dart';

/// Netflix-style Top 10 Today Reel with signature giant stroked numbers
class Top10Reel extends StatelessWidget {
  final List<Movie> movies;

  const Top10Reel({super.key, required this.movies});

  @override
  Widget build(BuildContext context) {
    if (movies.isEmpty) return const SizedBox.shrink();
    final topList = movies.take(10).toList();

    final isTablet = MediaQuery.of(context).size.width >= 600;
    final reelHeight = isTablet ? 260.0 : 205.0;
    final containerWidth = isTablet ? 215.0 : 170.0;
    final posterWidth = isTablet ? 155.0 : 125.0;
    final numberFontSize = isTablet ? 140.0 : 112.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section Header
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              Container(
                width: 3.5,
                height: 16,
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(
                  color: AppTheme.gold,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const Text(
                'Top 10 Hôm Nay Tại Việt Nam',
                style: TextStyle(
                  color: AppTheme.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
        ),

        // Reel with Signature Netflix-Style Numbers
        SizedBox(
          height: reelHeight,
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            scrollDirection: Axis.horizontal,
            physics: const BouncingScrollPhysics(),
            itemCount: topList.length,
            itemBuilder: (context, index) {
              final movie = topList[index];
              final rank = index + 1;

              return GestureDetector(
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => MovieDetailScreen(slug: movie.slug, initialMovie: movie),
                    ),
                  );
                },
                child: Container(
                  width: containerWidth,
                  margin: const EdgeInsets.only(right: 12),
                  child: Stack(
                    alignment: Alignment.bottomLeft,
                    children: [
                      // Iconic Netflix Giant Rank Number (Stroke + Dark Core)
                      Positioned(
                        left: -6,
                        bottom: -18,
                        child: Stack(
                          children: [
                            // Metallic Border Outline
                            Text(
                              '$rank',
                              style: TextStyle(
                                fontSize: numberFontSize,
                                fontWeight: FontWeight.w900,
                                foreground: Paint()
                                  ..style = PaintingStyle.stroke
                                  ..strokeWidth = isTablet ? 4.5 : 3.5
                                  ..color = const Color(0xFF636A7E),
                                letterSpacing: -6,
                              ),
                            ),
                            // Dark Charcoal Core Fill with Drop Shadow
                            Text(
                              '$rank',
                              style: TextStyle(
                                fontSize: numberFontSize,
                                fontWeight: FontWeight.w900,
                                color: const Color(0xFF11141D),
                                letterSpacing: -6,
                                shadows: [
                                  Shadow(
                                    color: Colors.black.withOpacity(0.9),
                                    offset: const Offset(3, 3),
                                    blurRadius: 6,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),

                      // Movie Poster Card (Shifted right)
                      Positioned(
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: posterWidth,
                        child: Container(
                          decoration: BoxDecoration(
                            color: AppTheme.cardElevated,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: Colors.white.withOpacity(0.09),
                              width: 0.8,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.4),
                                blurRadius: 8,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(7.2),
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                CachedNetworkImage(
                                  imageUrl: movie.fullPosterUrl,
                                  fit: BoxFit.cover,
                                  placeholder: (context, url) => Container(
                                    color: AppTheme.card,
                                    child: const Center(
                                      child: SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: AppTheme.primary,
                                        ),
                                      ),
                                    ),
                                  ),
                                  errorWidget: (context, url, error) => Container(
                                    color: AppTheme.cardElevated,
                                    child: const Icon(Icons.movie_creation_outlined, color: AppTheme.textMuted),
                                  ),
                                ),

                                // Gradient Scrim
                                Positioned.fill(
                                  child: DecoratedBox(
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        colors: [
                                          Colors.transparent,
                                          Colors.black.withOpacity(0.15),
                                          Colors.black.withOpacity(0.8),
                                        ],
                                        stops: const [0.55, 0.78, 1.0],
                                        begin: Alignment.topCenter,
                                        end: Alignment.bottomCenter,
                                      ),
                                    ),
                                  ),
                                ),

                                // Top-Left Rank Tag
                                Positioned(
                                  top: 6,
                                  left: 6,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      gradient: rank <= 3 ? AppTheme.primaryGradient : null,
                                      color: rank > 3 ? Colors.black.withOpacity(0.8) : null,
                                      borderRadius: BorderRadius.circular(4),
                                      border: Border.all(
                                        color: rank <= 3 ? AppTheme.gold : Colors.white24,
                                        width: 0.6,
                                      ),
                                    ),
                                    child: Text(
                                      'TOP $rank',
                                      style: TextStyle(
                                        color: rank <= 3 ? Colors.white : AppTheme.primaryLight,
                                        fontSize: 9,
                                        fontWeight: FontWeight.bold,
                                        letterSpacing: 0.3,
                                      ),
                                    ),
                                  ),
                                ),

                                // Quality Pill Top-Right
                                Positioned(
                                  top: 6,
                                  right: 6,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: Colors.black.withOpacity(0.75),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      movie.quality.isNotEmpty ? movie.quality : 'FHD',
                                      style: const TextStyle(
                                        color: Colors.white70,
                                        fontSize: 8.5,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                                ),

                                // Bottom Title
                                Positioned(
                                  bottom: 6,
                                  left: 6,
                                  right: 6,
                                  child: Text(
                                    movie.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 10.5,
                                      fontWeight: FontWeight.w600,
                                      shadows: [
                                        Shadow(color: Colors.black, blurRadius: 4),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
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
