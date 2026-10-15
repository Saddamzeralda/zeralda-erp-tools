Stop-Process -Name python, pythonw -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
try {
    [IO.File]::WriteAllText('C:\Program Files\Zeralda ERP\app\handlers\test.txt', 'test')
    Write-Host "Write succeeded!"
    Remove-Item 'C:\Program Files\Zeralda ERP\app\handlers\test.txt' -Force
} catch {
    Write-Host "Write failed: $($_.Exception.Message)"
}
