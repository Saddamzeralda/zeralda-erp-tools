$ErrorActionPreference = 'Stop'

# PID file is stored in AppData (writable location), not launcher directory (Program Files - read-only)
$pidDir = Join-Path $env:LOCALAPPDATA 'Zeralda ERP'
$pidFile = Join-Path $pidDir 'chrome_launcher_server.pid'

if (-not (Test-Path $pidFile)) {
    Write-Host '[i] No PID file found. Nothing to stop.'
    exit 0
}

$pidText = (Get-Content $pidFile -Raw).Trim()
$parsedPid = 0
if (-not [int]::TryParse($pidText, [ref]$parsedPid)) {
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    Write-Host '[i] PID file was invalid and has been removed.'
    exit 0
}

$proc = Get-Process -Id $parsedPid -ErrorAction SilentlyContinue
if (-not $proc) {
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    Write-Host '[i] Server process not found. Cleaned PID file.'
    exit 0
}

if ($proc.ProcessName -ne 'python' -and $proc.ProcessName -ne 'py' -and $proc.ProcessName -ne 'pythonw') {
    Write-Host "[!] PID $parsedPid is not a python process. Not stopping for safety."
    exit 1
}

Stop-Process -Id $parsedPid -Force
Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
Write-Host "[ok] Stopped launcher server process PID: $parsedPid"
