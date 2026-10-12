#Requires -Version 5
# Zeralda ERP Server Watchdog
# Runs continuously in background, kills any rogue http.server on ANY port
# and ensures the real ERP server (app.main or server.py) is running on the target port.

param(
    [int]$Port = 8080,
    [int]$CheckIntervalSeconds = 2
)

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$serverScript = Join-Path $projectRoot 'server.py'
$appMainPy = Join-Path $projectRoot 'app\main.py'

function Find-PythonExe {
    # 1) Bundled embedded Python (installed by the installer)
    $bundledPy = Join-Path $projectRoot 'python\python.exe'
    if (Test-Path $bundledPy) { return $bundledPy }
    # 2) Development venv
    $venvPy = Join-Path $projectRoot '.venv\Scripts\python.exe'
    $venvConfig = Join-Path $projectRoot '.venv\pyvenv.cfg'
    if ((Test-Path $venvPy) -and (Test-Path $venvConfig)) { return $venvPy }
    # 3) System Python
    if (Get-Command py -ErrorAction SilentlyContinue) { return 'py' }
    if (Get-Command python -ErrorAction SilentlyContinue) { return 'python' }
    return $null
}

function Get-PortOwner {
    param([int]$TargetPort)
    try {
        $conn = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn) {
            $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId = $($conn.OwningProcess)" -ErrorAction SilentlyContinue).CommandLine
            return @{
                Pid = $conn.OwningProcess
                ProcessName = if ($proc) { $proc.ProcessName } else { 'unknown' }
                CommandLine = $cmdLine
            }
        }
    } catch {}
    return $null
}

function Test-RealServer {
    param([string]$CmdLine)
    # Accept both legacy server.py and FastAPI app.main
    return ($CmdLine -like '*server.py*') -or ($CmdLine -like '*app.main*') -or ($CmdLine -like '*app\main*')
}

function Test-RogueServer {
    param([string]$CmdLine)
    return ($CmdLine -like '*http.server*' -and -not (Test-RealServer $CmdLine))
}

function Start-RealServer {
    $python = Find-PythonExe
    if (-not $python) {
        Write-Host "[WATCHDOG] ERROR: Python not found!" -ForegroundColor Red
        return $false
    }
    try {
        # Prefer the FastAPI app (app.main) 
        if (Test-Path $appMainPy) {
            $proc = Start-Process -FilePath $python -ArgumentList @('-m', 'app.main') `
                -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
            Write-Host "[WATCHDOG] Started app.main (PID $($proc.Id))" -ForegroundColor Green
        } else {
            $proc = Start-Process -FilePath $python -ArgumentList @($serverScript, $Port) `
                -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
            Write-Host "[WATCHDOG] Started server.py (PID $($proc.Id))" -ForegroundColor Green
        }
        # Wait for port to be ready
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Milliseconds 300
            $owner = Get-PortOwner -TargetPort $Port
            if ($owner -and (Test-RealServer $owner.CommandLine)) {
                return $true
            }
        }
        return $false
    } catch {
        Write-Host "[WATCHDOG] ERROR starting server: $_" -ForegroundColor Red
        return $false
    }
}

# Stop ALL rogue http.server processes on ANY port
function Stop-AllRogueServers {
    try {
        $allPython = Get-CimInstance Win32_Process -Filter "name='python.exe' OR name='py.exe'" -ErrorAction SilentlyContinue
        foreach ($proc in $allPython) {
            $cmd = [string]$proc.CommandLine
            if (Test-RogueServer $cmd) {
                Write-Host "[WATCHDOG] Killing rogue http.server (PID $($proc.ProcessId))" -ForegroundColor Yellow
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}
}

# ── Main Watchdog Loop ────────────────────────────────────────────────────────
Write-Host "[WATCHDOG] Starting server watchdog for port $Port..." -ForegroundColor Cyan
Write-Host "[WATCHDOG] Press Ctrl+C to stop" -ForegroundColor Gray

while ($true) {
    try {
        # First: stop ALL rogue http.server processes on ANY port
        Stop-AllRogueServers

        $owner = Get-PortOwner -TargetPort $Port

        if ($owner) {
            if (Test-RogueServer $owner.CommandLine) {
                Write-Host "[WATCHDOG] Killing rogue http.server (PID $($owner.Pid))" -ForegroundColor Yellow
                Stop-Process -Id $owner.Pid -Force -ErrorAction SilentlyContinue
                # Start real server after killing rogue
                Start-Sleep -Seconds 1
                Start-RealServer
            }
            elseif (Test-RealServer $owner.CommandLine) {
                # Real server running - all good
            }
            else {
                # Some other process on port - kill it
                Write-Host "[WATCHDOG] Killing unknown process on port $Port (PID $($owner.Pid))" -ForegroundColor Yellow
                Stop-Process -Id $owner.Pid -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 1
                Start-RealServer
            }
        }
        else {
            # Port is free - start real server
            Start-RealServer
        }
    } catch {
        Write-Host "[WATCHDOG] Error: $_" -ForegroundColor Red
    }

    Start-Sleep -Seconds $CheckIntervalSeconds
}
