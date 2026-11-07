import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/app_banner_screen.dart';
import 'theme/app_theme.dart';
import 'services/api_service.dart';
import 'services/app_config.dart';
import 'services/http_overrides.dart';
import 'services/update_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = CineVietHttpOverrides();
  await AppConfig.init();
  unawaited(UpdateService.initVersion());

  // Set immersive dark status bar & navigation bar
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      statusBarBrightness: Brightness.dark,
      systemNavigationBarColor: AppTheme.surface,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  runApp(const CineVietApp());
  unawaited(ApiService.restoreSession());
}

class CineVietApp extends StatelessWidget {
  const CineVietApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'CineViet',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: const AppBannerScreen(),
    );
  }
}
