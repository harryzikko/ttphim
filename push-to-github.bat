@echo off
chcp 65001 >nul
echo ========================================================
echo       🚀 PUSH DỰ ÁN TTPHIM LÊN GITHUB
echo ========================================================
echo.

git push -u origin main

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================================
    echo  ✅ PUSH THÀNH CÔNG!
    echo  Quá trình biên dịch APK và IPA đang chạy tự động tại:
    echo  https://github.com/tientaipham95hpv/ttphim/actions
    echo ========================================================
) else (
    echo.
    echo ❌ Lỗi: Chưa thể kết nối tới GitHub.
    echo Hãy đảm bảo bạn đã thêm Deploy Key vào repository và tích chọn "Allow write access".
)
echo.
pause
