import 'package:flutter_test/flutter_test.dart';
import 'package:cineviet/models/movie_detail.dart';
import 'package:cineviet/services/download_service.dart';

void main() {
  group('DownloadService source capability tests', () {
    test('canDownloadEpisode distinguishes direct M3U8 from 3rd-party Embed', () {
      final m3u8Ep = EpisodeItem(
        name: 'Tập 1',
        slug: 'tap-1',
        filename: 'tap-1.mp4',
        linkEmbed: 'https://player.phimapi.com/embed?id=123',
        linkM3u8: 'https://stream.phimapi.com/hls/tap-1/index.m3u8',
      );

      final embedOnlyEp = EpisodeItem(
        name: 'Tập 2',
        slug: 'tap-2',
        filename: 'tap-2.mp4',
        linkEmbed: 'https://player.phimapi.com/embed?id=124',
        linkM3u8: '',
      );

      final invalidM3u8Ep = EpisodeItem(
        name: 'Tập 3',
        slug: 'tap-3',
        filename: 'tap-3.mp4',
        linkEmbed: 'https://player.phimapi.com/embed?id=125',
        linkM3u8: 'not-a-url',
      );

      expect(DownloadService.canDownloadEpisode(m3u8Ep), isTrue);
      expect(DownloadService.canDownloadEpisode(embedOnlyEp), isFalse);
      expect(DownloadService.canDownloadEpisode(invalidM3u8Ep), isFalse);
    });

    test('serverSupportsOffline detects mixed server list', () {
      final hlsServer = ServerItem(
        serverName: 'Server #1 (HLS Trực tiếp)',
        episodes: [
          EpisodeItem(
            name: 'Tập 1',
            slug: 'tap-1',
            filename: '',
            linkEmbed: '',
            linkM3u8: 'https://cdn.example.com/stream.m3u8',
          )
        ],
      );

      final embedServer = ServerItem(
        serverName: 'Server #2 (Web Embed)',
        episodes: [
          EpisodeItem(
            name: 'Tập 1',
            slug: 'tap-1',
            filename: '',
            linkEmbed: 'https://embed.example.com/play/1',
            linkM3u8: '',
          )
        ],
      );

      expect(DownloadService.serverSupportsOffline(hlsServer), isTrue);
      expect(DownloadService.serverSupportsOffline(embedServer), isFalse);
    });

    test('findM3u8Alternative retrieves M3U8 source from another server', () {
      final embedServer = ServerItem(
        serverName: 'Server #2 (Embed)',
        episodes: [
          EpisodeItem(
            name: 'Tập 1',
            slug: 'tap-1',
            filename: '',
            linkEmbed: 'https://embed.example.com/play/1',
            linkM3u8: '',
          )
        ],
      );

      final hlsServer = ServerItem(
        serverName: 'Server #1 (HLS)',
        episodes: [
          EpisodeItem(
            name: 'Tập 1',
            slug: 'tap-1',
            filename: '',
            linkEmbed: '',
            linkM3u8: 'https://cdn.example.com/stream.m3u8',
          )
        ],
      );

      final match = DownloadService.findM3u8Alternative([embedServer, hlsServer], 'tap-1');
      expect(match, isNotNull);
      expect(match!.server.serverName, 'Server #1 (HLS)');
      expect(match.episode.linkM3u8, 'https://cdn.example.com/stream.m3u8');
    });

    test('DownloadedEpisode serialization and formattedSize', () {
      final episode = DownloadedEpisode(
        movieSlug: 'bo-gia',
        movieName: 'Bố Già',
        posterUrl: 'https://img.example.com/poster.jpg',
        thumbUrl: 'https://img.example.com/thumb.jpg',
        serverName: 'Server #1',
        episodeName: 'Tập 1',
        episodeSlug: 'tap-1',
        downloadUrl: 'https://cdn.example.com/stream.m3u8',
        localFilePath: '/data/user/0/cineviet/files/tap-1.mp4',
        fileSizeBytes: 150 * 1024 * 1024, // 150 MB
        downloadedAt: DateTime(2026, 11, 1, 12, 0, 0),
        isCompleted: true,
      );

      expect(episode.formattedSize, '150.0 MB');

      final json = episode.toJson();
      final revived = DownloadedEpisode.fromJson(json);

      expect(revived.movieSlug, 'bo-gia');
      expect(revived.movieName, 'Bố Già');
      expect(revived.fileSizeBytes, 150 * 1024 * 1024);
      expect(revived.isCompleted, isTrue);
    });
  });
}
