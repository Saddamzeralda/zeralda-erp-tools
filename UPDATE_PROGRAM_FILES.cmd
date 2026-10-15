@echo off
title Zeralda ERP - Update C:\Program Files\Zeralda ERP
cd /d "%~dp0"

:: Elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [..] Requesting Administrator privileges...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ============================================================
echo   Zeralda ERP - Applying Updates to Program Files
echo ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\apply_program_files_update.ps1"

echo.
pause
