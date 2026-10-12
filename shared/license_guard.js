/**
 * license_guard.js — Zeralda ERP Page Protection Guard
 *
 * Enforces license requirements on every page:
 *   1. Blocks page access if no valid license (after trial expires)
 *   2. Shows license activation overlay
 *   3. Anti-tampering: detects DevTools manipulation of license state
 *   4. Anti-debugging: detects common debugging patterns
 *   5. Periodic integrity checks
 *   6. Automatic redirect to license page on expiry
 *
 * Usage (add to every HTML page, AFTER license_manager.js):
 *   <script src="shared/license_crypto.js"></script>
 *   <script src="shared/license_manager.js"></script>
 *   <script src="shared/license_guard.js"></script>
 *   <script>LicenseGuard.protect({ page: 'dashboard' });</script>
 */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  var _config = {
    page: 'unknown',
    skipOnDev: false,       // enforce protection by default (even on localhost)
    showOverlay: true,      // show the license overlay UI
    redirectOnExpire: true, // redirect to license page on expiry
    licensePageUrl: '/license.html',
    checkInterval: 5 * 60 * 1000, // 5 minutes
    antiDebug: false,       // anti-debugging disabled
  };

  var _protected = false;
  var _overlayEl = null;
  var _checkTimer = null;
  var _antiDebugTimer = null;
  var _devToolsOpen = false;
  var _lastDevToolsCheck = 0;

  // ── Dev mode detection ────────────────────────────────────────────────────
  function _isDevMode() {
    if (!_config.skipOnDev) return false;
    // Dev mode only allowed if window.__ZERALDA_DEV_MODE__ is explicitly set
    return window.__ZERALDA_DEV_MODE__ === true;
  }

  // ── License overlay UI ────────────────────────────────────────────────────
  function _createOverlay(status) {
    if (_overlayEl) _overlayEl.remove();

    var overlay = document.createElement('div');
    overlay.id = 'licenseGuardOverlay';
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'background:rgba(15,23,42,0.97)', 'z-index:2147483647',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:"Segoe UI",system-ui,-apple-system,sans-serif',
      'color:#e2e8f0', 'backdrop-filter:blur(8px)',
    ].join(';') + ';';

    var isTrial = status.status === 'trial';
    var isExpired = status.status === 'expired' || status.status === 'invalid';
    var isGrace = status.status === 'grace';

    var titleText, descText, actionText, actionColor;
    if (isTrial) {
      titleText = 'فترة تجريبية | Trial Period';
      descText = 'تبقى ' + status.daysLeft + ' يوماً في الفترة التجريبية.<br>' +
        status.daysLeft + ' days left in your trial.';
      actionText = 'تفعيل الترخيص | Activate License';
      actionColor = '#d36b2e';
    } else if (isExpired) {
      titleText = 'انتهت الفترة التجريبية | Trial Expired';
      descText = 'انتهت فترتك التجريبية. يرجى تفعيل ترخيص للمتابعة.<br>' +
        'Your trial has expired. Please activate a license to continue.';
      actionText = 'تفعيل الترخيص | Activate License';
      actionColor = '#ef4444';
    } else if (isGrace) {
      titleText = 'وضع السماحية | Grace Period';
      descText = 'الخادم غير متاح. تبقى ' + status.graceHoursLeft + ' ساعة في وضع السماحية.<br>' +
        'Server unreachable. ' + status.graceHoursLeft + ' hours of grace period left.';
      actionText = 'إعادة المحاولة | Retry';
      actionColor = '#f59e0b';
    } else {
      titleText = 'ترخيص غير صالح | Invalid License';
      descText = (status.error || 'يرجى تفعيل ترخيص صالح.') + '<br>Please activate a valid license.';
      actionText = 'تفعيل الترخيص | Activate License';
      actionColor = '#ef4444';
    }

    var displayHw = status.hwId || status.serverHwId || '—';

    overlay.innerHTML = [
      '<div style="max-width:500px;width:90%;text-align:center;padding:40px;',
      'background:#1e293b;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.5);',
      'border:1px solid #334155;">',
      '  <div style="font-size:48px;margin-bottom:16px;">🔒</div>',
      '  <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#f1f5f9;">' + titleText + '</h2>',
      '  <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#94a3b8;">' + descText + '</p>',
      '  <div style="margin:0 0 16px;">',
      '    <input id="licenseKeyInput" type="text" placeholder="ZERALDA-XXXX... أو KEY-XXXX..." ',
      '      style="width:100%;padding:12px 16px;font-size:14px;border:1px solid #475569;',
      '      border-radius:8px;background:#0f172a;color:#e2e8f0;box-sizing:border-box;" />',
      '  </div>',
      '  <div id="licenseError" style="color:#ef4444;font-size:13px;margin-bottom:12px;min-height:18px;"></div>',
      '  <button id="licenseActivateBtn" style="width:100%;padding:12px 24px;font-size:15px;font-weight:600;',
      '    border:none;border-radius:8px;cursor:pointer;background:' + actionColor + ';color:white;',
      '    transition:opacity 0.2s;">' + actionText + '</button>',
      '  <div style="margin-top:18px;font-size:12px;color:#64748b;display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;">',
      '    <span>معرّف الجهاز (HWID):</span> <code id="hwIdDisplay" style="color:#38bdf8;background:#0f172a;padding:4px 8px;border-radius:4px;font-weight:600;font-family:monospace;">' + displayHw + '</code>',
      '    <button id="copyHwIdBtn" type="button" style="background:#334155;color:#e2e8f0;border:none;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;">📋 نسخ | Copy</button>',
      '  </div>',
      '  <div style="margin-top:12px;font-size:11px;color:#475569;">Zeralda ERP Protection System</div>',
      '</div>',
    ].join('');

    document.body.appendChild(overlay);
    _overlayEl = overlay;

    // Wire up the copy button
    var copyBtn = overlay.querySelector('#copyHwIdBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var hwText = displayHw;
        if (hwText && hwText !== '—' && navigator.clipboard) {
          navigator.clipboard.writeText(hwText).then(function () {
            copyBtn.textContent = '✓ تم النسخ | Copied!';
            setTimeout(function () { copyBtn.textContent = '📋 نسخ | Copy'; }, 2000);
          }).catch(function () {});
        }
      });
    }

    // Wire up the activate button
    var btn = overlay.querySelector('#licenseActivateBtn');
    var input = overlay.querySelector('#licenseKeyInput');
    var errorEl = overlay.querySelector('#licenseError');

    if (btn) {
      btn.addEventListener('click', async function () {
        var key = (input.value || '').trim();
        if (!key) {
          errorEl.textContent = 'يرجى إدخال مفتاح الترخيص | Please enter a license key';
          return;
        }
        btn.disabled = true;
        btn.textContent = '... جاري التفعيل | Activating...';
        errorEl.textContent = '';

        try {
          var result = await LicenseManager.activate(key);
          if (result.ok) {
            btn.textContent = '✓ تم التفعيل | Activated!';
            btn.style.background = '#10b981';
            setTimeout(function () {
              _removeOverlay();
              _protected = true;
            }, 1000);
          } else {
            errorEl.textContent = result.error || 'فشل التفعيل | Activation failed';
            btn.disabled = false;
            btn.textContent = actionText;
          }
        } catch (e) {
          errorEl.textContent = 'خطأ: ' + e.message;
          btn.disabled = false;
          btn.textContent = actionText;
        }
      });

      // Allow Enter key to submit
      if (input) {
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') btn.click();
        });
      }
    }

    // For grace period, the button retries validation
    if (isGrace && btn) {
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        btn.textContent = '... جاري التحقق | Checking...';
        try {
          await LicenseManager.revalidate();
          var status = LicenseManager.getStatus();
          if (status.status === 'active') {
            _removeOverlay();
          } else {
            errorEl.textContent = 'الخادم لا يزال غير متاح | Server still unreachable';
            btn.disabled = false;
            btn.textContent = actionText;
          }
        } catch (e) {
          btn.disabled = false;
          btn.textContent = actionText;
        }
      });
    }
  }

  function _removeOverlay() {
    if (_overlayEl) {
      _overlayEl.remove();
      _overlayEl = null;
    }
  }

  function _showOverlay() {
    if (!_config.showOverlay) return;
    var status = LicenseManager.getStatus();
    _createOverlay(status);
  }

  // ── Anti-debugging / anti-tampering ───────────────────────────────────────
  function _startAntiDebug() {
    if (!_config.antiDebug) return;

    // Detect DevTools via window size delta
    var _checkDevTools = function () {
      if (!_config.antiDebug) return;
      var threshold = 200;
      var widthDiff = window.outerWidth - window.innerWidth;
      var heightDiff = window.outerHeight - window.innerHeight;
      var wasOpen = _devToolsOpen;
      _devToolsOpen = (widthDiff > threshold || heightDiff > threshold);

      // Don't block on DevTools open — just log (too many false positives)
      // Real protection is the cryptographic license, not anti-debug.
      if (_devToolsOpen && !wasOpen) {
        console.warn('[LicenseGuard] DevTools detected — license state is cryptographically protected');
      }
    };

    _antiDebugTimer = setInterval(_checkDevTools, 2000);

    // Detect `debugger` statement pausing (time-based)
    // This is a soft check — not reliable enough to block on
    setInterval(function () {
      if (!_config.antiDebug) return;
      var start = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      var elapsed = performance.now() - start;
      if (elapsed > 100) {
        // Debugger was active — just log
        console.warn('[LicenseGuard] Debugger pause detected');
      }
    }, 10000);

    // Protect against license state tampering via Object.defineProperty
    try {
      var lm = window.LicenseManager;
      if (lm) {
        // Make critical functions non-configurable
        ['isLicensed', 'isTrial', 'isExpired', 'getStatus', 'activate', 'deactivate'].forEach(function (fn) {
          if (typeof lm[fn] === 'function') {
            try {
              Object.defineProperty(lm, fn, {
                value: lm[fn],
                writable: false,
                configurable: false,
              });
            } catch (e) { /* ignore */ }
          }
        });
      }
    } catch (e) { /* ignore */ }
  }

  // ── Periodic check ────────────────────────────────────────────────────────
  function _startPeriodicCheck() {
    if (_checkTimer) clearInterval(_checkTimer);
    _checkTimer = setInterval(async function () {
      if (!_protected) return;
      try {
        await LicenseManager.revalidate();
        var status = LicenseManager.getStatus();
        if (status.status === 'expired' || status.status === 'invalid') {
          if (_config.redirectOnExpire) {
            window.location.href = _config.licensePageUrl + '?redirect=' + encodeURIComponent(window.location.pathname);
          } else {
            _showOverlay();
          }
        } else if (status.status === 'grace' && !_overlayEl) {
          _showOverlay();
        }
      } catch (e) {
        console.warn('[LicenseGuard] Periodic check failed:', e);
      }
    }, _config.checkInterval);
  }

  // ── License status change handler ─────────────────────────────────────────
  function _onStatusChange(status) {
    if (status.status === 'active') {
      _removeOverlay();
      _protected = true;
    } else if (status.status === 'trial') {
      // Trial is active — allow access but show overlay if trial is about to expire
      _removeOverlay();
      _protected = true;
      if (status.daysLeft <= 3) {
        // Show a subtle warning (not blocking)
        _showTrialWarning(status.daysLeft);
      }
    } else if (status.status === 'grace') {
      if (!_overlayEl) _showOverlay();
    } else {
      // expired or invalid
      if (_config.redirectOnExpire && _config.page !== 'license') {
        window.location.href = _config.licensePageUrl + '?redirect=' + encodeURIComponent(window.location.pathname);
      } else {
        _showOverlay();
      }
      _protected = false;
    }
  }

  function _showTrialWarning(daysLeft) {
    var existing = document.getElementById('licenseTrialWarning');
    if (existing) return;

    var banner = document.createElement('div');
    banner.id = 'licenseTrialWarning';
    banner.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:999999',
      'background:linear-gradient(90deg,#f59e0b,#d97706)', 'color:white',
      'text-align:center', 'padding:8px 16px', 'font-size:13px', 'font-weight:600',
      'font-family:system-ui,sans-serif', 'box-shadow:0 2px 8px rgba(0,0,0,0.2)',
    ].join(';') + ';';
    banner.innerHTML = '⚠️ تبقى ' + daysLeft + ' يوماً في الفترة التجريبية — ' +
      daysLeft + ' days left in trial. ' +
      '<a href="#" id="licenseTrialActivate" style="color:white;text-decoration:underline;font-weight:700;">تفعيل | Activate</a>';

    document.body.insertBefore(banner, document.body.firstChild);

    var link = banner.querySelector('#licenseTrialActivate');
    if (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        _showOverlay();
      });
    }

    // Auto-remove after 10 seconds
    setTimeout(function () {
      if (banner && banner.parentNode) banner.remove();
    }, 10000);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Protect the current page.
   * Call this on every page that requires a license.
   * @param {object} config — { page: 'dashboard', skipOnDev: true, ... }
   */
  async function protect(config) {
    Object.assign(_config, config || {});

    // Skip in dev mode
    if (_isDevMode()) {
      console.log('[LicenseGuard] Dev mode detected — skipping protection');
      _protected = true;
      return;
    }

    // Skip on the license page itself
    if (_config.page === 'license') {
      _config.redirectOnExpire = false;
      _config.showOverlay = false;
    }

    // Initialize license manager
    try {
      await LicenseManager.init();
    } catch (e) {
      console.error('[LicenseGuard] License init failed:', e);
    }

    var status = LicenseManager.getStatus();
    _onStatusChange(status);

    // Listen for status changes
    LicenseManager.onStatusChange(_onStatusChange);

    // Start anti-debugging
    _startAntiDebug();

    // Start periodic checks
    _startPeriodicCheck();

    console.log('[LicenseGuard] Page protected:', _config.page, 'status:', status.status);
  }

  /**
   * Check if the current session is licensed (for use in other scripts).
   */
  function isLicensed() {
    return LicenseManager.isLicensed() || _isDevMode();
  }

  /**
   * Get the current license status.
   */
  function getStatus() {
    return LicenseManager.getStatus();
  }

  /**
   * Get the hardware ID (for display in activation UI).
   */
  function getHwId() {
    return LicenseManager.getStatus().hwId;
  }

  // ── Export ────────────────────────────────────────────────────────────────
  window.LicenseGuard = {
    protect: protect,
    isLicensed: isLicensed,
    getStatus: getStatus,
    getHwId: getHwId,
  };

  console.log('[LicenseGuard] Initialized — awaiting protect() call');
})();
