@echo off
REM ========================================
REM Zeralda ERP - System Shutdown Script
REM ========================================
REM This script stops:
REM 1. Python HTTP Server
REM 2. PostgreSQL Database (optional)

setlocal enabledelayedexpansion
color 0C

cls
echo.
echo ╔═══════════════════════════════════════════════════════════════════╗
echo ║         Zeralda ERP - System Shutdown                             ║
echo ╚═══════════════════════════════════════════════════════════════════╝
echo.

echo [i] Stopping HTTP Server...
taskkill /IM python.exe /F >nul 2>&1
if %errorlevel% equ 0 (
    echo [✓] HTTP Server stopped
) else (
    echo [i] HTTP Server was not running
)

echo.
echo [?] Stop PostgreSQL Database? (This is optional)
echo     Press Y to stop, or any other key to keep it running
set /p choice="Choice: "

if /i "%choice%"=="Y" (
    echo.
    echo [i] Stopping PostgreSQL...
    
    REM Try PostgreSQL 15
    net stop postgresql-x64-15 >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] PostgreSQL stopped (version 15)
        goto done
    )
    
    REM Try PostgreSQL 14
    net stop postgresql-x64-14 >nul 2>&1
    if %errorlevel% equ 0 (
        echo [✓] PostgreSQL stopped (version 14)
        goto done
    )
    
    echo [i] PostgreSQL was not running or could not be stopped
)

:done
echo.
echo [✓] Shutdown complete
echo.
pause
