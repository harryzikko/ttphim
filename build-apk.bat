@echo off
chcp 65001 >nul
echo ========================================================
echo       🎬 TTPHIM - BIÊN DỊCH NATIVE ANDROID APK
echo ========================================================
echo.

cd /d "%~dp0"
echo [1/3] Đang đồng bộ tài nguyên web sang Android...
call npx cap sync android

echo.
echo [2/3] Kiểm tra công cụ biên dịch...
cd android
if not exist gradlew.bat (
    echo [LỖI] Không tìm thấy gradlew.bat trong thư mục android!
    pause
    exit /b 1
)

echo.
echo [3/3] Đang tiến hành biên dịch APK (assembleDebug)...
call gradlew.bat assembleDebug

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo  ✅ [THÀNH CÔNG] File APK đã được tạo tại:
    echo  android\app\build\outputs\apk\debug\app-debug.apk
    echo ========================================================
) else (
    echo.
    echo --------------------------------------------------------
    echo  ⚠️ [LƯU Ý]:
    echo  Để build APK bằng dòng lệnh trên Windows, bạn cần cài Java JDK 17+.
    echo.
    echo  👉 HOẶC CÁCH ĐƠN GIẢN NHẤT:
    echo  1. Mở phần mềm Android Studio.
    echo  2. Chọn "Open an Existing Project" và trỏ đến thư mục:
    echo     f:\Tài\film\android
    echo  3. Bấm menu: Build > Build Bundle(s) / APK(s) > Build APK(s)
    echo     sẽ có ngay file APK cài đặt!
    echo --------------------------------------------------------
)

cd ..
pause
