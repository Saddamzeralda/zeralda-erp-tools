# Sync workspace updates to C:\Program Files\Zeralda ERP
$ErrorActionPreference = "Stop"

$src = "c:\Users\User\Desktop\zeralda-erp-employees-main\zeralda-erp-employees-main"
$dst = "C:\Program Files\Zeralda ERP"

if (-not (Test-Path $dst)) {
    Write-Error "Destination directory $dst does not exist!"
}

Write-Host "1. Stopping any running ERP or zombie tunnel processes..."
Get-Process | Where-Object { 
    try { 
        $_.Path -and ($_.Path.StartsWith($dst, [System.StringComparison]::OrdinalIgnoreCase) -or $_.Name -eq "cloudflared")
    } catch { 
        $false 
    } 
} | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 1

Write-Host "2. Copying updated files to $dst..."

# Copy app directory
Copy-Item -Path "$src\app\*" -Destination "$dst\app" -Recurse -Force -Exclude "__pycache__", "*.pyc"

# Copy shared directory
Copy-Item -Path "$src\shared\*" -Destination "$dst\shared" -Recurse -Force

# Copy launcher directory
Copy-Item -Path "$src\launcher\*" -Destination "$dst\launcher" -Recurse -Force

# Copy connect.html and other root HTML/files
Copy-Item -Path "$src\connect.html" -Destination "$dst\connect.html" -Force
Copy-Item -Path "$src\.env.example" -Destination "$dst\.env.example" -Force

# Clean stale remote tunnel info
if (Test-Path "$dst\data\remote_access_info.json") {
    Remove-Item "$dst\data\remote_access_info.json" -Force -ErrorAction SilentlyContinue
}

Write-Host "3. Updating .env in $dst..."
$envFile = "$dst\.env"
if (Test-Path $envFile) {
    $lines = Get-Content $envFile
    $hasStartup = $false
    $newLines = @()
    foreach ($line in $lines) {
        if ($line -match "^STARTUP_URL=") {
            $newLines += "STARTUP_URL=https://zeralda-erp-employees-main-production.up.railway.app/zeralda_erp_dashboard.html"
            $hasStartup = $true
        } else {
            $newLines += $line
        }
    }
    if (-not $hasStartup) {
        $newLines += "STARTUP_URL=https://zeralda-erp-employees-main-production.up.railway.app/zeralda_erp_dashboard.html"
    }
    Set-Content -Path $envFile -Value $newLines -Encoding UTF8
    Write-Host "   .env STARTUP_URL updated successfully."
}

Write-Host "4. Re-registering license integrity in $dst..."
$pyExe = "$dst\python\python.exe"
$resetCmd = "import sys; sys.path.insert(0, r'$dst'); from app.services import license_service; license_service.reset_integrity(); print('Integrity check:', license_service.check_integrity())"
& $pyExe -c $resetCmd

Write-Host "5. Restarting Zeralda ERP server from $dst..."
$vbsPath = "$dst\launcher\Start_Server_Silent.vbs"
if (Test-Path $vbsPath) {
    Start-Process "wscript.exe" -ArgumentList "`"$vbsPath`"" -WorkingDirectory $dst
    Write-Host "   Launched Start_Server_Silent.vbs."
}

Start-Sleep -Seconds 3

# Verify port 8080
$running = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "   SUCCESS: Zeralda ERP is listening on port 8080 (PID: $($running.OwningProcess))."
} else {
    Write-Host "   Server is starting up..."
}

Write-Host "`nAll files in C:\Program Files\Zeralda ERP have been updated and synchronized!"
