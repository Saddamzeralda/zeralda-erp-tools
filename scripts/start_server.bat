@echo off
chcp 65001 > nul
title Zeralda ERP Server (Launcher Wrapper)
cd /d "%~dp0.."

echo [INFO] Canonical startup route is launcher\Launch_ERP.cmd
call launcher\Launch_ERP.cmd
exit /b %errorlevel%
