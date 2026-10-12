@echo off
:: Install cloudflared as a Windows service with the tunnel token
:: Requires admin privileges

set "CF_EXE=%~dp0..\tools\cloudflared\cloudflared.exe"
set "TOKEN_FILE=%~dp0..\tools\cloudflared\tunnel_token.txt"

if not exist "%TOKEN_FILE%" (
    echo [ERROR] Token file not found: %TOKEN_FILE%
    pause
    exit /b 1
)

set /p TUNNEL_TOKEN=<"%TOKEN_FILE%"

echo Installing Cloudflare Tunnel as Windows service...
"%CF_EXE%" service install %TUNNEL_TOKEN%
if %errorlevel% equ 0 (
    echo.
    echo [OK] Cloudflared service installed and started.
    echo       The tunnel will auto-start on Windows boot.
) else (
    echo.
    echo [ERROR] Failed to install service. Exit code: %errorlevel%
)
timeout /t 3 >nul
