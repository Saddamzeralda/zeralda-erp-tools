Set objShell = CreateObject("Shell.Application")
objShell.ShellExecute "cmd.exe", "/c """ & "C:\Users\User\Desktop\zeralda-erp-employees-main\zeralda-erp-employees-main\do_update.cmd" & """", "", "runas", 1
