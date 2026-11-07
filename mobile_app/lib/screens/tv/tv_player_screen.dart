import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import '../../models/movie.dart';
import '../../models/movie_detail.dart';
import '../../services/storage_service.dart';
import '../../services/embed_policy.dart';
import '../../theme/app_theme.dart';

class TvPlayerScreen extends StatefulWidget {
  final Movie movie;
  final List<ServerItem> servers;
  final ServerItem initialServer;
  final EpisodeItem initialEpisode;

  const TvPlayerScreen({
    super.key,
    required this.movie,
    required this.servers,
    required this.initialServer,
    required this.initialEpisode,
  });

  @override
  State<TvPlayerScreen> createState() => _TvPlayerScreenState();
}

class _TvPlayerScreenState extends State<TvPlayerScreen> {
  late ServerItem _currentServer;
  late EpisodeItem _currentEpisode;

  VideoPlayerController? _controller;
  WebViewController? _webViewController;
  bool _isEmbedMode = false;
  bool _isLoading = true;
  String? _errorMessage;
  int _playerGeneration = 0;
  bool _autoNext = true;

  // Netflix-style Overlay Controls
  bool _showControls = true;
  Timer? _hideControlsTimer;
  Timer? _historyTimer;
  Duration _webPosition = Duration.zero;
  Duration _webDuration = Duration.zero;

  // Netflix-style D-pad Scrubbing (smooth debounce)
  bool _isScrubbing = false;
  int _scrubTargetSeconds = 0;
  int _scrubDelta = 0;
  Timer? _scrubCommitTimer;

  // Center Play/Pause Ripple
  bool _showCenterPlayPauseIcon = false;
  bool _wasPlaying = true;
  Timer? _centerIconTimer;

  // Quick Episode Drawer
  bool _showEpisodesDrawer = false;

  final FocusNode _rootPlayerFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    _currentServer = widget.initialServer;
    _currentEpisode = widget.initialEpisode;

    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);

    _initPlayer();
    _historyTimer = Timer.periodic(const Duration(seconds: 10), (_) => _saveProgress());
  }

  @override
  void deactivate() {
    _saveProgress();
    _controller?.pause();
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
    _controller?.pause();
    try {
      _webViewController?.runJavaScript(
        "var v=document.querySelectorAll('video'); for(var i=0;i<v.length;i++) v[i].pause();"
      );
      _webViewController?.loadRequest(Uri.parse('about:blank'));
    } catch (_) {}
    _playerGeneration++;
    _hideControlsTimer?.cancel();
    _historyTimer?.cancel();
    _scrubCommitTimer?.cancel();
    _centerIconTimer?.cancel();
    _controller?.removeListener(_videoListener);
    _controller?.dispose();
    _rootPlayerFocus.dispose();
    super.dispose();
  }

  void _resetControlsTimer() {
    setState(() => _showControls = true);
    _hideControlsTimer?.cancel();
    _hideControlsTimer = Timer(const Duration(seconds: 5), () {
      if (mounted && (_controller?.value.isPlaying ?? false) && !_isScrubbing && !_showEpisodesDrawer) {
        setState(() => _showControls = false);
      }
    });
  }

  void _triggerPlayPause() {
    if (_isEmbedMode) {
      _webViewController?.runJavaScript('''
        (function() {
          try {
            if (window.jwplayer) {
              var p = (window.jwplayer && window.jwplayer('ssPlay')) || window.jwplayer();
              if (p && typeof p.getState === 'function') {
                p.play();
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
        _showCenterPlayPauseIcon = true;
        _resetControlsTimer();
      });
      _centerIconTimer?.cancel();
      _centerIconTimer = Timer(const Duration(milliseconds: 900), () {
        if (mounted) setState(() => _showCenterPlayPauseIcon = false);
      });
      return;
    }

    if (_controller == null || !_controller!.value.isInitialized) return;
    final isPlaying = _controller!.value.isPlaying;
    if (isPlaying) {
      _controller!.pause();
      _saveProgress();
      _wasPlaying = false;
    } else {
      _controller!.play();
      _wasPlaying = true;
    }
    setState(() {
      _showCenterPlayPauseIcon = true;
      _resetControlsTimer();
    });
    _centerIconTimer?.cancel();
    _centerIconTimer = Timer(const Duration(milliseconds: 900), () {
      if (mounted) setState(() => _showCenterPlayPauseIcon = false);
    });
  }

  void _handleDpadScrub(int deltaSeconds) {
    if (_isEmbedMode) {
      _webViewController?.runJavaScript('''
        (function() {
          try {
            if (window.jwplayer) {
              var p = (window.jwplayer && window.jwplayer('ssPlay')) || window.jwplayer();
              if (p && typeof p.getPosition === 'function') {
                p.seek(Math.max(0, p.getPosition() + $deltaSeconds));
                return;
              }
            }
            var v = document.querySelector('video');
            if (v) {
              v.currentTime = Math.max(0, v.currentTime + $deltaSeconds);
            }
          } catch (_) {}
        })();
      ''');
      _resetControlsTimer();
      return;
    }

    if (_controller == null || !_controller!.value.isInitialized) return;

    final duration = _controller!.value.duration.inSeconds;
    if (duration <= 0) return;

    _resetControlsTimer();

    if (!_isScrubbing) {
      _isScrubbing = true;
      _scrubTargetSeconds = _controller!.value.position.inSeconds;
      _scrubDelta = 0;
    }

    _scrubDelta += deltaSeconds;
    _scrubTargetSeconds = (_scrubTargetSeconds + deltaSeconds).clamp(0, duration);

    setState(() {});

    _scrubCommitTimer?.cancel();
    _scrubCommitTimer = Timer(const Duration(milliseconds: 650), () async {
      if (!mounted || _controller == null) return;
      await _controller!.seekTo(Duration(seconds: _scrubTargetSeconds));
      if (mounted) {
        setState(() {
          _isScrubbing = false;
          _scrubDelta = 0;
        });
        _resetControlsTimer();
      }
    });
  }

  Future<void> _initPlayer({bool forceEmbed = false}) async {
    if (!mounted) return;
    final generation = ++_playerGeneration;
    final episode = _currentEpisode;
    bool isCurrent() => mounted && generation == _playerGeneration;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    final previous = _controller;
    _controller = null;
    previous?.removeListener(_videoListener);
    await previous?.dispose();
    if (!isCurrent()) return;

    final isSongNgu = _currentServer.serverName.toLowerCase().contains('song ngữ') ||
        episode.linkEmbed.contains('/embed/vicdn/') ||
        episode.linkEmbed.contains('vicdn') ||
        (widget.movie.hasSongNgu && episode.linkEmbed.contains('vicdn'));

    if ((forceEmbed || isSongNgu) && episode.linkEmbed.isNotEmpty) {
      _initEmbedPlayer(episode.linkEmbed);
      return;
    }

    String streamUrl = episode.linkM3u8.trim();
    if (streamUrl.isEmpty && episode.linkEmbed.isNotEmpty) {
      final uri = Uri.tryParse(episode.linkEmbed);
      final param = uri?.queryParameters['url'] ?? uri?.queryParameters['file'];
      if (param != null && param.contains('.m3u8')) {
        streamUrl = Uri.decodeFull(param);
      }
    }

    if (streamUrl.isEmpty) {
      if (episode.linkEmbed.isNotEmpty) {
        _initEmbedPlayer(episode.linkEmbed);
        return;
      } else {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Tập phim hiện chưa có luồng phát trực tiếp.';
        });
        return;
      }
    }

    _isEmbedMode = false;
    VideoPlayerController? pendingController;
    try {
      final isLocal = streamUrl.contains('cineviet.live') || streamUrl.contains('vicdn');
      final ctrl = VideoPlayerController.networkUrl(
        Uri.parse(streamUrl),
        httpHeaders: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': isLocal ? 'https://cineviet.live/' : 'https://phimapi.com/',
        },
      );
      pendingController = ctrl;

      await ctrl.initialize().timeout(const Duration(seconds: 20));
      if (!isCurrent()) return;
      final history = await StorageService.getHistoryForMovie(widget.movie.slug);
      _autoNext = await StorageService.getAutoNext();
      if (!isCurrent()) return;
      if (history != null && history.episodeSlug == episode.slug && history.progressPercentage < 0.95 && history.positionSeconds > 5 && history.positionSeconds < ctrl.value.duration.inSeconds) {
        await ctrl.seekTo(Duration(seconds: history.positionSeconds));
        if (!isCurrent()) return;
      }
      await ctrl.play();
      if (!isCurrent()) return;

      ctrl.addListener(_videoListener);

      if (isCurrent()) {
        setState(() {
          _controller = ctrl;
          _isLoading = false;
        });
        _resetControlsTimer();
      }
    } catch (e) {
      if (!isCurrent()) return;
      if (episode.linkEmbed.isNotEmpty) {
        _initEmbedPlayer(episode.linkEmbed);
        return;
      }
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Lỗi phát HLS: $e';
        });
      }
    } finally {
      if (pendingController != null && !identical(pendingController, _controller)) {
        await pendingController.dispose();
      }
    }
  }

  void _initEmbedPlayer(String embedUrl) {
    if (!EmbedPolicy.isValidSource(embedUrl)) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Embed source must use HTTPS';
      });
      return;
    }
    final resolvedUrl = EmbedPolicy.resolveUrl(embedUrl);
    setState(() {
      _isEmbedMode = true;
      _isLoading = false;
    });

    try {
      final controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(Colors.black)
        ..setUserAgent(
          'Mozilla/5.0 (Linux; Android TV; CineViet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        );

      if (controller.platform is AndroidWebViewController) {
        AndroidWebViewController.enableDebugging(false);
        (controller.platform as AndroidWebViewController).setMediaPlaybackRequiresUserGesture(false);
      }

      controller.addJavaScriptChannel(
        'CineVietNative',
        onMessageReceived: (JavaScriptMessage message) {
          final msg = message.message;
          if (msg.startsWith('sync:')) {
            final parts = msg.split(':');
            if (parts.length >= 3) {
              final p = int.tryParse(parts[1]) ?? 0;
              final d = int.tryParse(parts[2]) ?? 0;
              if (mounted) {
                _webPosition = Duration(seconds: p);
                if (d > 0) _webDuration = Duration(seconds: d);
              }
            }
          }
        },
      );

      controller.setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (url) {
            controller.runJavaScript('''
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

      final isNguonC = resolvedUrl.contains('streamc') || resolvedUrl.contains('nguonc');
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
          _errorMessage = 'Lỗi khởi tạo player: $e';
        });
      }
    }
  }

  void _videoListener() {
    if (!mounted || _controller == null) return;
    final val = _controller!.value;

    if (val.isInitialized && val.duration > Duration.zero) {
      if (val.position >= val.duration - const Duration(seconds: 1)) {
        _triggerAutoNextEpisode();
      }
    }
  }

  void _triggerAutoNextEpisode() {
    if (!_autoNext) return;
    final epIndex = _currentServer.episodes.indexWhere((e) => e.slug == _currentEpisode.slug);
    if (epIndex >= 0 && epIndex < _currentServer.episodes.length - 1) {
      final next = _currentServer.episodes[epIndex + 1];
      _switchEpisode(next);
    }
  }

  void _switchEpisode(EpisodeItem ep) {
    _saveProgress();
    setState(() {
      _currentEpisode = ep;
      _showEpisodesDrawer = false;
    });
    _initPlayer();
  }

  Future<void> _saveProgress() async {
    final pos = _isEmbedMode ? _webPosition.inSeconds : (_controller?.value.position.inSeconds ?? 0);
    final dur = _isEmbedMode ? _webDuration.inSeconds : (_controller?.value.duration.inSeconds ?? 0);
    if (dur > 0 && pos > 5) {
      await StorageService.saveHistory(WatchHistoryItem(
        movieSlug: widget.movie.slug,
        movieName: widget.movie.name,
        posterUrl: widget.movie.posterUrl,
        thumbUrl: widget.movie.thumbUrl.isNotEmpty ? widget.movie.thumbUrl : widget.movie.posterUrl,
        episodeSlug: _currentEpisode.slug,
        episodeName: _currentEpisode.name,
        positionSeconds: pos,
        durationSeconds: dur,
        serverName: _currentServer.serverName,
        updatedAt: DateTime.now(),
      ));
    }
  }

  KeyEventResult _handleRemoteKey(FocusNode node, KeyEvent event) {
    if (event is! KeyDownEvent) return KeyEventResult.ignored;
    final key = event.logicalKey;

    // 1. Back button
    if (key == LogicalKeyboardKey.escape || key == LogicalKeyboardKey.goBack) {
      if (_showEpisodesDrawer) {
        setState(() => _showEpisodesDrawer = false);
        return KeyEventResult.handled;
      }
      if (_showControls) {
        setState(() => _showControls = false);
        return KeyEventResult.handled;
      }
      Navigator.pop(context);
      return KeyEventResult.handled;
    }

    // 2. Center / OK / Select button or TV Play/Pause
    if ([
      LogicalKeyboardKey.select,
      LogicalKeyboardKey.enter,
      LogicalKeyboardKey.space,
      LogicalKeyboardKey.mediaPlayPause,
      LogicalKeyboardKey.mediaPlay,
      LogicalKeyboardKey.mediaPause,
    ].contains(key)) {
      if (_isScrubbing) {
        // Immediate seek commit
        _scrubCommitTimer?.cancel();
        _controller?.seekTo(Duration(seconds: _scrubTargetSeconds));
        setState(() {
          _isScrubbing = false;
          _scrubDelta = 0;
        });
        return KeyEventResult.handled;
      }
      _triggerPlayPause();
      return KeyEventResult.handled;
    }

    // 3. Left / Right scrubbing (Netflix style) or Rewind / FastForward keys
    if (key == LogicalKeyboardKey.arrowLeft || key == LogicalKeyboardKey.mediaRewind) {
      _handleDpadScrub(-10);
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.arrowRight || key == LogicalKeyboardKey.mediaFastForward) {
      _handleDpadScrub(10);
      return KeyEventResult.handled;
    }

    // 4. Down button -> Open Quick Episode Drawer
    if (key == LogicalKeyboardKey.arrowDown) {
      if (!_showEpisodesDrawer) {
        setState(() {
          _showEpisodesDrawer = true;
          _showControls = true;
        });
      }
      return KeyEventResult.handled;
    }

    // 5. Up button -> Toggle top header / controls
    if (key == LogicalKeyboardKey.arrowUp) {
      if (_showEpisodesDrawer) {
        setState(() => _showEpisodesDrawer = false);
      } else {
        _resetControlsTimer();
      }
      return KeyEventResult.handled;
    }

    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    final positionSeconds = _isScrubbing
        ? _scrubTargetSeconds
        : (_controller?.value.position.inSeconds ?? 0);
    final totalSeconds = _controller?.value.duration.inSeconds ?? 1;

    return Focus(
      autofocus: true,
      focusNode: _rootPlayerFocus,
      onKeyEvent: _handleRemoteKey,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          fit: StackFit.expand,
          children: [
            // 1. Video Player
            if (_isEmbedMode && _webViewController != null)
              WebViewWidget(controller: _webViewController!)
            else if (_controller != null && _controller!.value.isInitialized)
              Center(
                child: AspectRatio(
                  aspectRatio: _controller!.value.aspectRatio,
                  child: VideoPlayer(_controller!),
                ),
              )
            else if (_isLoading)
              const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(color: AppTheme.primary, strokeWidth: 3.5),
                    SizedBox(height: 16),
                    Text(
                      'Đang tải luồng phát điện ảnh 4K/FHD...',
                      style: TextStyle(color: Colors.white70, fontSize: 14),
                    ),
                  ],
                ),
              )
            else if (_errorMessage != null)
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline_rounded, color: AppTheme.primary, size: 54),
                    const SizedBox(height: 14),
                    Text(_errorMessage!, style: const TextStyle(color: Colors.white70, fontSize: 14)),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: () => _initPlayer(forceEmbed: true),
                      style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
                      child: const Text('Thử Lại Qua Web Embed'),
                    ),
                  ],
                ),
              ),

            // 2. Netflix Center Play/Pause Indicator
            if (_showCenterPlayPauseIcon)
              Center(
                child: AnimatedOpacity(
                  duration: const Duration(milliseconds: 200),
                  opacity: _showCenterPlayPauseIcon ? 1.0 : 0.0,
                  child: Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.65),
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white30, width: 2),
                    ),
                    child: Icon(
                      _wasPlaying ? Icons.play_arrow_rounded : Icons.pause_rounded,
                      color: Colors.white,
                      size: 54,
                    ),
                  ),
                ),
              ),

            // 3. Netflix Scrub Time Badge (Center Screen)
            if (_isScrubbing)
              Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.85),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppTheme.primary, width: 2),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.primary.withOpacity(0.5),
                        blurRadius: 20,
                        spreadRadius: 2,
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _formatDuration(Duration(seconds: _scrubTargetSeconds)),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 32,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.0,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${_scrubDelta >= 0 ? "+" : ""}${_scrubDelta}s',
                        style: TextStyle(
                          color: _scrubDelta >= 0 ? const Color(0xFF10B981) : Colors.redAccent,
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

            // 4. Netflix HUD Overlay (Top & Bottom)
            if (_showControls) ...[
              // Top Bar
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 24),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Colors.black.withOpacity(0.9), Colors.transparent],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back_rounded, color: Colors.white, size: 28),
                        onPressed: () => Navigator.pop(context),
                      ),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.movie.name,
                            style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                          ),
                          Text(
                            '${_currentServer.serverName} • ${_currentEpisode.name}',
                            style: const TextStyle(color: AppTheme.primaryLight, fontSize: 13, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.white12,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Text(
                          'Remote: ◄ / ► Tua • OK Phát/Dừng • ▼ Danh Sách Tập',
                          style: TextStyle(color: Colors.white70, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // Bottom Netflix Scrub Bar
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 20),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Colors.transparent, Colors.black.withOpacity(0.92)],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Time indicator & Progress bar
                      Row(
                        children: [
                          Text(
                            _formatDuration(Duration(seconds: positionSeconds)),
                            style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(4),
                              child: LinearProgressIndicator(
                                value: (positionSeconds / (totalSeconds > 0 ? totalSeconds : 1)).clamp(0.0, 1.0),
                                minHeight: 6,
                                backgroundColor: Colors.white24,
                                valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primary),
                              ),
                            ),
                          ),
                          const SizedBox(width: 14),
                          Text(
                            _formatDuration(Duration(seconds: totalSeconds)),
                            style: const TextStyle(color: Colors.white70, fontSize: 13),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          TextButton.icon(
                            onPressed: _triggerPlayPause,
                            icon: Icon((_controller?.value.isPlaying ?? false) ? Icons.pause : Icons.play_arrow, color: Colors.white, size: 20),
                            label: Text((_controller?.value.isPlaying ?? false) ? 'Tạm Dừng' : 'Phát Tiếp', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                          ),
                          const SizedBox(width: 16),
                          TextButton.icon(
                            onPressed: () => setState(() => _showEpisodesDrawer = !_showEpisodesDrawer),
                            icon: const Icon(Icons.video_library_rounded, color: Colors.white70, size: 18),
                            label: const Text('Danh Sách Tập', style: TextStyle(color: Colors.white70)),
                          ),
                          const Spacer(),
                          Text(
                            'Chất lượng: ${widget.movie.quality.isNotEmpty ? widget.movie.quality : "FHD 1080p"}',
                            style: const TextStyle(color: AppTheme.cyan, fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],

            // 5. Netflix Quick Episode Drawer (D-Pad Down on TV)
            if (_showEpisodesDrawer)
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                height: 220,
                child: Container(
                  color: const Color(0xFF141722).withOpacity(0.97),
                  padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.video_library_rounded, color: AppTheme.primary, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            'Chọn Tập Phim (${_currentServer.serverName})',
                            style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                          const Spacer(),
                          IconButton(
                            icon: const Icon(Icons.close_rounded, color: Colors.white60),
                            onPressed: () => setState(() => _showEpisodesDrawer = false),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Expanded(
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: _currentServer.episodes.length,
                          separatorBuilder: (_, __) => const SizedBox(width: 12),
                          itemBuilder: (context, idx) {
                            final ep = _currentServer.episodes[idx];
                            final isCurrent = ep.slug == _currentEpisode.slug;

                            return Focus(
                              autofocus: isCurrent,
                              onKeyEvent: (node, event) {
                                if (event is KeyDownEvent &&
                                    [LogicalKeyboardKey.select, LogicalKeyboardKey.enter, LogicalKeyboardKey.space].contains(event.logicalKey)) {
                                  _switchEpisode(ep);
                                  return KeyEventResult.handled;
                                }
                                return KeyEventResult.ignored;
                              },
                              child: Builder(
                                builder: (ctx) {
                                  final isFocused = Focus.of(ctx).hasFocus;
                                  return GestureDetector(
                                    onTap: () => _switchEpisode(ep),
                                    child: AnimatedContainer(
                                      duration: const Duration(milliseconds: 150),
                                      width: 120,
                                      padding: const EdgeInsets.all(12),
                                      decoration: BoxDecoration(
                                        color: isCurrent
                                            ? AppTheme.primary
                                            : (isFocused ? Colors.white24 : const Color(0xFF1E2230)),
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(
                                          color: isFocused ? Colors.white : Colors.transparent,
                                          width: 1.5,
                                        ),
                                      ),
                                      child: Center(
                                        child: Text(
                                          ep.name,
                                          textAlign: TextAlign.center,
                                          style: TextStyle(
                                            color: Colors.white,
                                            fontWeight: isCurrent ? FontWeight.bold : FontWeight.w500,
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
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _formatDuration(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    if (d.inHours > 0) {
      return '${d.inHours}:$m:$s';
    }
    return '$m:$s';
  }
}
