/**
 * Zeralda ERP — IndexedDB Storage Engine (zeralda_db.js)
 * محرك تخزين يعتمد على IndexedDB فقط مع write-through cache.
 *
 * المزايا:
 * - سعة 50MB+ (بدلاً من 5MB)
 * - قراءة متزامنة من الذاكرة (sync reads from cache)
 * - كتابة غير متزامنة لـ IndexedDB (async writes, no UI blocking)
 * - API متوافق (getItem/setItem/removeItem)
 */
(function () {
    'use strict';

    var DB_NAME = 'zeralda_erp';
    var STORE_NAME = 'kv_store';
    // FIX: IndexedDB schema version with migration support.
    // DB_VERSION is the current schema version. When the schema changes,
    // increment this number and add a migration block in onupgradeneeded.
    // The version history is tracked so oldVersion-based migrations work.
    var DB_VERSION = 2;
    var _db = null;
    var _cache = {}; // write-through cache for sync reads
    var _ready = false;
    var _pendingWrites = [];
    var _initPromise = null;
    var _cacheReadyPromise = null; // resolves when _cache is fully loaded from IndexedDB
    var _dbError = null; // خطأ فتح IndexedDB (إن وجد)
    var _emergencyMode = false; // وضع الطوارئ: IndexedDB غير متاح، استخدم cookies
    var _writeRetryCount = 0; // عدد إعادة محاولات الكتابة الفاشلة

    function _openDB() {
        if (_initPromise) return _initPromise;
        _initPromise = new Promise(function (resolve, reject) {
            try {
                var request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = function (event) {
                    var db = event.target.result;
                    var oldVersion = event.oldVersion;
                    var tx = event.transaction;
                    // FIX: proper schema migration with version tracking.
                    // Each migration block runs only if the DB is older than
                    // the target version. This allows incremental upgrades.
                    //
                    // Version history:
                    //   v1: initial schema — single kv_store object store
                    //   v2: (current) — no schema change, but ensures
                    //       existing DBs are upgraded cleanly. Future
                    //       migrations (indexes, new stores) go here.
                    if (oldVersion < 1) {
                        // Fresh DB or pre-versioning — create the store
                        if (!db.objectStoreNames.contains(STORE_NAME)) {
                            db.createObjectStore(STORE_NAME);
                        }
                    }
                    if (oldVersion < 2) {
                        // v2 migration: ensure the store exists (handles
                        // edge case where DB was created without versioning)
                        if (!db.objectStoreNames.contains(STORE_NAME)) {
                            db.createObjectStore(STORE_NAME);
                        }
                        // Future: add indexes here, e.g.:
                        // if (tx) {
                        //     var store = tx.objectStore(STORE_NAME);
                        //     if (!store.indexNames.contains('by_updated')) {
                        //         store.createIndex('by_updated', 'updatedAt');
                        //     }
                        // }
                    }
                    // Add future migrations here:
                    // if (oldVersion < 3) { ... }
                };
                request.onsuccess = function (event) {
                    _db = event.target.result;
                    _db.onerror = function (e) { console.warn('[ZDB] DB error:', e); };
                    _ready = true;
                    _flushPendingWrites();
                    // Resolve immediately — don't wait for cache to load.
                    // Auth tokens are in cookies (synchronous fallback).
                    // Other data will be loaded lazily via getItem() or
                    // populated by the background cache load below.
                    resolve();
                    // Load cache in the background (non-blocking).
                    // This warms the cache for subsequent sync reads.
                    // Store the promise so cacheReady() can await it.
                    _cacheReadyPromise = _loadAllIntoCache().then(function () {
                        // Cache loaded — invalidate keys cache
                        _keysCache = null;
                    }).catch(function (err) {
                        console.warn('[ZDB] Background cache load warning:', err);
                    });
                };
                request.onerror = function (event) {
                    console.error('[ZDB] Failed to open IndexedDB:', event.target.error);
                    // إصلاح: لا تعين _ready=true عند الفشل — استخدم وضع الطوارئ
                    _dbError = event.target.error;
                    _emergencyMode = true;
                    _ready = true; // اسمح للقراءة من cookies
                    resolve();
                };
            } catch (e) {
                console.error('[ZDB] IndexedDB not available:', e);
                // إصلاح: وضع الطوارئ بدلاً من التجاهل
                _dbError = e;
                _emergencyMode = true;
                _ready = true;
                resolve();
            }
        });
        return _initPromise;
    }

    function _loadAllIntoCache() {
        return new Promise(function (resolve, reject) {
            if (!_db) { resolve(); return; }
            try {
                var tx = _db.transaction(STORE_NAME, 'readonly');
                var store = tx.objectStore(STORE_NAME);
                var cursorReq = store.openCursor();
                var count = 0;
                cursorReq.onsuccess = function (event) {
                    var cursor = event.target.result;
                    if (cursor) {
                        _cache[cursor.key] = cursor.value;
                        count++;
                        cursor.continue();
                    } else {
                        console.log('[ZDB] Loaded', count, 'keys into cache');
                        resolve();
                    }
                };
                cursorReq.onerror = function () { reject(cursorReq.error); };
            } catch (e) { reject(e); }
        });
    }

    // ── Batched write queue (reduces IndexedDB transaction contention) ──
    var _writeBatch = [];
    var _writeBatchTimer = null;
    var _writeBatchDelay = 50; // 50ms — batch writes within this window
    var _activeWritePromises = []; // promises for in-flight transactions

    function _flushWriteBatch() {
        _writeBatchTimer = null;
        if (!_db || _writeBatch.length === 0) return;
        var batch = _writeBatch;
        _writeBatch = [];
        // إصلاح: سجّل batchStartTime + increment batchId للـ WAL
        var batchStartTime = Date.now();
        // FIX: capture the batch ID that was ALREADY used to tag this batch's
        // WAL entries (via _walLog at setItem-time) BEFORE bumping the
        // counter. The previous code bumped first and used the NEW id as the
        // cleanup threshold — which also matched entries logged during the
        // async gap between batch-collection and tx.oncomplete (i.e. entries
        // belonging to the NEXT batch, not yet written to IndexedDB). A crash
        // in that window would silently lose those entries from the WAL.
        var currentBatchId = _walBatchId;
        _nextWALBatchId(); // bump for future writes — they belong to the next batch
        try {
            // Use a SINGLE readwrite transaction for all writes in the batch
            var tx = _db.transaction(STORE_NAME, 'readwrite');
            var store = tx.objectStore(STORE_NAME);
            for (var i = 0; i < batch.length; i++) {
                var task = batch[i];
                if (task.value === null || task.value === undefined) {
                    store.delete(task.key);
                } else {
                    store.put(task.value, task.key);
                }
            }
            // Resolve promises ONLY when the transaction actually completes.
            // This is critical: callers like flush() need to know the data is
            // durable in IndexedDB before reloading the page.
            var txPromise = new Promise(function (resolve, reject) {
                tx.oncomplete = function () {
                    _writeRetryCount = 0; // إعادة تعيين عداد الإعادة
                    // إصلاح: مسح WAL الانتقائي — فقط الإدخالات بهذا الـ batchId أو أقدم
                    // هذا يمنع مسح إدخالات كتابات جديدة حدثت أثناء الـ transaction
                    _clearWALBefore(batchStartTime, currentBatchId);
                    for (var j = 0; j < batch.length; j++) { batch[j].resolve(); }
                    resolve();
                };
                tx.onerror = function () {
                    console.warn('[ZDB] Batch write tx error:', tx.error);
                    // إصلاح: معالجة quota exceeded
                    if (_isQuotaError(tx.error)) {
                        _handleQuotaExceeded(tx.error, batch[0] && batch[0].key);
                    } else {
                        // إصلاح: إعادة محاولة الـ batch الفاشل (حتى 3 مرات)
                        _retryBatchWrite(batch, tx.error);
                    }
                    for (var j = 0; j < batch.length; j++) { batch[j].reject(tx.error); }
                    reject(tx.error);
                };
                tx.onabort = function () {
                    console.warn('[ZDB] Batch write tx aborted');
                    _retryBatchWrite(batch, new Error('aborted'));
                    for (var j = 0; j < batch.length; j++) { batch[j].reject(new Error('aborted')); }
                    reject(new Error('aborted'));
                };
            });
            _activeWritePromises.push(txPromise);
            // Clean up after completion
            txPromise.then(function () {
                var idx = _activeWritePromises.indexOf(txPromise);
                if (idx >= 0) _activeWritePromises.splice(idx, 1);
            }).catch(function () {
                var idx = _activeWritePromises.indexOf(txPromise);
                if (idx >= 0) _activeWritePromises.splice(idx, 1);
            });
        } catch (e) {
            console.warn('[ZDB] Batch write failed:', e);
            // إصلاح: إعادة محاولة الـ batch الفاشل
            _retryBatchWrite(batch, e);
            // Fallback: reject all promises
            for (var j = 0; j < batch.length; j++) { batch[j].reject(e); }
        }
    }

    // إصلاح: إعادة محاولة الكتابة الفاشلة مع تأخير تصاعدي
    function _retryBatchWrite(batch, error) {
        if (_writeRetryCount >= 3) {
            console.error('[ZDB] Batch write failed after 3 retries, data may be lost:', error);
            // إشعار المستخدم
            try {
                if (typeof window !== 'undefined' && window.dispatchEvent) {
                    window.dispatchEvent(new CustomEvent('zdb-write-failed', { detail: { error: error, batchLength: batch.length } }));
                }
            } catch (_) {}
            return;
        }
        _writeRetryCount++;
        var delay = 200 * _writeRetryCount; // 200ms, 400ms, 600ms
        console.warn('[ZDB] Retrying batch write in ' + delay + 'ms (attempt ' + _writeRetryCount + '/3)');
        setTimeout(function () {
            for (var i = 0; i < batch.length; i++) {
                _writeBatch.push(batch[i]);
            }
            if (!_writeBatchTimer) {
                _writeBatchTimer = setTimeout(_flushWriteBatch, _writeBatchDelay);
            }
        }, delay);
    }

    function _writeToDB(key, value) {
        if (!_db) return Promise.resolve();
        return new Promise(function (resolve, reject) {
            // Add to batch and schedule flush
            _writeBatch.push({ key: key, value: value, resolve: resolve, reject: reject });
            if (!_writeBatchTimer) {
                _writeBatchTimer = setTimeout(_flushWriteBatch, _writeBatchDelay);
            }
        });
    }

    function _flushPendingWrites() {
        while (_pendingWrites.length > 0) {
            var task = _pendingWrites.shift();
            _writeToDB(task.key, task.value).catch(function (e) {
                console.warn('[ZDB] Pending write failed:', task.key, e);
            });
        }
    }

    function _queueWrite(key, value) {
        if (!_ready) {
            _pendingWrites.push({ key: key, value: value });
            return;
        }
        _writeToDB(key, value).catch(function (e) {
            console.warn('[ZDB] Write failed:', key, e);
        });
    }

    // ── Cookie helpers (for keys that must survive page navigation) ──
    // Some keys must be available synchronously on the next page load,
    // BEFORE IndexedDB cache is populated (which happens async in the
    // background). Cookies are synchronous and survive navigation, so we
    // use them as a fallback for these critical keys.
    //
    // Without this, changing the language → reload → loadLanguage() reads
    // ZS.getItem('preferred-language') → ZDB cache empty (not loaded yet)
    // → returns null → page renders in English instead of the chosen lang.
    var SYNC_COOKIE_KEYS = [
        'zeralda-auth-token',
        'zeralda-session-token',
        'zeralda-auth-meta',
        'preferred-language',      // MUST be sync — read in window.onload
        'zeralda-active-company',  // company context for scoped reads
        'system-currency',         // currency symbol in headers
        'zeralda-theme',           // theme must apply before first paint
        'date-format',             // date format in headers/tables
        'time-format',             // time format in headers/tables
        'logo-size',               // logo size in header
        'zeralda-settings'         // settings (companies, currency, etc.) —
                                   // only stored in cookie if small enough
                                   // (MAX_COOKIE_VALUE_BYTES guard skips large values)
    ];

    function _isSyncKey(key) {
        for (var i = 0; i < SYNC_COOKIE_KEYS.length; i++) {
            if (key === SYNC_COOKIE_KEYS[i]) return true;
        }
        return false;
    }

    // Backward-compat alias (app_sync.js references _isAuthKey in comments)
    function _isAuthKey(key) { return _isSyncKey(key); }

    function _readCookie(name) {
        try {
            var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
            return match ? decodeURIComponent(match[1]) : null;
        } catch (_) { return null; }
    }

    // Max cookie size ~4KB. We use 3500 bytes as a safe limit to leave room
    // for the cookie name, attributes, and other cookies on the same domain.
    // If a sync-critical key exceeds this, we skip the cookie write (the value
    // is still in IndexedDB cache) and log a warning so the developer knows
    // that key won't survive synchronous cross-page navigation.
    var MAX_COOKIE_VALUE_BYTES = 3500;

    function _writeCookie(name, value, days) {
        try {
            var strValue = String(value);
            // Size guard: skip cookies that would exceed the browser limit.
            // The value remains in the IndexedDB cache; only the sync-on-reload
            // fallback is lost for this specific (oversized) key.
            if (strValue.length > MAX_COOKIE_VALUE_BYTES) {
                console.warn('[ZDB] Cookie value too large for key', name,
                    '(' + strValue.length + ' chars > ' + MAX_COOKIE_VALUE_BYTES + ') — skipping cookie write');
                return;
            }
            var expires = '';
            if (days) {
                var d = new Date();
                d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
                expires = '; expires=' + d.toUTCString();
            }
            // SameSite=Strict prevents CSRF — cookie is NOT sent on cross-site
            // requests (top-level navigations or subresource requests).
            document.cookie = name + '=' + encodeURIComponent(strValue) + expires + '; path=/; SameSite=Strict';
        } catch (_) {}
    }

    function _deleteCookie(name) {
        try {
            document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict';
        } catch (_) {}
    }

    // ── Public API ──

    /**
     * Get item synchronously from cache (or cookie for sync-critical keys).
     * Returns string or null.
     */
    function getItem(key) {
        // FIX: إذا كان ZS (الخادم) متاحاً، اقرأ منه أولاً
        if (window.ZS && window.ZS.getItem && window.ZS !== window.ZDB) {
            try {
                var sv = window.ZS.getItem(key);
                if (sv !== null && sv !== undefined) return sv;
            } catch(_) {}
        }
        var val = _cache[key];
        if (val !== undefined && val !== null) {
            if (typeof val === 'string') return val;
            try { return JSON.stringify(val); } catch (e) { return String(val); }
        }
        // Cache miss — for sync-critical keys, try cookie (synchronous)
        if (_isSyncKey(key)) {
            var cookieVal = _readCookie(key);
            if (cookieVal !== null) {
                // Warm the cache
                _cache[key] = cookieVal;
                return cookieVal;
            }
        }
        return null;
    }

    /**
     * Set item: writes to cache (sync) + IndexedDB (async).
     * For sync-critical keys, also writes to cookie (sync, survives navigation).
     */
    function setItem(key, value) {
        _cache[key] = value;
        _keysCache = null; // Invalidate keys cache
        // FIX: إذا كان ZS (الخادم) متاحاً، اكتب فيه أيضاً
        if (window.ZS && window.ZS.setItem && window.ZS !== window.ZDB) {
            try { window.ZS.setItem(key, value); } catch(_) {}
        }
        // إصلاح: Write-ahead log — سجل الكتابة قبل تنفيذها
        _walLog(key, value);
        _queueWrite(key, value);
        // إصلاح: BroadcastChannel — أبلغ التبويبات الأخرى
        _broadcastWrite(key, value);
        // Sync-critical keys: also write to cookie so they survive page reload
        if (_isSyncKey(key) && value !== null && value !== undefined) {
            _writeCookie(key, String(value), 7); // 7 days
        }
    }

    /**
     * Remove item from cache + IndexedDB + cookie.
     */
    function removeItem(key) {
        delete _cache[key];
        _keysCache = null; // Invalidate keys cache
        // FIX: إذا كان ZS (الخادم) متاحاً، احذف منه أيضاً
        if (window.ZS && window.ZS.removeItem && window.ZS !== window.ZDB) {
            try { window.ZS.removeItem(key); } catch(_) {}
        }
        _queueWrite(key, null);
        // إصلاح: BroadcastChannel — أبلغ التبويبات الأخرى
        _broadcastRemove(key);
        if (_isSyncKey(key)) {
            _deleteCookie(key);
        }
    }

    // ── Keys cache (avoids O(n²) when iterating keys) ──
    var _keysCache = null;
    var _keysCacheTime = 0;
    var KEYS_CACHE_TTL = 200; // 200ms — short TTL for consistency

    /**
     * Get all keys from cache (with short TTL to avoid O(n²) in loops).
     */
    function keys() {
        var now = Date.now();
        if (_keysCache && (now - _keysCacheTime) < KEYS_CACHE_TTL) {
            return _keysCache;
        }
        // FIX: إذا كان ZS متاحاً، استخدم مفاتيحه
        if (window.ZS && window.ZS.keys && window.ZS !== window.ZDB) {
            try {
                var zsKeys = window.ZS.keys();
                if (zsKeys && zsKeys.length > 0) {
                    _keysCache = zsKeys;
                    _keysCacheTime = now;
                    return _keysCache;
                }
            } catch(_) {}
        }
        _keysCache = Object.keys(_cache);
        _keysCacheTime = now;
        return _keysCache;
    }

    /**
     * Get cache key count (fast — no array allocation).
     */
    function getLength() {
        // Use cached keys array if available, otherwise count directly
        if (_keysCache && (Date.now() - _keysCacheTime) < KEYS_CACHE_TTL) {
            return _keysCache.length;
        }
        var n = 0;
        for (var k in _cache) {
            if (_cache.hasOwnProperty(k)) n++;
        }
        return n;
    }

    /**
     * Check if key exists in cache.
     */
    function hasItem(key) {
        if (_cache.hasOwnProperty(key) && _cache[key] !== undefined && _cache[key] !== null) return true;
        // FIX: تحقق من ZS
        if (window.ZS && window.ZS.hasItem && window.ZS !== window.ZDB) {
            try { return window.ZS.hasItem(key); } catch(_) {}
        }
        return false;
    }

    /**
     * Clear all data from IndexedDB + cache + sync cookies.
     * This is the nuclear option — used by factory reset and SSE clear-all.
     * All SYNC_COOKIE_KEYS cookies are deleted so that settings, company data,
     * and auth tokens don't survive a factory reset via cookie fallback.
     */
    function clear() {
        _cache = {};
        if (_db) {
            try {
                var tx = _db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).clear();
            } catch (e) {
                console.warn('[ZDB] Clear failed:', e);
            }
        }
        // Delete ALL sync cookies so data doesn't survive via cookie fallback.
        // Without this, getItem('zeralda-settings') would find the old cookie
        // after a factory reset and restore the old companies list.
        for (var i = 0; i < SYNC_COOKIE_KEYS.length; i++) {
            _deleteCookie(SYNC_COOKIE_KEYS[i]);
        }
        // Clear the WAL so pending writes don't replay old data after reset.
        _clearWAL();
        // Broadcast clear-all to other tabs so they also wipe their data.
        if (_broadcastChannel) {
            try {
                _broadcastChannel.postMessage({ type: 'clear-all', tabId: _tabId });
            } catch (_) {}
        }
    }

    /**
     * Get storage usage estimate.
     */
    function getUsage() {
        if (navigator.storage && navigator.storage.estimate) {
            return navigator.storage.estimate().then(function (est) {
                return {
                    usage: est.usage || 0,
                    quota: est.quota || 0,
                    cacheKeys: Object.keys(_cache).length,
                    indexedDB: true
                };
            });
        }
        return Promise.resolve({
            usage: 0,
            quota: 0,
            cacheKeys: Object.keys(_cache).length,
            indexedDB: !!_db
        });
    }

    /**
     * Wait for IndexedDB to be ready (DB open, writes accepted).
     * NOTE: This resolves BEFORE the cache is fully loaded. For reading
     * data that must be in the cache (e.g. zeralda-settings after a page
     * refresh), use cacheReady() instead.
     */
    function ready() {
        return _initPromise || _openDB();
    }

    /**
     * Wait for the in-memory cache to be fully loaded from IndexedDB.
     * This is critical after a page refresh: ready() resolves as soon as
     * the DB is open, but the cache (used for synchronous getItem() reads)
     * is populated asynchronously in the background. Without waiting for
     * cacheReady(), getItem('zeralda-settings') returns null after refresh
     * because the cache is still empty.
     */
    function cacheReady() {
        if (_cacheReadyPromise) return _cacheReadyPromise;
        // If _openDB hasn't been called yet, call it then wait for cache
        return _openDB().then(function () {
            return _cacheReadyPromise || Promise.resolve();
        });
    }

    /**
     * Check if ZDB is ready (DB open, writes accepted).
     */
    function isReady() {
        return _ready;
    }

    /**
     * Get cache size in bytes (approximate).
     */
    function getCacheSize() {
        var total = 0;
        for (var k in _cache) {
            if (_cache.hasOwnProperty(k)) {
                var v = _cache[k];
                total += (k.length + (typeof v === 'string' ? v.length : JSON.stringify(v || '').length)) * 2;
            }
        }
        return total;
    }

    function getCacheKeys() {
        return _cache;
    }

    function getBackend() {
        return 'indexeddb';
    }

    // Flush: force-flush the batch immediately and wait for ALL pending
    // IndexedDB transactions to actually complete (durable write).
    // This is critical before a location.reload() — without it, the async
    // IndexedDB write may not complete before the page unloads and the data
    // is lost.
    function flush() {
        return _initPromise.then(function () {
            // Force-flush any queued writes immediately (don't wait for the
            // 50ms batch timer).
            if (_writeBatchTimer) {
                clearTimeout(_writeBatchTimer);
                _writeBatchTimer = null;
            }
            _flushWriteBatch();

            // Wait for all in-flight transactions to complete.
            var pending = _activeWritePromises.slice();
            if (pending.length === 0) return Promise.resolve();
            return Promise.allSettled
                ? Promise.allSettled(pending).then(function () {})
                : Promise.all(pending.map(function (p) {
                    return p.then(function () {}, function () {});
                  })).then(function () {});
        });
    }

    // isLargeKey: all keys are treated equally in IndexedDB (no size limit)
    function isLargeKey() { return false; }

    // ═══════════════════════════════════════════════════════════════
    // إصلاح جذري: Write-Ahead Log (WAL) — سجل الكتابات قبل تنفيذها
    // إذا تعطل المتصفح قبل اكتمال الكتابة لـ IndexedDB، يمكن استرجاع
    // الكتابات المعلقة من WAL عند إعادة التشغيل.
    // ═══════════════════════════════════════════════════════════════
    var WAL_STORE = 'wal_store';
    var _walDB = null;
    var _walReady = false;

    function _initWAL() {
        try {
            var req = indexedDB.open('zeralda_wal', 1);
            req.onupgradeneeded = function (event) {
                var db = event.target.result;
                if (!db.objectStoreNames.contains(WAL_STORE)) {
                    db.createObjectStore(WAL_STORE, { keyPath: 'id', autoIncrement: true });
                }
            };
            req.onsuccess = function (event) {
                _walDB = event.target.result;
                _walReady = true;
                // استرجاع الكتابات المعلقة من التعطل السابق
                _replayWAL();
            };
            req.onerror = function () {
                console.warn('[ZDB] WAL init failed (non-critical)');
            };
        } catch (e) {
            console.warn('[ZDB] WAL not available:', e);
        }
    }

    // إصلاح: per-batch ID للـ WAL — أدق من timestamp proxy
    var _walBatchId = 0;
    function _nextWALBatchId() { return ++_walBatchId; }

    function _walLog(key, value) {
        if (!_walReady || !_walDB) return;
        try {
            var tx = _walDB.transaction(WAL_STORE, 'readwrite');
            var store = tx.objectStore(WAL_STORE);
            store.add({
                key: key,
                value: typeof value === 'string' ? value : JSON.stringify(value),
                timestamp: Date.now(),
                batchId: _walBatchId // ربط بإصدار الـ batch الحالي
            });
            // تنظيف WAL بعد اكتمال الكتابة (في _flushWriteBatch oncomplete)
        } catch (_) {}
    }

    function _replayWAL() {
        if (!_walReady || !_walDB) return;
        try {
            var tx = _walDB.transaction(WAL_STORE, 'readonly');
            var store = tx.objectStore(WAL_STORE);
            var req = store.getAll();
            req.onsuccess = function (event) {
                var entries = event.target.result || [];
                if (entries.length === 0) return;
                // FIX P0: validate WAL entries before replay to prevent
                // corruption from tampered or malformed data.
                if (entries.length > 10000) {
                    console.warn('[ZDB] Suspiciously large WAL, skipping replay:', entries.length);
                    _clearWAL();
                    return;
                }
                console.log('[ZDB] WAL recovery: replaying', entries.length, 'pending writes');
                entries.forEach(function (entry) {
                    if (!entry || typeof entry !== 'object') return;
                    if (typeof entry.key !== 'string' || !entry.key) return;
                    if (entry.value === undefined) return;
                    // Validate value is serializable
                    try { JSON.stringify(entry.value); } catch (e) { return; }
                    _cache[entry.key] = entry.value;
                    _writeToDB(entry.key, entry.value);
                });
                // مسح WAL بعد استرجاع كل الكتابات
                _clearWAL();
            };
        } catch (_) {}
    }

    function _clearWAL() {
        if (!_walReady || !_walDB) return;
        try {
            var tx = _walDB.transaction(WAL_STORE, 'readwrite');
            tx.objectStore(WAL_STORE).clear();
        } catch (_) {}
    }

    // إصلاح: مسح WAL الانتقائي — فقط الإدخالات الأقدم من cutoffTime
    // أو بـ batchId أقل من currentBatchId (أدق من timestamp وحده)
    function _clearWALBefore(cutoffTime, currentBatchId) {
        if (!_walReady || !_walDB) return;
        try {
            var tx = _walDB.transaction(WAL_STORE, 'readwrite');
            var store = tx.objectStore(WAL_STORE);
            // استخدم cursor لحذف الإدخالات القديمة فقط
            var cursorReq = store.openCursor();
            cursorReq.onsuccess = function (event) {
                var cursor = event.target.result;
                if (cursor) {
                    var entry = cursor.value;
                    // احذف إذا: timestamp أقدم OR batchId أقل (للإدخالات القديمة)
                    var shouldDelete = false;
                    if (entry) {
                        if (currentBatchId !== undefined && entry.batchId !== undefined) {
                            // إصلاح: استخدم batchId إذا متاح (أدق)
                            shouldDelete = entry.batchId <= currentBatchId;
                        } else if (entry.timestamp) {
                            // Fallback: استخدم timestamp
                            shouldDelete = entry.timestamp <= cutoffTime;
                        }
                    }
                    if (shouldDelete) {
                        cursor.delete();
                    }
                    cursor.continue();
                }
            };
        } catch (_) {}
    }

    // مسح WAL بعد اكتمال batch write بنجاح
    var _originalOnComplete = null;
    // سنربط _clearWAL بـ oncomplete في _flushWriteBatch

    // ═══════════════════════════════════════════════════════════════
    // إصلاح جذري: معالجة QuotaExceededError
    // ═══════════════════════════════════════════════════════════════
    function _isQuotaError(error) {
        if (!error) return false;
        var name = error.name || '';
        var msg = error.message || '';
        return name === 'QuotaExceededError' ||
               name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
               msg.indexOf('quota') !== -1 ||
               msg.indexOf('QUOTA') !== -1;
    }

    function _handleQuotaExceeded(error, key) {
        console.error('[ZDB] Storage quota exceeded! Key:', key, 'Error:', error);
        // إشعار المستخدم
        try {
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('zdb-quota-exceeded', {
                    detail: { key: key, error: error, cacheSize: getCacheSize() }
                }));
            }
        } catch (_) {}
        // محاولة تنظيف البيانات القديمة
        _emergencyCleanup();
    }

    function _emergencyCleanup() {
        // حذف النسخ الاحتياطية القديمة والبيانات غير الحرجة
        var cleanupKeys = [];
        for (var k in _cache) {
            if (!_cache.hasOwnProperty(k)) continue;
            // لا تحذف المفاتيح الحرجة
            if (_isSyncKey(k)) continue;
            // احذف مفاتيح النسخ الاحتياطية والسجلات
            if (k.indexOf('backup') !== -1 || k.indexOf('audit-log') !== -1 ||
                k.indexOf('history') !== -1 || k.indexOf('snapshot') !== -1) {
                cleanupKeys.push(k);
            }
        }
        console.warn('[ZDB] Emergency cleanup: removing', cleanupKeys.length, 'non-critical keys');
        // إصلاح: احذف مباشرة من cache + IndexedDB بدون استدعاء removeItem()
        // لمنع cascade writes التي قد تفشل مرة أخرى بـ quota error
        cleanupKeys.forEach(function (k) {
            delete _cache[k];
            // حذف مباشر من IndexedDB (بدون batch queue)
            if (_db) {
                try {
                    var tx = _db.transaction(STORE_NAME, 'readwrite');
                    tx.objectStore(STORE_NAME).delete(k);
                } catch (_) {}
            }
            // إصلاح: لا تستدعي _broadcastRemove — تجنب cascade
        });
        _keysCache = null;
    }

    // ═══════════════════════════════════════════════════════════════
    // إصلاح جذري: BroadcastChannel للتنسيق بين التبويبات
    // يمنع race conditions عندما تكتب عدة تبويبات لنفس المفتاح
    // ═══════════════════════════════════════════════════════════════
    var _broadcastChannel = null;
    var _tabId = 'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    var _remoteWrites = {}; // تتبع الكتابات من تبويبات أخرى

    // إصلاح: دمج الكتابات من تبويبات أخرى بدل last-write-wins
    // BUG #6+#7 fix: use deep merge (not shallow Object.assign) and align
    // strategy with app_sync.js: local wins at leaf level (the local user
    // is actively editing). Remote wins only for keys the local doesn't have.
    function _deepMergeLocalWins(localObj, remoteObj) {
        if (localObj === null || localObj === undefined) return remoteObj;
        if (remoteObj === null || remoteObj === undefined) return localObj;
        if (typeof localObj !== 'object' || typeof remoteObj !== 'object') return localObj;
        if (Array.isArray(localObj) || Array.isArray(remoteObj)) {
            // Arrays: ID-based merge, local wins for overlapping IDs
            if (!Array.isArray(localObj)) return remoteObj;
            if (!Array.isArray(remoteObj)) return localObj;
            var merged = [];
            var seen = {};
            // Remote items first (base), then local overrides
            remoteObj.forEach(function (item) {
                if (item && item.id) { seen[String(item.id)] = item; merged.push(item); }
                else merged.push(item);
            });
            localObj.forEach(function (item) {
                if (item && item.id) {
                    var id = String(item.id);
                    if (seen[id]) {
                        var idx = merged.findIndex(function (m) { return m && m.id === item.id; });
                        if (idx >= 0) merged[idx] = item; // local wins
                        seen[id] = item;
                    } else {
                        seen[id] = item;
                        merged.push(item);
                    }
                } else {
                    var exists = merged.some(function (m) { return JSON.stringify(m) === JSON.stringify(item); });
                    if (!exists) merged.push(item);
                }
            });
            return merged;
        }
        // Objects: deep merge, local wins at leaf level
        var result = {};
        Object.keys(remoteObj).forEach(function (key) { result[key] = remoteObj[key]; });
        Object.keys(localObj).forEach(function (key) {
            var sv = result[key];
            var lv = localObj[key];
            if (typeof sv === 'object' && sv !== null && !Array.isArray(sv) &&
                typeof lv === 'object' && lv !== null && !Array.isArray(lv)) {
                result[key] = _deepMergeLocalWins(lv, sv);
            } else if (Array.isArray(sv) && Array.isArray(lv)) {
                result[key] = _deepMergeLocalWins(lv, sv);
            } else {
                result[key] = lv; // local wins at leaf
            }
        });
        return result;
    }

    function _mergeRemoteWrite(localVal, remoteVal) {
        // إذا إحداهما null، خذ الأخرى
        if (localVal === null || localVal === undefined) return remoteVal;
        if (remoteVal === null || remoteVal === undefined) return localVal;
        // Parse إذا strings
        var localParsed = localVal;
        var remoteParsed = remoteVal;
        if (typeof localVal === 'string') { try { localParsed = JSON.parse(localVal); } catch (_) {} }
        if (typeof remoteVal === 'string') { try { remoteParsed = JSON.parse(remoteVal); } catch (_) {} }
        // BUG #6+#7: deep merge with local-wins strategy (aligned with app_sync.js)
        var merged = _deepMergeLocalWins(localParsed, remoteParsed);
        // Return in the same format as the input (string if input was string)
        if (typeof localVal === 'string' || typeof remoteVal === 'string') {
            try { return JSON.stringify(merged); } catch (_) { return remoteVal; }
        }
        return merged;
    }

    function _initBroadcastChannel() {
        try {
            if (typeof BroadcastChannel === 'undefined') return;
            _broadcastChannel = new BroadcastChannel('zeralda-storage');
            _broadcastChannel.onmessage = function (event) {
                var msg = event.data;
                // FIX P0: validate message structure before processing.
                // BroadcastChannel messages from other tabs could be
                // malformed or malicious — validate before applying.
                if (!msg || typeof msg !== 'object') return;
                if (typeof msg.type !== 'string') return;
                if (msg.tabId === _tabId) return; // تجاهل رسائلي
                if (msg.type === 'write') {
                    // Validate key is a string
                    if (typeof msg.key !== 'string') return;
                    // Validate value is serializable (not circular)
                    try { JSON.stringify(msg.value); } catch (e) { return; }
                    // إصلاح: دمج بدل last-write-wins للكتابات من تبويبات أخرى
                    var localVal = _cache[msg.key];
                    var remoteVal = msg.value;
                    if (localVal !== undefined && localVal !== null && remoteVal !== null) {
                        // حاول دمج القيمتين إذا كلاهما مصفوفات/كائنات
                        var merged = _mergeRemoteWrite(localVal, remoteVal);
                        _cache[msg.key] = merged;
                    } else {
                        _cache[msg.key] = remoteVal;
                    }
                    _keysCache = null;
                    _remoteWrites[msg.key] = Date.now();
                    // إشعار app_sync لإعادة المزامنة
                    try {
                        if (typeof window !== 'undefined' && window.dispatchEvent) {
                            window.dispatchEvent(new CustomEvent('zdb-remote-write', {
                                detail: { key: msg.key, value: _cache[msg.key] }
                            }));
                        }
                    } catch (_) {}
                } else if (msg.type === 'remove') {
                    delete _cache[msg.key];
                    _keysCache = null;
                } else if (msg.type === 'clear-all') {
                    // Another tab triggered a factory reset — wipe local data
                    console.warn('[ZDB] Received clear-all from tab', msg.tabId);
                    _cache = {};
                    _keysCache = null;
                    if (_db) {
                        try {
                            var clearTx = _db.transaction(STORE_NAME, 'readwrite');
                            clearTx.objectStore(STORE_NAME).clear();
                        } catch (_) {}
                    }
                    for (var ci = 0; ci < SYNC_COOKIE_KEYS.length; ci++) {
                        _deleteCookie(SYNC_COOKIE_KEYS[ci]);
                    }
                    _clearWAL();
                    try {
                        if (typeof window !== 'undefined' && window.dispatchEvent) {
                            window.dispatchEvent(new CustomEvent('zdb-clear-all'));
                        }
                    } catch (_) {}
                } else if (msg.type === 'company-changed') {
                    // تبويب آخر غيّر الشركة — حدّث الـ cache
                    // إصلاح: لا نستطيع الوصول لـ _cachedCompanyId (في company_storage.js IIFE)
                    // بدلاً من ذلك، أطلق حدث يستمع له company_storage.js
                    try {
                        if (typeof window !== 'undefined' && window.dispatchEvent) {
                            window.dispatchEvent(new CustomEvent('zdb-remote-company-change'));
                            // إصلاح: أطلق activeCompanyChanged ليُلغى cache في company_storage.js
                            window.dispatchEvent(new CustomEvent('activeCompanyChanged'));
                        }
                    } catch (_) {}
                }
            };
            console.log('[ZDB] BroadcastChannel active, tabId:', _tabId);
        } catch (e) {
            console.warn('[ZDB] BroadcastChannel not available:', e);
        }
        /* FIX: إغلاق BroadcastChannel عند unload لمنع تسرب الذاكرة */
        try {
            if (typeof window !== 'undefined') {
                window.addEventListener('beforeunload', function () {
                    try { if (_broadcastChannel) { _broadcastChannel.close(); _broadcastChannel = null; } } catch (_) {}
                });
            }
        } catch (_) {}
    }

    function _broadcastWrite(key, value) {
        if (!_broadcastChannel) return;
        try {
            _broadcastChannel.postMessage({
                type: 'write',
                tabId: _tabId,
                key: key,
                value: value
            });
        } catch (_) {}
    }

    function _broadcastRemove(key) {
        if (!_broadcastChannel) return;
        try {
            _broadcastChannel.postMessage({
                type: 'remove',
                tabId: _tabId,
                key: key
            });
        } catch (_) {}
    }

    function _broadcastCompanyChange() {
        if (!_broadcastChannel) return;
        try {
            _broadcastChannel.postMessage({
                type: 'company-changed',
                tabId: _tabId
            });
        } catch (_) {}
    }

    // ── Initialize ──
    _openDB().catch(function (e) {
        console.warn('[ZDB] Init failed:', e);
    });
    // إصلاح: تهيئة WAL و BroadcastChannel
    _initWAL();
    _initBroadcastChannel();

    // readyPromise: resolves when ZDB is ready (for compatibility)
    var readyPromise = _initPromise;

    // ── Export ──
    window.ZDB = {
        getItem: getItem,
        setItem: setItem,
        removeItem: removeItem,
        keys: keys,
        getLength: getLength,
        hasItem: hasItem,
        clear: clear,
        getUsage: getUsage,
        ready: ready,
        cacheReady: cacheReady,
        isReady: isReady,
        getCacheSize: getCacheSize,
        getCacheKeys: getCacheKeys,
        getBackend: getBackend,
        flush: flush,
        isLargeKey: isLargeKey,
        readyPromise: readyPromise,
        // إصلاح: APIs جديدة
        broadcastCompanyChange: _broadcastCompanyChange,
        getTabId: function () { return _tabId; },
        isEmergencyMode: function () { return _emergencyMode; },
        getDBError: function () { return _dbError; }
    };

    // Also expose as ZeraldaStorageAdapter for compatibility with app_sync.js
    window.ZeraldaStorageAdapter = window.ZDB;

    /* ════════════════════════════════════════════════════════════════════
       ZS — Zeralda Storage (SERVER-ONLY: in-memory cache + server API)
       لا يعتمد على localStorage ولا IndexedDB إطلاقاً.
       الخادم هو المصدر الوحيد للحقيقة.
       ════════════════════════════════════════════════════════════════════ */
    function _scopeKey(key) {
        if (window.scopedStorageKey) {
            try { return window.scopedStorageKey(key); } catch (_) {}
        }
        return key;
    }

    // ── Server-only storage: in-memory cache + server API ──
    var _memStore = {};  // { scopedKey: value } — populated from server on init
    var _memReady = false;
    var _memReadyPromise = null;
    var _memKeys = [];
    // مفاتيح لا تُرسل للخادم (تُحفظ في cookie + memory فقط)
    var _LOCAL_ONLY_KEYS = ['zeralda-auth-token', 'zeralda-auth-meta', 'zeralda-session-token'];

    function _getServerToken() {
        try {
            // اقرأ من cookie أولاً (يبقى بعد مسح localStorage)
            var m = document.cookie.match(/zeralda-auth-token=([^;]+)/);
            if (m && m[1]) return decodeURIComponent(m[1]);
        } catch(_) {}
        // ثم من الذاكرة
        if (_memStore['zeralda-auth-token']) return _memStore['zeralda-auth-token'];
        // ثم من localStorage
        try {
            var lsToken = localStorage.getItem('zeralda-auth-token') || localStorage.getItem('zeralda-session-token');
            if (lsToken) return lsToken;
        } catch(_) {}
        return '';
    }

    function _buildHeaders(extra) {
        var h = Object.assign({}, extra || {});
        var token = _getServerToken();
        if (token) { h['Authorization'] = 'Bearer ' + token; h['X-Session-Token'] = token; }
        h['X-Requested-With'] = 'XMLHttpRequest';
        return h;
    }

    function _serverApi() {
        var origin = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file:'))
            ? window.location.origin.replace(/\/+$/, '')
            : 'http://127.0.0.1:8080';
        return origin + '/api/store';
    }

    function _isLocalOnly(key) {
        for (var i = 0; i < _LOCAL_ONLY_KEYS.length; i++) {
            if (key === _LOCAL_ONLY_KEYS[i] || key.indexOf(_LOCAL_ONLY_KEYS[i] + '::') === 0) return true;
        }
        return false;
    }

    // تحميل كل البيانات من الخادم إلى الذاكرة (متزامن — sync XHR)
    // الخادم محلي (127.0.0.1) فالتحميل المتزامن فوري (~10ms)
    function _loadFromServerSync() {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', _serverApi(), false);  // false = متزامن
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            var token = _getServerToken();
            if (token) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + token);
                xhr.setRequestHeader('X-Session-Token', token);
            }
            xhr.send();
            if (xhr.status !== 200) {
                console.warn('[ZS] Sync load failed: ' + xhr.status);
                return 0;
            }
            var j = JSON.parse(xhr.responseText);
            if (!j.ok || !j.data || typeof j.data !== 'object') return 0;
            _memStore = {};
            _memKeys = [];
            Object.keys(j.data).forEach(function(key) {
                var val = j.data[key];
                if (typeof val !== 'string') {
                    try { val = JSON.stringify(val); } catch(_) { return; }
                }
                _memStore[key] = val;
                _memKeys.push(key);
                // FIX: عمّر _cache أيضاً حتى ZDB.getItem يجد البيانات
                _cache[key] = val;
            });
            _keysCache = null; // ألغِ تخزين المفاتيح المؤقت
            _memReady = true;
            console.log('[ZS] Sync-loaded ' + _memKeys.length + ' keys from server (cache populated too)');
            return _memKeys.length;
        } catch(e) {
            console.warn('[ZS] Sync load error:', e.message);
            return 0;
        }
    }

    // تحميل كل البيانات من الخادم إلى الذاكرة (غير متزامن — async)
    function _loadFromServer() {
        return fetch(_serverApi(), {
            method: 'GET',
            cache: 'no-store',
            headers: _buildHeaders()
        }).then(function(r) {
            if (!r.ok) {
                var error = new Error('Server returned ' + r.status);
                error.status = r.status;
                throw error;
            }
            return r.json();
        }).then(function(j) {
            if (!j.ok || !j.data || typeof j.data !== 'object') throw new Error('Invalid server response');
            _memStore = {};
            _memKeys = [];
            Object.keys(j.data).forEach(function(key) {
                var val = j.data[key];
                if (typeof val !== 'string') {
                    try { val = JSON.stringify(val); } catch(_) { return; }
                }
                _memStore[key] = val;
                _memKeys.push(key);
                // FIX: عمّر _cache أيضاً حتى ZDB.getItem يجد البيانات
                _cache[key] = val;
            });
            _keysCache = null; // ألغِ تخزين المفاتيح المؤقت
            _memReady = true;
            console.log('[ZS] Async-loaded ' + _memKeys.length + ' keys from server (cache populated too)');
            return _memKeys.length;
        }).catch(function(err) {
            console.warn('[ZS] Failed to load from server:', err.message);
            throw err;
        });
    }

    // ── Resilient Offline Sync Queue & Health Diagnostics ──
    var _offlineServerQueue = {};
    try {
        var _savedOfflineQ = localStorage.getItem('zeralda_server_offline_queue');
        if (_savedOfflineQ) _offlineServerQueue = JSON.parse(_savedOfflineQ) || {};
    } catch(e) {}

    var _lastSyncTime = Date.now();
    var _isFlushingOffline = false;

    function _saveOfflineQueue() {
        try {
            localStorage.setItem('zeralda_server_offline_queue', JSON.stringify(_offlineServerQueue));
        } catch(e) {}
    }

    function _dispatchSyncStatus(state, extra) {
        try {
            var pending = Object.keys(_offlineServerQueue).length;
            var detail = {
                state: state || (pending > 0 ? 'offline' : 'synced'),
                pendingCount: pending,
                lastSync: _lastSyncTime,
                online: navigator.onLine
            };
            if (extra && typeof extra === 'object') {
                for (var k in extra) detail[k] = extra[k];
            }
            window.dispatchEvent(new CustomEvent('zeralda-sync-status', { detail: detail }));
        } catch(e) {}
    }

    function _flushOfflineServerQueue() {
        if (_isFlushingOffline) return;
        var keys = Object.keys(_offlineServerQueue);
        if (!keys.length) return;
        var token = _getServerToken();
        if (!token) return;

        _isFlushingOffline = true;
        _dispatchSyncStatus('syncing', { flushingCount: keys.length });

        var flushed = 0;
        keys.forEach(function(k) {
            try {
                var xhr = new XMLHttpRequest();
                xhr.open('POST', _serverApi(), false);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
                xhr.setRequestHeader('Authorization', 'Bearer ' + token);
                xhr.setRequestHeader('X-Session-Token', token);
                xhr.send(JSON.stringify({ key: k, value: _offlineServerQueue[k] }));
                if (xhr.status === 200) {
                    delete _offlineServerQueue[k];
                    flushed++;
                }
            } catch(e) {}
        });

        _saveOfflineQueue();
        _isFlushingOffline = false;
        _lastSyncTime = Date.now();
        var remaining = Object.keys(_offlineServerQueue).length;
        _dispatchSyncStatus(remaining === 0 ? 'synced' : 'offline', { remaining: remaining, flushed: flushed });
    }

    window.addEventListener('online', function() {
        console.log('[ZS] Network online detected — flushing offline sync queue');
        _flushOfflineServerQueue();
    });
    setInterval(_flushOfflineServerQueue, 20000);

    var _isPageDismissing = false;
    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', function() { _isPageDismissing = true; });
        window.addEventListener('pagehide', function() { _isPageDismissing = true; });
    }

    // إرسال متزامن للخادم (sync XHR — الخادم محلي فالحفظ فوري) مع طابور أوفلاين
    function _pushToServer(key, value) {
        // لا ترسل للخادم إذا لم يكن الـ token متاحاً (مثل صفحة login)
        var token = _getServerToken();
        if (!token) {
            console.log('[ZS] No token — skipping server push for', key);
            return;
        }
        if (!_memReady && key.indexOf('zeralda-license-') !== 0) {
            console.warn('[ZS] BLOCKED write before initial load for', key, '— preventing data loss');
            return;
        }

        var payloadStr = JSON.stringify({ key: key, value: value });

        // If page is dismissing/unloading, modern browsers prohibit synchronous XHR.
        // Use fetch with keepalive: true (W3C standard for background delivery during page dismissal)
        if (_isPageDismissing) {
            try {
                fetch(_serverApi(), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'Authorization': 'Bearer ' + token,
                        'X-Session-Token': token
                    },
                    body: payloadStr,
                    keepalive: true
                }).catch(function() {});
            } catch(e) {}
            return;
        }

        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', _serverApi(), false);  // false = متزامن
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr.setRequestHeader('X-Session-Token', token);
            xhr.send(payloadStr);
            if (xhr.status === 200) {
                if (_offlineServerQueue[key]) {
                    delete _offlineServerQueue[key];
                    _saveOfflineQueue();
                }
                _lastSyncTime = Date.now();
                _dispatchSyncStatus('synced');
            } else {
                if (xhr.status === 401) {
                    console.warn('[ZS] Server token invalid or expired (401). Clearing stale token.');
                    try {
                        document.cookie = "zeralda-auth-token=; path=/; max-age=0";
                        localStorage.removeItem('zeralda-auth-token');
                        localStorage.removeItem('zeralda-session-token');
                        delete _memStore['zeralda-auth-token'];
                        delete _memStore['zeralda-session-token'];
                    } catch(_) {}
                }
                console.warn('[ZS] Server write failed for', key, xhr.status);
                _offlineServerQueue[key] = value;
                _saveOfflineQueue();
                _dispatchSyncStatus('offline', { key: key, status: xhr.status });
            }
        } catch(e) {
            var msg = String(e && e.message || '');
            if (msg.indexOf('page dismissal') !== -1 || msg.indexOf('Synchronous XHR') !== -1) {
                // Browser prohibited sync XHR during page unload — deliver via fetch keepalive
                _isPageDismissing = true;
                try {
                    fetch(_serverApi(), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                            'Authorization': 'Bearer ' + token,
                            'X-Session-Token': token
                        },
                        body: payloadStr,
                        keepalive: true
                    }).catch(function() {});
                } catch(_) {}
            } else {
                console.warn('[ZS] Sync write error for', key, msg);
                _offlineServerQueue[key] = value;
                _saveOfflineQueue();
                _dispatchSyncStatus('offline', { key: key, error: msg });
            }
        }
    }

    // إرسال غير متزامن (fallback)
    

    // حذف متزامن من الخادم
    function _deleteFromServer(key) {
        var token = _getServerToken();
        if (!token) {
            console.log('[ZS] No token — skipping server delete for', key);
            return;
        }
        if (!_memReady && key.indexOf('zeralda-license-') !== 0) {
            console.warn('[ZS] BLOCKED delete before initial load for', key, '— preventing data loss');
            return;
        }

        if (_isPageDismissing) {
            try {
                fetch(_serverApi() + '?key=' + encodeURIComponent(key), {
                    method: 'DELETE',
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'Authorization': 'Bearer ' + token,
                        'X-Session-Token': token
                    },
                    keepalive: true
                }).catch(function() {});
            } catch(e) {}
            return;
        }

        try {
            var xhr = new XMLHttpRequest();
            xhr.open('DELETE', _serverApi() + '?key=' + encodeURIComponent(key), false);
            xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr.setRequestHeader('X-Session-Token', token);
            xhr.send();
            if (xhr.status !== 200) {
                console.warn('[ZS] Server delete failed for', key, xhr.status);
            }
        } catch(e) {
            var delMsg = String(e && e.message || '');
            if (delMsg.indexOf('page dismissal') !== -1 || delMsg.indexOf('Synchronous XHR') !== -1) {
                _isPageDismissing = true;
                try {
                    fetch(_serverApi() + '?key=' + encodeURIComponent(key), {
                        method: 'DELETE',
                        headers: {
                            'X-Requested-With': 'XMLHttpRequest',
                            'Authorization': 'Bearer ' + token,
                            'X-Session-Token': token
                        },
                        keepalive: true
                    }).catch(function() {});
                } catch(_) {}
            } else {
                console.warn('[ZS] Sync delete error for', key, delMsg);
                // fallback async
                try {
                    fetch(_serverApi() + '?key=' + encodeURIComponent(key), {
                        method: 'DELETE',
                        cache: 'no-store',
                        headers: _buildHeaders()
                    }).catch(function() {});
                } catch(_) {}
            }
        }
    }

    // تهيئة — تحميل متزامن فوري (الخادم محلي ~10ms)
    // تخطي التحميل على صفحات login/license/oauth (لا يوجد token بعد)
    var _isLoginPage = /(^|\/)(login|license|oauth_callback|restore_session)\.html/i.test(String(window.location.pathname || ''));

    if (!_isLoginPage && _getServerToken()) {
        _loadFromServerSync();
    }

    if (!_memReady) {
        // فشل التحميل أو لا يوجد token — أعد المحاولة بشكل غير متزامن
        // مع انتظار توفر الـ token (حد أقصى 5 محاولات لتجنب الحلقة اللانهائية)
        _memReadyPromise = new Promise(function(resolve) {
            var _attempt = 0;
            var _maxAttempts = 5;
            var _lastLoadError = null;
            function tryLoad() {
                _attempt++;
                if (_attempt > _maxAttempts) {
                    var shouldRedirectToLogin = !_getServerToken() ||
                        (_lastLoadError && _lastLoadError.status === 401);
                    if (shouldRedirectToLogin) {
                        console.warn('[ZS] Max load attempts reached (' + _maxAttempts + ') — no valid session. Redirecting to login.');
                        // لا تحوّل تلقائياً على صفحات login/restore لتجنب الحلقة
                        if (!_isLoginPage) {
                            try { window.location.href = 'login.html'; } catch(e) {}
                        }
                    } else {
                        console.error('[ZS] Max load attempts reached (' + _maxAttempts + ') — server data unavailable; staying on page.',
                            _lastLoadError && _lastLoadError.message);
                    }
                    resolve(0);
                    return;
                }
                if (_getServerToken()) {
                    _loadFromServer().then(function(n) { resolve(n); }).catch(function(err) {
                        _lastLoadError = err;
                        setTimeout(tryLoad, 2000);
                    });
                } else {
                    // لا يوجد token بعد — انتظر 500ms وأعد المحاولة
                    setTimeout(tryLoad, 500);
                }
            }
            // تأخير قصير لإعطاء وقت لضبط الـ cookie
            setTimeout(tryLoad, _isLoginPage ? 3000 : 500);
        });
    } else {
        _memReadyPromise = Promise.resolve(_memKeys.length);
    }

    if (typeof window !== 'undefined' && !window.safeJSONParse) {
        window.safeJSONParse = function (str, fallback) {
            if (str === null || str === undefined || str === '') return fallback !== undefined ? fallback : null;
            if (typeof str !== 'string') return str;
            try { return JSON.parse(str); } catch (e) { return fallback !== undefined ? fallback : null; }
        };
    }

    window.ZS = {
        getJSON: function (key, fallback) {
            var val = this.getItem(key);
            return window.safeJSONParse(val, fallback);
        },
        getItem: function (key) {
            var sk = _scopeKey(key);
            // الـ token: اقرأ من cookie أولاً ثم localStorage
            if (sk === 'zeralda-auth-token') {
                var m = document.cookie.match(/zeralda-auth-token=([^;]+)/);
                if (m && m[1]) { var t = decodeURIComponent(m[1]); _memStore[sk] = t; return t; }
                try {
                    var lsT = localStorage.getItem('zeralda-auth-token') || localStorage.getItem('zeralda-session-token');
                    if (lsT) { _memStore[sk] = lsT; return lsT; }
                } catch(e) {}
            }
            return _memStore.hasOwnProperty(sk) ? _memStore[sk] : null;
        },
        setItem: function (key, value) {
            var sk = _scopeKey(key);
            // حماية: لا تمسح قائمة الشركات الموجودة بقائمة فارغة
            if (sk === 'zeralda-settings') {
                try {
                    var _newS = JSON.parse(value);
                    var _oldS = _memStore[sk] ? JSON.parse(_memStore[sk]) : null;
                    var _oldHas = _oldS && Array.isArray(_oldS.companies) && _oldS.companies.length > 0;
                    var _newEmpty = !_newS || !Array.isArray(_newS.companies) || _newS.companies.length === 0;
                    if (_oldHas && _newEmpty) {
                        console.warn('[ZS] BLOCKED zeralda-settings write that would erase ' + _oldS.companies.length + ' companies — restoring companies list');
                        _newS.companies = _oldS.companies;
                        if (!_newS.activeCompanyId) _newS.activeCompanyId = _oldS.activeCompanyId;
                        value = JSON.stringify(_newS);
                    }
                } catch(e) {}
            }
            _memStore[sk] = value;
            if (_memKeys.indexOf(sk) === -1) _memKeys.push(sk);
            // الـ token: احفظ في cookie و localStorage
            if (sk === 'zeralda-auth-token' || sk === 'zeralda-session-token') {
                try {
                    localStorage.setItem(sk, value);
                    if (sk === 'zeralda-auth-token') {
                        document.cookie = "zeralda-auth-token=" + encodeURIComponent(value) + "; path=/; max-age=2592000; SameSite=Lax";
                    }
                } catch(e) {}
                return;
            }
            // المفاتيح المحلية فقط: لا ترسل للخادم
            if (_isLocalOnly(sk)) return;
            _pushToServer(sk, value);  // إرسال فوري للخادم
        },
        removeItem: function (key) {
            var sk = _scopeKey(key);
            delete _memStore[sk];
            var idx = _memKeys.indexOf(sk);
            if (idx >= 0) _memKeys.splice(idx, 1);
            // الـ token: احذف من cookie
            if (sk === 'zeralda-auth-token') {
                try { document.cookie = "zeralda-auth-token=; path=/; max-age=0"; } catch(e) {}
                return;
            }
            if (_isLocalOnly(sk)) return;
            _deleteFromServer(sk);  // حذف فوري من الخادم
        },
        clear: function () {
            _memStore = {};
            _memKeys = [];
        },
        key: function (index) {
            return _memKeys[index] || null;
        },
        get length() {
            return _memKeys.length;
        },
        hasItem: function (key) {
            return _memStore.hasOwnProperty(_scopeKey(key));
        },
        keys: function () {
            return _memKeys.slice();
        },
        flush: function () { return Promise.resolve(); },
        ready: function () { return _memReadyPromise; },
        cacheReady: function () { return _memReadyPromise; },
        isReady: function () { return _memReady; },
        getBackend: function () { return 'server'; },
        // إعادة تحميل من الخادم (refresh)
        reloadFromServer: function () { return _loadFromServer(); },
        getSyncHealth: function() {
            return {
                online: navigator.onLine,
                pendingCount: Object.keys(_offlineServerQueue).length,
                lastSync: _lastSyncTime,
                offlineKeys: Object.keys(_offlineServerQueue)
            };
        },
        flushOfflineQueue: function() { return _flushOfflineServerQueue(); }
    };

})();
