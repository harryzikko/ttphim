class AppUpdateInfo {
  final bool enabled;
  final String latestVersion;
  final int latestBuild;
  final bool forceUpdate;
  final String title;
  final String releaseNotes;
  final String apkMobileUrl;
  final String apkTvUrl;
  final String iosUrl;

  const AppUpdateInfo({
    required this.enabled,
    required this.latestVersion,
    required this.latestBuild,
    required this.forceUpdate,
    required this.title,
    required this.releaseNotes,
    required this.apkMobileUrl,
    required this.apkTvUrl,
    required this.iosUrl,
  });

  factory AppUpdateInfo.fromJson(Map<String, dynamic> json) {
    return AppUpdateInfo(
      enabled: json['enabled'] != false,
      latestVersion: json['latest_version'] as String? ?? '1.0.0',
      latestBuild: (json['latest_build'] as num?)?.toInt() ?? 1,
      forceUpdate: json['force_update'] == true,
      title: json['title'] as String? ?? 'Bản Cập Nhật Mới',
      releaseNotes: json['release_notes'] as String? ?? '',
      apkMobileUrl: json['apk_mobile_url'] as String? ?? '',
      apkTvUrl: json['apk_tv_url'] as String? ?? '',
      iosUrl: json['ios_url'] as String? ?? '',
    );
  }

  factory AppUpdateInfo.empty() {
    return const AppUpdateInfo(
      enabled: false,
      latestVersion: '1.0.0',
      latestBuild: 1,
      forceUpdate: false,
      title: '',
      releaseNotes: '',
      apkMobileUrl: '',
      apkTvUrl: '',
      iosUrl: '',
    );
  }
}
