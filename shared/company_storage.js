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
    // Priority 5: localStorage fallback
    if (!cid) {
      try {
        var ac3 = localStorage.getItem('zeralda-active-company') || localStorage.getItem('zeralda_last_active_company');
        if (ac3) {
          try { cid = String(JSON.parse(ac3).id || ''); } catch (_) { cid = String(ac3); }
        }
      } catch (_) {}
    }
    if (!cid) cid = 'default-company';
    _cachedCompanyId = cid;
    return cid;
  }

  // إصلاح: تحديث التخزين المؤقت فوراً عند تغيير الشركة
  window.addEventListener('activeCompanyChanged', function (e) {
    if (e && e.detail && e.detail.companyId) {
      _cachedCompanyId = e.detail.companyId;
    } else {
      _cachedCompanyId = null;
    }
  });

  function isScoped(key) {
    return Object.prototype.hasOwnProperty.call(_scopedSet, key);
  }

  function scopedKey(key) {
    if (!isScoped(key)) return key;
    return key + '::' + getActiveCompanyId();
  }

  /* ── Company change: fast transition & reload ──────────────────── */
  window.addEventListener('activeCompanyChanged', function (e) {
    var newCompanyId = (e && e.detail && e.detail.companyId) || getActiveCompanyId();
    _cachedCompanyId = newCompanyId;
    try { localStorage.setItem('zeralda-active-company', newCompanyId); } catch (_) {}
    try { localStorage.setItem('zeralda_last_active_company', newCompanyId); } catch (_) {}

    console.log('[company_storage] Company changed to:', newCompanyId);

    // عرض مؤشر تحميل سريع ومريح للعين
    var overlay = document.createElement('div');
    overlay.id = 'company-switch-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.65);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:center;justify-content:center;color:#fff;font-family:sans-serif;';
    overlay.innerHTML = '<div style="text-align:center;background:rgba(30,41,59,0.95);padding:20px 32px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);"><div style="font-size:17px;margin-bottom:8px;font-weight:600;">⏳ جاري تبديل الشركة...</div><div style="font-size:13px;opacity:0.8;">تحديث البيانات وسياق العمل</div></div>';
    document.body.appendChild(overlay);

    var reloaded = false;
    function doReload() {
      if (reloaded) return;
      reloaded = true;
      clearTimeout(safetyTimer);
      console.log('[company_storage] Reloading page with new company data');
      location.reload();
    }

    // حد أقصى للانتظار: 400 ميلي ثانية حتى لا يتعطل المستخدم
    var safetyTimer = setTimeout(doReload, 400);

    var flushPromise = Promise.resolve();
    if (window.AppSync && typeof window.AppSync.flushPending === 'function') {
      flushPromise = flushPromise.then(function () {
        return window.AppSync.flushPending().catch(function () {});
      });
    }
    if (window.ZDB && typeof window.ZDB.flush === 'function') {
      flushPromise = flushPromise.then(function () {
        return window.ZDB.flush().catch(function () {});
      });
    }

    flushPromise.then(function () {
      doReload();
    }).catch(function () {
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
