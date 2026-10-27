; ============================================================================

;  Zeralda ERP — Professional Installer (Inno Setup 6.2+)

; ----------------------------------------------------------------------------

;  Version: 1.0.0  |  © 2024-2026 Zeralda Industries

; ----------------------------------------------------------------------------

;  Features:

;    • Modern multi-language wizard (English / Arabic / French)

;    • Hardware & runtime pre-flight checks (OS, RAM, disk, port)

;    • Component selection (Core / Tools / Demo data)

;    • Optional desktop / Start-menu / auto-start integration

;    • Windows Defender Firewall rule for the embedded HTTP server

;    • Bundled Python 3.11 embedded (no system Python required)

;    • Clean pre-install cleanup (removes old venv, python, __pycache__)

;    • Clean uninstaller that asks whether to keep user data

;    • Post-install pip bootstrap + requirements install

;    • Silent tray launcher (VBS) + diagnostic mode (CMD)

;    • Auto-start on Windows boot + desktop shortcut opens URL directly

; ----------------------------------------------------------------------------

;  Build:  iscc.exe Zeralda_ERP_Setup.iss

; ============================================================================

#define AppId          "{B4F2C1A0-7E3D-4B5A-9F8C-2D6E1A3B7C90}"

#define AppName        "Zeralda ERP"

#define AppNameAr      "زرالدة لإدارة موارد المؤسسات"

#define AppNameFr      "Zeralda ERP"

#define AppVersion     "3.0.0"

#define AppPublisher   "Zeralda Industries"

#define AppURL         "https://zeralda-erp-employees-main-production.up.railway.app/zeralda_erp_dashboard.html"

#define AppCopyright   "© 2024-2026 Zeralda Industries"

#define AppExe         "launcher\Zeralda_ERP_Launcher_core.exe"

#define SourceDir      ".."

#define DefaultPort    "8080"

#define MinRamMB       2048

#define MinDiskMB      1500

[Setup]

AppId={{#AppId}

AppName={#AppName}

AppVersion={#AppVersion}

AppVerName={#AppName} {#AppVersion}

AppPublisher={#AppPublisher}

AppPublisherURL={#AppURL}

AppSupportURL={#AppURL}

AppUpdatesURL={#AppURL}

AppCopyright={#AppCopyright}

VersionInfoVersion={#AppVersion}

VersionInfoCompany={#AppPublisher}

VersionInfoDescription={#AppName} Setup

VersionInfoProductName={#AppName}

DefaultDirName={autopf}\Zeralda ERP

DefaultGroupName={#AppName}

DisableProgramGroupPage=auto

DisableReadyPage=no

DisableWelcomePage=no

DisableDirPage=no

AllowNoIcons=yes

LicenseFile={#SourceDir}\LICENSE.txt

InfoBeforeFile=

InfoAfterFile=

OutputDir={#SourceDir}\installer\dist

OutputBaseFilename=Zeralda_ERP_Setup_v{#AppVersion}

SetupIconFile={#SourceDir}\launcher\app.ico

UninstallDisplayIcon={app}\launcher\app.ico

UninstallDisplayName={#AppName} {#AppVersion}

Compression=lzma2/ultra64

SolidCompression=yes

LZMAUseSeparateProcess=yes

LZMANumBlockThreads=4

WizardStyle=modern

WizardSizePercent=120,110

WizardImageAlphaFormat=defined

WizardImageFile=assets\wizard_image.bmp

WizardSmallImageFile=assets\wizard_small.bmp

PrivilegesRequired=admin

UsePreviousAppDir=no

ArchitecturesInstallIn64BitMode=x64compatible

ArchitecturesAllowed=x64compatible

MinVersion=10.0

CloseApplications=force

RestartApplications=no

ChangesEnvironment=no

ChangesAssociations=no

ShowLanguageDialog=yes

UsePreviousLanguage=yes

; ============================================================================

[Languages]

; ============================================================================

Name: "english"; MessagesFile: "compiler:Default.isl"

Name: "french";  MessagesFile: "compiler:Languages\French.isl"

Name: "arabic";  MessagesFile: "compiler:Default.isl"

; ============================================================================

[CustomMessages]

; ============================================================================

english.AppFullName=Zeralda Enterprise Resource Planning System

english.WelcomeTitle=Welcome to the Zeralda ERP Setup

english.WelcomeBody=This wizard will guide you through the installation of Zeralda ERP %1 on your computer.%n%nIt is recommended to close all other applications before continuing.%n%nClick Next to continue, or Cancel to exit.

english.PreflightCaption=System Compatibility Check

english.PreflightDescription=Please wait while Setup verifies your system meets the minimum requirements.

english.PreflightOK=All checks passed. Your system is ready for installation.

english.PreflightLowDisk=At least %1 MB of free disk space is required on the target drive.

english.PreflightLowRam=At least %1 MB of RAM is recommended for smooth operation.

english.PreflightPortBusy=TCP port %1 is currently in use. The ERP server will fail to start until it is freed.

english.ComponentCore=Core ERP application (required)

english.ComponentDemo=Demonstration data set

english.TaskDesktopIcon=Create a &Desktop shortcut

english.TaskStartMenu=Create a &Start Menu shortcut

english.TaskAutoStart=Launch ERP automatically on Windows startup

english.TaskFirewall=Add Windows Firewall rule for port %1

english.StatusPip=Installing Python dependencies (this may take several minutes)…

english.StatusFirewall=Configuring Windows Firewall rule…

english.StatusFinalize=Finalizing installation…

english.StatusCleanup=Cleaning up previous installation…

english.UninstallKeepData=Keep user data (database, logs, uploads)?%n%nChoose Yes to preserve your data for future re-installation, or No to remove everything.

english.TaskLocalDomain=Use local domain &www.zeralda-erp.dz (opens ERP via a friendly URL instead of 127.0.0.1)

english.LocalDomainEnabled=Local domain configured!%n%nThe ERP will open at:%n%n  http://www.zeralda-erp.dz/%n%nThis works on this computer only (no internet required).

french.AppFullName=Système de planification des ressources Zeralda

french.WelcomeTitle=Bienvenue dans l'assistant d'installation de Zeralda ERP

french.WelcomeBody=Cet assistant vous guidera tout au long de l'installation de Zeralda ERP %1 sur votre ordinateur.%n%nIl est recommandé de fermer toutes les autres applications avant de continuer.%n%nCliquez sur Suivant pour continuer, ou sur Annuler pour quitter.

french.PreflightCaption=Vérification de la compatibilité système

french.PreflightDescription=Veuillez patienter pendant que le programme d'installation vérifie la compatibilité de votre système.

french.PreflightOK=Toutes les vérifications ont réussi. Votre système est prêt pour l'installation.

french.PreflightLowDisk=Au moins %1 Mo d'espace disque libre est requis sur le lecteur cible.

french.PreflightLowRam=Au moins %1 Mo de RAM est recommandé pour un fonctionnement fluide.

french.PreflightPortBusy=Le port TCP %1 est actuellement utilisé. Le serveur ERP ne pourra pas démarrer tant qu'il ne sera pas libéré.

french.ComponentCore=Application principale ERP (requise)

french.ComponentDemo=Jeu de données de démonstration

french.TaskDesktopIcon=Créer un raccourci sur le &Bureau

french.TaskStartMenu=Créer un raccourci dans le menu &Démarrer

french.TaskAutoStart=Démarrer ERP automatiquement au démarrage de Windows

french.TaskFirewall=Ajouter une règle de pare-feu Windows pour le port %1

french.StatusPip=Installation des dépendances Python (cela peut prendre quelques minutes)…

french.StatusFirewall=Configuration de la règle de pare-feu Windows…

french.StatusFinalize=Finalisation de l'installation…

french.StatusCleanup=Nettoyage de l'installation précédente…

french.UninstallKeepData=Conserver les données utilisateur (base de données, journaux, fichiers chargés) ?%n%nChoisissez Oui pour préserver vos données ou Non pour tout supprimer.

french.TaskLocalDomain=Utiliser le domaine local &www.zeralda-erp.dz (ouvre l'ERP via une URL conviviale au lieu de 127.0.0.1)

french.LocalDomainEnabled=Domaine local configuré !%n%nL'ERP s'ouvrira à :%n%n  http://www.zeralda-erp.dz/%n%nFonctionne sur cet ordinateur uniquement (aucune connexion Internet requise).

arabic.AppFullName=نظام زرالدة لإدارة موارد المؤسسات

arabic.WelcomeTitle=مرحباً بك في معالج تثبيت Zeralda ERP

arabic.WelcomeBody=سيرشدك هذا المعالج خلال عملية تثبيت Zeralda ERP الإصدار %1 على جهازك.%n%nيُنصح بإغلاق جميع التطبيقات الأخرى قبل المتابعة.%n%nانقر التالي للمتابعة أو إلغاء للخروج.

arabic.PreflightCaption=فحص توافق النظام

arabic.PreflightDescription=يُرجى الانتظار بينما يتحقق المعالج من استيفاء جهازك للمتطلبات الدنيا.

arabic.PreflightOK=اكتملت جميع الفحوصات بنجاح. النظام جاهز للتثبيت.

arabic.PreflightLowDisk=يُشترط توفر %1 ميجابايت على الأقل من المساحة الحرة على القرص الهدف.

arabic.PreflightLowRam=يوصى بتوفر %1 ميجابايت على الأقل من ذاكرة الوصول العشوائي للأداء السلس.

arabic.PreflightPortBusy=المنفذ TCP رقم %1 مستخدم حالياً. لن يتمكن خادم ERP من العمل حتى يتم تحريره.

arabic.ComponentCore=التطبيق الأساسي لـ ERP (مطلوب)

arabic.ComponentDemo=بيانات تجريبية للعرض

arabic.TaskDesktopIcon=إنشاء اختصار على &سطح المكتب

arabic.TaskStartMenu=إنشاء اختصار في قائمة &ابدأ

arabic.TaskAutoStart=تشغيل ERP تلقائياً عند بدء تشغيل Windows

arabic.TaskFirewall=إضافة قاعدة جدار حماية Windows للمنفذ %1

arabic.StatusPip=جارٍ تثبيت اعتماديات Python (قد يستغرق ذلك عدة دقائق)…

arabic.StatusFirewall=جارٍ تكوين قاعدة جدار حماية Windows…

arabic.StatusFinalize=جارٍ إنهاء التثبيت…

arabic.StatusCleanup=جارٍ تنظيف التثبيت السابق…

arabic.UninstallKeepData=هل تريد الإبقاء على بيانات المستخدم (قاعدة البيانات، السجلات، الملفات المرفوعة)؟%n%nاختر نعم للاحتفاظ بالبيانات أو لا لحذف كل شيء.

arabic.TaskLocalDomain=استخدام الدومين المحلي &www.zeralda-erp.dz (يفتح النظام برابط واضح بدلاً من 127.0.0.1)

arabic.LocalDomainEnabled=تم إعداد الدومين المحلي!%n%nسيفتح النظام على:%n%n  http://www.zeralda-erp.dz/%n%nيعمل على هذا الجهاز فقط (بدون إنترنت).

; ============================================================================

[Types]

; ============================================================================

Name: "full";    Description: "Full installation"

Name: "compact"; Description: "Compact installation"

Name: "custom";  Description: "Custom installation"; Flags: iscustom

[Components]

; ============================================================================

Name: "core";  Description: "{cm:ComponentCore}";  Types: full compact custom; Flags: fixed

Name: "demo";  Description: "{cm:ComponentDemo}";  Types: full

; ============================================================================

[Tasks]

; ============================================================================

Name: "desktopicon"; Description: "{cm:TaskDesktopIcon}";          GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

Name: "startmenu";   Description: "{cm:TaskStartMenu}";            GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

Name: "autostart";   Description: "{cm:TaskAutoStart}";            GroupDescription: "{cm:AdditionalIcons}"; Flags: checkedonce

Name: "firewall";    Description: "{cm:TaskFirewall,{#DefaultPort}}"; GroupDescription: "Network configuration:"

Name: "localdomain"; Description: "{cm:TaskLocalDomain}";          GroupDescription: "Network configuration:"

; ============================================================================

[InstallDelete]

; ============================================================================

; Clean up old installation artifacts BEFORE installing new files.

; This prevents stale venv/python/__pycache__ from conflicting with the new

; bundled Python. User data (data/, logs/) is preserved.

Type: filesandordirs; Name: "{app}\.venv"

Type: filesandordirs; Name: "{app}\python"

Type: filesandordirs; Name: "{app}\__pycache__"

Type: filesandordirs; Name: "{app}\app\__pycache__"

Type: filesandordirs; Name: "{app}\app\handlers\__pycache__"

Type: filesandordirs; Name: "{app}\app\services\__pycache__"

Type: filesandordirs; Name: "{app}\backend\__pycache__"

Type: filesandordirs; Name: "{app}\launcher\__pycache__"

Type: filesandordirs; Name: "{app}\tools\__pycache__"

Type: filesandordirs; Name: "{app}\tmp_pdf_images"

Type: filesandordirs; Name: "{app}\launcher\Start_Tray_Silent.vbs"

Type: filesandordirs; Name: "{app}\launch_diagnostic.cmd"

Type: filesandordirs; Name: "{app}\.webview2_cache"

; Remove old keygen shortcuts and files (replaced by Protection Toolkit)

Type: filesandordirs; Name: "{app}\launcher\KeygenTool.cmd"

Type: filesandordirs; Name: "{app}\launcher\Zeralda_ERP_Launcher.lnk"

; Remove old root .cmd launchers (consolidated into START_TOOLKIT.cmd + VBS launcher)

Type: filesandordirs; Name: "{app}\START_KEYGEN.cmd"

Type: filesandordirs; Name: "{app}\KEYGEN.py"

Type: filesandordirs; Name: "{app}\start_system.cmd"

Type: filesandordirs; Name: "{app}\stop_system.cmd"

Type: filesandordirs; Name: "{app}\START_CHROME_LAUNCHER.cmd"

Type: filesandordirs; Name: "{app}\start_server.bat"

; Remove developer-only tools from previous installations

Type: filesandordirs; Name: "{app}\tools\protection_toolkit.py"

Type: filesandordirs; Name: "{app}\tools\keygen_tool.py"

Type: filesandordirs; Name: "{app}\tools\obfuscate_js.py"

Type: filesandordirs; Name: "{app}\tools\obfuscate_py.py"

Type: filesandordirs; Name: "{app}\tools\inject_license.py"

Type: filesandordirs; Name: "{app}\protection_toolkit.html"

Type: filesandordirs; Name: "{app}\START_TOOLKIT.cmd"

Type: filesandordirs; Name: "{app}\AGENTS.md"

Type: filesandordirs; Name: "{app}\launcher\Start_Toolkit.vbs"

; ============================================================================

[Files]

; ============================================================================

; ── Core application — web pages ───────────────────────────────────────────

Source: "{#SourceDir}\pages\*";                  DestDir: "{app}\pages"; Components: core; Flags: ignoreversion recursesubdirs createallsubdirs

Source: "{#SourceDir}\START_ERP.cmd";              DestDir: "{app}"; Components: core; Flags: ignoreversion

Source: "{#SourceDir}\zeralda.cmd";                DestDir: "{app}"; Components: core; Flags: ignoreversion

Source: "{#SourceDir}\manage.py";                  DestDir: "{app}"; Components: core; Flags: ignoreversion

; ── Core application — Python & config ──────────────────────────────────────

Source: "{#SourceDir}\server.py";                  DestDir: "{app}"; Components: core; Flags: ignoreversion

Source: "{#SourceDir}\requirements.txt";           DestDir: "{app}"; Components: core; Flags: ignoreversion

Source: "{#SourceDir}\.env.example";               DestDir: "{app}"; Components: core; Flags: ignoreversion

Source: "{#SourceDir}\.env";                       DestDir: "{app}"; Components: core; Flags: ignoreversion onlyifdoesntexist skipifsourcedoesntexist

Source: "{#SourceDir}\favicon.ico";                DestDir: "{app}"; Components: core; Flags: ignoreversion

Source: "{#SourceDir}\logo.png";                   DestDir: "{app}"; Components: core; Flags: ignoreversion

Source: "{#SourceDir}\LICENSE.txt";                DestDir: "{app}"; Components: core; Flags: ignoreversion

Source: "{#SourceDir}\README.md";                  DestDir: "{app}"; Components: core; Flags: ignoreversion isreadme

Source: "{#SourceDir}\VERSION";                    DestDir: "{app}"; Components: core; Flags: ignoreversion

Source: "{#SourceDir}\CHANGELOG.md";               DestDir: "{app}"; Components: core; Flags: ignoreversion

; ── Subsystems (recursive) ─────────────────────────────────────────────────

; Excludes: __pycache__, *.pyc, test files, temp files, .venv, .vscode

Source: "{#SourceDir}\app\*";      DestDir: "{app}\app";      Components: core; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "__pycache__,*.pyc"

Source: "{#SourceDir}\modules\*";  DestDir: "{app}\modules";  Components: core; Flags: ignoreversion recursesubdirs createallsubdirs

Source: "{#SourceDir}\shared\*";   DestDir: "{app}\shared";   Components: core; Flags: ignoreversion recursesubdirs createallsubdirs

Source: "{#SourceDir}\styles\*";   DestDir: "{app}\styles";   Components: core; Flags: ignoreversion recursesubdirs createallsubdirs

Source: "{#SourceDir}\launcher\*"; DestDir: "{app}\launcher"; Components: core; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.lnk,__pycache__,*.pyc,Start_Toolkit.vbs"

; Critical data files & schemas (Public assets only, developer private keys excluded)

Source: "{#SourceDir}\data\database\*";                DestDir: "{app}\data\database"; Components: core; Flags: ignoreversion recursesubdirs createallsubdirs

Source: "{#SourceDir}\data\cert\*";                    DestDir: "{app}\data\cert";     Components: core; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

Source: "{#SourceDir}\data\keys.json";                DestDir: "{app}\data"; Components: core; Flags: ignoreversion onlyifdoesntexist

Source: "{#SourceDir}\data\licenses.json";            DestDir: "{app}\data"; Components: core; Flags: ignoreversion onlyifdoesntexist

Source: "{#SourceDir}\data\license_public_key.pem";   DestDir: "{app}\data"; Components: core; Flags: ignoreversion onlyifdoesntexist

Source: "{#SourceDir}\data\license_server_state.json";DestDir: "{app}\data"; Components: core; Flags: ignoreversion onlyifdoesntexist

Source: "{#SourceDir}\data\license_integrity.json";   DestDir: "{app}\data"; Components: core; Flags: ignoreversion onlyifdoesntexist

Source: "{#SourceDir}\data\users.json";               DestDir: "{app}\data"; Components: core; Flags: ignoreversion onlyifdoesntexist

Source: "{#SourceDir}\data\shared_store.json";        DestDir: "{app}\data"; Components: core; Flags: ignoreversion onlyifdoesntexist

Source: "{#SourceDir}\data\.storage_key";             DestDir: "{app}\data"; Components: core; Flags: ignoreversion onlyifdoesntexist

; ── Bundled Python 3.11 embedded distribution (core, no system Python required) ──

Source: "{#SourceDir}\tools\python-embed\*"; DestDir: "{app}\python"; Components: core; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist

; ── Pre-downloaded pip packages (offline install — no internet required) ──────

Source: "pip-packages\*.whl"; DestDir: "{app}\pip-packages"; Components: core; Flags: ignoreversion skipifsourcedoesntexist

; ── Internal helper scripts (post-install + uninstall) ────────────────────

Source: "scripts\bootstrap.ps1";         DestDir: "{app}\installer"; Components: core; Flags: ignoreversion

Source: "scripts\uninstall_cleanup.ps1"; DestDir: "{app}\installer"; Components: core; Flags: ignoreversion

; ============================================================================

[Dirs]

; ============================================================================

Name: "{app}\data";  Permissions: users-modify

Name: "{app}\logs";  Permissions: users-modify

; ============================================================================

[Icons]

; ============================================================================

; Desktop shortcut — starts server silently + opens browser URL directly

Name: "{autodesktop}\{#AppName}";          Filename: "wscript.exe"; Parameters: """{app}\launcher\Start_Tray_Silent.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\launcher\app.ico"; Tasks: desktopicon; Comment: "Launch Zeralda ERP — opens in browser"

; Start Menu shortcut — same launcher

Name: "{group}\{#AppName}";                Filename: "wscript.exe"; Parameters: """{app}\launcher\Start_Tray_Silent.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\launcher\app.ico"; Tasks: startmenu;   Comment: "Launch Zeralda ERP — opens in browser"

; Connection Hub shortcut

Name: "{group}\{#AppName} (مركز ربط الهواتف - Connection Hub)"; Filename: "{app}\START_CONNECTION_HUB.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\launcher\app.ico"; Tasks: startmenu; Comment: "Zeralda ERP Connection Hub"

; Optional diagnostic launcher (visible console, for troubleshooting)

Name: "{group}\{#AppName} (Diagnostic Mode)"; Filename: "{app}\launch_diagnostic.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\launcher\app.ico"; Tasks: startmenu

Name: "{group}\{cm:UninstallProgram,{#AppName}}"; Filename: "{uninstallexe}"; Tasks: startmenu

; Auto-start shortcut (Startup folder) — starts server + opens browser on Windows boot

Name: "{commonstartup}\{#AppName}";        Filename: "wscript.exe"; Parameters: """{app}\launcher\Start_Tray_Silent.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\launcher\app.ico"; Tasks: autostart; Comment: "Auto-start Zeralda ERP on boot"

; ============================================================================

[Registry]

; ============================================================================

; Application metadata

Root: HKLM; Subkey: "SOFTWARE\Zeralda\ERP";  ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey

Root: HKLM; Subkey: "SOFTWARE\Zeralda\ERP";  ValueType: string; ValueName: "Version";     ValueData: "{#AppVersion}"

Root: HKLM; Subkey: "SOFTWARE\Zeralda\ERP";  ValueType: dword;  ValueName: "Port";        ValueData: {#DefaultPort}

; ============================================================================

[Run]

; ============================================================================

; 1) Stop any running ERP processes from previous installation

Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\bootstrap.ps1"" -AppDir ""{app}"" -Stage cleanup"; \
  StatusMsg: "{cm:StatusCleanup}"; \
  Flags: runhidden waituntilterminated

; 2) Install Python dependencies into the bundled embedded Python

Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\bootstrap.ps1"" -AppDir ""{app}"" -Stage pip"; \
  StatusMsg: "{cm:StatusPip}"; \
  Flags: runhidden waituntilterminated

; 3) Create launcher scripts (silent tray VBS + diagnostic CMD)

Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\bootstrap.ps1"" -AppDir ""{app}"" -Stage launcher"; \
  StatusMsg: "{cm:StatusFinalize}"; \
  Flags: runhidden waituntilterminated

; 4) Add Windows Defender Firewall rule for the ERP port

Filename: "{sys}\netsh.exe"; \
  Parameters: "advfirewall firewall add rule name=""Zeralda ERP (TCP {#DefaultPort})"" dir=in action=allow protocol=TCP localport={#DefaultPort} profile=private,domain"; \
  StatusMsg: "{cm:StatusFirewall}"; \
  Tasks: firewall; \
  Flags: runhidden waituntilterminated

; 4a) Add Windows Defender Firewall rule for standard HTTP port 80

Filename: "{sys}\netsh.exe"; \
  Parameters: "advfirewall firewall add rule name=""Zeralda ERP Web (TCP 80)"" dir=in action=allow protocol=TCP localport=80 profile=private,domain"; \
  StatusMsg: "{cm:StatusFirewall}"; \
  Tasks: firewall; \
  Flags: runhidden waituntilterminated

; 4b) Add www.zeralda-erp.dz and zeralda-erp.dz → 127.0.0.1 to the Windows hosts file (local domain)

; Note: PowerShell braces are escaped with {{ }} to avoid Inno Setup constant parsing

Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
  Parameters: "-NoProfile -Command ""$h='C:\Windows\System32\drivers\etc\hosts'; $c=Get-Content $h -ErrorAction SilentlyContinue; if ($c -notmatch 'www\.zeralda-erp\.dz') {{ Add-Content -Path $h -Value '127.0.0.1 www.zeralda-erp.dz' -Encoding ASCII }}; if ($c -notmatch '127\.0\.0\.1\s+zeralda-erp\.dz') {{ Add-Content -Path $h -Value '127.0.0.1 zeralda-erp.dz' -Encoding ASCII }}; ipconfig /flushdns | Out-Null"""; \
  StatusMsg: "Configuring local domain…"; \
  Tasks: localdomain; \
  Flags: runhidden waituntilterminated

; 5) Optional: launch ERP after install (silent tray)

Filename: "wscript.exe"; \
  Parameters: """{app}\launcher\Start_Tray_Silent.vbs"""; \
  Description: "{cm:LaunchProgram,{#AppName}}"; \
  WorkingDir: "{app}"; \
  Flags: nowait postinstall skipifsilent

; ============================================================================

[UninstallRun]

; ============================================================================

; Stop running ERP processes via shipped helper script

Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\uninstall_cleanup.ps1"" -AppDir ""{app}"""; \
  Flags: runhidden waituntilterminated; RunOnceId: "StopERP"

; Remove firewall rules

Filename: "{sys}\netsh.exe"; \
  Parameters: "advfirewall firewall delete rule name=""Zeralda ERP (TCP {#DefaultPort})"""; \
  Flags: runhidden waituntilterminated; RunOnceId: "RemoveFirewall"

Filename: "{sys}\netsh.exe"; \
  Parameters: "advfirewall firewall delete rule name=""Zeralda ERP Web (TCP 80)"""; \
  Flags: runhidden waituntilterminated; RunOnceId: "RemoveFirewall80"

; Remove www.zeralda-erp.dz from the hosts file

Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; \
  Parameters: "-NoProfile -Command ""$h='C:\Windows\System32\drivers\etc\hosts'; $c=Get-Content $h -ErrorAction SilentlyContinue; if ($c) {{ $f=$c | Where-Object {{ $_ -notmatch 'zeralda-erp\.dz' -and $_ -notmatch 'Zeralda ERP local domain' }}; Set-Content -Path $h -Value $f -Encoding ASCII; ipconfig /flushdns | Out-Null }}"""; \
  Flags: runhidden waituntilterminated; RunOnceId: "RemoveHostsEntry"

; ============================================================================

[UninstallDelete]

; ============================================================================

Type: filesandordirs; Name: "{app}\python"

Type: filesandordirs; Name: "{app}\pip-packages"

Type: filesandordirs; Name: "{app}\.venv"

Type: filesandordirs; Name: "{app}\__pycache__"

Type: filesandordirs; Name: "{app}\app\__pycache__"

Type: filesandordirs; Name: "{app}\app\handlers\__pycache__"

Type: filesandordirs; Name: "{app}\app\services\__pycache__"

Type: filesandordirs; Name: "{app}\backend\__pycache__"

Type: filesandordirs; Name: "{app}\launcher\__pycache__"

Type: filesandordirs; Name: "{app}\tools\__pycache__"

Type: filesandordirs; Name: "{app}\logs"

Type: filesandordirs; Name: "{app}\tmp_pdf_images"

Type: filesandordirs; Name: "{app}\.webview2_cache"

Type: filesandordirs; Name: "{app}\launch_diagnostic.cmd"

Type: filesandordirs; Name: "{app}\launcher\Start_Tray_Silent.vbs"

Type: filesandordirs; Name: "{app}\launcher\KeygenTool.cmd"

Type: filesandordirs; Name: "{app}\START_KEYGEN.cmd"

Type: filesandordirs; Name: "{app}\KEYGEN.py"

Type: filesandordirs; Name: "{app}\start_system.cmd"

Type: filesandordirs; Name: "{app}\stop_system.cmd"

Type: filesandordirs; Name: "{app}\START_CHROME_LAUNCHER.cmd"

Type: filesandordirs; Name: "{app}\start_server.bat"

; Remove developer-only tools

Type: filesandordirs; Name: "{app}\tools\protection_toolkit.py"

Type: filesandordirs; Name: "{app}\tools\keygen_tool.py"

Type: filesandordirs; Name: "{app}\tools\obfuscate_js.py"

Type: filesandordirs; Name: "{app}\tools\obfuscate_py.py"

Type: filesandordirs; Name: "{app}\tools\inject_license.py"

Type: filesandordirs; Name: "{app}\protection_toolkit.html"

Type: filesandordirs; Name: "{app}\START_TOOLKIT.cmd"

Type: filesandordirs; Name: "{app}\AGENTS.md"

Type: filesandordirs; Name: "{app}\launcher\Start_Toolkit.vbs"

; ============================================================================

[Code]

// ============================================================================

const

  MIN_RAM_MB  = {#MinRamMB};

  MIN_DISK_MB = {#MinDiskMB};

  ERP_PORT    = {#DefaultPort};

var

  PreflightSummary: TWizardPage;

  SummaryMemo:      TNewMemo;

  HasEnoughDisk:    Boolean;

  HasEnoughRam:     Boolean;

  PortIsBusy:       Boolean;

  PreflightDone:    Boolean;

{ ─── Helpers ─────────────────────────────────────────────────────────────── }

function ExecHidden(const FileName, Params: String; var Output: String): Integer;

var

  TmpFile: String;

  Lines: TArrayOfString;

  i: Integer;

begin

  Result := -1;

  Output := '';

  TmpFile := ExpandConstant('{tmp}\_exec_out.txt');

  if Exec(ExpandConstant('{cmd}'), '/C "' + FileName + ' ' + Params + ' > "' + TmpFile + '" 2>&1"',

          '', SW_HIDE, ewWaitUntilTerminated, Result) then

  begin

    if LoadStringsFromFile(TmpFile, Lines) then

      for i := 0 to GetArrayLength(Lines) - 1 do

        Output := Output + Lines[i] + #13#10;

    DeleteFile(TmpFile);

  end;

end;

function GetSystemRamMB(): Cardinal;

var

  OutStr: String;

  Code: Integer;

  V: Int64;

begin

  Result := 0;

  Code := ExecHidden(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),

    '-NoProfile -Command "[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1MB)"',

    OutStr);

  if Code = 0 then begin

    V := StrToInt64Def(Trim(OutStr), 0);

    if V > 0 then Result := Cardinal(V);

  end;

end;

function GetFreeDiskMB(const Path: String): Cardinal;

var

  FreeBytes, TotalBytes: Int64;

begin

  Result := 0;

  if GetSpaceOnDisk64(ExtractFileDrive(Path), FreeBytes, TotalBytes) then

    Result := Cardinal(FreeBytes div (1024 * 1024));

end;

function IsPortBusy(Port: Integer): Boolean;

var

  OutStr: String;

begin

  ExecHidden(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),

    Format('-NoProfile -Command "(Test-NetConnection -ComputerName 127.0.0.1 -Port %d -WarningAction SilentlyContinue -InformationLevel Quiet)"', [Port]),

    OutStr);

  Result := Pos('True', OutStr) > 0;

end;

{ ─── Wizard pages ────────────────────────────────────────────────────────── }

procedure RunPreflight();

var

  RamMB, DiskMB: Cardinal;

  Summary: String;

begin

  if PreflightDone then Exit;

  PreflightDone := True;

  Log('[preflight] starting');

  Log('[preflight] Using bundled Python 3.11');

  RamMB := GetSystemRamMB();

  HasEnoughRam := (RamMB = 0) or (RamMB >= MIN_RAM_MB);

  Log('[preflight] RamMB=' + IntToStr(RamMB));

  DiskMB := GetFreeDiskMB(WizardDirValue());

  HasEnoughDisk := (DiskMB = 0) or (DiskMB >= MIN_DISK_MB);

  Log('[preflight] DiskMB=' + IntToStr(DiskMB));

  PortIsBusy := IsPortBusy(ERP_PORT);

  Log('[preflight] PortBusy=' + IntToStr(Ord(PortIsBusy)));

  Summary := '';

  Summary := Summary + '[OK]   Python 3.11 — bundled with installer (no system install required)' + #13#10;

  if HasEnoughRam then

    Summary := Summary + '[OK]   RAM ' + IntToStr(RamMB) + ' MB' + #13#10

  else

    Summary := Summary + '[WARN] ' + Format(ExpandConstant('{cm:PreflightLowRam}'), [IntToStr(MIN_RAM_MB)]) + ' (' + IntToStr(RamMB) + ' MB)' + #13#10;

  if HasEnoughDisk then

    Summary := Summary + '[OK]   Free disk ' + IntToStr(DiskMB) + ' MB on ' + ExtractFileDrive(WizardDirValue()) + #13#10

  else

    Summary := Summary + '[FAIL] ' + Format(ExpandConstant('{cm:PreflightLowDisk}'), [IntToStr(MIN_DISK_MB)]) + #13#10;

  if PortIsBusy then

    Summary := Summary + '[WARN] ' + Format(ExpandConstant('{cm:PreflightPortBusy}'), [IntToStr(ERP_PORT)]) + #13#10

  else

    Summary := Summary + '[OK]   TCP port ' + IntToStr(ERP_PORT) + ' is free' + #13#10;

  Summary := Summary + #13#10;

  if HasEnoughDisk then

    Summary := Summary + ExpandConstant('{cm:PreflightOK}');

  if SummaryMemo <> nil then

    SummaryMemo.Lines.Text := Summary;

end;

procedure InitializeWizard();

begin

  PreflightDone := False;

  PreflightSummary := CreateCustomPage(wpWelcome,

    ExpandConstant('{cm:PreflightCaption}'),

    ExpandConstant('{cm:PreflightDescription}'));

  SummaryMemo            := TNewMemo.Create(PreflightSummary);

  SummaryMemo.Parent     := PreflightSummary.Surface;

  SummaryMemo.Left       := 0;

  SummaryMemo.Top        := 0;

  SummaryMemo.Width      := PreflightSummary.SurfaceWidth;

  SummaryMemo.Height     := PreflightSummary.SurfaceHeight;

  SummaryMemo.ReadOnly   := True;

  SummaryMemo.ScrollBars := ssVertical;

  SummaryMemo.Font.Name  := 'Consolas';

  SummaryMemo.Font.Size  := 10;

  SummaryMemo.WordWrap   := False;

end;

procedure CurPageChanged(CurPageID: Integer);

begin

  Log('[wizard] CurPageChanged id=' + IntToStr(CurPageID));

  if CurPageID = PreflightSummary.ID then

    RunPreflight();

end;

function NextButtonClick(CurPageID: Integer): Boolean;

begin

  Result := True;

  Log('[wizard] NextButtonClick id=' + IntToStr(CurPageID));

  if CurPageID = PreflightSummary.ID then

  begin

    if not HasEnoughDisk then

    begin

      Log('[wizard] ABORT: insufficient disk');

      if not WizardSilent() then

        MsgBox(Format(ExpandConstant('{cm:PreflightLowDisk}'), [IntToStr(MIN_DISK_MB)]), mbCriticalError, MB_OK);

      Result := False;

      Exit;

    end;

  end;

end;

{ ─── Uninstall: ask whether to keep user data ────────────────────────────── }

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);

var

  AppDir: String;

  KeepData: Integer;

begin

  if CurUninstallStep = usPostUninstall then

  begin

    AppDir := ExpandConstant('{app}');

    KeepData := MsgBox(ExpandConstant('{cm:UninstallKeepData}'), mbConfirmation, MB_YESNO);

    if KeepData = IDNO then

    begin

      DelTree(AppDir + '\data', True, True, True);

      DelTree(AppDir + '\database', True, True, True);

    end;

  end;

end;

function InitializeSetup(): Boolean;

begin

  Result := True;

end;

{ ─── Post-install: show local domain confirmation ─────────────────────────── }

procedure CurStepChanged(CurStep: TSetupStep);

begin

  if CurStep = ssPostInstall then

  begin

    if WizardIsTaskSelected('localdomain') then

    begin

      Log('[LocalDomain] Local domain task selected — hosts file updated');

      if not WizardSilent() then

        MsgBox(ExpandConstant('{cm:LocalDomainEnabled}'), mbInformation, MB_OK);

    end;

  end;

end;

