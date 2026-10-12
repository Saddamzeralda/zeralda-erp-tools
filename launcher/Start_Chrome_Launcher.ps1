param(
    [int]$Port = 8080,
    [switch]$NoWait
)

$ErrorActionPreference = 'Stop'

function Find-PythonExe {
    param([string]$ProjectRoot)

    # 1) Bundled embedded Python (installed by the installer)
    $bundledPy = Join-Path $ProjectRoot 'python\python.exe'
    if (Test-Path $bundledPy) { return $bundledPy }

    # 2) Development venv
    $venvPy = Join-Path $ProjectRoot '.venv\Scripts\python.exe'
    $venvConfig = Join-Path $ProjectRoot '.venv\pyvenv.cfg'
    if ((Test-Path $venvPy) -and (Test-Path $venvConfig)) { return $venvPy }

    # 3) System Python
    $pyCmd = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCmd) { return 'py -3' }

    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) { return 'python' }

    throw 'Python was not found. Install Python or create .venv first.'
}

function Find-ChromeExe {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
        "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
    )

    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }

    throw 'Google Chrome not found. Install Chrome first.'
}

function Read-DotEnvValue {
    param(
        [string]$ProjectRoot,
        [string]$Key
    )

    $envValue = [Environment]::GetEnvironmentVariable($Key)
    if (-not [string]::IsNullOrWhiteSpace($envValue)) {
        return $envValue
    }

    $envPath = Join-Path $ProjectRoot '.env'
    if (-not (Test-Path $envPath)) {
        return $null
    }

    foreach ($line in Get-Content -Path $envPath -ErrorAction SilentlyContinue) {
        $trimmed = [string]($line).Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) {
            continue
        }

        $parts = $trimmed.Split('=', 2)
        if ($parts.Count -lt 2) {
            continue
        }

        if ($parts[0].Trim().ToUpperInvariant() -ne $Key.ToUpperInvariant()) {
            continue
        }

        return $parts[1].Trim().Trim('"').Trim("'")
    }

    return $null
}

function Wait-ForPort {
    param([int]$TargetPort, [int]$TimeoutSeconds = 25)

    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt $TimeoutSeconds) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $iar = $client.BeginConnect('127.0.0.1', $TargetPort, $null, $null)
            if ($iar.AsyncWaitHandle.WaitOne(250, $false) -and $client.Connected) {
                $client.Close()
                return $true
            }
            $client.Close()
        } catch {
        }
        Start-Sleep -Milliseconds 300
    }
    return $false
}

$launcherDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Resolve-Path (Join-Path $launcherDir '..')
$serverScript = Join-Path $projectRoot 'server.py'
$appMainPy    = Join-Path $projectRoot 'app\main.py'
$pythonExe = Find-PythonExe -ProjectRoot $projectRoot
$chromeExe = Find-ChromeExe
$useHttpsRaw = Read-DotEnvValue -ProjectRoot $projectRoot -Key 'USE_HTTPS'
$portRaw = Read-DotEnvValue -ProjectRoot $projectRoot -Key 'PORT'
$useHttps = ($useHttpsRaw -as [string]) -match '^(1|true|yes|on)$'
if ($portRaw -match '^\d+$') { $Port = [int]$portRaw }

# ── dynamic port resolution: find already running ERP server on any port ─────
function Find-RunningServerPort {
    try {
        $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue
        foreach ($l in $listeners) {
            $pidVal = [int]$l.OwningProcess
            if ($pidVal -le 4) { continue }
            try {
                $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$pidVal" -ErrorAction SilentlyContinue).CommandLine
                # Match both legacy server.py and FastAPI app.main
                if ($cl -like '*server.py*' -or $cl -like '*app.main*' -or $cl -like '*app\main*') {
                    return [int]$l.LocalPort
                }
            } catch {}
        }
    } catch {}
    return 0
}

$runningPort = Find-RunningServerPort
if ($runningPort -gt 0) {
    $Port = $runningPort
    Write-Host "[info] Found running ERP server on port $Port."
    $alreadyRunning = $true
} else {
    $alreadyRunning = $false
}

$scheme = if ($useHttps) { 'https' } else { 'http' }
$loginUrl = if ($scheme -eq 'https') {
    "https://www.zeralda-erp.dz/login.html"
} else {
    "http://www.zeralda-erp.dz/login.html"
}
# Store PID file in AppData (writable) instead of Program Files (read-only)
$pidDir = Join-Path $env:LOCALAPPDATA 'Zeralda ERP'
$pidFile = Join-Path $pidDir 'chrome_launcher_server.pid'

# Verify at least one server entry point exists
if (-not (Test-Path $serverScript) -and -not (Test-Path $appMainPy)) {
    throw 'No server script found (neither app/main.py nor server.py).'
}

if (-not $alreadyRunning) {
    $env:PORT = [string]$Port
    $env:USE_HTTPS = if ($useHttps) { 'true' } else { 'false' }
    $env:PYTHONIOENCODING = 'utf-8'
    $env:PYTHONUTF8 = '1'
    # Prefer FastAPI app.main ; fall back to legacy server.py
    if (Test-Path $appMainPy) {
        $serverArgs = @('-m', 'app.main')
    } else {
        $serverArgs = @($serverScript, $Port)
    }
    if ($pythonExe -eq 'py -3') {
        $serverProc = Start-Process -FilePath 'py' -ArgumentList (@('-3') + $serverArgs) -WorkingDirectory $projectRoot -PassThru -WindowStyle Hidden
    } else {
        $serverProc = Start-Process -FilePath $pythonExe -ArgumentList $serverArgs -WorkingDirectory $projectRoot -PassThru -WindowStyle Hidden
    }
    # Ensure AppData directory exists before writing PID file
    New-Item -ItemType Directory -Path $pidDir -Force -ErrorAction SilentlyContinue | Out-Null
    Set-Content -Path $pidFile -Value $serverProc.Id -Encoding ASCII
}

if (-not $NoWait) {
    if (-not (Wait-ForPort -TargetPort $Port -TimeoutSeconds 30)) {
        throw "Server did not start on port $Port in time."
    }
}

# --fullscreen: window-level fullscreen that persists across navigation
Start-Process -FilePath $chromeExe -ArgumentList @('--new-window', '--fullscreen', '--disable-session-crashed-bubble', $loginUrl) | Out-Null
Write-Host '[ok] Chrome opened in fullscreen mode'
