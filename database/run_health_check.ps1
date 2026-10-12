param(
    [string]$DbHost = "127.0.0.1",
    [int]$Port = 5432,
    [string]$User = "postgres",
    [string]$Database = "zeralda_erp",
    [string]$Password = ""
)

$ErrorActionPreference = "Stop"

Write-Host "Running PostgreSQL health check..." -ForegroundColor Cyan
$scriptPath = Join-Path $PSScriptRoot "health_check.sql"
$reportPath = Join-Path $PSScriptRoot "health_report.txt"

if (!(Test-Path $scriptPath)) {
    Write-Host "health_check.sql not found: $scriptPath" -ForegroundColor Red
    exit 1
}

${psqlCmd} = Get-Command psql -ErrorAction SilentlyContinue
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
    $msg = "psql not found in PATH. Install PostgreSQL client tools and reopen terminal."
    Write-Host $msg -ForegroundColor Red
    @(
        "Zeralda ERP DB Health Report",
        "GeneratedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
        "Database: $Database@${DbHost}:$Port",
        "Status: FAIL",
        "MissingCount: N/A",
        "",
        "---- Error ----",
        $msg
    ) | Set-Content -Path $reportPath -Encoding UTF8
    exit 127
}

$cmdText = "$psqlExe -h $DbHost -p $Port -U $User -d $Database -f `"$scriptPath`""
Write-Host $cmdText -ForegroundColor Yellow

$oldPgPassword = $env:PGPASSWORD
if ($Password) { $env:PGPASSWORD = $Password }
$output = & "$psqlExe" -h $DbHost -p $Port -U $User -d $Database -f "$scriptPath" -w 2>&1
$env:PGPASSWORD = $oldPgPassword
$exitCode = $LASTEXITCODE
$missingCount = ($output | Select-String -Pattern '\bMISSING\b').Count
$status = if ($exitCode -eq 0 -and $missingCount -eq 0) { "PASS" } else { "FAIL" }

$header = @(
    "Zeralda ERP DB Health Report",
    "GeneratedAt: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "Database: $Database@${DbHost}:$Port",
    "Status: $status",
    "MissingCount: $missingCount",
    "",
    "---- Raw Output ----"
)

($header + $output) | Set-Content -Path $reportPath -Encoding UTF8

if ($output) {
    $output | ForEach-Object { Write-Host $_ }
}
Write-Host "Health summary report saved: $reportPath" -ForegroundColor Cyan

if ($status -eq "PASS") {
    Write-Host "Health check completed." -ForegroundColor Green
} else {
    Write-Host "Health check failed. Review report: $reportPath" -ForegroundColor Red
    if ($exitCode -ne 0) {
        exit $exitCode
    }
    exit 2
}
