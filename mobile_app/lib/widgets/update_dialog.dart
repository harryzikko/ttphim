import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../models/app_update_info.dart';
import '../services/update_service.dart';
import '../theme/app_theme.dart';

class UpdateDialog extends StatefulWidget {
  final AppUpdateInfo info;
  final bool isTv;

  const UpdateDialog({
    super.key,
    required this.info,
    this.isTv = false,
  });

  static Future<void> show(BuildContext context, AppUpdateInfo info, {bool isTv = false}) {
    return showDialog(
      context: context,
      barrierDismissible: !info.forceUpdate,
      builder: (_) => PopScope(
        canPop: !info.forceUpdate,
        child: UpdateDialog(info: info, isTv: isTv),
      ),
    );
  }

  @override
  State<UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<UpdateDialog> {
  bool _isDownloading = false;
  double _progress = 0.0;
  bool _isSuccess = false;
  String? _errorMessage;

  bool get _isAndroid => !kIsWeb && Platform.isAndroid;

  Future<void> _startUpdate() async {
    final downloadUrl = UpdateService.getDownloadUrl(widget.info, isTv: widget.isTv);

    if (!_isAndroid) {
      // iOS / Web -> Open browser/TestFlight/IPA link
      await UpdateService.openIosUpdate(downloadUrl);
      if (mounted && !widget.info.forceUpdate) {
        Navigator.of(context).pop();
      }
      return;
    }

    // Android APK in-app download and installation
    setState(() {
      _isDownloading = true;
      _progress = 0.0;
      _errorMessage = null;
      _isSuccess = false;
    });

    await UpdateService.downloadAndInstallApk(
      downloadUrl: downloadUrl,
      onProgress: (p) {
        if (mounted) setState(() => _progress = p);
      },
      onError: (err) {
        if (mounted) {
          setState(() {
            _isDownloading = false;
            _errorMessage = err;
          });
        }
      },
      onSuccess: () {
        if (mounted) {
          setState(() {
            _isDownloading = false;
            _isSuccess = true;
          });
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final info = widget.info;

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 24, vertical: 24),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 420),
        decoration: BoxDecoration(
          color: const Color(0xFF10131E),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: const Color(0x44FF5722), width: 1.5),
          boxShadow: const [
            BoxShadow(
              color: Color(0x33FF5722),
              blurRadius: 32,
              spreadRadius: 2,
              offset: Offset(0, 8),
            ),
            BoxShadow(
              color: Colors.black87,
              blurRadius: 40,
              offset: Offset(0, 16),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(22.5),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header with glowing icon
              Container(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFF1E2638), Color(0xFF131826)],
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                  ),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFFFF5722), Color(0xFFFF9800)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x55FF5722),
                            blurRadius: 12,
                            offset: Offset(0, 3),
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.system_update_rounded,
                        color: Colors.white,
                        size: 26,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            info.title.isNotEmpty ? info.title : 'Cập Nhật Ứng Dụng',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Text(
                                'v${UpdateService.currentVersion}',
                                style: const TextStyle(
                                  color: Colors.white54,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              const Padding(
                                padding: EdgeInsets.symmetric(horizontal: 6),
                                child: Icon(Icons.arrow_forward_rounded, color: Color(0xFFFF9800), size: 12),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0x33FF5722),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: const Color(0x88FF5722), width: 1),
                                ),
                                child: Text(
                                  'v${info.latestVersion}',
                                  style: const TextStyle(
                                    color: Color(0xFFFF9800),
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    if (!info.forceUpdate && !_isDownloading)
                      IconButton(
                        icon: const Icon(Icons.close_rounded, color: Colors.white54),
                        onPressed: () => Navigator.of(context).pop(),
                        tooltip: 'Đóng',
                      ),
                  ],
                ),
              ),

              // Content Body
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Nội Dung Cập Nhật:',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),

                    // Release notes container
                    Container(
                      constraints: const BoxConstraints(maxHeight: 140),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF090B12),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.white.withOpacity(0.06)),
                      ),
                      child: SingleChildScrollView(
                        physics: const BouncingScrollPhysics(),
                        child: Text(
                          info.releaseNotes.isNotEmpty
                              ? info.releaseNotes
                              : '• Cập nhật tối ưu hóa hiệu năng và sửa lỗi trải nghiệm người dùng.',
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 12.5,
                            height: 1.45,
                          ),
                        ),
                      ),
                    ),

                    const SizedBox(height: 16),

                    // Progress / Status Area
                    if (_isDownloading) ...[
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text(
                            'Đang tải bản cập nhật APK...',
                            style: TextStyle(color: Colors.white70, fontSize: 12),
                          ),
                          Text(
                            _progress >= 0 ? '${(_progress * 100).toInt()}%' : '...',
                            style: const TextStyle(
                              color: Color(0xFFFF9800),
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: LinearProgressIndicator(
                          value: _progress >= 0 ? _progress : null,
                          backgroundColor: Colors.white12,
                          valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFFFF5722)),
                          minHeight: 8,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Tệp đang được tải xuống bộ nhớ tạm. Hệ thống sẽ tự động mở cài đặt khi hoàn tất.',
                        style: TextStyle(color: Colors.white38, fontSize: 11),
                      ),
                    ] else if (_isSuccess) ...[
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: Colors.greenAccent.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Colors.greenAccent.withOpacity(0.3)),
                        ),
                        child: const Row(
                          children: [
                            Icon(Icons.check_circle_rounded, color: Colors.greenAccent, size: 20),
                            SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Đã tải xong APK! Đang mở màn hình cài đè lên bản cũ.',
                                style: TextStyle(color: Colors.greenAccent, fontSize: 12),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      ElevatedButton.icon(
                        onPressed: _startUpdate,
                        icon: const Icon(Icons.install_mobile_rounded, size: 18),
                        label: const Text('MỞ LẠI TRÌNH CÀI ĐẶT'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFFF5722),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                    ] else ...[
                      if (_errorMessage != null) ...[
                        Container(
                          padding: const EdgeInsets.all(10),
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(
                            color: Colors.redAccent.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: Colors.redAccent.withOpacity(0.3)),
                          ),
                          child: Text(
                            _errorMessage!,
                            style: const TextStyle(color: Colors.redAccent, fontSize: 12),
                          ),
                        ),
                      ],

                      // Action Buttons
                      Row(
                        children: [
                          if (!info.forceUpdate) ...[
                            Expanded(
                              flex: 1,
                              child: OutlinedButton(
                                onPressed: () => Navigator.of(context).pop(),
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: Colors.white60,
                                  side: BorderSide(color: Colors.white.withOpacity(0.15)),
                                  padding: const EdgeInsets.symmetric(vertical: 13),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                                child: const Text('Để Sau', style: TextStyle(fontSize: 13)),
                              ),
                            ),
                            const SizedBox(width: 10),
                          ],
                          Expanded(
                            flex: 2,
                            child: Container(
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [Color(0xFFFF5722), Color(0xFFFF9800)],
                                ),
                                borderRadius: BorderRadius.circular(12),
                                boxShadow: const [
                                  BoxShadow(
                                    color: Color(0x66FF5722),
                                    blurRadius: 12,
                                    offset: Offset(0, 3),
                                  ),
                                ],
                              ),
                              child: ElevatedButton(
                                onPressed: _startUpdate,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.transparent,
                                  shadowColor: Colors.transparent,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(vertical: 13),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      _isAndroid ? Icons.download_rounded : Icons.open_in_browser_rounded,
                                      size: 18,
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      _isAndroid ? 'TẢI & CÀI ĐẶT NGAY' : 'CẬP NHẬT NGAY',
                                      style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.bold,
                                        letterSpacing: 0.3,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
