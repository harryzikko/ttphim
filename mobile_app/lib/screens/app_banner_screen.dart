import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/app_banner_config.dart';
import '../services/api_service.dart';
import '../services/app_config.dart';
import 'main_navigation_screen.dart';

class AppBannerScreen extends StatefulWidget {
  const AppBannerScreen({super.key});

  @override
  State<AppBannerScreen> createState() => _AppBannerScreenState();
}

class _AppBannerScreenState extends State<AppBannerScreen> {
  bool _isLoading = true;
  AppBannerConfig? _config;
  int _countdown = 5;
  Timer? _timer;
  bool _canDismiss = false;
  bool _navigated = false;

  @override
  void initState() {
    super.initState();
    _initBanner();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _initBanner() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final lastShownMs = prefs.getInt('app_banner_last_shown_ms') ?? 0;

      final config = await ApiService.getAppBanner().timeout(
        const Duration(milliseconds: 1800),
        onTimeout: () => AppBannerConfig.defaults(),
      );

      if (!mounted) return;

      if (!config.enabled) {
        _proceedToMain();
        return;
      }

      if (config.cooldownHours > 0) {
        final nowMs = DateTime.now().millisecondsSinceEpoch;
        final cooldownMs = config.cooldownHours * 3600 * 1000;
        if (nowMs - lastShownMs < cooldownMs) {
          _proceedToMain();
          return;
        }
      }

      await prefs.setInt('app_banner_last_shown_ms', DateTime.now().millisecondsSinceEpoch);

      if (!mounted) return;

      setState(() {
        _config = config;
        _countdown = config.countdownSeconds;
        _isLoading = false;
      });

      _startCountdown();
    } catch (_) {
      if (mounted) _proceedToMain();
    }
  }

  void _startCountdown() {
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      if (_countdown > 1) {
        setState(() {
          _countdown--;
        });
      } else {
        timer.cancel();
        setState(() {
          _countdown = 0;
          _canDismiss = true;
        });
      }
    });
  }

  void _proceedToMain() {
    if (_navigated || !mounted) return;
    _navigated = true;
    _timer?.cancel();

    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        pageBuilder: (context, animation, secondaryAnimation) => const MainNavigationScreen(),
        transitionsBuilder: (context, animation, secondaryAnimation, child) {
          return FadeTransition(opacity: animation, child: child);
        },
        transitionDuration: const Duration(milliseconds: 320),
      ),
    );
  }

  Future<void> _openLink() async {
    final href = _config?.href;
    if (href == null || href.isEmpty) return;
    final uri = Uri.tryParse(href);
    if (uri != null && await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  String _resolveUrl(String path) {
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    final base = AppConfig.backendUrl.replaceAll(RegExp(r'/+$'), '');
    final sub = path.startsWith('/') ? path : '/$path';
    return '$base$sub';
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: Color(0xFF060912),
        body: Center(
          child: CircularProgressIndicator(
            valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFFF5722)),
            strokeWidth: 2.5,
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFF04070E),
      body: OrientationBuilder(
        builder: (context, orientation) {
          final media = MediaQuery.of(context);
          // Check landscape first: screen is wider than high or orientation is landscape
          final isLandscape = orientation == Orientation.landscape || media.size.width > media.size.height;
          // In portrait, tablet is screen with width or shortestSide >= 500dp
          final isTabletPortrait = !isLandscape && (media.size.width >= 500 || media.size.shortestSide >= 500);

          String imageUrl;
          String assetFallback;
          double targetAspectRatio;

          if (isLandscape) {
            // Any device in landscape (iPad, Android Tablet, Phone horizontal) -> 9:5 landscape banner
            imageUrl = _resolveUrl(_config!.imageIpadLandscape);
            assetFallback = 'assets/banners/banner_ipad_portrait.png';
            targetAspectRatio = 9 / 5;
          } else if (isTabletPortrait) {
            // iPad / Tablet in portrait -> 3:4 vertical banner
            imageUrl = _resolveUrl(_config!.imageIpadVertical);
            assetFallback = 'assets/banners/banner_ipad_vertical.png';
            targetAspectRatio = 3 / 4;
          } else {
            // Mobile Phone in portrait -> 9:16 vertical banner
            imageUrl = _resolveUrl(_config!.imageMobileVertical);
            assetFallback = 'assets/banners/banner_mobile_vertical.png';
            targetAspectRatio = 9 / 16;
          }

          final isLarge = isLandscape || isTabletPortrait;

          return Stack(
            children: [
              // Ambient Radial Gradient
              Positioned.fill(
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: RadialGradient(
                      center: Alignment(0, -0.4),
                      radius: 1.1,
                      colors: [
                        Color(0xFF14223A),
                        Color(0xFF080D18),
                        Color(0xFF030509),
                      ],
                    ),
                  ),
                ),
              ),

              // Central Banner with responsive constraints
              Center(
                child: SafeArea(
                  child: Padding(
                    padding: EdgeInsets.symmetric(
                      horizontal: isLandscape ? 24.0 : (isTabletPortrait ? 32.0 : 16.0),
                      vertical: isLandscape ? 12.0 : 16.0,
                    ),
                    child: GestureDetector(
                      onTap: _openLink,
                      child: AspectRatio(
                        aspectRatio: targetAspectRatio,
                        child: Container(
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(isLarge ? 28 : 20),
                            border: Border.all(
                              color: const Color(0x66FF6B00),
                              width: 1.5,
                            ),
                            boxShadow: const [
                              BoxShadow(
                                color: Color(0x40FF5722),
                                blurRadius: 36,
                                spreadRadius: 2,
                                offset: Offset(0, 10),
                              ),
                              BoxShadow(
                                color: Colors.black87,
                                blurRadius: 40,
                                offset: Offset(0, 16),
                              ),
                            ],
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(isLarge ? 26.5 : 18.5),
                            child: Stack(
                              fit: StackFit.expand,
                              children: [
                                Image.network(
                                  imageUrl,
                                  fit: BoxFit.cover,
                                  errorBuilder: (context, error, stackTrace) {
                                    return Image.asset(
                                      assetFallback,
                                      fit: BoxFit.cover,
                                    );
                                  },
                                  loadingBuilder: (context, child, loadingProgress) {
                                    if (loadingProgress == null) return child;
                                    return Image.asset(
                                      assetFallback,
                                      fit: BoxFit.cover,
                                    );
                                  },
                                ),

                                // Subtle bottom click hint
                                Positioned(
                                  bottom: 0,
                                  left: 0,
                                  right: 0,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(vertical: 8),
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        begin: Alignment.bottomCenter,
                                        end: Alignment.topCenter,
                                        colors: [
                                          Colors.black.withOpacity(0.55),
                                          Colors.transparent,
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),

              // Top Right Skip / Countdown Action Button
              Positioned(
                top: isLandscape ? 12 : 14,
                right: isLandscape ? 16 : 18,
                child: SafeArea(
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 250),
                    transitionBuilder: (child, animation) => FadeTransition(
                      opacity: animation,
                      child: ScaleTransition(scale: animation, child: child),
                    ),
                    child: _canDismiss
                        ? InkWell(
                            key: const ValueKey('dismiss_active'),
                            onTap: _proceedToMain,
                            borderRadius: BorderRadius.circular(22),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 8),
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [Color(0xFFFF5722), Color(0xFFFF9800)],
                                ),
                                borderRadius: BorderRadius.circular(22),
                                boxShadow: const [
                                  BoxShadow(
                                    color: Color(0x66FF5722),
                                    blurRadius: 12,
                                    offset: Offset(0, 3),
                                  ),
                                ],
                              ),
                              child: const Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    'Bỏ qua',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 13,
                                      fontWeight: FontWeight.bold,
                                      letterSpacing: 0.2,
                                    ),
                                  ),
                                  SizedBox(width: 4),
                                  Icon(Icons.close_rounded, color: Colors.white, size: 16),
                                ],
                              ),
                            ),
                          )
                        : Container(
                            key: const ValueKey('dismiss_waiting'),
                            padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
                            decoration: BoxDecoration(
                              color: Colors.black.withOpacity(0.72),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: Colors.white24, width: 1),
                              boxShadow: const [
                                BoxShadow(
                                  color: Colors.black54,
                                  blurRadius: 8,
                                ),
                              ],
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const SizedBox(
                                  width: 12,
                                  height: 12,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation<Color>(Color(0xFFFF9800)),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'Bỏ qua sau ${_countdown}s',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
