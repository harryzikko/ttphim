import 'dart:convert';

class EmbedPolicy {
  static bool isValidSource(String source) {
    final uri = Uri.tryParse(source);
    return uri != null && uri.scheme == 'https' && uri.host.isNotEmpty && uri.userInfo.isEmpty;
  }

  static String iframeSource(String source) {
    if (!isValidSource(source)) throw ArgumentError('Embed source must use HTTPS');
    return const HtmlEscape(HtmlEscapeMode.attribute).convert(source);
  }

  static bool allowsNavigation(String source, String destination) {
    if (destination == 'about:blank') return true;
    if (!isValidSource(source) || !isValidSource(destination)) return false;
    final trusted = Uri.parse(source);
    final target = Uri.parse(destination);
    return target.host == trusted.host && target.port == trusted.port;
  }
}
