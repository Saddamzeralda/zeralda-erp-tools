# Zeralda ERP — Professional Installer

This folder contains the source for the **native Windows installer** that
produces a single, signed-ready `Zeralda_ERP_Setup_v<version>.exe` with a modern
multi-language wizard.

> The previous `cmd` / `PowerShell` installation scripts have been removed.
> This installer is an actual compiled Windows program (Inno Setup output),
> not a console script.

## Features

| Capability | Detail |
|---|---|
| Wizard style | Modern (large image, alpha-blended, 120% size) |
| Languages | English, Français, العربية (custom message overlay) |
| Pre-flight checks | RAM ≥ 2 GB, free disk ≥ 1.5 GB, TCP port 8080 (Python 3.11 bundled) |
| Components | Core (required) · Tools · Demo data |
| Optional tasks | Desktop shortcut · Start-menu · Auto-start at logon · Firewall rule |
| Post-install | Installs `requirements.txt` into bundled Python, creates silent VBS launcher + diagnostic CMD, opens firewall port |
| Server | Uses FastAPI `app.main` (preferred) with license system, falls back to legacy `server.py` |
| Uninstall | Stops running ERP processes, removes firewall rule, asks whether to keep user data (`data/`, `database/`) |
| Logging | Every install stage is appended to `<AppDir>\logs\install.log` |
| Privileges | Admin (per-machine), with `dialog` override allowed |
| Architecture | x64 (and ARM64 emulation via `x64compatible`) |
| OS minimum | Windows 10 (build 10.0+) |

## Prerequisites for building

1. Install **Inno Setup 6.2 or newer**: <https://jrsoftware.org/isdl.php>
2. Make sure `iscc.exe` is on the PATH (default: `C:\Program Files (x86)\Inno Setup 6\`).

## Building the installer

From a normal terminal (no admin needed):

```pwsh
iscc.exe installer\Zeralda_ERP_Setup.iss
```

The compiled installer will be written to:

```
installer\dist\Zeralda_ERP_Setup_v1.0.0.exe
```

## Code-signing (recommended for production)

After building, sign the installer with your certificate:

```pwsh
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 `
              /f mycert.pfx /p <password> `
              installer\dist\Zeralda_ERP_Setup_v1.0.0.exe
```

## Silent installation (for IT deployment)

```pwsh
Zeralda_ERP_Setup_v1.0.0.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART `
    /COMPONENTS="core,tools" /TASKS="desktopicon,firewall" `
    /DIR="C:\Program Files\Zeralda ERP" /LOG="install.log"
```

## Silent uninstall

```pwsh
"C:\Program Files\Zeralda ERP\unins000.exe" /VERYSILENT /SUPPRESSMSGBOXES
```

## Updating the version

Edit the `#define AppVersion` line at the top of
`Zeralda_ERP_Setup.iss` and rebuild.
