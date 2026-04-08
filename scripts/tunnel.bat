@echo off
echo ============================================
echo   Cloudflare Tunnel - Daily Planner
echo ============================================
echo.

where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    echo [오류] cloudflared가 설치되어 있지 않습니다.
    echo.
    echo 설치 방법:
    echo   winget install Cloudflare.cloudflared
    echo.
    echo 또는 https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
    echo 에서 다운로드하세요.
    echo.
    pause
    exit /b 1
)

echo 터널을 시작합니다... (생성된 URL을 친구에게 공유하세요)
echo.
cloudflared tunnel --protocol http2 --url http://localhost:3000
pause
