import 'package:flutter_test/flutter_test.dart';
import 'package:cineviet/models/app_banner_config.dart';

void main() {
  test('AppBannerConfig defaults popunderOnClose to true', () {
    final def = AppBannerConfig.defaults();
    expect(def.popunderOnClose, isTrue);
  });

  test('AppBannerConfig parses popunder_on_close correctly', () {
    final configTrue = AppBannerConfig.fromJson({
      'enabled': true,
      'popunder_on_close': true,
    });
    expect(configTrue.popunderOnClose, isTrue);

    final configFalse = AppBannerConfig.fromJson({
      'enabled': true,
      'popunder_on_close': false,
    });
    expect(configFalse.popunderOnClose, isFalse);

    // Missing key should default to true
    final configMissing = AppBannerConfig.fromJson({
      'enabled': true,
    });
    expect(configMissing.popunderOnClose, isTrue);
  });
}
