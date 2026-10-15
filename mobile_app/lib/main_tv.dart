import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/tv/tv_main_screen.dart';
import 'services/api_service.dart';
import 'theme/app_theme.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // Android TV Leanback: Fullscreen landscape & immersive sticky mode
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);

  unawaited(ApiService.restoreSession());
  runApp(const CineVietTvApp());
}

class CineVietTvApp extends StatelessWidget {
  const CineVietTvApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CineViet Android TV',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme.copyWith(
        scaffoldBackgroundColor: const Color(0xFF0C0E17),
      ),
      home: const TvMainScreen(),
    );
  }
}
