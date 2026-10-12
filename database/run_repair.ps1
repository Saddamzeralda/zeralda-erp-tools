param(
    [string]$DbHost = "127.0.0.1",
    [int]$Port = 5432,
    [string]$User = "postgres",
    [string]$Database = "zeralda_erp",
    [string]$Password = ""
)

$ErrorActionPreference = "Stop"

Write-Host "Running PostgreSQL repair mode..." -ForegroundColor Cyan
$scriptPath = Join-Path $PSScriptRoot "repair_postgresql.sql"

if (!(Test-Path $scriptPath)) {
    Write-Host "repair_postgresql.sql not found: $scriptPath" -ForegroundColor Red
    exit 1
}

$psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
$psqlExe = if ($psqlCmd) { $psqlCmd.Source } else { $null }
if (-not $psqlExe) {
    $fallbacks = @(
        'C:\Program Files\PostgreSQL\17\bin\psql.exe',
        'C:\Program Files\PostgreSQL\16\bin\psql.exe',
        'C:\Program Files\PostgreSQL\15\bin\psql.exe',
        'C:\Program Files\PostgreSQL\14\bin\psql.exe',
        'C:\Program Files\PostgreSQL\13\bin\psql.exe',
        'C:\Program Files (x86)\PostgreSQL\17\bin\psql.exe',
        'C:\Program Files (x86)\PostgreSQL\16\bin\psql.exe'
    )
    $psqlExe = $fallbacks | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $psqlExe) {
    Write-Host "psql not found in PATH or standard install folders. Install PostgreSQL client tools and reopen terminal." -ForegroundColor Red
    exit 127
}

Write-Host "$psqlExe -h $DbHost -p $Port -U $User -d $Database -f \"$scriptPath\"" -ForegroundColor Yellow
$oldPgPassword = $env:PGPASSWORD
if ($Password) { $env:PGPASSWORD = $Password }
& "$psqlExe" -h $DbHost -p $Port -U $User -d $Database -f "$scriptPath" -w
$env:PGPASSWORD = $oldPgPassword
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host "Repair completed successfully." -ForegroundColor Green
} else {
    Write-Host "Repair failed with exit code $exitCode" -ForegroundColor Red
    exit $exitCode
}
