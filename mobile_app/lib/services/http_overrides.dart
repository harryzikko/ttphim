import 'dart:io';

/// Global HTTP overrides to bypass outdated Android TV / legacy device root CA handshake failures.
/// Ensures all HTTPS requests (API, TMDb, PhimAPI, CDNs, CachedNetworkImage) succeed smoothly.
class CineVietHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return super.createHttpClient(context)
      ..badCertificateCallback = (X509Certificate cert, String host, int port) => true;
  }
}
