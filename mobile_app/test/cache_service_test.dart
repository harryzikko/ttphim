import 'package:cineviet/services/api_service.dart';
import 'package:cineviet/services/cache_service.dart';
import 'package:cineviet/services/season_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('CacheService formats byte sizes clearly for UI display', () {
    expect(CacheService.formatBytes(0), '0 KB');
    expect(CacheService.formatBytes(512), '1 KB');
    expect(CacheService.formatBytes(1024 * 1024), '1.0 MB');
    expect(CacheService.formatBytes((28.4 * 1024 * 1024).round()), '28.4 MB');
    expect(CacheService.formatBytes(2 * 1024 * 1024 * 1024), '2.00 GB');
  });

  test('clearHomeCache removes persisted home feed and clearAllCaches stays safe without platform plugins', () async {
    SharedPreferences.setMockInitialValues({
      'cineviet_cached_home': '{"items":[]}',
    });
    await ApiService.clearHomeCache();
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('cineviet_cached_home'), isNull);

    SeasonService.clearCache();
    final freed = await CacheService.clearAllCaches();
    expect(freed, greaterThanOrEqualTo(0));
  });
}
