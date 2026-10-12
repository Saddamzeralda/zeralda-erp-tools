/**
 * Zeralda ERP - Performance Diagnostics & Monitor (v2026-02-27)
 * Real-time monitoring of module loading and page performance
 * 
 * Usage: Include in any page to track performance issues
 * <script src="shared/performance_monitor.js"></script>
 */

(function() {
  'use strict';

  if (window.__PerformanceMonitorActive) return;
  window.__PerformanceMonitorActive = true;

  const metrics = {
    navigationStart: window.performance ? window.performance.timing.navigationStart : 0,
    modulesLoaded: [],
    apiCalls: [],
    slowOperations: [],
    errors: []
  };

  const CONFIG = {
    SLOW_OPERATION_THRESHOLD_MS: 500,
    SLOW_API_THRESHOLD_MS: 1000,
    MAX_METRICS_STORED: 100
  };

  /**
   * Track module loads (when ModuleLoaderOptimized is used)
   */
  function trackModuleLoad(moduleName, duration) {
    if (!metrics.modulesLoaded) metrics.modulesLoaded = [];
    metrics.modulesLoaded.push({
      name: moduleName,
      duration,
      timestamp: Date.now()
    });
    if (metrics.modulesLoaded.length > CONFIG.MAX_METRICS_STORED) {
      metrics.modulesLoaded.shift();
    }
    if (duration > CONFIG.SLOW_OPERATION_THRESHOLD_MS) {
      addSlowOperation(`Module: ${moduleName}`, duration);
    }
  }

  /**
   * Track API calls with timing
   */
  function trackApiCall(url, method, duration, status) {
    if (!metrics.apiCalls) metrics.apiCalls = [];
    metrics.apiCalls.push({
      url,
      method,
      duration,
      status,
      timestamp: Date.now()
    });
    if (metrics.apiCalls.length > CONFIG.MAX_METRICS_STORED) {
      metrics.apiCalls.shift();
    }
    if (duration > CONFIG.SLOW_API_THRESHOLD_MS) {
      addSlowOperation(`API: ${method} ${url}`, duration);
    }
  }

  /**
   * Add to slow operations log
   */
  function addSlowOperation(name, duration) {
    if (!metrics.slowOperations) metrics.slowOperations = [];
    metrics.slowOperations.push({
      name,
      duration,
      timestamp: Date.now()
    });
    if (metrics.slowOperations.length > CONFIG.MAX_METRICS_STORED) {
      metrics.slowOperations.shift();
    }
    console.warn(`[Performance] Slow operation detected: ${name} (${duration}ms)`);
  }

  /**
   * Track errors
   */
  function trackError(message, source, lineno) {
    if (!metrics.errors) metrics.errors = [];
    metrics.errors.push({
      message,
      source,
      lineno,
      timestamp: Date.now()
    });
    if (metrics.errors.length > CONFIG.MAX_METRICS_STORED) {
      metrics.errors.shift();
    }
  }

  /**
   * Monitor fetch calls
   */
  function monitorFetch() {
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const startTime = Date.now();
      const url = args[0];
      const method = (args[1] && args[1].method) || 'GET';
      
      return originalFetch.apply(this, args).then(response => {
        const duration = Date.now() - startTime;
        trackApiCall(url, method, duration, response.status);
        return response;
      }).catch(error => {
        const duration = Date.now() - startTime;
        trackError(`Fetch failed: ${url}`, 'fetch', 0);
        throw error;
      });
    };
  }

  /**
   * Monitor XHR calls
   */
  function monitorXHR() {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      this._startTime = Date.now();
      this._method = method;
      this._url = url;
      return originalOpen.apply(this, arguments);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
      const self = this;
      this.addEventListener('load', function() {
        const duration = Date.now() - self._startTime;
        trackApiCall(self._url, self._method, duration, self.status);
      });
      this.addEventListener('error', function() {
        trackError(`XHR failed: ${self._url}`, 'xhr', 0);
      });
      return originalSend.apply(this, arguments);
    };
  }

  /**
   * Get current metrics report
   */
  function getReport() {
    const now = Date.now();
    const pageLoadTime = window.performance ? 
      window.performance.timing.loadEventEnd - window.performance.timing.navigationStart : 
      'N/A';

    return {
      pageLoadTime,
      uptime: now - metrics.navigationStart,
      metrics: {
        modulesLoaded: metrics.modulesLoaded.length,
        apiCalls: metrics.apiCalls.length,
        slowOperations: metrics.slowOperations.length,
        errors: metrics.errors.length
      },
      slowOps: metrics.slowOperations.slice(-10),
      recentErrors: metrics.errors.slice(-5),
      modulesStats: getModulesStats(),
      apiStats: getApiStats()
    };
  }

  /**
   * Get module loading statistics
   */
  function getModulesStats() {
    if (!metrics.modulesLoaded || metrics.modulesLoaded.length === 0) return null;
    const durations = metrics.modulesLoaded.map(m => m.duration);
    return {
      total: durations.length,
      average: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      min: Math.min(...durations),
      max: Math.max(...durations),
      total_time: durations.reduce((a, b) => a + b, 0)
    };
  }

  /**
   * Get API statistics
   */
  function getApiStats() {
    if (!metrics.apiCalls || metrics.apiCalls.length === 0) return null;
    const durations = metrics.apiCalls.map(c => c.duration);
    const statusCodes = {};
    metrics.apiCalls.forEach(c => {
      statusCodes[c.status] = (statusCodes[c.status] || 0) + 1;
    });
    return {
      total: durations.length,
      average: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      min: Math.min(...durations),
      max: Math.max(...durations),
      total_time: durations.reduce((a, b) => a + b, 0),
      status_distribution: statusCodes
    };
  }

  /**
   * Print beautiful report to console
   */
  function printReport() {
    const report = getReport();
    console.group('[Zeralda ERP] Performance Report');
    console.log('Page Load Time:', report.pageLoadTime + 'ms');
    console.log('Uptime:', report.uptime + 'ms');
    console.table(report.metrics);
    
    if (report.modulesStats) {
      console.group('Module Loading Stats');
      console.table(report.modulesStats);
      console.groupEnd();
    }
    
    if (report.apiStats) {
      console.group('API Call Stats');
      console.table(report.apiStats);
      console.groupEnd();
    }
    
    if (report.slowOps.length > 0) {
      console.group('Slow Operations');
      console.table(report.slowOps);
      console.groupEnd();
    }
    
    if (report.recentErrors.length > 0) {
      console.group('Recent Errors');
      console.table(report.recentErrors);
      console.groupEnd();
    }
    
    console.groupEnd();
  }

  /**
   * Real-time dashboard in console
   */
  function startLiveMonitor() {
    console.log('[Performance Monitor] Live monitoring started. Call PerformanceMonitor.printReport() to see metrics');
    setInterval(() => {
      const stats = getReport();
      if (stats.metrics.slowOperations > 0 || stats.metrics.errors > 0) {
        console.warn(`[Performance Monitor] Issues detected: ${stats.metrics.slowOperations} slow ops, ${stats.metrics.errors} errors`);
      }
    }, 10000);
  }

  // Expose public API
  window.PerformanceMonitor = {
    trackModuleLoad,
    trackApiCall,
    trackError,
    getReport,
    printReport,
    startLiveMonitor,
    getMetrics: () => metrics
  };

  // Initialize monitoring
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      monitorFetch();
      monitorXHR();
      startLiveMonitor();
    });
  } else {
    monitorFetch();
    monitorXHR();
    startLiveMonitor();
  }

  // Global error handler
  window.addEventListener('error', (event) => {
    trackError(event.message, event.filename, event.lineno);
  });

})();
