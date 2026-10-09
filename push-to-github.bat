@echo off
chcp 65001 >nul
title TTPhim - Push to GitHub
echo ========================================================
echo       🚀 PUSH DỰ ÁN TTPHIM LÊN GITHUB (HARRYZIKKO)
echo ========================================================
echo.

echo Đang đẩy mã nguồn lên GitHub...
git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo  ✅ PUSH THÀNH CÔNG!
    echo  GitHub Actions đang tự động biên dịch APK và IPA tại:
    echo  https://github.com/harryzikko/ttphim/actions
    echo ========================================================
) else (
    echo.
    echo ❌ Chưa thể đẩy code lên GitHub.
    echo Hãy đảm bảo Deploy Key đã được thêm vào repo và tích chọn "Allow write access".
)
echo.
pause
