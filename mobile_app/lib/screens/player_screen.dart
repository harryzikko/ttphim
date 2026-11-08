import 'dart:io';
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:video_player/video_player.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:screen_brightness/screen_brightness.dart';
import 'package:volume_controller/volume_controller.dart';
import '../models/movie.dart';
import '../models/movie_detail.dart';
import '../services/api_service.dart';
import '../services/storage_service.dart';
import '../services/embed_policy.dart';
import '../theme/app_theme.dart';
import 'login_screen.dart';

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
  late Movie _activeMovie;
  late List<ServerItem> _activeServers;
  List<Map<String, dynamic>> _seasons = [];
  late ServerItem _currentServer;
  late EpisodeItem _currentEpisode;

  // Video Controller
  VideoPlayerController? _videoPlayerController;
  WebViewController? _webViewController;
  final GlobalKey _webViewKey = GlobalKey();
  bool _isEmbedMode = false;
  bool _isPlayerInitializing = true;
  String? _errorMessage;

  // Embed Playback State Sync
  Duration _webPosition = Duration.zero;
  Duration _webDuration = Duration.zero;
  bool _webIsPlaying = false;
  String _currentAudioTrack = 'original';
  String _currentSubMode = 'bilingual';

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

  // Horizontal Swipe Seek
  bool _isSwipingSeek = false;
  Duration _swipeSeekStartPosition = Duration.zero;
  Duration _swipeSeekTargetPosition = Duration.zero;
  int _swipeSeekDeltaSeconds = 0;
  double _swipeSeekAccumulatedDx = 0.0;
  int _lastHapticDelta = 0;

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

  // Favorites & Watched Tracking
  bool _isFavorite = false;
  Set<String> _watchedSlugs = {};

  // Episode Tabs
  int _selectedEpisodeTab = 0;
  static const int _episodesPerPage = 25;
  int _playerGeneration = 0;

  @override
  void initState() {
    super.initState();
    _activeMovie = widget.movie;
    _activeServers = widget.servers;
    _currentServer = widget.initialServer;
    _currentEpisode = widget.initialEpisode;

    _loadInitialState();
    _initSystemAudioAndBrightness();
    _initPlayer();

    // Periodic watch history saving every 10 seconds
    _historyTimer = Timer.periodic(const Duration(seconds: 10), (_) => _saveProgress());
  }

  @override
  void deactivate() {
    _saveProgress();
    _videoPlayerController?.pause();
    try {
      _webViewController?.runJavaScript(
        "var v=document.querySelectorAll('video'); for(var i=0;i<v.length;i++) v[i].pause();"
      );
      _webViewController?.loadRequest(Uri.parse('about:blank'));
    } catch (_) {}
    super.deactivate();
  }

  @override
  void dispose() {
    _saveProgress();
    _videoPlayerController?.pause();
    try {
      _webViewController?.runJavaScript(
        "var v=document.querySelectorAll('video'); for(var i=0;i<v.length;i++) v[i].pause();"
      );
      _webViewController?.loadRequest(Uri.parse('about:blank'));
    } catch (_) {}
    _playerGeneration++;
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

    try {
      ScreenBrightness.instance.resetApplicationScreenBrightness();
    } catch (_) {}

    super.dispose();
  }

  Future<void> _initSystemAudioAndBrightness() async {
    try {
      final currentBrightness = await ScreenBrightness.instance.application;
      if (mounted && currentBrightness > 0) {
        setState(() => _brightness = currentBrightness.clamp(0.05, 1.0));
      }
    } catch (_) {}
    try {
      final currentVol = await VolumeController.instance.getVolume();
      if (mounted) {
        setState(() => _volume = currentVol.clamp(0.0, 1.0));
      }
    } catch (_) {}
  }

  Future<void> _loadInitialState() async {
    final fav = await StorageService.isFavorite(_activeMovie.slug);
    final watched = await StorageService.getWatchedEpisodes(_activeMovie.slug);
    final autoNext = await StorageService.getAutoNext();
    final seasons = await ApiService.getMovieSeasons(_activeMovie.slug);
    if (mounted) {
      setState(() {
        _isFavorite = fav;
        _watchedSlugs = watched;
        _isAutoPlayEnabled = autoNext;
        _seasons = seasons;
        _syncEpisodeTab();
      });
    }
  }

  String _getCurrentSeasonLabel() {
    for (final s in _seasons) {
      if (s['slug'] == _activeMovie.slug || s['is_current'] == true) {
        return s['label']?.toString() ?? s['name']?.toString() ?? 'Chọn Phần';
      }
    }
    return _seasons.isNotEmpty ? (_seasons.first['label']?.toString() ?? 'Chọn Phần') : 'Chọn Phần';
  }

  Future<void> _switchSeason(Map<String, dynamic> season) async {
    final slug = season['slug']?.toString();
    if (slug == null || slug == _activeMovie.slug) return;

    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Đang chuyển sang ${season['label'] ?? season['name'] ?? 'mùa mới'}...'),
        duration: const Duration(seconds: 2),
        backgroundColor: AppTheme.surface,
      ),
    );

    await _saveProgress();

    final detail = await ApiService.getMovieDetail(slug);
    if (!mounted || detail == null || detail.servers.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Không tải được thông tin mùa phim này')),
        );
      }
      return;
    }

    final newSeasons = await ApiService.getMovieSeasons(slug);
    if (!mounted) return;

    setState(() {
      _activeMovie = detail.movie;
      _activeServers = detail.servers;
      _seasons = newSeasons.isNotEmpty ? newSeasons : _seasons;
      _currentServer = detail.servers.first;
      _currentEpisode = _currentServer.episodes.isNotEmpty
          ? _currentServer.episodes.first
          : EpisodeItem(name: 'Tập 1', slug: 'tap-1', filename: '', linkEmbed: '', linkM3u8: '');
      _selectedEpisodeTab = 0;
    });

    await _loadInitialState();
    _initPlayer();
  }

  void _showSeasonSelector() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF141722),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Chọn Mùa / Phần Phim',
                      style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, color: AppTheme.textMuted, size: 20),
                      onPressed: () => Navigator.pop(ctx),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ),
              ),
              const Divider(color: AppTheme.border, height: 16),
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: _seasons.length,
                  separatorBuilder: (_, __) => const Divider(color: AppTheme.border, height: 1),
                  itemBuilder: (context, idx) {
                    final s = _seasons[idx];
                    final isCurrent = s['slug'] == _activeMovie.slug || s['is_current'] == true;
                    final label = s['label']?.toString() ?? s['name']?.toString() ?? 'Phần ${idx + 1}';
                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                      title: Text(
                        label,
                        style: TextStyle(
                          color: isCurrent ? AppTheme.primaryLight : Colors.white,
                          fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
                          fontSize: 14,
                        ),
                      ),
                      subtitle: s['year'] != null
                          ? Text('Năm: ${s['year']}', style: const TextStyle(color: AppTheme.textMuted, fontSize: 12))
                          : null,
                      trailing: isCurrent ? const Icon(Icons.check_circle_rounded, color: AppTheme.primary, size: 20) : null,
                      onTap: () {
                        Navigator.pop(ctx);
                        if (!isCurrent) {
                          _switchSeason(s);
                        }
                      },
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

  void _handleExitPlayer() {
    _saveProgress();
    _videoPlayerController?.pause();
    try {
      _webViewController?.runJavaScript(
        "var v=document.querySelectorAll('video'); for(var i=0;i<v.length;i++) v[i].pause();"
      );
      _webViewController?.loadRequest(Uri.parse('about:blank'));
    } catch (_) {}

    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

    if (mounted) {
      Navigator.of(context).pop(true);
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
      Future.delayed(const Duration(milliseconds: 500), () {
        if (mounted && !_isFullScreen) {
          SystemChrome.setPreferredOrientations([
            DeviceOrientation.portraitUp,
            DeviceOrientation.landscapeLeft,
            DeviceOrientation.landscapeRight,
          ]);
        }
      });
    }
    HapticFeedback.lightImpact();
  }

  void _exitLandscapeMode() {
    if (_isFullScreen) {
      _toggleFullScreen();
    } else {
      SystemChrome.setPreferredOrientations([
        DeviceOrientation.portraitUp,
      ]);
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
      Future.delayed(const Duration(milliseconds: 500), () {
        if (mounted && !_isFullScreen) {
          SystemChrome.setPreferredOrientations([
            DeviceOrientation.portraitUp,
            DeviceOrientation.landscapeLeft,
            DeviceOrientation.landscapeRight,
          ]);
        }
      });
      HapticFeedback.lightImpact();
    }
  }

  /// Extract ViCDN Video ID from URL (e.g. tv-286171-1-1 or movie-123)
  String? _extractVicdnId(String url) {
    if (url.isEmpty) return null;
    final reg = RegExp(r'(?:embed/vicdn/|stream/vicdn/|vicdn\.cc/)([\w-]+)');
    final m = reg.firstMatch(url);
    if (m != null) return m.group(1);
    final reg2 = RegExp(r'(tv-\d+-\d+-\d+|movie-\d+)');
    final m2 = reg2.firstMatch(url);
    if (m2 != null) return m2.group(1);
    return null;
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
      _webPosition = Duration.zero;
      _webDuration = Duration.zero;
      _webIsPlaying = false;
    });

    try {
      final resolvedUrl = EmbedPolicy.resolveUrl(embedUrl);

      late final PlatformWebViewControllerCreationParams params;
      if (WebViewPlatform.instance is WebKitWebViewPlatform) {
        params = WebKitWebViewControllerCreationParams(
          allowsInlineMediaPlayback: true,
          mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
        );
      } else {
        params = const PlatformWebViewControllerCreationParams();
      }

      final controller = WebViewController.fromPlatformCreationParams(params);
      controller.setJavaScriptMode(JavaScriptMode.unrestricted);
      controller.setBackgroundColor(Colors.black);

      final userAgent = Platform.isIOS
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
          : 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
      controller.setUserAgent(userAgent);

      if (controller.platform is AndroidWebViewController) {
        AndroidWebViewController.enableDebugging(false);
        (controller.platform as AndroidWebViewController).setMediaPlaybackRequiresUserGesture(false);
      }

      controller.addJavaScriptChannel(
        'CineVietNative',
        onMessageReceived: (JavaScriptMessage message) {
          final msg = message.message;
          if (msg == 'toggle-fullscreen' || msg == 'request-fullscreen') {
            _toggleFullScreen();
          } else if (msg == 'toggle-controls') {
            _toggleControls();
          } else if (msg.startsWith('sync:')) {
            final parts = msg.split(':');
            if (parts.length >= 4) {
              final p = int.tryParse(parts[1]) ?? 0;
              final d = int.tryParse(parts[2]) ?? 0;
              final isPlaying = parts[3] == '1';
              if (mounted) {
                setState(() {
                  _webPosition = Duration(seconds: p);
                  if (d > 0) _webDuration = Duration(seconds: d);
                  _webIsPlaying = isPlaying;
                });
                if (d > 0 && p >= d - 1 && !_isShowingNextPrompt) {
                  _checkAutoPlayNext();
                }
              }
            }
          }
        },
      );

      controller.setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (url) {
            controller.runJavaScript('''
              (function() {
                try {
                  var meta = document.querySelector('meta[name="viewport"]');
                  if (!meta) {
                    meta = document.createElement('meta');
                    meta.name = 'viewport';
                    document.head.appendChild(meta);
                  }
                  meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

                function fixVideos() {
                  var videos = document.querySelectorAll('video');
                  for (var i = 0; i < videos.length; i++) {
                    videos[i].setAttribute('playsinline', 'true');
                    videos[i].setAttribute('webkit-playsinline', 'true');
                    videos[i].setAttribute('x5-playsinline', 'true');
                    videos[i].playsInline = true;
                  }
                }
                fixVideos();
                setInterval(fixVideos, 1000);

                if (window.HTMLVideoElement) {
                  try {
                    Object.defineProperty(HTMLVideoElement.prototype, 'webkitEnterFullscreen', {
                      value: function() {
                        try {
                          if (window.CineVietNative && window.CineVietNative.postMessage) {
                            window.CineVietNative.postMessage('toggle-fullscreen');
                          }
                        } catch (_) {}
                      },
                      writable: true,
                      configurable: true
                    });
                  } catch (_) {}
                }

                if (window.jwplayer) {
                  var checkJw = setInterval(function() {
                    try {
                      var p = (window.jwplayer && window.jwplayer('ssPlay')) || (window.jwplayer && window.jwplayer());
                      if (p && p.on) {
                        clearInterval(checkJw);
                        p.on('fullscreen', function(e) {
                          if (e.fullscreen) {
                            if (window.CineVietNative && window.CineVietNative.postMessage) {
                              window.CineVietNative.postMessage('toggle-fullscreen');
                            }
                          }
                        });
                      }
                    } catch (_) {}
                  }, 400);
                }

                setInterval(function() {
                  try {
                    var p = 0;
                    var d = 0;
                    var isPlaying = false;
                    if (window.jwplayer) {
                      var jw = (window.jwplayer && window.jwplayer('ssPlay')) || window.jwplayer();
                      if (jw && typeof jw.getPosition === 'function') {
                        p = Math.floor(jw.getPosition() || 0);
                        d = Math.floor(jw.getDuration() || 0);
                        isPlaying = jw.getState() === 'playing';
                      }
                    }
                    if (d <= 0) {
                      var v = document.querySelector('video');
                      if (v) {
                        p = Math.floor(v.currentTime || 0);
                        d = Math.floor(v.duration || 0);
                        isPlaying = !v.paused;
                      }
                    }
                    if (d > 0 && window.CineVietNative && window.CineVietNative.postMessage) {
                      window.CineVietNative.postMessage('sync:' + p + ':' + d + ':' + (isPlaying ? '1' : '0'));
                    }
                  } catch (_) {}
                }, 2000);
              })();
            ''');
          },
          onNavigationRequest: (request) {
            if (!request.isMainFrame) {
              return NavigationDecision.navigate;
            }
            return EmbedPolicy.allowsNavigation(resolvedUrl, request.url)
                ? NavigationDecision.navigate
                : NavigationDecision.prevent;
          },
        ),
      );

      final isNguonC = resolvedUrl.contains('streamc.xyz') || resolvedUrl.contains('nguonc.com');
      controller.loadRequest(
        Uri.parse(resolvedUrl),
        headers: {
          'Referer': isNguonC ? 'https://phim.nguonc.com/' : 'https://cineviet.live/',
        },
      );
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
    if (!mounted) return;
    final generation = ++_playerGeneration;
    final episode = _currentEpisode;
    bool isCurrent() => mounted && generation == _playerGeneration;
    setState(() {
      _isPlayerInitializing = true;
      _errorMessage = null;
      _isShowingNextPrompt = false;
      _webPosition = Duration.zero;
      _webDuration = Duration.zero;
      _webIsPlaying = false;
    });

    _nextCountdownTimer?.cancel();
    final previous = _videoPlayerController;
    _videoPlayerController = null;
    previous?.removeListener(_videoListener);
    await previous?.dispose();
    if (!isCurrent()) return;

    VideoPlayerController? pendingController;

    final isSongNgu = _currentServer.serverName.toLowerCase().contains('song ngữ') ||
        episode.linkEmbed.contains('/embed/vicdn/') ||
        episode.linkEmbed.contains('vicdn') ||
        (_activeMovie.hasSongNgu && episode.linkEmbed.contains('vicdn'));

    // 1. Force Embed or Song Ngữ (Song Ngữ uses interactive embed web player for multi-audio and dual subtitles)
    if ((forceEmbed || isSongNgu) && episode.linkEmbed.isNotEmpty) {
      _initWebPlayer(episode.linkEmbed);
      return;
    }

    // 2. Resolve stream URL: Direct HLS or automatically extract from embed link
    String streamUrl = episode.linkM3u8.trim();
    if (streamUrl.isEmpty && episode.linkEmbed.isNotEmpty) {
      final extracted = _extractM3u8FromEmbed(episode.linkEmbed);
      if (extracted != null && extracted.isNotEmpty) {
        streamUrl = extracted;
      }
    }

    // 3. Fallback to Web Embed if no direct HLS
    if (streamUrl.isEmpty) {
      if (episode.linkEmbed.isNotEmpty) {
        _initWebPlayer(episode.linkEmbed);
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
      pendingController = ctrl;

      await ctrl.initialize().timeout(const Duration(seconds: 20));
      if (!isCurrent()) return;
      await ctrl.setPlaybackSpeed(_currentSpeed);
      if (!isCurrent()) return;
      await ctrl.setVolume(_volume);
      if (!isCurrent()) return;

      // Check Watch History to Auto-Resume
      final history = await StorageService.getHistoryForMovie(_activeMovie.slug);
      if (!isCurrent()) return;
      int? seekTargetSeconds;
      if (history != null &&
          history.episodeSlug == episode.slug &&
          history.positionSeconds > 15 &&
          history.progressPercentage < 0.95) {
        seekTargetSeconds = history.positionSeconds;
      }

      if (seekTargetSeconds != null) {
        await ctrl.seekTo(Duration(seconds: seekTargetSeconds));
        if (!isCurrent()) return;
        _resumedSeconds = seekTargetSeconds;
        _showResumeBanner = true;
        _resumeBannerTimer?.cancel();
        _resumeBannerTimer = Timer(const Duration(seconds: 4), () {
          if (isCurrent()) setState(() => _showResumeBanner = false);
        });
      }

      await ctrl.play();
      if (!isCurrent()) return;
      ctrl.addListener(_videoListener);

      if (isCurrent()) {
        setState(() {
          _videoPlayerController = ctrl;
          _isPlayerInitializing = false;
        });
        _resetControlsTimer();
      }
    } catch (e) {
      if (!isCurrent()) return;
      debugPrint('Video init failed: $e');
      if (episode.linkEmbed.isNotEmpty) {
        _initWebPlayer(episode.linkEmbed);
      } else {
        if (mounted) {
          setState(() {
            _isPlayerInitializing = false;
            _errorMessage = 'Không thể tải luồng video HLS: $e';
          });
        }
      }
    }
    finally {
      if (pendingController != null && !identical(pendingController, _videoPlayerController)) {
        await pendingController.dispose();
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
    final pos = _isEmbedMode ? _webPosition.inSeconds : (_videoPlayerController?.value.position.inSeconds ?? 0);
    final dur = _isEmbedMode ? _webDuration.inSeconds : (_videoPlayerController?.value.duration.inSeconds ?? 0);
    if (dur > 0 && pos > 5) {
      final episode = _currentEpisode;
      final server = _currentServer;
      await StorageService.saveHistory(WatchHistoryItem(
        movieSlug: _activeMovie.slug,
        movieName: _activeMovie.name,
        posterUrl: _activeMovie.posterUrl,
        thumbUrl: _activeMovie.thumbUrl.isNotEmpty ? _activeMovie.thumbUrl : (_activeMovie.posterUrl.contains('-poster.') ? _activeMovie.posterUrl.replaceAll('-poster.', '-thumb.') : _activeMovie.posterUrl),
        episodeSlug: episode.slug,
        episodeName: episode.name,
        positionSeconds: pos,
        durationSeconds: dur,
        serverName: server.serverName,
        updatedAt: DateTime.now(),
      ));
      await StorageService.markEpisodeWatched(_activeMovie.slug, episode.slug);
      if (mounted) {
        setState(() {
          _watchedSlugs.add(episode.slug);
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
    if (server.episodes.isEmpty) return;
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

  void _seekEmbed(int seconds) {
    _webViewController?.runJavaScript('''
      (function() {
        try {
          if (window.jwplayer) {
            var p = (window.jwplayer && window.jwplayer('ssPlay')) || (window.jwplayer && window.jwplayer());
            if (p && typeof p.seek === 'function') {
              p.seek($seconds);
              return;
            }
          }
          var v = document.querySelector('video');
          if (v) {
            v.currentTime = $seconds;
          }
        } catch (_) {}
      })();
    ''');
  }

  void _toggleEmbedPlayPause() {
    _webViewController?.runJavaScript('''
      (function() {
        try {
          if (window.jwplayer) {
            var p = (window.jwplayer && window.jwplayer('ssPlay')) || (window.jwplayer && window.jwplayer());
            if (p && typeof p.getState === 'function') {
              var s = p.getState();
              if (s === 'playing') p.pause(); else p.play();
              return;
            }
          }
          var v = document.querySelector('video');
          if (v) {
            if (v.paused) v.play(); else v.pause();
          }
        } catch (_) {}
      })();
    ''');
    setState(() {
      _webIsPlaying = !_webIsPlaying;
    });
  }

  void _setAudioTrack(String trackKey) async {
    setState(() => _currentAudioTrack = trackKey);
    if (_isEmbedMode) {
      _webViewController?.runJavaScript('''
        (function() {
          try {
            if (typeof switchAudio === 'function') {
              switchAudio('$trackKey');
              return;
            }
            if (window.jwplayer) {
              var p = (window.jwplayer && window.jwplayer('ssPlay')) || (window.jwplayer && window.jwplayer());
              if (p && typeof p.getAudioTracks === 'function') {
                var tracks = p.getAudioTracks() || [];
                for (var i = 0; i < tracks.length; i++) {
                  var t = (tracks[i].name || '').toLowerCase();
                  if ('$trackKey' === 'female' && (t.includes('nữ') || t.includes('female'))) { p.setCurrentAudioTrack(i); break; }
                  if ('$trackKey' === 'male' && (t.includes('nam') || t.includes('male') || t.includes('lồng tiếng'))) { p.setCurrentAudioTrack(i); break; }
                  if ('$trackKey' === 'original' && (t.includes('gốc') || t.includes('original'))) { p.setCurrentAudioTrack(i); break; }
                }
              }
            }
          } catch (_) {}
        })();
      ''');
      return;
    }

    final vid = _extractVicdnId(_currentEpisode.linkM3u8.isNotEmpty ? _currentEpisode.linkM3u8 : _currentEpisode.linkEmbed);
    if (vid != null && vid.isNotEmpty && _videoPlayerController != null) {
      final currentPos = _videoPlayerController!.value.position;
      final wasPlaying = _videoPlayerController!.value.isPlaying;
      final newStreamUrl = 'https://cineviet.live/api/stream/vicdn/$vid/$trackKey.m3u8';

      final previous = _videoPlayerController;
      _videoPlayerController = null;
      previous?.removeListener(_videoListener);
      await previous?.dispose();

      try {
        final newCtrl = VideoPlayerController.networkUrl(
          Uri.parse(newStreamUrl),
          httpHeaders: const {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://cineviet.live/',
          },
        );
        await newCtrl.initialize();
        if (mounted) {
          setState(() {
            _videoPlayerController = newCtrl;
          });
          newCtrl.addListener(_videoListener);
          await newCtrl.seekTo(currentPos);
          if (wasPlaying) await newCtrl.play();
        }
      } catch (e) {
        debugPrint('Audio track switch error: $e');
      }
    }
  }

  void _setSubMode(String modeKey) {
    setState(() => _currentSubMode = modeKey);
    _webViewController?.runJavaScript('''
      (function() {
        try {
          if (typeof subMode !== 'undefined') {
            subMode = '$modeKey';
            try {
              if (typeof LS !== 'undefined' && typeof VIDEO_ID !== 'undefined') {
                LS.set('vp_submode_' + VIDEO_ID, '$modeKey');
              }
            } catch (_) {}
            var viEl = (typeof getViEl === 'function') ? getViEl() : document.getElementById('sub-vi-overlay');
            var enEl = (typeof getEnEl === 'function') ? getEnEl() : document.getElementById('sub-en-overlay');
            if (viEl && '$modeKey' === 'off') { viEl.style.display = 'none'; viEl.textContent = ''; }
            if (enEl && '$modeKey' === 'off') { enEl.style.display = 'none'; enEl.textContent = ''; }
            if (typeof applyViStyle === 'function') applyViStyle();
            if (typeof applyEnStyle === 'function') applyEnStyle();
            return;
          }
          if (window.jwplayer) {
            var p = (window.jwplayer && window.jwplayer('ssPlay')) || (window.jwplayer && window.jwplayer());
            if (p && typeof p.setCaptions === 'function') {
              if ('$modeKey' === 'off') {
                p.setCurrentCaptions(0);
              } else {
                p.setCurrentCaptions(1);
              }
            }
          }
        } catch (_) {}
      })();
    ''');
  }

  void _seekRelative(int seconds) {
    if (_isEmbedMode) {
      final cur = _webPosition;
      final dur = _webDuration;
      var target = cur + Duration(seconds: seconds);
      if (target < Duration.zero) target = Duration.zero;
      if (dur > Duration.zero && target > dur) target = dur;
      _seekEmbed(target.inSeconds);
      setState(() => _webPosition = target);
      _resetControlsTimer();
      HapticFeedback.lightImpact();
      return;
    }
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
      // Synchronize with System Screen Brightness Hardware
      final newBrightness = (_brightness + delta).clamp(0.05, 1.0);
      setState(() {
        _brightness = newBrightness;
        _showBrightnessHud = true;
      });
      try {
        ScreenBrightness.instance.setApplicationScreenBrightness(newBrightness);
      } catch (_) {}
    } else {
      // Synchronize with System Media Audio Volume Hardware
      final newVolume = (_volume + delta).clamp(0.0, 1.0);
      setState(() {
        _volume = newVolume;
        _showVolumeHud = true;
      });
      try {
        VolumeController.instance.showSystemUI = false;
        VolumeController.instance.setVolume(newVolume);
      } catch (_) {}
      _videoPlayerController?.setVolume(newVolume);
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

  void _handleHorizontalDragStart(DragStartDetails details) {
    if (_isScreenLocked) return;
    if (_isEmbedMode) {
      if (_webDuration <= Duration.zero) return;
      _hideControlsTimer?.cancel();
      _isSwipingSeek = true;
      _swipeSeekStartPosition = _webPosition;
      _swipeSeekTargetPosition = _webPosition;
      _swipeSeekDeltaSeconds = 0;
      _swipeSeekAccumulatedDx = 0.0;
      _lastHapticDelta = 0;
      setState(() {});
      return;
    }
    if (_videoPlayerController == null || !_videoPlayerController!.value.isInitialized) {
      return;
    }
    _hideControlsTimer?.cancel();
    _isSwipingSeek = true;
    _swipeSeekStartPosition = _videoPlayerController!.value.position;
    _swipeSeekTargetPosition = _swipeSeekStartPosition;
    _swipeSeekDeltaSeconds = 0;
    _swipeSeekAccumulatedDx = 0.0;
    _lastHapticDelta = 0;
    setState(() {});
  }

  void _handleHorizontalDragUpdate(DragUpdateDetails details, double screenWidth) {
    if (!_isSwipingSeek) return;
    final totalDuration = _isEmbedMode ? _webDuration : (_videoPlayerController?.value.duration ?? Duration.zero);
    if (totalDuration <= Duration.zero) return;

    _swipeSeekAccumulatedDx += details.primaryDelta ?? 0.0;

    // Adaptive seek window based on video duration
    final screenFraction = _swipeSeekAccumulatedDx / screenWidth;
    final maxSeekWindow = (totalDuration.inSeconds * 0.15).clamp(90.0, 600.0);
    final deltaSeconds = (screenFraction * maxSeekWindow).round();

    final targetMillis = (_swipeSeekStartPosition.inMilliseconds + (deltaSeconds * 1000))
        .clamp(0, totalDuration.inMilliseconds);
    final newTarget = Duration(milliseconds: targetMillis);
    final newDelta = (newTarget - _swipeSeekStartPosition).inSeconds;

    if ((newDelta - _lastHapticDelta).abs() >= 10) {
      _lastHapticDelta = newDelta;
      HapticFeedback.selectionClick();
    }

    setState(() {
      _swipeSeekTargetPosition = newTarget;
      _swipeSeekDeltaSeconds = newDelta;
    });
  }

  void _handleHorizontalDragEnd(DragEndDetails details) {
    if (!_isSwipingSeek) return;
    _isSwipingSeek = false;
    if (_isEmbedMode) {
      _seekEmbed(_swipeSeekTargetPosition.inSeconds);
      setState(() => _webPosition = _swipeSeekTargetPosition);
      HapticFeedback.mediumImpact();
      _resetControlsTimer();
      return;
    }
    if (_videoPlayerController != null && _videoPlayerController!.value.isInitialized) {
      _videoPlayerController!.seekTo(_swipeSeekTargetPosition);
      HapticFeedback.mediumImpact();
    }
    _resetControlsTimer();
    setState(() {});
  }

  void _handleHorizontalDragCancel() {
    if (!_isSwipingSeek) return;
    _isSwipingSeek = false;
    _resetControlsTimer();
    setState(() {});
  }

  Widget _buildSwipeSeekHud() {
    final totalDuration = _videoPlayerController?.value.duration ?? Duration.zero;
    final isForward = _swipeSeekDeltaSeconds >= 0;
    final deltaMinutes = (_swipeSeekDeltaSeconds.abs() / 60).floor();
    final deltaRemainingSeconds = _swipeSeekDeltaSeconds.abs() % 60;
    final deltaFormatted = deltaMinutes > 0
        ? '${isForward ? '+' : '-'}${deltaMinutes}m${deltaRemainingSeconds.toString().padLeft(2, '0')}s'
        : '${isForward ? '+' : '-'}${deltaRemainingSeconds}s';

    final progressRatio = totalDuration.inMilliseconds > 0
        ? (_swipeSeekTargetPosition.inMilliseconds / totalDuration.inMilliseconds).clamp(0.0, 1.0)
        : 0.0;

    return Center(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 32),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.85),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isForward ? const Color(0xFF10B981).withOpacity(0.6) : AppTheme.gold.withOpacity(0.6),
            width: 1.5,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.6),
              blurRadius: 20,
              spreadRadius: 4,
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Direction & Delta badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(
                color: (isForward ? const Color(0xFF10B981) : AppTheme.gold).withOpacity(0.18),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    isForward ? Icons.fast_forward_rounded : Icons.fast_rewind_rounded,
                    color: isForward ? const Color(0xFF10B981) : AppTheme.gold,
                    size: 20,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    deltaFormatted,
                    style: TextStyle(
                      color: isForward ? const Color(0xFF10B981) : AppTheme.gold,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Time comparison
            Row(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(
                  _formatDuration(_swipeSeekTargetPosition),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    fontFamily: 'monospace',
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '/ ${_formatDuration(totalDuration)}',
                  style: const TextStyle(
                    color: Colors.white60,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // Progress Bar
            SizedBox(
              width: 200,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(
                  value: progressRatio,
                  minHeight: 5,
                  backgroundColor: Colors.white24,
                  valueColor: AlwaysStoppedAnimation<Color>(
                    isForward ? const Color(0xFF10B981) : AppTheme.gold,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final orientation = MediaQuery.of(context).orientation;
    final isLandscape = orientation == Orientation.landscape || _isFullScreen;
    final size = MediaQuery.of(context).size;

    return PopScope(
      canPop: !_isFullScreen,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) {
          if (_isFullScreen) {
            _toggleFullScreen();
          } else {
            _handleExitPlayer();
          }
        }
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: isLandscape
            ? SizedBox.expand(
                child: _buildPlayerContainer(isLandscape: true),
              )
            : SafeArea(
                top: true,
                bottom: true,
                left: false,
                right: false,
                child: Column(
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
              WebViewWidget(
                key: _webViewKey,
                controller: _webViewController!,
                gestureRecognizers: const <Factory<OneSequenceGestureRecognizer>>{},
              )
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
                      'Đang tải luồng phát...',
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

            // 3. GESTURE DETECTOR FOR TAP, DOUBLE-TAP & VERTICAL/HORIZONTAL SWIPES
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
                  onHorizontalDragStart: _handleHorizontalDragStart,
                  onHorizontalDragUpdate: (details) => _handleHorizontalDragUpdate(details, screenWidth),
                  onHorizontalDragEnd: _handleHorizontalDragEnd,
                  onHorizontalDragCancel: _handleHorizontalDragCancel,
                ),
              ),

            // 4. DOUBLE-TAP RIPPLE HUDS
            if (!_isEmbedMode && _showSeekLeftRipple)
              Positioned(
                left: 0,
                top: 0,
                bottom: 0,
                width: screenWidth * 0.45,
                child: _buildSeekRipple(isForward: false),
              ),
            if (!_isEmbedMode && _showSeekRightRipple)
              Positioned(
                right: 0,
                top: 0,
                bottom: 0,
                width: screenWidth * 0.45,
                child: _buildSeekRipple(isForward: true),
              ),

            // 5. BRIGHTNESS HUD (Left)
            if (!_isEmbedMode && _showBrightnessHud)
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
            if (!_isEmbedMode && _showVolumeHud)
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

            // 6.5. HORIZONTAL SWIPE SEEK HUD
            if (!_isEmbedMode && _isSwipingSeek)
              Positioned.fill(
                child: IgnorePointer(
                  child: _buildSwipeSeekHud(),
                ),
              ),

            // 7. UNOBTRUSIVE FLOATING LOCK PILL (Never blocking center!)
            if (!_isEmbedMode && _isScreenLocked && _showLockPill)
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
            if (!_isScreenLocked && !_isEmbedMode && _showControls && !_isSwipingSeek)
              _buildNetflixOverlayControls(isLandscape),

            // 11. EMBED MODE FLOATING TOOLBAR
            if (_isEmbedMode)
              _buildEmbedFloatingControls(isLandscape),
          ],
        );
      },
    );
  }

  Widget _buildEmbedFloatingControls(bool isLandscape) {
    final padding = MediaQuery.of(context).padding;
    final safeLeft = isLandscape ? (padding.left > 0 ? padding.left + 8 : 16.0) : 10.0;
    final safeRight = isLandscape ? (padding.right > 0 ? padding.right + 8 : 16.0) : 10.0;
    final safeTop = isLandscape ? (padding.top > 0 ? padding.top + 8 : 16.0) : 10.0;

    return Positioned(
      top: safeTop,
      left: safeLeft,
      right: safeRight,
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
              onPressed: _handleExitPlayer,
            ),
          ),
          Container(
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
        ],
      ),
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
    final isPlaying = _isEmbedMode ? _webIsPlaying : (_videoPlayerController?.value.isPlaying ?? false);
    final pos = _isEmbedMode ? _webPosition : (_videoPlayerController?.value.position ?? Duration.zero);
    final dur = _isEmbedMode ? _webDuration : (_videoPlayerController?.value.duration ?? Duration.zero);

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
            padding: EdgeInsets.only(
              left: isLandscape ? (MediaQuery.of(context).padding.left > 0 ? MediaQuery.of(context).padding.left + 8 : 14) : 14,
              right: isLandscape ? (MediaQuery.of(context).padding.right > 0 ? MediaQuery.of(context).padding.right + 8 : 14) : 14,
              top: isLandscape ? (MediaQuery.of(context).padding.top > 0 ? MediaQuery.of(context).padding.top + 4 : 8) : 8,
              bottom: 8,
            ),
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
                  onPressed: _handleExitPlayer,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _activeMovie.name,
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

                // Reload button in embed mode
                if (_isEmbedMode)
                  IconButton(
                    icon: const Icon(Icons.refresh_rounded, color: Colors.white, size: 20),
                    tooltip: 'Tải lại video',
                    onPressed: () => _initWebPlayer(_currentEpisode.linkEmbed),
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
                  HapticFeedback.lightImpact();
                  if (_isEmbedMode) {
                    _toggleEmbedPlayPause();
                  } else {
                    if (isPlaying) {
                      _videoPlayerController?.pause();
                    } else {
                      _videoPlayerController?.play();
                    }
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
            padding: EdgeInsets.only(
              left: isLandscape ? (MediaQuery.of(context).padding.left > 0 ? MediaQuery.of(context).padding.left + 8 : 16) : 16,
              right: isLandscape ? (MediaQuery.of(context).padding.right > 0 ? MediaQuery.of(context).padding.right + 8 : 16) : 16,
              bottom: isLandscape ? (MediaQuery.of(context).padding.bottom > 0 ? MediaQuery.of(context).padding.bottom + 4 : 10) : 10,
              top: 10,
            ),
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
                              : pos.inSeconds.toDouble().clamp(0.0, dur.inSeconds > 0 ? dur.inSeconds.toDouble() : 1.0),
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
                            if (_isEmbedMode) {
                              _seekEmbed(val.toInt());
                              setState(() => _webPosition = Duration(seconds: val.toInt()));
                            } else {
                              _videoPlayerController?.seekTo(Duration(seconds: val.toInt()));
                            }
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
                    Expanded(
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
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
                              style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6)),
                              icon: const Icon(Icons.video_library_rounded, color: Colors.white, size: 18),
                              label: const Text('Danh Sách Tập', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                            ),
                          ],
                        ),
                      ),
                    ),

                    // Fullscreen Toggle
                    IconButton(
                      icon: Icon(
                        isLandscape ? Icons.fullscreen_exit_rounded : Icons.fullscreen_rounded,
                        color: Colors.white,
                        size: 26,
                      ),
                      tooltip: isLandscape ? 'Thoát toàn màn hình' : 'Toàn màn hình',
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

  void _showAudioAndSongNguModal() {
    _hideControlsTimer?.cancel();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF141722),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final isSongNgu = _currentServer.serverName.toLowerCase().contains('song ngữ') ||
                _currentEpisode.linkEmbed.contains('vicdn') ||
                _currentEpisode.linkM3u8.contains('/vicdn/') ||
                (_activeMovie.hasSongNgu && (_currentEpisode.linkEmbed.contains('vicdn') || _currentEpisode.linkM3u8.contains('vicdn')));
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.85,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Header
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Row(
                          children: [
                            Icon(Icons.record_voice_over_rounded, color: AppTheme.gold, size: 22),
                            SizedBox(width: 10),
                            Text(
                              'Âm Thanh & Song Ngữ',
                              style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                        IconButton(
                          icon: const Icon(Icons.close_rounded, color: Colors.white70),
                          onPressed: () => Navigator.pop(ctx),
                        ),
                      ],
                    ),
                    const Divider(color: Colors.white12, height: 20),

                    // Section 1: Audio / Giọng đọc (if Song Ngu)
                    if (isSongNgu) ...[
                      const Text(
                        'GIỌNG ĐỌC / AUDIO (SONG NGỮ)',
                        style: TextStyle(color: AppTheme.gold, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                      ),
                      const SizedBox(height: 8),
                      _buildAudioTrackOption(
                        label: 'Audio Gốc (Nguyên Bản)',
                        sublabel: 'Âm thanh diễn viên gốc',
                        trackKey: 'original',
                        setModalState: setModalState,
                      ),
                      _buildAudioTrackOption(
                        label: 'Thuyết Minh Nữ',
                        sublabel: 'Giọng đọc nữ truyền cảm',
                        trackKey: 'female',
                        setModalState: setModalState,
                      ),
                      _buildAudioTrackOption(
                        label: 'Thuyết Minh Nam / Lồng Tiếng',
                        sublabel: 'Giọng đọc nam rõ ràng',
                        trackKey: 'male',
                        setModalState: setModalState,
                      ),
                      const SizedBox(height: 16),

                      // Section 2: Subtitle mode (if Song Ngu)
                      const Text(
                        'CHẾ ĐỘ PHỤ ĐỀ',
                        style: TextStyle(color: AppTheme.cyan, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                      ),
                      const SizedBox(height: 8),
                      _buildSubModeOption(
                        label: 'Song Ngữ (Việt + Anh)',
                        sublabel: 'Hiển thị cả phụ đề tiếng Việt và tiếng Anh đồng thời',
                        modeKey: 'bilingual',
                        setModalState: setModalState,
                      ),
                      _buildSubModeOption(
                        label: 'Phụ Đề Tiếng Việt',
                        sublabel: 'Chỉ hiển thị phụ đề tiếng Việt',
                        modeKey: 'vi',
                        setModalState: setModalState,
                      ),
                      _buildSubModeOption(
                        label: 'Phụ Đề Tiếng Anh (English)',
                        sublabel: 'English subtitles only',
                        modeKey: 'en',
                        setModalState: setModalState,
                      ),
                      _buildSubModeOption(
                        label: 'Tắt Phụ Đề',
                        sublabel: 'Ẩn phụ đề trên màn hình',
                        modeKey: 'off',
                        setModalState: setModalState,
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Section 3: Server selection
                    const Text(
                      'CHUYỂN NGUỒN PHÁT (SERVER)',
                      style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                    ),
                    const SizedBox(height: 8),
                    ..._activeServers.map((s) {
                      final isCurrent = s.serverName == _currentServer.serverName;
                      final isSN = s.serverName.toLowerCase().contains('song ngữ');
                      return Container(
                        margin: const EdgeInsets.only(bottom: 6),
                        decoration: BoxDecoration(
                          color: isCurrent ? AppTheme.primary.withOpacity(0.15) : Colors.white.withOpacity(0.04),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: isCurrent ? AppTheme.primary : (isSN ? AppTheme.gold.withOpacity(0.3) : Colors.transparent),
                            width: 1,
                          ),
                        ),
                        child: ListTile(
                          dense: true,
                          title: Text(
                            s.serverName,
                            style: TextStyle(
                              color: isCurrent ? AppTheme.primaryLight : Colors.white,
                              fontWeight: isCurrent ? FontWeight.bold : FontWeight.w500,
                            ),
                          ),
                          subtitle: isSN
                              ? const Text(
                                  'Đa Giọng (Audio Gốc + Thuyết Minh Nam/Nữ) & Song Ngữ',
                                  style: TextStyle(color: AppTheme.gold, fontSize: 11),
                                )
                              : null,
                          leading: Icon(
                            isSN ? Icons.translate_rounded : Icons.dns_rounded,
                            color: isCurrent ? AppTheme.primary : (isSN ? AppTheme.gold : Colors.white54),
                          ),
                          trailing: isCurrent ? const Icon(Icons.check_circle_rounded, color: AppTheme.primary) : null,
                          onTap: () {
                            Navigator.pop(ctx);
                            _switchServer(s);
                          },
                        ),
                      );
                    }),
                  ],
                ),
              ),
            );
          },
        );
      },
    ).then((_) => _resetControlsTimer());
  }

  Widget _buildAudioTrackOption({
    required String label,
    required String sublabel,
    required String trackKey,
    required StateSetter setModalState,
  }) {
    final isSelected = _currentAudioTrack == trackKey;
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(
        color: isSelected ? AppTheme.gold.withOpacity(0.15) : Colors.white.withOpacity(0.04),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isSelected ? AppTheme.gold : Colors.transparent,
          width: 1,
        ),
      ),
      child: ListTile(
        dense: true,
        title: Text(
          label,
          style: TextStyle(
            color: isSelected ? AppTheme.gold : Colors.white,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
          ),
        ),
        subtitle: Text(sublabel, style: const TextStyle(color: Colors.white54, fontSize: 11)),
        leading: Icon(
          Icons.audiotrack_rounded,
          color: isSelected ? AppTheme.gold : Colors.white54,
        ),
        trailing: isSelected ? const Icon(Icons.check_circle_rounded, color: AppTheme.gold) : null,
        onTap: () {
          _setAudioTrack(trackKey);
          setModalState(() {});
          HapticFeedback.lightImpact();
        },
      ),
    );
  }

  Widget _buildSubModeOption({
    required String label,
    required String sublabel,
    required String modeKey,
    required StateSetter setModalState,
  }) {
    final isSelected = _currentSubMode == modeKey;
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(
        color: isSelected ? AppTheme.cyan.withOpacity(0.15) : Colors.white.withOpacity(0.04),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: isSelected ? AppTheme.cyan : Colors.transparent,
          width: 1,
        ),
      ),
      child: ListTile(
        dense: true,
        title: Text(
          label,
          style: TextStyle(
            color: isSelected ? AppTheme.cyan : Colors.white,
            fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
          ),
        ),
        subtitle: Text(sublabel, style: const TextStyle(color: Colors.white54, fontSize: 11)),
        leading: Icon(
          Icons.subtitles_rounded,
          color: isSelected ? AppTheme.cyan : Colors.white54,
        ),
        trailing: isSelected ? const Icon(Icons.check_circle_rounded, color: AppTheme.cyan) : null,
        onTap: () {
          _setSubMode(modeKey);
          setModalState(() {});
          HapticFeedback.lightImpact();
        },
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
    final movie = _activeMovie;

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
                icon: _isFavorite ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                label: _isFavorite ? 'Đã Thích' : 'Yêu Thích',
                color: _isFavorite ? Colors.redAccent : Colors.white70,
                onTap: () async {
                  final token = await StorageService.getToken();
                  if (token == null) {
                    if (!mounted) return;
                    ScaffoldMessenger.of(context).hideCurrentSnackBar();
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: const Text('Vui lòng đăng nhập để lưu phim vào danh sách yêu thích.'),
                        backgroundColor: AppTheme.surface,
                        action: SnackBarAction(
                          label: 'Đăng nhập',
                          textColor: AppTheme.primaryLight,
                          onPressed: () {
                            Navigator.push(context, MaterialPageRoute(builder: (_) => const LoginScreen()));
                          },
                        ),
                        duration: const Duration(seconds: 4),
                      ),
                    );
                    return;
                  }
                  try {
                    final newState = await StorageService.toggleFavorite(_activeMovie);
                    if (mounted) setState(() => _isFavorite = newState);
                  } catch (error) {
                    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
                  }
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

        // Multi-Season Selector (if series has > 1 seasons)
        if (_seasons.length > 1) ...[
          GestureDetector(
            onTap: _showSeasonSelector,
            child: Container(
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: AppTheme.card,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppTheme.primary.withOpacity(0.5), width: 1),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.layers_rounded, color: AppTheme.primary, size: 18),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      _getCurrentSeasonLabel(),
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 6),
                  const Icon(Icons.expand_more_rounded, color: AppTheme.textSecondary, size: 18),
                ],
              ),
            ),
          ),
        ],

        // Server Selection
        const Text(
          'Nguồn Phát (Server)',
          style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: _activeServers.map((s) {
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
    int modalChunkTab = _selectedEpisodeTab;
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF141722),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (modalContext, setModalState) {
          final totalEpisodes = _currentServer.episodes.length;
          final totalChunks = (totalEpisodes / _episodesPerPage).ceil();
          final currentChunk = modalChunkTab.clamp(0, totalChunks > 0 ? totalChunks - 1 : 0);
          final chunkStart = currentChunk * _episodesPerPage;
          final chunkEnd = (chunkStart + _episodesPerPage > totalEpisodes)
              ? totalEpisodes
              : chunkStart + _episodesPerPage;
          final displayedEpisodes = totalEpisodes > 0
              ? _currentServer.episodes.sublist(chunkStart, chunkEnd)
              : <EpisodeItem>[];

          return Container(
            height: MediaQuery.of(context).size.height * 0.75,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: Colors.white24,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'Danh Sách Tập Phim',
                      style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, color: AppTheme.textMuted, size: 20),
                      onPressed: () => Navigator.pop(ctx),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ),
                const SizedBox(height: 10),

                // Multi-Season Selector (if franchise has > 1 seasons)
                if (_seasons.length > 1) ...[
                  GestureDetector(
                    onTap: () {
                      Navigator.pop(ctx);
                      _showSeasonSelector();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: AppTheme.card,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppTheme.primary.withOpacity(0.5), width: 1),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.layers_rounded, color: AppTheme.primary, size: 16),
                          const SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              _getCurrentSeasonLabel(),
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          const SizedBox(width: 6),
                          const Icon(Icons.expand_more_rounded, color: AppTheme.textSecondary, size: 18),
                        ],
                      ),
                    ),
                  ),
                ],

                // Episode Chunk Tabs (when server has > 25 episodes)
                if (totalChunks > 1) ...[
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    physics: const BouncingScrollPhysics(),
                    child: Row(
                      children: List.generate(totalChunks, (chunkIdx) {
                        final start = chunkIdx * _episodesPerPage + 1;
                        final end = (chunkIdx + 1) * _episodesPerPage > totalEpisodes
                            ? totalEpisodes
                            : (chunkIdx + 1) * _episodesPerPage;
                        final isSel = chunkIdx == currentChunk;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8, bottom: 10),
                          child: ChoiceChip(
                            label: Text('Tập $start - $end'),
                            selected: isSel,
                            selectedColor: AppTheme.primary,
                            backgroundColor: AppTheme.card,
                            labelStyle: TextStyle(
                              color: isSel ? Colors.white : AppTheme.textSecondary,
                              fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                              fontSize: 12,
                            ),
                            onSelected: (_) {
                              setModalState(() {
                                modalChunkTab = chunkIdx;
                                _selectedEpisodeTab = chunkIdx;
                              });
                            },
                          ),
                        );
                      }),
                    ),
                  ),
                ],

                // Grid of Episodes
                Expanded(
                  child: GridView.builder(
                    physics: const BouncingScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 5,
                      childAspectRatio: 2.0,
                      crossAxisSpacing: 8,
                      mainAxisSpacing: 8,
                    ),
                    itemCount: displayedEpisodes.length,
                    itemBuilder: (context, idx) {
                      final ep = displayedEpisodes[idx];
                      final isCurrent = ep.slug == _currentEpisode.slug;
                      final isWatched = _watchedSlugs.contains(ep.slug);

                      return ElevatedButton(
                        onPressed: () {
                          Navigator.pop(ctx);
                          _switchEpisode(ep);
                        },
                        style: ElevatedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          backgroundColor: isCurrent ? AppTheme.primary : AppTheme.card,
                          side: isCurrent
                              ? const BorderSide(color: Colors.white, width: 1.2)
                              : (isWatched ? BorderSide(color: AppTheme.primary.withOpacity(0.3), width: 1) : null),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            if (isCurrent)
                              const Padding(
                                padding: EdgeInsets.only(right: 3),
                                child: Icon(Icons.play_arrow_rounded, color: Colors.white, size: 14),
                              ),
                            Flexible(
                              child: Text(
                                ep.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: isCurrent ? Colors.white : (isWatched ? AppTheme.textSecondary : Colors.white),
                                  fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          );
        },
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
            ..._activeServers.map((s) {
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
              if (_isEmbedMode) {
                _webViewController?.runJavaScript('''
                  (function() {
                    try {
                      if (window.jwplayer) {
                        var p = (window.jwplayer && window.jwplayer('ssPlay')) || (window.jwplayer && window.jwplayer());
                        if (p && typeof p.setPlaybackRate === 'function') p.setPlaybackRate($s);
                      }
                      var v = document.querySelector('video');
                      if (v) v.playbackRate = $s;
                    } catch (_) {}
                  })();
                ''');
              } else {
                _videoPlayerController?.setPlaybackSpeed(s);
              }
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
