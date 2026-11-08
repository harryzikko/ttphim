@echo off
chcp 65001 >nul
echo ========================================================
echo   🎬 CINEVIET ANDROID TV - KOTLIN NATIVE BUILD
echo     Jetpack Compose for TV + Media3 ExoPlayer
echo ========================================================
echo.

set "JAVA_HOME=E:\VTC Game\Android Studio\jbr"
set "ANDROID_HOME=E:\VTC Game\Sdk"
set "PATH=%JAVA_HOME%\bin;%PATH%"

cd /d "%~dp0android_tv"

echo [1/3] Kiểm tra môi trường biên dịch...
if not exist "%JAVA_HOME%\bin\java.exe" (
    echo [LỖI] Không tìm thấy Java tại: %JAVA_HOME%
    pause
    exit /b 1
)
if not exist "%ANDROID_HOME%" (
    echo [LỖI] Không tìm thấy Android SDK tại: %ANDROID_HOME%
    pause
    exit /b 1
)

echo.
echo [2/3] Bạn muốn biên dịch bản nào?
echo  1. Debug APK (Dùng để cài đặt trực tiếp và thử nghiệm ngay)
echo  2. Release APK (Bản phát hành tối ưu)
echo.
set /p choice="Chọn (1 hoặc 2, mặc định là 1): "

if "%choice%"=="2" (
    echo.
    echo [3/3] Đang biên dịch Android TV Release APK...
    call gradlew.bat assembleRelease
    set "APK_PATH=app\build\outputs\apk\release\app-release-unsigned.apk"
) else (
    echo.
    echo [3/3] Đang biên dịch Android TV Debug APK...
    call gradlew.bat assembleDebug
    set "APK_PATH=app\build\outputs\apk\debug\app-debug.apk"
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ [LỖI] Quá trình biên dịch thất bại! Vui lòng kiểm tra log ở trên.
    pause
    exit /b 1
)

mkdir output 2>nul
if "%choice%"=="2" (
    copy /y "%APK_PATH%" output\CineViet-AndroidTV-release.apk >nul
    echo.
    echo ========================================================
    echo  ✅ [THÀNH CÔNG] File APK Android TV Release tại:
    echo     android_tv\output\CineViet-AndroidTV-release.apk
    echo ========================================================
) else (
    copy /y "%APK_PATH%" output\CineViet-AndroidTV-debug.apk >nul
    echo.
    echo ========================================================
    echo  ✅ [THÀNH CÔNG] File APK Android TV Debug tại:
    echo     android_tv\output\CineViet-AndroidTV-debug.apk
    echo ========================================================
)

echo.
pause
