import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:ttphim/models/movie.dart';
import 'package:ttphim/models/movie_detail.dart';
import 'package:ttphim/screens/search_screen.dart';
import 'package:ttphim/screens/tv/tv_card.dart';
import 'package:ttphim/screens/tv/tv_qr_login_screen.dart';
import 'package:ttphim/services/api_service.dart';
import 'package:ttphim/services/app_config.dart';
import 'package:ttphim/services/backend_service.dart';
import 'package:ttphim/services/storage_service.dart';
import 'package:ttphim/services/season_service.dart';

http.Response response(Map<String, dynamic> value) => http.Response(json.encode(value), 200, headers: {'content-type': 'application/json'});
Map<String, dynamic> movieJson(String name) => {'slug': name, 'name': name, 'poster_url': '', 'thumb_url': ''};

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
    ApiService.setClientForTesting(MockClient((_) async => response({'status': true, 'data': {'watchlist': [], 'history': []}})));
  });

  test('history stores the actual episode, server, timestamp and progress', () async {
    final item = WatchHistoryItem(movieSlug: 'film', movieName: 'Film', posterUrl: '', serverName: 'Backup',
      episodeName: '2', episodeSlug: 'tap-2', positionSeconds: 120, durationSeconds: 600, updatedAt: DateTime(2026));
    await StorageService.saveHistory(item);
    final restored = await StorageService.getHistoryForMovie('film');
    expect(restored?.episodeSlug, 'tap-2');
    expect(restored?.serverName, 'Backup');
    expect(restored?.progressPercentage, 0.2);
    expect(restored?.updatedAt, DateTime(2026));
    expect(WatchHistoryItem.fromJson(item.toJson()).positionSeconds, 120);
  });

  test('auto-next preference and session persist', () async {
    expect(await StorageService.getAutoNext(), true);
    await StorageService.setAutoNext(false);
    expect(await StorageService.getAutoNext(), false);
    await StorageService.saveSession('token', {'id': 'user'});
    expect(await StorageService.getToken(), 'token');
  });

  test('backend and provider detail contracts both parse streaming episodes', () {
    final detail = MovieDetailResponse.fromJson({'movie': movieJson('film'), 'episodes': [
      {'server_name': 'Backup', 'server_data': [{'name': '2', 'slug': 'tap-2', 'link_m3u8': 'https://video.test/a.m3u8'}]}
    ]});
    expect(detail.movie.slug, 'film');
    expect(detail.servers.single.episodes.single.linkM3u8, contains('.m3u8'));
  });


  test('session tokens are stored securely and logout removes both secure and legacy credentials', () async {
    await StorageService.saveSession('secret-token', {'id': 'user-a'});
    expect(await StorageService.getToken(), 'secret-token');
    expect((await SharedPreferences.getInstance()).getString('ttphim_token'), isNull);
    await StorageService.clearSession();
    expect(await StorageService.getToken(), isNull);
    expect(await StorageService.getUser(), isNull);
  });

  test('expired backend auth clears the session, while guest library remains isolated', () async {
    await StorageService.saveSession('expired-token', {'id': 'user-a'});
    BackendService.setClientForTesting(MockClient((request) async => http.Response('{"status":false}', 401)));
    await ApiService.restoreSession();
    expect(await StorageService.getToken(), isNull);
    final favorites = await StorageService.getFavorites();
    expect(favorites, isEmpty);
  });

  test('account library changes use the backend and do not become guest data after logout', () async {
    await StorageService.saveSession('account-token', {'id': 'user-a'});
    BackendService.setClientForTesting(MockClient((request) async {
      if (request.url.path.endsWith('/toggle')) return response({'status': true, 'data': {'added': true}});
      if (request.url.path.endsWith('/library')) return response({'status': true, 'data': {'watchlist': [{'movie_slug': 'account-film', 'movie_name': 'account-film', 'poster_url': '', 'thumb_url': ''}], 'history': []}});
      return response({'status': true});
    }));
    await StorageService.toggleFavorite(Movie.fromJson(movieJson('account-film')));
    expect((await StorageService.getFavorites()).single.slug, 'account-film');
    await StorageService.clearSession();
    expect(await StorageService.getFavorites(), isEmpty);
  });
  testWidgets('TV movie card activates with remote OK and Enter', (tester) async {
    var selected = 0;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: TvMovieCard(
      movie: Movie.fromJson(movieJson('film')), onSelect: () => selected++))));
    final focus = tester.widget<Focus>(find.descendant(of: find.byType(TvMovieCard), matching: find.byType(Focus)).first);
    final node = FocusNode();
    expect(focus.onKeyEvent!(node, const KeyDownEvent(physicalKey: PhysicalKeyboardKey.enter,
      logicalKey: LogicalKeyboardKey.enter, timeStamp: Duration.zero)), KeyEventResult.handled);
    expect(focus.onKeyEvent!(node, const KeyDownEvent(physicalKey: PhysicalKeyboardKey.select,
      logicalKey: LogicalKeyboardKey.select, timeStamp: Duration.zero)), KeyEventResult.handled);
    expect(selected, 2);
    node.dispose();
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('out-of-order searches cannot overwrite the latest keyword or repopulate a cleared field', (tester) async {
    final requests = <String, Completer<http.Response>>{};
    ApiService.setClientForTesting(MockClient((request) {
      final keyword = request.url.queryParameters['keyword']!;
      final completion = Completer<http.Response>();
      requests[keyword] = completion;
      return completion.future;
    }));
    await tester.pumpWidget(const MaterialApp(home: SearchScreen()));
    await tester.enterText(find.byType(TextField), 'old');
    await tester.pump(const Duration(milliseconds: 550));
    await tester.enterText(find.byType(TextField), 'new');
    await tester.pump(const Duration(milliseconds: 550));
    requests['new']!.complete(response({'data': {'items': [movieJson('New Result')]}}));
    await tester.pump(); await tester.pump(const Duration(milliseconds: 300));
    requests['old']!.complete(response({'data': {'items': [movieJson('Old Result')]}}));
    await tester.pump(); await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('New Result'), findsOneWidget);
    expect(find.text('Old Result'), findsNothing);
    await tester.enterText(find.byType(TextField), 'pending');
    await tester.pump(const Duration(milliseconds: 550));
    await tester.enterText(find.byType(TextField), '');
    requests['pending']!.complete(response({'data': {'items': [movieJson('Unexpected')]}}));
    await tester.pump();
    expect(find.text('Unexpected'), findsNothing);
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('QR is a locally encoded destination URL and approved token is persisted before success', (tester) async {
    if (!AppConfig.hasBackend) return;
    await tester.binding.setSurfaceSize(const Size(1280, 800));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    var approved = false;
    var success = false;
    ApiService.setClientForTesting(MockClient((request) async {
      if (request.url.path.endsWith('/session')) return response({'status': true, 'data': {
        'token': 'session', 'code': '123456', 'qr_url': 'https://backend.test/tv-auth?token=session'
      }});
      return response(approved ? {'status': 'approved', 'token': 'jwt', 'user': {'id': 'user', 'name': 'User'}} : {'status': 'pending'});
    }));
    await tester.pumpWidget(MaterialApp(home: TvQrLoginScreen(onLoginSuccess: () => success = true)));
    await tester.pump(); await tester.pump(const Duration(milliseconds: 200));
    expect(tester.widget<QrImageView>(find.byType(QrImageView)).key, const ValueKey('https://backend.test/tv-auth?token=session'));
    approved = true;
    await tester.pump(const Duration(seconds: 2)); await tester.pump();
    expect(await StorageService.getToken(), 'jwt');
    expect(success, false);
    await tester.pump(const Duration(seconds: 2));
    expect(success, true);
    await tester.pumpWidget(const SizedBox());
  });

  test('TV authorization sends authenticated identity to the configured host', () async {
    if (!AppConfig.hasBackend) {
      expect((await ApiService.authorizeTvSession('123456'))['success'], false);
      return;
    }
    await StorageService.saveSession('jwt', {'id': 'user'});
    http.Request? sent;
    ApiService.setClientForTesting(MockClient((request) async { sent = request; return response({'status': true, 'message': 'OK'}); }));
    expect((await ApiService.authorizeTvSession('https://backend.test/tv-auth?token=session'))['success'], true);
    expect(sent?.headers['Authorization'], 'Bearer jwt');
    expect(json.decode(sent!.body)['token'], 'session');
    expect(sent!.url.host, Uri.parse(AppConfig.backendUrl).host);
  });

  test('SeasonService franchise normalization and season number extraction match requirements', () {
    expect(SeasonService.extractFranchiseName('Đấu Phá Thương Khung (Phần 5)'), 'Đấu Phá Thương Khung');
    expect(SeasonService.extractFranchiseName('Đấu Phá Thương Khung 4: Đào Vong'), 'Đấu Phá Thương Khung');
    expect(SeasonService.extractFranchiseName('Đấu Phá Thương Khung Bản Đặc Biệt 1 (Định Mệnh)'), 'Đấu Phá Thương Khung');
    expect(SeasonService.extractSeasonNumber('Đấu Phá Thương Khung (Phần 5)'), 5);
    expect(SeasonService.extractSeasonNumber('Đấu Phá Thương Khung Bản Đặc Biệt 2'), 100);
    expect(SeasonService.formatSeasonLabel('Đấu Phá Thương Khung (Phần 5)', 5, 2022), 'Phần 5 (2022)');
  });

  test('ApiService getTopRankings returns authentic top ranked movies when backend home is absent', () async {
    final top = await ApiService.getTopRankings();
    expect(top.length, 10);
    expect(top.first.slug, 'than-y-co-dai-o-do-thi-do-thi-co-tien-y');
    expect(top.any((m) => m.slug == 'su-huynh-a-su-huynh'), isTrue);
  });
}
