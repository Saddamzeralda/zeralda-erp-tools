@echo off
:: ============================================================================
:: Zeralda ERP — One-Click Network Client Setup (ربط جهاز آخر بالخادم بنقرة واحدة)
:: ============================================================================
title Zeralda ERP - Client Setup

:: Re-launch as Administrator if not already elevated
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "SERVER_IP=192.168.100.18"
set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"

echo ============================================================
echo   Zeralda ERP — Network Link Setup
echo   Connecting this PC to server: %SERVER_IP%
echo ============================================================
echo.

findstr /C:"www.zeralda-erp.dz" "%HOSTS%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Hosts mapping already exists.
) else (
    echo [..] Adding www.zeralda-erp.dz to hosts file...
    echo. >> "%HOSTS%"
    echo # Zeralda ERP Network Host >> "%HOSTS%"
    echo %SERVER_IP% www.zeralda-erp.dz >> "%HOSTS%"
    echo %SERVER_IP% zeralda-erp.dz >> "%HOSTS%"
    echo [OK] Successfully linked to Zeralda ERP!
)

ipconfig /flushdns >nul 2>&1

echo.
echo Opening http://www.zeralda-erp.dz/ in your default browser...
start http://www.zeralda-erp.dz/

timeout /t 3 >nul
exit /b 0
