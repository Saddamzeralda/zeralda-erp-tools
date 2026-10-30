param(
    [Parameter(Mandatory=$true)][string]$AppDir,
    [Parameter(Mandatory=$true)][ValidateSet('cleanup','pip','launcher')][string]$Stage
)

# bootstrap.ps1 -- Post-installation setup for Zeralda ERP
# Stages:
#   cleanup  -- Stop any running ERP processes from previous installation
#   pip      -- Install Python dependencies into the bundled embedded Python
#   launcher -- Create the silent VBS tray launcher + diagnostic CMD

$ErrorActionPreference = 'Continue'

$LogFile = Join-Path $AppDir 'logs\install.log'
New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null

function Log([string]$msg) {
    $line = '{0}  [{1}]  {2}' -f [DateTime]::Now.ToString('o'), $Stage, $msg
    $line | Out-File -FilePath $LogFile -Append -Encoding UTF8
    Write-Host $line
}

function Join-ArgumentLine {
    param([string[]]$ArgValues)
    $quoted = foreach ($a in $ArgValues) {
        if ($a -match '[\s"]') {
            '"' + ($a -replace '"', '\"') + '"'
        } else {
            $a
        }
    }
    return ($quoted -join ' ')
}

function Invoke-Native {
    param([string]$Exe, [string[]]$ArgList, [string]$Description, [int]$TimeoutSec = 600)
    $argLine = Join-ArgumentLine -ArgValues $ArgList
    Log "RUN: $Exe $argLine"
    $stdoutFile = [IO.Path]::GetTempFileName()
    $stderrFile = [IO.Path]::GetTempFileName()
    try {
        if ([string]::IsNullOrWhiteSpace($argLine)) {
            $proc = Start-Process -FilePath $Exe `
                -NoNewWindow -Wait -PassThru `
                -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        } else {
            $proc = Start-Process -FilePath $Exe -ArgumentList $argLine `
                -NoNewWindow -Wait -PassThru `
                -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        }
        $code = $proc.ExitCode
        $out = Get-Content $stdoutFile -Raw -ErrorAction SilentlyContinue
        $err = Get-Content $stderrFile -Raw -ErrorAction SilentlyContinue
        if ($out) { Log "STDOUT: $out" }
        if ($err) { Log "STDERR: $err" }
        Log "EXIT: $code"
        if ($code -ne 0) { throw "$Description failed (exit $code)" }
    } finally {
        Remove-Item $stdoutFile, $stderrFile -ErrorAction SilentlyContinue
    }
}

try {
    Log "=== Stage: $Stage start ==="
    Log "AppDir: $AppDir"

    $pyDir   = Join-Path $AppDir 'python'
    $pyExe   = Join-Path $pyDir  'python.exe'
    if (-not (Test-Path $pyExe)) {
        $altPy = Join-Path $AppDir 'tools\python-embed\python.exe'
        if (Test-Path $altPy) {
            $pyDir = Join-Path $AppDir 'tools\python-embed'
            $pyExe = $altPy
        }
    }
    $getPip  = Join-Path $pyDir  'get-pip.py'

    if (-not (Test-Path $pyExe)) {
        throw "Bundled Python not found at $pyExe. Installer is broken -- please reinstall."
    }
    Log "Python: $pyExe"

    switch ($Stage) {
        'cleanup' {
            # Stop any running ERP processes from previous installation
            Log 'Stopping old ERP processes...'
            Get-Process | Where-Object {
                $_.Path -and ($_.Path -like (Join-Path $AppDir '*'))
            } | ForEach-Object {
                Log "  Stopping: $($_.ProcessName) PID=$($_.Id)"
                Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
            }
            # Also kill python processes running from AppDir
            Get-CimInstance Win32_Process -Filter "name='python.exe' OR name='pythonw.exe'" -ErrorAction SilentlyContinue |
                Where-Object { $_.CommandLine -and ($_.CommandLine -like "*$AppDir*") } |
                ForEach-Object {
                    Log "  Stopping Python: PID=$($_.ProcessId)"
                    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
                }
            Start-Sleep -Seconds 2
            Log 'Cleanup completed'
        }

        'pip' {
            # Create sitecustomize.py so the embedded Python can find the app module.
            # The embedded python311._pth restricts sys.path to the python\ directory,
            # so `python -m app.main` fails with ModuleNotFoundError. sitecustomize.py
            # runs at interpreter startup and adds the app root to sys.path.
            $sitePackages = Join-Path $pyDir 'Lib\site-packages'
            $siteCustomize = Join-Path $sitePackages 'sitecustomize.py'
            if (-not (Test-Path $sitePackages)) {
                Log "Creating directory: $sitePackages"
                New-Item -ItemType Directory -Force -Path $sitePackages | Out-Null
            }
            if (-not (Test-Path $siteCustomize)) {
                $siteLines = @(
                    'import os, sys',
                    '# sitecustomize.py -- add app root to sys.path for embedded Python',
                    '_app_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))',
                    'if _app_root not in sys.path:',
                    '    sys.path.insert(0, _app_root)'
                )
                $siteContent = $siteLines -join "`r`n"
                Log "Creating sitecustomize.py at $siteCustomize"
                [IO.File]::WriteAllText($siteCustomize, $siteContent, [Text.Encoding]::UTF8)
                Log 'sitecustomize.py created successfully'
            } else {
                Log 'sitecustomize.py already exists -- skipping'
            }

            $reqs = Join-Path $AppDir 'requirements.txt'
            if (-not (Test-Path $reqs)) {
                Log 'requirements.txt missing -- skipping pip install'
                break
            }

            # Bootstrap pip into the embedded interpreter (one-time)
            # Also verify pip is not broken (missing _internal.utils module)
            $pipMarker = Join-Path $pyDir 'Lib\site-packages\pip'
            $pipWorking = $false
            if (Test-Path $pipMarker) {
                try {
                    $pipCheck = & $pyExe -c "import pip; from pip._internal.utils import _log; print('ok')" 2>&1
                    if ($pipCheck -match 'ok') { $pipWorking = $true }
                } catch { $pipWorking = $false }
            }
            if (-not $pipWorking) {
                if (-not (Test-Path $getPip)) {
                    throw "get-pip.py missing at $getPip"
                }
                if (Test-Path $pipMarker) {
                    Log 'pip is broken -- removing and reinstalling...'
                    Remove-Item $pipMarker -Recurse -Force -ErrorAction SilentlyContinue
                    Get-ChildItem (Join-Path $pyDir 'Lib\site-packages') -Filter 'pip-*.dist-info' -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
                }
                Log 'Bootstrapping pip into embedded Python...'
                Invoke-Native -Exe $pyExe -ArgList @($getPip, '--no-warn-script-location') -Description 'get-pip bootstrap'
            } else {
                Log 'pip already installed and working -- skipping bootstrap'
            }

            Log 'Upgrading pip...'
            Invoke-Native -Exe $pyExe -ArgList @('-m','pip','install','--upgrade','pip','--disable-pip-version-check','--no-warn-script-location') -Description 'pip self-upgrade'

            # Try offline install first (from bundled pip-packages), fall back to online
            $pipCache = Join-Path $AppDir 'pip-packages'
            $hasOfflineCache = (Test-Path $pipCache) -and ((Get-ChildItem $pipCache -Filter '*.whl' -EA SilentlyContinue).Count -gt 0)

            if ($hasOfflineCache) {
                Log "Installing requirements.txt from offline cache: $pipCache"
                try {
                    Invoke-Native -Exe $pyExe -ArgList @('-m','pip','install','-r',$reqs,'--no-index','--find-links',$pipCache,'--disable-pip-version-check','--no-warn-script-location') -Description 'requirements install (offline)'
                    Log 'Offline install from bundled pip-packages succeeded'
                } catch {
                    Log "Offline install failed: $($_.Exception.Message) -- falling back to online install"
                    Invoke-Native -Exe $pyExe -ArgList @('-m','pip','install','-r',$reqs,'--disable-pip-version-check','--prefer-binary','--no-warn-script-location') -Description 'requirements install (online fallback)'
                }
            } else {
                Log 'No offline pip cache found -- installing from PyPI (internet required)'
                Invoke-Native -Exe $pyExe -ArgList @('-m','pip','install','-r',$reqs,'--disable-pip-version-check','--prefer-binary','--no-warn-script-location') -Description 'requirements install (online)'
            }

            Log 'Python dependencies installed successfully'
        }

        'launcher' {
            $cr = [char]13; $lf = [char]10; $crlf = "$cr$lf"

            # Ensure .env exists from .env.example if missing
            $envEx = Join-Path $AppDir '.env.example'
            $envAct = Join-Path $AppDir '.env'
            if (-not (Test-Path $envAct) -and (Test-Path $envEx)) {
                Copy-Item $envEx $envAct -Force
                Log "Created default .env from .env.example"
            }

            # 1) Silent launcher VBS -- starts server in background + opens browser URL directly
            #    No tray icon -- just server + browser. Used for desktop shortcut AND auto-start.
            $trayVbs = Join-Path $AppDir 'launcher\Start_Tray_Silent.vbs'
            $vbsLines = @(
                'Set WShell = CreateObject("WScript.Shell")',
                'Set FSO = CreateObject("Scripting.FileSystemObject")',
                'LauncherDir = FSO.GetParentFolderName(WScript.ScriptFullName)',
                'ProjectRoot = FSO.GetParentFolderName(LauncherDir)',
                'BundledPy = ProjectRoot & "\python\python.exe"',
                'AppMain = ProjectRoot & "\app\main.py"',
                'LegacyServer = ProjectRoot & "\server.py"',
                'LogFile = ProjectRoot & "\logs\server.log"',
                'LogDir = ProjectRoot & "\logs"',
                'If Not FSO.FolderExists(LogDir) Then',
                '    FSO.CreateFolder LogDir',
                'End If',
                "' Read port from .env if available",
                'Port = "8080"',
                'On Error Resume Next',
                'Dim envFile, envReader, envLine',
                'envFile = ProjectRoot & "\.env"',
                'StartupUrl = ""',
                'If FSO.FileExists(envFile) Then',
                '    Set envReader = FSO.OpenTextFile(envFile, 1)',
                '    Do While Not envReader.AtEndOfStream',
                '        envLine = Trim(envReader.ReadLine)',
                '        If Left(envLine, 5) = "PORT=" Then',
                '            Port = Trim(Mid(envLine, 6))',
                '        End If',
                '        If Left(envLine, 12) = "STARTUP_URL=" Then',
                '            StartupUrl = Trim(Mid(envLine, 13))',
                '        End If',
                '    Loop',
                '    envReader.Close',
                'End If',
                'Err.Clear',
                'On Error GoTo 0',
                'WShell.CurrentDirectory = ProjectRoot',
                'Dim PythonExe',
                'If FSO.FileExists(BundledPy) Then',
                '    PythonExe = BundledPy',
                'Else',
                '    PythonExe = "python"',
                'End If',
                'Dim Command',
                'If FSO.FileExists(AppMain) Then',
                '    Command = Chr(34) & PythonExe & Chr(34) & " -m app.main"',
                'ElseIf FSO.FileExists(LegacyServer) Then',
                '    Command = Chr(34) & PythonExe & Chr(34) & " " & Chr(34) & LegacyServer & Chr(34) & " " & Port',
                'Else',
                '    WScript.Quit 1',
                'End If',
                "' Start server in background (hidden) via cmd.exe",
                "' Using cmd /c with direct command for reliability across Windows versions",
                'Dim FullCmd',
                'FullCmd = Chr(34) & Command & " >> " & Chr(34) & LogFile & Chr(34) & " 2>&1" & Chr(34)',
                'WShell.Environment("PROCESS")("LAUNCH_MODE") = "launcher"',
                'WShell.Environment("PROCESS")("AUTO_OPEN_BROWSER") = "false"',
                'WShell.Run "cmd /c " & FullCmd, 0, False',
                "' Wait for server to be ready (up to 30 seconds)",
                "' Check both /api/ping AND the main page to ensure full readiness",
                'Dim waitCount',
                'waitCount = 0',
                'Dim serverReady',
                'serverReady = False',
                'Do While waitCount < 60',
                '    On Error Resume Next',
                '    Dim httpReq',
                '    Set httpReq = CreateObject("WinHttp.WinHttpRequest.5.1")',
                '    If Err.Number = 0 Then',
                '        httpReq.Open "GET", "http://127.0.0.1:" & Port & "/api/ping", False',
                '        httpReq.SetTimeouts 2000, 2000, 2000, 2000',
                '        httpReq.Send',
                '        If Err.Number = 0 And httpReq.Status = 200 Then',
                "            ' Ping works -- now verify the main page loads too",
                '            Dim httpReq2',
                '            Set httpReq2 = CreateObject("WinHttp.WinHttpRequest.5.1")',
                '            httpReq2.Open "GET", "http://127.0.0.1:" & Port & "/login.html", False',
                '            httpReq2.SetTimeouts 3000, 3000, 3000, 3000',
                '            httpReq2.Send',
                '            If Err.Number = 0 And httpReq2.Status = 200 Then',
                '                serverReady = True',
                '                Exit Do',
                '            End If',
                '        End If',
                '    End If',
                '    Err.Clear',
                '    On Error GoTo 0',
                '    WScript.Sleep 500',
                '    waitCount = waitCount + 1',
                'Loop',
                'If Not serverReady Then',
                '    MsgBox "Zeralda ERP could not start. Check the server log:" & vbCrLf & LogFile, vbCritical, "Zeralda ERP"',
                '    WScript.Quit 1',
                'End If',
                "' Extra safety delay to ensure all modules are fully loaded",
                'If serverReady Then',
                '    WScript.Sleep 2000',
                'End If',
                "' Open browser directly to the local ERP dashboard URL",
                'Dim Url',
                'If Len(StartupUrl) > 0 And (InStr(StartupUrl, "127.0.0.1") > 0 Or InStr(StartupUrl, "localhost") > 0) Then',
                '    Url = StartupUrl',
                'Else',
                '    Url = "http://127.0.0.1:" & Port & "/zeralda_erp_dashboard.html"',
                'End If',
                'WShell.Run Url, 1, False'
            )
            $vbsContent = $vbsLines -join $crlf
            [IO.File]::WriteAllText($trayVbs, $vbsContent, [Text.Encoding]::ASCII)
            Log "Silent VBS launcher (server + browser auto-open): $trayVbs"

            # 2) Remove old KeygenTool.cmd if it exists (replaced by Protection Toolkit)
            $oldKeygen = Join-Path $AppDir 'launcher\KeygenTool.cmd'
            if (Test-Path $oldKeygen) {
                Remove-Item $oldKeygen -Force -ErrorAction SilentlyContinue
                Log "Removed old KeygenTool.cmd (replaced by START_TOOLKIT.cmd)"
            }

            # 2) Diagnostic CMD launcher (visible console, for troubleshooting)
            $diagCmd = Join-Path $AppDir 'launch_diagnostic.cmd'
            $cmdLines = @(
                '@echo off',
                'title Zeralda ERP (diagnostic)',
                ('cd /d "{0}"' -f $AppDir),
                'set "ENVIRONMENT=development"',
                'set "AUTH_DISABLED_IN_DEV=true"',
                'echo Starting Zeralda ERP server (diagnostic mode)...',
                ('echo Python: "{0}"' -f $pyExe),
                'echo.',
                'echo Press Ctrl+C to stop the server.',
                'echo.',
                ('"{0}" -m app.main' -f $pyExe),
                'echo.',
                'echo [Server stopped] Press any key to close.',
                'pause >nul'
            )
            $cmdContent = $cmdLines -join $crlf
            [IO.File]::WriteAllText($diagCmd, $cmdContent, [Text.Encoding]::ASCII)
            Log "Diagnostic launcher: $diagCmd"

            Log 'Launcher scripts created successfully'
        }
    }

    Log "=== Stage: $Stage completed successfully ==="
    exit 0
} catch {
    Log "ERROR: $($_.Exception.Message)"
    if ($_.ScriptStackTrace) { Log "TRACE: $($_.ScriptStackTrace)" }
    exit 1
}
