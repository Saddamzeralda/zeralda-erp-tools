@echo off
:: Show the current Quick Tunnel URL and copy it to clipboard
:: Run this to get the URL to share with your phone

set "URL_FILE=%~dp0..\tools\cloudflared\quick_tunnel_url.txt"

if not exist "%URL_FILE%" (
    echo [ERROR] No tunnel URL found.
    echo         Start the server first via Start_Server_Silent.vbs
    pause
    exit /b 1
)

set /p TUNNEL_URL=<"%URL_FILE%"

echo.
echo ============================================
echo   Zeralda ERP - Public URL
echo ============================================
echo.
echo   %TUNNEL_URL%
echo.
echo ============================================
echo.
echo   This URL works from any device (phone, tablet, etc.)
echo   As long as this computer is running, the URL stays active.
echo.
echo   Opening in browser and copying to clipboard...
echo.

:: Copy to clipboard
echo %TUNNEL_URL%| clip

:: Open in browser
start "" "%TUNNEL_URL%"

echo   [OK] URL copied to clipboard! Paste it in WhatsApp/email to share.
echo.
pause
