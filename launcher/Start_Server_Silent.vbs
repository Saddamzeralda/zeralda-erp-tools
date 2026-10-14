Set WShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

LauncherDir = FSO.GetParentFolderName(WScript.ScriptFullName)
ProjectRoot = FSO.GetParentFolderName(LauncherDir)

' Bundled embedded Python (installed by the installer to {app}\python\)
BundledPyExe  = ProjectRoot & "\python\python.exe"

ServerScript  = ProjectRoot & "\app\main.py"
LegacyServer  = ProjectRoot & "\server.py"
LogFile       = ProjectRoot & "\logs\server.log"
Port          = "8080"

WShell.CurrentDirectory = ProjectRoot

' Select Python interpreter: bundled > system
Dim PythonExe
If FSO.FileExists(BundledPyExe) Then
    PythonExe = BundledPyExe
Else
    PythonExe = "python"
End If

' Select server: FastAPI app.main (preferred) > legacy server.py
Dim Command
If FSO.FileExists(ServerScript) Then
    Command = Chr(34) & PythonExe & Chr(34) & " -m app.main"
ElseIf FSO.FileExists(LegacyServer) Then
    Command = Chr(34) & PythonExe & Chr(34) & " " & Chr(34) & LegacyServer & Chr(34) & " " & Port
Else
    WScript.Quit 1
End If

' Start server in background (hidden) via a temp batch file
Dim BatFile
BatFile = ProjectRoot & "\logs\start_server.bat"
Dim batObj
Set batObj = FSO.CreateTextFile(BatFile, True)
batObj.WriteLine "@echo off"
batObj.WriteLine "cd /d " & Chr(34) & ProjectRoot & Chr(34)
batObj.WriteLine Command & " >> " & Chr(34) & LogFile & Chr(34) & " 2>&1"
batObj.Close
WShell.Run BatFile, 0, False

' Open browser immediately — the page will auto-retry until the server is ready
Dim Url
Url = "https://zeralda-erp-employees-main-production.up.railway.app/login.html?next=%2Fzeralda_erp_dashboard.html"
WShell.Run Url, 1, False
