import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import 'package:chewie/chewie.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';
import '../models/movie.dart';
import '../models/movie_detail.dart';
import '../services/storage_service.dart';
import '../theme/app_theme.dart';

enum VideoFitMode {
  original, // 16:9 or native aspect ratio
  fill,     // Zoom to fill screen (crops horizontal black bars)
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

class _PlayerScreenState extends State<PlayerScreen> {
  late ServerItem _currentServer;
  late EpisodeItem _currentEpisode;

  // Native HLS Player Controllers
  VideoPlayerController? _videoPlayerController;
  ChewieController? _chewieController;

  // In-App Web Embed Player Controller
  WebViewController? _webViewController;
  bool _isEmbedMode = false;
  bool _isWebLoading = false;
  bool _useDirectEmbedUrl = false;

  bool _isPlayerInitializing = true;
  String? _errorMessage;

  // Fullscreen Landscape State
  bool _isFullScreen = false;

  // History & Timers
  Timer? _historyTimer;
  Timer? _sleepTimer;
  Timer? _sleepTicker;
  int _sleepRemainingSeconds = 0;
  int? _sleepSelectedMinutes;

  // Auto-play Next Episode
  bool _isAutoPlayEnabled = true;
  bool _isShowingNextEpisodePrompt = false;
  int _nextEpisodeCountdown = 5;
  Timer? _nextEpisodeTimer;
  EpisodeItem? _nextEpisode;

  // Auto-Resume
  bool _showResumeBanner = false;
  int _resumedSeconds = 0;
  Timer? _resumeBannerTimer;

  // Screen Lock & Speed & Fit
  bool _isScreenLocked = false;
  double _currentSpeed = 1.0;
  VideoFitMode _fitMode = VideoFitMode.original;

  // Favorites & Watched Tracking
  bool _isFavorite = false;
  Set<String> _watchedSlugs = {};

  // Episode Pagination / Filter
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

  /// Toggle Fullscreen Landscape Mode
  void _toggleFullScreen() {
    setState(() {
      _isFullScreen = !_isFullScreen;
    });

    if (_isFullScreen) {
      // Force Landscape and Hide System Bars
      SystemChrome.setPreferredOrientations([
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
      SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    } else {
      // Restore Portrait and Show System Bars
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

  /// Build full-window HTML wrapper for third-party iframe embed player
  String _buildIframeHtml(String embedUrl) {
    return '''
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100vw;
      height: 100vh;
      background-color: #000;
      overflow: hidden;
    }
    #player-frame {
      width: 100vw;
      height: 100vh;
      border: 0;
      display: block;
      position: absolute;
      top: 0;
      left: 0;
    }
  </style>
</head>
<body>
  <iframe
    id="player-frame"
    src="$embedUrl"
    frameborder="0"
    scrolling="no"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
    allowfullscreen
    webkitallowfullscreen
    mozallowfullscreen>
  </iframe>
</body>
</html>
''';
  }

  /// Launch In-App Web Embed Player with full media permissions and fallback
  void _initWebPlayer(String embedUrl) {
    _disposeControllers();

    setState(() {
      _isEmbedMode = true;
      _isPlayerInitializing = false;
      _isWebLoading = true;
      _errorMessage = null;
    });

    try {
      // Platform-specific configuration for media & inline playback
      late final PlatformWebViewControllerCreationParams params;
      if (WebViewPlatform.instance is WebKitWebViewPlatform) {
        params = WebKitWebViewControllerCreationParams(
          allowsInlineMediaPlayback: true,
        );
      } else if (WebViewPlatform.instance is AndroidWebViewPlatform) {
        params = AndroidWebViewControllerCreationParams();
      } else {
        params = const PlatformWebViewControllerCreationParams();
      }

      final controller = WebViewController.fromPlatformCreationParams(params);

      // Disable user gesture requirement on Android so media plays smoothly
      if (controller.platform is AndroidWebViewController) {
        (controller.platform as AndroidWebViewController)
            .setMediaPlaybackRequiresUserGesture(false);
      }

      controller
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(Colors.black)
        ..setUserAgent(
          'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        )
        ..setNavigationDelegate(
          NavigationDelegate(
            onPageStarted: (url) {
              if (mounted) setState(() => _isWebLoading = true);
            },
            onPageFinished: (url) {
              if (mounted) setState(() => _isWebLoading = false);
            },
            onWebResourceError: (error) {
              debugPrint('Web resource error: ${error.description}');
            },
          ),
        );

      if (_useDirectEmbedUrl) {
        controller.loadRequest(
          Uri.parse(embedUrl),
          headers: const {
            'Referer': 'https://phimapi.com/',
            'User-Agent':
                'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
          },
        );
      } else {
        controller.loadHtmlString(
          _buildIframeHtml(embedUrl),
          baseUrl: 'https://phimapi.com/',
        );
      }

      _webViewController = controller;
    } catch (e) {
      if (mounted) {
        setState(() {
          _isWebLoading = false;
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
      _isShowingNextEpisodePrompt = false;
    });

    _nextEpisodeTimer?.cancel();
    await _disposeControllers();

    // 1. If user explicitly chooses In-App Web Embed
    if (forceEmbed) {
      if (_currentEpisode.linkEmbed.isNotEmpty) {
        _initWebPlayer(_currentEpisode.linkEmbed);
        return;
      }
    }

    // 2. Resolve stream URL: Direct HLS or extracted from embed
    String streamUrl = _currentEpisode.linkM3u8.trim();
    if (streamUrl.isEmpty && _currentEpisode.linkEmbed.isNotEmpty) {
      final extracted = _extractM3u8FromEmbed(_currentEpisode.linkEmbed);
      if (extracted != null && extracted.isNotEmpty) {
        streamUrl = extracted;
      }
    }

    // 3. If NO direct HLS exists at all, automatically start In-App Web Embed Player!
    if (streamUrl.isEmpty) {
      if (_currentEpisode.linkEmbed.isNotEmpty) {
        _initWebPlayer(_currentEpisode.linkEmbed);
        return;
      } else {
        setState(() {
          _isPlayerInitializing = false;
          _errorMessage = 'Tập này hiện chưa có luồng phát hoặc liên kết nhúng khả dụng.';
        });
        return;
      }
    }

    // 4. Play with native high-performance HLS player
    _isEmbedMode = false;

    try {
      _videoPlayerController = VideoPlayerController.networkUrl(
        Uri.parse(streamUrl),
        httpHeaders: const {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://phimapi.com/',
        },
      );

      await _videoPlayerController!.initialize();
      await _videoPlayerController!.setPlaybackSpeed(_currentSpeed);

      // Check Watch History to Auto-Resume
      final history = await StorageService.getHistoryForMovie(widget.movie.slug);
      int? seekTargetSeconds;
      if (history != null &&
          history.episodeSlug == _currentEpisode.slug &&
          history.positionSeconds > 15 &&
          history.progressPercentage < 0.95) {
        seekTargetSeconds = history.positionSeconds;
      }

      final videoRatio = _videoPlayerController!.value.aspectRatio > 0
          ? _videoPlayerController!.value.aspectRatio
          : 16 / 9;

      _chewieController = ChewieController(
        videoPlayerController: _videoPlayerController!,
        autoPlay: true,
        looping: false,
        aspectRatio: _getEffectiveAspectRatio(videoRatio),
        allowFullScreen: true,
        allowMuting: true,
        showControls: true,
        zoomAndPan: true,
        playbackSpeeds: const [0.5, 0.75, 1.0, 1.25, 1.5, 2.0],
        deviceOrientationsOnEnterFullScreen: const [
          DeviceOrientation.landscapeLeft,
          DeviceOrientation.landscapeRight,
        ],
        deviceOrientationsAfterFullScreen: const [
          DeviceOrientation.portraitUp,
        ],
        materialProgressColors: ChewieProgressColors(
          playedColor: AppTheme.primary,
          handleColor: AppTheme.primaryLight,
          backgroundColor: Colors.white24,
          bufferedColor: Colors.white38,
        ),
        cupertinoProgressColors: ChewieProgressColors(
          playedColor: AppTheme.primary,
          handleColor: AppTheme.primaryLight,
          backgroundColor: Colors.white24,
          bufferedColor: Colors.white38,
        ),
        errorBuilder: (context, errorMsg) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline, color: AppTheme.primary, size: 44),
                  const SizedBox(height: 10),
                  const Text(
                    'Không thể tải luồng video trực tiếp.',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ElevatedButton(
                        onPressed: () => _initPlayer(),
                        style: ElevatedButton.styleFrom(backgroundColor: AppTheme.card),
                        child: const Text('Thử Lại', style: TextStyle(color: Colors.white)),
                      ),
                      if (_currentEpisode.linkEmbed.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        ElevatedButton.icon(
                          onPressed: () => _initWebPlayer(_currentEpisode.linkEmbed),
                          style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
                          icon: const Icon(Icons.play_circle_filled, color: Colors.white, size: 16),
                          label: const Text('Xem Bằng Web Embed', style: TextStyle(color: Colors.white)),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      );

      // Seek to saved position if available
      if (seekTargetSeconds != null) {
        await _videoPlayerController!.seekTo(Duration(seconds: seekTargetSeconds));
        _resumedSeconds = seekTargetSeconds;
        _showResumeBanner = true;
        _resumeBannerTimer?.cancel();
        _resumeBannerTimer = Timer(const Duration(seconds: 5), () {
          if (mounted) setState(() => _showResumeBanner = false);
        });
      }

      // Add listener for Video Completion (Auto Next Episode) & Tracking
      _videoPlayerController!.addListener(_videoEventListener);

      if (mounted) {
        setState(() {
          _isPlayerInitializing = false;
        });
      }
    } catch (e) {
      // In case of any HLS initialization error, fall back to Web Embed if available
      if (_currentEpisode.linkEmbed.isNotEmpty) {
        _initWebPlayer(_currentEpisode.linkEmbed);
      } else {
        if (mounted) {
          setState(() {
            _isPlayerInitializing = false;
            _errorMessage = 'Lỗi phát video: $e';
          });
        }
      }
    }
  }

  double _getEffectiveAspectRatio(double originalRatio) {
    switch (_fitMode) {
      case VideoFitMode.original:
        return originalRatio;
      case VideoFitMode.fill:
        return 18 / 9; // Ultra-wide smartphone cinematic fill
      case VideoFitMode.stretch:
        return 16 / 9;
    }
  }

  void _videoEventListener() {
    if (_videoPlayerController == null || !_videoPlayerController!.value.isInitialized) return;

    final val = _videoPlayerController!.value;
    final pos = val.position;
    final dur = val.duration;

    // Mark as watched once user has watched at least 25 seconds
    if (pos.inSeconds >= 25 && !_watchedSlugs.contains(_currentEpisode.slug)) {
      _watchedSlugs.add(_currentEpisode.slug);
      StorageService.markEpisodeWatched(widget.movie.slug, _currentEpisode.slug);
      if (mounted) setState(() {});
    }

    // Check for episode completion to auto-play next episode
    if (_isAutoPlayEnabled && dur > Duration.zero && pos >= dur - const Duration(seconds: 1) && !val.isBuffering) {
      if (!_isShowingNextEpisodePrompt) {
        _triggerAutoPlayNextEpisode();
      }
    }
  }

  void _triggerAutoPlayNextEpisode() {
    final epIndex = _currentServer.episodes.indexWhere((e) => e.slug == _currentEpisode.slug);
    if (epIndex >= 0 && epIndex + 1 < _currentServer.episodes.length) {
      final nextEp = _currentServer.episodes[epIndex + 1];
      setState(() {
        _nextEpisode = nextEp;
        _isShowingNextEpisodePrompt = true;
        _nextEpisodeCountdown = 5;
      });

      _nextEpisodeTimer?.cancel();
      _nextEpisodeTimer = Timer.periodic(const Duration(seconds: 1), (t) {
        if (!mounted) {
          t.cancel();
          return;
        }
        if (_nextEpisodeCountdown <= 1) {
          t.cancel();
          _switchEpisode(nextEp);
        } else {
          setState(() {
            _nextEpisodeCountdown--;
          });
        }
      });
    }
  }

  void _cancelNextEpisodePrompt() {
    _nextEpisodeTimer?.cancel();
    setState(() {
      _isShowingNextEpisodePrompt = false;
      _nextEpisode = null;
    });
  }

  void _saveProgress() {
    if (_videoPlayerController == null || !_videoPlayerController!.value.isInitialized) return;
    final pos = _videoPlayerController!.value.position.inSeconds;
    final dur = _videoPlayerController!.value.duration.inSeconds;
    if (dur > 0 && pos > 0) {
      StorageService.saveHistory(
        WatchHistoryItem(
          movieSlug: widget.movie.slug,
          movieName: widget.movie.name,
          posterUrl: widget.movie.posterUrl,
          serverName: _currentServer.serverName,
          episodeName: _currentEpisode.name,
          episodeSlug: _currentEpisode.slug,
          positionSeconds: pos,
          durationSeconds: dur,
          updatedAt: DateTime.now(),
        ),
      );
    }
  }

  void _switchEpisode(EpisodeItem newEpisode) {
    if (_currentEpisode.slug == newEpisode.slug) return;
    _saveProgress();
    setState(() {
      _currentEpisode = newEpisode;
      _isShowingNextEpisodePrompt = false;
      _syncEpisodeTab();
    });
    _initPlayer(forceEmbed: _isEmbedMode);
  }

  void _switchServer(ServerItem newServer) {
    if (_currentServer.serverName == newServer.serverName) return;
    _saveProgress();
    setState(() {
      _currentServer = newServer;
      if (newServer.episodes.isNotEmpty) {
        final match = newServer.episodes.firstWhere(
          (ep) => ep.slug == _currentEpisode.slug,
          orElse: () => newServer.episodes.first,
        );
        _currentEpisode = match;
      }
      _syncEpisodeTab();
    });
    _initPlayer(forceEmbed: _isEmbedMode);
  }

  void _seekRelative(int seconds) {
    if (_videoPlayerController == null || !_videoPlayerController!.value.isInitialized) return;
    final cur = _videoPlayerController!.value.position;
    final dur = _videoPlayerController!.value.duration;
    final target = cur + Duration(seconds: seconds);
    final clamped = target < Duration.zero ? Duration.zero : (target > dur ? dur : target);
    _videoPlayerController!.seekTo(clamped);
    HapticFeedback.lightImpact();
  }

  void _togglePlayPause() {
    if (_videoPlayerController == null || !_videoPlayerController!.value.isInitialized) return;
    if (_videoPlayerController!.value.isPlaying) {
      _videoPlayerController!.pause();
    } else {
      _videoPlayerController!.play();
    }
    HapticFeedback.selectionClick();
    setState(() {});
  }

  void _playPreviousEpisode() {
    final epIndex = _currentServer.episodes.indexWhere((e) => e.slug == _currentEpisode.slug);
    if (epIndex > 0) {
      _switchEpisode(_currentServer.episodes[epIndex - 1]);
    }
  }

  void _playNextEpisode() {
    final epIndex = _currentServer.episodes.indexWhere((e) => e.slug == _currentEpisode.slug);
    if (epIndex >= 0 && epIndex + 1 < _currentServer.episodes.length) {
      _switchEpisode(_currentServer.episodes[epIndex + 1]);
    }
  }

  void _toggleFavorite() async {
    final res = await StorageService.toggleFavorite(widget.movie);
    if (mounted) {
      setState(() => _isFavorite = res);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(res ? 'Đã lưu phim vào danh sách Yêu thích' : 'Đã xóa phim khỏi danh sách Yêu thích'),
          duration: const Duration(seconds: 2),
          backgroundColor: AppTheme.card,
        ),
      );
    }
  }

  void _copyStreamLink() {
    final linkToCopy = _currentEpisode.linkM3u8.isNotEmpty ? _currentEpisode.linkM3u8 : _currentEpisode.linkEmbed;
    if (linkToCopy.isNotEmpty) {
      Clipboard.setData(ClipboardData(text: linkToCopy));
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_currentEpisode.linkM3u8.isNotEmpty
              ? 'Đã sao chép link stream HLS (.m3u8)'
              : 'Đã sao chép liên kết nhúng Embed'),
          duration: const Duration(seconds: 2),
          backgroundColor: AppTheme.card,
        ),
      );
    }
  }

  void _toggleFitMode() {
    setState(() {
      if (_fitMode == VideoFitMode.original) {
        _fitMode = VideoFitMode.fill;
      } else if (_fitMode == VideoFitMode.fill) {
        _fitMode = VideoFitMode.stretch;
      } else {
        _fitMode = VideoFitMode.original;
      }
      if (_chewieController != null && _videoPlayerController != null) {
        final videoRatio = _videoPlayerController!.value.aspectRatio > 0
            ? _videoPlayerController!.value.aspectRatio
            : 16 / 9;
        _chewieController!.dispose();
        _chewieController = ChewieController(
          videoPlayerController: _videoPlayerController!,
          autoPlay: _videoPlayerController!.value.isPlaying,
          aspectRatio: _getEffectiveAspectRatio(videoRatio),
          allowFullScreen: true,
          allowMuting: true,
          showControls: true,
          zoomAndPan: true,
          playbackSpeeds: const [0.5, 0.75, 1.0, 1.25, 1.5, 2.0],
          materialProgressColors: ChewieProgressColors(
            playedColor: AppTheme.primary,
            handleColor: AppTheme.primaryLight,
            backgroundColor: Colors.white24,
            bufferedColor: Colors.white38,
          ),
        );
      }
    });

    String modeName = _fitMode == VideoFitMode.original
        ? 'Tỉ lệ chuẩn 16:9'
        : (_fitMode == VideoFitMode.fill ? 'Tràn viền màn hình (Fill)' : 'Kéo giãn (Stretch)');

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Chế độ màn hình: $modeName'),
        duration: const Duration(seconds: 1),
        backgroundColor: AppTheme.card,
      ),
    );
  }

  void _showSpeedModal() {
    final speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                  child: Text(
                    'Tốc Độ Phát Video',
                    style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
                ...speeds.map((s) {
                  final isSel = s == _currentSpeed;
                  return ListTile(
                    dense: true,
                    title: Text(
                      '${s}x ${s == 1.0 ? '(Chuẩn)' : ''}',
                      style: TextStyle(
                        color: isSel ? AppTheme.primaryLight : Colors.white70,
                        fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                    trailing: isSel ? const Icon(Icons.check, color: AppTheme.primary) : null,
                    onTap: () {
                      Navigator.pop(ctx);
                      setState(() => _currentSpeed = s);
                      _videoPlayerController?.setPlaybackSpeed(s);
                    },
                  );
                }),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showSleepTimerModal() {
    final options = [
      {'label': 'Tắt hẹn giờ', 'mins': null},
      {'label': '15 phút', 'mins': 15},
      {'label': '30 phút', 'mins': 30},
      {'label': '45 phút', 'mins': 45},
      {'label': '60 phút (1 giờ)', 'mins': 60},
    ];

    showModalBottomSheet(
      context: context,
      backgroundColor: AppTheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                  child: Text(
                    'Hẹn Giờ Tắt / Ngủ',
                    style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                ),
                ...options.map((opt) {
                  final mins = opt['mins'] as int?;
                  final isSel = mins == _sleepSelectedMinutes;
                  return ListTile(
                    dense: true,
                    title: Text(
                      opt['label'] as String,
                      style: TextStyle(
                        color: isSel ? AppTheme.primaryLight : Colors.white70,
                        fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                    trailing: isSel ? const Icon(Icons.check, color: AppTheme.primary) : null,
                    onTap: () {
                      Navigator.pop(ctx);
                      _setSleepTimer(mins);
                    },
                  );
                }),
              ],
            ),
          ),
        );
      },
    );
  }

  void _setSleepTimer(int? minutes) {
    _sleepTimer?.cancel();
    _sleepTicker?.cancel();

    setState(() {
      _sleepSelectedMinutes = minutes;
      if (minutes == null) {
        _sleepRemainingSeconds = 0;
      } else {
        _sleepRemainingSeconds = minutes * 60;
      }
    });

    if (minutes != null) {
      _sleepTicker = Timer.periodic(const Duration(seconds: 1), (t) {
        if (!mounted) {
          t.cancel();
          return;
        }
        if (_sleepRemainingSeconds <= 1) {
          t.cancel();
          setState(() {
            _sleepRemainingSeconds = 0;
            _sleepSelectedMinutes = null;
          });
          _videoPlayerController?.pause();
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('🌙 Đã tạm dừng video theo hẹn giờ ngủ.'),
              backgroundColor: AppTheme.card,
            ),
          );
        } else {
          setState(() {
            _sleepRemainingSeconds--;
          });
        }
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Đã đặt hẹn giờ tắt sau $minutes phút'),
          duration: const Duration(seconds: 2),
          backgroundColor: AppTheme.card,
        ),
      );
    }
  }

  String _formatDuration(int totalSeconds) {
    final m = totalSeconds ~/ 60;
    final s = totalSeconds % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  Future<void> _openExternalBrowser() async {
    final url = _currentEpisode.linkEmbed.isNotEmpty ? _currentEpisode.linkEmbed : _currentEpisode.linkM3u8;
    if (url.isNotEmpty) {
      final uri = Uri.parse(url);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    }
  }

  Future<void> _disposeControllers() async {
    _chewieController?.dispose();
    _chewieController = null;
    await _videoPlayerController?.dispose();
    _videoPlayerController = null;
    _webViewController = null;
  }

  @override
  void dispose() {
    _historyTimer?.cancel();
    _sleepTimer?.cancel();
    _sleepTicker?.cancel();
    _nextEpisodeTimer?.cancel();
    _resumeBannerTimer?.cancel();
    _saveProgress();
    _disposeControllers();

    // Restore portrait and system orientations on dispose
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final epIndex = _currentServer.episodes.indexWhere((e) => e.slug == _currentEpisode.slug);
    final hasPrev = epIndex > 0;
    final hasNext = epIndex >= 0 && epIndex + 1 < _currentServer.episodes.length;

    return PopScope(
      canPop: !_isFullScreen,
      onPopInvokedWithResult: (didPop, _) {
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
          child: Column(
            children: [
              // TOP VIDEO PLAYER AREA (Expands to 100% full screen in Landscape mode)
              Expanded(
                flex: _isFullScreen ? 1 : 0,
                child: _isFullScreen
                    ? Container(
                        color: Colors.black,
                        child: _buildPlayerArea(isFullScreen: true),
                      )
                    : AspectRatio(
                        aspectRatio: 16 / 9,
                        child: Container(
                          color: Colors.black,
                          child: _buildPlayerArea(isFullScreen: false),
                        ),
                      ),
              ),

              // BOTTOM CONTENT (Only visible when NOT in fullscreen mode)
              if (!_isFullScreen) ...[
                // QUICK ACTION PLAYBACK BAR
                _buildPlaybackControlBar(hasPrev, hasNext),

                // SECONDARY UTILITIES TOOLBAR
                _buildUtilitiesBar(),

                // MOVIE INFO & EPISODES LIST
                Expanded(
                  child: _buildBottomContent(),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  /// Build Player Area Widget (handles Native HLS, Web Embed, overlays, and fullscreen buttons)
  Widget _buildPlayerArea({required bool isFullScreen}) {
    return Stack(
      fit: StackFit.expand,
      children: [
        // Video View / In-App WebView / Loader / Error
        if (_isPlayerInitializing)
          const Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(color: AppTheme.primary),
                SizedBox(height: 12),
                Text(
                  'Đang tải luồng phim HLS 1080p...',
                  style: TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          )
        else if (_errorMessage != null)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.warning_amber_rounded, color: AppTheme.primary, size: 40),
                  const SizedBox(height: 8),
                  Text(
                    _errorMessage!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ElevatedButton(
                        onPressed: () => _initPlayer(),
                        style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
                        child: const Text('Thử Lại', style: TextStyle(color: Colors.white)),
                      ),
                      if (_currentEpisode.linkEmbed.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        ElevatedButton(
                          onPressed: () => _initWebPlayer(_currentEpisode.linkEmbed),
                          style: ElevatedButton.styleFrom(backgroundColor: AppTheme.card),
                          child: const Text('Mở Web Embed', style: TextStyle(color: AppTheme.cyan)),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          )
        else if (_isEmbedMode && _webViewController != null)
          // In-App Web Embed Player with full touch and scaling
          Stack(
            fit: StackFit.expand,
            children: [
              WebViewWidget(controller: _webViewController!),
              if (_isWebLoading)
                Container(
                  color: Colors.black54,
                  child: const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircularProgressIndicator(color: AppTheme.primary),
                        SizedBox(height: 10),
                        Text(
                          'Đang tải Web Player...',
                          style: TextStyle(color: Colors.white70, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          )
        else if (_chewieController != null && _videoPlayerController != null)
          Chewie(controller: _chewieController!),

        // Auto-Resume Floating Banner
        if (_showResumeBanner && !_isEmbedMode)
          Positioned(
            top: 12,
            right: 80,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.85),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppTheme.primaryLight, width: 0.8),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.history_toggle_off, color: AppTheme.primaryLight, size: 14),
                  const SizedBox(width: 6),
                  Text(
                    'Tiếp tục từ ${_formatDuration(_resumedSeconds)}',
                    style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
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

        // Next Episode Countdown Overlay Prompt
        if (_isShowingNextEpisodePrompt && _nextEpisode != null)
          Container(
            color: Colors.black.withOpacity(0.85),
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(20.0),
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
                      style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Tự động phát sau $_nextEpisodeCountdown giây...',
                      style: const TextStyle(color: Colors.white70, fontSize: 12),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        OutlinedButton(
                          onPressed: _cancelNextEpisodePrompt,
                          style: OutlinedButton.styleFrom(
                            foregroundColor: Colors.white70,
                            side: const BorderSide(color: Colors.white30),
                          ),
                          child: const Text('Hủy'),
                        ),
                        const SizedBox(width: 12),
                        ElevatedButton.icon(
                          onPressed: () => _switchEpisode(_nextEpisode!),
                          style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
                          icon: const Icon(Icons.play_arrow, color: Colors.white, size: 16),
                          label: const Text('Phát Ngay', style: TextStyle(color: Colors.white)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),

        // Screen Lock Overlay Shield
        if (_isScreenLocked)
          Positioned.fill(
            child: Container(
              color: Colors.transparent,
              child: Stack(
                children: [
                  const ModalBarrier(dismissible: false, color: Colors.transparent),
                  Center(
                    child: InkWell(
                      onTap: () {
                        HapticFeedback.mediumImpact();
                        setState(() => _isScreenLocked = false);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('🔓 Đã mở khóa màn hình'),
                            duration: Duration(seconds: 1),
                            backgroundColor: AppTheme.card,
                          ),
                        );
                      },
                      borderRadius: BorderRadius.circular(30),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.8),
                          borderRadius: BorderRadius.circular(30),
                          border: Border.all(color: AppTheme.primary, width: 1.5),
                          boxShadow: [
                            BoxShadow(color: AppTheme.primary.withOpacity(0.3), blurRadius: 10),
                          ],
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.lock_rounded, color: AppTheme.primary, size: 18),
                            SizedBox(width: 8),
                            Text(
                              'Màn hình đang khóa • Chạm để mở',
                              style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

        // Floating Top Navigation & Lock & Fullscreen Buttons
        if (!_isScreenLocked) ...[
          // Top-Left Back / Exit Fullscreen Button
          Positioned(
            top: 10,
            left: 10,
            child: CircleAvatar(
              radius: 17,
              backgroundColor: Colors.black54,
              child: IconButton(
                padding: EdgeInsets.zero,
                icon: Icon(
                  isFullScreen ? Icons.fullscreen_exit_rounded : Icons.arrow_back,
                  color: Colors.white,
                  size: 20,
                ),
                tooltip: isFullScreen ? 'Thu nhỏ màn hình' : 'Quay lại',
                onPressed: () {
                  if (isFullScreen) {
                    _toggleFullScreen();
                  } else {
                    Navigator.of(context).pop();
                  }
                },
              ),
            ),
          ),

          // Top-Right Action Controls (Lock & Fullscreen Landscape Toggle)
          Positioned(
            top: 10,
            right: 10,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Lock Screen Button
                CircleAvatar(
                  radius: 17,
                  backgroundColor: Colors.black54,
                  child: IconButton(
                    padding: EdgeInsets.zero,
                    icon: const Icon(Icons.lock_outline_rounded, color: Colors.white70, size: 17),
                    tooltip: 'Khóa màn hình',
                    onPressed: () {
                      HapticFeedback.lightImpact();
                      setState(() => _isScreenLocked = true);
                    },
                  ),
                ),
                const SizedBox(width: 8),

                // Dedicated Fullscreen / Rotate Screen Button (Works for both HLS & Web Embed!)
                CircleAvatar(
                  radius: 17,
                  backgroundColor: AppTheme.primary.withOpacity(0.85),
                  child: IconButton(
                    padding: EdgeInsets.zero,
                    icon: Icon(
                      isFullScreen ? Icons.fullscreen_exit_rounded : Icons.fullscreen_rounded,
                      color: Colors.white,
                      size: 22,
                    ),
                    tooltip: isFullScreen ? 'Xoay dọc màn hình' : 'Toàn màn hình (Xoay ngang)',
                    onPressed: _toggleFullScreen,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  /// Build Primary Hardware Playback Bar
  Widget _buildPlaybackControlBar(bool hasPrev, bool hasNext) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: const BoxDecoration(
        color: Color(0xFF11141C),
        border: Border(bottom: BorderSide(color: Color(0xFF1E2330), width: 1)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          // Prev Episode
          IconButton(
            icon: Icon(
              Icons.skip_previous_rounded,
              color: hasPrev ? Colors.white : Colors.white24,
              size: 24,
            ),
            tooltip: 'Tập trước',
            onPressed: hasPrev ? _playPreviousEpisode : null,
          ),

          // -10s Rewind (Native only)
          IconButton(
            icon: Icon(
              Icons.replay_10_rounded,
              color: !_isEmbedMode ? Colors.white : Colors.white24,
              size: 24,
            ),
            tooltip: 'Tua lùi 10 giây',
            onPressed: !_isEmbedMode ? () => _seekRelative(-10) : null,
          ),

          // Play / Pause Primary Button
          Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: AppTheme.primary,
              boxShadow: [
                BoxShadow(color: AppTheme.primary.withOpacity(0.4), blurRadius: 8),
              ],
            ),
            child: IconButton(
              icon: Icon(
                (_videoPlayerController != null && _videoPlayerController!.value.isPlaying)
                    ? Icons.pause_rounded
                    : Icons.play_arrow_rounded,
                color: Colors.white,
                size: 26,
              ),
              tooltip: 'Phát / Tạm dừng',
              onPressed: !_isEmbedMode ? _togglePlayPause : null,
            ),
          ),

          // +10s Forward (Native only)
          IconButton(
            icon: Icon(
              Icons.forward_10_rounded,
              color: !_isEmbedMode ? Colors.white : Colors.white24,
              size: 24,
            ),
            tooltip: 'Tua tới 10 giây',
            onPressed: !_isEmbedMode ? () => _seekRelative(10) : null,
          ),

          // Next Episode
          IconButton(
            icon: Icon(
              Icons.skip_next_rounded,
              color: hasNext ? Colors.white : Colors.white24,
              size: 24,
            ),
            tooltip: 'Tập kế tiếp',
            onPressed: hasNext ? _playNextEpisode : null,
          ),
        ],
      ),
    );
  }

  /// Build Secondary Utilities Horizontal Chips Bar
  Widget _buildUtilitiesBar() {
    return Container(
      height: 44,
      color: const Color(0xFF0D0F16),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        children: [
          // Dedicated Fullscreen Landscape Button Chip
          _buildToolChip(
            icon: Icons.fullscreen_rounded,
            label: 'Xoay ngang màn hình',
            isActive: true,
            onTap: _toggleFullScreen,
          ),

          // Switch Between Native HLS and In-App Web Embed
          if (_currentEpisode.linkEmbed.isNotEmpty && _currentEpisode.linkM3u8.isNotEmpty)
            _buildToolChip(
              icon: _isEmbedMode ? Icons.video_collection_rounded : Icons.code_rounded,
              label: _isEmbedMode ? 'Chuyển: Native HLS' : 'Chuyển: Web Embed',
              isActive: _isEmbedMode,
              onTap: () {
                if (_isEmbedMode) {
                  _initPlayer(forceEmbed: false);
                } else {
                  _initWebPlayer(_currentEpisode.linkEmbed);
                }
              },
            )
          else if (_isEmbedMode)
            _buildToolChip(
              icon: Icons.code_rounded,
              label: 'Đang xem: Web Embed',
              isActive: true,
              onTap: () {},
            ),

          // In Embed mode: Toggle direct URL vs Iframe
          if (_isEmbedMode)
            _buildToolChip(
              icon: Icons.refresh_rounded,
              label: _useDirectEmbedUrl ? 'Kiểu: Link Direct' : 'Kiểu: Iframe Nhúng',
              isActive: false,
              onTap: () {
                setState(() => _useDirectEmbedUrl = !_useDirectEmbedUrl);
                _initWebPlayer(_currentEpisode.linkEmbed);
              },
            ),

          // Playback Speed (Native mode)
          if (!_isEmbedMode)
            _buildToolChip(
              icon: Icons.speed_rounded,
              label: '${_currentSpeed}x',
              isActive: _currentSpeed != 1.0,
              onTap: _showSpeedModal,
            ),

          // Screen Fit (Native mode)
          if (!_isEmbedMode)
            _buildToolChip(
              icon: Icons.aspect_ratio_rounded,
              label: _fitMode == VideoFitMode.original
                  ? '16:9'
                  : (_fitMode == VideoFitMode.fill ? 'Tràn viền' : 'Kéo giãn'),
              isActive: _fitMode != VideoFitMode.original,
              onTap: _toggleFitMode,
            ),

          // Sleep Timer
          _buildToolChip(
            icon: Icons.bedtime_outlined,
            label: _sleepRemainingSeconds > 0
                ? '${_sleepRemainingSeconds ~/ 60}m'
                : 'Hẹn giờ',
            isActive: _sleepRemainingSeconds > 0,
            onTap: _showSleepTimerModal,
          ),

          // Auto Play Toggle
          _buildToolChip(
            icon: _isAutoPlayEnabled ? Icons.playlist_play_rounded : Icons.playlist_remove_rounded,
            label: _isAutoPlayEnabled ? 'Tự chuyển tập: Bật' : 'Tự chuyển tập: Tắt',
            isActive: _isAutoPlayEnabled,
            onTap: () {
              setState(() => _isAutoPlayEnabled = !_isAutoPlayEnabled);
            },
          ),

          // Favorite Bookmark
          _buildToolChip(
            icon: _isFavorite ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
            label: _isFavorite ? 'Đã thích' : 'Yêu thích',
            isActive: _isFavorite,
            onTap: _toggleFavorite,
          ),

          // Copy Stream / Embed Link
          _buildToolChip(
            icon: Icons.link_rounded,
            label: _isEmbedMode ? 'Copy link Embed' : 'Copy link HLS',
            isActive: false,
            onTap: _copyStreamLink,
          ),

          // External Browser Option
          _buildToolChip(
            icon: Icons.open_in_browser_rounded,
            label: 'Mở trình duyệt ngoài',
            isActive: false,
            onTap: _openExternalBrowser,
          ),
        ],
      ),
    );
  }

  /// Build Scrollable Movie Info & Episodes Section
  Widget _buildBottomContent() {
    return Container(
      color: AppTheme.background,
      child: ListView(
        padding: const EdgeInsets.all(16),
        physics: const BouncingScrollPhysics(),
        children: [
          // Movie Title & Episode Status
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.movie.name,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Text(
                          'Đang phát: ${_currentEpisode.name}',
                          style: const TextStyle(
                            color: AppTheme.primaryLight,
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                        const Text(' • ', style: TextStyle(color: AppTheme.textMuted)),
                        Text(
                          _currentServer.serverName,
                          style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12),
                        ),
                        if (_isEmbedMode) ...[
                          const Text(' • ', style: TextStyle(color: AppTheme.textMuted)),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(
                              color: AppTheme.cyan.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(color: AppTheme.cyan, width: 0.6),
                            ),
                            child: const Text('EMBED', style: TextStyle(color: AppTheme.cyan, fontSize: 10, fontWeight: FontWeight.bold)),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 16),

          // Server Tabs
          if (widget.servers.length > 1) ...[
            const Text(
              'Máy Chủ Phát:',
              style: TextStyle(color: AppTheme.textMuted, fontSize: 13, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: widget.servers.map((s) {
                  final isSel = s.serverName == _currentServer.serverName;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(s.serverName),
                      selected: isSel,
                      selectedColor: AppTheme.primary,
                      backgroundColor: AppTheme.card,
                      labelStyle: TextStyle(
                        color: isSel ? Colors.white : AppTheme.textSecondary,
                        fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                        fontSize: 12,
                      ),
                      onSelected: (_) => _switchServer(s),
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Episode Range Filter (for dramas/series with > 24 episodes)
          if (_currentServer.episodes.length > _episodesPerPage) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Danh Sách Tập (${_currentServer.episodes.length}):',
                  style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
                ),
                Text(
                  'Trang ${_selectedEpisodeTab + 1}/${(_currentServer.episodes.length / _episodesPerPage).ceil()}',
                  style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12),
                ),
              ],
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: List.generate(
                  (_currentServer.episodes.length / _episodesPerPage).ceil(),
                  (tabIdx) {
                    final start = tabIdx * _episodesPerPage + 1;
                    final end = ((tabIdx + 1) * _episodesPerPage).clamp(1, _currentServer.episodes.length);
                    final isSel = _selectedEpisodeTab == tabIdx;
                    return Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: Text('$start - $end'),
                        selected: isSel,
                        selectedColor: AppTheme.cardElevated,
                        backgroundColor: AppTheme.card,
                        labelStyle: TextStyle(
                          color: isSel ? AppTheme.primaryLight : AppTheme.textSecondary,
                          fontWeight: isSel ? FontWeight.bold : FontWeight.normal,
                          fontSize: 11,
                        ),
                        onSelected: (_) {
                          setState(() => _selectedEpisodeTab = tabIdx);
                        },
                      ),
                    );
                  },
                ),
              ),
            ),
            const SizedBox(height: 12),
          ] else ...[
            Text(
              'Tập Phim (${_currentServer.episodes.length}):',
              style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
          ],

          // Episode Grid with Watched Indicators
          _buildEpisodesGrid(),

          const SizedBox(height: 24),

          // Movie Synopsis & Meta Details
          if (widget.movie.content.isNotEmpty) ...[
            const Text(
              'Nội Dung Phim',
              style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              widget.movie.content,
              style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13, height: 1.5),
            ),
            const SizedBox(height: 16),
          ],

          if (widget.movie.actors.isNotEmpty) ...[
            Text(
              'Diễn viên: ${widget.movie.actors.take(6).join(', ')}',
              style: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
            ),
            const SizedBox(height: 6),
          ],
          if (widget.movie.categories.isNotEmpty) ...[
            Text(
              'Thể loại: ${widget.movie.categories.join(' • ')}',
              style: const TextStyle(color: AppTheme.textMuted, fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildToolChip({
    required IconData icon,
    required String label,
    required bool isActive,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
          decoration: BoxDecoration(
            color: isActive ? AppTheme.primary.withOpacity(0.2) : AppTheme.card,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isActive ? AppTheme.primary : AppTheme.border,
              width: 0.8,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 14,
                color: isActive ? AppTheme.primaryLight : AppTheme.textSecondary,
              ),
              const SizedBox(width: 5),
              Text(
                label,
                style: TextStyle(
                  color: isActive ? Colors.white : AppTheme.textSecondary,
                  fontSize: 11,
                  fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEpisodesGrid() {
    List<EpisodeItem> displayedEps = _currentServer.episodes;
    if (_currentServer.episodes.length > _episodesPerPage) {
      final start = _selectedEpisodeTab * _episodesPerPage;
      final end = (start + _episodesPerPage).clamp(0, _currentServer.episodes.length);
      displayedEps = _currentServer.episodes.sublist(start, end);
    }

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 4,
        childAspectRatio: 2.2,
        crossAxisSpacing: 8,
        mainAxisSpacing: 8,
      ),
      itemCount: displayedEps.length,
      itemBuilder: (context, idx) {
        final ep = displayedEps[idx];
        final isPlaying = ep.slug == _currentEpisode.slug;
        final isWatched = _watchedSlugs.contains(ep.slug);

        return ElevatedButton(
          onPressed: () => _switchEpisode(ep),
          style: ElevatedButton.styleFrom(
            backgroundColor: isPlaying
                ? AppTheme.primary
                : (isWatched ? const Color(0xFF141722) : AppTheme.card),
            padding: EdgeInsets.zero,
            elevation: isPlaying ? 4 : 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
              side: BorderSide(
                color: isPlaying
                    ? AppTheme.primaryLight
                    : (isWatched ? Colors.white24 : AppTheme.border),
                width: isPlaying ? 1.5 : 0.8,
              ),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (isPlaying) ...[
                const Icon(Icons.play_arrow_rounded, color: Colors.white, size: 14),
                const SizedBox(width: 2),
              ] else if (isWatched) ...[
                const Icon(Icons.check_circle_outline_rounded, color: Colors.white38, size: 11),
                const SizedBox(width: 3),
              ],
              Flexible(
                child: Text(
                  ep.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: isPlaying
                        ? Colors.white
                        : (isWatched ? Colors.white60 : AppTheme.textPrimary),
                    fontSize: 12,
                    fontWeight: isPlaying ? FontWeight.bold : FontWeight.normal,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
