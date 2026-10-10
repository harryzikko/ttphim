import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../models/movie.dart';
import '../models/movie_detail.dart';
import '../services/storage_service.dart';
import '../theme/app_theme.dart';

enum VideoFitMode {
  original, // 16:9 or native aspect ratio
  fill,     // Zoom / Crop to fill screen
  stretch,  // Stretch to container
}

class PlayerScreen extends StatefulWidget {
  final Movie movie;
  final List<ServerItem> servers;
  final ServerItem initialServer;
  final EpisodeItem initialEpisode;

  const PlayerScreen({
    super.key,
    required this.movie,
    required this.servers,
    required this.initialServer,
    required this.initialEpisode,
  });

  @override
  State<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends State<PlayerScreen> with TickerProviderStateMixin {
  late ServerItem _currentServer;
  late EpisodeItem _currentEpisode;

  // Video Controller
  VideoPlayerController? _videoPlayerController;
  WebViewController? _webViewController;
  bool _isEmbedMode = false;
  bool _isPlayerInitializing = true;
  String? _errorMessage;

  // Netflix-style Overlay Controls
  bool _showControls = true;
  Timer? _hideControlsTimer;
  bool _isDraggingSlider = false;
  double _dragSliderPosition = 0.0;

  // Fullscreen Landscape
  bool _isFullScreen = false;

  // Gesture HUDs
  double _brightness = 1.0;
  double _volume = 1.0;
  bool _showBrightnessHud = false;
  bool _showVolumeHud = false;
  Timer? _gestureHudTimer;

  // Double-tap Seek Ripples
  bool _showSeekLeftRipple = false;
  bool _showSeekRightRipple = false;
  Timer? _seekLeftTimer;
  Timer? _seekRightTimer;

  // Screen Lock (Unobtrusive)
  bool _isScreenLocked = false;
  bool _showLockPill = false;
  Timer? _lockPillTimer;

  // Playback Speed & Fit
  double _currentSpeed = 1.0;
  VideoFitMode _fitMode = VideoFitMode.original;

  // Auto-Resume & History
  Timer? _historyTimer;
  bool _showResumeBanner = false;
  int _resumedSeconds = 0;
  Timer? _resumeBannerTimer;

  // Auto Next Episode
  bool _isAutoPlayEnabled = true;
  bool _isShowingNextPrompt = false;
  int _nextCountdown = 5;
  Timer? _nextCountdownTimer;
  EpisodeItem? _nextEpisode;

  // Sleep Timer
  Timer? _sleepTimer;
  Timer? _sleepTicker;
  int _sleepRemainingSeconds = 0;
  int? _sleepSelectedMinutes;

  // Favorites & Watched Tracking
  bool _isFavorite = false;
  Set<String> _watchedSlugs = {};

  // Episode Tabs
  int _selectedEpisodeTab = 0;
  static const int _episodesPerPage = 25;

  @override
  void initState() {
    super.initState();
    _currentServer = widget.initialServer;
    _currentEpisode = widget.initialEpisode;

    _loadInitialState();
    _initPlayer();

    // Periodic watch history saving every 10 seconds
    _historyTimer = Timer.periodic(const Duration(seconds: 10), (_) => _saveProgress());
  }

  @override
  void dispose() {
    _hideControlsTimer?.cancel();
    _gestureHudTimer?.cancel();
    _seekLeftTimer?.cancel();
    _seekRightTimer?.cancel();
    _lockPillTimer?.cancel();
    _historyTimer?.cancel();
    _resumeBannerTimer?.cancel();
    _nextCountdownTimer?.cancel();
    _sleepTimer?.cancel();
    _sleepTicker?.cancel();

    // Reset System Orientations & Bars
    SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

    _videoPlayerController?.removeListener(_videoListener);
    _videoPlayerController?.dispose();

    super.dispose();
  }

  Future<void> _loadInitialState() async {
    final fav = await StorageService.isFavorite(widget.movie.slug);
    final watched = await StorageService.getWatchedEpisodes(widget.movie.slug);
    if (mounted) {
      setState(() {
        _isFavorite = fav;
        _watchedSlugs = watched;
        _syncEpisodeTab();
      });
    }
  }

  void _syncEpisodeTab() {
    final epIndex = _currentServer.episodes.indexWhere((e) => e.slug == _currentEpisode.slug);
    if (epIndex >= 0) {
      _selectedEpisodeTab = epIndex ~/ _episodesPerPage;
    }
  }

  void _resetControlsTimer() {
    _hideControlsTimer?.cancel();
    if (_showControls && (_videoPlayerController?.value.isPlaying ?? false)) {
      _hideControlsTimer = Timer(const Duration(milliseconds: 3500), () {
        if (mounted && (_videoPlayerController?.value.isPlaying ?? false)) {
          setState(() => _showControls = false);
        }
      });
    }
  }

  void _toggleControls() {
    if (_isScreenLocked) {
      setState(() => _showLockPill = true);
      _lockPillTimer?.cancel();
      _lockPillTimer = Timer(const Duration(seconds: 2), () {
        if (mounted) setState(() => _showLockPill = false);
      });
      return;
    }

    setState(() {
      _showControls = !_showControls;
    });
    if (_showControls) {
      _resetControlsTimer();
    }
  }

  void _toggleFullScreen() {
    setState(() {
      _isFullScreen = !_isFullScreen;
    });

    if (_isFullScreen) {
      SystemChrome.setPreferredOrientations([
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    } else {
      SystemChrome.setPreferredOrientations([
        DeviceOrientation.portraitUp,
      ]);
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    }
    HapticFeedback.lightImpact();
  }

  /// Helper: Extract direct .m3u8 playlist URL from embed wrapper URL if present
  String? _extractM3u8FromEmbed(String embedUrl) {
    if (embedUrl.isEmpty) return null;
    try {
      final uri = Uri.tryParse(embedUrl);
      if (uri != null) {
        final urlParam = uri.queryParameters['url'] ?? uri.queryParameters['file'];
        if (urlParam != null && urlParam.contains('.m3u8')) {
          return Uri.decodeFull(urlParam);
        }
      }
    } catch (_) {}

    final regex = RegExp(r'(https?://[^\s"&]+\.m3u8[^\s"&]*)', caseSensitive: false);
    final match = regex.firstMatch(embedUrl);
    if (match != null) {
      return match.group(1);
    }
    return null;
  }

  /// Launch In-App Web Embed Player with sandboxed iframe & ad popup suppressors
  void _initWebPlayer(String embedUrl) {
    _videoPlayerController?.removeListener(_videoListener);
    _videoPlayerController?.dispose();
    _videoPlayerController = null;

    setState(() {
      _isEmbedMode = true;
      _isPlayerInitializing = false;
      _errorMessage = null;
    });

    try {
      final embedHtml = '''
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; background:#000; }
    html, body { width:100%; height:100%; overflow:hidden; background:#000; }
    iframe {
      width:100%;
      height:100%;
      border:0;
      position:absolute;
      top:0;
      left:0;
      right:0;
      bottom:0;
    }
  </style>
</head>
<body>
  <iframe src="$embedUrl"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowfullscreen="true"
          webkitallowfullscreen="true"
          mozallowfullscreen="true">
  </iframe>
  <script>
    // Suppress intrusive popups, prompts, and top-level hijack
    window.open = function() { return null; };
    window.alert = function() {};
    window.confirm = function() { return false; };
    window.prompt = function() { return null; };
  </script>
</body>
</html>
''';

      final host = Uri.tryParse(embedUrl)?.host ?? '';
      final controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(Colors.black)
        ..setUserAgent(
          'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        )
        ..setNavigationDelegate(
          NavigationDelegate(
            onNavigationRequest: (request) {
              final reqUrl = request.url;
              if (reqUrl.startsWith('intent:') ||
                  reqUrl.startsWith('market:') ||
                  reqUrl.startsWith('tel:') ||
                  reqUrl.startsWith('mailto:')) {
                return NavigationDecision.prevent;
              }
              if (reqUrl.startsWith('data:') ||
                  reqUrl.startsWith('about:blank') ||
                  (host.isNotEmpty && reqUrl.contains(host)) ||
                  reqUrl.contains('m3u8') ||
                  reqUrl.contains('phimapi') ||
                  reqUrl.contains('kkphim')) {
                return NavigationDecision.navigate;
              }
              return NavigationDecision.prevent;
            },
          ),
        );

      controller.loadHtmlString(embedHtml, baseUrl: embedUrl);
      _webViewController = controller;
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = 'Không thể khởi tạo Web Embed Player: $e';
        });
      }
    }
  }

  /// Initialize video playback with intelligent HLS -> Extracted M3U8 -> In-App Embed fallback
  Future<void> _initPlayer({bool forceEmbed = false}) async {
    setState(() {
      _isPlayerInitializing = true;
      _errorMessage = null;
      _isShowingNextPrompt = false;
    });

    _nextCountdownTimer?.cancel();
    _videoPlayerController?.removeListener(_videoListener);
    await _videoPlayerController?.dispose();
    _videoPlayerController = null;

    // 1. Force Embed
    if (forceEmbed && _currentEpisode.linkEmbed.isNotEmpty) {
      _initWebPlayer(_currentEpisode.linkEmbed);
      return;
    }

    // 2. Resolve stream URL: Direct HLS or automatically extract from embed link
    String streamUrl = _currentEpisode.linkM3u8.trim();
    if (streamUrl.isEmpty && _currentEpisode.linkEmbed.isNotEmpty) {
      final extracted = _extractM3u8FromEmbed(_currentEpisode.linkEmbed);
      if (extracted != null && extracted.isNotEmpty) {
        streamUrl = extracted;
      }
    }

    // 3. Fallback to Web Embed if no direct HLS
    if (streamUrl.isEmpty) {
      if (_currentEpisode.linkEmbed.isNotEmpty) {
        _initWebPlayer(_currentEpisode.linkEmbed);
        return;
      } else {
        setState(() {
          _isPlayerInitializing = false;
          _errorMessage = 'Tập phim này hiện chưa có luồng phát trực tiếp.';
        });
        return;
      }
    }

    // 4. Play with native high-performance video engine
    _isEmbedMode = false;

    try {
      final ctrl = VideoPlayerController.networkUrl(
        Uri.parse(streamUrl),
        httpHeaders: const {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://phimapi.com/',
        },
      );

      await ctrl.initialize();
      await ctrl.setPlaybackSpeed(_currentSpeed);
      await ctrl.setVolume(_volume);

      // Check Watch History to Auto-Resume
      final history = await StorageService.getHistoryForMovie(widget.movie.slug);
      int? seekTargetSeconds;
      if (history != null &&
          history.episodeSlug == _currentEpisode.slug &&
          history.positionSeconds > 15 &&
          history.progressPercentage < 0.95) {
        seekTargetSeconds = history.positionSeconds;
      }

      if (seekTargetSeconds != null) {
        await ctrl.seekTo(Duration(seconds: seekTargetSeconds));
        _resumedSeconds = seekTargetSeconds;
        _showResumeBanner = true;
        _resumeBannerTimer?.cancel();
        _resumeBannerTimer = Timer(const Duration(seconds: 4), () {
          if (mounted) setState(() => _showResumeBanner = false);
        });
      }

      await ctrl.play();
      ctrl.addListener(_videoListener);

      if (mounted) {
        setState(() {
          _videoPlayerController = ctrl;
          _isPlayerInitializing = false;
        });
        _resetControlsTimer();
      }
    } catch (e) {
      debugPrint('Video init failed: $e');
      if (_currentEpisode.linkEmbed.isNotEmpty) {
        _initWebPlayer(_currentEpisode.linkEmbed);
      } else {
        if (mounted) {
          setState(() {
            _isPlayerInitializing = false;
            _errorMessage = 'Không thể tải luồng video HLS: $e';
          });
        }
      }
    }
  }

  void _videoListener() {
    if (!mounted || _videoPlayerController == null) return;
    final val = _videoPlayerController!.value;

    if (val.isInitialized && val.duration > Duration.zero) {
      if (val.position >= val.duration - const Duration(seconds: 1) && !_isShowingNextPrompt) {
        _checkAutoPlayNext();
      }
    }
    setState(() {});
  }

  void _checkAutoPlayNext() {
    if (!_isAutoPlayEnabled) return;
    final epIndex = _currentServer.episodes.indexWhere((e) => e.slug == _currentEpisode.slug);
    if (epIndex >= 0 && epIndex < _currentServer.episodes.length - 1) {
      final next = _currentServer.episodes[epIndex + 1];
      setState(() {
        _isShowingNextPrompt = true;
        _nextEpisode = next;
        _nextCountdown = 5;
      });
      _nextCountdownTimer?.cancel();
      _nextCountdownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
        if (!mounted) return;
        if (_nextCountdown <= 1) {
          t.cancel();
          _switchEpisode(next);
        } else {
          setState(() => _nextCountdown--);
        }
      });
    }
  }

  Future<void> _saveProgress() async {
    if (_videoPlayerController == null || !_videoPlayerController!.value.isInitialized) return;
    final pos = _videoPlayerController!.value.position.inSeconds;
    final dur = _videoPlayerController!.value.duration.inSeconds;
    if (dur > 0 && pos > 5) {
      await StorageService.saveHistory(
        movie: widget.movie,
        episodeSlug: _currentEpisode.slug,
        episodeName: _currentEpisode.name,
        positionSeconds: pos,
        durationSeconds: dur,
        serverName: _currentServer.serverName,
      );
      if (mounted) {
        setState(() {
          _watchedSlugs.add(_currentEpisode.slug);
        });
      }
    }
  }

  void _switchEpisode(EpisodeItem ep) {
    _saveProgress();
    setState(() {
      _currentEpisode = ep;
      _syncEpisodeTab();
    });
    _initPlayer();
  }

  void _switchServer(ServerItem server) {
    if (server.serverName == _currentServer.serverName) return;
    _saveProgress();
    setState(() {
      _currentServer = server;
      final match = server.episodes.firstWhere(
        (e) => e.slug == _currentEpisode.slug,
        orElse: () => server.episodes.first,
      );
      _currentEpisode = match;
      _syncEpisodeTab();
    });
    _initPlayer();
  }

  void _seekRelative(int seconds) {
    if (_videoPlayerController == null || !_videoPlayerController!.value.isInitialized) return;
    final pos = _videoPlayerController!.value.position;
    final dur = _videoPlayerController!.value.duration;
    final target = pos + Duration(seconds: seconds);
    if (target < Duration.zero) {
      _videoPlayerController!.seekTo(Duration.zero);
    } else if (target > dur) {
      _videoPlayerController!.seekTo(dur);
    } else {
      _videoPlayerController!.seekTo(target);
    }
    _resetControlsTimer();
    HapticFeedback.lightImpact();
  }

  void _triggerDoubleTapSeek(bool isRight) {
    if (isRight) {
      _seekRelative(10);
      setState(() => _showSeekRightRipple = true);
      _seekRightTimer?.cancel();
      _seekRightTimer = Timer(const Duration(milliseconds: 650), () {
        if (mounted) setState(() => _showSeekRightRipple = false);
      });
    } else {
      _seekRelative(-10);
      setState(() => _showSeekLeftRipple = true);
      _seekLeftTimer?.cancel();
      _seekLeftTimer = Timer(const Duration(milliseconds: 650), () {
        if (mounted) setState(() => _showSeekLeftRipple = false);
      });
    }
  }

  void _handleVerticalDrag(DragUpdateDetails details, double screenWidth) {
    if (_isScreenLocked) return;

    final isLeft = details.globalPosition.dx < screenWidth * 0.5;
    final delta = -details.primaryDelta! / 200.0;

    if (isLeft) {
      // Brightness HUD
      setState(() {
        _brightness = (_brightness + delta).clamp(0.1, 1.0);
        _showBrightnessHud = true;
      });
    } else {
      // Volume HUD
      setState(() {
        _volume = (_volume + delta).clamp(0.0, 1.0);
        _videoPlayerController?.setVolume(_volume);
        _showVolumeHud = true;
      });
    }

    _gestureHudTimer?.cancel();
    _gestureHudTimer = Timer(const Duration(milliseconds: 1000), () {
      if (mounted) {
        setState(() {
          _showBrightnessHud = false;
          _showVolumeHud = false;
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final isLandscape = MediaQuery.of(context).orientation == Orientation.landscape;

    return PopScope(
      canPop: !_isFullScreen,
      onPopInvoked: (didPop) {
        if (!didPop && _isFullScreen) {
          _toggleFullScreen();
        }
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: SafeArea(
          top: !_isFullScreen,
          bottom: !_isFullScreen,
          left: false,
          right: false,
          child: _isFullScreen
              ? _buildPlayerContainer(isLandscape: true)
              : Column(
                  children: [
                    // Top Player Area
                    SizedBox(
                      width: double.infinity,
                      height: size.width * (9 / 16),
                      child: _buildPlayerContainer(isLandscape: false),
                    ),

                    // Scrollable Bottom Metadata, Server & Episode Controls
                    Expanded(
                      child: _buildPortraitContent(),
                    ),
                  ],
                ),
        ),
      ),
    );
  }

  Widget _buildPlayerContainer({required bool isLandscape}) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final screenWidth = constraints.maxWidth;

        return Stack(
          fit: StackFit.expand,
          children: [
            // 1. VIDEO VIEW OR WEB EMBED
            if (_isEmbedMode && _webViewController != null)
              WebViewWidget(controller: _webViewController!)
            else if (_videoPlayerController != null && _videoPlayerController!.value.isInitialized)
              _buildFittedVideo()
            else if (_isPlayerInitializing)
              const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(color: AppTheme.primary, strokeWidth: 3),
                    SizedBox(height: 12),
                    Text(
                      'Đang nạp luồng phát phim 4K HDR...',
                      style: TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                  ],
                ),
              )
            else if (_errorMessage != null)
              _buildErrorOverlay()
            else
              Container(color: Colors.black),

            // 2. BRIGHTNESS SIMULATOR FILTER
            if (_brightness < 1.0 && !_isEmbedMode)
              IgnorePointer(
                child: Container(
                  color: Colors.black.withOpacity((1.0 - _brightness).clamp(0.0, 0.85)),
                ),
              ),

            // 3. GESTURE DETECTOR FOR TAP, DOUBLE-TAP & VERTICAL SWIPES
            if (!_isEmbedMode)
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: _toggleControls,
                  onDoubleTapDown: (details) {
                    if (_isScreenLocked) return;
                    final isRight = details.localPosition.dx > screenWidth * 0.5;
                    _triggerDoubleTapSeek(isRight);
                  },
                  onVerticalDragUpdate: (details) => _handleVerticalDrag(details, screenWidth),
                ),
              ),

            // 4. DOUBLE-TAP RIPPLE HUDS
            if (_showSeekLeftRipple)
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                width: screenWidth * 0.45,
                child: _buildSeekRipple(isForward: false),
              ),
            if (_showSeekRightRipple)
              Positioned(
                right: 0,
                top: 0,
                bottom: 0,
                width: screenWidth * 0.45,
                child: _buildSeekRipple(isForward: true),
              ),

            // 5. BRIGHTNESS HUD (Left)
            if (_showBrightnessHud)
              Positioned(
                left: 24,
                top: 0,
                bottom: 0,
                child: _buildVerticalSliderHud(
                  icon: Icons.brightness_6_rounded,
                  value: _brightness,
                  color: AppTheme.gold,
                ),
              ),

            // 6. VOLUME HUD (Right)
            if (_showVolumeHud)
              Positioned(
                right: 24,
                top: 0,
                bottom: 0,
                child: _buildVerticalSliderHud(
                  icon: _volume == 0 ? Icons.volume_off_rounded : Icons.volume_up_rounded,
                  value: _volume,
                  color: AppTheme.cyan,
                ),
              ),

            // 7. UNOBTRUSIVE FLOATING LOCK PILL (Never blocking center!)
            if (_isScreenLocked && _showLockPill)
              Positioned(
                top: 16,
                left: 16,
                child: GestureDetector(
                  onTap: () {
                    HapticFeedback.mediumImpact();
                    setState(() {
                      _isScreenLocked = false;
                      _showControls = true;
                    });
                    _resetControlsTimer();
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.8),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: AppTheme.primary, width: 1.5),
                      boxShadow: [
                        BoxShadow(color: AppTheme.primary.withOpacity(0.4), blurRadius: 10),
                      ],
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.lock_open_rounded, color: AppTheme.primary, size: 16),
                        SizedBox(width: 8),
                        Text(
                          'Mở Khóa Màn Hình',
                          style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                        ),
                      ],
                    ),
                  ),
                ),
              ),

            // 8. AUTO-RESUME FLOATING BANNER
            if (_showResumeBanner && !_isEmbedMode)
              Positioned(
                top: 14,
                right: 14,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.85),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppTheme.gold, width: 1),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.history_rounded, color: AppTheme.gold, size: 14),
                      const SizedBox(width: 6),
                      Text(
                        'Tiếp tục từ ${_formatDurationSeconds(_resumedSeconds)}',
                        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(width: 8),
                      GestureDetector(
                        onTap: () {
                          _videoPlayerController?.seekTo(Duration.zero);
                          setState(() => _showResumeBanner = false);
                        },
                        child: const Text(
                          'Xem lại từ đầu',
                          style: TextStyle(color: AppTheme.cyan, fontSize: 11, fontWeight: FontWeight.bold),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // 9. AUTO NEXT EPISODE COUNTDOWN OVERLAY
            if (_isShowingNextPrompt && _nextEpisode != null)
              _buildNextEpisodeOverlay(),

            // 10. NETFLIX-STYLE CONTROLS OVERLAY
            if (!_isScreenLocked && !_isEmbedMode && _showControls)
              _buildNetflixOverlayControls(isLandscape),

            // 11. EMBED MODE FLOATING TOOLBAR
            if (_isEmbedMode)
              _buildEmbedFloatingControls(isLandscape),
          ],
        );
      },
    );
  }

  Widget _buildFittedVideo() {
    final vRatio = _videoPlayerController!.value.aspectRatio > 0
        ? _videoPlayerController!.value.aspectRatio
        : (16 / 9);

    switch (_fitMode) {
      case VideoFitMode.original:
        return Center(
          child: AspectRatio(
            aspectRatio: vRatio,
            child: VideoPlayer(_videoPlayerController!),
          ),
        );
      case VideoFitMode.fill:
        return SizedBox.expand(
          child: FittedBox(
            fit: BoxFit.cover,
            child: SizedBox(
              width: _videoPlayerController!.value.size.width,
              height: _videoPlayerController!.value.size.height,
              child: VideoPlayer(_videoPlayerController!),
            ),
          ),
        );
      case VideoFitMode.stretch:
        return SizedBox.expand(
          child: FittedBox(
            fit: BoxFit.fill,
            child: SizedBox(
              width: _videoPlayerController!.value.size.width,
              height: _videoPlayerController!.value.size.height,
              child: VideoPlayer(_videoPlayerController!),
            ),
          ),
        );
    }
  }

  Widget _buildNetflixOverlayControls(bool isLandscape) {
    final isPlaying = _videoPlayerController?.value.isPlaying ?? false;
    final pos = _videoPlayerController?.value.position ?? Duration.zero;
    final dur = _videoPlayerController?.value.duration ?? Duration.zero;

    return Stack(
      children: [
        // Darkened Atmospheric Scrim
        Positioned.fill(
          child: IgnorePointer(
            child: Container(
              color: Colors.black.withOpacity(0.4),
            ),
          ),
        ),

        // TOP BAR
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [Colors.black.withOpacity(0.85), Colors.transparent],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
            child: Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back, color: Colors.white, size: 24),
                  onPressed: () {
                    if (_isFullScreen) {
                      _toggleFullScreen();
                    } else {
                      Navigator.pop(context);
                    }
                  },
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        widget.movie.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      Text(
                        '${_currentServer.serverName} • ${_currentEpisode.name}',
                        style: const TextStyle(
                          color: AppTheme.primaryLight,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),

                // Speed Selector
                TextButton(
                  onPressed: _showSpeedMenu,
                  style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8)),
                  child: Text(
                    '${_currentSpeed}x',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                  ),
                ),

                // Fit Mode Toggle
                IconButton(
                  icon: Icon(
                    _fitMode == VideoFitMode.original
                        ? Icons.aspect_ratio_rounded
                        : (_fitMode == VideoFitMode.fill ? Icons.crop_free_rounded : Icons.fit_screen_rounded),
                    color: Colors.white,
                    size: 20,
                  ),
                  tooltip: 'Tỉ lệ khung hình',
                  onPressed: () {
                    setState(() {
                      if (_fitMode == VideoFitMode.original) {
                        _fitMode = VideoFitMode.fill;
                      } else if (_fitMode == VideoFitMode.fill) {
                        _fitMode = VideoFitMode.stretch;
                      } else {
                        _fitMode = VideoFitMode.original;
                      }
                    });
                    _resetControlsTimer();
                  },
                ),

                // Lock Screen
                IconButton(
                  icon: const Icon(Icons.lock_outline_rounded, color: Colors.white, size: 20),
                  tooltip: 'Khóa màn hình',
                  onPressed: () {
                    setState(() {
                      _isScreenLocked = true;
                      _showControls = false;
                      _showLockPill = true;
                    });
                    _lockPillTimer?.cancel();
                    _lockPillTimer = Timer(const Duration(seconds: 2), () {
                      if (mounted) setState(() => _showLockPill = false);
                    });
                  },
                ),
              ],
            ),
          ),
        ),

        // CENTER CONTROLS (Rewind 10s - Play/Pause - Forward 10s)
        Center(
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                iconSize: 44,
                icon: const Icon(Icons.replay_10_rounded, color: Colors.white),
                onPressed: () => _seekRelative(-10),
              ),
              const SizedBox(width: 32),
              GestureDetector(
                onTap: () {
                  if (isPlaying) {
                    _videoPlayerController?.pause();
                  } else {
                    _videoPlayerController?.play();
                  }
                  _resetControlsTimer();
                },
                child: Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.black.withOpacity(0.6),
                    border: Border.all(color: Colors.white30, width: 1.5),
                  ),
                  child: Icon(
                    isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                    color: Colors.white,
                    size: 40,
                  ),
                ),
              ),
              const SizedBox(width: 32),
              IconButton(
                iconSize: 44,
                icon: const Icon(Icons.forward_10_rounded, color: Colors.white),
                onPressed: () => _seekRelative(10),
              ),
            ],
          ),
        ),

        // BOTTOM BAR (Scrub bar + Time + Actions)
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [Colors.transparent, Colors.black.withOpacity(0.85)],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Scrub Bar
                Row(
                  children: [
                    Text(
                      _formatDuration(pos),
                      style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                    Expanded(
                      child: SliderTheme(
                        data: SliderTheme.of(context).copyWith(
                          activeTrackColor: AppTheme.primary,
                          inactiveTrackColor: Colors.white24,
                          thumbColor: AppTheme.primary,
                          thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                          overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
                          trackHeight: 3.5,
                        ),
                        child: Slider(
                          value: _isDraggingSlider
                              ? _dragSliderPosition
                              : pos.inSeconds.toDouble().clamp(0.0, dur.inSeconds.toDouble()),
                          max: dur.inSeconds > 0 ? dur.inSeconds.toDouble() : 1.0,
                          onChangeStart: (_) {
                            _isDraggingSlider = true;
                            _hideControlsTimer?.cancel();
                          },
                          onChanged: (val) {
                            setState(() => _dragSliderPosition = val);
                          },
                          onChangeEnd: (val) {
                            _isDraggingSlider = false;
                            _videoPlayerController?.seekTo(Duration(seconds: val.toInt()));
                            _resetControlsTimer();
                          },
                        ),
                      ),
                    ),
                    Text(
                      _formatDuration(dur),
                      style: const TextStyle(color: Colors.white70, fontSize: 11),
                    ),
                  ],
                ),

                // Bottom Action Buttons
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        // Next Episode Button
                        TextButton.icon(
                          onPressed: _playNextEpisodeDirect,
                          style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8)),
                          icon: const Icon(Icons.skip_next_rounded, color: Colors.white, size: 20),
                          label: const Text('Tập Tiếp Theo', style: TextStyle(color: Colors.white, fontSize: 12)),
                        ),
                        const SizedBox(width: 8),

                        // Episodes Drawer
                        TextButton.icon(
                          onPressed: _showEpisodesModal,
                          style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8)),
                          icon: const Icon(Icons.video_library_rounded, color: Colors.white, size: 18),
                          label: const Text('Danh Sách Tập', style: TextStyle(color: Colors.white, fontSize: 12)),
                        ),
                        const SizedBox(width: 8),

                        // Server Switcher
                        TextButton.icon(
                          onPressed: _showServersModal,
                          style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8)),
                          icon: const Icon(Icons.dns_rounded, color: Colors.white, size: 18),
                          label: Text(_currentServer.serverName, style: const TextStyle(color: Colors.white, fontSize: 12)),
                        ),
                      ],
                    ),

                    // Fullscreen Toggle
                    IconButton(
                      icon: Icon(
                        _isFullScreen ? Icons.fullscreen_exit_rounded : Icons.fullscreen_rounded,
                        color: Colors.white,
                        size: 26,
                      ),
                      onPressed: _toggleFullScreen,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildEmbedFloatingControls(bool isLandscape) {
    return Positioned(
      top: 10,
      left: 10,
      right: 10,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            decoration: BoxDecoration(
              color: Colors.black54,
              borderRadius: BorderRadius.circular(20),
            ),
            child: IconButton(
              icon: const Icon(Icons.arrow_back, color: Colors.white, size: 22),
              onPressed: () {
                if (_isFullScreen) {
                  _toggleFullScreen();
                } else {
                  Navigator.pop(context);
                }
              },
            ),
          ),
          Row(
            children: [
              Container(
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: IconButton(
                  icon: const Icon(Icons.refresh_rounded, color: Colors.white, size: 20),
                  tooltip: 'Tải lại',
                  onPressed: () => _initWebPlayer(_currentEpisode.linkEmbed),
                ),
              ),
              Container(
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: IconButton(
                  icon: Icon(
                    _isFullScreen ? Icons.fullscreen_exit_rounded : Icons.fullscreen_rounded,
                    color: Colors.white,
                    size: 24,
                  ),
                  tooltip: 'Toàn màn hình',
                  onPressed: _toggleFullScreen,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSeekRipple({required bool isForward}) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.08),
        borderRadius: BorderRadius.horizontal(
          left: isForward ? const Radius.circular(80) : Radius.zero,
          right: !isForward ? const Radius.circular(80) : Radius.zero,
        ),
      ),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isForward ? Icons.fast_forward_rounded : Icons.fast_rewind_rounded,
              color: Colors.white,
              size: 38,
            ),
            const SizedBox(height: 6),
            Text(
              isForward ? '10 giây >>' : '<< 10 giây',
              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVerticalSliderHud({
    required IconData icon,
    required double value,
    required Color color,
  }) {
    return Center(
      child: Container(
        width: 44,
        height: 160,
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.75),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: Colors.white24, width: 1),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(height: 8),
            Expanded(
              child: RotatedBox(
                quarterTurns: 3,
                child: LinearProgressIndicator(
                  value: value,
                  backgroundColor: Colors.white24,
                  valueColor: AlwaysStoppedAnimation<Color>(color),
                  minHeight: 4,
                  borderRadius: BorderRadius.circular(4),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '${(value * 100).toInt()}%',
              style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNextEpisodeOverlay() {
    return Container(
      color: Colors.black.withOpacity(0.88),
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'TẬP TIẾP THEO',
                style: TextStyle(color: AppTheme.primaryLight, fontWeight: FontWeight.bold, fontSize: 13, letterSpacing: 1.2),
              ),
              const SizedBox(height: 8),
              Text(
                _nextEpisode!.name,
                style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 10),
              Text(
                'Tự động chuyển tập sau $_nextCountdown giây...',
                style: const TextStyle(color: Colors.white70, fontSize: 13),
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  OutlinedButton(
                    onPressed: () {
                      _nextCountdownTimer?.cancel();
                      setState(() => _isShowingNextPrompt = false);
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white70,
                      side: const BorderSide(color: Colors.white24),
                    ),
                    child: const Text('Hủy'),
                  ),
                  const SizedBox(width: 14),
                  ElevatedButton.icon(
                    onPressed: () {
                      _nextCountdownTimer?.cancel();
                      _switchEpisode(_nextEpisode!);
                    },
                    style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
                    icon: const Icon(Icons.play_arrow, color: Colors.white, size: 18),
                    label: const Text('Phát Ngay', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildErrorOverlay() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.warning_amber_rounded, color: AppTheme.primary, size: 44),
            const SizedBox(height: 10),
            Text(
              _errorMessage ?? 'Không thể tải video',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70, fontSize: 13),
            ),
            const SizedBox(height: 14),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                ElevatedButton(
                  onPressed: () => _initPlayer(),
                  style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
                  child: const Text('Thử Lại', style: TextStyle(color: Colors.white)),
                ),
                if (_currentEpisode.linkEmbed.isNotEmpty) ...[
                  const SizedBox(width: 10),
                  OutlinedButton.icon(
                    onPressed: () => _initWebPlayer(_currentEpisode.linkEmbed),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.cyan,
                      side: const BorderSide(color: AppTheme.cyan),
                    ),
                    icon: const Icon(Icons.play_circle_outline, size: 16),
                    label: const Text('Mở Web Embed'),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPortraitContent() {
    final movie = widget.movie;

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      physics: const BouncingScrollPhysics(),
      children: [
        // Title & Badges
        Text(
          movie.name,
          style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Text(
              movie.year != null ? '${movie.year}' : '2026',
              style: const TextStyle(color: Colors.white70, fontSize: 12),
            ),
            const SizedBox(width: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: AppTheme.primary,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                movie.quality.isNotEmpty ? movie.quality : 'FHD',
                style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              movie.lang.isNotEmpty ? movie.lang : 'Vietsub',
              style: const TextStyle(color: Colors.white70, fontSize: 12),
            ),
            const Spacer(),
            Text(
              _currentEpisode.name,
              style: const TextStyle(color: AppTheme.primaryLight, fontWeight: FontWeight.bold, fontSize: 12),
            ),
          ],
        ),

        const SizedBox(height: 14),

        // Quick Utilities Bar
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _buildToolChip(
                icon: _isFavorite ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
                label: _isFavorite ? 'Đã Lưu' : 'Lưu Phim',
                color: _isFavorite ? AppTheme.gold : Colors.white70,
                onTap: () async {
                  await StorageService.toggleFavorite(widget.movie);
                  final fav = await StorageService.isFavorite(widget.movie.slug);
                  if (mounted) setState(() => _isFavorite = fav);
                },
              ),
              _buildToolChip(
                icon: Icons.screen_rotation_rounded,
                label: 'Xoay Ngang',
                onTap: _toggleFullScreen,
              ),
              _buildToolChip(
                icon: _isEmbedMode ? Icons.video_file_rounded : Icons.public_rounded,
                label: _isEmbedMode ? 'Phát HLS' : 'Dùng Embed',
                onTap: () {
                  if (_isEmbedMode) {
                    _initPlayer();
                  } else {
                    if (_currentEpisode.linkEmbed.isNotEmpty) {
                      _initWebPlayer(_currentEpisode.linkEmbed);
                    }
                  }
                },
              ),
              _buildToolChip(
                icon: Icons.timer_outlined,
                label: _sleepRemainingSeconds > 0 ? '${_sleepRemainingSeconds ~/ 60}p' : 'Hẹn Giờ',
                onTap: _showSleepTimerDialog,
              ),
            ],
          ),
        ),

        const SizedBox(height: 18),
        const Divider(color: AppTheme.border, height: 1),
        const SizedBox(height: 14),

        // Server Selection
        const Text(
          'Nguồn Phát (Server)',
          style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: widget.servers.map((s) {
              final isCurrent = s.serverName == _currentServer.serverName;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(s.serverName),
                  selected: isCurrent,
                  selectedColor: AppTheme.primary,
                  backgroundColor: AppTheme.card,
                  labelStyle: TextStyle(
                    color: isCurrent ? Colors.white : AppTheme.textSecondary,
                    fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
                    fontSize: 12,
                  ),
                  onSelected: (_) => _switchServer(s),
                ),
              );
            }).toList(),
          ),
        ),

        const SizedBox(height: 18),

        // Episodes Section
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Danh Sách Tập Phim',
              style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
            ),
            Text(
              '${_currentServer.episodes.length} tập',
              style: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
            ),
          ],
        ),
        const SizedBox(height: 10),

        // Episodes Grid
        _buildEpisodesGrid(),

        const SizedBox(height: 32),
      ],
    );
  }

  Widget _buildEpisodesGrid() {
    final episodes = _currentServer.episodes;
    if (episodes.isEmpty) {
      return const Text('Chưa có danh sách tập cho server này.', style: TextStyle(color: Colors.white54));
    }

    final totalTabs = (episodes.length / _episodesPerPage).ceil();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (totalTabs > 1) ...[
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: List.generate(totalTabs, (tIdx) {
                final start = tIdx * _episodesPerPage + 1;
                final end = (start + _episodesPerPage - 1).clamp(1, episodes.length);
                final isSel = tIdx == _selectedEpisodeTab;
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilterChip(
                    label: Text('$start-$end'),
                    selected: isSel,
                    selectedColor: AppTheme.primaryLight.withOpacity(0.3),
                    backgroundColor: AppTheme.card,
                    labelStyle: TextStyle(
                      color: isSel ? AppTheme.primaryLight : AppTheme.textSecondary,
                      fontSize: 11,
                      fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                    ),
                    onSelected: (_) => setState(() => _selectedEpisodeTab = tIdx),
                  ),
                );
              }),
            ),
          ),
          const SizedBox(height: 10),
        ],

        GridView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 4,
            childAspectRatio: 2.2,
            crossAxisSpacing: 8,
            mainAxisSpacing: 8,
          ),
          itemCount: _getCurrentTabEpisodes().length,
          itemBuilder: (context, idx) {
            final ep = _getCurrentTabEpisodes()[idx];
            final isCurrent = ep.slug == _currentEpisode.slug;
            final isWatched = _watchedSlugs.contains(ep.slug);

            return OutlinedButton(
              onPressed: () => _switchEpisode(ep),
              style: OutlinedButton.styleFrom(
                backgroundColor: isCurrent ? AppTheme.primary : AppTheme.card,
                side: BorderSide(
                  color: isCurrent ? AppTheme.primary : (isWatched ? AppTheme.border : AppTheme.border),
                ),
                padding: EdgeInsets.zero,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
              ),
              child: Text(
                ep.name,
                style: TextStyle(
                  color: isCurrent ? Colors.white : (isWatched ? Colors.white60 : Colors.white),
                  fontSize: 12,
                  fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
                ),
              ),
            );
          },
        ),
      ],
    );
  }

  List<EpisodeItem> _getCurrentTabEpisodes() {
    final episodes = _currentServer.episodes;
    final start = _selectedEpisodeTab * _episodesPerPage;
    final end = (start + _episodesPerPage).clamp(0, episodes.length);
    if (start >= episodes.length) return episodes;
    return episodes.sublist(start, end);
  }

  Widget _buildToolChip({
    required IconData icon,
    required String label,
    Color color = Colors.white70,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ActionChip(
        avatar: Icon(icon, color: color, size: 16),
        label: Text(label, style: TextStyle(color: color, fontSize: 12)),
        backgroundColor: AppTheme.card,
        side: const BorderSide(color: AppTheme.border),
        onPressed: onTap,
      ),
    );
  }

  void _playNextEpisodeDirect() {
    final epIndex = _currentServer.episodes.indexWhere((e) => e.slug == _currentEpisode.slug);
    if (epIndex >= 0 && epIndex < _currentServer.episodes.length - 1) {
      _switchEpisode(_currentServer.episodes[epIndex + 1]);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đây là tập cuối cùng của server này.')),
      );
    }
  }

  void _showEpisodesModal() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF141722),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Danh Sách Tập Phim',
              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 14),
            Expanded(
              child: GridView.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 5,
                  childAspectRatio: 2.1,
                  crossAxisSpacing: 8,
                  mainAxisSpacing: 8,
                ),
                itemCount: _currentServer.episodes.length,
                itemBuilder: (context, idx) {
                  final ep = _currentServer.episodes[idx];
                  final isCurrent = ep.slug == _currentEpisode.slug;
                  return ElevatedButton(
                    onPressed: () {
                      Navigator.pop(ctx);
                      _switchEpisode(ep);
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: isCurrent ? AppTheme.primary : AppTheme.card,
                    ),
                    child: Text(
                      ep.name,
                      style: TextStyle(
                        color: isCurrent ? Colors.white : Colors.white70,
                        fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showServersModal() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF141722),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Chọn Nguồn Phát (Server)',
              style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 14),
            ...widget.servers.map((s) {
              final isCurrent = s.serverName == _currentServer.serverName;
              return ListTile(
                title: Text(s.serverName, style: TextStyle(color: isCurrent ? AppTheme.primaryLight : Colors.white)),
                leading: Icon(Icons.dns_rounded, color: isCurrent ? AppTheme.primary : Colors.white54),
                trailing: isCurrent ? const Icon(Icons.check, color: AppTheme.primary) : null,
                onTap: () {
                  Navigator.pop(ctx);
                  _switchServer(s);
                },
              );
            }),
          ],
        ),
      ),
    );
  }

  void _showSpeedMenu() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF141722),
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [0.75, 1.0, 1.25, 1.5, 2.0].map((s) {
          final isSel = _currentSpeed == s;
          return ListTile(
            title: Text('${s}x', style: TextStyle(color: isSel ? AppTheme.primary : Colors.white)),
            trailing: isSel ? const Icon(Icons.check, color: AppTheme.primary) : null,
            onTap: () {
              Navigator.pop(ctx);
              setState(() => _currentSpeed = s);
              _videoPlayerController?.setPlaybackSpeed(s);
              _resetControlsTimer();
            },
          );
        }).toList(),
      ),
    );
  }

  void _showSleepTimerDialog() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF141722),
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Padding(
            padding: EdgeInsets.all(16),
            child: Text('Hẹn giờ tắt ứng dụng', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
          ),
          ...[15, 30, 45, 60, 90].map((m) {
            return ListTile(
              title: Text('$m phút', style: const TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(ctx);
                _setSleepTimer(m);
              },
            );
          }),
          if (_sleepRemainingSeconds > 0)
            ListTile(
              title: const Text('Hủy hẹn giờ', style: TextStyle(color: Colors.redAccent)),
              onTap: () {
                Navigator.pop(ctx);
                _cancelSleepTimer();
              },
            ),
        ],
      ),
    );
  }

  void _setSleepTimer(int minutes) {
    _sleepTimer?.cancel();
    _sleepTicker?.cancel();

    _sleepRemainingSeconds = minutes * 60;
    _sleepSelectedMinutes = minutes;

    _sleepTicker = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      if (_sleepRemainingSeconds <= 1) {
        t.cancel();
        _videoPlayerController?.pause();
        SystemNavigator.pop(); // Close app safely
      } else {
        setState(() => _sleepRemainingSeconds--);
      }
    });
  }

  void _cancelSleepTimer() {
    _sleepTimer?.cancel();
    _sleepTicker?.cancel();
    setState(() {
      _sleepRemainingSeconds = 0;
      _sleepSelectedMinutes = null;
    });
  }

  String _formatDuration(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    if (d.inHours > 0) {
      return '${d.inHours}:$m:$s';
    }
    return '$m:$s';
  }

  String _formatDurationSeconds(int seconds) {
    return _formatDuration(Duration(seconds: seconds));
  }
}
