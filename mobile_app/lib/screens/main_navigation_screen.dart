import 'package:flutter/material.dart';
import '../models/app_update_info.dart';
import '../services/update_service.dart';
import '../widgets/update_dialog.dart';
import '../theme/app_theme.dart';
import 'home_screen.dart';
import 'explore_screen.dart';
import 'search_screen.dart';
import 'profile_screen.dart';

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 0;
  int _profileRefresh = 0;
  int _homeRefresh = 0;
  static bool _hasPromptedUpdateOnStartup = false;

  @override
  void initState() {
    super.initState();
    _checkUpdateOnStartup();
  }

  void _checkUpdateOnStartup() {
    if (_hasPromptedUpdateOnStartup) return;
    _hasPromptedUpdateOnStartup = true;

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await Future.delayed(const Duration(milliseconds: 600));
      if (!mounted) return;

      try {
        final update = await UpdateService.checkUpdate();
        if (!mounted || update == null) return;
        UpdateDialog.show(context, update);
      } catch (e) {
        debugPrint('[MainNavigationScreen] Error checking update on startup: $e');
      }
    });
  }

  void _onTabTapped(int index) {
    setState(() {
      _currentIndex = index;
      if (index == 0) _homeRefresh++;
      if (index == 3) _profileRefresh++;
    });
  }

  @override
  Widget build(BuildContext context) {
    final screens = [
      HomeScreen(onNavigateTab: _onTabTapped, refreshVersion: _homeRefresh),
      const ExploreScreen(),
      const SearchScreen(),
      ProfileScreen(key: ValueKey(_profileRefresh)),
    ];

    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: screens,
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: AppTheme.surface,
          border: Border(top: BorderSide(color: AppTheme.border, width: 0.5)),
        ),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: _onTabTapped,
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.home_outlined),
              activeIcon: Icon(Icons.home_filled),
              label: 'Trang Chủ',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.explore_outlined),
              activeIcon: Icon(Icons.explore_rounded),
              label: 'Khám Phá',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.search_outlined),
              activeIcon: Icon(Icons.search_rounded),
              label: 'Tìm Kiếm',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.person_outline_rounded),
              activeIcon: Icon(Icons.person_rounded),
              label: 'Cá Nhân',
            ),
          ],
        ),
      ),
    );
  }
}
