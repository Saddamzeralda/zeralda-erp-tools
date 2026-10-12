# Changelog

All notable changes to **Zeralda ERP** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-08-05

### Added — النظام الأساسي
- **9 وحدات ERP متكاملة:** CRM، مبيعات، مشتريات، مخزون، مالية، موارد بشرية، خدمات، استشارات، تقارير
- **3 لغات:** عربية (RTL كامل)، إنجليزية، فرنسية
- **FastAPI backend** (`app/`) مع بنية معيارية: handlers + services
- **خادم HTTP قديم** (`server.py`) كـ fallback
- **مزامنة لحظية** عبر Server-Sent Events (SSE)
- **طبقة IndexedDB** للعميل مع WAL وكاش في الذاكرة
- **تخزين ثلاثي:** JSON محلي + PostgreSQL اختياري + IndexedDB
- **undo/redo stack** (200 إدخال) مع تاريخ كامل و rollback
- **نسخ احتياطي تلقائي** (آخر 20 نسخة) + Google Drive
- **تكامل Google:** OAuth، Drive backup، Contacts sync، Gmail
- **ذكاء اصطناعي:** Hugging Face chat، تحليل فواتير، OCR، بحث ويب
- **OCR:** Tesseract مدمج (عربي/إنجليزي/فرنسي)
- **صفحة إعدادات شاملة:** أمان، شركات، مستخدمين، AI، نسخ احتياطي، تدقيق
- **ثيمات:** فاتح/داكن مع محول تلقائي

### Added — المُثبّت (Inno Setup)
- **مُثبّت Windows أصلي** بمعالج حديث متعدد اللغات (عربي/إنجليزي/فرنسي)
- **Python 3.11 مُضمّن** — لا حاجة لـ Python على جهاز المستخدم
- **فحص النظام المسبق:** RAM، مساحة القرص، المنفذ 8080
- **اختيار المكونات:** Core (مطلوب) · Tools (Tesseract) · Demo
- **اختصارات:** سطح المكتب · قائمة ابدأ · تشغيل تلقائي · قاعدة جدار الحماية
- **تثبيت صامت** للشركات (`/VERYSILENT`)
- **إلغاء تثبيت نظيف** مع خيار الإبقاء على بيانات المستخدم
- **ضغط LZMA2 ultra64** (37.6 MB بدلاً من 154 MB)

### Added — المشغّل (Launcher)
- **أيقونة علبة النظام** (pystray) — تشغيل/إيقاف/إعادة تشغيل
- **مشغّل صامت** (VBS + pythonw.exe) — لا نافذة كونسول
- **وضع تشخيصي** — نافذة كونسول لاستكشاف الأخطاء
- **watchdog** — يقتل عمليات http.server المارقة
- **إعادة توجيه منفذ تلقائي** — يجد منفذ حر إذا كان 8080 مشغولاً
- **فحص أمان الإنتاج** — يرفض التشغيل بكلمات مرور ضعيفة

### Security
- **تشفير كلمات المرور** (SHA-256 + salt)
- **نظام مستخدمين وأدوار** (admin/user)
- **مصادقة JWT** + جلسات
- **CORS whitelist** صريحة
- **Rate limiting** للمصادقة (8 محاولات/دقيقة)
- **حدود body** (20MB عام، 8KB مصادقة)
- **متغيرات بيئة إلزامية** في الإنتاج: `SECRET_KEY`، `JWT_SECRET`

### Performance
- **تحميل الصفحات < 1 ثانية**
- **WAL (Write-Ahead Log)** للكتابة غير المتزامنة
- **deferred history flush** (5 ثواني debounced)
- **batched UPSERT** (1000 مفتاح/دفعة) بدلاً من DELETE-all
- **كاش في الذاكرة** مع invalidation ذكي

---

## [0.9.0] — 2026-03 — Beta

### Added
- 9 وحدات أساسية (نسخة أولية)
- خادم HTTP (`server.py`)
- تخزين JSON + IndexedDB
- تكامل Google (نسخة أولية)
- مشغّل WebView2 (نسخة أولية)

---

## [0.5.0] — 2025-12 — Alpha

### Added
- بنية المشروع الأولية
- صفحات HTML للوحدات
- مصادقة أساسية

---

[1.0.0]: https://github.com/zeralda/erp/releases/tag/v1.0.0
