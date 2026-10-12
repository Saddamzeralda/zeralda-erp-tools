# Setup_Cloudflare_Tunnel.ps1 — إعداد Cloudflare Tunnel لـ Zeralda ERP
# لا يتطلب Port Forwarding ولا فتح منافذ في الجدار
#
# المتطلبات:
#   1. حساب Cloudflare مجاني (https://dash.cloudflare.com)
#   2. دومين مُضاف إلى Cloudflare (nameservers = Cloudflare)
#   3. Token من Cloudflare Tunnel dashboard
#
# يطلب صلاحيات Admin تلقائياً

param(
    [string]$Domain = "www.zeralda-erp.dz",
    [string]$TunnelToken = "",
    [switch]$NoElevate
)

if (-not $NoElevate) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host "Requesting admin privileges..." -ForegroundColor Yellow
        Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Domain `"$Domain`" -TunnelToken `"$TunnelToken`" -NoElevate"
        exit
    }
}

$AppDir = "C:\Program Files\Zeralda ERP"
$CloudflaredDir = Join-Path $AppDir "tools\cloudflared"
$CloudflaredExe = Join-Path $CloudflaredDir "cloudflared.exe"

Write-Host ""
Write-Host "=== Zeralda ERP — Cloudflare Tunnel Setup ===" -ForegroundColor Cyan
Write-Host "  Domain: $Domain" -ForegroundColor White
Write-Host ""

# ── 1) Check cloudflared ────────────────────────────────────────────────────
Write-Host "[1/5] Checking cloudflared..." -ForegroundColor Green
if (-not (Test-Path $CloudflaredExe)) {
    Write-Host "      [ERROR] cloudflared.exe not found at: $CloudflaredExe" -ForegroundColor Red
    Write-Host "              Please reinstall with the 'Cloudflare Tunnel' option." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "      cloudflared: OK" -ForegroundColor Gray

# ── 2) Get tunnel token ─────────────────────────────────────────────────────
Write-Host "[2/5] Cloudflare Tunnel Token..." -ForegroundColor Green

if ($TunnelToken -eq "") {
    Write-Host ""
    Write-Host "  A Cloudflare Tunnel token connects this computer to your domain" -ForegroundColor White
    Write-Host "  without opening any ports or configuring port forwarding." -ForegroundColor White
    Write-Host ""
    Write-Host "  To get your token:" -ForegroundColor Yellow
    Write-Host "    1. Go to: https://one.dash.cloudflare.com" -ForegroundColor Gray
    Write-Host "    2. Networks > Tunnels > Create a tunnel" -ForegroundColor Gray
    Write-Host "    3. Choose 'Cloudflared' as connector" -ForegroundColor Gray
    Write-Host "    4. Copy the token (starts with 'eyJ...')" -ForegroundColor Gray
    Write-Host "    5. In the tunnel's Public Hostname tab:" -ForegroundColor Gray
    Write-Host "       - Subdomain: www" -ForegroundColor Gray
    Write-Host "       - Domain: zeralda-erp.dz" -ForegroundColor Gray
    Write-Host "       - Service: HTTP://localhost:8080" -ForegroundColor Gray
    Write-Host ""
    $TunnelToken = Read-Host "  Paste your tunnel token here"
}

if ($TunnelToken -eq "" -or $TunnelToken.Length -lt 20) {
    Write-Host "      [ERROR] Invalid token. Cannot continue without a token." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "      Token received (length: $($TunnelToken.Length) chars)" -ForegroundColor Gray

# ── 3) Update .env ──────────────────────────────────────────────────────────
Write-Host "[3/5] Updating .env..." -ForegroundColor Green
$envPath = Join-Path $AppDir ".env"
if (Test-Path $envPath) {
    $envContent = Get-Content $envPath -Raw
    $envContent = $envContent -replace 'SERVER_HOST=.*', 'SERVER_HOST=127.0.0.1'
    $envContent = $envContent -replace 'ALLOW_LAN_ACCESS=.*', 'ALLOW_LAN_ACCESS=false'
    if ($envContent -match 'CUSTOM_DOMAIN=.*') {
        $envContent = $envContent -replace 'CUSTOM_DOMAIN=.*', "CUSTOM_DOMAIN=$Domain"
    } else {
        $envContent += "`nCUSTOM_DOMAIN=$Domain`n"
    }
    # Cloudflare handles SSL, so the Python server stays on HTTP
    $envContent = $envContent -replace 'USE_HTTPS=.*', 'USE_HTTPS=false'
    Set-Content -Path $envPath -Value $envContent -NoNewline
    Write-Host "      .env updated: CUSTOM_DOMAIN=$Domain, SERVER_HOST=127.0.0.1" -ForegroundColor Gray
}

# ── 4) Save token + restart ERP server ──────────────────────────────────────
Write-Host "[4/5] Saving token + restarting ERP server..." -ForegroundColor Green

# Save token to a file for the launcher to use
$tokenPath = Join-Path $CloudflaredDir "tunnel_token.txt"
Set-Content -Path $tokenPath -Value $TunnelToken -NoNewline -Encoding UTF8
Write-Host "      Token saved to: $tokenPath" -ForegroundColor Gray

# Restart ERP server
$serverProcs = Get-Process -Name "python" -ErrorAction SilentlyContinue | Where-Object {
    (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)" -ErrorAction SilentlyContinue).CommandLine -like "*app.main*"
}
if ($serverProcs) {
    $serverProcs | ForEach-Object { Stop-Process -Id $_.Id -Force }
    Start-Sleep -Seconds 2
}
$launcher = Join-Path $AppDir "launcher\Start_Server_Silent.vbs"
if (Test-Path $launcher) {
    Start-Process -FilePath "wscript.exe" -ArgumentList "`"$launcher`""
    Write-Host "      ERP server restarting..." -ForegroundColor Gray
}
Start-Sleep -Seconds 3

# ── 5) Install + start cloudflared as a Windows service ─────────────────────
Write-Host "[5/5] Installing Cloudflare Tunnel as Windows service..." -ForegroundColor Green

# Stop any existing cloudflared
Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Try to install as a service (requires admin — already elevated)
try {
    # Remove old service if exists
    sc.exe query ZeraldaCloudflared 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        sc.exe stop ZeraldaCloudflared 2>$null | Out-Null
        Start-Sleep -Seconds 2
        sc.exe delete ZeraldaCloudflared 2>$null | Out-Null
        Start-Sleep -Seconds 1
    }

    # Install as service
    & $CloudflaredExe service install $TunnelToken 2>&1 | ForEach-Object {
        Write-Host "      $_" -ForegroundColor Gray
    }

    Start-Sleep -Seconds 3

    # Check if service is running
    $service = Get-Service -Name "Cloudflared" -ErrorAction SilentlyContinue
    if ($service -and $service.Status -eq "Running") {
        Write-Host "      Cloudflared service: Running" -ForegroundColor Green
    } else {
        # Fallback: run in background as a process
        Write-Host "      [WARN] Service install failed, starting as background process..." -ForegroundColor Yellow
        Start-Process -FilePath $CloudflaredExe -ArgumentList "tunnel", "run", $TunnelToken -WorkingDirectory $CloudflaredDir -WindowStyle Hidden
        Start-Sleep -Seconds 3
        Write-Host "      Cloudflared process started" -ForegroundColor Gray
    }
} catch {
    Write-Host "      [WARN] Service install error: $_" -ForegroundColor Yellow
    Write-Host "      Starting as background process instead..." -ForegroundColor Yellow
    Start-Process -FilePath $CloudflaredExe -ArgumentList "tunnel", "run", $TunnelToken -WorkingDirectory $CloudflaredDir -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

# ── Summary ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "  Cloudflare Tunnel Setup Complete!" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "  Your ERP is now accessible at:" -ForegroundColor White
Write-Host "    https://$Domain" -ForegroundColor Green
Write-Host ""
Write-Host "  How it works:" -ForegroundColor Yellow
Write-Host "    - cloudflared creates an OUTBOUND tunnel to Cloudflare" -ForegroundColor White
Write-Host "    - No ports need to be opened on your router" -ForegroundColor White
Write-Host "    - No firewall changes needed" -ForegroundColor White
Write-Host "    - Cloudflare provides SSL automatically" -ForegroundColor White
Write-Host "    - Works even if your ISP blocks inbound ports" -ForegroundColor White
Write-Host ""
Write-Host "  Prerequisites to verify:" -ForegroundColor Yellow
Write-Host "    1. Domain is added to Cloudflare (nameservers = Cloudflare)" -ForegroundColor White
Write-Host "    2. Tunnel's Public Hostname is configured:" -ForegroundColor White
Write-Host "       - Subdomain: www" -ForegroundColor Gray
Write-Host "       - Domain: zeralda-erp.dz" -ForegroundColor Gray
Write-Host "       - Service: HTTP://localhost:8080" -ForegroundColor Gray
Write-Host ""
Write-Host "  To manage the tunnel:" -ForegroundColor Yellow
Write-Host "    - Dashboard: https://one.dash.cloudflare.com" -ForegroundColor White
Write-Host "    - Stop service:  sc stop Cloudflared" -ForegroundColor Gray
Write-Host "    - Start service: sc start Cloudflared" -ForegroundColor Gray
Write-Host "    - Remove service: sc delete Cloudflared" -ForegroundColor Gray
Write-Host "=" * 60 -ForegroundColor Cyan

Write-Host ""
Read-Host "Press Enter to close"
