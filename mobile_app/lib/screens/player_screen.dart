import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import 'package:chewie/chewie.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/movie.dart';
import '../models/movie_detail.dart';
import '../services/storage_service.dart';
import '../theme/app_theme.dart';

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

  VideoPlayerController? _videoPlayerController;
  ChewieController? _chewieController;
  bool _isPlayerInitializing = true;
  String? _errorMessage;
  Timer? _historyTimer;

  @override
  void initState() {
    super.initState();
    _currentServer = widget.initialServer;
    _currentEpisode = widget.initialEpisode;
    _initPlayer();

    // Save watch history periodically every 10 seconds
    _historyTimer = Timer.periodic(const Duration(seconds: 10), (_) => _saveProgress());
  }

  Future<void> _initPlayer() async {
    setState(() {
      _isPlayerInitializing = true;
      _errorMessage = null;
    });

    await _disposeControllers();

    final streamUrl = _currentEpisode.linkM3u8;
    if (streamUrl.isEmpty) {
      setState(() {
        _isPlayerInitializing = false;
        _errorMessage = 'Link phát video không khả dụng cho tập này.';
      });
      return;
    }

    try {
      _videoPlayerController = VideoPlayerController.networkUrl(
        Uri.parse(streamUrl),
        httpHeaders: const {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://phimapi.com/',
        },
      );

      await _videoPlayerController!.initialize();

      _chewieController = ChewieController(
        videoPlayerController: _videoPlayerController!,
        autoPlay: true,
        looping: false,
        aspectRatio: _videoPlayerController!.value.aspectRatio > 0
            ? _videoPlayerController!.value.aspectRatio
            : 16 / 9,
        allowFullScreen: true,
        allowMuting: true,
        showControls: true,
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
                  const Icon(Icons.error_outline, color: AppTheme.primary, size: 48),
                  const SizedBox(height: 12),
                  const Text(
                    'Không thể tải luồng video.',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton(
                    onPressed: _initPlayer,
                    style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
                    child: const Text('Thử Lại', style: TextStyle(color: Colors.white)),
                  ),
                  if (_currentEpisode.linkEmbed.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _openEmbedPlayer,
                      child: const Text('Mở Bằng Web Player Fallback', style: TextStyle(color: AppTheme.cyan)),
                    ),
                  ],
                ],
              ),
            ),
          );
        },
      );

      if (mounted) {
        setState(() {
          _isPlayerInitializing = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isPlayerInitializing = false;
          _errorMessage = 'Lỗi phát video: $e';
        });
      }
    }
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
    });
    _initPlayer();
  }

  void _switchServer(ServerItem newServer) {
    if (_currentServer.serverName == newServer.serverName) return;
    _saveProgress();
    setState(() {
      _currentServer = newServer;
      if (newServer.episodes.isNotEmpty) {
        // Try to match the same episode name in the new server
        final match = newServer.episodes.firstWhere(
          (ep) => ep.slug == _currentEpisode.slug,
          orElse: () => newServer.episodes.first,
        );
        _currentEpisode = match;
      }
    });
    _initPlayer();
  }

  Future<void> _openEmbedPlayer() async {
    final url = _currentEpisode.linkEmbed;
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
  }

  @override
  void dispose() {
    _historyTimer?.cancel();
    _saveProgress();
    _disposeControllers();
    // Restore orientation
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            // Top Video Player Area
            AspectRatio(
              aspectRatio: 16 / 9,
              child: Container(
                color: Colors.black,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    if (_isPlayerInitializing)
                      const Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            CircularProgressIndicator(color: AppTheme.primary),
                            SizedBox(height: 12),
                            Text(
                              'Đang tải luồng phim HLS...',
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
                                    onPressed: _initPlayer,
                                    style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
                                    child: const Text('Thử Lại', style: TextStyle(color: Colors.white)),
                                  ),
                                  if (_currentEpisode.linkEmbed.isNotEmpty) ...[
                                    const SizedBox(width: 8),
                                    ElevatedButton(
                                      onPressed: _openEmbedPlayer,
                                      style: ElevatedButton.styleFrom(backgroundColor: AppTheme.card),
                                      child: const Text('Mở Web', style: TextStyle(color: AppTheme.cyan)),
                                    ),
                                  ],
                                ],
                              ),
                            ],
                          ),
                        ),
                      )
                    else if (_chewieController != null && _videoPlayerController != null)
                      Chewie(controller: _chewieController!),

                    // Floating Back Button
                    Positioned(
                      top: 8,
                      left: 8,
                      child: CircleAvatar(
                        radius: 16,
                        backgroundColor: Colors.black54,
                        child: IconButton(
                          padding: EdgeInsets.zero,
                          icon: const Icon(Icons.arrow_back, color: Colors.white, size: 18),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // Bottom Movie Details & Episode Grid
            Expanded(
              child: Container(
                color: AppTheme.background,
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  physics: const BouncingScrollPhysics(),
                  children: [
                    // Title & Current Episode Info
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
                                ],
                              ),
                            ],
                          ),
                        ),
                        if (_currentEpisode.linkEmbed.isNotEmpty)
                          IconButton(
                            icon: const Icon(Icons.open_in_browser, color: AppTheme.textSecondary),
                            tooltip: 'Mở bằng trình duyệt',
                            onPressed: _openEmbedPlayer,
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

                    // Episode Grid
                    Text(
                      'Tập Phim (${_currentServer.episodes.length}):',
                      style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 10),

                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 4,
                        childAspectRatio: 2.2,
                        crossAxisSpacing: 8,
                        mainAxisSpacing: 8,
                      ),
                      itemCount: _currentServer.episodes.length,
                      itemBuilder: (context, idx) {
                        final ep = _currentServer.episodes[idx];
                        final isPlaying = ep.slug == _currentEpisode.slug;

                        return ElevatedButton(
                          onPressed: () => _switchEpisode(ep),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: isPlaying ? AppTheme.primary : AppTheme.card,
                            padding: EdgeInsets.zero,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(6),
                              side: BorderSide(
                                color: isPlaying ? AppTheme.primaryLight : AppTheme.border,
                              ),
                            ),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              if (isPlaying) ...[
                                const Icon(Icons.play_arrow, color: Colors.white, size: 14),
                                const SizedBox(width: 2),
                              ],
                              Text(
                                ep.name,
                                style: TextStyle(
                                  color: isPlaying ? Colors.white : AppTheme.textPrimary,
                                  fontSize: 12,
                                  fontWeight: isPlaying ? FontWeight.bold : FontWeight.normal,
                                ),
                              ),
                            ],
                          ),
                        );
                      },
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
}
