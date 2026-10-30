Set WShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
LauncherDir = FSO.GetParentFolderName(WScript.ScriptFullName)
ProjectRoot = FSO.GetParentFolderName(LauncherDir)
BundledPy = ProjectRoot & "\python\python.exe"
VenvPy = ProjectRoot & "\.venv\Scripts\python.exe"
AppMain = ProjectRoot & "\app\main.py"
LegacyServer = ProjectRoot & "\server.py"
LogFile = ProjectRoot & "\logs\server.log"
LogDir = ProjectRoot & "\logs"
If Not FSO.FolderExists(LogDir) Then
    FSO.CreateFolder LogDir
End If
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
ElseIf FSO.FileExists(VenvPy) Then
    PythonExe = VenvPy
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
WShell.Environment("PROCESS")("LAUNCH_MODE") = "launcher"
WShell.Environment("PROCESS")("AUTO_OPEN_BROWSER") = "false"
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
If Not serverReady Then
    MsgBox "Zeralda ERP could not start. Check the server log:" & vbCrLf & LogFile, vbCritical, "Zeralda ERP"
    WScript.Quit 1
End If
' Extra safety delay to ensure all modules are fully loaded
If serverReady Then
    WScript.Sleep 2000
End If
' Open browser directly to the local ERP dashboard URL
Dim Url
If Len(StartupUrl) > 0 And (InStr(StartupUrl, "127.0.0.1") > 0 Or InStr(StartupUrl, "localhost") > 0) Then
    Url = StartupUrl
Else
    Url = "http://127.0.0.1:" & Port & "/zeralda_erp_dashboard.html"
End If
WShell.Run Url, 1, False