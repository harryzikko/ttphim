import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../models/movie.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/movie_card.dart';

class PersonScreen extends StatefulWidget {
  final String name;
  final bool isDirector;

  const PersonScreen({
    super.key,
    required this.name,
    this.isDirector = false,
  });

  @override
  State<PersonScreen> createState() => _PersonScreenState();
}

class _PersonScreenState extends State<PersonScreen> {
  List<Movie> _movies = [];
  bool _isLoading = true;
  String _displayName = '';
  String _role = '';
  String _avatarUrl = '';
  String _biography = '';
  String _placeOfBirth = '';
  bool _isBioExpanded = false;

  @override
  void initState() {
    super.initState();
    _displayName = widget.name;
    _role = widget.isDirector ? 'Đạo Diễn Điện Ảnh' : 'Diễn Viên Điện Ảnh';
    _avatarUrl = 'https://ui-avatars.com/api/?name=${Uri.encodeComponent(widget.name)}&background=${widget.isDirector ? "e5a914" : "e50914"}&color=fff&size=300&bold=true';
    _loadPersonData();
  }

  Future<void> _loadPersonData() async {
    setState(() => _isLoading = true);

    // 1. Fetch rich profile from TMDb via backend API
    final personData = await ApiService.getPersonDetail(widget.name);
    if (personData != null && personData['person'] != null) {
      final p = personData['person'] as Map<String, dynamic>;
      final rawMovies = (personData['movies'] as List?) ?? [];

      List<Movie> parsedMovies = [];
      for (final m in rawMovies) {
        if (m is Map<String, dynamic>) {
          parsedMovies.add(Movie.fromJson(m));
        }
      }

      if (mounted) {
        setState(() {
          _displayName = p['name']?.toString() ?? widget.name;
          _role = p['role']?.toString() ?? (widget.isDirector ? 'Đạo Diễn' : 'Diễn Viên');
          _avatarUrl = p['avatar']?.toString() ?? _avatarUrl;
          _biography = p['biography']?.toString() ?? '';
          _placeOfBirth = p['place_of_birth']?.toString() ?? p['nationality']?.toString() ?? '';
          _movies = parsedMovies;
          _isLoading = false;
        });
        return;
      }
    }

    // 2. Secondary fallback: Search movies directly by name
    final searchResults = await ApiService.searchMovies(widget.name);
    if (mounted) {
      setState(() {
        _movies = searchResults;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(
          _displayName,
          style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
        ),
        centerTitle: true,
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppTheme.primary),
            )
          : CustomScrollView(
              physics: const BouncingScrollPhysics(),
              slivers: [
                // Person Hero Header
                SliverToBoxAdapter(
                  child: Container(
                    margin: const EdgeInsets.all(16),
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          AppTheme.card,
                          AppTheme.cardElevated.withOpacity(0.6),
                        ],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.white12),
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.primary.withOpacity(0.15),
                          blurRadius: 20,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            // High-Res TMDb Avatar Portrait
                            Container(
                              width: 84,
                              height: 84,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: widget.isDirector ? AppTheme.gold : AppTheme.primary,
                                  width: 2.5,
                                ),
                                boxShadow: [
                                  BoxShadow(
                                    color: (widget.isDirector ? AppTheme.gold : AppTheme.primary).withOpacity(0.4),
                                    blurRadius: 14,
                                  ),
                                ],
                              ),
                              child: ClipOval(
                                child: CachedNetworkImage(
                                  imageUrl: _avatarUrl,
                                  fit: BoxFit.cover,
                                  placeholder: (_, __) => Container(color: const Color(0xFF1F2330)),
                                  errorWidget: (_, __) => const Icon(Icons.person, color: Colors.white54, size: 40),
                                ),
                              ),
                            ),
                            const SizedBox(width: 16),
                            // Details
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                        decoration: BoxDecoration(
                                          color: (widget.isDirector ? AppTheme.gold : AppTheme.primary).withOpacity(0.2),
                                          borderRadius: BorderRadius.circular(6),
                                          border: Border.all(
                                            color: widget.isDirector ? AppTheme.gold : AppTheme.primary,
                                            width: 0.8,
                                          ),
                                        ),
                                        child: Text(
                                          _role.toUpperCase(),
                                          style: TextStyle(
                                            color: widget.isDirector ? AppTheme.gold : AppTheme.primaryLight,
                                            fontSize: 10,
                                            fontWeight: FontWeight.bold,
                                            letterSpacing: 1.1,
                                          ),
                                        ),
                                      ),
                                      if (_placeOfBirth.isNotEmpty) ...[
                                        const SizedBox(width: 6),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                          decoration: BoxDecoration(
                                            color: Colors.white10,
                                            borderRadius: BorderRadius.circular(6),
                                          ),
                                          child: Text(
                                            _placeOfBirth,
                                            style: const TextStyle(color: Colors.white70, fontSize: 10),
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    _displayName,
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 20,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '${_movies.length} tác phẩm đã tham gia',
                                    style: const TextStyle(
                                      color: AppTheme.textSecondary,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),

                        // TMDb Biography
                        if (_biography.isNotEmpty) ...[
                          const SizedBox(height: 16),
                          const Divider(color: Colors.white10),
                          const SizedBox(height: 8),
                          Text(
                            _biography,
                            maxLines: _isBioExpanded ? null : 3,
                            overflow: _isBioExpanded ? TextOverflow.visible : TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: AppTheme.textSecondary,
                              fontSize: 12.5,
                              height: 1.45,
                            ),
                          ),
                          GestureDetector(
                            onTap: () => setState(() => _isBioExpanded = !_isBioExpanded),
                            child: Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Text(
                                _isBioExpanded ? 'Thu gọn ▲' : 'Xem tiểu sử đầy đủ ▼',
                                style: const TextStyle(
                                  color: AppTheme.primaryLight,
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),

                // Section Title
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Row(
                      children: [
                        const Icon(Icons.video_library_rounded, color: AppTheme.primary, size: 20),
                        const SizedBox(width: 8),
                        const Text(
                          'Danh Sách Phim',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const Spacer(),
                        Text(
                          '${_movies.length} phim',
                          style: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ),

                // Movies Grid
                if (_movies.isEmpty)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                      child: Text(
                        'Chưa có dữ liệu phim cho nghệ sĩ này',
                        style: TextStyle(color: AppTheme.textSecondary, fontSize: 14),
                      ),
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.all(16),
                    sliver: SliverGrid(
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        childAspectRatio: 0.58,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 16,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, index) => MovieCard(movie: _movies[index]),
                        childCount: _movies.length,
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}

