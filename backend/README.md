# Backend Services & Shared Libraries — Zeralda ERP

يحتوي مجلد `backend/` على الخدمات المشتركة، محركات الذكاء الاصطناعي، تكاملات التجارة الإلكترونية، وأدوات إدارة المفاتيح التي يتم استهلاكها بواسطة خادم FastAPI (`app/`) والخادم القديم.

## ملفات المجلد والمسؤوليات (Modules & Responsibilities)

| الملف | الوظيفة والمسؤولية |
| :--- | :--- |
| `auth.py` | تشفير كلمات المرور (PBKDF2/Argon2)، إدارة المستخدمين الافتراضيين، وإدارة الجلسات في `data/users.json`. |
| `keygen_service.py` | محرك توليد وفحص رموز التفعيل (`KEY-XXXX`) وربطها بتراخيص RSA في `license_service.py`. |
| `KEYGEN.py` | أداة سطر الأوامر (CLI) لتوليد وإلغاء وتفقد مفاتيح التفعيل يدوياً. |
| `cloud_ai_service.py` | محرك الاتصال بنماذج الذكاء الاصطناعي (Gemini, Groq, Ollama, Cloud AI) مع دعم البث المباشر (Streaming). |
| `ai_chat_service.py` | واجهة موحدة (Facade) توجه طلبات المحادثة للمزود النشط في إعدادات النظام. |
| `ai_file_processor.py` | معالجة المستندات متعددة الوسائط (PDF, صور, فواتير) واستخراج الجداول والبيانات المنظمة. |
| `ai_routes.py` | خريطة الوحدات (`MODULE_MAP`) ودوال تعقيم وترجمة إجراءات الذكاء الاصطناعي إلى تعديلات في قاعدة البيانات. |
| `ocr_service.py` | تكامل مع محرك Tesseract OCR المحلي لمعالجة الصور وسندات الشراء. |
| `groq_service.py` | خدمة البحث عبر الويب (DuckDuckGo Search) لتزويد الذكاء الاصطناعي ببيانات حية ومحدثة. |
| `ecommerce_service.py` | مزامنة الطلبات والمنتجات مع منصات المتاجر الإلكترونية (Shopify, WooCommerce, Custom). |
| `ecommerce_integration.py` | طبقة الاتصال ونقاط تكامل المتجر الإلكتروني مع سجل الفواتير والمخزون. |

## ملاحظات الأمان والترخيص (Security & Licensing Notes)
- يُعد ملف `backend/keygen_service.py` أحد الملفات الأساسية المحمية بنظام التمويه (Obfuscation). النسخة الأصلية قبل التمويه محفوظة في `tools/_py_originals/backend/keygen_service.py`.
