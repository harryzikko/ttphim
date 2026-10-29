import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import 'package:webview_flutter/webview_flutter.dart';
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

  bool _showControls = true;
  Timer? _hideControlsTimer;
  Timer? _historyTimer;

  // TV Quick HUDs
  String? _hudMessage;
  Timer? _hudTimer;


  final FocusNode _playPauseFocus = FocusNode();
  final FocusNode _rwFocus = FocusNode();
  final FocusNode _ffFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    _currentServer = widget.initialServer;
    _currentEpisode = widget.initialEpisode;

    // TV immersive mode
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);

    _initPlayer();
    _historyTimer = Timer.periodic(const Duration(seconds: 10), (_) => _saveProgress());
  }

  @override
  void dispose() {
    _saveProgress();
    _playerGeneration++;
    _hideControlsTimer?.cancel();
    _hudTimer?.cancel();
    _historyTimer?.cancel();
    _controller?.removeListener(_videoListener);
    _controller?.dispose();
    _playPauseFocus.dispose();
    _rwFocus.dispose();
    _ffFocus.dispose();
    super.dispose();
  }

  void _showHud(String msg) {
    setState(() => _hudMessage = msg);
    _hudTimer?.cancel();
    _hudTimer = Timer(const Duration(milliseconds: 1200), () {
      if (mounted) setState(() => _hudMessage = null);
    });
  }

  void _resetControlsTimer() {
    setState(() => _showControls = true);
    _hideControlsTimer?.cancel();
    _hideControlsTimer = Timer(const Duration(seconds: 4), () {
      if (mounted && (_controller?.value.isPlaying ?? false)) {
        if (_playPauseFocus.hasFocus || _rwFocus.hasFocus || _ffFocus.hasFocus) return;
        setState(() => _showControls = false);
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

    if (forceEmbed && episode.linkEmbed.isNotEmpty) {
      _initEmbedPlayer(episode.linkEmbed);
      return;
    }

    String streamUrl = episode.linkM3u8.trim();
    if (streamUrl.isEmpty && episode.linkEmbed.isNotEmpty) {
      // Check if .m3u8 is embedded in URL parameter
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
      if (episode.linkEmbed.isNotEmpty) { _initEmbedPlayer(episode.linkEmbed); return; }
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Lỗi phát HLS: $e';
        });
      }
    }
    finally {
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
    final iframeSource = EmbedPolicy.iframeSource(embedUrl);
    setState(() {
      _isEmbedMode = true;
      _isLoading = false;
    });

    final embedHtml = '''
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="referrer" content="no-referrer-when-downgrade">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; background:#000; }
    html, body { width:100%; height:100%; overflow:hidden; background:#000; }
    iframe { width:100%; height:100%; border:none; position:absolute; top:0; left:0; right:0; bottom:0; }
  </style>
</head>
<body>
  <iframe src="$iframeSource"
          referrerpolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowfullscreen="true"
          webkitallowfullscreen="true"
          mozallowfullscreen="true">
  </iframe>
  <script>
    window.open = function() { return null; };
    window.alert = function() {};
    window.confirm = function() { return false; };
  </script>
</body>
</html>
''';

    final controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            return EmbedPolicy.allowsNavigation(embedUrl, request.url)
                ? NavigationDecision.navigate
                : NavigationDecision.prevent;
          },
        ),
      );

    controller.loadHtmlString(embedHtml, baseUrl: embedUrl);
    _webViewController = controller;
  }

  void _videoListener() {
    if (!mounted || _controller == null) return;
    final val = _controller!.value;

    // Check completion for auto next episode
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
    });
    _initPlayer();
  }

  Future<void> _saveProgress() async {
    if (_controller == null || !_controller!.value.isInitialized) return;
    final pos = _controller!.value.position.inSeconds;
    final dur = _controller!.value.duration.inSeconds;
    if (dur > 0 && pos > 5) {
      await StorageService.saveHistory(WatchHistoryItem(
        movieSlug: widget.movie.slug,
        movieName: widget.movie.name,
        posterUrl: widget.movie.posterUrl,
        thumbUrl: widget.movie.thumbUrl.isNotEmpty ? widget.movie.thumbUrl : (widget.movie.posterUrl.contains('-poster.') ? widget.movie.posterUrl.replaceAll('-poster.', '-thumb.') : widget.movie.posterUrl),
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
    if (key == LogicalKeyboardKey.escape || key == LogicalKeyboardKey.goBack) {
      Navigator.pop(context);
      return KeyEventResult.handled;
    }
    if (_showControls) return KeyEventResult.ignored;
    if (key == LogicalKeyboardKey.arrowDown || key == LogicalKeyboardKey.arrowUp) {
      _resetControlsTimer();
      WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) _playPauseFocus.requestFocus(); });
      return KeyEventResult.handled;
    }
    if (_controller == null || !_controller!.value.isInitialized) return KeyEventResult.ignored;
    if ([LogicalKeyboardKey.select, LogicalKeyboardKey.enter, LogicalKeyboardKey.space].contains(key)) {
      if (_controller!.value.isPlaying) { _controller!.pause(); _saveProgress(); }
      else { _controller!.play(); }
      _resetControlsTimer();
      return KeyEventResult.handled;
    }
    if (key == LogicalKeyboardKey.arrowLeft || key == LogicalKeyboardKey.arrowRight) {
      final delta = key == LogicalKeyboardKey.arrowLeft ? -10 : 10;
      final seconds = (_controller!.value.position.inSeconds + delta).clamp(0, _controller!.value.duration.inSeconds);
      _controller!.seekTo(Duration(seconds: seconds));
      _showHud(delta < 0 ? '<< 10s' : '10s >>');
      return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      autofocus: true,
      onKeyEvent: _handleRemoteKey,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          fit: StackFit.expand,
          children: [
            // Video Output
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
                      'Đang kết nối luồng phát Android TV...',
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

            // TV HUD Message Ripple in Center
            if (_hudMessage != null)
              Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.85),
                    borderRadius: BorderRadius.circular(30),
                    border: Border.all(color: AppTheme.primary, width: 1.5),
                  ),
                  child: Text(
                    _hudMessage!,
                    style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ),
              ),

            // TV Controls Overlay (Top Bar + Bottom Bar)
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
                      colors: [Colors.black.withOpacity(0.85), Colors.transparent],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back, color: Colors.white, size: 28),
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
                      // Remote Guide
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.white12,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: const Text(
                          'Remote: D-pad ◄ / ► để Tua 10s • OK để Play/Pause',
                          style: TextStyle(color: Colors.white70, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              // Bottom TV Scrub & Action Bar
              Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 36, vertical: 24),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [Colors.transparent, Colors.black.withOpacity(0.9)],
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (_controller != null && _controller!.value.isInitialized) ...[
                        Row(
                          children: [
                            Text(
                              _formatDuration(_controller!.value.position),
                              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold),
                            ),
                            Expanded(
                              child: SliderTheme(
                                data: SliderTheme.of(context).copyWith(
                                  activeTrackColor: AppTheme.primary,
                                  inactiveTrackColor: Colors.white24,
                                  thumbColor: AppTheme.primary,
                                  thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                                ),
                                child: Slider(
                                  value: _controller!.value.position.inSeconds
                                      .toDouble()
                                      .clamp(0.0, _controller!.value.duration.inSeconds.toDouble()),
                                  max: _controller!.value.duration.inSeconds.toDouble() > 0
                                      ? _controller!.value.duration.inSeconds.toDouble()
                                      : 1.0,
                                  onChanged: (v) {
                                    _controller!.seekTo(Duration(seconds: v.toInt()));
                                  },
                                ),
                              ),
                            ),
                            Text(
                              _formatDuration(_controller!.value.duration),
                              style: const TextStyle(color: Colors.white70, fontSize: 13),
                            ),
                          ],
                        ),
                      ],

                      // TV Bottom Action Row (Episodes list & Server switcher)
                      Row(
                        children: [
                          ElevatedButton.icon(
                            focusNode: _playPauseFocus,
                            onPressed: _controller == null ? null : () {
                              if (_controller!.value.isPlaying) { _controller!.pause(); _saveProgress(); }
                              else { _controller!.play(); }
                              setState(() {});
                            },
                            icon: Icon((_controller?.value.isPlaying ?? false) ? Icons.pause : Icons.play_arrow),
                            label: Text((_controller?.value.isPlaying ?? false) ? 'Tạm dừng' : 'Phát'),
                          ),
                          const SizedBox(width: 12),
                          ElevatedButton.icon(
                            focusNode: _ffFocus,
                            onPressed: () => _openTvEpisodesSheet(),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.card,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                            ),
                            icon: const Icon(Icons.video_library_rounded, size: 18),
                            label: const Text('Danh Sách Tập'),
                          ),
                          const SizedBox(width: 12),
                          OutlinedButton.icon(
                            focusNode: _rwFocus,
                            onPressed: () => _openTvServerSheet(),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.white,
                              side: const BorderSide(color: Colors.white24),
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                            ),
                            icon: const Icon(Icons.dns_rounded, size: 18),
                            label: Text(_currentServer.serverName),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _openTvEpisodesSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF141722),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Chọn Tập Phim',
              style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: GridView.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 6,
                  childAspectRatio: 2.2,
                  crossAxisSpacing: 10,
                  mainAxisSpacing: 10,
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

  void _openTvServerSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF141722),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Chọn Nguồn Phát (Server)',
              style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            ...widget.servers.map((s) {
              final isCurrent = s.serverName == _currentServer.serverName;
              return ListTile(
                title: Text(s.serverName, style: TextStyle(color: isCurrent ? AppTheme.primaryLight : Colors.white)),
                leading: Icon(Icons.dns_rounded, color: isCurrent ? AppTheme.primary : Colors.white54),
                trailing: isCurrent ? const Icon(Icons.check, color: AppTheme.primary) : null,
                onTap: () {
                  Navigator.pop(ctx);
                  setState(() {
                    _currentServer = s;
                    _currentEpisode = s.episodes.isNotEmpty ? s.episodes.first : _currentEpisode;
                  });
                  _initPlayer();
                },
              );
            }),
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
