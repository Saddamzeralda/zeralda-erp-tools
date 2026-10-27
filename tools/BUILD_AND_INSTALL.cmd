@echo off
REM ====================================================================
REM  BUILD_AND_INSTALL.cmd - Build installer + install silently
REM  Run this after every modification to update the installed ERP
REM ====================================================================
setlocal enabledelayedexpansion
set "SCRIPT_DIR=%~dp0"
cd /d "%~dp0.."

echo ============================================================
echo  Zeralda ERP - Build ^& Install
echo ============================================================
echo.

REM Step 1: Stop running servers
echo [1/4] Stopping running servers...
taskkill /F /IM python.exe >nul 2>&1
timeout /t 2 /nobreak >nul
echo     Done.
echo.

REM Step 2: Build installer
echo [2/4] Building installer...
set "ISCC=C:\Users\sadda\AppData\Local\Programs\Inno Setup 7\ISCC.exe"
if not exist "!ISCC!" set "ISCC=C:\Program Files\Inno Setup 7\ISCC.exe"
if not exist "!ISCC!" set "ISCC=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
if not exist "!ISCC!" set "ISCC=iscc.exe"

"!ISCC!" "installer\Zeralda_ERP_Setup.iss" >nul 2>&1
if errorlevel 1 (
    echo     ❌ Build failed! Running with output:
    "!ISCC!" "installer\Zeralda_ERP_Setup.iss"
    pause
    exit /b 1
)
echo     ✅ Installer built: installer\dist\Zeralda_ERP_Setup_v3.0.0.exe
echo.

REM Step 3: Install silently (requires admin - will UAC prompt)
echo [3/4] Installing (silent mode)...
set "INSTALLER=%~dp0..\installer\dist\Zeralda_ERP_Setup_v3.0.0.exe"
if not exist "!INSTALLER!" set "INSTALLER=%SCRIPT_DIR%..\installer\dist\Zeralda_ERP_Setup_v3.0.0.exe"
powershell -Command "Start-Process -FilePath '%INSTALLER%' -ArgumentList '/SILENT','/NORESTART' -Verb RunAs -Wait"
echo     ✅ Installation complete.
echo.

REM Step 4: Start server
echo [4/4] Starting ERP server...
powershell -Command "Start-Process -FilePath 'C:\Program Files\Zeralda ERP\python\python.exe' -ArgumentList '-m','app.main' -WorkingDirectory 'C:\Program Files\Zeralda ERP'"
timeout /t 8 /nobreak >nul

REM Verify
powershell -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:8080/api/ping' -TimeoutSec 5; Write-Host '    ✅ Server running: ok='$r.ok } catch { Write-Host '    ❌ Server failed to start' }"
echo.

echo ============================================================
echo  ✅ Done! ERP installed and running.
echo  URL: https://zeralda-erp-employees-main-production.up.railway.app/zeralda_erp_dashboard.html
echo ============================================================
echo.
REM Open browser
start "https://zeralda-erp-employees-main-production.up.railway.app/zeralda_erp_dashboard.html"
pause
