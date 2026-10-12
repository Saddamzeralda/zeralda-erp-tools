/**
 * Zeralda ERP - Global Error Handler and Logger
 * ============================================
 * Provides comprehensive error handling and logging system
 */

(function() {
  'use strict';

  const ERROR_LOG_KEY = 'zeralda-error-log';
  const MAX_ERROR_LOG = 100;
  const ERROR_DISPLAY_DURATION = 5000;

  // Error severity levels
  const SEVERITY = {
    INFO: 'info',
    WARNING: 'warning',
    ERROR: 'error',
    CRITICAL: 'critical'
  };

  // Error logging
  function logError(message, details = {}, severity = SEVERITY.ERROR) {
    try {
      const errorEntry = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        message: String(message || 'Unknown error'),
        severity,
        details: details || {},
        url: window.location.href,
        userAgent: navigator.userAgent
      };

      // Get existing logs
      let logs = [];
      try {
        const existing = localStorage.getItem(ERROR_LOG_KEY);
        logs = existing ? JSON.parse(existing) : [];
      } catch (e) {
        logs = [];
      }

      // Add new log
      logs.push(errorEntry);

      // Keep only last MAX_ERROR_LOG entries
      if (logs.length > MAX_ERROR_LOG) {
        logs = logs.slice(-MAX_ERROR_LOG);
      }

      // Save
      localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(logs));

      // Console output
      const consoleMethod = severity === SEVERITY.CRITICAL ? 'error' : 
                           severity === SEVERITY.ERROR ? 'error' :
                           severity === SEVERITY.WARNING ? 'warn' : 'log';
      
      console[consoleMethod](`[${severity.toUpperCase()}]`, message, details);

      // Dispatch event
      window.dispatchEvent(new CustomEvent('zeraldaError', {
        detail: errorEntry
      }));

      return errorEntry;
    } catch (e) {
      console.error('Failed to log error:', e);
      return null;
    }
  }

  // Get error logs
  function getErrorLogs(limit = 50) {
    try {
      const logs = localStorage.getItem(ERROR_LOG_KEY);
      const parsed = logs ? JSON.parse(logs) : [];
      return parsed.slice(-limit);
    } catch (e) {
      console.error('Failed to get error logs:', e);
      return [];
    }
  }

  // Clear error logs
  function clearErrorLogs() {
    try {
      localStorage.removeItem(ERROR_LOG_KEY);
      console.log('[ErrorHandler] ✅ Error logs cleared');
      return true;
    } catch (e) {
      console.error('Failed to clear error logs:', e);
      return false;
    }
  }

  // Display error notification
  function showErrorNotification(message, severity = SEVERITY.ERROR) {
    try {
      // Remove existing notification
      const existing = document.getElementById('zeraldaErrorNotification');
      if (existing) existing.remove();

      // Create notification
      const notification = document.createElement('div');
      notification.id = 'zeraldaErrorNotification';
      notification.className = `zeralda-error-notification severity-${severity}`;
      
      const icon = severity === SEVERITY.CRITICAL ? '❌' :
                  severity === SEVERITY.ERROR ? '⚠️' :
                  severity === SEVERITY.WARNING ? '⚡' : 'ℹ️';

      notification.innerHTML = `
        <div class="notification-content">
          <span class="notification-icon">${icon}</span>
          <span class="notification-message">${escapeHTML(message)}</span>
          <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
      `;

      // Add styles if not exists
      if (!document.getElementById('zeraldaErrorStyles')) {
        const style = document.createElement('style');
        style.id = 'zeraldaErrorStyles';
        style.textContent = `
          .zeralda-error-notification {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            min-width: 300px;
            max-width: 500px;
            padding: 16px;
            border-radius: 12px;
            background: white;
            box-shadow: 0 8px 32px rgba(0,0,0,0.15);
            animation: slideIn 0.3s ease;
          }
          @keyframes slideIn {
            from { transform: translateX(400px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          .zeralda-error-notification.severity-critical {
            border-left: 4px solid #dc2626;
          }
          .zeralda-error-notification.severity-error {
            border-left: 4px solid #ef4444;
          }
          .zeralda-error-notification.severity-warning {
            border-left: 4px solid #f59e0b;
          }
          .zeralda-error-notification.severity-info {
            border-left: 4px solid #3b82f6;
          }
          .notification-content {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .notification-icon {
            font-size: 24px;
            flex-shrink: 0;
          }
          .notification-message {
            flex: 1;
            font-size: 14px;
            color: #1f2937;
          }
          .notification-close {
            background: none;
            border: none;
            font-size: 24px;
            color: #6b7280;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            line-height: 1;
          }
          .notification-close:hover {
            color: #1f2937;
          }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(notification);

      // Auto-remove after duration
      setTimeout(() => {
        if (notification && notification.parentElement) {
          notification.remove();
        }
      }, ERROR_DISPLAY_DURATION);

    } catch (e) {
      console.error('Failed to show error notification:', e);
    }
  }

  // Escape HTML to prevent XSS
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Global error handlers
  window.addEventListener('error', function(event) {
    logError(event.message || 'Uncaught error', {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error ? event.error.stack : null
    }, SEVERITY.ERROR);
  });

  window.addEventListener('unhandledrejection', function(event) {
    logError('Unhandled promise rejection', {
      reason: event.reason,
      promise: event.promise
    }, SEVERITY.ERROR);
  });

  // Export global API
  window.ZeraldaErrorHandler = {
    log: logError,
    getLogs: getErrorLogs,
    clearLogs: clearErrorLogs,
    showNotification: showErrorNotification,
    SEVERITY: SEVERITY
  };

  console.log('[ErrorHandler] ✅ Global error handler initialized');

})();
