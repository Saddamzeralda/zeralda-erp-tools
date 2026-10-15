$locations = @(
    [Environment]::GetFolderPath('Desktop'),
    [Environment]::GetFolderPath('CommonDesktopDirectory'),
    [Environment]::GetFolderPath('StartMenu'),
    [Environment]::GetFolderPath('CommonStartMenu'),
    [Environment]::GetFolderPath('Startup'),
    [Environment]::GetFolderPath('CommonStartup'),
    'C:\Program Files\Zeralda ERP',
    'C:\Program Files\Zeralda ERP\launcher'
)
$sh = New-Object -ComObject WScript.Shell
foreach ($loc in $locations) {
    if (Test-Path $loc) {
        Get-ChildItem -Path $loc -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                $sc = $sh.CreateShortcut($_.FullName)
                $target = $sc.TargetPath
                $arguments = $sc.Arguments
                if ($target -match 'athletic-concepts' -or $arguments -match 'athletic-concepts' -or $target -match 'trycloudflare' -or $arguments -match 'trycloudflare') {
                    Write-Host "FOUND SHORTCUT: $($_.FullName) -> Target: $target | Args: $arguments"
                }
            } catch {}
        }
    }
}

# Also search all files in C:\Program Files\Zeralda ERP for the athletic-concepts string
Write-Host "`nSearching files in C:\Program Files\Zeralda ERP for athletic-concepts..."
Get-ChildItem -Path 'C:\Program Files\Zeralda ERP' -Recurse -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
    try {
        $match = Select-String -Path $_.FullName -Pattern 'athletic-concepts' -SimpleMatch -ErrorAction SilentlyContinue
        if ($match) {
            Write-Host "FOUND IN FILE: $($_.FullName)"
        }
    } catch {}
}
