@echo off
setlocal
cd /d "%~dp0"

set "CF_DIR=%~dp0..\tools\cloudflared"
set "CF_EXE=%CF_DIR%\cloudflared.exe"
set "TOKEN_FILE=%CF_DIR%\tunnel_token.txt"

if not exist "%CF_EXE%" (
    echo [ERROR] cloudflared.exe not found at: %CF_EXE%
    echo          Please reinstall with the "Cloudflare Tunnel" option.
    pause
    exit /b 1
)

if not exist "%TOKEN_FILE%" (
    echo [ERROR] Tunnel token not found.
    echo          Run "Setup Cloudflare Tunnel" first to configure the token.
    pause
    exit /b 1
)

set /p TUNNEL_TOKEN=<"%TOKEN_FILE%"
if "%TUNNEL_TOKEN%"=="" (
    echo [ERROR] Tunnel token is empty.
    echo          Run "Setup Cloudflare Tunnel" first.
    pause
    exit /b 1
)

echo ============================================================
echo   Zeralda ERP — Cloudflare Tunnel
echo ============================================================
echo   Tunnel: Active (outbound to Cloudflare)
echo   SSL:    Automatic (Cloudflare)
echo   Proxy:  https://www.zeralda-erp.dz -^> http://localhost:8080
echo ============================================================
echo   Press Ctrl+C to stop
echo ============================================================
echo.

"%CF_EXE%" tunnel run %TUNNEL_TOKEN%
