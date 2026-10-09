import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/movie.dart';
import '../theme/app_theme.dart';
import '../screens/detail_screen.dart';

class Top10Reel extends StatelessWidget {
  final List<Movie> movies;

  const Top10Reel({super.key, required this.movies});

  @override
  Widget build(BuildContext context) {
    if (movies.isEmpty) return const SizedBox.shrink();
    final topList = movies.take(10).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header
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

        // Reel with Giant Rank Numbers
        SizedBox(
          height: 200,
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
                  width: 170,
                  margin: const EdgeInsets.only(right: 12),
                  child: Stack(
                    alignment: Alignment.bottomLeft,
                    children: [
                      // Huge Rank Number (Behind / Beside)
                      Positioned(
                        left: -4,
                        bottom: -15,
                        child: Text(
                          '$rank',
                          style: TextStyle(
                            fontSize: 110,
                            fontWeight: FontWeight.w900,
                            color: const Color(0xFF262D42),
                            letterSpacing: -6,
                            shadows: [
                              Shadow(
                                color: Colors.black.withOpacity(0.9),
                                offset: const Offset(2, 2),
                                blurRadius: 4,
                              ),
                            ],
                          ),
                        ),
                      ),

                      // Movie Poster Card (Shifted right)
                      Positioned(
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: 125,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(10),
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              CachedNetworkImage(
                                imageUrl: movie.fullPosterUrl,
                                fit: BoxFit.cover,
                                placeholder: (context, url) => Container(color: AppTheme.card),
                                errorWidget: (context, url, error) => Container(
                                  color: AppTheme.cardElevated,
                                  child: const Icon(Icons.movie, color: AppTheme.textMuted),
                                ),
                              ),
                              // Rank tag overlay
                              Positioned(
                                top: 6,
                                left: 6,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: AppTheme.primary,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    'TOP $rank',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 9,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ),
                            ],
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
