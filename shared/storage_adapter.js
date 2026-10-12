/**
 * Storage Adapter — DISABLED.
 * All storage is now handled by zeralda_db.js (IndexedDB + cache).
 * This file is kept only for backward compatibility — it does NOT
 * override window.ZeraldaStorageAdapter if ZDB is already loaded.
 */
(function () {
  'use strict';

  // Do NOT override ZDB's ZeraldaStorageAdapter
  if (window.ZDB) {
    window.ZeraldaStorageAdapter = window.ZDB;
    return;
  }

  // Fallback stub (only used if ZDB is not loaded — should not happen)
  window.ZeraldaStorageAdapter = {
    isLargeKey: function () { return false; },
    getCacheSize: function () { return 0; },
    getCacheKeys: function () { return {}; },
    flush: function () { return Promise.resolve(); },
    isReady: function () { return false; },
    getBackend: function () { return 'none'; },
    readyPromise: Promise.resolve()
  };
})();
