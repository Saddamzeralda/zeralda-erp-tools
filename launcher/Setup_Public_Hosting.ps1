# Setup_Public_Hosting.ps1 — إعداد الحاسوب ليكون خادم عام لـ Zeralda ERP
# يطلب صلاحيات Admin تلقائياً
#
# المتطلبات:
#   1. دومين مسجّل (www.zeralda-erp.dz) مُوجّه DNS إلى IP العام
#   2. الراوتر يسمح بـ Port Forwarding للمنفذ 80 و 443
#   3. ISP لا يحجب المنافذ 80/443

param(
    [string]$Domain = "www.zeralda-erp.dz",
    [switch]$NoElevate
)

if (-not $NoElevate) {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host "Requesting admin privileges..." -ForegroundColor Yellow
        Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Domain `"$Domain`" -NoElevate"
        exit
    }
}

$AppDir = "C:\Program Files\Zeralda ERP"
$CaddyDir = Join-Path $AppDir "tools\caddy"

Write-Host ""
Write-Host "=== Zeralda ERP — Public Hosting Setup ===" -ForegroundColor Cyan
Write-Host "  Domain: $Domain" -ForegroundColor White
Write-Host ""

# ── 1) Check prerequisites ──────────────────────────────────────────────────
Write-Host "[1/6] Checking prerequisites..." -ForegroundColor Green

# Check public IP
try {
    $publicIP = (Invoke-WebRequest -Uri "https://api.ipify.org?format=text" -UseBasicParsing -TimeoutSec 10).Content.Trim()
    Write-Host "      Public IP: $publicIP" -ForegroundColor Gray
} catch {
    Write-Host "      [WARN] Could not detect public IP. Check your internet connection." -ForegroundColor Yellow
    $publicIP = "[unknown]"
}

# Check if Caddy exists
if (-not (Test-Path (Join-Path $CaddyDir "caddy.exe"))) {
    Write-Host "      [ERROR] Caddy not found at: $CaddyDir" -ForegroundColor Red
    Write-Host "              Please reinstall with the 'Public hosting' option." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "      Caddy: OK" -ForegroundColor Gray

# ── 2) Update .env ──────────────────────────────────────────────────────────
Write-Host "[2/6] Updating .env..." -ForegroundColor Green
$envPath = Join-Path $AppDir ".env"
if (Test-Path $envPath) {
    $envContent = Get-Content $envPath -Raw
    # Update SERVER_HOST, ALLOW_LAN_ACCESS, CUSTOM_DOMAIN, USE_HTTPS
    $envContent = $envContent -replace 'SERVER_HOST=.*', 'SERVER_HOST=0.0.0.0'
    $envContent = $envContent -replace 'ALLOW_LAN_ACCESS=.*', 'ALLOW_LAN_ACCESS=true'
    if ($envContent -match 'CUSTOM_DOMAIN=.*') {
        $envContent = $envContent -replace 'CUSTOM_DOMAIN=.*', "CUSTOM_DOMAIN=$Domain"
    } else {
        $envContent += "`nCUSTOM_DOMAIN=$Domain`n"
    }
    # Keep USE_HTTPS=false — Caddy handles SSL, not the Python server
    $envContent = $envContent -replace 'USE_HTTPS=.*', 'USE_HTTPS=false'
    Set-Content -Path $envPath -Value $envContent -NoNewline
    Write-Host "      .env updated: SERVER_HOST=0.0.0.0, CUSTOM_DOMAIN=$Domain" -ForegroundColor Gray
}

# ── 3) Update Caddyfile with the domain ─────────────────────────────────────
Write-Host "[3/6] Configuring Caddy..." -ForegroundColor Green
$caddyfilePath = Join-Path $CaddyDir "Caddyfile"
if (Test-Path $caddyfilePath) {
    $caddyContent = Get-Content $caddyfilePath -Raw
    $caddyContent = $caddyContent -replace '\{\$DOMAIN\}', $Domain
    Set-Content -Path $caddyfilePath -Value $caddyContent -NoNewline
    Write-Host "      Caddyfile configured for: $Domain" -ForegroundColor Gray
}

# ── 4) Open Windows Firewall for ports 80 and 443 ───────────────────────────
Write-Host "[4/6] Configuring Windows Firewall..." -ForegroundColor Green

# Port 80 (HTTP — needed for Let's Encrypt HTTP-01 challenge)
$rule80 = "Zeralda ERP Caddy (HTTP 80)"
netsh advfirewall firewall delete rule name="$rule80" 2>$null | Out-Null
netsh advfirewall firewall add rule name="$rule80" dir=in action=allow protocol=TCP localport=80 profile=any 2>&1 | Out-Null
Write-Host "      Port 80 (HTTP): Opened" -ForegroundColor Gray

# Port 443 (HTTPS)
$rule443 = "Zeralda ERP Caddy (HTTPS 443)"
netsh advfirewall firewall delete rule name="$rule443" 2>$null | Out-Null
netsh advfirewall firewall add rule name="$rule443" dir=in action=allow protocol=TCP localport=443 profile=any 2>&1 | Out-Null
Write-Host "      Port 443 (HTTPS): Opened" -ForegroundColor Gray

# ── 5) Restart ERP server ───────────────────────────────────────────────────
Write-Host "[5/6] Restarting ERP server..." -ForegroundColor Green
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

# ── 6) Start Caddy ──────────────────────────────────────────────────────────
Write-Host "[6/6] Starting Caddy reverse proxy..." -ForegroundColor Green

# Stop any existing Caddy
Get-Process -Name "caddy" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# Start Caddy in background
$caddyExe = Join-Path $CaddyDir "caddy.exe"
$env:DOMAIN = $Domain
Start-Process -FilePath $caddyExe -ArgumentList "start", "--config", $caddyfilePath -WorkingDirectory $CaddyDir
Write-Host "      Caddy started (background)" -ForegroundColor Gray

Start-Sleep -Seconds 5

# ── Summary ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "  Public Hosting Setup Complete!" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "  Your ERP is now accessible at:" -ForegroundColor White
Write-Host "    https://$Domain" -ForegroundColor Green
Write-Host ""
Write-Host "  Prerequisites to verify:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. DNS: Make sure $Domain" -ForegroundColor White
Write-Host "     points to your public IP: $publicIP" -ForegroundColor White
Write-Host "     (Configure this at your domain registrar's DNS panel)" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Router: Enable Port Forwarding for:" -ForegroundColor White
Write-Host "     Port 80  (TCP) -> this computer's local IP" -ForegroundColor Gray
Write-Host "     Port 443 (TCP) -> this computer's local IP" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. ISP: Make sure your ISP doesn't block ports 80/443" -ForegroundColor White
Write-Host "     (Some ISPs block inbound ports — contact them if needed)" -ForegroundColor Gray
Write-Host ""
Write-Host "  SSL: Caddy will automatically obtain a free certificate" -ForegroundColor Green
Write-Host "       from Let's Encrypt on first access to https://$Domain" -ForegroundColor Green
Write-Host ""
Write-Host "  To stop Caddy:  caddy stop  (or close the Caddy process)" -ForegroundColor Gray
Write-Host "  To view logs:   Check caddy-access.log in the Caddy folder" -ForegroundColor Gray
Write-Host "=" * 60 -ForegroundColor Cyan

Write-Host ""
Read-Host "Press Enter to close"
