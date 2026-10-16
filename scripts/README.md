# Scripts & Operational Utilities — Zeralda ERP

يحتوي هذا المجلد على كافة سكربتات التشغيل، النشر، وتحديث النظام للمطورين ومسؤولي النظام.

## السكربتات المتاحة (Available Scripts)

### 1. الإقلاع والتحكم بالنظام (System Startup & Control)
- **`start_system.cmd` / `start_server.bat`**: تشغيل خادم ERP في الخلفية والتحقق من الجاهزية.
- **`stop_system.cmd`**: إيقاف تشغيل كافة خدمات وخوادم ERP والأنفاق المفتوحة بشكل آمن وفوري.
- **`launch_diagnostic.cmd`**: تشغيل الخادم في وضع الفحص والتشخيص المباشر لعرض الأخطاء في سطر الأوامر.
- **`START_CHROME_LAUNCHER.cmd`**: تشغيل نافذة التطبيق مباشرة داخل Google Chrome بدون شريط المتصفح (App Mode).

### 2. الشبكة والاتصال عن بُعد (Networking & Remote Access)
- **`START_CONNECTION_HUB.cmd`**: فتح صفحة إدارة الاتصالات والتكاملات في المتصفح.
- **`START_REMOTE_TUNNEL.cmd`**: إنشاء وتشغيل نفق سحابي مشفر للوصول للنظام من خارج الشبكة المحلية.

### 3. التطوير والنشر (Deployment & Git)
- **`BUILD_AND_INSTALL.cmd`**: بناء حزمة التثبيت الرسمية (Inno Setup) وتثبيتها تلقائياً لاختبار الإصدار.
- **`DEPLOY_TO_RAILWAY.cmd`**: نشر وبناء الحاوية السحابية للمشروع مباشرة على خدمة Railway.
- **`deploy.cmd`**: نسخ ملفات التحديث إلى مجلد `C:\Program Files\Zeralda ERP`.
- **`UPDATE_PROGRAM_FILES.cmd`**: تطبيق التحديثات البرمجية على مجلد التثبيت الرسمي مع طلب صلاحيات المسؤول.
- **`push_to_github.bat`**: رفع التعديلات البرمجية مباشرة إلى المستودع البعيد على GitHub.

### 4. التراخيص والمفاتيح (License & Keys)
- **`START_KEYGEN.cmd`**: تشغيل واجهة توليد المفاتيح والتراخيص.
- **`START_TOOLKIT.cmd`**: تشغيل لوحة التحكم والحماية للمطور (Protection Toolkit).
