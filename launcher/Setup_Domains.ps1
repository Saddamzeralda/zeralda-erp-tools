# Setup_Domains.ps1 — Complete domain setup for Zeralda ERP
# 1. Sets up local domain (zeralda.local) via hosts file
# 2. Sets up DuckDNS for internet access (zeralda.duckdns.org)
# 3. Configures Cloudflare Tunnel to use the DuckDNS domain
# 4. Sets up automatic DuckDNS IP updates

param(
    [string]$DuckToken = "",
    [string]$DuckDomain = "zeralda"
)

$AppDir = Split-Path $PSScriptRoot -Parent
$Domain = "$DuckDomain.duckdns.org"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Zeralda ERP - Domain Setup" -ForegroundColor Cyan  
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── 1) Local Domain (zeralda.local) ────────────────────────────────────────
Write-Host "[1/4] Setting up local domain: zeralda.local" -ForegroundColor Yellow
$hostsFile = "$env:SystemRoot\System32\drivers\etc\hosts"
$localDomain = "zeralda.local"

$existing = Get-Content $hostsFile -ErrorAction SilentlyContinue | Where-Object { $_ -match $localDomain }
if ($existing) {
    Write-Host "  [OK] zeralda.local already in hosts file"
} else {
    Add-Content -Path $hostsFile -Value "`n# Zeralda ERP local domain`n127.0.0.1 $localDomain"
    Write-Host "  [OK] Added zeralda.local to hosts file"
}
ipconfig /flushdns | Out-Null
Write-Host "  -> Local access: http://zeralda.local:8080/" -ForegroundColor Green
Write-Host ""

# ── 2) DuckDNS Setup ───────────────────────────────────────────────────────
Write-Host "[2/4] Setting up DuckDNS: $Domain" -ForegroundColor Yellow

if ($DuckToken -eq "") {
    Write-Host "  [SKIP] No DuckDNS token provided." -ForegroundColor DarkYellow
    Write-Host "         To enable internet access:" -ForegroundColor DarkYellow
    Write-Host "         1. Go to https://www.duckdns.org" -ForegroundColor DarkYellow
    Write-Host "         2. Sign in with Google/GitHub/Reddit" -ForegroundColor DarkYellow
    Write-Host "         3. Add domain: $DuckDomain" -ForegroundColor DarkYellow
    Write-Host "         4. Copy your token" -ForegroundColor DarkYellow
    Write-Host "         5. Run this script again with -DuckToken 'your-token'" -ForegroundColor DarkYellow
    Write-Host ""
} else {
    # Update DuckDNS to point to current public IP
    $updateUrl = "https://www.duckdns.org/update?domains=$DuckDomain&token=$DuckToken&ip="
    try {
        $response = Invoke-WebRequest -Uri $updateUrl -UseBasicParsing -TimeoutSec 15
        if ($response.Content.Trim() -eq "OK") {
            Write-Host "  [OK] DuckDNS updated: $Domain"
        } else {
            Write-Host "  [WARNING] DuckDNS response: $($response.Content)"
        }
    } catch {
        Write-Host "  [ERROR] Failed to update DuckDNS: $($_.Exception.Message)"
    }

    # Save to .env file
    $envFile = Join-Path $AppDir ".env"
    if (Test-Path $envFile) {
        $envContent = Get-Content $envFile
        $updated = $false
        $newContent = @()
        foreach ($line in $envContent) {
            if ($line -match "^DUCKDNS_TOKEN=") { $newContent += "DUCKDNS_TOKEN=$DuckToken"; $updated = $true }
            elseif ($line -match "^DUCKDNS_DOMAIN=") { $newContent += "DUCKDNS_DOMAIN=$DuckDomain"; $updated = $true }
            else { $newContent += $line }
        }
        if (-not $updated) {
            $newContent += ""
            $newContent += "# DuckDNS — free dynamic DNS"
            $newContent += "DUCKDNS_TOKEN=$DuckToken"
            $newContent += "DUCKDNS_DOMAIN=$DuckDomain"
        }
        Set-Content -Path $envFile -Value $newContent -Encoding UTF8
        Write-Host "  [OK] Saved DuckDNS settings to .env"
    }
    Write-Host ""
}

# ── 3) Cloudflare Tunnel with DuckDNS ──────────────────────────────────────
Write-Host "[3/4] Cloudflare Tunnel configuration" -ForegroundColor Yellow

$cfExe = Join-Path $AppDir "tools\cloudflared\cloudflared.exe"
$tokenFile = Join-Path $AppDir "tools\cloudflared\tunnel_token.txt"

if (Test-Path $tokenFile) {
    Write-Host "  [OK] Cloudflare Tunnel token found"
    Write-Host "  [INFO] To route $Domain through the tunnel:"
    Write-Host "         1. Go to https://one.dash.cloudflare.com" -ForegroundColor DarkYellow
    Write-Host "         2. Networks > Tunnels > your tunnel" -ForegroundColor DarkYellow
    Write-Host "         3. Public Hostname > Add:" -ForegroundColor DarkYellow
    Write-Host "            - Subdomain: (leave empty)" -ForegroundColor DarkYellow
    Write-Host "            - Domain: $Domain" -ForegroundColor DarkYellow
    Write-Host "            - Service: HTTP://localhost:8080" -ForegroundColor DarkYellow
    Write-Host "         Note: You need to add $Domain to your Cloudflare DNS" -ForegroundColor DarkYellow
    Write-Host "         as a CNAME to <tunnel-id>.cfargotunnel.com" -ForegroundColor DarkYellow
} else {
    Write-Host "  [INFO] No Cloudflare Tunnel token found"
    Write-Host "  [INFO] Using Quick Tunnel (random URL, changes on restart)"
}
Write-Host ""

# ── 4) Scheduled Task for DuckDNS updates ──────────────────────────────────
if ($DuckToken -ne "") {
    Write-Host "[4/4] Setting up automatic DuckDNS updates" -ForegroundColor Yellow
    
    $updateScript = Join-Path $PSScriptRoot "Update_DuckDNS.ps1"
    $taskName = "ZeraldaERP_DuckDNS_Update"
    
    # Create a scheduled task that runs every 5 minutes
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$updateScript`""
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
    
    try {
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Update DuckDNS IP for Zeralda ERP" -Force
        Write-Host "  [OK] Scheduled task created: updates every 5 minutes"
    } catch {
        Write-Host "  [ERROR] Failed to create scheduled task: $($_.Exception.Message)"
    }
} else {
    Write-Host "[4/4] Skipped (no DuckDNS token)" -ForegroundColor DarkYellow
}
Write-Host ""

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Local access:  http://zeralda.local:8080/" -ForegroundColor Green
if ($DuckToken -ne "") {
    Write-Host "Internet access (via Cloudflare Tunnel):" -ForegroundColor Green
    Write-Host "  https://$Domain/" -ForegroundColor Green
    Write-Host ""
    Write-Host "To access from your phone:" -ForegroundColor Yellow
    Write-Host "  1. Open the browser on your phone" -ForegroundColor White
    Write-Host "  2. Go to https://$Domain/" -ForegroundColor White
    Write-Host "  3. That's it! The ERP will load" -ForegroundColor White
} else {
    Write-Host "Internet access: Run with -DuckToken to enable" -ForegroundColor DarkYellow
}
Write-Host ""
