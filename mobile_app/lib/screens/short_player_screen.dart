import 'dart:async';
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import 'package:wakelock_plus/wakelock_plus.dart';
import '../models/short_drama.dart';
import '../services/shortflix_service.dart';
import '../theme/app_theme.dart';

class ShortPlayerScreen extends StatefulWidget {
  final ShortDramaItem item;
  final int initialEpisode;

  const ShortPlayerScreen({
    super.key,
    required this.item,
    this.initialEpisode = 1,
  });

  @override
  State<ShortPlayerScreen> createState() => _ShortPlayerScreenState();
}

class _ShortPlayerScreenState extends State<ShortPlayerScreen> {
  static const Map<String, String> _hlsHeaders = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://cineviet.live/',
  };

  VideoPlayerController? _controller;
  late ShortDramaItem _item;
  List<ShortEpisode> _episodes = const [];
  List<ShortStreamServer> _servers = const [];

  int _activeEpisode = 1;
  bool _preferFull = false;
  bool _showSubtitles = true;
  bool _autoNext = true;
  bool _isLoadingDetail = true;
  bool _isLoadingStream = true;
  bool _showOverlay = true;
  String? _error;

  int _loadToken = 0;
  bool _handledEndedForToken = false;
  Timer? _hideTimer;

  @override
  void initState() {
    super.initState();
    _item = widget.item;
    _activeEpisode = widget.initialEpisode < 1 ? 1 : widget.initialEpisode;
    WakelockPlus.enable().catchError((_) {});
    _loadDetail();
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    _controller?.removeListener(_onVideoTick);
    _controller?.dispose();
    WakelockPlus.disable().catchError((_) {});
    super.dispose();
  }

  Future<void> _loadDetail() async {
    try {
      final detail = await ShortflixService.getDetail(_item.slug);
      if (!mounted) return;
      setState(() {
        if (detail.item.name.isNotEmpty) _item = detail.item;
        _episodes = detail.episodes.isNotEmpty
            ? detail.episodes
            : [ShortEpisode(episode: 1, videoId: '', title: 'Tập 1', thumbnailUrl: '')];
        _isLoadingDetail = false;
      });
      await _loadEpisode(_activeEpisode);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoadingDetail = false;
        _isLoadingStream = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _loadEpisode(int epNum) async {
    final token = ++_loadToken;
    _handledEndedForToken = false;
    setState(() {
      _activeEpisode = epNum;
      _isLoadingStream = true;
      _error = null;
    });

    try {
      final servers = await ShortflixService.getStreams(_item.slug, epNum);
      if (!mounted || token != _loadToken) return;
      if (servers.isEmpty) {
        setState(() {
          _servers = const [];
          _isLoadingStream = false;
          _error = 'Chưa có luồng phát khả dụng cho tập này.';
        });
        return;
      }

      final chosen = servers.firstWhere(
        (s) => s.isFull == _preferFull,
        orElse: () => servers.first,
      );
      setState(() => _servers = servers);
      await _attachServer(chosen, token);
    } catch (e) {
      if (!mounted || token != _loadToken) return;
      setState(() {
        _isLoadingStream = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _attachServer(ShortStreamServer server, int token) async {
    final old = _controller;
    _controller = null;
    old?.removeListener(_onVideoTick);
    await old?.dispose();

    final captionFile = server.subtitleUrls.isNotEmpty
        ? await ShortflixService.fetchWebVttCaption(server.subtitleUrls.first)
        : null;
    if (!mounted || token != _loadToken) return;

    final candidates = buildShortStreamCandidates(server.url);
    Object? lastError;

    for (final candidateUrl in candidates) {
      final nextController = VideoPlayerController.networkUrl(
        Uri.parse(candidateUrl),
        formatHint: VideoFormat.hls,
        httpHeaders: _hlsHeaders,
        closedCaptionFile: captionFile != null
            ? Future<ClosedCaptionFile>.value(captionFile)
            : null,
      );

      try {
        await nextController.initialize().timeout(const Duration(seconds: 20));
        if (!mounted || token != _loadToken) {
          await nextController.dispose();
          return;
        }
        nextController.addListener(_onVideoTick);
        await nextController.play();
        setState(() {
          _controller = nextController;
          _isLoadingStream = false;
          _error = null;
        });
        _scheduleOverlayHide();
        return;
      } catch (e) {
        lastError = e;
        await nextController.dispose();
        if (!mounted || token != _loadToken) return;
      }
    }

    setState(() {
      _isLoadingStream = false;
      _error = 'Không phát được video: ${lastError ?? 'Lỗi nguồn phát HLS'}';
    });
  }

  void _onVideoTick() {
    if (!mounted) return;
    final ctrl = _controller;
    if (ctrl == null || !ctrl.value.isInitialized) return;
    final val = ctrl.value;
    if (!_handledEndedForToken &&
        !_preferFull &&
        _autoNext &&
        val.duration > const Duration(seconds: 1) &&
        val.position >= val.duration - const Duration(milliseconds: 350) &&
        !val.isPlaying) {
      _handledEndedForToken = true;
      if (_activeEpisode < _episodes.length) {
        _loadEpisode(_activeEpisode + 1);
      }
    }
    setState(() {});
  }

  void _scheduleOverlayHide() {
    _hideTimer?.cancel();
    _hideTimer = Timer(const Duration(seconds: 4), () {
      if (mounted && (_controller?.value.isPlaying ?? false)) {
        setState(() => _showOverlay = false);
      }
    });
  }

  void _togglePlayPause() {
    final ctrl = _controller;
    if (ctrl == null || !ctrl.value.isInitialized) return;
    if (ctrl.value.isPlaying) {
      ctrl.pause();
      setState(() => _showOverlay = true);
    } else {
      ctrl.play();
      setState(() => _showOverlay = true);
      _scheduleOverlayHide();
    }
  }

  void _showEpisodesSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppTheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Chọn Tập (${_episodes.length} tập)',
                style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              Flexible(
                child: GridView.builder(
                  shrinkWrap: true,
                  itemCount: _episodes.length,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 5,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    childAspectRatio: 1.9,
                  ),
                  itemBuilder: (_, idx) {
                    final ep = _episodes[idx];
                    final active = ep.episode == _activeEpisode;
                    return InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: () {
                        Navigator.pop(ctx);
                        _loadEpisode(ep.episode);
                      },
                      child: Container(
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: active ? AppTheme.primary : AppTheme.cardElevated,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: active ? AppTheme.primaryLight : AppTheme.border,
                          ),
                        ),
                        child: Text(
                          'Tập ${ep.episode}',
                          style: TextStyle(
                            color: active ? Colors.white : AppTheme.textSecondary,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
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

  void _showServerSheet() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppTheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Chế độ phát',
                style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              for (final srv in _servers)
                ListTile(
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  tileColor: srv.isFull == _preferFull ? AppTheme.primary.withOpacity(0.18) : null,
                  leading: Icon(
                    srv.isFull ? Icons.playlist_play_rounded : Icons.bolt_rounded,
                    color: srv.isFull == _preferFull ? AppTheme.primaryLight : AppTheme.textSecondary,
                  ),
                  title: Text(srv.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                  trailing: srv.isFull == _preferFull
                      ? const Icon(Icons.check_circle_rounded, color: AppTheme.primary)
                      : null,
                  onTap: () {
                    Navigator.pop(ctx);
                    setState(() => _preferFull = srv.isFull);
                    final token = ++_loadToken;
                    setState(() => _isLoadingStream = true);
                    _attachServer(srv, token);
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDuration(Duration d) {
    final total = d.inSeconds < 0 ? 0 : d.inSeconds;
    final mins = (total ~/ 60).toString().padLeft(2, '0');
    final secs = (total % 60).toString().padLeft(2, '0');
    return '$mins:$secs';
  }

  @override
  Widget build(BuildContext context) {
    final ctrl = _controller;
    final ready = ctrl != null && ctrl.value.isInitialized;
    final durationMs = ready ? ctrl.value.duration.inMilliseconds : 0;
    final positionMs = ready ? ctrl.value.position.inMilliseconds.clamp(0, durationMs > 0 ? durationMs : 1) : 0;

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () {
            setState(() => _showOverlay = !_showOverlay);
            if (_showOverlay) _scheduleOverlayHide();
          },
          onDoubleTap: _togglePlayPause,
          child: Stack(
            fit: StackFit.expand,
            children: [
              // 9:16 Video Surface
              Center(
                child: ready
                    ? AspectRatio(
                        aspectRatio: ctrl.value.aspectRatio > 0 ? ctrl.value.aspectRatio : 9 / 16,
                        child: VideoPlayer(ctrl),
                      )
                    : const SizedBox.shrink(),
              ),

              // WebVTT Subtitles overlay
              if (ready && _showSubtitles && ctrl.value.caption.text.isNotEmpty)
                Positioned(
                  left: 16,
                  right: 16,
                  bottom: _showOverlay ? 148 : 34,
                  child: Center(
                    child: ClosedCaption(
                      text: ctrl.value.caption.text,
                      textStyle: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        height: 1.35,
                      ),
                    ),
                  ),
                ),

              // Loading / Error state
              if (_isLoadingDetail || _isLoadingStream)
                const Center(child: CircularProgressIndicator(color: AppTheme.primary))
              else if (_error != null)
                Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.error_outline, color: AppTheme.primaryLight, size: 42),
                        const SizedBox(height: 10),
                        Text(
                          _error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.white70, fontSize: 14),
                        ),
                        const SizedBox(height: 14),
                        ElevatedButton(
                          onPressed: () => _loadEpisode(_activeEpisode),
                          style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
                          child: const Text('Thử lại', style: TextStyle(color: Colors.white)),
                        ),
                      ],
                    ),
                  ),
                ),

              // Top Header Overlay
              if (_showOverlay)
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(8, 8, 12, 20),
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
                          icon: const Icon(Icons.arrow_back_rounded, color: Colors.white),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _item.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
                              ),
                              Text(
                                _preferFull
                                    ? 'Bản Full (Gộp tất cả tập)'
                                    : 'Tập $_activeEpisode / ${_episodes.length}',
                                style: const TextStyle(color: AppTheme.gold, fontSize: 12, fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          tooltip: _showSubtitles ? 'Tắt phụ đề' : 'Bật phụ đề',
                          icon: Icon(
                            _showSubtitles ? Icons.closed_caption_rounded : Icons.closed_caption_off_rounded,
                            color: _showSubtitles ? AppTheme.gold : Colors.white54,
                          ),
                          onPressed: () => setState(() => _showSubtitles = !_showSubtitles),
                        ),
                      ],
                    ),
                  ),
                ),

              // Center Play/Pause Button
              if (_showOverlay && ready)
                Center(
                  child: IconButton(
                    iconSize: 64,
                    onPressed: _togglePlayPause,
                    icon: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.55),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        ctrl.value.isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                        color: Colors.white,
                        size: 38,
                      ),
                    ),
                  ),
                ),

              // Bottom Controls Overlay
              if (_showOverlay)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(14, 24, 14, 14),
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
                        if (ready && durationMs > 0)
                          Row(
                            children: [
                              Text(
                                _formatDuration(ctrl.value.position),
                                style: const TextStyle(color: Colors.white70, fontSize: 11),
                              ),
                              Expanded(
                                child: SliderTheme(
                                  data: SliderTheme.of(context).copyWith(
                                    trackHeight: 2.5,
                                    thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 6),
                                  ),
                                  child: Slider(
                                    value: positionMs.toDouble(),
                                    min: 0,
                                    max: durationMs.toDouble(),
                                    activeColor: AppTheme.primary,
                                    inactiveColor: Colors.white24,
                                    onChanged: (v) {
                                      ctrl.seekTo(Duration(milliseconds: v.toInt()));
                                      _scheduleOverlayHide();
                                    },
                                  ),
                                ),
                              ),
                              Text(
                                _formatDuration(ctrl.value.duration),
                                style: const TextStyle(color: Colors.white70, fontSize: 11),
                              ),
                            ],
                          ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: _activeEpisode > 1 ? () => _loadEpisode(_activeEpisode - 1) : null,
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: Colors.white,
                                  side: const BorderSide(color: Colors.white24),
                                  padding: const EdgeInsets.symmetric(vertical: 10),
                                ),
                                child: const Text('Tập trước', style: TextStyle(fontSize: 12)),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: OutlinedButton(
                                onPressed: _episodes.isNotEmpty ? _showEpisodesSheet : null,
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: Colors.white,
                                  side: const BorderSide(color: Colors.white24),
                                  padding: const EdgeInsets.symmetric(vertical: 10),
                                ),
                                child: const Text('Danh sách tập', style: TextStyle(fontSize: 12)),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: OutlinedButton(
                                onPressed: _servers.isNotEmpty ? _showServerSheet : null,
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: AppTheme.gold,
                                  side: BorderSide(color: AppTheme.gold.withOpacity(0.6)),
                                  padding: const EdgeInsets.symmetric(vertical: 10),
                                ),
                                child: Text(
                                  _preferFull ? 'Bản Full' : 'Tập lẻ',
                                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: ElevatedButton(
                                onPressed: _activeEpisode < _episodes.length ? () => _loadEpisode(_activeEpisode + 1) : null,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AppTheme.primary,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(vertical: 10),
                                ),
                                child: const Text('Tập sau', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
