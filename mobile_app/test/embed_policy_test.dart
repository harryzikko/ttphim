import 'package:flutter_test/flutter_test.dart';
import 'package:ttphim/services/app_config.dart';
import 'package:ttphim/services/embed_policy.dart';

void main() {
  test('embed navigation validates exact HTTPS host and port', () {
    const source = 'https://player.example.com/embed';
    expect(EmbedPolicy.allowsNavigation(source, '$source?episode=2'), isTrue);
    expect(EmbedPolicy.allowsNavigation(source, 'about:blank'), isTrue);
    for (final value in [
      'https://attacker.example/?m3u8',
      'https://attacker.example/?next=player.example.com',
      'https://player.example.com.attacker.example/',
      'https://player.example.com:8443/',
      'http://player.example.com/',
      'javascript:alert(1)',
      'data:text/html,unsafe',
      'intent://unsafe',
    ]) {
      expect(EmbedPolicy.allowsNavigation(source, value), isFalse, reason: value);
    }
  });

  test('iframe sources reject executable schemes and escape attributes', () {
    expect(() => EmbedPolicy.iframeSource('javascript:alert(1)'), throwsArgumentError);
    expect(EmbedPolicy.iframeSource('https://player.example.com/?x="&y=1'), contains('&quot;'));
    expect(EmbedPolicy.iframeSource('https://player.example.com/?x=1&y=2'), contains('&amp;'));
  });

  test('release backend policy rejects cleartext, local and malformed origins', () {
    expect(AppConfig.isProductionBackendUrl('https://cinema.example.com'), isTrue);
    for (final value in [
      '', 'http://cinema.example.com', 'https://localhost', 'https://127.0.0.1',
      'https://10.0.0.1', 'https://192.168.1.1', 'https://172.16.0.1',
      'https://backend.test', 'https://cinema.example.com/api',
      'https://user:password@cinema.example.com', 'https://cinema.example.com:3001',
    ]) {
      expect(AppConfig.isProductionBackendUrl(value), isFalse, reason: value);
    }
  });
}
