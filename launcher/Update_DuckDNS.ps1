# Update_DuckDNS.ps1 — Updates DuckDNS domain to point to this machine
# Usage: 
#   .\Update_DuckDNS.ps1 -DuckToken "your-token" -DuckDomain "zeralda"
#   Or set them in the .env file

param(
    [string]$DuckToken = "",
    [string]$DuckDomain = ""
)

# Read from .env if not provided
if ($DuckToken -eq "" -or $DuckDomain -eq "") {
    $envFile = Join-Path $PSScriptRoot "..\.env"
    if (Test-Path $envFile) {
        $content = Get-Content $envFile -ErrorAction SilentlyContinue
        foreach ($line in $content) {
            if ($line -match "^DUCKDNS_TOKEN=(.+)$") { $DuckToken = $matches[1].Trim('"').Trim("'") }
            if ($line -match "^DUCKDNS_DOMAIN=(.+)$") { $DuckDomain = $matches[1].Trim('"').Trim("'") }
        }
    }
}

if ($DuckToken -eq "" -or $DuckDomain -eq "") {
    Write-Host "[ERROR] DuckDNS token and domain are required."
    Write-Host "        Set DUCKDNS_TOKEN and DUCKDNS_DOMAIN in .env file"
    Write-Host "        Or pass them as parameters."
    exit 1
}

# Update DuckDNS — point the domain to the current public IP
# DuckDNS automatically detects the public IP
$updateUrl = "https://www.duckdns.org/update?domains=$DuckDomain&token=$DuckToken&ip="

try {
    $response = Invoke-WebRequest -Uri $updateUrl -UseBasicParsing -TimeoutSec 15
    if ($response.Content.Trim() -eq "OK") {
        Write-Host "[OK] DuckDNS updated: $DuckDomain.duckdns.org"
    } else {
        Write-Host "[WARNING] DuckDNS response: $($response.Content)"
    }
} catch {
    Write-Host "[ERROR] Failed to update DuckDNS: $($_.Exception.Message)"
    exit 1
}
