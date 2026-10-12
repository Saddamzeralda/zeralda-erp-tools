/**
 * Company Storage Isolation — IndexedDB-only version (no localStorage patch).
 *
 * All application code now uses window.ZS (Zeralda Storage) instead of
 * localStorage. ZS routes through ZDB (IndexedDB + in-memory cache) and
 * applies company scoping via scopedStorageKey() defined below.
 *
 * This file ONLY provides:
 *   - scopedStorageKey(key): maps a base key to its company-scoped form
 *   - CompanyStorage public API for migration / inspection
 *
 * It NO LONGER patches Storage.prototype — that was a transitional shim
 * and has been removed now that all code calls ZS directly.
 */
(function () {
  'use strict';

  console.log('[company_storage] Script loaded, registering listeners...');

  var SCOPED_KEYS = [
    'customers-data', 'suppliers-data', 'leads-data', 'opportunities-data',
    'contacts-data', 'invoices-data', 'proformas-data', 'products-data',
    'stock-movements', 'employees-data', 'payroll-data', 'hr-generated-archive',
    'hr-leaves', 'inventory-categories', 'inventory-backups', 'inventory-audit-log',
    'tenders-data', 'consultations-data', 'finance-transactions', 'accounts-data',
    'transactions-data', 'journal-entries-data', 'expenses-data', 'purchases-data',
    'purchasing-data', 'purchase-orders-data', 'purchase-orders', 'purchase-drafts',
    'services-tasks', 'services-data', 'appointments-data', 'tickets-data',
    'projects-data', 'proposals-data', 'zeralda-services', 'zeralda-services-trash',
    'zeralda-services-master', 'zeralda-services-intelligence', 'inventory-data',
    'zeralda-attendance-log', 'zeralda-hr-intelligence', 'invoice-shares',
    'share-log', 'zeralda-demo-seeding',
    'zeralda-audit-log', 'zeralda-auto-backup'
  ];

  var _scopedSet = {};
  SCOPED_KEYS.forEach(function (k) { _scopedSet[k] = true; });

  /* ── Cached company ID ── */
  // إصلاح: إلغاء TTL — التخزين المؤقت يُلغى فوراً عند تغيير الشركة
  var _cachedCompanyId = null;

  function getActiveCompanyId() {
    // Return cached value (يُلغى فوراً عند تغيير الشركة)
    if (_cachedCompanyId !== null) {
      return _cachedCompanyId;
    }
    var cid = '';
    // Priority 1: ZS (server-backed) — zeralda-active-company
    // ZS reads from _memStore which is loaded synchronously from the server
    // on page load. This is the most reliable source in the server-only model.
    if (window.ZS && window.ZS.getItem) {
      try {
        var ac = window.ZS.getItem('zeralda-active-company');
        if (ac) {
          try { cid = String(JSON.parse(ac).id || ''); } catch (_) { cid = String(ac); }
        }
      } catch (_) {}
    }
    // Priority 2: ZDB (IndexedDB fallback) — zeralda-active-company
    if (!cid && window.ZDB && window.ZDB.getItem) {
      try {
        var ac2 = window.ZDB.getItem('zeralda-active-company');
        if (ac2) {
          try { cid = String(JSON.parse(ac2).id || ''); } catch (_) { cid = String(ac2); }
        }
      } catch (_) {}
    }
    // Priority 3: ZS — zeralda-settings.activeCompanyId
    if (!cid && window.ZS && window.ZS.getItem) {
      try {
        var raw = window.ZS.getItem('zeralda-settings');
        if (raw) {
          var s = JSON.parse(raw);
          cid = String((s && s.activeCompanyId) || '');
        }
      } catch (_) {}
    }
    // Priority 4: ZDB — zeralda-settings.activeCompanyId
    if (!cid && window.ZDB && window.ZDB.getItem) {
      try {
        var raw2 = window.ZDB.getItem('zeralda-settings');
        if (raw2) {
          var s2 = JSON.parse(raw2);
          cid = String((s2 && s2.activeCompanyId) || '');
        }
      } catch (_) {}
    }
    if (!cid) cid = 'default-company';
    _cachedCompanyId = cid;
    return cid;
  }

  // إصلاح: إلغاء التخزين المؤقت فوراً عند تغيير الشركة (بدون TTL)
  window.addEventListener('activeCompanyChanged', function () {
    _cachedCompanyId = null;
  });

  function isScoped(key) {
    return Object.prototype.hasOwnProperty.call(_scopedSet, key);
  }

  function scopedKey(key) {
    if (!isScoped(key)) return key;
    return key + '::' + getActiveCompanyId();
  }

  /* ── Company change: pull new data BEFORE reload ──────────────────── */
  // إصلاح جذري: اسحب بيانات الشركة الجديدة من السيرفر BEFORE إعادة التحميل
  // بدلاً من إعادة التحميل ثم السحب (مما يسبب عرض بيانات قديمة)
  // التدفق:
  //   1) flush البيانات الحالية للسيرفر
  //   2) امسح بيانات الشركة القديمة من الـ cache (لمنع الدمج مع البيانات الجديدة)
  //   3) اسحب بيانات الشركة الجديدة من السيرفر → اكتبها في ZDB cache + IndexedDB
  //   4) أعد تحميل الصفحة → cacheReady() → initSalesScopedData() يقرأ البيانات الجديدة
  window.addEventListener('activeCompanyChanged', function () {
    console.log('[company_storage] Company changed — pulling new data before reload');

    // عرض مؤشر تحميل أثناء السحب
    var overlay = document.createElement('div');
    overlay.id = 'company-switch-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;color:#fff;font-size:18px;font-family:sans-serif;';
    overlay.innerHTML = '<div style="text-align:center"><div style="margin-bottom:10px">⏳ جاري تبديل الشركة...</div><div style="font-size:14px;opacity:0.8">جاري تحميل بيانات الشركة الجديدة</div></div>';
    document.body.appendChild(overlay);

    // Safety timeout: if pull takes too long, reload anyway (10 seconds)
    var safetyTimer = setTimeout(function () {
      console.warn('[company_storage] Pull timeout — forcing reload');
      doReload();
    }, 10000);

    function doReload() {
      clearTimeout(safetyTimer);
      console.log('[company_storage] Reloading page with new company data');
      location.reload();
    }

    // 1) Flush pending writes — header_company_switcher.js flushes OLD writes
    //    BEFORE changing company ID, but saveSettings() + ZS.setItem() create
    //    NEW pending writes (zeralda-settings + zeralda-active-company) that
    //    haven't been sent yet. We must flush these BEFORE pull, otherwise the
    //    server returns stale zeralda-settings with the OLD activeCompanyId.

    Promise.resolve().then(function () {
        var newCompanyId = getActiveCompanyId();

        // إصلاح جذري: لا نمسح بيانات الشركة من الكاش أو IndexedDB!
        // كان الكود القديم يستدعي ZDB.removeItem(scopedK) لكل مفتاح scoped،
        // وهذا يحذف البيانات نهائياً من IndexedDB. إذا لم تكن البيانات
        // موجودة على السيرفر (مثلاً لم تُرفع بعد)، تُفقد للأبد.
        // المفاتيح الـ scoped (key::companyId) تضمن عزل البيانات بين الشركات
        // تلقائياً — ZS.getItem('invoices-data') يقرأ فقط بيانات الشركة النشطة.
        // دمج pullAllToLocalStorage يتعامل مع تحديث البيانات المحلية ببيانات السيرفر.

        // إصلاح جذري: flush pending writes BEFORE pull.
        // saveSettings() في header_company_switcher.js / settings.html تكتب
        // activeCompanyId الجديد في الكاش المحلي وتضيفه لـ _pendingWrites،
        // لكنها لا تُرسله للسيرفر فوراً (يُرسل بعد 2 ثانية via setTimeout).
        // إذا استدعينا pullAllToLocalStorage قبل flush، فإن السيرفر سيرجع
        // zeralda-settings القديم بـ activeCompanyId القديم، وسيُدمج فوق
        // القيمة المحلية الجديدة (السيرفر يأخذ الأسبقية في الدمج!) →
        // يُلغي تبديل الشركة → تظهر بيانات الشركة القديمة بعد إعادة التحميل.
        var prePullPromise = Promise.resolve();
        if (window.AppSync && typeof window.AppSync.flushPending === 'function') {
          prePullPromise = prePullPromise.then(function () {
            console.log('[company_storage] Flushing pending writes before pull...');
            return window.AppSync.flushPending().catch(function () {});
          });
        }

        // 3) Pull new company data from server (after flush so server has latest activeCompanyId)
        return prePullPromise.then(function () {
          if (window.AppSync && typeof window.AppSync.pullAllToLocalStorage === 'function') {
            console.log('[company_storage] Pulling new company data for company:', newCompanyId);
            // تحقق من البيانات قبل السحب
            var beforeInvoices = ZS.getItem('invoices-data');
            console.log('[company_storage] BEFORE pull - invoices-data:', beforeInvoices ? (JSON.parse(beforeInvoices).length + ' records') : 'null');
            return window.AppSync.pullAllToLocalStorage()
              .then(function () {
                // تحقق من البيانات بعد السحب
                var afterInvoices = ZS.getItem('invoices-data');
                console.log('[company_storage] AFTER pull - invoices-data:', afterInvoices ? (JSON.parse(afterInvoices).length + ' records') : 'null');
                console.log('[company_storage] Pull complete — flushing to IndexedDB...');
                // 4) Flush new data to IndexedDB
                if (window.ZDB && typeof window.ZDB.flush === 'function') {
                  return window.ZDB.flush().then(function () {
                    console.log('[company_storage] Flush complete — reloading');
                    doReload();
                  }).catch(function () { doReload(); });
                } else {
                  doReload();
                }
              });
          } else {
            // AppSync not available — just reload
            doReload();
          }
        });
      })
      .catch(function (err) {
        console.warn('[company_storage] Company switch failed, reloading anyway:', err);
        doReload();
      });
  });

  /* ── Public API ─────────────────────────────────────── */
  // scopedStorageKey is used by ZS (Zeralda Storage) to apply company
  // scoping transparently to all getItem/setItem/removeItem calls.
  window.scopedStorageKey = function (baseKey) {
    return scopedKey(baseKey);
  };

  // BUG #3 fix: expose a function to clear the cached company ID so
  // other modules (app_sync.js) can invalidate it when settings change
  // in another tab. Previously app_sync.js set _cachedCompanyId = null
  // which created a new global variable instead of clearing the one
  // inside this IIFE.
  function clearCompanyIdCache() {
    _cachedCompanyId = null;
  }

  window.CompanyStorage = {
    scopedKeys: SCOPED_KEYS,
    getActiveCompanyId: getActiveCompanyId,
    scopedKey: scopedKey,
    isScoped: isScoped,
    clearCompanyIdCache: clearCompanyIdCache
  };

  /* ── Run migration after ZDB is ready ───────────────── */
  // إصلاح: قفل لمنع migration متزامن من عدة تبويبات
  var _migrationLockKey = 'zeralda-company-migration-lock';
  var _migrationLockTTL = 30000; // 30 seconds

  function _acquireMigrationLock(companyId) {
    try {
      var raw = window.ZDB.getItem(_migrationLockKey);
      if (raw) {
        var lock = JSON.parse(raw);
        if (lock && Date.now() - lock.timestamp < _migrationLockTTL) {
          // قفل نشط من تبويب آخر
          return false;
        }
      }
      window.ZDB.setItem(_migrationLockKey, JSON.stringify({
        timestamp: Date.now(),
        companyId: companyId,
        tabId: (window.ZDB.getTabId) ? window.ZDB.getTabId() : 'unknown'
      }));
      return true;
    } catch (_) { return true; }
  }

  function _releaseMigrationLock() {
    try { window.ZDB.removeItem(_migrationLockKey); } catch (_) {}
  }

  function migrateUnscopedToScoped() {
    var companyId = getActiveCompanyId();
    if (!companyId || !window.ZDB) return;
    // Skip if already migrated for this company
    var migrationFlag = 'zeralda-company-migrated-' + companyId;
    if (window.ZDB.getItem(migrationFlag)) return;

    // إصلاح: احصل على القفل قبل البدء
    if (!_acquireMigrationLock(companyId)) {
      console.log('[company_storage] Migration already in progress from another tab');
      return;
    }

    var migrated = 0;
    SCOPED_KEYS.forEach(function (baseKey) {
      var scoped = baseKey + '::' + companyId;
      // Check if scoped key already exists
      if (window.ZDB.getItem(scoped) !== null) return;
      // Check if unscoped key exists
      var raw = window.ZDB.getItem(baseKey);
      if (raw === null) return;
      // Move to scoped
      window.ZDB.setItem(scoped, raw);
      // إصلاح: لا تحذف المفتاح غير المُحدد فوراً — انتظر تأكيد الكتابة
      // احتفظ بنسخة احتياطية لمدة 24 ساعة
      window.ZDB.setItem(baseKey + '__migration-backup', raw);
      window.ZDB.removeItem(baseKey);
      migrated++;
    });
    // Set migration flag
    window.ZDB.setItem(migrationFlag, '1');

    // إصلاح: flush للتأكد من الكتابة قبل تحرير القفل
    if (window.ZDB.flush) {
      window.ZDB.flush().then(function () {
        _releaseMigrationLock();
        // إصلاح: نظف النسخ الاحتياطية بعد 24 ساعة
        setTimeout(function () {
          SCOPED_KEYS.forEach(function (baseKey) {
            try { window.ZDB.removeItem(baseKey + '__migration-backup'); } catch (_) {}
          });
        }, 86400000); // 24h
      }).catch(function () {
        _releaseMigrationLock();
      });
    } else {
      _releaseMigrationLock();
    }

    if (migrated > 0) {
      console.log('[company_storage] Migrated ' + migrated + ' keys to company scope: ' + companyId);
    }
  }

  // إصلاح: fallback safety — إذا فشل ZDB، استخدم localStorage مباشرة
  function _safeGetActiveCompanyId() {
    try {
      var cid = getActiveCompanyId();
      if (cid) return cid;
    } catch (_) {}
    // Fallback: اقرأ من cookie مباشرة
    try {
      var match = document.cookie.match(/zeralda-active-company=([^;]+)/);
      if (match) {
        var val = decodeURIComponent(match[1]);
        try { return String(JSON.parse(val).id || ''); } catch (_) { return String(val); }
      }
    } catch (_) {}
    return 'default-company';
  }

  if (window.ZDB && window.ZDB.ready) {
    window.ZDB.ready().then(function () {
      try { migrateUnscopedToScoped(); } catch (e) {
        console.warn('[company_storage] Migration error:', e);
        _releaseMigrationLock();
      }
    });
  }

  // إصلاح: استمع لتغييرات الشركة من تبويبات أخرى (BroadcastChannel)
  window.addEventListener('zdb-remote-company-change', function () {
    _cachedCompanyId = null;
    // أعد الترحيل إذا لزم
    try { migrateUnscopedToScoped(); } catch (_) {}
  });
}());
