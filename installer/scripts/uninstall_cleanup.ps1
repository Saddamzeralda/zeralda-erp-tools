param([Parameter(Mandatory=$true)][string]$AppDir)
$ErrorActionPreference = 'SilentlyContinue'

$LogFile = Join-Path $AppDir 'logs\uninstall.log'
New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null
function Log([string]$msg) {
    $line = '{0}  {1}' -f [DateTime]::Now.ToString('o'), $msg
    $line | Out-File -FilePath $LogFile -Append -Encoding UTF8
}

Log "=== Uninstall cleanup start ==="
Log "AppDir: $AppDir"

# 1) Stop any ERP processes spawned from the install directory
Log "Stopping ERP processes from $AppDir ..."
Get-Process | Where-Object {
    $_.Path -and ($_.Path -like (Join-Path $AppDir '*'))
} | ForEach-Object {
    Log "  Stopping: $($_.ProcessName) PID=$($_.Id) Path=$($_.Path)"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

# 2) Stop the Chrome launcher tray (per-user PID file)
$pidFile = Join-Path $env:LOCALAPPDATA 'Zeralda ERP\chrome_launcher_server.pid'
if (Test-Path $pidFile) {
    $procId = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($procId -match '^[0-9]+$') {
        Log "Stopping Chrome launcher PID=$procId"
        Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# 3) Kill any lingering python.exe/pythonw.exe holding files in AppDir
Get-Process python,pythonw -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -and ($_.Path -like (Join-Path $AppDir '*'))
} | ForEach-Object {
    Log "Stopping Python: $($_.ProcessName) PID=$($_.Id)"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

# 4) Kill any system python running app.main or server.py from AppDir
Get-CimInstance Win32_Process -Filter "name='python.exe' OR name='pythonw.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and ($_.CommandLine -like "*$AppDir*") } |
    ForEach-Object {
        Log "Stopping Python (CMD line match): PID=$($_.ProcessId) CMD=$($_.CommandLine)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

# 5) Wait briefly for file handles to release
Start-Sleep -Seconds 2

# 6) Remove the per-user LOCALAPPDATA directory (PID files, cache)
$userDataDir = Join-Path $env:LOCALAPPDATA 'Zeralda ERP'
if (Test-Path $userDataDir) {
    Log "Removing user data dir: $userDataDir"
    Remove-Item $userDataDir -Recurse -Force -ErrorAction SilentlyContinue
}

# 7) Remove the per-user webview2 cache
$webviewCache = Join-Path $AppDir '.webview2_cache'
if (Test-Path $webviewCache) {
    Log "Removing webview2 cache: $webviewCache"
    Remove-Item $webviewCache -Recurse -Force -ErrorAction SilentlyContinue
}

Log "=== Uninstall cleanup completed ==="
exit 0
