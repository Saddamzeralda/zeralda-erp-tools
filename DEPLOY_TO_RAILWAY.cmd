@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ============================================================
echo        نشر Zeralda ERP مباشرة إلى خدمة Railway
echo ============================================================
echo.
echo جاري رفع وبناء المشروع بالكامل إلى الحاوية السحابية...
echo.
npx -y @railway/cli up -p 8bf8f2f2-f2a6-446d-82de-337abd123fc2 -s 5ff4dbcc-505a-45be-affa-4a169c83697d -e cfde4ee8-24bc-4e56-a5e1-eb256afcd1e7 -y
echo.
echo ============================================================
pause
