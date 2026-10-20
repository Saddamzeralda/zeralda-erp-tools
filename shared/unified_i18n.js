/**
 * Unified I18N — نظام ترجمة موحد متكامل لكل الوحدات
 * ===================================================
 * النظام الموحد للترجمة (إصدار 2.5):
 * 1. قاموس موحد مركزي (COMMON_DICTIONARY) لجميع المصطلحات الشائعة في ERP.
 * 2. دعم كامل لسمات DOM:
 *    - data-en / data-ar / data-fr
 *    - data-i18n / data-i18n-placeholder / data-i18n-title
 *    - data-key / data-placeholder-key / data-title-key
 * 3. createRuntimeTranslator() — للنصوص الديناميكية مع دمج القاموس المركزي.
 * 4. تبديل لغات فوري مباشر In-Place بدون الحاجة لإعادة تحميل الصفحة (Zero-Reload).
 * 5. مزامنة ثلاثية المستويات (IndexedDB, localStorage, Cookies).
 */

(function () {
  'use strict';

  var _currentLang = 'en';
  var _listeners = [];
  var SUPPORTED = ['en', 'ar', 'fr'];

  // ── القاموس المركزي المشترك لجميع الوحدات ────────────────────────
  var COMMON_DICTIONARY = {
    // ── الإجراءات والأزرار العامة (Actions & Buttons) ──
    save: { ar: 'حفظ', fr: 'Enregistrer', en: 'Save' },
    cancel: { ar: 'إلغاء', fr: 'Annuler', en: 'Cancel' },
    delete: { ar: 'حذف', fr: 'Supprimer', en: 'Delete' },
    edit: { ar: 'تعديل', fr: 'Modifier', en: 'Edit' },
    add: { ar: 'إضافة', fr: 'Ajouter', en: 'Add' },
    create: { ar: 'إنشاء', fr: 'Créer', en: 'Create' },
    update: { ar: 'تحديث', fr: 'Mettre à jour', en: 'Update' },
    search: { ar: 'بحث', fr: 'Rechercher', en: 'Search' },
    filter: { ar: 'تصفية', fr: 'Filtrer', en: 'Filter' },
    reset: { ar: 'إعادة تعيين', fr: 'Réinitialiser', en: 'Reset' },
    close: { ar: 'إغلاق', fr: 'Fermer', en: 'Close' },
    print: { ar: 'طباعة', fr: 'Imprimer', en: 'Print' },
    export: { ar: 'تصدير', fr: 'Exporter', en: 'Export' },
    import: { ar: 'استيراد', fr: 'Importer', en: 'Import' },
    download: { ar: 'تحميل', fr: 'Télécharger', en: 'Download' },
    upload: { ar: 'رفع', fr: 'Téléverser', en: 'Upload' },
    view: { ar: 'عرض', fr: 'Voir', en: 'View' },
    details: { ar: 'التفاصيل', fr: 'Détails', en: 'Details' },
    back: { ar: 'رجوع', fr: 'Retour', en: 'Back' },
    next: { ar: 'التالي', fr: 'Suivant', en: 'Next' },
    previous: { ar: 'السابق', fr: 'Précédent', en: 'Previous' },
    confirm: { ar: 'تأكيد', fr: 'Confirmer', en: 'Confirm' },
    refresh: { ar: 'تحديث', fr: 'Actualiser', en: 'Refresh' },
    clear: { ar: 'تفريغ', fr: 'Vider', en: 'Clear' },
    submit: { ar: 'إرسال', fr: 'Soumettre', en: 'Submit' },
    duplicate: { ar: 'نسخ', fr: 'Dupliquer', en: 'Duplicate' },
    pay: { ar: 'دفع', fr: 'Payer', en: 'Pay' },
    apply: { ar: 'تطبيق', fr: 'Appliquer', en: 'Apply' },
    select: { ar: 'اختر...', fr: 'Sélectionner...', en: 'Select...' },
    all: { ar: 'الكل', fr: 'Tous', en: 'All' },
    copy: { ar: 'نسخ', fr: 'Copier', en: 'Copy' },

    // ── الوحدات وأقسام النظام (Modules & Sections) ──
    dashboard: { ar: 'لوحة التحكم', fr: 'Tableau de bord', en: 'Dashboard' },
    sales: { ar: 'المبيعات', fr: 'Ventes', en: 'Sales' },
    purchasing: { ar: 'المشتريات', fr: 'Achats', en: 'Purchasing' },
    inventory: { ar: 'المخزون', fr: 'Stock & Inventaire', en: 'Inventory' },
    finance: { ar: 'المالية والحسابات', fr: 'Finance & Comptabilité', en: 'Finance & Accounting' },
    hr: { ar: 'الموارد البشرية', fr: 'Ressources Humaines', en: 'Human Resources' },
    crm: { ar: 'إدارة العملاء', fr: 'Relation Client (CRM)', en: 'CRM' },
    pos: { ar: 'نقطة البيع (الكاشير)', fr: 'Point de Vente (POS)', en: 'Point of Sale (POS)' },
    settings: { ar: 'الإعدادات', fr: 'Paramètres', en: 'Settings' },
    reports: { ar: 'التقارير والتحليلات', fr: 'Rapports & Analyses', en: 'Reports & Analytics' },
    ecommerce: { ar: 'المتجر الإلكتروني', fr: 'E-commerce', en: 'E-commerce' },
    services: { ar: 'الخدمات', fr: 'Services', en: 'Services' },

    // ── الكيانات التجارية والحقول (Entities & Fields) ──
    invoice: { ar: 'فاتورة', fr: 'Facture', en: 'Invoice' },
    invoices: { ar: 'الفواتير', fr: 'Factures', en: 'Invoices' },
    proforma: { ar: 'فاتورة شكلية', fr: 'Proforma', en: 'Proforma' },
    proformas: { ar: 'فواتير شكلية', fr: 'Factures Proforma', en: 'Proforma Invoices' },
    bill: { ar: 'فاتورة شراء', fr: 'Facture d\'achat', en: 'Purchase Bill' },
    bills: { ar: 'فواتير الشراء', fr: 'Factures d\'achat', en: 'Purchase Bills' },
    customer: { ar: 'عميل', fr: 'Client', en: 'Customer' },
    customers: { ar: 'العملاء', fr: 'Clients', en: 'Customers' },
    supplier: { ar: 'مورد', fr: 'Fournisseur', en: 'Supplier' },
    suppliers: { ar: 'الموردون', fr: 'Fournisseurs', en: 'Suppliers' },
    product: { ar: 'منتج', fr: 'Produit', en: 'Product' },
    products: { ar: 'المنتجات', fr: 'Produits', en: 'Products' },
    item: { ar: 'صنف', fr: 'Article', en: 'Item' },
    items: { ar: 'أصناف', fr: 'Articles', en: 'Items' },
    category: { ar: 'تصنيف', fr: 'Catégorie', en: 'Category' },
    categories: { ar: 'التصنيفات', fr: 'Catégories', en: 'Categories' },
    brand: { ar: 'العلامة التجارية', fr: 'Marque', en: 'Brand' },
    barcode: { ar: 'الباركود', fr: 'Code-barres', en: 'Barcode' },
    sku: { ar: 'رمز المنتج', fr: 'Référence', en: 'SKU' },
    stock: { ar: 'المخزون', fr: 'Stock', en: 'Stock' },
    price: { ar: 'السعر', fr: 'Prix', en: 'Price' },
    unit_price: { ar: 'سعر الوحدة', fr: 'Prix unitaire (HT)', en: 'Unit Price' },
    cost_price: { ar: 'سعر التكلفة', fr: 'Prix de revient', en: 'Cost Price' },
    quantity: { ar: 'الكمية', fr: 'Quantité', en: 'Quantity' },
    qty: { ar: 'الكمية', fr: 'Qté', en: 'Qty' },
    subtotal: { ar: 'المجموع الفرعي (HT)', fr: 'Sous-total (HT)', en: 'Subtotal' },
    tax: { ar: 'الضريبة (TVA)', fr: 'TVA (19%)', en: 'Tax (VAT)' },
    discount: { ar: 'الخصم', fr: 'Remise', en: 'Discount' },
    total: { ar: 'المجموع', fr: 'Total', en: 'Total' },
    grand_total: { ar: 'الإجمالي النهائي', fr: 'Total TTC', en: 'Grand Total' },
    net_to_pay: { ar: 'الصافي للدفع', fr: 'Net à payer', en: 'Net to Pay' },
    amount: { ar: 'المبلغ', fr: 'Montant', en: 'Amount' },
    paid_amount: { ar: 'المبلغ المدفوع', fr: 'Montant payé', en: 'Paid Amount' },
    remaining_amount: { ar: 'المبلغ المتبقي', fr: 'Montant restant', en: 'Remaining Amount' },
    change_amount: { ar: 'الباقي للزبون', fr: 'Monnaie rendue', en: 'Change' },
    date: { ar: 'التاريخ', fr: 'Date', en: 'Date' },
    due_date: { ar: 'تاريخ الاستحقاق', fr: 'Date d\'échéance', en: 'Due Date' },
    reference: { ar: 'المرجع', fr: 'Référence', en: 'Reference' },
    number: { ar: 'الرقم', fr: 'N°', en: 'Number' },
    code: { ar: 'الرمز', fr: 'Code', en: 'Code' },
    status: { ar: 'الحالة', fr: 'Statut', en: 'Status' },
    actions: { ar: 'الإجراءات', fr: 'Actions', en: 'Actions' },
    notes: { ar: 'ملاحظات', fr: 'Notes', en: 'Notes' },
    description: { ar: 'الوصف', fr: 'Description', en: 'Description' },
    phone: { ar: 'الهاتف', fr: 'Téléphone', en: 'Phone' },
    email: { ar: 'البريد الإلكتروني', fr: 'E-mail', en: 'Email' },
    address: { ar: 'العنوان', fr: 'Adresse', en: 'Address' },
    city: { ar: 'المدينة', fr: 'Ville', en: 'City' },
    company: { ar: 'المؤسسة', fr: 'Entreprise', en: 'Company' },
    currency: { ar: 'العملة', fr: 'Devise', en: 'Currency' },
    user: { ar: 'المستخدم', fr: 'Utilisateur', en: 'User' },
    cashier: { ar: 'الكاشير', fr: 'Caissier', en: 'Cashier' },
    order: { ar: 'طلب', fr: 'Commande', en: 'Order' },
    orders: { ar: 'الطلبات', fr: 'Commandes', en: 'Orders' },

    // ── الحالات (Statuses) ──
    paid: { ar: 'مدفوعة', fr: 'Payée', en: 'Paid' },
    unpaid: { ar: 'غير مدفوعة', fr: 'Impayée', en: 'Unpaid' },
    partially_paid: { ar: 'مدفوعة جزئياً', fr: 'Partiellement payée', en: 'Partially Paid' },
    pending: { ar: 'قيد الانتظار', fr: 'En attente', en: 'Pending' },
    completed: { ar: 'مكتملة', fr: 'Terminée', en: 'Completed' },
    draft: { ar: 'مسودة', fr: 'Brouillon', en: 'Draft' },
    cancelled: { ar: 'ملغاة', fr: 'Annulée', en: 'Cancelled' },
    approved: { ar: 'معتمدة', fr: 'Approuvée', en: 'Approved' },
    rejected: { ar: 'مرفوضة', fr: 'Rejetée', en: 'Rejected' },
    active: { ar: 'نشط', fr: 'Actif', en: 'Active' },
    inactive: { ar: 'غير نشط', fr: 'Inactif', en: 'Inactive' },

    // ── طرق الدفع (Payment Methods) ──
    cash: { ar: 'نقداً', fr: 'Espèces', en: 'Cash' },
    card: { ar: 'بطاقة بنكية / CIB', fr: 'Carte CIB / Bancaire', en: 'Bank Card' },
    check: { ar: 'شيك', fr: 'Chèque', en: 'Check' },
    transfer: { ar: 'تحويل بنكي', fr: 'Virement', en: 'Bank Transfer' },
    credit: { ar: 'على الحساب (آجل)', fr: 'À terme / Crédit', en: 'On Account' },

    // ── الرسائل والتنبيهات (Messages & Alerts) ──
    success: { ar: 'نجاح', fr: 'Succès', en: 'Success' },
    error: { ar: 'خطأ', fr: 'Erreur', en: 'Error' },
    warning: { ar: 'تحذير', fr: 'Avertissement', en: 'Warning' },
    info: { ar: 'معلومة', fr: 'Information', en: 'Information' },
    loading: { ar: 'جاري التحميل...', fr: 'Chargement...', en: 'Loading...' },
    saving: { ar: 'جاري الحفظ...', fr: 'Enregistrement...', en: 'Saving...' },
    saved_successfully: { ar: 'تم الحفظ بنجاح', fr: 'Enregistré avec succès', en: 'Saved successfully' },
    deleted_successfully: { ar: 'تم الحذف بنجاح', fr: 'Supprimé avec succès', en: 'Deleted successfully' },
    updated_successfully: { ar: 'تم التحديث بنجاح', fr: 'Mis à jour avec succès', en: 'Updated successfully' },
    confirm_delete: { ar: 'هل أنت متأكد من الحذف؟', fr: 'Êtes-vous sûr de vouloir supprimer ?', en: 'Are you sure you want to delete?' },
    no_data: { ar: 'لا توجد بيانات متاحة', fr: 'Aucune donnée disponible', en: 'No data available' },
    no_results: { ar: 'لا توجد نتائج مطابقة', fr: 'Aucun résultat trouvé', en: 'No matching results found' },
    required_field: { ar: 'هذا الحقل إلزامي', fr: 'Ce champ est obligatoire', en: 'This field is required' },
    yes: { ar: 'نعم', fr: 'Oui', en: 'Yes' },
    no: { ar: 'لا', fr: 'Non', en: 'No' },
    currency_symbol: { ar: 'د.ج', fr: 'DA', en: 'DA' }
  };

  /**
   * استخراج اللغة الحالية من كافة مصادر التخزين
   */
  function getCurrentLang() {
    try {
      if (typeof ZS !== 'undefined' && ZS.getItem) {
        _currentLang = ZS.getItem('preferred-language') || ZS.getItem('language') || _currentLang;
      }
    } catch (e) {}

    if (SUPPORTED.indexOf(_currentLang) === -1) {
      try {
        if (typeof localStorage !== 'undefined') {
          _currentLang = localStorage.getItem('preferred-language') || localStorage.getItem('language') || _currentLang;
        }
      } catch (e) {}
    }

    if (SUPPORTED.indexOf(_currentLang) === -1) {
      try {
        var match = document.cookie.match(/(?:^|;\s*)preferred-language=([^;]+)/);
        if (match) _currentLang = decodeURIComponent(match[1]);
      } catch (e) {}
    }

    if (SUPPORTED.indexOf(_currentLang) === -1) _currentLang = 'ar';
    return _currentLang;
  }

  /**
   * تعيين وتحديث اللغة الحالية ومزامنتها لحظياً
   */
  function setCurrentLang(lang) {
    if (SUPPORTED.indexOf(lang) === -1) lang = 'ar';
    _currentLang = lang;

    // 1. التخزين في ZS (IndexedDB sync cache)
    try {
      if (typeof ZS !== 'undefined' && ZS.setItem) {
        ZS.setItem('preferred-language', lang);
        ZS.setItem('language', lang);
      }
    } catch (e) {}

    // 2. التخزين في localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('preferred-language', lang);
        localStorage.setItem('language', lang);
      }
    } catch (e) {}

    // 3. التخزين في ملف تعريف الارتباط (Cookie) الفوري للتحميل المتزامن
    try {
      document.cookie = 'preferred-language=' + encodeURIComponent(lang) + ';path=/;max-age=31536000;SameSite=Lax';
    } catch (e) {}

    // 4. مزامنة كائن الإعدادات العامة zeralda-settings
    try {
      if (typeof ZS !== 'undefined' && ZS.getItem) {
        var raw = ZS.getItem('zeralda-settings');
        if (raw) {
          var parsed = JSON.parse(raw);
          parsed.preferredLanguage = lang;
          parsed.language = lang;
          ZS.setItem('zeralda-settings', JSON.stringify(parsed));
        }
      }
    } catch (e) {}

    // 5. تفريغ التخزين لـ IndexedDB في الخلفية
    try {
      if (window.ZDB && typeof window.ZDB.flush === 'function') {
        window.ZDB.flush().catch(function () {});
      }
    } catch (e) {}

    // 6. تطبيق الترجمات حياً على كل عناصر الصفحة (In-Place)
    applyUnifiedTranslations(lang);
  }

  function onLanguageChange(callback) {
    if (typeof callback === 'function') _listeners.push(callback);
  }

  /**
   * دالة ترجمة موحدة تبحث في القاموس المحلي للموديول ثم القاموس المركزي
   */
  function tr(key, fallback) {
    var lang = getCurrentLang();

    // 1. البحث في كائن الترجمة المحلي للموديول (إن وُجد)
    if (typeof translations !== 'undefined' && translations && translations[lang] && translations[lang][key] !== undefined) {
      return translations[lang][key];
    }

    // 2. البحث في القاموس المركزي المشترك COMMON_DICTIONARY
    var entry = COMMON_DICTIONARY[key];
    if (entry && (entry[lang] || entry.en || entry.ar)) {
      return entry[lang] || entry.ar || entry.en;
    }

    // 3. البحث في اللغة البديلة بالقاموس المحلي
    if (typeof translations !== 'undefined' && translations && translations.en && translations.en[key] !== undefined) {
      return translations.en[key];
    }

    // 4. القيمة البديلة (Fallback) أو المفتاح نفسه
    return fallback !== undefined ? fallback : key;
  }

  /**
   * إنشاء مترجم وقت التشغيل للنصوص البرمجية الديناميكية
   */
  function createRuntimeTranslator(dict) {
    var safeDict = dict || {};
    return function tRuntime(key, vars, fallback) {
      var replacements = vars;
      var defaultText = fallback;
      if (replacements == null) replacements = {};
      if (typeof replacements === 'string') {
        defaultText = replacements;
        replacements = {};
      }
      var lang = getCurrentLang();
      var entry = safeDict[key] || COMMON_DICTIONARY[key];
      var template = (entry && (entry[lang] || entry.ar || entry.en)) || defaultText || key;
      return String(template).replace(/\{(\w+)\}/g, function (_, name) {
        return replacements[name] != null ? replacements[name] : '';
      });
    };
  }

  /**
   * تطبيق الترجمات على كامل مستند DOM
   */
  function applyUnifiedTranslations(lang) {
    if (!lang) lang = getCurrentLang();
    if (SUPPORTED.indexOf(lang) === -1) lang = 'ar';

    function setTextPreservingIcons(el, text) {
      if (!el || text === null || typeof text === 'undefined') return;
      var hasIcon = el.querySelector('i, svg');
      if (hasIcon) {
        var textNode = null;
        for (var i = 0; i < el.childNodes.length; i++) {
          if (el.childNodes[i].nodeType === 3 && el.childNodes[i].nodeValue.trim().length > 0) {
            textNode = el.childNodes[i];
            break;
          }
        }
        if (textNode) {
          textNode.nodeValue = ' ' + text;
        } else {
          var spanChild = el.querySelector('span:not(.badge):not(.pos-badge)');
          if (spanChild) {
            spanChild.textContent = text;
          } else {
            el.appendChild(document.createTextNode(' ' + text));
          }
        }
      } else {
        el.textContent = text;
      }
    }

    // ── 1. سمات data-en / data-ar / data-fr المباشرة ──
    document.querySelectorAll('[data-' + lang + ']').forEach(function (el) {
      var v = el.getAttribute('data-' + lang);
      if (v !== null) setTextPreservingIcons(el, v);
    });

    document.querySelectorAll('[data-' + lang + '-placeholder]').forEach(function (el) {
      var v = el.getAttribute('data-' + lang + '-placeholder');
      if (v !== null) el.setAttribute('placeholder', v);
    });

    document.querySelectorAll('[data-' + lang + '-title]').forEach(function (el) {
      var v = el.getAttribute('data-' + lang + '-title');
      if (v !== null) el.setAttribute('title', v);
    });

    // ── 2. سمات data-i18n القياسية الحديثة ──
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (!key) return;
      var val = tr(key);
      if (val && val !== key) setTextPreservingIcons(el, val);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (!key) return;
      var val = tr(key);
      if (val && val !== key) el.setAttribute('placeholder', val);
    });

    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-title');
      if (!key) return;
      var val = tr(key);
      if (val && val !== key) el.setAttribute('title', val);
    });

    // ── 3. سمات data-key القديمة للتوافق الخلفي ──
    document.querySelectorAll('[data-key]').forEach(function (el) {
      var key = el.getAttribute('data-key');
      if (!key) return;
      var val = tr(key);
      if (val && val !== key) setTextPreservingIcons(el, val);
    });

    document.querySelectorAll('[data-placeholder-key]').forEach(function (el) {
      var key = el.getAttribute('data-placeholder-key');
      if (!key) return;
      var val = tr(key);
      if (val && val !== key) el.setAttribute('placeholder', val);
    });

    document.querySelectorAll('[data-title-key]').forEach(function (el) {
      var key = el.getAttribute('data-title-key');
      if (!key) return;
      var val = tr(key);
      if (val && val !== key) el.setAttribute('title', val);
    });

    // ── 4. نصوص القائمة الجانبية .menu-text ──
    document.querySelectorAll('.menu-text').forEach(function (el) {
      if (lang === 'ar' && el.hasAttribute('data-ar')) {
        el.textContent = el.getAttribute('data-ar');
      } else if (lang === 'fr' && el.hasAttribute('data-fr')) {
        el.textContent = el.getAttribute('data-fr');
      } else if (el.hasAttribute('data-en')) {
        el.textContent = el.getAttribute('data-en');
      }
    });

    // ── 5. سمات الوصول ARIA ──
    document.querySelectorAll('[data-' + lang + '-aria-label]').forEach(function (el) {
      var v = el.getAttribute('data-' + lang + '-aria-label');
      if (v !== null) el.setAttribute('aria-label', v);
    });

    // ── 6. تطبيق الاتجاه RTL / LTR والخطوط ──
    var html = document.documentElement;
    var body = document.body;
    if (lang === 'ar') {
      if (html) { html.setAttribute('dir', 'rtl'); html.setAttribute('lang', 'ar'); }
      if (body) body.classList.add('rtl');
    } else {
      if (html) { html.setAttribute('dir', 'ltr'); html.setAttribute('lang', lang); }
      if (body) body.classList.remove('rtl');
    }

    // ── 7. تحديث مؤشرات واختيار اللغة في القوائم العلوية ──
    var names = { en: 'English', ar: 'العربية', fr: 'Français' };
    document.querySelectorAll('#current-lang, .current-lang-text').forEach(function (el) {
      el.textContent = names[lang] || names.en;
    });

    document.querySelectorAll('#headerLanguageSelect, #headerLanguageSwitcher').forEach(function (sel) {
      if (sel && sel.value !== lang) sel.value = lang;
    });

    // ── 8. استدعاء دوال إعادة الترجمة الخاصة بالصفحة الحالية إن وُجدت ──
    if (typeof window.loadLanguage === 'function') {
      try { window.loadLanguage(); } catch (e) {}
    } else if (typeof window.applyTranslations === 'function' && window.applyTranslations !== applyUnifiedTranslations) {
      try { window.applyTranslations(lang); } catch (e) {}
    } else if (typeof window.changeLanguage === 'function') {
      try { window.changeLanguage(lang); } catch (e) {}
    }

    // ── 9. إخطار كافة المستمعين المسجلين (Listeners) ──
    _listeners.forEach(function (cb) {
      try { cb(lang); } catch (e) { console.warn('[i18n] Listener error:', e); }
    });

    // ── 10. إطلاق الحدث الموحد عبر المستند ──
    try {
      document.dispatchEvent(new CustomEvent('layoutLanguageChanged', { detail: { language: lang } }));
    } catch (e) {}
  }

  /**
   * تهيئة النظام عند تحميل الصفحة
   */
  function init() {
    var lang = getCurrentLang();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        applyUnifiedTranslations(lang);
      });
    } else {
      applyUnifiedTranslations(lang);
    }

    // الاستماع لتغييرات اللغة عبر التبويبات (Cross-tab)
    window.addEventListener('storage', function (e) {
      if (e.key === 'preferred-language' && e.newValue && e.newValue !== _currentLang) {
        applyUnifiedTranslations(e.newValue);
      }
    });

    // الاستماع للحدث الداخلي zeraldaStoreChange
    document.addEventListener('zeraldaStoreChange', function (e) {
      try {
        var keys = (e && e.detail && Array.isArray(e.detail.keys)) ? e.detail.keys : [];
        if (keys.indexOf('preferred-language') !== -1 || keys.indexOf('zeralda-settings') !== -1) {
          applyUnifiedTranslations(getCurrentLang());
        }
      } catch (_) {}
    });
  }

  // ── تصدير واجهة برمجة التطبيقات API ──
  window.UnifiedI18N = {
    getCurrentLang: getCurrentLang,
    setCurrentLang: setCurrentLang,
    applyTranslations: applyUnifiedTranslations,
    tr: tr,
    onLanguageChange: onLanguageChange,
    init: init,
    supported: SUPPORTED,
    dictionary: COMMON_DICTIONARY
  };

  window.COMMON_DICTIONARY = COMMON_DICTIONARY;
  window.trUnified = tr;
  window.applyUnifiedTranslations = applyUnifiedTranslations;
  window.createRuntimeTranslator = createRuntimeTranslator;

  init();
})();
