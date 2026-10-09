@echo off
chcp 65001 >nul
title TTPhim - Push to GitHub
echo ========================================================
echo       🚀 PUSH DỰ ÁN TTPHIM LÊN GITHUB
echo ========================================================
echo.

echo Đang đẩy mã nguồn lên GitHub...
git push origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo  ✅ PUSH THÀNH CÔNG!
    echo  GitHub Actions đang tự động biên dịch APK và IPA tại:
    echo  https://github.com/tientaipham95hpv/ttphim/actions
    echo ========================================================
) else (
    echo.
    echo ❌ Chưa thể đẩy code lên GitHub.
    echo.
    echo Nếu dùng SSH: Hãy đảm bảo Deploy Key v2 đã được thêm và bật "Allow write access".
    echo Nếu dùng HTTPS: Hãy đăng nhập tài khoản GitHub khi cửa sổ mở ra.
)
echo.
pause
