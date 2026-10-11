import 'dart:async';
import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:ttphim/services/api_service.dart';
import 'package:ttphim/services/backend_service.dart';
import 'package:ttphim/services/storage_service.dart';

http.Response ok(Map<String, dynamic> value) => http.Response(json.encode(value), 200);
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FlutterSecureStorage.setMockInitialValues({});
  });
  test('legacy token migrates to secure storage and leaves no plaintext credentials', () async {
    SharedPreferences.setMockInitialValues({'ttphim_token': 'legacy', 'ttphim_user': '{"id":"a"}'});
    expect(await StorageService.getToken(), 'legacy');
    expect((await StorageService.getUser())?['id'], 'a');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('ttphim_token'), isNull);
    expect(prefs.getString('ttphim_user'), isNull);
  });
  test('a late restore response does not log the user back in after logout', () async {
    await StorageService.saveSession('token-a', {'id': 'a'});
    final started = Completer<void>();
    final pending = Completer<http.Response>();
    BackendService.setClientForTesting(MockClient((request) { started.complete(); return pending.future; }));
    final restoring = ApiService.restoreSession();
    await started.future;
    await ApiService.logout();
    pending.complete(ok({'status': true, 'data': {'id': 'a'}}));
    expect(await restoring, isNull);
    expect(await StorageService.getToken(), isNull);
  });
  test('offline progress is retried, remote progress parsed, and a remote clear removes synced cache', () async {
    await StorageService.saveSession('token-a', {'id': 'a'});
    var online = false;
    Map<String, dynamic>? remote;
    var posts = 0;
    BackendService.setClientForTesting(MockClient((request) async {
      if (!online) throw http.ClientException('offline');
      if (request.url.path.endsWith('/history')) {
        posts++;
        remote = {...json.decode(request.body) as Map<String, dynamic>, 'updated_at': DateTime.now().toIso8601String()};
        return ok({'status': true});
      }
      return ok({'status': true, 'data': {'watchlist': [], 'history': remote == null ? [] : [remote]}});
    }));
    await StorageService.saveHistory(WatchHistoryItem(movieSlug: 'film', movieName: 'Film', posterUrl: '',
      episodeSlug: 'tap-2', episodeName: '2', serverName: 'Backup', positionSeconds: 90, durationSeconds: 600, updatedAt: DateTime.now()));
    expect((await StorageService.getHistory()).single.positionSeconds, 90);
    online = true;
    expect((await StorageService.getHistory()).single.serverName, 'Backup');
    expect(posts, 1);
    remote = null;
    expect(await StorageService.getHistory(), isEmpty);
  });
  test('a library response for the old account is not displayed after logout', () async {
    await StorageService.saveSession('token-a', {'id': 'a'});
    final started = Completer<void>();
    final pending = Completer<http.Response>();
    BackendService.setClientForTesting(MockClient((request) { started.complete(); return pending.future; }));
    final reading = StorageService.getFavorites();
    await started.future;
    await ApiService.logout();
    pending.complete(ok({'status': true, 'data': {'watchlist': [{'movie_slug': 'private', 'movie_name': 'Private'}], 'history': []}}));
    expect(await reading, isEmpty);
  });
}
