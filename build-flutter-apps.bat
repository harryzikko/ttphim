@echo off
chcp 65001 >nul
echo ========================================================
echo   🎬 CINEVIET - BIÊN DỊCH NATIVE MOBILE APP (FLUTTER)
echo            (Android Phone APK & iOS App)
echo ========================================================
echo.
echo [LƯU Ý] Bản Android TV hiện tại được xây dựng bằng Kotlin Native
echo         + Jetpack Compose for TV + Media3 ExoPlayer trong thư mục "android_tv".
echo         Để build bản Android TV, vui lòng chạy: build-android-tv.bat
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

echo [1/2] Đang cập nhật dependencies...
call flutter pub get

echo.
echo [2/2] Đang biên dịch CineViet Mobile APK...
call flutter build apk --release --dart-define=BACKEND_URL=https://cineviet.live

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ [LỖI] Quá trình biên dịch thất bại!
    pause
    exit /b 1
)

mkdir output 2>nul
copy /y build\app\outputs\flutter-apk\app-release.apk output\CineViet-Mobile-release.apk >nul

echo.
echo ========================================================
echo  ✅ [THÀNH CÔNG] File APK Mobile đã được tạo tại:
echo     mobile_app\output\CineViet-Mobile-release.apk
echo ========================================================
pause
