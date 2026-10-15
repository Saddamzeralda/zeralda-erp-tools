$sh = New-Object -ComObject WScript.Shell
Get-ChildItem 'C:\Users\User\Desktop\*.lnk', 'C:\Users\Public\Desktop\*.lnk' | ForEach-Object {
    $sc = $sh.CreateShortcut($_.FullName)
    Write-Host "File: $($_.Name)"
    Write-Host "  Target: $($sc.TargetPath)"
    Write-Host "  Args:   $($sc.Arguments)"
    Write-Host "-------------------------------------------"
}
