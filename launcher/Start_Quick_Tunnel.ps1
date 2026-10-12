# Start_Cloudflare_QuickTunnel.ps1 — يبدأ Quick Tunnel ويحفظ الرابط
# يعمل في الخلفية، يلتقط رابط trycloudflare.com ويحفظه في ملف

param(
    [string]$Port = "8080",
    [string]$AppDir = "C:\Program Files\Zeralda ERP"
)

$CloudflaredExe = Join-Path $AppDir "tools\cloudflared\cloudflared.exe"
if (-not (Test-Path $CloudflaredExe)) {
    # Fallback: development path
    $CloudflaredExe = "C:\Users\User\Desktop\zeralda-erp-employees-main\zeralda-erp-employees-main\tools\cloudflared\cloudflared.exe"
}

if (-not (Test-Path $CloudflaredExe)) {
    Write-Host "[ERROR] cloudflared.exe not found"
    exit 1
}

$UrlFile = Join-Path $AppDir "tools\cloudflared\quick_tunnel_url.txt"
$LogFile = Join-Path $AppDir "logs\cloudflared.log"

# Stop any existing cloudflared (Quick Tunnel only — don't kill the service)
Get-Process cloudflared -ErrorAction SilentlyContinue | Where-Object { $_.Path -ne $CloudflaredExe } | Stop-Process -Force -ErrorAction SilentlyContinue

# Start cloudflared Quick Tunnel in background
$logDir = Split-Path $LogFile -Parent
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force $logDir | Out-Null }

# Start the process with output redirected
$p = Start-Process -FilePath $CloudflaredExe -ArgumentList @('tunnel','--url',"http://localhost:$Port") -RedirectStandardError $LogFile -RedirectStandardOutput "$LogFile.out" -WindowStyle Hidden -PassThru

# Wait for the URL to appear in the log (max 30 seconds)
$url = ""
$waited = 0
while ($waited -lt 40 -and $url -eq "") {
    Start-Sleep 2
    $waited += 2
    if (Test-Path $LogFile) {
        $content = Get-Content $LogFile -ErrorAction SilentlyContinue
        # Look for the quick tunnel URL — it has a longer subdomain (words separated by hyphens)
        # e.g. https://glenn-usr-interface-completion.trycloudflare.com
        # Exclude "api.trycloudflare.com" which appears in API URLs
        $match = $content | Select-String -Pattern 'https://[a-z0-9]+-[a-z0-9-]+\.trycloudflare\.com' -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($match) {
            $url = $match.Matches[0].Value
        }
    }
}

if ($url -ne "") {
    # Save the URL to a file
    Set-Content -Path $UrlFile -Value $url -NoNewline -Encoding UTF8
    Write-Host $url
} else {
    Write-Host "TIMEOUT"
}
