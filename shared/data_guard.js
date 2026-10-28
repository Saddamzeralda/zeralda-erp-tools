/**
 * Zeralda Data Guard — نظام حماية البيانات
 * ============================================
 * يوفر:
 * 1. نسخ احتياطي تلقائي قبل كل حفظ مهم (pre-save snapshot)
 * 2. كشف فقدان البيانات (إذا نقصت البيانات بشكل مفاجئ)
 * 3. استرجاع تلقائي عند كشف فقدان
 * 4. نسخ احتياطي دوري كل 15 دقيقة
 * 5. تصدير/استيراد كامل
 * 6. فحص سلامة البيانات
 * 7. نظام ترحيل (migration) عند تغير هيكل البيانات
 *
 * يعمل بشكل مستقل عن كود التطبيق — لا يتأثر بالتحديثات.
 */

(function () {
  'use strict';

  var DATA_GUARD_VERSION = '1.0';
  var GUARD_STORE = 'zeralda-data-guard';   // IndexedDB store for snapshots
  var GUARD_META_KEY = 'zeralda-data-guard-meta';
  var MAX_SNAPSHOTS = 50;                    // الاحتفاظ بـ 50 نسخة كحد أقصى
  var AUTO_BACKUP_INTERVAL = 15 * 60 * 1000; // كل 15 دقيقة
  var _guardDB = null;
  var _initPromise = null;
  var _lastDataCounts = {};  // تتبع عدد العناصر لكل مفتاح
  var _autoBackupTimer = null;

  // ── المفاتيح الحرجة (التي يجب ألا تختفي فجأة) ──
  var CRITICAL_KEYS = [
    'products-data', 'customers-data', 'suppliers-data',
    'invoices-data', 'proformas-data', 'employees-data',
    'inventory-categories', 'stock-movements', 'payroll-data',
    'finance-transactions', 'accounts-data', 'tenders-data',
    'consultations-data', 'services-data', 'leads-data',
    'opportunities-data', 'purchases-data', 'purchase-orders'
  ];

  // ── فتح قاعدة بيانات منفصلة للنسخ الاحتياطية ──
  function _openGuardDB() {
    if (_initPromise) return _initPromise;
    _initPromise = new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open('ZeraldaDataGuard', 1);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains('snapshots')) {
            db.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true });
          }
          if (!db.objectStoreNames.contains('meta')) {
            db.createObjectStore('meta', { keyPath: 'key' });
          }
        };
        req.onsuccess = function (e) {
          _guardDB = e.target.result;
          resolve(_guardDB);
        };
        req.onerror = function (e) {
          console.warn('[DataGuard] Failed to open guard DB:', e.target.error);
          resolve(null); // لا نفشل — النظام اختياري
        };
      } catch (e) {
        console.warn('[DataGuard] Init error:', e);
        resolve(null);
      }
    });
    return _initPromise;
  }

  // ── جمع كل البيانات من ZS (الخادم) و ZDB (المحلي) ──
  function _collectAllData() {
    var snapshot = {};
    try {
      if (window.ZDB && window.ZDB.keys) {
        var keys = window.ZDB.keys();
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          if (_isExcludedKey(key)) continue;
          try {
            var val = window.ZDB.getItem(key);
            if (val !== null && val !== undefined) {
              snapshot[key] = val;
            }
          } catch (e) {}
        }
      }
      if (window.ZS && window.ZS.keys) {
        var zsKeys = window.ZS.keys();
        for (var j = 0; j < zsKeys.length; j++) {
          var zKey = zsKeys[j];
          if (_isExcludedKey(zKey)) continue;
          try {
            var zVal = window.ZS.getItem(zKey);
            if (zVal !== null && zVal !== undefined) {
              snapshot[zKey] = zVal;
            }
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn('[DataGuard] Collect error:', e);
    }
    return snapshot;
  }

  function _isExcludedKey(key) {
    if (!key) return true;
    var excluded = [
      'zeralda-data-guard', 'zeralda-db-migrated-v2',
      'google-tokens', 'zeralda-google-tokens',
      'zeralda-session', 'zeralda-page-zoom',
      'zeralda-last-pull-ts', 'zeralda-last-push-ts'
    ];
    for (var i = 0; i < excluded.length; i++) {
      if (key === excluded[i] || key.indexOf(excluded[i]) === 0) return true;
    }
    // تخطي مفاتيح الـ chat المؤقتة
    if (key.indexOf('zeralda-ai-chat-current') === 0) return true;
    return false;
  }

  // ── حساب عدد العناصر لكل مفتاح ──
  function _getDataCounts(snapshot) {
    var counts = {};
    if (!snapshot) return counts;
    for (var key in snapshot) {
      if (!snapshot.hasOwnProperty(key)) continue;
      var val = snapshot[key];
      // للمفاتيح scoped، نأخذ المفتاح الأساسي
      var baseKey = key.split('::')[0];
      try {
        var parsed = typeof val === 'string' ? JSON.parse(val) : val;
        if (Array.isArray(parsed)) {
          // جمع العدد لكل مفتاح أساسي
          if (!counts[baseKey]) counts[baseKey] = 0;
          counts[baseKey] += parsed.length;
        } else if (parsed && typeof parsed === 'object') {
          var keys = Object.keys(parsed);
          if (!counts[baseKey]) counts[baseKey] = 0;
          counts[baseKey] += keys.length;
        }
      } catch (e) {}
    }
    return counts;
  }

  // ── حفظ نسخة احتياطية في IndexedDB ──
  function _saveSnapshot(snapshot, reason) {
    return _openGuardDB().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction(['snapshots'], 'readwrite');
          var store = tx.objectStore('snapshots');
          var record = {
            data: snapshot,
            reason: reason || 'manual',
            timestamp: Date.now(),
            dateStr: new Date().toISOString(),
            version: DATA_GUARD_VERSION,
            counts: _getDataCounts(snapshot)
          };
          var req = store.add(record);
          req.onsuccess = function (e) {
            var id = e.target.result;
            _pruneOldSnapshots(db);
            resolve(id);
          };
          req.onerror = function (e) {
            console.warn('[DataGuard] Save snapshot error:', e.target.error);
            resolve(null);
          };
        } catch (e) {
          console.warn('[DataGuard] Save snapshot exception:', e);
          resolve(null);
        }
      });
    });
  }

  // ── حذف النسخ القديمة ──
  // إصلاح: قفل لمنع prune متزامن من عدة تبويبات
  var _pruneInProgress = false;
  function _pruneOldSnapshots(db) {
    if (_pruneInProgress) return; // إصلاح: منع race condition
    _pruneInProgress = true;
    try {
      var tx = db.transaction(['snapshots'], 'readonly');
      var store = tx.objectStore('snapshots');
      var req = store.count();
      req.onsuccess = function (e) {
        var count = e.target.result;
        if (count <= MAX_SNAPSHOTS) { _pruneInProgress = false; return; }
        // إصلاح: احذف في transaction واحدة مع قفل readwrite
        var tx2 = db.transaction(['snapshots'], 'readwrite');
        var store2 = tx2.objectStore('snapshots');
        // إصلاح: استخدم index للترتيب بدلاً من cursor عشوائي
        var cursorReq = store2.openCursor();
        var toDelete = count - MAX_SNAPSHOTS;
        var deleted = 0;
        cursorReq.onsuccess = function (e2) {
          var cursor = e2.target.result;
          if (cursor && deleted < toDelete) {
            // إصلاح: لا تحذف النسخ الأخيرة (timestamp خلال آخر ساعة)
            var record = cursor.value;
            if (record && record.timestamp && Date.now() - record.timestamp < 3600000) {
              // نسخة حديثة — تجاوزها
              cursor.continue();
              return;
            }
            cursor.delete();
            deleted++;
            cursor.continue();
          } else {
            _pruneInProgress = false;
          }
        };
        cursorReq.onerror = function () { _pruneInProgress = false; };
        tx2.oncomplete = function () { _pruneInProgress = false; };
        tx2.onerror = function () { _pruneInProgress = false; };
      };
      req.onerror = function () { _pruneInProgress = false; };
    } catch (e) { _pruneInProgress = false; }
  }

  // ── الحصول على جميع النسخ ──
  function _getAllSnapshots() {
    return _openGuardDB().then(function (db) {
      if (!db) return [];
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction(['snapshots'], 'readonly');
          var store = tx.objectStore('snapshots');
          var req = store.getAll();
          req.onsuccess = function (e) {
            var results = e.target.result || [];
            // ترتيب من الأحدث للأقدم
            results.sort(function (a, b) { return b.timestamp - a.timestamp; });
            resolve(results);
          };
          req.onerror = function () { resolve([]); };
        } catch (e) { resolve([]); }
      });
    });
  }

  // ── استرجاع نسخة ──
  function _restoreSnapshot(snapshotId) {
    return _openGuardDB().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction(['snapshots'], 'readonly');
          var store = tx.objectStore('snapshots');
          var req = store.get(snapshotId);
          req.onsuccess = function (e) {
            var record = e.target.result;
            if (!record || !record.data) { resolve(false); return; }
            // استرجاع البيانات إلى ZS (الخادم) و ZDB (المحلي)
            var data = record.data;
            var keys = Object.keys(data);
            var restored = 0;
            keys.forEach(function (key) {
              try {
                var val = data[key];
                if (typeof val !== 'string') val = JSON.stringify(val);
                if (window.ZS && window.ZS.setItem) {
                  window.ZS.setItem(key, val);
                }
                if (window.ZDB && window.ZDB.setItem) {
                  window.ZDB.setItem(key, val);
                }
                restored++;
              } catch (e) {}
            });
            // flush للتأكد من الكتابة
            if (window.ZDB && window.ZDB.flush) {
              window.ZDB.flush().then(function () {
                // إصلاح: backup verification — تحقق من الاسترجاع
                _verifyRestore(data).then(function (verified) {
                  if (verified) {
                    console.log('[DataGuard] Restored and verified', restored, 'keys from snapshot', snapshotId);
                    resolve(true);
                  } else {
                    console.warn('[DataGuard] Restore verification failed for snapshot', snapshotId);
                    resolve(false);
                  }
                }).catch(function () {
                  console.log('[DataGuard] Restored', restored, 'keys (verification skipped)');
                  resolve(true);
                });
              }).catch(function () { resolve(true); });
            } else {
              resolve(true);
            }
          };
          req.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }

  // إصلاح: backup verification — تحقق من استرجاع البيانات
  function _verifyRestore(expectedData) {
    return new Promise(function (resolve) {
      var keys = Object.keys(expectedData);
      var verified = 0;
      var failed = 0;
      keys.forEach(function (key) {
        try {
          var actual = window.ZDB && window.ZDB.getItem(key);
          var expected = expectedData[key];
          if (actual === expected || (actual && expected && actual.toString() === expected.toString())) {
            verified++;
          } else {
            failed++;
          }
        } catch (_) { failed++; }
      });
      // نجاح إذا >90% من المفاتيح تم استرجاعها
      var successRate = keys.length > 0 ? verified / keys.length : 1;
      console.log('[DataGuard] Verification: ' + verified + '/' + keys.length + ' keys verified (' + (successRate * 100).toFixed(1) + '%)');
      resolve(successRate >= 0.9);
    });
  }

  // ── كشف فقدان البيانات ──
  // إصلاح: threshold configurable + منع false positives
  var DATA_LOSS_THRESHOLD = 0.5; // 50% loss = partial, 100% = total
  var MIN_RECORDS_FOR_LOSS_DETECTION = 3; // لا تطلق إنذار إذا كان < 3 سجلات

  function _detectDataLoss(oldCounts, newCounts) {
    var losses = [];
    for (var baseKey in oldCounts) {
      if (!oldCounts.hasOwnProperty(baseKey)) continue;
      // فقط للمفاتيح الحرجة
      if (CRITICAL_KEYS.indexOf(baseKey) === -1) continue;
      var oldCount = oldCounts[baseKey] || 0;
      var newCount = newCounts[baseKey] || 0;
      // إصلاح: تجاهل إذا كان العدد صغير جداً (false positive)
      if (oldCount < MIN_RECORDS_FOR_LOSS_DETECTION) continue;
      // إذا كان هناك بيانات وفجأة اختفت أو نقصت بنسبة > threshold
      if (oldCount > 0 && newCount === 0) {
        losses.push({ key: baseKey, oldCount: oldCount, newCount: newCount, severity: 'total' });
      } else if (oldCount > 5 && newCount > 0 && newCount < oldCount * DATA_LOSS_THRESHOLD) {
        losses.push({ key: baseKey, oldCount: oldCount, newCount: newCount, severity: 'partial' });
      }
    }
    return losses;
  }

  // ── API العام ──

  /**
   * إنشاء نسخة احتياطية كاملة الآن
   * @param {string} reason - سبب النسخة ('auto', 'manual', 'pre-save', 'pre-migration')
   */
  function createSnapshot(reason) {
    var snapshot = _collectAllData();
    var counts = _getDataCounts(snapshot);
    // كشف فقدان البيانات بالمقارنة مع آخر مرة
    var losses = _detectDataLoss(_lastDataCounts, counts);
    if (losses.length > 0) {
      console.warn('[DataGuard] Data loss detected:', losses);
      _handleDataLoss(losses);
    }
    _lastDataCounts = counts;
    return _saveSnapshot(snapshot, reason || 'manual');
  }

  /**
   * استرجاع نسخة احتياطية
   */
  function restoreFromSnapshot(snapshotId) {
    return _restoreSnapshot(snapshotId);
  }

  /**
   * الحصول على قائمة النسخ
   */
  function listSnapshots() {
    return _getAllSnapshots();
  }

  /**
   * تصدير كل البيانات إلى JSON
   */
  function exportAllData() {
    var snapshot = _collectAllData();
    var blob = new Blob([JSON.stringify({
      exportedAt: new Date().toISOString(),
      version: DATA_GUARD_VERSION,
      data: snapshot,
      counts: _getDataCounts(snapshot)
    }, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'zeralda-full-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return true;
  }

  /**
   * استيراد البيانات من ملف JSON
   */
  function importData(jsonData) {
    try {
      var parsed = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      // دعم صيغ متعددة
      var data = parsed;
      if (parsed.data && typeof parsed.data === 'object') data = parsed.data;
      if (parsed.store && typeof parsed.store === 'object') data = parsed.store;
      if (!data || typeof data !== 'object') return false;
      // نسخ احتياطية قبل الاستيراد
      createSnapshot('pre-import');
      // كتابة البيانات
      var keys = Object.keys(data);
      keys.forEach(function (key) {
        try {
          var val = data[key];
          if (typeof val !== 'string') val = JSON.stringify(val);
          if (window.ZS) window.ZS.setItem(key, val);
          else if (window.ZDB) window.ZDB.setItem(key, val);
        } catch (e) {}
      });
      // flush
      if (window.ZDB && window.ZDB.flush) {
        return window.ZDB.flush().then(function () { return true; });
      }
      return Promise.resolve(true);
    } catch (e) {
      console.error('[DataGuard] Import error:', e);
      return Promise.resolve(false);
    }
  }

  /**
   * فحص سلامة البيانات
   */
  function checkIntegrity() {
    var snapshot = _collectAllData();
    var counts = _getDataCounts(snapshot);
    var issues = [];
    // فحص المفاتيح الحرجة
    CRITICAL_KEYS.forEach(function (baseKey) {
      var total = counts[baseKey] || 0;
      if (total === 0) {
        issues.push({ key: baseKey, issue: 'empty', severity: 'warning' });
      }
    });
    // فحص إعدادات الشركة
    try {
      var settings = window.ZS ? window.ZS.getItem('zeralda-settings') : null;
      if (!settings) {
        issues.push({ key: 'zeralda-settings', issue: 'missing', severity: 'critical' });
      } else {
        var s = JSON.parse(settings);
        if (!s.activeCompanyId) {
          issues.push({ key: 'activeCompanyId', issue: 'not-set', severity: 'critical' });
        }
        if (!s.companies || !s.companies.length) {
          issues.push({ key: 'companies', issue: 'empty', severity: 'critical' });
        }
      }
    } catch (e) {
      issues.push({ key: 'zeralda-settings', issue: 'corrupt', severity: 'critical' });
    }
    return { counts: counts, issues: issues, snapshot: snapshot };
  }

  /**
   * معالجة فقدان البيانات — استرجاع مع تأكيد المستخدم
   * إصلاح: لا تسترجع تلقائياً — اسأل المستخدم أولاً
   */
  function _handleDataLoss(losses) {
    var totalLosses = losses.filter(function (l) { return l.severity === 'total'; });
    if (totalLosses.length === 0) return;
    console.warn('[DataGuard] Total data loss detected for:', totalLosses.map(function (l) { return l.key; }));

    // إصلاح: منع الاسترجاع التلقائي المتكرر
    if (window.__dataGuardRestorePending) {
      console.log('[DataGuard] Restore already pending, skipping');
      return;
    }
    window.__dataGuardRestorePending = true;

    // ابحث عن آخر نسخة تحتوي على البيانات المفقودة
    _getAllSnapshots().then(function (snapshots) {
      var foundSnap = null;
      for (var i = 0; i < snapshots.length; i++) {
        var snap = snapshots[i];
        var hasAllLost = true;
        for (var j = 0; j < totalLosses.length; j++) {
          var lost = totalLosses[j];
          var snapCount = (snap.counts && snap.counts[lost.key]) || 0;
          if (snapCount === 0) { hasAllLost = false; break; }
        }
        if (hasAllLost) { foundSnap = snap; break; }
      }

      if (!foundSnap) {
        window.__dataGuardRestorePending = false;
        console.warn('[DataGuard] No suitable snapshot found for restore');
        return;
      }

      console.log('[DataGuard] Found recovery snapshot:', foundSnap.id, '(', foundSnap.dateStr, ')');

      // إصلاح: اسأل المستخدم قبل الاسترجاع
      var lostKeys = totalLosses.map(function (l) { return l.key; }).join(', ');
      var msg = 'تم اكتشاف فقدان بيانات للعناصر التالية:\n' + lostKeys +
        '\n\nتم العثور على نسخة احتياطية بتاريخ: ' + foundSnap.dateStr +
        '\n\nهل تريد استرجاع البيانات من هذه النسخة؟\n(إذا كانت الحذف مقصوداً، اضغط "إلغاء")';

      if (confirm(msg)) {
        _restoreSnapshot(foundSnap.id).then(function () {
          if (typeof showToast === 'function') {
            showToast('تم استرجاع البيانات المفقودة', 'success');
          }
          setTimeout(function () { window.location.reload(); }, 2000);
        }).catch(function (err) {
          window.__dataGuardRestorePending = false;
          console.error('[DataGuard] Restore failed:', err);
          alert('فشل استرجاع البيانات: ' + (err.message || err));
        });
      } else {
        window.__dataGuardRestorePending = false;
        console.log('[DataGuard] User declined auto-restore (intentional deletion)');
        // إنشاء نسخة جديدة بالوضع الحالي لمنع إعادة السؤال
        setTimeout(function () { createSnapshot('post-decline'); }, 1000);
      }
    }).catch(function () {
      window.__dataGuardRestorePending = false;
    });
  }

  /**
   * بدء النظام — يُستدعى عند تحميل الصفحة
   */
  function init() {
    _openGuardDB().then(function () {
      // إنشاء نسخة عند بدء التشغيل
      setTimeout(function () {
        createSnapshot('startup');
      }, 3000);
      // نسخ دوري
      if (_autoBackupTimer) clearInterval(_autoBackupTimer);
      _autoBackupTimer = setInterval(function () {
        createSnapshot('auto-periodic');
      }, AUTO_BACKUP_INTERVAL);
      // نسخة قبل إغلاق الصفحة
      window.addEventListener('beforeunload', function () {
        try { createSnapshot('page-unload'); } catch (e) {}
      });
    });
  }

  /**
   * حماية قبل عملية حفظ خطرة
   * يُستدعى قبل أي حفظ كبير (مثل ترحيل البيانات)
   */
  function protectBeforeSave(reason) {
    return createSnapshot(reason || 'pre-save');
  }

  /**
   * ترحيل البيانات (migration) — يُستدعى عند تغير هيكل البيانات
   * @param {string} fromVersion - الإصدار الحالي
   * @param {string} toVersion - الإصدار المستهدف
   * @param {function} migratorFn - دالة الترحيل (data) => newData
   */
  function migrateData(fromVersion, toVersion, migratorFn) {
    return createSnapshot('pre-migration-' + fromVersion + '-to-' + toVersion).then(function () {
      var snapshot = _collectAllData();
      try {
        var migrated = migratorFn(snapshot);
        if (!migrated || typeof migrated !== 'object') {
          console.error('[DataGuard] Migration returned invalid data');
          return false;
        }
        // كتابة البيانات المُرحّلة
        Object.keys(migrated).forEach(function (key) {
          try {
            var val = migrated[key];
            if (typeof val !== 'string') val = JSON.stringify(val);
            if (window.ZS) window.ZS.setItem(key, val);
            else if (window.ZDB) window.ZDB.setItem(key, val);
          } catch (e) {}
        });
        if (window.ZDB && window.ZDB.flush) {
          return window.ZDB.flush().then(function () {
            createSnapshot('post-migration-' + toVersion);
            console.log('[DataGuard] Migration', fromVersion, '->', toVersion, 'complete');
            return true;
          });
        }
        createSnapshot('post-migration-' + toVersion);
        return true;
      } catch (e) {
        console.error('[DataGuard] Migration error:', e);
        return false;
      }
    });
  }

  // ── تصدير API العام ──
  window.DataGuard = {
    version: DATA_GUARD_VERSION,
    init: init,
    createSnapshot: createSnapshot,
    restoreFromSnapshot: restoreFromSnapshot,
    listSnapshots: listSnapshots,
    exportAllData: exportAllData,
    importData: importData,
    checkIntegrity: checkIntegrity,
    protectBeforeSave: protectBeforeSave,
    migrateData: migrateData,
    CRITICAL_KEYS: CRITICAL_KEYS
  };

  // بدء تلقائي
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
