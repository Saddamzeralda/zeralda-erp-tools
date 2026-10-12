@echo off
setlocal
cd /d "%~dp0"

if "%CUSTOM_DOMAIN%"=="" set "CUSTOM_DOMAIN=www.zeralda-erp.dz"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start_Chrome_Launcher.ps1" %*
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Chrome launcher failed.
    pause
    exit /b %errorlevel%
)

exit /b 0
