@echo off
title Zeralda ERP (diagnostic)
cd /d "c:\Users\User\Desktop\zeralda-erp-employees-main\zeralda-erp-employees-main"
set "ENVIRONMENT=development"
set "AUTH_DISABLED_IN_DEV=true"
echo Starting Zeralda ERP server (diagnostic mode)...
echo Python: "c:\Users\User\Desktop\zeralda-erp-employees-main\zeralda-erp-employees-main\tools\python-embed\python.exe"
echo.
echo Press Ctrl+C to stop the server.
echo.
"c:\Users\User\Desktop\zeralda-erp-employees-main\zeralda-erp-employees-main\tools\python-embed\python.exe" -m app.main
echo.
echo [Server stopped] Press any key to close.
pause >nul