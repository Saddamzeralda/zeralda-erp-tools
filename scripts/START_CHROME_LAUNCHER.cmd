@echo off
setlocal
cd /d "%~dp0.."

if "%CUSTOM_DOMAIN%"=="" set "CUSTOM_DOMAIN=www.zeralda-erp.dz"

set "EXE_PATH="
if exist "launcher\bin\Release\net8.0-windows\win-x64\publish\Zeralda_ERP_Tool.exe" set "EXE_PATH=launcher\bin\Release\net8.0-windows\win-x64\publish\Zeralda_ERP_Tool.exe"

if defined EXE_PATH (
	start "" "%EXE_PATH%" %*
	exit /b 0
)

call launcher\Launch_Chrome.cmd %*
exit /b %errorlevel%