@echo off
title Zeralda ERP Server Watchdog
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0Server_Watchdog.ps1"
