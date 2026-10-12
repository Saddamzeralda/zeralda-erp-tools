/**
 * Zeralda ERP - System Validator
 * ==============================
 * Validates system integrity and performs health checks
 */

(function() {
  'use strict';

  const VALIDATOR_KEY = 'zeralda-validation-report';

  // Validation tests
  const validationTests = {
    // Check localStorage availability
    localStorageAvailable: function() {
      try {
        const testKey = '__zeralda_test__';
        localStorage.setItem(testKey, 'test');
        localStorage.removeItem(testKey);
        return { pass: true, message: 'localStorage is available' };
      } catch (e) {
        return { pass: false, message: 'localStorage is not available: ' + e.message };
      }
    },

    // Check IndexedDB availability
    indexedDBAvailable: function() {
      try {
        if (!window.indexedDB) {
          return { pass: false, message: 'IndexedDB is not supported' };
        }
        return { pass: true, message: 'IndexedDB is available' };
      } catch (e) {
        return { pass: false, message: 'IndexedDB check failed: ' + e.message };
      }
    },

    // Check UnifiedStorage system
    unifiedStorageReady: function() {
      try {
        if (typeof window.UnifiedStorage === 'undefined') {
          return { pass: false, message: 'UnifiedStorage is not loaded' };
        }
        return { pass: true, message: 'UnifiedStorage system is ready' };
      } catch (e) {
        return { pass: false, message: 'UnifiedStorage check failed: ' + e.message };
      }
    },

    // Check essential settings
    settingsIntegrity: function() {
      try {
        const raw = localStorage.getItem('zeralda-settings');
        if (!raw) {
          return { pass: true, message: 'Settings not yet configured (normal for first run)' };
        }
        
        const settings = JSON.parse(raw);
        if (typeof settings !== 'object') {
          return { pass: false, message: 'Settings are corrupted' };
        }

        return { pass: true, message: 'Settings structure is valid' };
      } catch (e) {
        return { pass: false, message: 'Settings validation failed: ' + e.message };
      }
    },

    // Check auth system
    authSystemReady: function() {
      try {
        const meta = localStorage.getItem('zeralda-auth-meta');
        if (!meta) {
          return { pass: true, message: 'No active session (normal when logged out)' };
        }
        
        const parsed = JSON.parse(meta);
        if (typeof parsed !== 'object') {
          return { pass: false, message: 'Auth metadata is corrupted' };
        }

        return { pass: true, message: 'Auth system is functional' };
      } catch (e) {
        return { pass: false, message: 'Auth system check failed: ' + e.message };
      }
    },

    // Check data integrity
    dataIntegrity: function() {
      try {
        const criticalKeys = [
          'invoices-data',
          'products-data',
          'zeralda-settings'
        ];

        let tested = 0;
        let valid = 0;

        for (const key of criticalKeys) {
          const value = localStorage.getItem(key);
          if (value) {
            tested++;
            try {
              JSON.parse(value);
              valid++;
            } catch (e) {
              // corrupted
            }
          }
        }

        if (tested === 0) {
          return { pass: true, message: 'No data yet (normal for new installation)' };
        }

        if (valid === tested) {
          return { pass: true, message: `All ${tested} data structures are valid` };
        }

        return { 
          pass: false, 
          message: `${tested - valid} of ${tested} data structures are corrupted` 
        };
      } catch (e) {
        return { pass: false, message: 'Data integrity check failed: ' + e.message };
      }
    },

    // Check browser compatibility
    browserCompatibility: function() {
      try {
        const required = {
          'fetch': typeof fetch !== 'undefined',
          'Promise': typeof Promise !== 'undefined',
          'localStorage': typeof localStorage !== 'undefined',
          'JSON': typeof JSON !== 'undefined',
          'MutationObserver': typeof MutationObserver !== 'undefined'
        };

        const missing = Object.keys(required).filter(key => !required[key]);

        if (missing.length > 0) {
          return { 
            pass: false, 
            message: 'Missing browser features: ' + missing.join(', ') 
          };
        }

        return { pass: true, message: 'Browser is fully compatible' };
      } catch (e) {
        return { pass: false, message: 'Browser compatibility check failed: ' + e.message };
      }
    },

    // Check module loader
    moduleLoaderAvailable: function() {
      try {
        if (typeof window.DirectModuleLoader === 'undefined') {
          return { pass: false, message: 'Module loader is not loaded' };
        }
        return { pass: true, message: 'Module loader is available' };
      } catch (e) {
        return { pass: false, message: 'Module loader check failed: ' + e.message };
      }
    }
  };

  // Run all validation tests
  function runValidation() {
    const results = {
      timestamp: new Date().toISOString(),
      tests: {},
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0
      }
    };

    for (const [testName, testFn] of Object.entries(validationTests)) {
      try {
        const result = testFn();
        results.tests[testName] = result;
        results.summary.total++;
        
        if (result.pass) {
          results.summary.passed++;
        } else {
          results.summary.failed++;
        }
      } catch (e) {
        results.tests[testName] = {
          pass: false,
          message: 'Test execution failed: ' + e.message
        };
        results.summary.total++;
        results.summary.failed++;
      }
    }

    // Save report
    try {
      localStorage.setItem(VALIDATOR_KEY, JSON.stringify(results));
    } catch (e) {
      console.error('Failed to save validation report:', e);
    }

    return results;
  }

  // Get last validation report
  function getLastReport() {
    try {
      const report = localStorage.getItem(VALIDATOR_KEY);
      return report ? JSON.parse(report) : null;
    } catch (e) {
      return null;
    }
  }

  // Print validation report
  function printReport(report) {
    if (!report) report = getLastReport() || runValidation();

    console.group('🔍 Zeralda ERP System Validation Report');
    console.log('Timestamp:', report.timestamp);
    console.log('Summary:', report.summary);
    console.log('---');

    for (const [testName, result] of Object.entries(report.tests)) {
      const icon = result.pass ? '✅' : '❌';
      console.log(`${icon} ${testName}:`, result.message);
    }

    console.groupEnd();

    return report;
  }

  // Auto-run on page load (silent)
  function autoValidate() {
    const report = runValidation();
    
    // Only log if there are failures
    if (report.summary.failed > 0) {
      console.warn(`⚠️ System validation found ${report.summary.failed} issue(s)`);
      printReport(report);
    } else {
      console.log(`✅ System validation passed (${report.summary.passed}/${report.summary.total} tests)`);
    }

    return report;
  }

  // Export global API
  window.ZeraldaValidator = {
    run: runValidation,
    getReport: getLastReport,
    print: printReport,
    auto: autoValidate
  };

  // Auto-run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoValidate);
  } else {
    autoValidate();
  }

  console.log('[SystemValidator] ✅ Validator initialized');

})();
