$base = "C:\Program Files\Zeralda ERP"
$dirs = Get-ChildItem -Path $base -Directory
foreach ($d in $dirs) {
    $testFile = Join-Path $d.FullName "test_perm.tmp"
    try {
        [IO.File]::WriteAllText($testFile, "test")
        Remove-Item $testFile -Force
        Write-Host "Writable: $($d.FullName)"
    } catch {
        Write-Host "Locked:   $($d.FullName)"
    }
}
