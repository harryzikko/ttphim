import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:cineviet/models/short_drama.dart';
import 'package:cineviet/screens/short_phim_screen.dart';
import 'package:cineviet/services/app_config.dart';
import 'package:cineviet/services/backend_service.dart';
import 'package:cineviet/services/shortflix_service.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    AppConfig.setCustomUrl('https://backend.test');
  });

  test('ShortStreamServer resolves relative /api/shortflix playlist & subtitle URLs cleanly', () {
    final server = ShortStreamServer.fromJson({
      'name': 'Bản Full (Gộp tất cả tập)',
      'is_full': true,
      'url': '/api/shortflix/playlist?url=https%3A%2F%2Fshortflix.example%2Fm3u8',
      'subtitles': [
        {'proxy_url': '/api/shortflix/subtitle?url=https%3A%2F%2Fshortlink.example%2Fsub'}
      ],
    });

    expect(server.isFull, true);
    expect(server.url, 'https://backend.test/api/shortflix/playlist?url=https%3A%2F%2Fshortflix.example%2Fm3u8');
    expect(server.subtitleUrls.single, 'https://backend.test/api/shortflix/subtitle?url=https%3A%2F%2Fshortlink.example%2Fsub');
  });

  test('ShortflixService fetches catalog, detail, streams and parses WebVTT subtitles', () async {
    BackendService.setClientForTesting(MockClient((req) async {
      if (req.url.path == '/api/shortflix/catalog') {
        return http.Response(
          json.encode({
            'status': true,
            'data': {
              'genres': ['Tổng tài', 'Ngôn tình'],
              'pagination': {'page': 1, 'hasMore': true},
              'items': [
                {
                  'slug': 'short-test-1',
                  'name': 'Tổng Tài Thử Thách',
                  'poster_url': '',
                  'poster_fallback_url': '',
                  'description': 'Loạt phim 30 tập',
                  'episode_count_hint': 30,
                }
              ],
            }
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (req.url.path == '/api/shortflix/stream/short-test-1/1') {
        return http.Response(
          json.encode({
            'status': true,
            'data': {
              'slug': 'short-test-1',
              'episode': 1,
              'servers': [
                {
                  'name': 'Bản Full',
                  'is_full': true,
                  'url': '/api/shortflix/playlist?url=test',
                  'subtitles': [{'proxy_url': '/api/shortflix/subtitle?url=test'}],
                }
              ],
            }
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }
      if (req.url.path == '/api/shortflix/subtitle') {
        return http.Response(
          'WEBVTT\n\n00:00:00.500 --> 00:00:02.000\nXin chào CineViet!',
          200,
          headers: {'content-type': 'text/vtt; charset=utf-8'},
        );
      }
      return http.Response('{"status":false}', 404);
    }));

    final cat = await ShortflixService.getCatalog(page: 1);
    expect(cat.items.single.slug, 'short-test-1');
    expect(cat.genres, contains('Tổng tài'));
    expect(cat.hasMore, true);

    final streams = await ShortflixService.getStreams('short-test-1', 1);
    expect(streams.single.url, startsWith('https://backend.test/api/shortflix/playlist'));

    final captions = await ShortflixService.fetchWebVttCaption(streams.single.subtitleUrls.single);
    expect(captions.captions.length, 1);
    expect(captions.captions.first.text, contains('Xin chào CineViet!'));
  });

  testWidgets('ShortPhimScreen renders catalog items safely without image failures', (tester) async {
    BackendService.setClientForTesting(MockClient((req) async {
      return http.Response(
        json.encode({
          'status': true,
          'data': {
            'genres': ['Tổng tài'],
            'pagination': {'page': 1, 'hasMore': false},
            'items': [
              {
                'slug': 'short-ui-1',
                'name': 'Phim Ngắn Dọc 1',
                'poster_url': '',
                'poster_fallback_url': '',
                'description': 'Test UI',
                'episode_count_hint': 25,
              }
            ],
          }
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    }));

    await tester.pumpWidget(const MaterialApp(home: ShortPhimScreen()));
    await tester.pumpAndSettle();

    expect(find.text('Short Phim'), findsOneWidget);
    expect(find.text('Phim Ngắn Dọc 1'), findsOneWidget);
    expect(find.text('25 tập'), findsOneWidget);
  });
}
