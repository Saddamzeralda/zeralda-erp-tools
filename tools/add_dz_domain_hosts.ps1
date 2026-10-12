$path = "C:\Windows\System32\drivers\etc\hosts"
$content = Get-Content $path -Raw
$toAdd = @()
if ($content -notmatch "\bwww\.zeralda-erp\.dz\b") {
    $toAdd += "127.0.0.1 www.zeralda-erp.dz"
}
if ($content -notmatch "\bzeralda-erp\.dz\b") {
    $toAdd += "127.0.0.1 zeralda-erp.dz"
}
if ($toAdd.Count -gt 0) {
    Add-Content -Path $path -Value ($toAdd -join "`r`n")
}
Write-Output "Hosts file updated successfully"
