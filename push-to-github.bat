@echo off
chcp 65001 >nul
title CineViet - Push to GitHub
echo ========================================================
echo       🚀 PUSH DỰ ÁN CINEVIET LÊN GITHUB (HARRYZIKKO)
echo ========================================================
echo.

cd /d "%~dp0"

echo Đang đẩy mã nguồn lên GitHub (origin main)...
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
    echo ⚠️ Chưa thể đẩy code lên GitHub do phân quyền tài khoản / Deploy Key.
    echo.
    echo 👉 HƯỚNG DẪN XỬ LÝ:
    echo 1. Vào: https://github.com/harryzikko/ttphim/settings/keys
    echo 2. Kiểm tra Deploy Key và tích chọn ô "Allow write access".
    echo    HOẶC vào https://github.com/harryzikko/ttphim/settings/access
    echo    thêm tài khoản GitHub của bạn làm Collaborator (có quyền Write).
)
echo.
pause
