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
        'title': isLoggedIn ? 'Tài Khoản' : 'Đăng Nhập QR',
        'icon': isLoggedIn ? Icons.person_rounded : Icons.qr_code_scanner_rounded,
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
                // App Brand Logo
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
                          BoxShadow(color: AppTheme.primary.withOpacity(0.5), blurRadius: 16),
                        ],
                      ),
                      child: const Icon(Icons.movie_rounded, color: Colors.white, size: 24),
                    ),
                    if (_isSidebarExpanded) ...[
                      const SizedBox(width: 12),
                      const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'CINEVIET',
                            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: 1),
                          ),
                          Text(
                            'TV EDITION',
                            style: TextStyle(color: AppTheme.cyan, fontWeight: FontWeight.bold, fontSize: 9, letterSpacing: 1.5),
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
                                } else {
                                  node.focusScope?.nextFocus();
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
        return _buildTvExploreView();
      case 2:
        return _buildTvSearchView();
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

  Widget _buildTvExploreView() {
    return FutureBuilder<List<Movie>>(
      future: ApiService.getSingleMovies(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator(color: AppTheme.primary));
        }
        final movies = snapshot.data!;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'KHÁM PHÁ DANH MỤC PHIM',
              style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 0.5),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: GridView.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 6,
                  childAspectRatio: 0.65,
                  crossAxisSpacing: 16,
                  mainAxisSpacing: 16,
                ),
                itemCount: movies.length,
                itemBuilder: (context, idx) {
                  return TvMovieCard(
                    movie: movies[idx],
                    onSelect: () => _onMovieSelected(movies[idx]),
                    onLeftPressed: (idx % 6 == 0) ? _focusSidebar : null,
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildTvSearchView() {
    final searchCtrl = TextEditingController();
    return StatefulBuilder(
      builder: (context, setInnerState) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'TÌM KIẾM PHIM TRÊN ANDROID TV',
              style: TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 0.5),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: const Color(0xFF191B24),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white12),
              ),
              child: TextField(
                controller: searchCtrl,
                style: const TextStyle(color: Colors.white, fontSize: 16),
                decoration: const InputDecoration(
                  hintText: 'Nhập tên phim, diễn viên hoặc đạo diễn...',
                  hintStyle: TextStyle(color: Colors.white38),
                  border: InputBorder.none,
                  icon: Icon(Icons.search, color: AppTheme.primary),
                ),
                onSubmitted: (query) async {
                  if (query.trim().isEmpty) return;
                  final results = await ApiService.searchMovies(query);
                  if (context.mounted) {
                    showDialog(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        backgroundColor: const Color(0xFF141722),
                        title: Text('Kết quả tìm kiếm cho: $query', style: const TextStyle(color: Colors.white)),
                        content: SizedBox(
                          width: 800,
                          height: 400,
                          child: results.isEmpty
                              ? const Center(child: Text('Không tìm thấy phim phù hợp', style: TextStyle(color: Colors.white70)))
                              : GridView.builder(
                                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                                    crossAxisCount: 4,
                                    childAspectRatio: 0.65,
                                    crossAxisSpacing: 12,
                                    mainAxisSpacing: 12,
                                  ),
                                  itemCount: results.length,
                                  itemBuilder: (_, i) => TvMovieCard(
                                    movie: results[i],
                                    onSelect: () {
                                      Navigator.pop(ctx);
                                      _onMovieSelected(results[i]);
                                    },
                                  ),
                                ),
                        ),
                      ),
                    );
                  }
                },
              ),
            ),
          ],
        );
      },
    );
  }
}
