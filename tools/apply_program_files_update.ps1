# Elevate if not admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "Requesting Administrator privileges..."
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$src = "C:\Users\User\Desktop\zeralda-erp-employees-main\zeralda-erp-employees-main"
$dst = "C:\Program Files\Zeralda ERP"

Write-Host "============================================================"
Write-Host "  Zeralda ERP — Updating C:\Program Files\Zeralda ERP"
Write-Host "============================================================"

Write-Host "1. Stopping old server & zombie tunnel processes..."
Stop-Process -Name python, pythonw, cloudflared -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host "2. Granting write permissions to $dst..."
icacls "$dst" /grant "Users:(OI)(CI)F" /T /C /Q

Write-Host "3. Copying updated files to $dst..."
Copy-Item -Path "$src\app\*" -Destination "$dst\app" -Recurse -Force -Exclude "__pycache__", "*.pyc"
Copy-Item -Path "$src\shared\*" -Destination "$dst\shared" -Recurse -Force
Copy-Item -Path "$src\launcher\*" -Destination "$dst\launcher" -Recurse -Force
Copy-Item -Path "$src\scripts\*" -Destination "$dst\scripts" -Recurse -Force
if (Test-Path "$src\pages") { Copy-Item -Path "$src\pages\*" -Destination "$dst\pages" -Recurse -Force }
if (Test-Path "$src\START_ERP.cmd") { Copy-Item -Path "$src\START_ERP.cmd" -Destination "$dst\START_ERP.cmd" -Force }
Copy-Item -Path "$src\server.py" -Destination "$dst\server.py" -Force
Copy-Item -Path "$src\.env.example" -Destination "$dst\.env.example" -Force
Copy-Item -Path "$src\data\license_integrity.json" -Destination "$dst\data\license_integrity.json" -Force

# Delete stale remote tunnel info
if (Test-Path "$dst\data\remote_access_info.json") {
    Remove-Item "$dst\data\remote_access_info.json" -Force -ErrorAction SilentlyContinue
}

# Update .env in Program Files
$envFile = "$dst\.env"
if (Test-Path $envFile) {
    $content = Get-Content $envFile -Raw
    if ($content -match 'STARTUP_URL=') {
        $content = $content -replace 'STARTUP_URL=.*', 'STARTUP_URL=https://zeralda-erp-employees-main-production.up.railway.app/zeralda_erp_dashboard.html'
    } else {
        $content += "`r`nSTARTUP_URL=https://zeralda-erp-employees-main-production.up.railway.app/zeralda_erp_dashboard.html`r`n"
    }
    Set-Content -Path $envFile -Value $content -Encoding UTF8
    Write-Host "   .env STARTUP_URL updated."
}

# Fix Public Desktop shortcut
$sh = New-Object -ComObject WScript.Shell
$pubLnk = "C:\Users\Public\Desktop\Zeralda ERP.lnk"
if (Test-Path $pubLnk) {
    try {
        $sc = $sh.CreateShortcut($pubLnk)
        $sc.TargetPath = "C:\WINDOWS\system32\wscript.exe"
        $sc.Arguments = "`"$dst\launcher\Start_Tray_Silent.vbs`""
        $sc.WorkingDirectory = $dst
        $sc.Save()
        Write-Host "   Public Desktop shortcut updated."
    } catch {}
}

# Fix User Desktop shortcut
$userLnk = "C:\Users\User\Desktop\Zeralda ERP.lnk"
if (Test-Path $userLnk) {
    try {
        $sc = $sh.CreateShortcut($userLnk)
        $sc.TargetPath = "C:\WINDOWS\system32\wscript.exe"
        $sc.Arguments = "`"$dst\launcher\Start_Tray_Silent.vbs`""
        $sc.WorkingDirectory = $dst
        $sc.Save()
        Write-Host "   User Desktop shortcut updated."
    } catch {}
}

# Recalculate integrity
Write-Host "4. Recalculating license integrity in $dst..."
$pyExe = "$dst\python\python.exe"
& $pyExe -c "import sys; sys.path.insert(0, r'$dst'); from app.services import license_service; license_service.reset_integrity(); print('Integrity check:', license_service.check_integrity())"

# Restart server
Write-Host "5. Starting updated server from $dst..."
Start-Process "wscript.exe" -ArgumentList "`"$dst\launcher\Start_Server_Silent.vbs`"" -WorkingDirectory $dst

Write-Host "`n============================================================"
Write-Host "  SUCCESS! C:\Program Files\Zeralda ERP is 100% updated!"
Write-Host "============================================================"
Start-Sleep -Seconds 3
