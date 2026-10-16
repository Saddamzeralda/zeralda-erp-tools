# App Architecture — Zeralda ERP FastAPI Core

هذا المجلد يمثل **النواة الحديثة والمعيارية للخادم** (FastAPI Core)، وهو البديل المعماري لملف `server.py` الأحادي القديم.

## هيكلية المجلد (Directory Structure)

```text
app/
├── main.py              # نقطة الدخول الرئيسية للخادم (Uvicorn Server Runner & Process Watchdog)
├── app.py               # تجميع التطبيق (FastAPI Setup, Middleware, CORS, Security Headers, Static Mounts)
├── handlers/            # موجهات الـ API ونقاط النهاية (HTTP Routers & Endpoints)
│   ├── ai.py            # endpoints المحادثة الذكية وتنفيذ الأوامر التلقائية
│   ├── auth.py          # تسجيل الدخول، الجلسات، مفاتيح التفعيل، وسجل التدقيق
│   ├── backup.py        # النسخ الاحتياطي السحابي والمحلي واستعادة البيانات
│   ├── license.py       # إدارة التراخيص الرقمية والتحقق من نبضات القلب
│   ├── misc.py          # حالة النظام، إعدادات الشبكة، والتحقق الصحي
│   ├── notifications.py # إشعارات Web Push ومفاتيح VAPID
│   ├── ocr.py           # معالجة الصور واستخراج نصوص الفواتير
│   └── store.py         # قراءة وتعديل مخزن البيانات، السجل والتراجع (SSE Sync)
└── services/            # الخدمات الأساسية ومنطق العمليات (Core Business Logic)
    ├── alerts.py        # التنبيهات الاستباقية للمخزون والسيولة
    ├── audit.py         # تسجيل وتتبع أحداث وتعديلات النظام
    ├── cloud_backup.py  # النسخ الاحتياطي التلقائي المشفر المجدول
    ├── dns_service.py   # إدارة أسماء المضيفين واكتشاف الـ IP المحلي
    ├── license_service.py # نظام ترخيص RSA-2048 والبصمة العتادية
    ├── notifications.py # محرك إرسال الإشعارات المشفرة
    ├── pdf.py           # محرك توليد الفواتير وملفات PDF
    ├── security.py      # جدار الحماية، تعقيم الطلبات، وفحص الجلسات
    ├── storage.py       # محرك التخزين المزدوج (JSON Key-Value + PostgreSQL)
    └── totp.py          # التحقق بخطوتين (Two-Factor Authentication)
```

## قواعد الاستيراد والعمل (Import Rules)
- موجهات `handlers/` تستورد من `services/` ومن حزمة `backend/`.
- يجب عدم استيراد موجهات `handlers/` داخل طبقة `services/` لتجنب الاعتماد الدائري (Circular Dependencies).
- عند تعديل `app/services/license_service.py` أو `app/handlers/license.py`، يجب إعادة تسجيل بصمة النزاهة عبر `license_service.reset_integrity()`.
