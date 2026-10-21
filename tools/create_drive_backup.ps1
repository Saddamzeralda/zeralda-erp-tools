$driveDir = "C:\Users\sadda\Desktop\Zeralda_Google_Drive_Backup"
$sourceRepo = "C:\Users\sadda\Desktop\zeralda-erp-tools"
$zipPath = Join-Path $driveDir "Zeralda_ERP_Complete_Backup_v2.0.zip"

Write-Host "Creating backup directory: $driveDir..."
New-Item -ItemType Directory -Force -Path $driveDir | Out-Null

# 1. Copy Key Editor HTML
Write-Host "Copying Key Editor HTML..."
Copy-Item "C:\Users\sadda\Desktop\Zeralda_Key_Editor\zeralda_key_editor.html" -Destination (Join-Path $driveDir "zeralda_key_editor.html") -Force

# 2. Copy keys database
Write-Host "Copying keys database..."
Copy-Item (Join-Path $sourceRepo "data\keys.json") -Destination (Join-Path $driveDir "zeralda_keys_database.json") -Force

# 3. Create Google Drive URL Shortcut
Write-Host "Creating Google Drive shortcut..."
$shortcut = "[InternetShortcut]`r`nURL=https://drive.google.com/drive/my-drive`r`n"
[System.IO.File]::WriteAllText((Join-Path $driveDir "فتح_Google_Drive.url"), $shortcut, [System.Text.Encoding]::ASCII)

# 4. Create README in Arabic
Write-Host "Creating instructions file..."
$readme = @"
============================================================
      حزمة النسخ الاحتياطي الكاملة لبرنامج زيرالدا ERP
                 جاهزة للرفع إلى Google Drive
============================================================

محتويات هذا المجلد:
1. zeralda_key_editor.html:
   صفحة HTML مستقلة متكاملة لتوليد وإدارة تراخيص ومفاتيح البرنامج،
   تعمل في أي متصفح (على الكمبيوتر أو الهاتف) بدون الحاجة لتثبيت أي خادم.

2. Zeralda_ERP_Complete_Backup_v2.0.zip:
   حزمة مضغوطة نظيفة وشاملة لكامل كود وتطبيقات زيرالدا ERP 
   (تشمل خادم FastAPI الموحد، محرك المزامنة السحابية، والواجهات).

3. zeralda_keys_database.json:
   نسخة احتياطية من قاعدة بيانات المفاتيح والتراخيص المسجلة الحالية.

4. فتح_Google_Drive.url:
   رابط فوري يفتح حساب Google Drive الخاص بك في المتصفح بضغطة زر واحدة.

------------------------------------------------------------
طريقة رفع النسخة إلى Google Drive:
------------------------------------------------------------
1. انقر نقراً مزدوجاً على ملف (فتح_Google_Drive.url).
2. أنشئ مجلداً جديداً داخل Drive باسم: [Zeralda ERP Backups].
3. اسحب ملف (zeralda_key_editor.html) وملف (Zeralda_ERP_Complete_Backup_v2.0.zip) 
   وأفلتهما داخل مجلد Google Drive.
4. هكذا أصبحت نسختك الاحتياطية محفوظة بأمان في السحابة وتستطيع 
   الوصول إليها من أي مكان في العالم!

رابط التطبيق المنشور والمباشر على الإنترنت:
https://zeralda-erp-employees-main-production.up.railway.app/
============================================================
"@
[System.IO.File]::WriteAllText((Join-Path $driveDir "تعليمات_الرفع_إلى_الدرايف.txt"), $readme, [System.Text.Encoding]::UTF8)

# 5. Create Clean ZIP archive of ERP (excluding .git)
Write-Host "Creating complete clean ZIP archive of ERP..."
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

# Create a clean temporary copy without .git
$tempStaging = Join-Path $env:TEMP "zeralda_clean_staging"
if (Test-Path $tempStaging) { Remove-Item -Recurse -Force $tempStaging }
New-Item -ItemType Directory -Force -Path $tempStaging | Out-Null

$items = Get-ChildItem -Path $sourceRepo -Exclude ".git"
foreach ($item in $items) {
    Copy-Item -Path $item.FullName -Destination $tempStaging -Recurse -Force
}

# Compress staging directory
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempStaging, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

# Cleanup temp
Remove-Item -Recurse -Force $tempStaging

Write-Host "SUCCESS: Backup completed at $driveDir"
Get-ChildItem -Path $driveDir | Select-Object Name, Length, LastWriteTime
