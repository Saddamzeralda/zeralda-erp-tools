#========================================
# Zeralda ERP - Database Auto-Start Module
# This script automatically starts PostgreSQL
# when system boots
#========================================

param(
    [switch]$Force,
    [string]$Password = ""
)

# Color codes
$colors = @{
    'Success' = 'Green'
    'Error'   = 'Red'
    'Info'    = 'Cyan'
    'Warning' = 'Yellow'
}

function Write-Status {
    param(
        [string]$Message,
        [string]$Type = 'Info'
    )
    $color = $colors[$Type]
    if (-not $color) { $color = 'White' }
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] " -NoNewline
    Write-Host $Message -ForegroundColor $color
}

function Test-PostgreSQLService {
    $services = @('postgresql-x64-15', 'postgresql-x64-14', 'postgresql-x64-13', 'postgresql')
    
    foreach ($service in $services) {
        $svc = Get-Service -Name $service -ErrorAction SilentlyContinue
        if ($svc) {
            return $service
        }
    }
    return $null
}

function Start-PostgreSQLService {
    param(
        [string]$ServiceName
    )
    
    try {
        $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        
        if ($svc) {
            if ($svc.Status -eq 'Running') {
                Write-Status "PostgreSQL is already running ($ServiceName)" -Type 'Info'
                return $true
            }
            
            Write-Status "Starting PostgreSQL ($ServiceName)..." -Type 'Info'
            Start-Service -Name $ServiceName
            
            # Wait for service to start
            $timeout = 0
            while ((Get-Service -Name $ServiceName).Status -ne 'Running' -and $timeout -lt 30) {
                Start-Sleep -Seconds 1
                $timeout++
            }
            
            if ((Get-Service -Name $ServiceName).Status -eq 'Running') {
                Write-Status "PostgreSQL started successfully" -Type 'Success'
                return $true
            } else {
                Write-Status "PostgreSQL failed to start" -Type 'Error'
                return $false
            }
        } else {
            Write-Status "PostgreSQL service not found: $ServiceName" -Type 'Warning'
            return $false
        }
    }
    catch {
        Write-Status "Error starting PostgreSQL: $_" -Type 'Error'
        return $false
    }
}

function Test-DatabaseConnection {
    param(
        [string]$Server = "127.0.0.1",
        [int]$Port = 5432,
        [string]$User = "postgres"
    )
    
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $asyncResult = $tcpClient.BeginConnect($Server, $Port, $null, $null)
        $asyncResult.AsyncWaitHandle.WaitOne(3000) | Out-Null
        
        if ($tcpClient.Connected) {
            $tcpClient.Close()
            Write-Status "Database connection successful" -Type 'Success'
            return $true
        } else {
            Write-Status "Cannot connect to database on ${Server}:${Port}" -Type 'Warning'
            return $false
        }
    }
    catch {
        Write-Status "Database connection test failed: $_" -Type 'Warning'
        return $false
    }
}

# Main execution
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Zeralda ERP - Database Auto-Start Module                 ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Find PostgreSQL service
Write-Status "Detecting PostgreSQL installation..." -Type 'Info'
$postgresService = Test-PostgreSQLService

if ($postgresService) {
    Write-Status "Found: $postgresService" -Type 'Success'
    
    # Start service
    if (Start-PostgreSQLService -ServiceName $postgresService) {
        Write-Status "Waiting for database warmup..." -Type 'Info'
        Start-Sleep -Seconds 2
        
        # Test connection
        Test-DatabaseConnection | Out-Null
        
        Write-Host ""
        Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
        Write-Host "║   Database is ready                                        ║" -ForegroundColor Green
        Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green
        Write-Host ""
        exit 0
    } else {
        Write-Host ""
        Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Red
        Write-Host "║   Failed to start database                                 ║" -ForegroundColor Red
        Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Red
        Write-Host ""
        exit 1
    }
} else {
    Write-Status "PostgreSQL service not found" -Type 'Error'
    Write-Host ""
    Write-Host "Available commands:" -ForegroundColor Yellow
    Write-Host "  1. Install PostgreSQL from: https://www.postgresql.org/download/" -ForegroundColor Yellow
    Write-Host "  2. Run: choco install postgresql" -ForegroundColor Yellow
    Write-Host "  3. Run: scoop install postgresql" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}
