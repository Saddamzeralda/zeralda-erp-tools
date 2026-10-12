/**
 * Local File Sync System
 * يحل مشكلة اختلاف قواعد البيانات بين WebView و Chrome
 * يسمح بتصدير واستيراد جميع البيانات عبر ملف JSON محلي
 */

(function() {
  'use strict';

  const FILE_NAME = 'zeralda-erp-full-backup.json';
  const VERSION = '1.0';

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms || 0));
  }

  function chunkObject(obj, maxKeys = 80) {
    const entries = Object.entries(obj || {});
    const chunks = [];
    for (let i = 0; i < entries.length; i += maxKeys) {
      chunks.push(Object.fromEntries(entries.slice(i, i + maxKeys)));
    }
    return chunks;
  }

  async function bulkSyncChunkWithRetry(chunk, headers, maxAttempts = 3) {
    let attempt = 0;
    while (attempt < maxAttempts) {
      attempt += 1;
      try {
        const r = await fetch('/api/store/bulk', {
          method: 'POST',
          headers,
          body: JSON.stringify({ data: chunk })
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.ok) {
          return { ok: true, written: Number(d.written || 0), skipped: Number(d.skipped || 0) };
        }

        const retriable = r.status === 408 || r.status === 429 || r.status >= 500;
        if (!retriable || attempt >= maxAttempts) {
          return { ok: false, error: d.error || ('HTTP ' + r.status) };
        }
      } catch (err) {
        if (attempt >= maxAttempts) {
          return { ok: false, error: err && err.message ? err.message : 'Network error' };
        }
      }
      await sleep(300 * attempt);
    }
    return { ok: false, error: 'Retry budget exhausted' };
  }

  async function fallbackSyncPerKey(chunk, headers) {
    let written = 0;
    let skipped = 0;
    for (const [key, value] of Object.entries(chunk || {})) {
      try {
        const r = await fetch('/api/store', {
          method: 'POST',
          headers,
          body: JSON.stringify({ key, value })
        });
        if (r.ok) written += 1;
        else skipped += 1;
      } catch (_) {
        skipped += 1;
      }
    }
    return { written, skipped };
  }

  /**
   * Get all data from storage (localStorage + IndexedDB)
   */
  async function getAllData() {
    const data = {
      version: VERSION,
      timestamp: new Date().toISOString(),
      origin: window.location.origin,
      userAgent: navigator.userAgent,
      localStorage: {},
      indexedDB: {}
    };

    // Export all localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      data.localStorage[key] = value;
    }

    // Export all IndexedDB if UnifiedStorage is available
    if (window.UnifiedStorage && window.UnifiedStorage.isIndexedDBAvailable()) {
      try {
        const keys = await window.UnifiedStorage.getAllKeys();
        for (const key of keys) {
          const value = await window.UnifiedStorage.getItem(key);
          data.indexedDB[key] = value;
        }
      } catch (err) {
        console.warn('Error exporting IndexedDB:', err);
      }
    }

    return data;
  }

  /**
   * Export all data to JSON file
   */
  async function exportToFile(filename = FILE_NAME) {
    try {
      const data = await getAllData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      return {
        success: true,
        itemCount: Object.keys(data.localStorage).length + Object.keys(data.indexedDB).length,
        sizeKB: (jsonStr.length / 1024).toFixed(2)
      };
    } catch (err) {
      console.error('Export failed:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Import all data from JSON file
   */
  async function importFromFile(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate data structure
      if (!data.version || !data.localStorage) {
        throw new Error('Invalid backup file format');
      }

      let importedCount = 0;

      // Import to localStorage
      if (data.localStorage) {
        for (const [key, value] of Object.entries(data.localStorage)) {
          try {
            localStorage.setItem(key, value);
            importedCount++;
          } catch (err) {
            console.warn(`Failed to import localStorage key: ${key}`, err);
          }
        }
      }

      // Import to IndexedDB via UnifiedStorage
      if (data.indexedDB && window.UnifiedStorage) {
        for (const [key, value] of Object.entries(data.indexedDB)) {
          try {
            // Convert back to string if it's an object
            const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
            await window.UnifiedStorage.setItem(key, stringValue);
            importedCount++;
          } catch (err) {
            console.warn(`Failed to import IndexedDB key: ${key}`, err);
          }
        }
      }

      // Push all restored localStorage to server store for cross-browser sync
      try {
        const token = (window.ZeraldaAuth && window.ZeraldaAuth.getSessionToken())
          || localStorage.getItem('zeralda-auth-token')
          || localStorage.getItem('zeralda-session-token')
          || sessionStorage.getItem('zeralda-auth-token')
          || sessionStorage.getItem('zeralda-session-token')
          || '';
        const headers = window.ZeraldaAuth
          ? window.ZeraldaAuth.buildAuthHeaders({ 'Content-Type': 'application/json' })
          : (function(){ const h={'Content-Type':'application/json'}; if(token){h['Authorization']='Bearer '+token; h['X-Session-Token']=token;} return h; })();
        if (token) {
          const chunks = chunkObject(data.localStorage, 80);
          for (const chunk of chunks) {
            const synced = await bulkSyncChunkWithRetry(chunk, headers, 3);
            if (!synced.ok) {
              await fallbackSyncPerKey(chunk, headers);
            }
          }
        }
      } catch (_) { /* non-fatal — local data already restored */ }

      return {
        success: true,
        importedCount: importedCount,
        timestamp: data.timestamp,
        version: data.version
      };
    } catch (err) {
      console.error('Import failed:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Show file picker and import
   */
  function importFromFilePicker() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) {
          reject(new Error('No file selected'));
          return;
        }

        const result = await importFromFile(file);
        if (result.success) {
          resolve(result);
        } else {
          reject(new Error(result.error));
        }
      };

      input.click();
    });
  }

  /**
   * Compare data between localStorage and IndexedDB
   */
  async function compareStorage() {
    const comparison = {
      localStorageOnly: [],
      indexedDBOnly: [],
      common: [],
      conflicts: []
    };

    const localKeys = Object.keys(localStorage);
    const indexedKeys = window.UnifiedStorage && window.UnifiedStorage.isIndexedDBAvailable()
      ? await window.UnifiedStorage.getAllKeys()
      : [];

    // Find keys only in localStorage
    for (const key of localKeys) {
      if (!indexedKeys.includes(key)) {
        comparison.localStorageOnly.push(key);
      } else {
        comparison.common.push(key);
      }
    }

    // Find keys only in IndexedDB
    for (const key of indexedKeys) {
      if (!localKeys.includes(key)) {
        comparison.indexedDBOnly.push(key);
      }
    }

    // Check for conflicts in common keys
    for (const key of comparison.common) {
      const localValue = localStorage.getItem(key);
      const indexedValue = await window.UnifiedStorage.getItem(key);
      
      if (localValue !== indexedValue) {
        comparison.conflicts.push({
          key: key,
          localValue: localValue,
          indexedValue: indexedValue
        });
      }
    }

    return comparison;
  }

  /**
   * Sync from IndexedDB to localStorage
   */
  async function syncFromIndexedDB() {
    if (!window.UnifiedStorage || !window.UnifiedStorage.isIndexedDBAvailable()) {
      throw new Error('IndexedDB not available');
    }

    let syncedCount = 0;
    const keys = await window.UnifiedStorage.getAllKeys();

    for (const key of keys) {
      try {
        const value = await window.UnifiedStorage.getItem(key);
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, stringValue);
        syncedCount++;
      } catch (err) {
        console.warn(`Failed to sync key: ${key}`, err);
      }
    }

    return { success: true, syncedCount: syncedCount };
  }

  /**
   * Sync from localStorage to IndexedDB
   */
  async function syncToIndexedDB() {
    if (!window.UnifiedStorage) {
      throw new Error('UnifiedStorage not available');
    }

    let syncedCount = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      
      try {
        await window.UnifiedStorage.setItem(key, value);
        syncedCount++;
      } catch (err) {
        console.warn(`Failed to sync key: ${key}`, err);
      }
    }

    return { success: true, syncedCount: syncedCount };
  }

  /**
   * Get sync status
   */
  async function getSyncStatus() {
    const status = {
      localStorage: {
        available: true,
        itemCount: localStorage.length,
        sizeKB: 0
      },
      indexedDB: {
        available: window.UnifiedStorage && window.UnifiedStorage.isIndexedDBAvailable(),
        itemCount: 0,
        sizeKB: 0
      },
      needsSync: false,
      lastSync: localStorage.getItem('zeralda-last-file-sync')
    };

    // Calculate localStorage size
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key);
      status.localStorage.sizeKB += (key.length + value.length) / 1024;
    }
    status.localStorage.sizeKB = status.localStorage.sizeKB.toFixed(2);

    // Get IndexedDB stats
    if (status.indexedDB.available && window.UnifiedStorage) {
      const keys = await window.UnifiedStorage.getAllKeys();
      status.indexedDB.itemCount = keys.length;
    }

    // Check if sync is needed
    const comparison = await compareStorage();
    status.needsSync = comparison.localStorageOnly.length > 0 ||
                       comparison.indexedDBOnly.length > 0 ||
                       comparison.conflicts.length > 0;

    return status;
  }

  /**
   * Export API
   */
  window.LocalFileSync = {
    exportToFile: exportToFile,
    importFromFile: importFromFile,
    importFromFilePicker: importFromFilePicker,
    getAllData: getAllData,
    compareStorage: compareStorage,
    syncFromIndexedDB: syncFromIndexedDB,
    syncToIndexedDB: syncToIndexedDB,
    getSyncStatus: getSyncStatus,
    version: VERSION
  };

  console.log('Local File Sync System initialized');
})();
