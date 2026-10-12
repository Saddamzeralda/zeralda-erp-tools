@echo off
set "SRC=C:\Users\User\Desktop\zeralda-erp-employees-main\zeralda-erp-employees-main"
set "DST=C:\Program Files\Zeralda ERP"

echo Copying updated files to %DST%...
copy /Y "%SRC%\*.html" "%DST%\"
copy /Y "%SRC%\START_CONNECTION_HUB.cmd" "%DST%\START_CONNECTION_HUB.cmd"
xcopy /Y /E /I /Q "%SRC%\app" "%DST%\app"
xcopy /Y /E /I /Q "%SRC%\shared" "%DST%\shared"
xcopy /Y /E /I /Q "%SRC%\styles" "%DST%\styles"
xcopy /Y /E /I /Q "%SRC%\modules" "%DST%\modules"
xcopy /Y /E /I /Q "%SRC%\launcher" "%DST%\launcher"

echo Stopping running processes...
taskkill /F /IM python.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo Starting ERP server...
cd /d "%DST%"
start "" "%DST%\launcher\Start_Tray_Silent.vbs"

echo [OK] Update complete!
