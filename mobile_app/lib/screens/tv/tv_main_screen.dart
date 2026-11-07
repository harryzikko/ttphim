import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../models/movie.dart';
import '../../services/api_service.dart';
import '../../services/storage_service.dart';
import '../../services/session_service.dart';
import '../../theme/app_theme.dart';
import 'tv_card.dart';
import 'tv_detail_screen.dart';
import 'tv_home_screen.dart';
import 'tv_qr_login_screen.dart';
import '../../models/app_update_info.dart';
import '../../services/update_service.dart';
import '../../widgets/update_dialog.dart';

class TvMainScreen extends StatefulWidget {
  const TvMainScreen({super.key});

  @override
  State<TvMainScreen> createState() => _TvMainScreenState();
}

class _TvMainScreenState extends State<TvMainScreen> {
  int _selectedNavIndex = 0;
  bool _isSidebarExpanded = false;
  Map<String, dynamic>? _user;

  final GlobalKey _tvHomeKey = GlobalKey();
  final GlobalKey _tvExploreKey = GlobalKey();
  final GlobalKey _tvSearchKey = GlobalKey();
  final List<FocusNode> _navFocusNodes = List.generate(4, (_) => FocusNode());
  final FocusNode _contentFocusNode = FocusNode(skipTraversal: true, canRequestFocus: false);

  @override
  void initState() {
    super.initState();
    SessionService.changes.addListener(_loadUser);
    _loadUser();
    _checkTvUpdateSilently();
  }

  @override
  void dispose() {
    SessionService.changes.removeListener(_loadUser);
    for (var f in _navFocusNodes) {
      f.dispose();
    }
    _contentFocusNode.dispose();
    super.dispose();
  }

  Future<void> _loadUser() async {
    try {
      final u = await StorageService.getUser();
      if (mounted) setState(() => _user = u);
    } catch (_) {}
  }

  void _checkTvUpdateSilently() {
    UpdateService.checkUpdate().then((update) {
      if (mounted && update != null) {
        UpdateDialog.show(context, update, isTv: true);
      }
    });
  }

  List<Map<String, dynamic>> _getNavItems() {
    final isLoggedIn = _user != null;
    return [
      {'title': 'Trang Chủ', 'icon': Icons.home_rounded},
      {'title': 'Khám Phá', 'icon': Icons.grid_view_rounded},
      {'title': 'Tìm Kiếm', 'icon': Icons.search_rounded},
      {
        'title': isLoggedIn ? 'Tài Khoản' : 'Đăng Nhập',
        'icon': isLoggedIn ? Icons.person_rounded : Icons.login_rounded,
      },
    ];
  }

  void _onMovieSelected(Movie movie) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => TvDetailScreen(movie: movie),
      ),
    );
  }

  void _focusSidebar() {
    setState(() => _isSidebarExpanded = true);
    _navFocusNodes[_selectedNavIndex.clamp(0, 3)].requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final navItems = _getNavItems();

    return Scaffold(
      backgroundColor: const Color(0xFF0C0E17),
      body: Row(
        children: [
          // 1. LEANBACK D-PAD SIDEBAR (Netflix-style Smooth Focus)
          AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
            width: _isSidebarExpanded ? 240 : 80,
            decoration: BoxDecoration(
              color: const Color(0xFF11131C).withOpacity(0.96),
              border: Border(
                right: BorderSide(color: Colors.white.withOpacity(0.06)),
              ),
            ),
            child: Column(
              children: [
                const SizedBox(height: 28),
                // App Brand Logo (Website Favicon Style: Red Rounded Box with White 'C' & CineViet Text)
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AppTheme.primary,
                        borderRadius: BorderRadius.circular(12),
                        boxShadow: [
                          BoxShadow(color: AppTheme.primary.withOpacity(0.55), blurRadius: 14, offset: const Offset(0, 3)),
                        ],
                      ),
                      child: const Center(
                        child: Text(
                          'C',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 27,
                            fontWeight: FontWeight.w900,
                            fontFamily: 'sans-serif',
                            height: 1.0,
                          ),
                        ),
                      ),
                    ),
                    if (_isSidebarExpanded) ...[
                      const SizedBox(width: 12),
                      const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(text: 'CINE', style: TextStyle(color: AppTheme.primary, fontWeight: FontWeight.w900, fontSize: 17, letterSpacing: 1.2)),
                                TextSpan(text: 'VIET', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 17, letterSpacing: 1.2)),
                              ],
                            ),
                          ),
                          Text(
                            'RẠP PHIM TẠI GIA',
                            style: TextStyle(color: AppTheme.cyan, fontWeight: FontWeight.bold, fontSize: 8.5, letterSpacing: 1.5),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),

                const SizedBox(height: 36),

                // Navigation Tabs
                Expanded(
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    itemCount: navItems.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final item = navItems[index];
                      final isSelected = index == _selectedNavIndex;
                      final focusNode = _navFocusNodes[index];

                      return Focus(
                        focusNode: focusNode,
                        onFocusChange: (focused) {
                          if (focused) {
                            if (!_isSidebarExpanded) {
                              setState(() => _isSidebarExpanded = true);
                            }
                          } else {
                            // Check safely after frame whether focus actually moved out of sidebar
                            WidgetsBinding.instance.addPostFrameCallback((_) {
                              if (mounted && !_navFocusNodes.any((n) => n.hasFocus)) {
                                setState(() => _isSidebarExpanded = false);
                              }
                            });
                          }
                        },
                        onKeyEvent: (node, event) {
                          if (event is KeyDownEvent) {
                            final key = event.logicalKey;
                            void activateTabAndFocusContent() {
                              setState(() {
                                _selectedNavIndex = index;
                                _isSidebarExpanded = false;
                              });
                              WidgetsBinding.instance.addPostFrameCallback((_) {
                                if (index == 0) {
                                  try {
                                    (_tvHomeKey.currentState as dynamic)?.focusHero();
                                  } catch (_) {}
                                } else if (index == 1) {
                                  try {
                                    (_tvExploreKey.currentState as dynamic)?.focusFirstItem();
                                  } catch (_) {}
                                } else if (index == 2) {
                                  try {
                                    (_tvSearchKey.currentState as dynamic)?.focusSearchField();
                                  } catch (_) {}
                                }
                              });
                            }

                            // Enter / Select: Switch to this tab
                            if ([LogicalKeyboardKey.select, LogicalKeyboardKey.enter, LogicalKeyboardKey.space].contains(key)) {
                              activateTabAndFocusContent();
                              return KeyEventResult.handled;
                            }
                            // Right arrow: Move smoothly to content canvas and collapse sidebar
                            if (key == LogicalKeyboardKey.arrowRight) {
                              activateTabAndFocusContent();
                              return KeyEventResult.handled;
                            }
                          }
                          return KeyEventResult.ignored;
                        },
                        child: Builder(
                          builder: (ctx) {
                            final isFocused = Focus.of(ctx).hasFocus;
                            return GestureDetector(
                              onTap: () {
                                setState(() {
                                  _selectedNavIndex = index;
                                  _isSidebarExpanded = false;
                                });
                                if (index == 0) {
                                  try {
                                    (_tvHomeKey.currentState as dynamic)?.focusHero();
                                  } catch (_) {}
                                }
                              },
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 150),
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                decoration: BoxDecoration(
                                  color: isSelected
                                      ? AppTheme.primary
                                      : (isFocused ? Colors.white24 : Colors.transparent),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(
                                    color: isFocused ? Colors.white : Colors.transparent,
                                    width: isFocused ? 2.5 : 1.5,
                                  ),
                                  boxShadow: isFocused
                                      ? [
                                          BoxShadow(
                                            color: isSelected ? AppTheme.primary.withOpacity(0.8) : Colors.white.withOpacity(0.4),
                                            blurRadius: 12,
                                            spreadRadius: 1,
                                          ),
                                        ]
                                      : (isSelected
                                          ? [
                                              BoxShadow(color: AppTheme.primary.withOpacity(0.4), blurRadius: 10),
                                            ]
                                          : null),
                                ),
                                child: Row(
                                  mainAxisAlignment: _isSidebarExpanded ? MainAxisAlignment.start : MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      item['icon'] as IconData,
                                      color: isSelected ? Colors.white : (isFocused ? Colors.white : Colors.white60),
                                      size: 22,
                                    ),
                                    if (_isSidebarExpanded) ...[
                                      const SizedBox(width: 14),
                                      Text(
                                        item['title'] as String,
                                        style: TextStyle(
                                          color: isSelected ? Colors.white : (isFocused ? Colors.white : Colors.white70),
                                          fontWeight: isSelected ? FontWeight.w900 : FontWeight.w600,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                      );
                    },
                  ),
                ),

                // TV Clock / Status
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.wifi_rounded, color: AppTheme.cyan, size: 16),
                      if (_isSidebarExpanded) ...[
                        const SizedBox(width: 8),
                        Text(
                          TimeOfDay.now().format(context),
                          style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),

          // 2. MAIN 10-FOOT VIEW CANVAS
          Expanded(
            child: Focus(
              focusNode: _contentFocusNode,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(36, 28, 36, 16),
                child: _buildCurrentView(),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCurrentView() {
    switch (_selectedNavIndex) {
      case 0:
        return TvHomeScreen(
          key: _tvHomeKey,
          onMovieSelect: _onMovieSelected,
          onRequestSidebar: _focusSidebar,
        );
      case 1:
        return _TvExploreView(
          key: _tvExploreKey,
          onMovieSelect: _onMovieSelected,
          onFocusSidebar: _focusSidebar,
        );
      case 2:
        return _TvSearchView(
          key: _tvSearchKey,
          onMovieSelect: _onMovieSelected,
          onFocusSidebar: _focusSidebar,
        );
      case 3:
        // Unified Auth: If logged in, show Account screen; If guest, show QR Login!
        if (_user != null) {
          return _buildTvAccountView();
        } else {
          return TvQrLoginScreen(
            onLoginSuccess: () async {
              await _loadUser();
              setState(() => _selectedNavIndex = 3);
            },
            onSkip: () {
              setState(() => _selectedNavIndex = 0);
              _focusSidebar();
            },
          );
        }
      default:
        return TvHomeScreen(
          key: _tvHomeKey,
          onMovieSelect: _onMovieSelected,
          onRequestSidebar: _focusSidebar,
        );
    }
  }

  Widget _buildTvAccountView() {
    final name = _user?['name']?.toString() ?? _user?['username']?.toString() ?? _user?['email']?.toString() ?? 'Thành viên CineViet';
    final email = _user?['email']?.toString() ?? '';

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 580),
        child: Container(
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            color: const Color(0xFF141722),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white.withOpacity(0.08)),
            boxShadow: [
              BoxShadow(color: Colors.black.withOpacity(0.4), blurRadius: 16),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  gradient: AppTheme.primaryGradient,
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: Text(
                    name.isNotEmpty ? name[0].toUpperCase() : 'C',
                    style: const TextStyle(color: Colors.white, fontSize: 32, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    name,
                    style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFB800).withOpacity(0.2),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: const Color(0xFFFFB800).withOpacity(0.5)),
                    ),
                    child: const Text('VIP', style: TextStyle(color: Color(0xFFFFB800), fontSize: 11, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              if (email.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(email, style: const TextStyle(color: Colors.white60, fontSize: 14)),
              ],
              const SizedBox(height: 28),
              const Divider(color: Colors.white12),
              const SizedBox(height: 24),
              Focus(
                autofocus: true,
                child: Builder(
                  builder: (ctx) {
                    final isFocused = Focus.of(ctx).hasFocus;
                    return ElevatedButton.icon(
                      onPressed: () async {
                        await ApiService.logout();
                        await _loadUser();
                        setState(() {});
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: isFocused ? Colors.redAccent : const Color(0xFF232838),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        elevation: isFocused ? 8 : 2,
                      ),
                      icon: const Icon(Icons.logout_rounded, size: 20),
                      label: const Text('Đăng Xuất Tài Khoản', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// REDESIGNED LEANBACK EXPLORE VIEW WITH CATEGORY CHIPS & 6-COLUMN GRID
class _TvExploreView extends StatefulWidget {
  final Function(Movie) onMovieSelect;
  final VoidCallback onFocusSidebar;

  const _TvExploreView({
    super.key,
    required this.onMovieSelect,
    required this.onFocusSidebar,
  });

  @override
  State<_TvExploreView> createState() => _TvExploreViewState();
}

class _TvExploreViewState extends State<_TvExploreView> {
  final List<FocusNode> _chipFocusNodes = List.generate(7, (_) => FocusNode());
  final FocusNode _firstCardFocus = FocusNode();
  final ScrollController _scrollController = ScrollController();

  int _selectedCategoryIndex = 0;
  bool _isLoading = false;
  List<Movie> _movies = [];

  static const List<Map<String, String>> _categories = [
    {'title': 'Tất Cả', 'key': 'all'},
    {'title': 'Phim Bộ', 'key': 'series'},
    {'title': 'Phim Lẻ', 'key': 'single'},
    {'title': 'Chiếu Rạp', 'key': 'cinema'},
    {'title': 'Hoạt Hình', 'key': 'anime'},
    {'title': 'Song Ngữ', 'key': 'song_ngu'},
    {'title': 'TV Shows', 'key': 'tvshows'},
  ];

  @override
  void initState() {
    super.initState();
    _loadCategory(0);
  }

  @override
  void dispose() {
    for (var f in _chipFocusNodes) {
      f.dispose();
    }
    _firstCardFocus.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void focusFirstItem() {
    if (_chipFocusNodes.isNotEmpty) {
      _chipFocusNodes[_selectedCategoryIndex.clamp(0, _chipFocusNodes.length - 1)].requestFocus();
    }
  }

  Future<void> _loadCategory(int index) async {
    setState(() {
      _selectedCategoryIndex = index;
      _isLoading = true;
    });

    List<Movie> results = [];
    try {
      switch (_categories[index]['key']) {
        case 'series':
          results = await ApiService.getSeriesMovies();
          break;
        case 'single':
          results = await ApiService.getSingleMovies();
          break;
        case 'cinema':
          results = await ApiService.getCinemaMovies();
          break;
        case 'anime':
          results = await ApiService.getAnimeMovies();
          break;
        case 'song_ngu':
          results = await ApiService.getSongNguMovies();
          break;
        case 'tvshows':
          results = await ApiService.getTvShows();
          break;
        default:
          results = await ApiService.getFeaturedMovies();
          if (results.isEmpty) {
            results = await ApiService.getSingleMovies();
          }
      }
    } catch (_) {}

    if (mounted) {
      setState(() {
        _movies = results;
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Explore Header & Category Filter Chips
        Row(
          children: [
            Container(
              width: 4,
              height: 22,
              decoration: BoxDecoration(
                color: AppTheme.primary,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 10),
            const Text(
              'KHÁM PHÁ DANH MỤC PHIM',
              style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 0.5),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Horizontal Category Filter Chips
        SizedBox(
          height: 44,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _categories.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (context, cIdx) {
              final cat = _categories[cIdx];
              final isSelected = cIdx == _selectedCategoryIndex;
              final node = _chipFocusNodes[cIdx];

              return Focus(
                focusNode: node,
                onKeyEvent: (fNode, event) {
                  if (event is KeyDownEvent) {
                    final key = event.logicalKey;
                    if ([LogicalKeyboardKey.select, LogicalKeyboardKey.enter, LogicalKeyboardKey.space].contains(key)) {
                      _loadCategory(cIdx);
                      return KeyEventResult.handled;
                    }
                    if (key == LogicalKeyboardKey.arrowDown) {
                      _firstCardFocus.requestFocus();
                      return KeyEventResult.handled;
                    }
                    if (key == LogicalKeyboardKey.arrowLeft && cIdx == 0) {
                      widget.onFocusSidebar();
                      return KeyEventResult.handled;
                    }
                  }
                  return KeyEventResult.ignored;
                },
                child: Builder(
                  builder: (ctx) {
                    final isFocused = Focus.of(ctx).hasFocus;
                    return GestureDetector(
                      onTap: () => _loadCategory(cIdx),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                        decoration: BoxDecoration(
                          color: isSelected
                              ? AppTheme.primary
                              : (isFocused ? Colors.white24 : const Color(0xFF1E2230)),
                          borderRadius: BorderRadius.circular(22),
                          border: Border.all(
                            color: isFocused ? Colors.white : (isSelected ? AppTheme.primary : Colors.white12),
                            width: isFocused ? 2.5 : 1.0,
                          ),
                          boxShadow: isFocused
                              ? [
                                  BoxShadow(
                                    color: AppTheme.primary.withOpacity(0.6),
                                    blurRadius: 12,
                                    spreadRadius: 1,
                                  ),
                                ]
                              : null,
                        ),
                        child: Center(
                          child: Text(
                            cat['title']!,
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: isSelected || isFocused ? FontWeight.w900 : FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              );
            },
          ),
        ),

        const SizedBox(height: 20),

        // Movies Grid Canvas
        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator(color: AppTheme.primary))
              : _movies.isEmpty
                  ? const Center(
                      child: Text(
                        'Không có phim trong danh mục này',
                        style: TextStyle(color: Colors.white60, fontSize: 14),
                      ),
                    )
                  : GridView.builder(
                      controller: _scrollController,
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 6,
                        childAspectRatio: 0.65,
                        crossAxisSpacing: 16,
                        mainAxisSpacing: 16,
                      ),
                      itemCount: _movies.length,
                      itemBuilder: (context, idx) {
                        final movie = _movies[idx];
                        final isFirstCard = idx == 0;
                        final isTopRow = idx < 6;
                        final isLeftEdge = idx % 6 == 0;

                        return TvMovieCard(
                          movie: movie,
                          focusNode: isFirstCard ? _firstCardFocus : null,
                          onSelect: () => widget.onMovieSelect(movie),
                          onUpPressed: isTopRow ? () => _chipFocusNodes[_selectedCategoryIndex].requestFocus() : null,
                          onLeftPressed: isLeftEdge ? widget.onFocusSidebar : null,
                        );
                      },
                    ),
        ),
      ],
    );
  }
}

/// REDESIGNED LEANBACK SEARCH VIEW WITH INSTANT FOCUS, TRENDING TAGS & INLINE RESULTS
class _TvSearchView extends StatefulWidget {
  final Function(Movie) onMovieSelect;
  final VoidCallback onFocusSidebar;

  const _TvSearchView({
    super.key,
    required this.onMovieSelect,
    required this.onFocusSidebar,
  });

  @override
  State<_TvSearchView> createState() => _TvSearchViewState();
}

class _TvSearchViewState extends State<_TvSearchView> {
  final TextEditingController _searchCtrl = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  final FocusNode _firstResultFocus = FocusNode();
  final List<FocusNode> _tagFocusNodes = List.generate(6, (_) => FocusNode());

  bool _isSearching = false;
  List<Movie> _results = [];
  bool _hasSearched = false;

  static const List<String> _trendingTags = [
    'Truy Sát',
    'Thần Y Cổ Đại',
    'Gấu Trúc Lý',
    'Siêu Nhân Tiga',
    'One Piece',
    'Doraemon',
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _searchFocusNode.requestFocus();
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _searchFocusNode.dispose();
    _firstResultFocus.dispose();
    for (var f in _tagFocusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  void focusSearchField() {
    _searchFocusNode.requestFocus();
  }

  Future<void> _performSearch(String query) async {
    final q = query.trim();
    if (q.isEmpty) return;
    _searchCtrl.text = q;
    setState(() {
      _isSearching = true;
      _hasSearched = true;
    });

    final movies = await ApiService.searchMovies(q);
    if (mounted) {
      setState(() {
        _results = movies;
        _isSearching = false;
      });
      if (movies.isNotEmpty) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _firstResultFocus.requestFocus();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Search Header
        Row(
          children: [
            Container(
              width: 4,
              height: 22,
              decoration: BoxDecoration(
                color: AppTheme.primary,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 10),
            const Text(
              'TÌM KIẾM PHIM TRÊN ANDROID TV',
              style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 0.5),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Focusable Search Box with D-pad
        Focus(
          focusNode: _searchFocusNode,
          onKeyEvent: (node, event) {
            if (event is KeyDownEvent) {
              if (event.logicalKey == LogicalKeyboardKey.arrowLeft) {
                if (_searchCtrl.selection.baseOffset <= 0) {
                  widget.onFocusSidebar();
                  return KeyEventResult.handled;
                }
              }
              if (event.logicalKey == LogicalKeyboardKey.arrowDown) {
                if (_tagFocusNodes.isNotEmpty) {
                  _tagFocusNodes[0].requestFocus();
                  return KeyEventResult.handled;
                }
              }
            }
            return KeyEventResult.ignored;
          },
          child: Builder(
            builder: (ctx) {
              final isFocused = Focus.of(ctx).hasFocus;
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFF191B24),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: isFocused ? AppTheme.primary : Colors.white24,
                    width: isFocused ? 2.5 : 1.0,
                  ),
                  boxShadow: isFocused
                      ? [
                          BoxShadow(
                            color: AppTheme.primary.withOpacity(0.55),
                            blurRadius: 14,
                            spreadRadius: 1,
                          ),
                        ]
                      : null,
                ),
                child: TextField(
                  controller: _searchCtrl,
                  style: const TextStyle(color: Colors.white, fontSize: 16),
                  decoration: const InputDecoration(
                    hintText: 'Nhập tên phim, diễn viên hoặc đạo diễn...',
                    hintStyle: TextStyle(color: Colors.white38),
                    border: InputBorder.none,
                    icon: Icon(Icons.search, color: AppTheme.primary),
                  ),
                  onSubmitted: _performSearch,
                ),
              );
            },
          ),
        ),

        const SizedBox(height: 14),

        // Quick Trending Search Suggestions
        SizedBox(
          height: 38,
          child: Row(
            children: [
              const Text(
                'Gợi ý: ',
                style: TextStyle(color: Colors.white54, fontSize: 12, fontWeight: FontWeight.bold),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _trendingTags.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, tIdx) {
                    final tag = _trendingTags[tIdx];
                    final node = _tagFocusNodes[tIdx];

                    return Focus(
                      focusNode: node,
                      onKeyEvent: (fNode, event) {
                        if (event is KeyDownEvent) {
                          final key = event.logicalKey;
                          if ([LogicalKeyboardKey.select, LogicalKeyboardKey.enter, LogicalKeyboardKey.space].contains(key)) {
                            _performSearch(tag);
                            return KeyEventResult.handled;
                          }
                          if (key == LogicalKeyboardKey.arrowUp) {
                            _searchFocusNode.requestFocus();
                            return KeyEventResult.handled;
                          }
                          if (key == LogicalKeyboardKey.arrowDown && _results.isNotEmpty) {
                            _firstResultFocus.requestFocus();
                            return KeyEventResult.handled;
                          }
                          if (key == LogicalKeyboardKey.arrowLeft && tIdx == 0) {
                            widget.onFocusSidebar();
                            return KeyEventResult.handled;
                          }
                        }
                        return KeyEventResult.ignored;
                      },
                      child: Builder(
                        builder: (ctx) {
                          final isFocused = Focus.of(ctx).hasFocus;
                          return GestureDetector(
                            onTap: () => _performSearch(tag),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 150),
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                              decoration: BoxDecoration(
                                color: isFocused ? AppTheme.primary : const Color(0xFF1E2230),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(
                                  color: isFocused ? Colors.white : Colors.white12,
                                  width: isFocused ? 2.0 : 1.0,
                                ),
                              ),
                              child: Text(
                                tag,
                                style: TextStyle(
                                  color: isFocused ? Colors.white : Colors.white70,
                                  fontSize: 12,
                                  fontWeight: isFocused ? FontWeight.bold : FontWeight.w500,
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 18),

        // Inline Search Results Canvas
        Expanded(
          child: _isSearching
              ? const Center(child: CircularProgressIndicator(color: AppTheme.primary))
              : !_hasSearched
                  ? const Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.search_rounded, size: 56, color: Colors.white24),
                          SizedBox(height: 12),
                          Text(
                            'Nhập từ khóa tìm kiếm hoặc chọn gợi ý ở trên',
                            style: TextStyle(color: Colors.white54, fontSize: 14),
                          ),
                        ],
                      ),
                    )
                  : _results.isEmpty
                      ? Center(
                          child: Text(
                            'Không tìm thấy phim phù hợp với "${_searchCtrl.text}"',
                            style: const TextStyle(color: Colors.white70, fontSize: 14),
                          ),
                        )
                      : GridView.builder(
                          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 6,
                            childAspectRatio: 0.65,
                            crossAxisSpacing: 16,
                            mainAxisSpacing: 16,
                          ),
                          itemCount: _results.length,
                          itemBuilder: (context, idx) {
                            final movie = _results[idx];
                            final isFirstCard = idx == 0;
                            final isTopRow = idx < 6;
                            final isLeftEdge = idx % 6 == 0;

                            return TvMovieCard(
                              movie: movie,
                              focusNode: isFirstCard ? _firstResultFocus : null,
                              onSelect: () => widget.onMovieSelect(movie),
                              onUpPressed: isTopRow ? () => _searchFocusNode.requestFocus() : null,
                              onLeftPressed: isLeftEdge ? widget.onFocusSidebar : null,
                            );
                          },
                        ),
        ),
      ],
    );
  }
}
