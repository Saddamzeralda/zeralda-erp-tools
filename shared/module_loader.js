// shared/module_loader.js
// محمّل الوحدات الموحد لـ Zeralda ERP
// يدمج: direct_module_loader, module_loader_optimized, quick_module_loader

(function () {
  'use strict';

  // ── DirectModuleLoader ────────────────────────────────────────
  if (!window.__DirectModuleLoaderInitialized) {
    window.__DirectModuleLoaderInitialized = true;

    const MODULE_REGISTRY = {
      'sales':      'modules/sales/sales_management.html',
      'inventory':  'modules/inventory/inventory_management.html',
      'purchasing': 'modules/purchasing/purchasing_management.html',
      'finance':    'modules/finance/finance_accounting.html',
      'hr':         'modules/hr/hr_management.html',
      'crm':        'modules/crm/crm_management.html',
      'reports':    'modules/reports/reports_analytics.html',
      'services':   'modules/services/services_management.html',
      'consulting': 'modules/consulting/consulting_tenders_management.html',
      // اختصارات
      'inv':  'modules/inventory/inventory_management.html',
      'acc':  'modules/finance/finance_accounting.html',
      'emp':  'modules/hr/hr_management.html',
      'cust': 'modules/crm/crm_management.html'
    };

    const loadedModules   = new Map();
    const loadingPromises = new Map();

    function resolveModulePath(name) {
      const n = String(name || '').toLowerCase().trim();
      if (MODULE_REGISTRY[n]) return MODULE_REGISTRY[n];
      if (n.endsWith('.html')) return n;
      return `modules/${n}/${n}_management.html`;
    }

    function attemptFetch(url, timeout, retries) {
      return new Promise((resolve, reject) => {
        const tid = setTimeout(() => reject(new Error(`Timeout loading ${url} after ${timeout}ms`)), timeout);
        fetch(url)
          .then(res => { clearTimeout(tid); if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`); return res.text(); })
          .then(resolve)
          .catch(err => {
            clearTimeout(tid);
            if (retries > 0) {
              console.warn(`[ModuleLoader] Retrying ${url}... (${retries} left)`);
              setTimeout(() => attemptFetch(url, timeout, retries - 1).then(resolve).catch(reject), 100);
            } else { reject(err); }
          });
      });
    }

    function fetchModule(path, options) {
      const opts = options || {};
      const url = path.startsWith('/') ? path : '/' + path;
      return attemptFetch(url, opts.timeout || 8000, opts.retries !== undefined ? opts.retries : 2);
    }

    function load(moduleName, options) {
      const name = String(moduleName || '').toLowerCase().trim();
      if (loadedModules.has(name)) return Promise.resolve(loadedModules.get(name));
      if (loadingPromises.has(name)) return loadingPromises.get(name);
      const modulePath = resolveModulePath(name);
      const promise = fetchModule(modulePath, options)
        .then(content => { loadedModules.set(name, content); loadingPromises.delete(name); return content; })
        .catch(err => { loadingPromises.delete(name); console.error(`[ModuleLoader] Failed '${name}':`, err); throw err; });
      loadingPromises.set(name, promise);
      return promise;
    }

    function loadMultiple(moduleNames, options) {
      return Promise.allSettled((Array.isArray(moduleNames) ? moduleNames : [moduleNames]).map(n => load(n, options)));
    }

    function loadInto(moduleName, targetSelector, options) {
      const target = typeof targetSelector === 'string' ? document.querySelector(targetSelector) : targetSelector;
      if (!target) return Promise.reject(new Error(`Target not found: ${targetSelector}`));
      return load(moduleName, options).then(content => {
        if (content.includes('<')) { target.innerHTML = content; }
        else { const s = document.createElement('script'); s.textContent = content; target.appendChild(s); }
        target.dispatchEvent(new CustomEvent('moduleLoaded', { detail: { moduleName } }));
        return content;
      });
    }

    function loadWithIndicator(moduleName, targetSelector, options) {
      const target = typeof targetSelector === 'string' ? document.querySelector(targetSelector) : targetSelector;
      if (!target) return Promise.reject(new Error(`Target not found: ${targetSelector}`));
      target.innerHTML = '<div style="text-align:center;padding:20px;color:#666"><i class="fas fa-spinner fa-spin" style="font-size:24px;margin-bottom:10px"></i><p>جاري تحميل الوحدة...</p></div>';
      return loadInto(moduleName, target, options).catch(err => {
        target.innerHTML = `<div style="padding:20px;color:#d32f2f;border:1px solid #d32f2f;border-radius:4px"><p><strong>خطأ في تحميل الوحدة</strong></p><small>${err.message}</small></div>`;
        throw err;
      });
    }

    function getAvailableModules() { return Object.keys(MODULE_REGISTRY); }
    function getLoadStatus() { return { loaded: [...loadedModules.keys()], loading: [...loadingPromises.keys()], available: getAvailableModules() }; }
    function clear(moduleName) { moduleName ? loadedModules.delete(String(moduleName).toLowerCase()) : loadedModules.clear(); }
    function register(name, path) { MODULE_REGISTRY[String(name || '').toLowerCase()] = path; }
    function registerBatch(map) { Object.entries(map || {}).forEach(([n, p]) => register(n, p)); }

    window.DirectModuleLoader = { load, loadMultiple, loadInto, loadWithIndicator, getAvailableModules, getLoadStatus, register, registerBatch, clear, getCacheSize: () => loadedModules.size, getLoadingCount: () => loadingPromises.size };
    window.loadModule  = load;
    window.loadModules = loadMultiple;

    console.log('[ModuleLoader] Ready! Modules: ' + getAvailableModules().join(', '));
  }

  // ── ModuleLoaderOptimized ─────────────────────────────────────
  if (!window.__ModuleLoaderOptimized) {
    window.__ModuleLoaderOptimized = true;

    const CONFIG = { CACHE_EXPIRY_MS: 3600000, PARALLEL_REQUESTS: 3, TIMEOUT_MS: 8000, RETRY_COUNT: 2, SLOW_THRESHOLD_MS: 1000 };
    const moduleCache  = new Map();
    const perfMetrics  = new Map();
    const loadingQueue = [];
    let   activeReqs   = 0;

    function isCached(id) { if (!moduleCache.has(id)) return false; return (Date.now() - moduleCache.get(id).timestamp) < CONFIG.CACHE_EXPIRY_MS; }
    function getCached(id) { return isCached(id) ? Promise.resolve(moduleCache.get(id).content) : null; }
    function setCached(id, content) { moduleCache.set(id, { content, timestamp: Date.now() }); }

    function recordMetric(url, ms) {
      if (!perfMetrics.has(url)) perfMetrics.set(url, { count: 0, total: 0, min: ms, max: ms });
      const m = perfMetrics.get(url); m.count++; m.total += ms; m.min = Math.min(m.min, ms); m.max = Math.max(m.max, ms);
    }

    function fetchOptimized(url, retry) {
      return new Promise((resolve, reject) => {
        const t0 = Date.now();
        const tid = setTimeout(() => reject(new Error(`Timeout ${url}`)), CONFIG.TIMEOUT_MS);
        fetch(url).then(r => { clearTimeout(tid); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); })
          .then(c => { recordMetric(url, Date.now() - t0); if ((Date.now() - t0) > CONFIG.SLOW_THRESHOLD_MS) console.warn(`[ModuleLoader] Slow: ${url}`); resolve(c); })
          .catch(err => {
            clearTimeout(tid);
            if ((retry || 0) < CONFIG.RETRY_COUNT) setTimeout(() => fetchOptimized(url, (retry || 0) + 1).then(resolve).catch(reject), 100 * ((retry || 0) + 1));
            else reject(err);
          });
      });
    }

    function processQueue() {
      while (loadingQueue.length && activeReqs < CONFIG.PARALLEL_REQUESTS) {
        const { id, url, resolve, reject } = loadingQueue.shift(); activeReqs++;
        fetchOptimized(url).then(c => { setCached(id, c); resolve(c); }).catch(reject).finally(() => { activeReqs--; processQueue(); });
      }
    }

    function loadModule(id, url) {
      return new Promise((resolve, reject) => {
        const cached = getCached(id); if (cached) return resolve(cached);
        loadingQueue.push({ id, url, resolve, reject }); processQueue();
      });
    }

    function preloadModules(list) { return Promise.allSettled(list.map(({ id, url }) => loadModule(id, url))); }
    function clearCache() { moduleCache.clear(); perfMetrics.clear(); loadingQueue.length = 0; }
    function getCacheStats() { return { cachedModules: moduleCache.size, queueSize: loadingQueue.length, activeRequests: activeReqs, metrics: [...perfMetrics.entries()].map(([url, m]) => ({ url, average: Math.round(m.total / m.count), min: m.min, max: m.max, count: m.count })) }; }

    window.ModuleLoaderOptimized = { loadModule, preloadModules, clearCache, getCacheStats };
  }

  // ── QuickModuleLoader ─────────────────────────────────────────
  window.QuickModuleLoader = {
    load:    (name, sel) => window.DirectModuleLoader ? DirectModuleLoader.loadWithIndicator(name, sel) : Promise.reject(new Error('DirectModuleLoader not loaded')),
    switch:  (from, to, sel) => window.DirectModuleLoader ? DirectModuleLoader.loadWithIndicator(to, sel) : Promise.reject(new Error('DirectModuleLoader not loaded')),
    preload: (names) => {
      if (!window.DirectModuleLoader) return Promise.reject(new Error('DirectModuleLoader not loaded'));
      return DirectModuleLoader.loadMultiple(names).then(results => {
        const s = { loaded: [], failed: [] };
        results.forEach((r, i) => (r.status === 'fulfilled' ? s.loaded : s.failed).push(names[i]));
        console.log('[ModuleLoader] Preload complete:', s); return s;
      });
    },
    list:   () => window.DirectModuleLoader ? DirectModuleLoader.getAvailableModules() : [],
    status: () => window.DirectModuleLoader ? DirectModuleLoader.getLoadStatus() : { loaded: [], loading: [], available: [] },
    clear:  (name) => { if (window.DirectModuleLoader) { DirectModuleLoader.clear(name); console.log(`Module cache cleared: ${name || 'all'}`); } }
  };

  console.log('[ModuleLoader] QuickModuleLoader ready.');
})();
