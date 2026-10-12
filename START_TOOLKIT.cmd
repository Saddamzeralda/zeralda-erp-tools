@echo off
chcp 65001 >nul 2>&1
title Zeralda ERP - Protection Toolkit
cd /d "%~dp0"

REM Try bundled Python first, fall back to system Python
if exist "python\python.exe" (
    "python\python.exe" tools\protection_toolkit.py --web
) else (
    python tools\protection_toolkit.py --web
)

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to start Protection Toolkit
    pause
)
