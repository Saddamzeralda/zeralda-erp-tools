@echo off
:: =====================================================
::  Zeralda ERP - Force Stop Server
::  Launches Kill_ERP.ps1 as Administrator
:: =====================================================
title Zeralda ERP - Force Stop
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0Kill_ERP.ps1""' -Verb RunAs"
