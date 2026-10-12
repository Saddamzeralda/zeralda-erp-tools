@echo off
REM ====================================================================
REM  KEYGEN - Zeralda ERP Activation Key Generator
REM  
REM  Usage: double-click this file to launch KEYGEN
REM ====================================================================

setlocal enabledelayedexpansion

REM Get the project root directory
set "SCRIPT_DIR=%~dp0.."
cd /d "%SCRIPT_DIR%"

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python is not installed or not in PATH
    echo.
    echo Please install Python from: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

REM Check if .venv exists
if not exist ".venv" (
    echo ⚠️  Virtual environment not found. Creating one...
    python -m venv .venv
    if errorlevel 1 (
        echo ❌ Failed to create virtual environment
        pause
        exit /b 1
    )
)

REM Activate virtual environment
echo 🔄 Activating virtual environment...
call .venv\Scripts\activate.bat

REM Check if keygen_service exists
if not exist "backend\keygen_service.py" (
    echo ❌ KEYGEN service not found!
    echo Expected: backend\keygen_service.py
    pause
    exit /b 1
)

REM Run KEYGEN
echo.
echo ✅ Launching KEYGEN...
echo.

python backend\KEYGEN.py

REM Exit
pause
