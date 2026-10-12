#Requires -Version 5
<#
.SYNOPSIS
    Zeralda ERP - System Tray Control
    Shows server status, restart button, and clean shutdown from the system tray.
    Run with: powershell -STA -NoProfile -ExecutionPolicy Bypass -File Zeralda_Tray.ps1
#>
param([int]$Port = 8080)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$scriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot  = Split-Path -Parent $scriptDir
$bundledPy    = Join-Path $projectRoot 'python\python.exe'
$venvPy       = Join-Path $projectRoot '.venv\Scripts\python.exe'
$venvConfig   = Join-Path $projectRoot '.venv\pyvenv.cfg'
$serverScript = Join-Path $projectRoot 'server.py'
$appMainPy    = Join-Path $projectRoot 'app\main.py'
$iconPath     = Join-Path $scriptDir 'app.ico'
$erpUrl       = "https://athletic-concepts-brochure-next.trycloudflare.com/login.html?next=%2Fzeralda_erp_dashboard.html"

# Read port and startup URL from .env only when caller did not explicitly pass -Port
if (-not $PSBoundParameters.ContainsKey('Port')) {
    $envFile = Join-Path $projectRoot '.env'
    if (Test-Path $envFile) {
        foreach ($line in (Get-Content $envFile -ErrorAction SilentlyContinue)) {
            if ($line -match '^PORT=(\d+)') { $Port = [int]$Matches[1] }
            if ($line -match '^STARTUP_URL=(.+)') { $erpUrl = $Matches[1].Trim() }
        }
    }
}

# ── Server control helpers ─────────────────────────────────────────────────────
function Get-ServerPid {
    try {
        $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($c) { return [int]$c.OwningProcess }
    } catch {}
    return 0
}

function Test-IsCorrectServer([int]$pid) {
    if ($pid -le 4) { return $false }
    try {
        $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$pid" -ErrorAction SilentlyContinue).CommandLine
        # Accept both legacy server.py and FastAPI app.main
        return ($cl -like '*server.py*' -or $cl -like '*app.main*' -or $cl -like '*app\main*')
    } catch {
        try {
            $cl = (Get-WmiObject Win32_Process -Filter "ProcessId=$pid" -ErrorAction SilentlyContinue).CommandLine
            return ($cl -like '*server.py*' -or $cl -like '*app.main*' -or $cl -like '*app\main*')
        } catch {}
    }
    return $false
}

function Stop-ServerNow {
    # Method A: by port
    $pid1 = Get-ServerPid
    if ($pid1 -gt 4) {
        Stop-Process -Id $pid1 -Force -ErrorAction SilentlyContinue
    }
    # Method B: any python running ERP server (server.py OR app.main)
    try {
        Get-CimInstance Win32_Process -Filter "name='python.exe' OR name='py.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -like '*server.py*' -or $_.CommandLine -like '*app.main*' -or $_.CommandLine -like '*app\main*' } |
            ForEach-Object { Stop-Process -Id ([int]$_.ProcessId) -Force -ErrorAction SilentlyContinue }
    } catch {}
    Start-Sleep -Milliseconds 600
}

function Start-ServerNow {
    $pyExe = if (Test-Path $bundledPy) { $bundledPy } elseif ((Test-Path $venvPy) -and (Test-Path $venvConfig)) { $venvPy } elseif (Get-Command py -ErrorAction SilentlyContinue) { 'py' } else { 'python' }
    $env:PYTHONIOENCODING = 'utf-8'; $env:PYTHONUTF8 = '1'; $env:PORT = [string]$Port
    # Prefer FastAPI app.main ; fall back to legacy server.py
    if (Test-Path $appMainPy) {
        Start-Process -FilePath $pyExe -ArgumentList @('-m', 'app.main') -WorkingDirectory $projectRoot -WindowStyle Hidden
    } else {
        Start-Process -FilePath $pyExe -ArgumentList $serverScript -WorkingDirectory $projectRoot -WindowStyle Hidden
    }
}

function Restart-ServerNow {
    Stop-ServerNow
    Start-ServerNow
}

# ── Build tray icon ────────────────────────────────────────────────────────────
$trayIcon = New-Object System.Windows.Forms.NotifyIcon
if (Test-Path $iconPath) {
    $trayIcon.Icon = New-Object System.Drawing.Icon($iconPath)
} else {
    $trayIcon.Icon = [System.Drawing.SystemIcons]::Application
}
$trayIcon.Text    = 'Zeralda ERP'
$trayIcon.Visible = $true

# ── Context menu ──────────────────────────────────────────────────────────────
$ctxMenu = New-Object System.Windows.Forms.ContextMenuStrip

# -- Status item (read-only header)
$itStatus = New-Object System.Windows.Forms.ToolStripMenuItem
$itStatus.Text    = 'Server: Checking...'
$itStatus.Enabled = $false
$itStatus.Font    = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
$ctxMenu.Items.Add($itStatus) | Out-Null

$ctxMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

# -- Open ERP
$itOpen = New-Object System.Windows.Forms.ToolStripMenuItem
$itOpen.Text = 'Open Zeralda ERP'
$itOpen.Font = New-Object System.Drawing.Font('Segoe UI', 9)
$itOpen.Add_Click({ Start-Process $erpUrl })
$ctxMenu.Items.Add($itOpen) | Out-Null

$ctxMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

# -- Force Restart
$itRestart = New-Object System.Windows.Forms.ToolStripMenuItem
$itRestart.Text      = 'Force Restart Server'
$itRestart.ForeColor = [System.Drawing.Color]::DarkOrange
$itRestart.Font      = New-Object System.Drawing.Font('Segoe UI', 9)
$itRestart.Add_Click({
    $itStatus.Text = 'Server: Restarting...'
    $trayIcon.Text = 'Zeralda ERP - Restarting...'
    Restart-ServerNow
})
$ctxMenu.Items.Add($itRestart) | Out-Null

$ctxMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

# -- Force Kill Server (إغلاق إجباري — nuclear option, keeps tray alive)
$itForceKill = New-Object System.Windows.Forms.ToolStripMenuItem
$itForceKill.Text      = '[!] إغلاق إجباري للسيرفر'
$itForceKill.ForeColor = [System.Drawing.Color]::Red
$itForceKill.Font      = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
$itForceKill.Add_Click({
    $confirm = [System.Windows.Forms.MessageBox]::Show(
        "سيتم إنهاء جميع عمليات Python/server.py فوراً.`nهل أنت متأكد؟",
        'إغلاق إجباري للسيرفر',
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning
    )
    if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) { return }

    $itStatus.Text      = 'Server: Force killing...'
    $itStatus.ForeColor = [System.Drawing.Color]::Red
    $trayIcon.Text      = 'Zeralda ERP  [Force Kill]'

    # 1. Kill by port
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        foreach ($c in $conn) {
            $p = [int]$c.OwningProcess
            if ($p -gt 4) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
        }
    } catch {}

    # 2. TASKKILL — nuclear option: kill ALL python/py running ERP server (server.py OR app.main)
    try {
        $pyProcs = Get-CimInstance Win32_Process -Filter "name='python.exe' OR name='py.exe'" -ErrorAction SilentlyContinue |
                   Where-Object { $_.CommandLine -like '*server.py*' -or $_.CommandLine -like '*app.main*' -or $_.CommandLine -like '*app\main*' }
        foreach ($pr in $pyProcs) {
            & taskkill /PID $pr.ProcessId /F 2>$null
        }
    } catch {}

    # 3. PID file cleanup
    $pidDir  = Join-Path $env:LOCALAPPDATA 'Zeralda ERP'
    $pidFile = Join-Path $pidDir 'chrome_launcher_server.pid'
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue

    Start-Sleep -Milliseconds 800

    $trayIcon.BalloonTipTitle = 'إغلاق إجباري'
    $trayIcon.BalloonTipText  = 'تم إنهاء السيرفر بالقوة. يمكنك إعادة تشغيله من القائمة.'
    $trayIcon.BalloonTipIcon  = [System.Windows.Forms.ToolTipIcon]::Warning
    $trayIcon.ShowBalloonTip(4000)
})
$ctxMenu.Items.Add($itForceKill) | Out-Null

$ctxMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

# -- Stop & Exit
$itExit = New-Object System.Windows.Forms.ToolStripMenuItem
$itExit.Text      = 'Stop Server and Exit'
$itExit.ForeColor = [System.Drawing.Color]::DarkRed
$itExit.Font      = New-Object System.Drawing.Font('Segoe UI', 9)
$itExit.Add_Click({
    $timer.Stop()
    $itStatus.Text = 'Server: Stopping...'
    Stop-ServerNow
    $trayIcon.Visible = $false
    $trayIcon.Dispose()
    [System.Windows.Forms.Application]::Exit()
})
$ctxMenu.Items.Add($itExit) | Out-Null

$trayIcon.ContextMenuStrip = $ctxMenu

# Double-click to open ERP
$trayIcon.Add_DoubleClick({ Start-Process $erpUrl })

# ── Status timer ──────────────────────────────────────────────────────────────
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 4000
$timer.Add_Tick({
    $pid = Get-ServerPid
    if ($pid -gt 4) {
        if (Test-IsCorrectServer $pid) {
            $itStatus.Text    = "Server: Running  (PID $pid)"
            $itStatus.ForeColor = [System.Drawing.Color]::DarkGreen
            $trayIcon.Text    = "Zeralda ERP  [Running]"
        } else {
            $itStatus.Text    = "Server: WRONG process on port!"
            $itStatus.ForeColor = [System.Drawing.Color]::DarkRed
            $trayIcon.Text    = "Zeralda ERP  [ERROR]"
        }
    } else {
        $itStatus.Text    = "Server: Stopped"
        $itStatus.ForeColor = [System.Drawing.Color]::DarkRed
        $trayIcon.Text    = "Zeralda ERP  [Stopped]"
    }
})
$timer.Start()

# ── Balloon tip on start ───────────────────────────────────────────────────────
$trayIcon.BalloonTipTitle = 'Zeralda ERP'
$trayIcon.BalloonTipText  = 'Server monitor running. Right-click for options.'
$trayIcon.BalloonTipIcon  = [System.Windows.Forms.ToolTipIcon]::Info
$trayIcon.ShowBalloonTip(3000)

# ── Run message loop ──────────────────────────────────────────────────────────
[System.Windows.Forms.Application]::Run()
