import 'dart:convert';
import 'app_config.dart';

class EmbedPolicy {
  static const List<String> _allowedRoots = [
    'streamc.xyz',
    'nguonc.com',
    'vicdn.cc',
    'cineviet.live',
    'phimapi.com',
    'opstream16.com',
    'cloudflare.com',
    'challenges.cloudflare.com',
    'jwpcdn.com',
    'byteark.com',
    'akamaized.net',
    'googleapis.com',
    'gstatic.com',
  ];

  static String resolveUrl(String source) {
    final trimmed = source.trim();
    if (trimmed.startsWith('/')) {
      final base = AppConfig.backendUrl.replaceAll(RegExp(r'/+$'), '');
      return '$base$trimmed';
    }
    return trimmed;
  }

  static bool isValidSource(String source) {
    final resolved = resolveUrl(source);
    final uri = Uri.tryParse(resolved);
    return uri != null && uri.scheme == 'https' && uri.host.isNotEmpty && uri.userInfo.isEmpty;
  }

  static String iframeSource(String source) {
    final resolved = resolveUrl(source);
    if (!isValidSource(resolved)) throw ArgumentError('Embed source must use HTTPS');
    return const HtmlEscape(HtmlEscapeMode.attribute).convert(resolved);
  }

  static bool allowsNavigation(String source, String destination) {
    if (destination == 'about:blank') return true;
    final resolvedSource = resolveUrl(source);
    final resolvedDestination = resolveUrl(destination);
    if (!isValidSource(resolvedSource) || !isValidSource(resolvedDestination)) return false;
    final trusted = Uri.parse(resolvedSource);
    final target = Uri.parse(resolvedDestination);

    final targetHost = target.host.toLowerCase();
    final trustedHost = trusted.host.toLowerCase();

    // Exact host and port match
    if (targetHost == trustedHost && target.port == trusted.port) return true;

    // Check trusted roots
    for (final root in _allowedRoots) {
      if (targetHost == root || targetHost.endsWith('.$root')) {
        return true;
      }
    }

    // Subdomain match on same 2nd-level domain (e.g. embed13.streamc.xyz <-> streamc.xyz)
    final trustedParts = trustedHost.split('.');
    final targetParts = targetHost.split('.');
    if (trustedParts.length >= 2 && targetParts.length >= 2) {
      final trustedRoot = trustedParts.sublist(trustedParts.length - 2).join('.');
      final targetRoot = targetParts.sublist(targetParts.length - 2).join('.');
      if (trustedRoot == targetRoot && target.port == trusted.port) return true;
    }

    return false;
  }
}
