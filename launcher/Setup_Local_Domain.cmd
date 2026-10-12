@echo off
:: Setup local domain — adds zeralda.local to the Windows hosts file
:: so all devices on this machine can access the ERP via http://zeralda.local
:: Requires admin privileges

set "DOMAIN=zeralda.local"
set "IP=127.0.0.1"
set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"

echo === Setting up local domain: %DOMAIN% ===
echo.

:: Check if entry already exists
findstr /C:"%DOMAIN%" "%HOSTS%" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Entry for %DOMAIN% already exists in hosts file.
) else (
    echo Adding %IP% %DOMAIN% to hosts file...
    echo. >> "%HOSTS%"
    echo # Zeralda ERP local domain >> "%HOSTS%"
    echo %IP% %DOMAIN% >> "%HOSTS%"
    if %errorlevel% equ 0 (
        echo [OK] Added successfully.
    ) else (
        echo [ERROR] Failed to add entry. Make sure you run this as Administrator.
        pause
        exit /b 1
    )
)

echo.
echo === Testing ===
ping -n 1 %DOMAIN% 2>nul | findstr /C:"Reply from"
if %errorlevel% equ 0 (
    echo [OK] %DOMAIN% resolves correctly!
) else (
    echo [WARNING] DNS cache may need flushing...
    ipconfig /flushdns >nul 2>&1
    echo Flushed DNS cache.
)

echo.
echo You can now access the ERP at: http://%DOMAIN%:8080/
echo.
pause
