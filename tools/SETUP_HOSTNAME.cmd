@echo off
chcp 65001 >nul
title Zeralda ERP — تسجيل اسم النطاق المحلي (Hostname Setup)
echo =====================================================================
echo         ZERALDA ERP — تثبيت اسم النطاق المخصص (Hostname)
echo =====================================================================
echo.
echo سيتم إضافة الأسماء التالية إلى جهازك:
echo   - http://zeralda.local:8080
echo   - http://zeralda-erp.local:8080
echo   - http://zeralda:8080
echo.
echo جاري طلب صلاحيات المسؤول (Administrator)...
powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile -Command \"$path = ''C:\Windows\System32\drivers\etc\hosts''; $lines = Get-Content $path; $add = @(); foreach ($h in @(''zeralda.local'', ''zeralda-erp.local'', ''zeralda'', ''zeralda-erp'')) { if ($lines -notmatch [regex]::Escape($h)) { $add += ''127.0.0.1 `t '' + $h } }; if ($add) { Add-Content -Path $path -Value $add; Write-Host ''تم تسجيل أسماء النطاق بنجاح!'' -ForegroundColor Green } else { Write-Host ''الأسماء مسجلة مسبقاً!'' -ForegroundColor Cyan }; Start-Sleep -Seconds 2\"'"
echo.
echo تم تنفيذ الإعداد بنجاح.
pause
