#Requires -Version 5
<#
.SYNOPSIS
    Zeralda ERP — Full Launcher with Auto-Stop
    Starts the Python server, opens the ERP launcher,
    and kills the server + database when the launcher window is closed.
#>

param(
    [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
$launcherDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot  = Resolve-Path (Join-Path $launcherDir '..')
$serverScript = Join-Path $projectRoot 'server.py'
$appMainPy    = Join-Path $projectRoot 'app\main.py'
$launcherExe  = Join-Path $launcherDir 'Zeralda_ERP_Launcher_core.exe'
$pidDir       = Join-Path $env:LOCALAPPDATA 'Zeralda ERP'
$pidFile      = Join-Path $pidDir 'chrome_launcher_server.pid'

# ── helpers ──────────────────────────────────────────────────────────────────
function Find-PythonExe {
    # 1) Bundled embedded Python (installed by the installer)
    $bundledPy = Join-Path $projectRoot 'python\python.exe'
    if (Test-Path $bundledPy) { return $bundledPy }
    # 2) Development venv
    $venvPy = Join-Path $projectRoot '.venv\Scripts\python.exe'
    $venvConfig = Join-Path $projectRoot '.venv\pyvenv.cfg'
    if ((Test-Path $venvPy) -and (Test-Path $venvConfig)) { return $venvPy }
    # 3) System Python
    if (Get-Command py      -ErrorAction SilentlyContinue) { return 'py' }
    if (Get-Command python  -ErrorAction SilentlyContinue) { return 'python' }
    throw 'Python not found. Install Python or create .venv first.'
}

function Get-ServerArgs([int]$Port) {
    # Prefer the FastAPI app (app.main) 
    # Fall back to legacy server.py if app/ is missing.
    if (Test-Path $appMainPy) {
        return @('-m', 'app.main')
    } else {
        return @($serverScript, $Port)
    }
}

function Read-EnvValue([string]$Key) {
    $envVal = [Environment]::GetEnvironmentVariable($Key)
    if ($envVal) { return $envVal }
    $envPath = Join-Path $projectRoot '.env'
    if (-not (Test-Path $envPath)) { return $null }
    foreach ($line in Get-Content $envPath -ErrorAction SilentlyContinue) {
        $t = $line.Trim()
        if ($t -match '^#' -or $t -notmatch '=') { continue }
        $parts = $t -split '=', 2
        if ($parts[0].Trim() -ieq $Key) { return $parts[1].Trim().Trim('"').Trim("'") }
    }
    return $null
}

function Test-PlaceholderOrWeakValue([string]$Value, [int]$MinLen = 32) {
    $v = [string]($Value)
    if ([string]::IsNullOrWhiteSpace($v)) { return $true }
    $x = $v.Trim().ToLowerInvariant()
    $blockedExact = @(
        'default',
        'example',
        'password',
        'admin@2026'
    )
    $blocked = @(
        'change_me',
        'changeme',
        'your-secure-password'
    )
    foreach ($tok in $blockedExact) {
        if ($x -eq $tok) { return $true }
    }
    foreach ($tok in $blocked) {
        if ($x.Contains($tok)) { return $true }
    }
    return ($v.Trim().Length -lt $MinLen)
}

function Show-PreflightSecurityWarning([string[]]$Issues) {
    $msg = "Zeralda ERP cannot start in production mode due to insecure configuration.`r`n`r`n"
    $msg += "Please fix the following and start again:`r`n"
    foreach ($i in $Issues) {
        $msg += " - $i`r`n"
    }
    $msg += "`r`nExpected startup route: launcher\\Launch_ERP.cmd"

    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
        [System.Windows.Forms.MessageBox]::Show(
            $msg,
            'Zeralda ERP - Security Configuration Error',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    } catch {
        Write-Host $msg
    }
}

function Invoke-ProductionPreflightSecurity {
    $envMode = [string](Read-EnvValue 'ENVIRONMENT')
    if ([string]::IsNullOrWhiteSpace($envMode)) { $envMode = 'development' }
    $envMode = $envMode.Trim().ToLowerInvariant()
    if ($envMode -ne 'production') { return }

    $issues = @()
    $secretKey = [string](Read-EnvValue 'SECRET_KEY')
    $jwtSecret = [string](Read-EnvValue 'JWT_SECRET')
    $defaultAdminPassword = [string](Read-EnvValue 'DEFAULT_ADMIN_PASSWORD')

    if (Test-PlaceholderOrWeakValue -Value $secretKey -MinLen 32) {
        $issues += 'SECRET_KEY is missing/weak/default'
    }
    if (Test-PlaceholderOrWeakValue -Value $jwtSecret -MinLen 32) {
        $issues += 'JWT_SECRET is missing/weak/default'
    }
    if (-not [string]::IsNullOrWhiteSpace($defaultAdminPassword) -and (Test-PlaceholderOrWeakValue -Value $defaultAdminPassword -MinLen 10)) {
        $issues += 'DEFAULT_ADMIN_PASSWORD is default/weak in production'
    }

    if ($issues.Count -gt 0) {
        Write-Host '[error] Production security preflight failed:'
        foreach ($issue in $issues) {
            Write-Host "[error] - $issue"
        }
        Show-PreflightSecurityWarning -Issues $issues
        exit 1
    }
}

Invoke-ProductionPreflightSecurity

function Wait-ForPort([int]$TargetPort, [int]$TimeoutSec = 30) {
    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt $TimeoutSec) {
        try {
            $c = New-Object System.Net.Sockets.TcpClient
            if ($c.BeginConnect('127.0.0.1', $TargetPort, $null, $null).AsyncWaitHandle.WaitOne(250, $false) -and $c.Connected) {
                $c.Close(); return $true
            }
            $c.Close()
        } catch {}
        Start-Sleep -Milliseconds 300
    }
    return $false
}

function Test-ApiServer([int]$TargetPort) {
    try {
        $base = "http://127.0.0.1:$TargetPort"
        $ping = Invoke-RestMethod -Uri "$base/api/ping" -Method GET -TimeoutSec 4 -ErrorAction Stop
        if (-not $ping -or $ping.ok -ne $true) { return $false }

        $alivePayload = @{
            sessionId = 'launcher-healthcheck'
            page      = '/launcher'
            ts        = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        } | ConvertTo-Json -Compress

        $alive = Invoke-RestMethod -Uri "$base/api/client/alive" -Method POST -Body $alivePayload -ContentType 'application/json' -TimeoutSec 4 -ErrorAction Stop
        return [bool]($alive -and $alive.ok -eq $true)
    } catch {
        return $false
    }
}

function Get-PortOwner([int]$TargetPort) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $conn) { return $null }

        $ownerPid = [int]$conn.OwningProcess
        $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction SilentlyContinue).CommandLine
        return [PSCustomObject]@{
            Pid = $ownerPid
            CommandLine = [string]$cmdLine
        }
    } catch {
        return $null
    }
}

function Resolve-LaunchPort([int]$PreferredPort, [int]$MaxProbeCount = 25) {
    # First check the preferred port
    $owner = Get-PortOwner -TargetPort $PreferredPort
    
    if (-not $owner) {
        return [PSCustomObject]@{
            Port = $PreferredPort
            AlreadyRunning = $false
            OwnerPid = 0
        }
    }
    
    if ((($owner.CommandLine -like '*server.py*') -or ($owner.CommandLine -like '*app.main*') -or ($owner.CommandLine -like '*app\main*')) -and (Test-ApiServer -TargetPort $PreferredPort)) {
        return [PSCustomObject]@{
            Port = $PreferredPort
            AlreadyRunning = $true
            OwnerPid = [int]$owner.Pid
        }
    }
    
    # Preferred port is occupied by a rogue/unknown process — kill it
    Write-Host "[warn] Port $PreferredPort is occupied by another process (PID $($owner.Pid)). Killing it..."
    Stop-Process -Id $owner.Pid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    
    # Verify port is now free
    $owner2 = Get-PortOwner -TargetPort $PreferredPort
    if (-not $owner2) {
        return [PSCustomObject]@{
            Port = $PreferredPort
            AlreadyRunning = $false
            OwnerPid = 0
        }
    }
    
    # Still occupied — try harder
    Write-Host "[warn] Port $PreferredPort still occupied. Force killing..."
    Stop-Process -Id $owner2.Pid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    
    $owner3 = Get-PortOwner -TargetPort $PreferredPort
    if (-not $owner3) {
        return [PSCustomObject]@{
            Port = $PreferredPort
            AlreadyRunning = $false
            OwnerPid = 0
        }
    }
    
    # Last resort: probe other ports
    $lastPort = $PreferredPort + $MaxProbeCount - 1
    for ($candidate = $PreferredPort + 1; $candidate -le $lastPort; $candidate++) {
        $owner = Get-PortOwner -TargetPort $candidate
        if (-not $owner) {
            Write-Host "[warn] Falling back to port $candidate."
            return [PSCustomObject]@{
                Port = $candidate
                AlreadyRunning = $false
                OwnerPid = 0
            }
        }
        if ((($owner.CommandLine -like '*server.py*') -or ($owner.CommandLine -like '*app.main*') -or ($owner.CommandLine -like '*app\main*')) -and (Test-ApiServer -TargetPort $candidate)) {
            return [PSCustomObject]@{
                Port = $candidate
                AlreadyRunning = $true
                OwnerPid = [int]$owner.Pid
            }
        }
    }

    return $null
}

function Stop-Server {
    $killed = @()

    # Method 1: PID file
    if (Test-Path $pidFile) {
        $pidText = (Get-Content $pidFile -Raw -ErrorAction SilentlyContinue).Trim()
        $parsedPid = 0
        if ([int]::TryParse($pidText, [ref]$parsedPid) -and $parsedPid -gt 0) {
            Stop-Process -Id $parsedPid -Force -ErrorAction SilentlyContinue
            Write-Host "[stop] Killed PID-file server PID $parsedPid."
            $killed += $parsedPid
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }

    # Method 2: Find PID by listening port (most reliable)
    try {
        $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        foreach ($l in $listeners) {
            $pid2 = [int]$l.OwningProcess
            if ($pid2 -gt 4 -and $pid2 -notin $killed) {
                Stop-Process -Id $pid2 -Force -ErrorAction SilentlyContinue
                Write-Host "[stop] Killed port-$Port server PID $pid2."
                $killed += $pid2
            }
        }
    } catch {}

    # Method 3: Kill any python running ERP server (server.py OR app.main)
    try {
        Get-WmiObject Win32_Process -Filter "name='python.exe' OR name='py.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -like '*server.py*' -or $_.CommandLine -like '*app.main*' -or $_.CommandLine -like '*app\main*' } |
            ForEach-Object {
                $pid3 = [int]$_.ProcessId
                if ($pid3 -gt 4 -and $pid3 -notin $killed) {
                    Stop-Process -Id $pid3 -Force -ErrorAction SilentlyContinue
                    Write-Host "[stop] Killed ERP server PID $pid3."
                    $killed += $pid3
                }
            }
    } catch {}

    # Method 4: Stop PostgreSQL Windows service
    $pgService = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pgService -and $pgService.Status -eq 'Running') {
        try {
            Stop-Service -Name $pgService.Name -Force -ErrorAction Stop
            Write-Host "[stop] PostgreSQL service '$($pgService.Name)' stopped."
        } catch {
            Write-Host "[warn] Could not stop PostgreSQL (try running as Administrator): $_"
        }
    }

    if ($killed.Count -eq 0) {
        Write-Host "[stop] No server process found to kill."
    }
}

# ── read .env port override ───────────────────────────────────────────────────
$portRaw = Read-EnvValue 'PORT'
if ($portRaw -match '^\d+$') { $Port = [int]$portRaw }

# ── resolve launch port (auto-shift if preferred port is busy) ────────────────
$requestedPort = $Port
$portSelection = Resolve-LaunchPort -PreferredPort $requestedPort
if (-not $portSelection) {
    Write-Host "[error] Could not find an available port starting from $requestedPort."
    exit 1
}

$Port = [int]$portSelection.Port
$alreadyRunning = [bool]$portSelection.AlreadyRunning

if ($Port -ne $requestedPort) {
    Write-Host "[info] Port $requestedPort is busy. Using fallback port $Port automatically."
}

if ($alreadyRunning) {
    Write-Host "[info] ERP server already running on port $Port (PID $($portSelection.OwnerPid))."
}

# ── update .env PORT to dynamic port so launcher exe opens browser correctly ─
$envPath = Join-Path $projectRoot '.env'
$envBackup = $null
if (Test-Path $envPath) {
    $envBackup = Get-Content $envPath -Raw -ErrorAction SilentlyContinue
    $envLines = Get-Content $envPath -ErrorAction SilentlyContinue
    $updatedLines = @()
    $portReplaced = $false
    foreach ($line in $envLines) {
        if ($line -match '^PORT=') {
            $updatedLines += "PORT=$Port"
            $portReplaced = $true
        } else {
            $updatedLines += $line
        }
    }
    if (-not $portReplaced) {
        $updatedLines += "PORT=$Port"
    }
    try {
        Set-Content -Path $envPath -Value $updatedLines -Encoding ASCII -ErrorAction Stop
        Write-Host "[info] .env PORT temporarily set to $Port for launcher."
    } catch {
        Write-Host "[warn] Could not update .env PORT: $_"
    }
}

$serverProc = $null

if (-not $alreadyRunning) {
    $pythonExe = Find-PythonExe
    $env:PYTHONIOENCODING = 'utf-8'
    $env:PYTHONUTF8      = '1'
    $env:PORT            = [string]$Port
    $env:LAUNCH_MODE = 'launcher'
    $env:AUTO_OPEN_BROWSER = 'false'

        # Start PostgreSQL if installed and not running
    $pgSvc = Get-Service -Name 'postgresql*' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pgSvc -and $pgSvc.Status -ne 'Running') {
        try {
            Start-Service -Name $pgSvc.Name -ErrorAction Stop
            Write-Host "[start] PostgreSQL service '$($pgSvc.Name)' started."
            # Write marker so Kill_ERP.ps1 knows it was started by ERP
            $pgMarker = Join-Path $env:LOCALAPPDATA 'Zeralda ERP\pg_started_by_erp.marker'
            New-Item -ItemType Directory -Path (Split-Path $pgMarker) -Force -ErrorAction SilentlyContinue | Out-Null
            Set-Content -Path $pgMarker -Value (Get-Date).ToString('o') -Encoding ASCII -ErrorAction SilentlyContinue
        } catch {
            Write-Host "[warn] Could not start PostgreSQL (try running as Administrator): $_"
        }
    }

    Write-Host "[start] Starting Python server on port $Port..."
    $serverArgs = Get-ServerArgs -Port $Port
    if ($pythonExe -eq 'py') {
        $serverProc = Start-Process -FilePath 'py' -ArgumentList $serverArgs `
            -WorkingDirectory $projectRoot -PassThru -WindowStyle Hidden
    } else {
        $serverProc = Start-Process -FilePath $pythonExe -ArgumentList $serverArgs `
            -WorkingDirectory $projectRoot -PassThru -WindowStyle Hidden
    }

    New-Item -ItemType Directory -Path $pidDir -Force -ErrorAction SilentlyContinue | Out-Null
    Set-Content -Path $pidFile -Value $serverProc.Id -Encoding ASCII

    Write-Host "[start] Waiting for server to be ready..."
    if (-not (Wait-ForPort -TargetPort $Port -TimeoutSec 35)) {
        Write-Host "[error] Server did not start in time. Aborting."
        Stop-Server
        exit 1
    }

    if (-not (Test-ApiServer -TargetPort $Port)) {
        Write-Host "[warn] Server port is open, but API health check failed. Retrying startup once..."
        Stop-Server
        Start-Sleep -Seconds 1

        if ($pythonExe -eq 'py') {
            $serverProc = Start-Process -FilePath 'py' -ArgumentList $serverArgs `
                -WorkingDirectory $projectRoot -PassThru -WindowStyle Hidden
        } else {
            $serverProc = Start-Process -FilePath $pythonExe -ArgumentList $serverArgs `
                -WorkingDirectory $projectRoot -PassThru -WindowStyle Hidden
        }

        Set-Content -Path $pidFile -Value $serverProc.Id -Encoding ASCII

        if (-not (Wait-ForPort -TargetPort $Port -TimeoutSec 35) -or -not (Test-ApiServer -TargetPort $Port)) {
            Write-Host "[error] API health check failed after retry."
            Stop-Server
            exit 1
        }
    }

    Write-Host "[ok] Server is ready on port $Port."
} else {
    Write-Host "[info] Server already running on port $Port."
}

# ── start system tray monitor (background, STA thread) ───────────────────────
$trayScript = Join-Path $launcherDir 'Zeralda_Tray.ps1'
$trayProc   = $null
if (Test-Path $trayScript) {
    $trayProc = Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @('-STA', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $trayScript, '-Port', $Port) `
        -WindowStyle Hidden -PassThru
    Write-Host "[start] Tray monitor launched (PID $($trayProc.Id))."
}

# ── start server watchdog (background) to prevent rogue http.server takeover ─
$watchdogScript = Join-Path $launcherDir 'Server_Watchdog.ps1'
$watchdogProc   = $null
if (Test-Path $watchdogScript) {
    $watchdogProc = Start-Process -FilePath 'powershell.exe' `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $watchdogScript, '-Port', $Port, '-CheckIntervalSeconds', 1) `
        -WindowStyle Hidden -PassThru
    Write-Host "[start] Server watchdog launched (PID $($watchdogProc.Id))."
}

if (Test-Path $launcherExe) {
    Write-Host "[start] Opening Zeralda ERP Launcher..."
    $erpProc = Start-Process -FilePath $launcherExe -PassThru
} else {
    $erpUrl = "http://127.0.0.1:$Port/login.html"
    Write-Host "[warn] Desktop launcher executable not found. Opening the local ERP in the default browser."
    Start-Process -FilePath $erpUrl | Out-Null
    $erpProc = $trayProc
}

# ── wait for the launcher/tray controller to exit, then stop the server ──────
try {
    if ($erpProc) {
        Write-Host "[wait] Monitoring launcher (PID $($erpProc.Id))... Exit the tray app to stop the server."
        $erpProc.WaitForExit()
    } else {
        Write-Host "[warn] No tray controller is available; the server will remain running."
    }
} finally {
    Write-Host "[stop] Launcher closed. Stopping server..."

    # Kill tray monitor if still running
    if ($trayProc -and -not $trayProc.HasExited) {
        Stop-Process -Id $trayProc.Id -Force -ErrorAction SilentlyContinue
        Write-Host "[stop] Tray monitor stopped."
    }

    if ($watchdogProc -and -not $watchdogProc.HasExited) {
        Stop-Process -Id $watchdogProc.Id -Force -ErrorAction SilentlyContinue
        Write-Host "[stop] Server watchdog stopped."
    }

    # ── restore original .env PORT ──────────────────────────────────────────
    if ($envBackup -and (Test-Path $envPath)) {
        try {
            Set-Content -Path $envPath -Value $envBackup -Encoding ASCII -ErrorAction Stop
            Write-Host "[info] .env PORT restored to original value."
        } catch {
            Write-Host "[warn] Could not restore .env PORT: $_"
        }
    }

    Stop-Server
    Write-Host "[done] Zeralda ERP shut down cleanly."
}
