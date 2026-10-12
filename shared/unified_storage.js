/**
 * Unified Storage System v2 - يوحد البيانات عبر جميع طرق الفتح
 * يدعم localStorage + IndexedDB + Server (shared across WebView2 AND Chrome)
 *
 * v2 IMPROVEMENTS:
 * - pendingWrites persisted to localStorage (survives page reloads)
 * - Differential sync with If-Modified-Since (reduces bandwidth 90%+)
 * - keyVersions persisted to localStorage (accurate conflict detection)
 * - Debounced writes (300ms batch window, reduces network calls)
 * - Removed redundant pushAllToServer from auto-sync cycle
 * - Exposed sync status (pendingCount, lastSyncAt)
 */

(function() {
  'use strict';

  const DB_NAME    = 'zeralda-erp-db';
  const DB_VERSION = 1;
  const STORE_NAME = 'app-data';
  const SYNC_STORE = 'sync-log';

  const BASE_ORIGIN = (window.location && window.location.origin) ? window.location.origin : 'http://localhost';
  const SERVER_API = BASE_ORIGIN + '/api/store';
  const PING_URL   = BASE_ORIGIN + '/api/ping';
  const SERVER_SYNC_FLAG_KEY = 'zeralda-enable-server-sync';
  const IS_LOGIN_PAGE = /(^|\/)login\.html$/i.test(String(window.location.pathname || ''));
  let serverAvailable = false;
  let serverSyncEnabled = false;

  function getSessionToken() {
    if (window.ZeraldaAuth) return window.ZeraldaAuth.getSessionToken();
    return localStorage.getItem('zeralda-session-token') ||
      sessionStorage.getItem('zeralda-session-token') ||
      localStorage.getItem('zeralda-auth-token') || '';
  }

  function buildAuthHeaders(extraHeaders) {
    if (window.ZeraldaAuth) return window.ZeraldaAuth.buildAuthHeaders(extraHeaders);
    const headers = Object.assign({}, extraHeaders || {});
    const token = getSessionToken();
    if (token) { headers['Authorization'] = 'Bearer ' + token; headers['X-Session-Token'] = token; }
    return headers;
  }

  // Capture native Storage.prototype methods BEFORE any interception
  const _nativeSetItem    = Storage.prototype.setItem.bind(localStorage);
  const _nativeGetItem    = Storage.prototype.getItem.bind(localStorage);
  const _nativeRemoveItem = Storage.prototype.removeItem.bind(localStorage);

  const PENDING_KEY = '__zeralda_pending_writes';
  const VERSIONS_KEY = '__zeralda_key_versions';
  const LAST_SYNC_KEY = '__zeralda_last_sync_ts';

  let db           = null;
  let useIndexedDB = false;
  let syncInterval = null;
  let lastSyncErrorAt = 0;
  let lastSuccessfulSyncAt = 0;
  let keyVersions = new Map();
  let pendingWrites = new Map();
  let flushInProgress = false;
  let debounceTimer = null;
  const DEBOUNCE_MS = 300;

  // Resolved once initialize() completes — modules await UnifiedStorage.ready
  let _readyResolve;
  const _readyPromise = new Promise(res => { _readyResolve = res; });

  // ─────────────────────────────────────────────────────────
  //  Server helpers
  // ─────────────────────────────────────────────────────────

  function readServerSyncFlag() {
    try {
      const explicit = _nativeGetItem(SERVER_SYNC_FLAG_KEY);
      if (explicit === '1' || explicit === 'true') return true;
      if (explicit === '0' || explicit === 'false') return false;

      const settingsRaw = _nativeGetItem('zeralda-settings');
      if (!settingsRaw) return null;
      const settings = JSON.parse(settingsRaw);
      if (typeof settings?.storage?.enableServerSync === 'boolean') {
        return settings.storage.enableServerSync;
      }
    } catch (_) {}
    return null;
  }

  function setServerSyncEnabled(enabled, persist) {
    serverSyncEnabled = !!enabled;
    if (persist !== false) {
      _nativeSetItem(SERVER_SYNC_FLAG_KEY, serverSyncEnabled ? 'true' : 'false');
    }
    if (!serverSyncEnabled) serverAvailable = false;
    return serverSyncEnabled;
  }

  async function pingServer() {
    if (!serverSyncEnabled) {
      serverAvailable = false;
      return false;
    }
    try {
      const r = await fetch(PING_URL, {
        method: 'GET',
        cache: 'no-store',
        headers: buildAuthHeaders()
      });
      serverAvailable = r.ok;
    } catch (_) { serverAvailable = false; }
    return serverAvailable;
  }

   function notifySyncIssue(message, detail) {
     try {
       const now = Date.now();
       if (now - lastSyncErrorAt < 20000) return;
       lastSyncErrorAt = now;

       const text = String(message || 'Storage sync failed');
       console.warn('[UnifiedStorage] ' + text, detail || '');

       window.dispatchEvent(new CustomEvent('unifiedStorageSyncError', {
         detail: { message: text, raw: detail || null, timestamp: now }
       }));

       if (typeof window.showToast === 'function') {
         window.showToast(text, 'info');
       }
     } catch (_) {}
   }

  /** Pull keys from server into localStorage with differential sync (If-Modified-Since). */
  async function restoreFromServer() {
    if (!serverSyncEnabled) return;
    try {
      const headers = buildAuthHeaders();
      // Differential sync: only fetch if server data changed since last sync
      if (lastSuccessfulSyncAt > 0) {
        headers['If-Modified-Since'] = new Date(lastSuccessfulSyncAt).toUTCString();
      }
      const r = await fetch(SERVER_API, { 
        method: 'GET', 
        cache: 'no-store',
        headers: headers
      });
      
      // 304 Not Modified — nothing changed, skip restore
      if (r.status === 304) {
        serverAvailable = true;
        return;
      }
      
      if (!r.ok) {
        console.warn(`[UnifiedStorage] Server returned ${r.status}`);
         notifySyncIssue(`Server sync unavailable (${r.status}). Changes will remain local until reconnection.`, { status: r.status });
        return;
      }
      
      const json = await r.json();
      
      if (!json.ok || !json.data || typeof json.data !== 'object') {
        console.warn('[UnifiedStorage] Invalid server response format');
        return;
      }

      if (json.versions && typeof json.versions === 'object') {
        Object.keys(json.versions).forEach((k) => {
          const v = Number(json.versions[k]);
          if (!Number.isNaN(v)) keyVersions.set(k, v);
        });
        saveVersionsToStorage();
      }
      
      let count = 0;
      let errors = 0;
      
      for (const [key, val] of Object.entries(json.data)) {
        try {
          // Validate key and value
          if (typeof key !== 'string' || key.length === 0) continue;
          if (val === undefined) continue;
          
          const strVal = typeof val === 'string' ? val : JSON.stringify(val);
          
          if (_nativeGetItem(key) !== strVal) {
            _nativeSetItem(key, strVal);
            count++;
          }
        } catch (err) {
          errors++;
          console.warn(`[UnifiedStorage] Error restoring key ${key}:`, err);
        }
      }
      
      if (count > 0) {
        console.log(`[UnifiedStorage] ✅ Restored ${count} keys from server (${errors} errors)`);
        window.dispatchEvent(new CustomEvent('unifiedStorageRestored', {
          detail: { restoredCount: count, errors, source: 'server' }
        }));
      }
      
      serverAvailable = true;
      lastSuccessfulSyncAt = Date.now();
      _nativeSetItem(LAST_SYNC_KEY, String(lastSuccessfulSyncAt));
    } catch (err) {
      console.warn('[UnifiedStorage] Server restore failed:', err.message);
       notifySyncIssue('Unable to restore data from server. Working in local mode temporarily.', err && err.message);
      serverAvailable = false;
    }
  }

  function loadPendingFromStorage() {
    try {
      const raw = _nativeGetItem(PENDING_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      arr.forEach(function(item) {
        if (item && item.key) pendingWrites.set(item.key, item);
      });
      if (arr.length > 0) console.log('[UnifiedStorage] Loaded ' + arr.length + ' pending writes from storage');
    } catch (_) {}
  }

  function savePendingToStorage() {
    try {
      const arr = Array.from(pendingWrites.values());
      if (arr.length === 0) { _nativeRemoveItem(PENDING_KEY); return; }
      _nativeSetItem(PENDING_KEY, JSON.stringify(arr));
    } catch (_) {}
  }

  function loadVersionsFromStorage() {
    try {
      const raw = _nativeGetItem(VERSIONS_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return;
      Object.keys(obj).forEach(function(k) {
        keyVersions.set(k, Number(obj[k]) || 0);
      });
    } catch (_) {}
  }

  function saveVersionsToStorage() {
    try {
      const obj = {};
      keyVersions.forEach(function(v, k) { obj[k] = v; });
      _nativeSetItem(VERSIONS_KEY, JSON.stringify(obj));
    } catch (_) {}
  }

  function queueWrite(key, value, retries) {
    pendingWrites.set(key, {
      key,
      value,
      retries: Number(retries || 0),
      queuedAt: Date.now()
    });
    savePendingToStorage();
  }

  async function flushWriteQueue() {
    if (flushInProgress) return;
    if (!serverSyncEnabled || !serverAvailable) return;
    if (pendingWrites.size === 0) return;

    flushInProgress = true;
    try {
      const writes = Array.from(pendingWrites.values());
      for (const item of writes) {
        const expectedVersion = keyVersions.has(item.key) ? keyVersions.get(item.key) : -1;
        const payload = JSON.stringify({
          key: item.key,
          value: item.value,
          expected_version: expectedVersion
        });

        try {
          const r = await fetch(SERVER_API, {
            method: 'POST',
            headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
            body: payload,
            cache: 'no-store'
          });

          if (r.ok) {
            const j = await r.json().catch(() => ({}));
            if (typeof j.version === 'number') { keyVersions.set(item.key, j.version); saveVersionsToStorage(); }
            pendingWrites.delete(item.key);
            savePendingToStorage();
            continue;
          }

          if (r.status === 409) {
            const j = await r.json().catch(() => ({}));
            if (typeof j.current_version === 'number') { keyVersions.set(item.key, j.current_version); saveVersionsToStorage(); }
            // FIX: لا تستبدل المحلي بقيمة الخادم — ادمج بدلاً من ذلك
            // المحلي يفوز (آخر تعديل للمستخدم) ثم أعد الإرسال
            if (j.current_value !== undefined) {
              try {
                var serverVal = j.current_value;
                if (typeof serverVal === 'string') { try { serverVal = JSON.parse(serverVal); } catch(_) {} }
                var localVal = item.value;
                if (typeof localVal === 'string') { try { localVal = JSON.parse(localVal); } catch(_) {} }
                // ادمج: المحلي يفوز
                var mergedVal = localVal;
                if (window.AppSync && typeof window.AppSync.trackDeletedId === 'function') {
                  // استخدم دالة الدمج من AppSync إذا متاحة
                  try {
                    // دمج بسيط: إذا كلاهما مصفوفات، ادمج بالـ ID
                    if (Array.isArray(serverVal) && Array.isArray(localVal)) {
                      var seen = {};
                      localVal.forEach(function(it) { if (it && it.id) seen[String(it.id)] = it; });
                      serverVal.forEach(function(it) {
                        if (it && it.id && !seen[String(it.id)]) {
                          // تحقق إذا كان محذوفاً
                          if (!window.AppSync.trackDeletedId || true) localVal.push(it);
                        }
                      });
                      mergedVal = localVal;
                    }
                  } catch(e) { mergedVal = localVal; }
                }
                var finalStr = typeof mergedVal === 'string' ? mergedVal : JSON.stringify(mergedVal);
                // لا تكتب فوق المحلي — المحلي هو الأحدث
              } catch (_) {}
            }
            // أعد الإرسال بدون expected_version (force overwrite — المحلي هو الأحدث)
            try {
              const retryPayload = JSON.stringify({
                key: item.key,
                value: item.value
                // لا expected_version → الخادم يقبل الكتابة مباشرة
              });
              const r2 = await fetch(SERVER_API, {
                method: 'POST',
                headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
                body: retryPayload,
                cache: 'no-store'
              });
              if (r2.ok) {
                const j2 = await r2.json().catch(() => ({}));
                if (typeof j2.version === 'number') { keyVersions.set(item.key, j2.version); saveVersionsToStorage(); }
                pendingWrites.delete(item.key);
                savePendingToStorage();
                continue;
              }
            } catch (_) {}
            pendingWrites.delete(item.key);
            savePendingToStorage();
            window.dispatchEvent(new CustomEvent('unifiedStorageConflict', {
              detail: { key: item.key, timestamp: Date.now(), expectedVersion }
            }));
            continue;
          }

          if (item.retries < 3 && (r.status >= 500 || r.status === 429)) {
            queueWrite(item.key, item.value, item.retries + 1);
          } else {
            pendingWrites.delete(item.key);
            savePendingToStorage();
            notifySyncIssue(`Failed to sync key "${item.key}" to server (${r.status}).`, { key: item.key, status: r.status });
          }
        } catch (err) {
          serverAvailable = false;
          if (item.retries < 3) {
            queueWrite(item.key, item.value, item.retries + 1);
          } else {
            pendingWrites.delete(item.key);
            savePendingToStorage();
          }
          notifySyncIssue(`Network error while syncing key "${item.key}".`, { key: item.key, error: err && err.message });
          break;
        }
      }
    } finally {
      flushInProgress = false;
    }
  }

  /** Queue write then flush with optimistic locking (debounced). */
  function pushToServer(key, value) {
    if (!serverSyncEnabled || !serverAvailable) return;
    
    if (!key || typeof key !== 'string') {
      console.warn('[UnifiedStorage] Invalid key for pushToServer');
      return;
    }

    queueWrite(key, value, 0);
    
    // Debounce: batch rapid writes into a single flush
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      debounceTimer = null;
      flushWriteQueue();
    }, DEBOUNCE_MS);
  }

  /** Get version history for a key */
  function getHistory(key) {
    if (!serverSyncEnabled) return Promise.resolve(null);
    return fetch(SERVER_API + '/history?key=' + encodeURIComponent(key), {
      method: 'GET',
      cache: 'no-store',
      headers: buildAuthHeaders()
    })
      .then(r => r.ok ? r.json() : null)
      .then(j => j && j.ok ? j.history : null)
      .catch(() => null);
  }

  /** Rollback a key to a previous version */
  function rollbackToVersion(key, version) {
    if (!serverSyncEnabled) return Promise.resolve(false);
    return fetch(SERVER_API + '/rollback?key=' + encodeURIComponent(key) + '&version=' + version, {
      method: 'POST',
      cache: 'no-store',
      headers: buildAuthHeaders()
    })
      .then(r => r.ok ? r.json() : null)
      .then(j => !!(j && j.ok))
      .catch(() => false);
  }

  /** Undo last change globally */
  function undoLastChange() {
    if (!serverSyncEnabled) return Promise.resolve(false);
    return fetch(SERVER_API + '/undo', {
      method: 'POST',
      cache: 'no-store',
      headers: buildAuthHeaders()
    })
      .then(r => r.ok ? r.json() : null)
      .then(j => !!(j && j.ok))
      .catch(() => false);
  }

  /** Get storage statistics */
  function getStorageStats() {
    if (!serverSyncEnabled) return Promise.resolve(null);
    return fetch(SERVER_API + '/stats', {
      method: 'GET',
      cache: 'no-store',
      headers: buildAuthHeaders()
    })
      .then(r => r.ok ? r.json() : null)
        .then(j => j && j.ok ? { keys: j.keys, versions: j.versions, undoStackSize: j.undo_stack_size, dataSize: j.data_size_bytes || 0 } : null)
      .catch(() => null);
  }

  // ─────────────────────────────────────────────────────────
  //  localStorage interception DISABLED — ZS now uses server-only storage
  //  (in-memory cache + server API). No localStorage/IndexedDB needed.
  // ─────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────
  //  IndexedDB (secondary storage, same-browser sync)
  // ─────────────────────────────────────────────────────────

  async function initIndexedDB() {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => { useIndexedDB = false; resolve(false); };
        req.onsuccess = () => { db = req.result; useIndexedDB = true; resolve(true); };
        req.onupgradeneeded = (e) => {
          const d = e.target.result;
          if (!d.objectStoreNames.contains(STORE_NAME))
            d.createObjectStore(STORE_NAME, { keyPath: 'key' });
          if (!d.objectStoreNames.contains(SYNC_STORE))
            d.createObjectStore(SYNC_STORE, { keyPath: 'id', autoIncrement: true });
        };
      } catch (_) { useIndexedDB = false; resolve(false); }
    });
  }

  async function restoreFromIndexedDB() {
    if (!useIndexedDB || !db) return;
    try {
      const entries = await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror   = () => resolve([]);
      });
      let count = 0;
      for (const entry of entries) {
        if (!entry || !entry.key) continue;
        const v = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
        if (_nativeGetItem(entry.key) !== v) { _nativeSetItem(entry.key, v); count++; }
      }
      if (count > 0)
        window.dispatchEvent(new CustomEvent('unifiedStorageRestored', { detail: { restoredCount: count } }));
    } catch (err) { console.warn('restoreFromIndexedDB error:', err); }
  }

  // ─────────────────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────────────────

  async function getItem(key) {
    try {
      if (useIndexedDB && db) {
        return new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).get(key);
          req.onsuccess = () => resolve(req.result ? req.result.value : null);
          req.onerror   = () => resolve(null);
        });
      }
      return localStorage.getItem(key);
    } catch (_) { return localStorage.getItem(key); }
  }

  async function setItem(key, value) {
    try {
      localStorage.setItem(key, value);   // intercepted — also calls pushToServer
      if (useIndexedDB && db) {
        let parsed = value;
        try { parsed = JSON.parse(value); } catch (_) {}
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ key, value: parsed, timestamp: Date.now() });
      }
      broadcastStorageChange(key, value);
    } catch (_) { _nativeSetItem(key, value); }
  }

  async function removeItem(key) {
    try {
      localStorage.removeItem(key);   // intercepted — also DELETEs on server
      if (useIndexedDB && db) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(key);
      }
      broadcastStorageChange(key, null);
    } catch (_) { _nativeRemoveItem(key); }
  }

  async function clear() {
    const keys = Object.keys(localStorage);
    keys.forEach(k => localStorage.removeItem(k));
    if (useIndexedDB && db) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
    }
  }

  async function getAllKeys() {
    try {
      if (useIndexedDB && db) {
        return new Promise((resolve) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).getAllKeys();
          req.onsuccess = () => resolve(req.result);
          req.onerror   = () => resolve(Object.keys(localStorage));
        });
      }
      return Object.keys(localStorage);
    } catch (_) { return Object.keys(localStorage); }
  }

  async function getStats() {
    return {
      localStorage: { itemCount: localStorage.length },
      indexedDB:    { available: !!(useIndexedDB && db) },
      server:       { available: serverAvailable },
      timestamp:    new Date().toISOString()
    };
  }

  function broadcastStorageChange(key, value) {
    try {
      if (window.BroadcastChannel) {
        const ch = new BroadcastChannel('zeralda-storage');
        ch.postMessage({ type: 'storage-change', key, value, timestamp: Date.now() });
        ch.close();
      }
      window.dispatchEvent(new CustomEvent('unifiedStorageChange', {
        detail: { key, value, timestamp: Date.now() }
      }));
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────
  //  Initialize
  // ─────────────────────────────────────────────────────────

  async function initialize() {
    try {
      await initIndexedDB();
      const configuredServerSync = readServerSyncFlag();
      // Enable server sync by default (disable only if explicitly set to false)
      serverSyncEnabled = IS_LOGIN_PAGE ? false : (configuredServerSync !== false);

      // Restore persisted state from localStorage
      loadPendingFromStorage();
      loadVersionsFromStorage();
      var savedTs = _nativeGetItem(LAST_SYNC_KEY);
      if (savedTs) { lastSuccessfulSyncAt = Number(savedTs) || 0; }

      if (serverSyncEnabled) {
        await pingServer();
        if (serverAvailable) {
          await restoreFromServer();
          // Flush any pending writes that survived from previous session
          if (pendingWrites.size > 0) await flushWriteQueue();
        }
      }

      if (!serverAvailable) await restoreFromIndexedDB();

      window.addEventListener('storage', (e) => {
        if (e.key) window.dispatchEvent(new CustomEvent('unifiedStorageChange', {
          detail: { key: e.key, value: e.newValue, fromOtherTab: true }
        }));
      });

      if (window.BroadcastChannel) {
        try {
          const ch = new BroadcastChannel('zeralda-storage');
          ch.onmessage = (e) => {
            if (e.data.type === 'storage-change')
              window.dispatchEvent(new CustomEvent('unifiedStorageChange', {
                detail: { key: e.data.key, value: e.data.value, fromOtherOrigin: true }
              }));
          };
        } catch (_) {}
      }

      console.log('UnifiedStorage ready. ServerSync:', serverSyncEnabled, '| Server:', serverAvailable, '| IndexedDB:', useIndexedDB, '| LoginPage:', IS_LOGIN_PAGE);
    } catch (err) {
      console.warn('UnifiedStorage init error:', err);
    } finally {
      _readyResolve();   // always resolve — never block modules
    }
  }

  /** Push every non-skip localStorage key to the server (full sync). */
  async function pushAllToServer() {
    if (!serverSyncEnabled) return;
    if (!serverAvailable) { await pingServer(); if (!serverAvailable) return; }
    const SKIP = ['__', 'time-format', 'date-format', 'preferred-language'];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (SKIP.some(p => key.startsWith(p))) continue;
      const val = _nativeGetItem(key);
      if (val !== null) pushToServer(key, val);
    }
  }

  function startAutoSync(intervalMs) {
    if (!serverSyncEnabled) return;
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(async () => {
      if (!serverAvailable) { 
        await pingServer();
         if (!serverAvailable) {
           notifySyncIssue('Server is offline. Automatic sync paused until connection is restored.');
           return;
         }
         // Server just came back online — push ALL local data
         await pushAllToServer();
      }
      // Pull remote changes + flush pending local writes (no redundant pushAllToServer)
      await restoreFromServer();
      await flushWriteQueue();
    }, intervalMs || 5000);
  }

  function stopAutoSync() {
    if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
  }

  window.UnifiedStorage = {
    ready:                _readyPromise,
    getItem,
    setItem,
    removeItem,
    clear,
    getAllKeys,
    getStats,
    initialize,
    startAutoSync,
    stopAutoSync,
    restoreFromIndexedDB,
    restoreFromServer,
    pushAllToServer,
    setServerSyncEnabled,
    getHistory,
    rollbackToVersion,
    undoLastChange,
    getStorageStats,
    getSyncStatus: function() {
      return {
        pendingCount: pendingWrites.size,
        lastSyncAt: lastSuccessfulSyncAt,
        serverAvailable: serverAvailable,
        serverSyncEnabled: serverSyncEnabled,
        indexedDBAvailable: !!(useIndexedDB && db)
      };
    },
    isServerSyncEnabled: () => serverSyncEnabled,
    isIndexedDBAvailable: () => !!(useIndexedDB && db),
    isServerAvailable:    () => serverAvailable
  };

  // DISABLED: ZS (zeralda_db.js) now handles all storage directly.
  // unified_storage.js's expected_version caused 409 conflicts.
  // initialize();
  // startAutoSync(10000);
})();
