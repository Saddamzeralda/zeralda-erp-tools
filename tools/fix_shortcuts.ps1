$sh = New-Object -ComObject WScript.Shell
$validVbs = "C:\Users\User\Desktop\zeralda-erp-employees-main\zeralda-erp-employees-main\launcher\Start_Tray_Silent.vbs"
$validDir = "C:\Users\User\Desktop\zeralda-erp-employees-main\zeralda-erp-employees-main"

$targets = @(
    "C:\Users\User\Desktop\Zeralda ERP.lnk",
    "C:\Users\Public\Desktop\Zeralda ERP.lnk"
)

foreach ($lnk in $targets) {
    try {
        if (Test-Path $lnk) {
            $sc = $sh.CreateShortcut($lnk)
            $sc.TargetPath = "C:\WINDOWS\system32\wscript.exe"
            $sc.Arguments = "`"$validVbs`""
            $sc.WorkingDirectory = $validDir
            $sc.IconLocation = "$validDir\launcher\app.ico,0"
            $sc.Save()
            Write-Host "Updated: $lnk -> pointing to $validVbs"
        }
    } catch {
        Write-Host "Could not update $lnk : $($_.Exception.Message)"
    }
}
