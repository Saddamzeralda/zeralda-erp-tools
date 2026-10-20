@echo off
setlocal
cd /d "%~dp0"

set "PY_BIN="
if exist "%LOCALAPPDATA%\Programs\Python311\python.exe" set "PY_BIN=%LOCALAPPDATA%\Programs\Python311\python.exe"
if not defined PY_BIN if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PY_BIN=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if not defined PY_BIN if exist "C:\Python311\python.exe" set "PY_BIN=C:\Python311\python.exe"
if not defined PY_BIN (
    py -3 -V >nul 2>&1
    if %errorlevel% equ 0 set "PY_BIN=py -3"
)
if not defined PY_BIN set "PY_BIN=python"

%PY_BIN% "%~dp0manage.py" %*
if %errorlevel% neq 0 (
    if "%~1"=="" pause
)
