@echo off
chcp 65001 >nul
title Zeralda ERP — Network & Remote Hosting Manager
echo =====================================================================
echo           ZERALDA ERP — تشغيل الاستضافة والربط عن بُعد
echo =====================================================================
echo.
cd /d "%~dp0.."
python tools\network_host_manager.py --tunnel
pause
