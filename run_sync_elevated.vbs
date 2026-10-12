Set objShell = CreateObject("Shell.Application")
objShell.ShellExecute "cmd.exe", "/c """ & "C:\Users\User\Desktop\zeralda-erp-employees-main\zeralda-erp-employees-main\sync_install.cmd" & """", "", "runas", 0
