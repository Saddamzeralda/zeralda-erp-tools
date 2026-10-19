/**
 * license_auto.js — Zeralda ERP Auto License Protection Loader
 *
 * Automatically loads the license protection stack and protects the page.
 * Add this single script tag to any HTML page that requires a license:
 *   <script src="shared/license_auto.js?v=20260811a" defer></script>
 *
 * It dynamically loads:
 *   1. shared/license_crypto.js  — Web Crypto (RSA-PSS, AES-GCM, fingerprint)
 *   2. shared/license_manager.js — License lifecycle (trial, activation, cache)
 *   3. shared/license_guard.js   — Page protection (overlay, anti-debug, periodic check)
 *
 * Then calls LicenseGuard.protect() with the page name derived from the URL.
 *
 * Security note: This client-side protection is for UX (showing the activation
 * overlay, redirecting to the license page). The REAL enforcement is server-side
 * via the license enforcement middleware in app/app.py — API requests are
 * blocked without a valid license regardless of client-side state.
 */
(function () {
  'use strict';

  // Prevent double-loading
  if (window.__licenseAutoLoaded) return;
  window.__licenseAutoLoaded = true;

  var SCRIPT_VERSION = '20260828a';
  var SHARED_BASE = 'shared/';

  // Pages that should NOT be protected (accessible without a license)
  var EXEMPT_PAGES = [
    'license.html',
    'login.html',
    'oauth_callback.html',
    'index.html',
  ];

  function _currentPage() {
    var path = window.location.pathname || '';
    return path.split('/').pop() || 'index.html';
  }

  function _isExempt() {
    var page = _currentPage();
    return EXEMPT_PAGES.indexOf(page) !== -1;
  }

  function _loadScript(src, async) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.defer = true;
      if (async) s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () {
        console.warn('[LicenseAuto] Failed to load:', src);
        // Resolve anyway — don't block the page if scripts are missing
        resolve();
      };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function _derivePageName() {
    var path = window.location.pathname || '';
    var page = path.split('/').pop() || 'dashboard';
    // Remove .html extension
    page = page.replace(/\.html$/i, '');
    // For module pages, use the module name
    var parts = path.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[0] === 'modules') {
      return parts[1] || page; // e.g., "sales", "hr", "inventory"
    }
    return page;
  }

  async function _init() {
    if (_isExempt()) {
      console.log('[LicenseAuto] Page exempt from license protection:', _currentPage());
      return;
    }

    // Load the license protection stack in order
    await _loadScript(SHARED_BASE + 'license_crypto.js?v=' + SCRIPT_VERSION);
    await _loadScript(SHARED_BASE + 'license_manager.js?v=' + SCRIPT_VERSION);
    await _loadScript(SHARED_BASE + 'license_guard.js?v=' + SCRIPT_VERSION);

    // Wait for LicenseGuard to be available
    if (typeof window.LicenseGuard === 'undefined') {
      console.warn('[LicenseAuto] LicenseGuard not available — protection skipped');
      return;
    }

    // Protect the page
    var pageName = _derivePageName();
    try {
      await window.LicenseGuard.protect({ page: pageName });
      console.log('[LicenseAuto] Page protected:', pageName);
    } catch (e) {
      console.warn('[LicenseAuto] Protection failed:', e);
    }

    // Verify integrity of critical license scripts (anti-tampering)
    _verifyScriptIntegrity();

    // Start sending heartbeats to the server (phone-home mechanism)
    _startHeartbeat();
  }

  // ── Script integrity verification (anti-tampering) ──────────────────────
  // Fetch the license scripts and verify their integrity against stored hashes.
  // This is a soft check — a determined attacker can bypass it, but it catches
  // casual tampering (e.g., editing license_guard.js to disable protection).
  var CRITICAL_SCRIPTS = [
    'shared/license_crypto.js',
    'shared/license_manager.js',
    'shared/license_guard.js',
  ];

  async function _verifyScriptIntegrity() {
    if (!window.LicenseManager || typeof window.LicenseManager.verifyIntegrity !== 'function') {
      return;
    }
    try {
      if (sessionStorage.getItem('zeralda_license_integrity_ok') === '1') {
        return;
      }
    } catch (_) {}
    for (var i = 0; i < CRITICAL_SCRIPTS.length; i++) {
      var scriptName = CRITICAL_SCRIPTS[i];
      try {
        var resp = await fetch(scriptName + '?v=' + SCRIPT_VERSION, {
          cache: 'default',
          signal: AbortSignal.timeout(3000),
        });
        if (!resp.ok) continue;
        var content = await resp.text();
        var result = await window.LicenseManager.verifyIntegrity(content, scriptName);
        if (!result.valid) {
          console.warn('[LicenseAuto] Integrity check FAILED for:', scriptName);
          // Notify the server about the tampering
          _reportTampering(scriptName);
        }
      } catch (e) {
        // Network error — skip this check
      }
    }
    try { sessionStorage.setItem('zeralda_license_integrity_ok', '1'); } catch (_) {}
  }

  function _reportTampering(scriptName) {
    try {
      fetch(_getApiBase() + '/api/license/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ tampering: scriptName, ts: Date.now() }),
        signal: AbortSignal.timeout(3000),
      }).catch(function () {});
    } catch (e) {}
  }

  // ── Heartbeat (phone-home) ─────────────────────────────────────────────
  // Periodically notify the server that the client is active.
  // The server uses this to track the grace period and last-seen timestamp.
  var _heartbeatTimer = null;
  var HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  function _getApiBase() {
    var origin = window.location.origin;
    if (origin === 'null' || origin.startsWith('file:')) {
      return 'http://127.0.0.1:8080';
    }
    return origin;
  }

  function _sendHeartbeat() {
    try {
      var status = window.LicenseManager ? window.LicenseManager.getStatus() : {};
      var license = status.license || {};
      var body = {
        licenseKey: license.licenseKey || null,
        hwFingerprint: status.hwId ? null : null, // fingerprint is internal, send hwId
        hwId: status.hwId || null,
      };

      fetch(_getApiBase() + '/api/license/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      }).catch(function () {
        // Server unreachable — grace period will handle this
      });
    } catch (e) {
      // Ignore heartbeat errors — they're non-critical
    }
  }

  function _startHeartbeat() {
    // Send initial heartbeat after a short delay (let license init complete)
    setTimeout(_sendHeartbeat, 3000);
    // Then periodically
    if (_heartbeatTimer) clearInterval(_heartbeatTimer);
    _heartbeatTimer = setInterval(_sendHeartbeat, HEARTBEAT_INTERVAL_MS);
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  // Use DOMContentLoaded to ensure the page is ready before protecting
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  console.log('[LicenseAuto] Loader initialized v' + SCRIPT_VERSION);
})();
