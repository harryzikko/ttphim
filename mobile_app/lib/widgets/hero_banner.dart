import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../models/movie.dart';
import '../theme/app_theme.dart';
import '../screens/detail_screen.dart';

class HeroBanner extends StatefulWidget {
  final List<Movie> movies;

  const HeroBanner({super.key, required this.movies});

  @override
  State<HeroBanner> createState() => _HeroBannerState();
}

class _HeroBannerState extends State<HeroBanner> {
  final PageController _pageController = PageController();
  int _currentIndex = 0;
  Timer? _autoPlayTimer;

  @override
  void initState() {
    super.initState();
    _startAutoPlay();
  }

  void _startAutoPlay() {
    _autoPlayTimer?.cancel();
    _autoPlayTimer = Timer.periodic(const Duration(seconds: 7), (_) {
      if (!mounted || !_pageController.hasClients || widget.movies.isEmpty) return;
      final total = widget.movies.take(8).length;
      if (total <= 1) return;
      final nextIndex = (_currentIndex + 1) % total;
      _pageController.animateToPage(
        nextIndex,
        duration: const Duration(milliseconds: 600),
        curve: Curves.easeInOutCubic,
      );
    });
  }

  @override
  void dispose() {
    _autoPlayTimer?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  String _cleanHtml(String text) {
    if (text.isEmpty) return '';
    return text
        .replaceAll(RegExp(r'<[^>]*>'), '')
        .replaceAll('&nbsp;', ' ')
        .replaceAll('&amp;', '&')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .trim();
  }

  void _navigateToDetail(BuildContext context, Movie movie) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => MovieDetailScreen(slug: movie.slug, initialMovie: movie),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (widget.movies.isEmpty) return const SizedBox.shrink();
    final displayList = widget.movies.take(8).toList();

    final screenWidth = MediaQuery.of(context).size.width;
    final isTablet = screenWidth >= 600;
    // Responsive cinematic height: 440px on phone, clamped 480-540px on tablet
    final bannerHeight = isTablet ? (screenWidth * 0.50).clamp(480.0, 540.0) : 440.0;

    return SizedBox(
      height: bannerHeight,
      child: Stack(
        children: [
          // Page View
          PageView.builder(
            controller: _pageController,
            itemCount: displayList.length,
            onPageChanged: (idx) {
              setState(() => _currentIndex = idx);
              _startAutoPlay(); // Restart timer on manual swipe
            },
            itemBuilder: (context, index) {
              final movie = displayList[index];

              // Mobile uses vertical poster, iPad / Tablet uses horizontal thumb (or poster as fallback)
              final primaryImage = isTablet
                  ? (movie.fullThumbUrl.isNotEmpty ? movie.fullThumbUrl : movie.fullPosterUrl)
                  : (movie.fullPosterUrl.isNotEmpty ? movie.fullPosterUrl : movie.fullThumbUrl);
              final fallbackImage = isTablet
                  ? movie.fullPosterUrl
                  : movie.fullThumbUrl;

              return ClipRect(
                child: GestureDetector(
                  onTap: () => _navigateToDetail(context, movie),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      // 1. Ambient Blurred Glow Layer (fills entire banner with glowing cinema tones)
                      if (isTablet)
                        Positioned.fill(
                          child: ImageFiltered(
                            imageFilter: ImageFilter.blur(sigmaX: 32, sigmaY: 32),
                            child: CachedNetworkImage(
                              imageUrl: primaryImage,
                              fit: BoxFit.cover,
                              alignment: Alignment.center,
                              placeholder: (context, url) => Container(color: AppTheme.card),
                              errorWidget: (context, url, error) => CachedNetworkImage(
                                imageUrl: fallbackImage,
                                fit: BoxFit.cover,
                                alignment: Alignment.center,
                                placeholder: (context, url) => Container(color: AppTheme.card),
                                errorWidget: (context, url, error) => Container(color: AppTheme.card),
                              ),
                            ),
                          ),
                        ),

                      // Ambient tint to maintain deep cinema contrast
                      if (isTablet)
                        Positioned.fill(
                          child: Container(
                            color: const Color(0xFF0B0D13).withOpacity(0.45),
                          ),
                        ),

                      // 2. Sharp High-Resolution Foreground Artwork
                      Positioned.fill(
                        child: CachedNetworkImage(
                          imageUrl: primaryImage,
                          fit: BoxFit.cover,
                          alignment: isTablet ? Alignment.centerRight : Alignment.topCenter,
                          placeholder: (context, url) => Container(color: AppTheme.card),
                          errorWidget: (context, url, error) => CachedNetworkImage(
                            imageUrl: fallbackImage,
                            fit: BoxFit.cover,
                            alignment: isTablet ? Alignment.centerRight : Alignment.topCenter,
                            placeholder: (context, url) => Container(color: AppTheme.card),
                            errorWidget: (context, url, error) => Container(color: AppTheme.card),
                          ),
                        ),
                      ),

                      // 3. Multi-gradient Scrim Overlays (Netflix Signature Lighting)
                      if (isTablet) ...[
                        // Left-to-Right Horizontal Scrim: dark black on the left for text contrast, fading across artwork
                        Positioned.fill(
                          child: Container(
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                colors: [
                                  Color(0xFF0B0D13),
                                  Color(0xF00B0D13),
                                  Color(0xAA0B0D13),
                                  Color(0x330B0D13),
                                  Colors.transparent,
                                ],
                                stops: [0.0, 0.32, 0.54, 0.78, 1.0],
                                begin: Alignment.centerLeft,
                                end: Alignment.centerRight,
                              ),
                            ),
                          ),
                        ),
                        // Bottom-to-Top Vertical Scrim: seamless merge into page background
                        Positioned.fill(
                          child: Container(
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                colors: [
                                  Color(0xFF0B0D13),
                                  Color(0xD90B0D13),
                                  Color(0x440B0D13),
                                  Colors.transparent,
                                ],
                                stops: [0.0, 0.20, 0.45, 0.75],
                                begin: Alignment.bottomCenter,
                                end: Alignment.topCenter,
                              ),
                            ),
                          ),
                        ),
                      ] else ...[
                        // Phone Vertical Scrim: smooth bottom fade
                        Positioned.fill(
                          child: Container(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                colors: [
                                  Colors.transparent,
                                  Colors.transparent,
                                  Colors.black.withOpacity(0.45),
                                  const Color(0xFF0B0D13),
                                ],
                                stops: const [0.0, 0.35, 0.70, 1.0],
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                              ),
                            ),
                          ),
                        ),
                      ],

                      // Top Vignette (enhances App Bar / Status Bar readability)
                      Positioned(
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 90,
                        child: Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [
                                const Color(0xFF0B0D13).withOpacity(0.65),
                                Colors.transparent,
                              ],
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                            ),
                          ),
                        ),
                      ),

                      // 4. Movie Information & Action Buttons
                      if (isTablet)
                        // iPad / Tablet Layout: Left-aligned cinema typography
                        Positioned(
                          left: 44,
                          bottom: 36,
                          width: (screenWidth * 0.52).clamp(360.0, 560.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              // Spotlight Badge & Quality Tag
                              Row(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: AppTheme.primary,
                                      borderRadius: BorderRadius.circular(4),
                                      boxShadow: [
                                        BoxShadow(
                                          color: AppTheme.primary.withOpacity(0.5),
                                          blurRadius: 6,
                                          offset: const Offset(0, 2),
                                        ),
                                      ],
                                    ),
                                    child: const Text(
                                      'PHIM NỔI BẬT',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 10,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: 1.0,
                                      ),
                                    ),
                                  ),
                                  if (movie.quality.isNotEmpty) ...[
                                    const SizedBox(width: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: Colors.white.withOpacity(0.12),
                                        borderRadius: BorderRadius.circular(4),
                                        border: Border.all(color: Colors.white24, width: 0.5),
                                      ),
                                      child: Text(
                                        movie.quality,
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 10,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                              const SizedBox(height: 10),

                              // Movie Title (Large Cinema Heading)
                              Text(
                                movie.name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 34,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: -0.4,
                                  height: 1.15,
                                  shadows: [
                                    Shadow(color: Colors.black, blurRadius: 16, offset: Offset(0, 3)),
                                  ],
                                ),
                              ),

                              // Origin Name (Subtitle)
                              if (movie.originName.isNotEmpty && movie.originName != movie.name) ...[
                                const SizedBox(height: 4),
                                Text(
                                  movie.originName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: Colors.white.withOpacity(0.7),
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                    letterSpacing: 0.3,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 10),

                              // Metadata Row (Rating, Year, Episode/Duration)
                              Row(
                                children: [
                                  if (movie.voteAverage > 0) ...[
                                    const Icon(Icons.star_rounded, color: Color(0xFFFFB800), size: 16),
                                    const SizedBox(width: 4),
                                    Text(
                                      movie.voteAverage.toStringAsFixed(1),
                                      style: const TextStyle(
                                        color: Color(0xFFFFB800),
                                        fontSize: 12,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Text('•', style: TextStyle(color: Colors.white.withOpacity(0.4))),
                                    const SizedBox(width: 8),
                                  ],
                                  if (movie.year != null) ...[
                                    Text(
                                      '${movie.year}',
                                      style: TextStyle(
                                        color: Colors.white.withOpacity(0.85),
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    const SizedBox(width: 8),
                                    Text('•', style: TextStyle(color: Colors.white.withOpacity(0.4))),
                                    const SizedBox(width: 8),
                                  ],
                                  if (movie.episodeCurrent.isNotEmpty) ...[
                                    Text(
                                      movie.episodeCurrent,
                                      style: TextStyle(
                                        color: Colors.white.withOpacity(0.85),
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ] else if (movie.time.isNotEmpty) ...[
                                    Text(
                                      movie.time,
                                      style: TextStyle(
                                        color: Colors.white.withOpacity(0.85),
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ],
                              ),

                              // Short Synopsis (if content is available)
                              if (movie.content.isNotEmpty) ...[
                                const SizedBox(height: 10),
                                Text(
                                  _cleanHtml(movie.content),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: Colors.white.withOpacity(0.8),
                                    fontSize: 13,
                                    height: 1.4,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 18),

                              // Action Buttons
                              Row(
                                children: [
                                  ElevatedButton.icon(
                                    onPressed: () => _navigateToDetail(context, movie),
                                    icon: const Icon(Icons.play_arrow_rounded, color: Colors.black, size: 22),
                                    label: const Text(
                                      'PHÁT',
                                      style: TextStyle(
                                        color: Colors.black,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: 0.8,
                                        fontSize: 14,
                                      ),
                                    ),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.white,
                                      foregroundColor: Colors.black,
                                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                      elevation: 4,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  ElevatedButton.icon(
                                    onPressed: () => _navigateToDetail(context, movie),
                                    icon: const Icon(Icons.info_outline_rounded, color: Colors.white, size: 19),
                                    label: const Text(
                                      'Chi Tiết',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13,
                                      ),
                                    ),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.white.withOpacity(0.22),
                                      foregroundColor: Colors.white,
                                      shadowColor: Colors.transparent,
                                      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        )
                      else
                        // Phone Layout: Centered compact spotlight
                        Positioned(
                          left: 16,
                          right: 16,
                          bottom: 24,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.center,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                    decoration: BoxDecoration(
                                      color: AppTheme.primary,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: const Text(
                                      'NỔI BẬT',
                                      style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                                    ),
                                  ),
                                  if (movie.quality.isNotEmpty) ...[
                                    const SizedBox(width: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: Colors.black.withOpacity(0.6),
                                        borderRadius: BorderRadius.circular(4),
                                        border: Border.all(color: Colors.white24, width: 0.5),
                                      ),
                                      child: Text(
                                        movie.quality,
                                        style: const TextStyle(color: Colors.white, fontSize: 10),
                                      ),
                                    ),
                                  ],
                                  if (movie.year != null) ...[
                                    const SizedBox(width: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: Colors.black.withOpacity(0.6),
                                        borderRadius: BorderRadius.circular(4),
                                        border: Border.all(color: Colors.white24, width: 0.5),
                                      ),
                                      child: Text(
                                        '${movie.year}',
                                        style: const TextStyle(color: Colors.white, fontSize: 10),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                              const SizedBox(height: 8),

                              Text(
                                movie.name,
                                textAlign: TextAlign.center,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 22,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 0.3,
                                ),
                              ),
                              if (movie.originName.isNotEmpty) ...[
                                const SizedBox(height: 2),
                                Text(
                                  movie.originName,
                                  textAlign: TextAlign.center,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    color: AppTheme.textSecondary,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 14),

                              Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  ElevatedButton.icon(
                                    onPressed: () => _navigateToDetail(context, movie),
                                    icon: const Icon(Icons.play_arrow_rounded, color: Colors.black, size: 22),
                                    label: const Text(
                                      'PHÁT',
                                      style: TextStyle(
                                        color: Colors.black,
                                        fontWeight: FontWeight.w900,
                                        letterSpacing: 0.8,
                                        fontSize: 14,
                                      ),
                                    ),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.white,
                                      foregroundColor: Colors.black,
                                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 11),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                      elevation: 4,
                                    ),
                                  ),
                                  const SizedBox(width: 12),
                                  ElevatedButton.icon(
                                    onPressed: () => _navigateToDetail(context, movie),
                                    icon: const Icon(Icons.info_outline, color: Colors.white, size: 20),
                                    label: const Text(
                                      'Chi Tiết',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13,
                                      ),
                                    ),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: Colors.white.withOpacity(0.22),
                                      foregroundColor: Colors.white,
                                      shadowColor: Colors.transparent,
                                      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),

          // 5. Dots Indicator (Bottom-right on iPad, Bottom-center on Phone)
          Positioned(
            bottom: isTablet ? 24 : 8,
            right: isTablet ? 44 : 0,
            left: isTablet ? null : 0,
            child: Row(
              mainAxisAlignment: isTablet ? MainAxisAlignment.end : MainAxisAlignment.center,
              children: List.generate(displayList.length, (idx) {
                final isActive = idx == _currentIndex;
                return GestureDetector(
                  onTap: () {
                    _pageController.animateToPage(
                      idx,
                      duration: const Duration(milliseconds: 350),
                      curve: Curves.easeInOut,
                    );
                  },
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: isActive ? (isTablet ? 22 : 18) : (isTablet ? 7 : 6),
                    height: isTablet ? 5 : 4,
                    decoration: BoxDecoration(
                      color: isActive ? AppTheme.primary : Colors.white24,
                      borderRadius: BorderRadius.circular(3),
                      boxShadow: isActive
                          ? [
                              BoxShadow(
                                color: AppTheme.primary.withOpacity(0.6),
                                blurRadius: 6,
                              ),
                            ]
                          : null,
                    ),
                  ),
                );
              }),
            ),
          ),
        ],
      ),
    );
  }
}
