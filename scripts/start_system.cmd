@echo off
REM Canonical entrypoint wrapper (prevents bypass of launcher hardening)
setlocal
cd /d "%~dp0.."

echo [INFO] Redirecting startup to launcher\Launch_ERP.cmd
call launcher\Launch_ERP.cmd
exit /b %errorlevel%
