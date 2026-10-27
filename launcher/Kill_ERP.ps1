# Zeralda ERP - Force Kill All ERP Processes
# Re-launch as Administrator if not already elevated
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "  [INFO] Relaunching as Administrator..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$projectRoot = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "  ========================================" -ForegroundColor Red
Write-Host "   Zeralda ERP - Force Stop [Admin]" -ForegroundColor Red
Write-Host "  ========================================" -ForegroundColor Red
Write-Host ""

# Helper: identify Zeralda ERP Python processes (server.py OR app.main OR tray.pyw)
function Get-ZeraldaPythonProcs {
    $found = @()
    try {
        $procs = Get-CimInstance Win32_Process -Filter "name='python.exe' OR name='py.exe' OR name='pythonw.exe'" -ErrorAction SilentlyContinue
        foreach ($p in $procs) {
            $cl = [string]$p.CommandLine
            # Match Zeralda server (legacy server.py OR FastAPI app.main) and tray launcher
            if ($cl -like '*server.py*' -or $cl -like '*app.main*' -or $cl -like '*app\main*' -or $cl -like '*tray.pyw*') {
                $found += [PSCustomObject]@{ Id = [int]$p.ProcessId; CommandLine = $cl }
            }
        }
    } catch {}
    return $found
}

# [1] Kill Launcher exe
Write-Host "  [1] Killing Zeralda_ERP_Launcher..." -ForegroundColor Yellow
taskkill /F /IM Zeralda_ERP_Launcher_core.exe /T 2>$null
taskkill /F /IM Zeralda_ERP_Launcher.exe /T 2>$null

# [2] Kill WebView2 (only processes spawned from our launcher)
Write-Host "  [2] Killing msedgewebview2 (ERP)..." -ForegroundColor Yellow
try {
    $ourPath = Join-Path $projectRoot 'launcher'
    Get-Process msedgewebview2 -ErrorAction SilentlyContinue | Where-Object {
        $_.Path -and $_.Path -like "*$ourPath*"
    } | Stop-Process -Force -ErrorAction SilentlyContinue
} catch {}

# [3] Kill ONLY Zeralda Python processes (NOT all python.exe on the system)
Write-Host "  [3] Killing Zeralda Python processes..." -ForegroundColor Yellow
$zeraldaProcs = Get-ZeraldaPythonProcs
foreach ($p in $zeraldaProcs) {
    Write-Host "      Killing PID $($p.Id): $($p.CommandLine.Substring(0, [Math]::Min(80, $p.CommandLine.Length)))" -ForegroundColor Gray
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
}

# [4] Kill by ERP port (fallback — only if process wasn't already killed)
Write-Host "  [4] Killing ERP port listeners..." -ForegroundColor Yellow
$erpPort = 8080
$envFile = Join-Path $projectRoot '.env'
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile -ErrorAction SilentlyContinue) {
        if ($line -match '^PORT=(\d+)') { $erpPort = [int]$Matches[1]; break }
    }
}
try {
    $conn = Get-NetTCPConnection -LocalPort $erpPort -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conn) {
        $pidVal = [int]$c.OwningProcess
        if ($pidVal -gt 4) {
            # Verify it's a Python process before killing
            $proc = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
            if ($proc -and ($proc.ProcessName -match 'python|py')) {
                Stop-Process -Id $pidVal -Force -ErrorAction SilentlyContinue
                Write-Host "      Killed port-$erpPort listener PID $pidVal" -ForegroundColor Gray
            }
        }
    }
} catch {}

# [5] Stop PostgreSQL ONLY if it was started by ERP (check PID file marker)
Write-Host "  [5] Checking PostgreSQL..." -ForegroundColor Yellow
$pgMarker = Join-Path $env:LOCALAPPDATA 'Zeralda ERP\pg_started_by_erp.marker'
if (Test-Path $pgMarker) {
    Write-Host "      PostgreSQL was started by ERP — stopping..." -ForegroundColor Gray
    Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue |
        Where-Object { $_.Status -eq 'Running' } |
        Stop-Service -Force -ErrorAction SilentlyContinue
    Remove-Item $pgMarker -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "      PostgreSQL not started by ERP — leaving it running." -ForegroundColor Gray
}

# [6] Delete PID file
$pidFile = Join-Path $env:LOCALAPPDATA 'Zeralda ERP\chrome_launcher_server.pid'
if (Test-Path $pidFile) {
    Write-Host "  [6] Deleting PID file..." -ForegroundColor Yellow
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# [7] Kill tray monitor and watchdog (PowerShell scripts launched by Launch_ERP.ps1)
Write-Host "  [7] Stopping tray monitor and watchdog..." -ForegroundColor Yellow
try {
    Get-CimInstance Win32_Process -Filter "name='powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object { [string]$_.CommandLine -like '*Zeralda_Tray.ps1*' -or [string]$_.CommandLine -like '*Server_Watchdog.ps1*' } |
        ForEach-Object { Stop-Process -Id ([int]$_.ProcessId) -Force -ErrorAction SilentlyContinue }
} catch {}

Write-Host ""
Write-Host "  [DONE] All ERP processes stopped safely." -ForegroundColor Green
Write-Host "  [INFO] Other Python processes on your system were NOT affected." -ForegroundColor Cyan
Write-Host ""
Read-Host "  Press Enter to close"
