@echo off
chcp 65001 >nul
REM ============================================================
REM  Zeralda ERP — Deploy Script
REM  ينسخ التعديلات من مجلد التطوير إلى مجلد التثبيت
REM  WITHOUT clearing browser cache (preserves user session)
REM ============================================================

set SRC=C:\Users\User\Desktop\zeralda-erp-employees-main\zeralda-erp-employees-main
set DST=C:\Program Files\Zeralda ERP

echo.
echo ========================================
echo  Zeralda ERP Deploy Script
echo ========================================
echo  Source:  %SRC%
echo  Target:  %DST%
echo ========================================
echo.

REM --- Copy shared JS files ---
echo [1/6] Copying shared JS files...
copy /Y "%SRC%\shared\*.js" "%DST%\shared\" >nul 2>&1
if %errorlevel%==0 (echo   OK) else (echo   FAIL)

REM --- Copy styles ---
echo [2/6] Copying CSS files...
copy /Y "%SRC%\styles\*.css" "%DST%\styles\" >nul 2>&1
if %errorlevel%==0 (echo   OK) else (echo   FAIL)

REM --- Copy module HTML files ---
echo [3/6] Copying module HTML files...
xcopy /Y /S "%SRC%\modules\*.html" "%DST%\modules\" >nul 2>&1
if %errorlevel%==0 (echo   OK) else (echo   FAIL)

REM --- Copy root HTML files ---
echo [4/6] Copying root HTML files...
copy /Y "%SRC%\settings.html" "%DST%\" >nul 2>&1
copy /Y "%SRC%\zeralda_erp_dashboard.html" "%DST%\" >nul 2>&1
copy /Y "%SRC%\login.html" "%DST%\" >nul 2>&1
if %errorlevel%==0 (echo   OK) else (echo   FAIL)

REM --- Copy tools ---
echo [5/6] Copying tools...
xcopy /Y /S "%SRC%\tools\*.py" "%DST%\tools\" >nul 2>&1
if %errorlevel%==0 (echo   OK) else (echo   FAIL)

REM --- Update integrity hashes ---
echo [6/6] Updating integrity hashes...
python -X utf8 -c "import hashlib,json,os; base=r'C:\Program Files\Zeralda ERP'; f=os.path.join(base,'data','license_integrity.json'); d=json.load(open(f,'r',encoding='utf-8')); [d.update({k:hashlib.sha256(open(os.path.join(base,k),'rb').read()).hexdigest()}) for k in ['shared/license_guard.js','shared/license_auto.js','shared/license_manager.js','shared/license_crypto.js'] if os.path.exists(os.path.join(base,k))]; json.dump(d,open(f,'w',encoding='utf-8'),indent=2,ensure_ascii=False); print('  OK — hashes updated')" 2>nul
if %errorlevel%==0 (echo   OK) else (echo   SKIP — python not found)

echo.
echo ========================================
echo  Deploy complete!
echo  NO cache was cleared — user session preserved.
echo  Just refresh the browser (F5).
echo ========================================
echo.
pause
