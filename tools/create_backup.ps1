$ErrorActionPreference = 'Stop'

# Script lives in tools/ — project root is one level up
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$backupDir = Join-Path $projectRoot 'backups'

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$timestampZip = Join-Path $backupDir ("zeralda-erp-employees-main_backup_$timestamp.zip")
$latestZip = Join-Path $backupDir 'latest_backup.zip'
$stageDir = Join-Path $env:TEMP ("zeralda_backup_stage_$timestamp")

if (Test-Path $stageDir) {
    Remove-Item -Path $stageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $stageDir | Out-Null

$excludeNames = @('backups', '.webview2_cache')
Get-ChildItem -Path $projectRoot -Force |
    Where-Object { $excludeNames -notcontains $_.Name } |
    ForEach-Object {
        try {
            Copy-Item -Path $_.FullName -Destination $stageDir -Recurse -Force -ErrorAction Stop
        }
        catch {
            Write-Warning ("Skipped during backup: " + $_.Exception.Message)
        }
    }

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stageDir,
    $timestampZip,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
)

Copy-Item -Path $timestampZip -Destination $latestZip -Force
Remove-Item -Path $stageDir -Recurse -Force

Write-Output "Backup created: $timestampZip"
Write-Output "Latest backup: $latestZip"
