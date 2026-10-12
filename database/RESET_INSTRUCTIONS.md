# PostgreSQL Reset (Full Rebuild)

هذا الإجراء يعيد تهيئة قاعدة البيانات بالكامل إذا كانت تالفة.

## 1) نسخة احتياطية قبل المسح

```powershell
pg_dump -h 127.0.0.1 -p 5432 -U postgres -d zeralda_erp > backup_before_reset.sql
```

## 2) إعادة البناء الكامل

```powershell
psql -h 127.0.0.1 -p 5432 -U postgres -d zeralda_erp -f database/reset_postgresql.sql
```

## 2.1) وضع الإصلاح بدون حذف البيانات (Repair Mode)

إذا أردت إصلاح القاعدة التالفة بدون مسح كامل للبيانات:

```powershell
psql -h 127.0.0.1 -p 5432 -U postgres -d zeralda_erp -f database/repair_postgresql.sql
```

أو عبر السكربت الجاهز:

```powershell
powershell -ExecutionPolicy Bypass -File database/run_repair.ps1
```

إذا كانت القاعدة تتطلب كلمة مرور:

```powershell
powershell -ExecutionPolicy Bypass -File database/run_repair.ps1 -Password "YOUR_POSTGRES_PASSWORD"
```

هذا الوضع يقوم بـ:
- إنشاء الجداول الناقصة فقط.
- إضافة الأعمدة المفقودة.
- إنشاء الفهارس وTriggers المطلوبة.
- ضمان وجود مستخدم `admin`.
- **بدون** `DROP SCHEMA`.

## 3) ضبط عنوان API (اختياري)

إذا كان Backend على عنوان مختلف:

```javascript
localStorage.setItem('zeralda-api-base', 'http://127.0.0.1:8000/api')
```

أو عبر `zeralda-settings.apiBaseUrl`.

## 4) ملاحظات مهمة

- السكربت يمسح كل البيانات القديمة ويعيد إنشاء المخطط من الصفر.
- استخدم `repair_postgresql.sql` إذا أردت الحفاظ على البيانات.
- الحساب الافتراضي بعد reset:
  - username: `admin`
  - email: `admin@example.com`
  - password: `admin` (حسب تطبيق Backend وآلية التحقق من hash)
- يفضّل تغيير كلمة المرور فورًا بعد أول دخول.

## 5) إعادة ضخ بيانات الواجهة إلى DB

بعد تشغيل النظام وفتح أي وحدة، `app_sync.js` سيبدأ مزامنة مفاتيح localStorage إلى قاعدة البيانات عبر `/api/storage/bulk`.

إذا أردت مزامنة فورية: افتح أي صفحة وحدة ثم أعد تحميلها مرة واحدة.

## 6) فحص سلامة القاعدة بعد الإصلاح

تشغيل فحص الصحة:

```powershell
powershell -ExecutionPolicy Bypass -File database/run_health_check.ps1
```

مع كلمة مرور:

```powershell
powershell -ExecutionPolicy Bypass -File database/run_health_check.ps1 -Password "YOUR_POSTGRES_PASSWORD"
```

أو مباشرة:

```powershell
psql -h 127.0.0.1 -p 5432 -U postgres -d zeralda_erp -f database/health_check.sql
```

ستظهر النتائج بحالة `OK` أو `MISSING` لكل جزء أساسي.

وسيتم إنشاء تقرير مختصر تلقائيًا في:

- [database/health_report.txt](database/health_report.txt)

ويحتوي على:
- حالة عامة `PASS` أو `FAIL`
- عدد العناصر الناقصة `MissingCount`
- المخرجات الخام الكاملة للفحص
