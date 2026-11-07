@echo off
chcp 65001 >nul
echo ========================================================
echo   🎬 CINEVIET - BIÊN DỊCH NATIVE FLUTTER APPS
echo       (Android Phone APK & Android TV APK)
echo ========================================================
echo.

cd /d "%~dp0mobile_app"

where flutter >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [LỖI] Không tìm thấy Flutter SDK trên máy tính của bạn!
    echo Vui lòng cài đặt Flutter SDK hoặc đẩy mã nguồn lên GitHub Actions để tự động build.
    echo Hướng dẫn: Xem file MOBILE_BUILD_GUIDE.md
    pause
    exit /b 1
)

echo [1/4] Đang cập nhật dependencies...
call flutter pub get

echo.
echo [2/4] Bạn muốn biên dịch phiên bản nào?
echo  1. Android Phone APK (CineViet Mobile)
echo  2. Android TV APK (CineViet Android TV Leanback)
echo  3. Biên dịch CẢ HAI (Mobile + TV)
echo.
set /p choice="Chọn (1, 2 hoặc 3): "

if "%choice%"=="1" goto build_mobile
if "%choice%"=="2" goto build_tv
if "%choice%"=="3" goto build_both
echo Lựa chọn không hợp lệ!
goto end

:build_mobile
echo.
echo [3/4] Đang biên dịch CineViet Mobile APK...
call flutter build apk --release --dart-define=BACKEND_URL=https://cineviet.live
echo ✅ File APK Mobile nằm tại: mobile_app\build\app\outputs\flutter-apk\app-release.apk
goto end

:build_tv
echo.
echo [3/4] Đang biên dịch CineViet Android TV APK...
call flutter build apk --release -t lib/main_tv.dart --dart-define=BACKEND_URL=https://cineviet.live
echo ✅ File APK Android TV nằm tại: mobile_app\build\app\outputs\flutter-apk\app-release.apk
goto end

:build_both
echo.
echo [3/4] Đang biên dịch CineViet Mobile APK...
call flutter build apk --release --dart-define=BACKEND_URL=https://cineviet.live
mkdir output 2>nul
copy /y build\app\outputs\flutter-apk\app-release.apk output\CineViet-Mobile-release.apk >nul

echo.
echo [4/4] Đang biên dịch CineViet Android TV APK...
call flutter build apk --release -t lib/main_tv.dart --dart-define=BACKEND_URL=https://cineviet.live
copy /y build\app\outputs\flutter-apk\app-release.apk output\CineViet-AndroidTV-release.apk >nul

echo.
echo ========================================================
echo  ✅ [THÀNH CÔNG] Đã tạo xong cả 2 bản APK tại:
echo   - mobile_app\output\CineViet-Mobile-release.apk
echo   - mobile_app\output\CineViet-AndroidTV-release.apk
echo ========================================================
goto end

:end
echo.
pause
