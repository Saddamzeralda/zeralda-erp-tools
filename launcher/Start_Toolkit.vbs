Set WShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

LauncherDir = FSO.GetParentFolderName(WScript.ScriptFullName)
ProjectRoot = FSO.GetParentFolderName(LauncherDir)

' Create and run a bat file to start the toolkit server
Dim BatFile
BatFile = ProjectRoot & "\logs\start_toolkit.bat"
Dim batObj
Set batObj = FSO.CreateTextFile(BatFile, True)
batObj.WriteLine "@echo off"
batObj.WriteLine "cd /d " & Chr(34) & ProjectRoot & Chr(34)
batObj.WriteLine "start " & Chr(34) & Chr(34) & " /B python tools\protection_toolkit.py --web"
batObj.Close
WShell.Run BatFile, 0, False

' Wait for server to be ready (up to 20 seconds)
Dim waitCount
waitCount = 0
Do While waitCount < 40
    On Error Resume Next
    Dim httpReq
    Set httpReq = CreateObject("WinHttp.WinHttpRequest.5.1")
    If Err.Number = 0 Then
        httpReq.Open "GET", "http://127.0.0.1:9090/api/toolkit/server/status", False
        httpReq.SetTimeouts 2000, 2000, 2000, 2000
        httpReq.Send
        If Err.Number = 0 And httpReq.Status = 200 Then
            Exit Do
        End If
    End If
    Err.Clear
    On Error GoTo 0
    WScript.Sleep 500
    waitCount = waitCount + 1
Loop

' Open browser
WShell.Run "http://127.0.0.1:9090/", 1, False
