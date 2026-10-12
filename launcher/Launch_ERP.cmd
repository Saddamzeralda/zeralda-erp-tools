@echo off
title Zeralda ERP
cd /d "%~dp0"

:: Re-launch as Administrator if not already elevated
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch_ERP.ps1"
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Failed to start Zeralda ERP.
    pause
)
