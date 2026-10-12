Set WShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
LauncherDir = FSO.GetParentFolderName(WScript.ScriptFullName)
ProjectRoot = FSO.GetParentFolderName(LauncherDir)
BundledPy = ProjectRoot & "\python\python.exe"
AppMain = ProjectRoot & "\app\main.py"
LegacyServer = ProjectRoot & "\server.py"
LogFile = ProjectRoot & "\logs\server.log"
' Read port and startup URL from .env if available
Port = "8080"
StartupUrl = ""
On Error Resume Next
Dim envFile, envReader, envLine
envFile = ProjectRoot & "\.env"
If FSO.FileExists(envFile) Then
    Set envReader = FSO.OpenTextFile(envFile, 1)
    Do While Not envReader.AtEndOfStream
        envLine = Trim(envReader.ReadLine)
        If Left(envLine, 5) = "PORT=" Then
            Port = Trim(Mid(envLine, 6))
        End If
        If Left(envLine, 12) = "STARTUP_URL=" Then
            StartupUrl = Trim(Mid(envLine, 13))
        End If
    Loop
    envReader.Close
End If
Err.Clear
On Error GoTo 0
WShell.CurrentDirectory = ProjectRoot
Dim PythonExe
If FSO.FileExists(BundledPy) Then
    PythonExe = BundledPy
Else
    PythonExe = "python"
End If
Dim Command
If FSO.FileExists(AppMain) Then
    Command = Chr(34) & PythonExe & Chr(34) & " -m app.main"
ElseIf FSO.FileExists(LegacyServer) Then
    Command = Chr(34) & PythonExe & Chr(34) & " " & Chr(34) & LegacyServer & Chr(34) & " " & Port
Else
    WScript.Quit 1
End If
' Start server in background (hidden) via cmd.exe
' Using cmd /c with direct command for reliability across Windows versions
Dim FullCmd
FullCmd = Chr(34) & Command & " >> " & Chr(34) & LogFile & Chr(34) & " 2>&1" & Chr(34)
WShell.Run "cmd /c " & FullCmd, 0, False
' Wait for server to be ready (up to 30 seconds)
' Check both /api/ping AND the main page to ensure full readiness
Dim waitCount
waitCount = 0
Dim serverReady
serverReady = False
Do While waitCount < 60
    On Error Resume Next
    Dim httpReq
    Set httpReq = CreateObject("WinHttp.WinHttpRequest.5.1")
    If Err.Number = 0 Then
        httpReq.Open "GET", "http://127.0.0.1:" & Port & "/api/ping", False
        httpReq.SetTimeouts 2000, 2000, 2000, 2000
        httpReq.Send
        If Err.Number = 0 And httpReq.Status = 200 Then
            ' Ping works -- now verify the main page loads too
            Dim httpReq2
            Set httpReq2 = CreateObject("WinHttp.WinHttpRequest.5.1")
            httpReq2.Open "GET", "http://127.0.0.1:" & Port & "/login.html", False
            httpReq2.SetTimeouts 3000, 3000, 3000, 3000
            httpReq2.Send
            If Err.Number = 0 And httpReq2.Status = 200 Then
                serverReady = True
                Exit Do
            End If
        End If
    End If
    Err.Clear
    On Error GoTo 0
    WScript.Sleep 500
    waitCount = waitCount + 1
Loop
' Extra safety delay to ensure all modules are fully loaded
If serverReady Then
    WScript.Sleep 2000
End If
' Open browser directly to the ERP URL
Dim Url
Url = ""
Dim RemoteInfoFile
RemoteInfoFile = ProjectRoot & "\data\remote_access_info.json"
If FSO.FileExists(RemoteInfoFile) Then
    On Error Resume Next
    Dim rInfoStream, rContent, rePub
    Set rInfoStream = FSO.OpenTextFile(RemoteInfoFile, 1)
    rContent = rInfoStream.ReadAll
    rInfoStream.Close
    Set rePub = New RegExp
    rePub.Pattern = """public_url""\s*:\s*""(https://[^""]+)"""
    rePub.IgnoreCase = True
    If rePub.Test(rContent) Then
        Url = rePub.Execute(rContent)(0).SubMatches(0) & "/login.html?next=%2Fzeralda_erp_dashboard.html"
    End If
    On Error GoTo 0
End If
If Len(Url) = 0 Then
    If Len(StartupUrl) > 0 Then
        Url = StartupUrl
    Else
        Url = "https://athletic-concepts-brochure-next.trycloudflare.com/login.html?next=%2Fzeralda_erp_dashboard.html"
    End If
End If
WShell.Run Url, 1, False