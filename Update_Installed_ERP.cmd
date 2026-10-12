@echo off
chcp 65001 >nul
title Zeralda ERP - Apply Updates to Program Files

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Requesting Administrator privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo [*] Copying updated invoice files to C:\Program Files\Zeralda ERP...
set "SRC=%~dp0"
set "DST=C:\Program Files\Zeralda ERP"

if not exist "%DST%" (
    echo [ERROR] Target directory "%DST%" not found!
    pause
    exit /b
)

copy /Y "%SRC%modules\sales\sales_management.html" "%DST%\modules\sales\sales_management.html"
copy /Y "%SRC%shared\print_engine.js" "%DST%\shared\print_engine.js"
if exist "%SRC%styles\responsive_global.css" copy /Y "%SRC%styles\responsive_global.css" "%DST%\styles\responsive_global.css"

echo.
echo =====================================================
echo  [OK] تم تحديث ملفات Zeralda ERP في Program Files بنجاح!
echo =====================================================
timeout /t 4
