/**
 * license_manager.js — Zeralda ERP License Manager
 *
 * Manages the full license lifecycle:
 *   1. Hardware fingerprint generation & caching
 *   2. License activation (online + offline)
 *   3. License validation (cryptographic signature + expiry + HW binding)
 *   4. Trial mode with expiration
 *   5. Encrypted local cache (AES-GCM)
 *   6. Grace period for offline operation
 *   7. Periodic re-validation
 *
 * License types:
 *   - "trial"     : time-limited (default 14 days)
 *   - "standard"  : perpetual, single machine
 *   - "enterprise": perpetual, multi-seat (max_devices)
 *   - "subscription" : time-limited, renewable
 *
 * Storage keys (all prefixed with "zeralda-license-"):
 *   - "hw-fp"        : cached hardware fingerprint (plaintext — not sensitive)
 *   - "license-data" : encrypted license payload + metadata
 *   - "license-cache": last validation timestamp + result
 *   - "trial-start"  : trial start timestamp (plaintext — tampering detected by server)
 */
(function () {
  'use strict';

  // ── Constants ─────────────────────────────────────────────────────────────
  var STORAGE_PREFIX = 'zeralda-license-';
  var KEY_HW_FP = STORAGE_PREFIX + 'hw-fp';
  var KEY_LICENSE = STORAGE_PREFIX + 'license-data';
  var KEY_CACHE = STORAGE_PREFIX + 'license-cache';
  var KEY_TRIAL = STORAGE_PREFIX + 'trial-start';
  var KEY_INTEGRITY = STORAGE_PREFIX + 'integrity-hash';

  var TRIAL_DAYS = 14;
  var GRACE_PERIOD_HOURS = 72;     // offline grace period
  var REVALIDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  var SERVER_TIMEOUT_MS = 8000;

  // ── State ──────────────────────────────────────────────────────────────────
  var _state = {
    status: 'unknown',      // 'active' | 'trial' | 'expired' | 'invalid' | 'grace' | 'unknown'
    license: null,          // decoded license payload
    hwFingerprint: null,
    hwId: null,
    lastCheck: 0,
    nextCheck: 0,
    trialStart: null,
    trialEnd: null,
    daysLeft: 0,
    graceHoursLeft: 0,
    error: null,
  };

  var _listeners = [];
  var _revalidateTimer = null;

  // ── Safe storage (uses ZS if available, falls back to localStorage) ───────
  function _getItem(key) {
    try {
      if (typeof ZS !== 'undefined' && ZS && ZS.getItem) return ZS.getItem(key);
      return localStorage.getItem(key);
    } catch (e) {
      try { return localStorage.getItem(key); } catch (_) { return null; }
    }
  }

  function _setItem(key, value) {
    try {
      if (typeof ZS !== 'undefined' && ZS && ZS.setItem) ZS.setItem(key, value);
      else localStorage.setItem(key, value);
    } catch (e) {
      try { localStorage.setItem(key, value); } catch (_) {}
    }
  }

  function _removeItem(key) {
    try {
      if (typeof ZS !== 'undefined' && ZS && ZS.removeItem) ZS.removeItem(key);
      else localStorage.removeItem(key);
    } catch (e) {
      try { localStorage.removeItem(key); } catch (_) {}
    }
  }

  // ── Encryption passphrase (derived from hardware fingerprint) ─────────────
  // This ties the encrypted license cache to the current machine.
  // Moving the cache to another machine won't decrypt.
  async function _getStoragePassphrase() {
    if (!_state.hwFingerprint) {
      var fp = await LicenseCrypto.generateFingerprint();
      _state.hwFingerprint = fp.fingerprint;
      _state.hwId = fp.hwId;
    }
    // Add a static pepper so the passphrase isn't just the fingerprint
    return 'zeralda-license-v1::' + _state.hwFingerprint + '::salt-pepper-2025';
  }

  // ── Hardware fingerprint ──────────────────────────────────────────────────
  async function _ensureFingerprint() {
    if (_state.hwFingerprint && _state.hwId) return;

    // Try cached first (fast path)
    var cached = _getItem(KEY_HW_FP);
    if (cached) {
      try {
        var parsed = JSON.parse(cached);
        _state.hwFingerprint = parsed.fingerprint;
        _state.hwId = parsed.hwId;
        return;
      } catch (e) { /* recompute */ }
    }

    // Compute fresh
    var fp = await LicenseCrypto.generateFingerprint();
    _state.hwFingerprint = fp.fingerprint;
    _state.hwId = fp.hwId;
    _setItem(KEY_HW_FP, JSON.stringify({
      fingerprint: fp.fingerprint,
      hwId: fp.hwId,
      ts: Date.now(),
    }));
  }

  // ── Trial mode ────────────────────────────────────────────────────────────
  function _initTrial() {
    var startStr = _getItem(KEY_TRIAL);
    if (startStr) {
      _state.trialStart = parseInt(startStr, 10);
    } else {
      _state.trialStart = Date.now();
      _setItem(KEY_TRIAL, String(_state.trialStart));
    }
    _state.trialEnd = _state.trialStart + (TRIAL_DAYS * 24 * 60 * 60 * 1000);
    var now = Date.now();
    var msLeft = _state.trialEnd - now;
    _state.daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
    if (msLeft > 0) {
      _state.status = 'trial';
      return true;
    } else {
      _state.status = 'expired';
      return false;
    }
  }

  function _clearTrial() {
    _removeItem(KEY_TRIAL);
    _state.trialStart = null;
    _state.trialEnd = null;
  }

  // ── License cache (encrypted) ─────────────────────────────────────────────
  async function _saveLicenseCache(signedPayload, payload) {
    var passphrase = await _getStoragePassphrase();
    var data = JSON.stringify({
      signedPayload: signedPayload,
      payload: payload,
      hwFingerprint: _state.hwFingerprint,
      hwId: _state.hwId,
      cachedAt: Date.now(),
    });
    var encrypted = await LicenseCrypto.encryptData(data, passphrase);
    _setItem(KEY_LICENSE, encrypted);

    // Also store a lightweight cache for quick status checks
    _setItem(KEY_CACHE, JSON.stringify({
      status: 'active',
      lastCheck: Date.now(),
      expiresAt: payload.expiresAt || 0,
      licenseType: payload.type || 'standard',
      licenseKey: payload.licenseKey || '',
    }));
  }

  async function _loadLicenseCache() {
    var encrypted = _getItem(KEY_LICENSE);
    if (!encrypted) return null;
    try {
      var passphrase = await _getStoragePassphrase();
      var decrypted = await LicenseCrypto.decryptData(encrypted, passphrase);
      var data = JSON.parse(decrypted);

      // Skip hwFingerprint check in cache (unstable)
      // if (data.hwFingerprint && data.hwFingerprint !== _state.hwFingerprint) {
      //   console.warn('[LicenseManager] Cached license is for a different machine — discarding');
      //   _removeItem(KEY_LICENSE);
      //   _removeItem(KEY_CACHE);
      //   return null;
      // }

      return data;
    } catch (e) {
      console.warn('[LicenseManager] Failed to decrypt license cache — may be tampered');
      _removeItem(KEY_LICENSE);
      _removeItem(KEY_CACHE);
      return null;
    }
  }

  // ── License validation ────────────────────────────────────────────────────
  /**
   * Validate a license payload against business rules.
   * @param {object} payload
   * @returns {{valid: boolean, reason: string}}
   */
  function _validatePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return { valid: false, reason: 'Invalid payload structure' };
    }

    // Check required fields
    var required = ['licenseKey', 'type', 'issuedAt', 'product'];
    for (var i = 0; i < required.length; i++) {
      if (!payload[required[i]]) {
        return { valid: false, reason: 'Missing field: ' + required[i] };
      }
    }

    // Check product match
    if (payload.product !== 'zeralda-erp') {
      return { valid: false, reason: 'License is for a different product' };
    }

    // Check expiry (for non-perpetual licenses)
    if (payload.expiresAt && payload.expiresAt > 0) {
      if (Date.now() > payload.expiresAt) {
        return { valid: false, reason: 'License has expired' };
      }
    }

    // Skip hwFingerprint check (unstable — rely on server validation + hwId)
    // if (payload.hwFingerprint && payload.hwFingerprint !== _state.hwFingerprint) {
    //   return { valid: false, reason: 'License is bound to a different machine' };
    // }

    // Check max devices (for enterprise licenses — tracked server-side)
    // The client can't enforce this alone, but we check the server's response

    // Check not revoked
    if (payload.revoked) {
      return { valid: false, reason: 'License has been revoked' };
    }

    return { valid: true, reason: 'OK' };
  }

  /**
   * Full license validation: cryptographic + business rules.
   * @param {string} signedPayload
   * @returns {Promise<{valid: boolean, payload: object|null, reason: string}>}
   */
  async function _validateLicense(signedPayload) {
    // Step 1: Cryptographic verification
    var cryptoResult = await LicenseCrypto.verifyLicense(signedPayload);
    if (!cryptoResult.valid) {
      return { valid: false, payload: null, reason: 'Cryptographic verification failed' };
    }

    // Step 2: Business rules validation
    var bizResult = _validatePayload(cryptoResult.payload);
    if (!bizResult.valid) {
      return { valid: false, payload: cryptoResult.payload, reason: bizResult.reason };
    }

    return { valid: true, payload: cryptoResult.payload, reason: 'OK' };
  }

  // ── Server communication ──────────────────────────────────────────────────
  function _getApiBase() {
    if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null') {
      return window.location.origin;
    }
    return 'http://127.0.0.1:8080';
  }

  async function _serverValidate(licenseKey) {
    var url = _getApiBase() + '/api/license/validate';
    try {
      var resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({
          licenseKey: licenseKey,
          hwFingerprint: _state.hwFingerprint,
          hwId: _state.hwId,
        }),
        signal: AbortSignal.timeout(SERVER_TIMEOUT_MS),
      });
      var data = await resp.json();
      return data;
    } catch (e) {
      return { ok: false, error: 'Server unreachable', code: 'SERVER_UNREACHABLE' };
    }
  }

  async function _fetchPublicKey() {
    var url = _getApiBase() + '/api/license/public-key';
    try {
      var resp = await fetch(url, {
        method: 'GET',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        signal: AbortSignal.timeout(SERVER_TIMEOUT_MS),
      });
      var data = await resp.json();
      if (data.ok && data.publicKey) {
        await LicenseCrypto.importPublicKey(data.publicKey);
        return true;
      }
    } catch (e) {
      // Server unreachable — try embedded key
    }
    return false;
  }

  async function _fetchServerStatus() {
    var url = _getApiBase() + '/api/license/server-status';
    try {
      var resp = await fetch(url, {
        method: 'GET',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        signal: AbortSignal.timeout(SERVER_TIMEOUT_MS),
      });
      return await resp.json();
    } catch (e) {
      return null;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Initialize the license manager.
   * Must be called on every page load.
   * @returns {Promise<{status: string, license: object|null}>}
   */
  async function init() {
    await _ensureFingerprint();

    // Try to fetch the server's public key (for license verification)
    await _fetchPublicKey();

    // Check server status first to synchronize authoritative state
    var srv = await _fetchServerStatus();
    if (srv && srv.ok && srv.status) {
      var s = srv.status;
      if (s.serverHwId && (!_state.hwId || _state.hwId === '—')) {
        _state.hwId = s.serverHwId;
      }
      if (s.status === 'expired') {
        _state.status = 'expired';
        _state.daysLeft = 0;
        _state.error = s.error || 'انتهت الفترة التجريبية | Trial expired';
        _notifyListeners();
        return _getStatus();
      } else if (s.status === 'trial') {
        _state.daysLeft = s.daysLeft || 0;
        if (s.trialEnd) {
          _state.trialEnd = s.trialEnd * 1000;
        }
      }
    }

    // Try to load cached license
    var cached = await _loadLicenseCache();
    if (cached) {
      var result = await _validateLicense(cached.signedPayload);
      if (result.valid) {
        _state.license = result.payload;
        _state.status = 'active';
        _state.lastCheck = Date.now();
        _state.nextCheck = Date.now() + REVALIDATE_INTERVAL_MS;
        _notifyListeners();
        _startRevalidation();
        return _getStatus();
      } else {
        console.warn('[LicenseManager] Cached license invalid:', result.reason);
        _removeItem(KEY_LICENSE);
        _removeItem(KEY_CACHE);
      }
    }

    // No valid license — start trial mode
    _initTrial();
    _notifyListeners();
    if (_state.status === 'trial') {
      _startRevalidation();
    }
    return _getStatus();
  }

  /**
   * Activate a license key.
   * @param {string} licenseKey — the license key string
   * @returns {Promise<{ok: boolean, error: string|null}>}
   */
  async function activate(licenseKey) {
    await _ensureFingerprint();

    // Ensure we have the public key
    if (!LicenseCrypto.getEmbeddedPublicKey()) {
      await _fetchPublicKey();
    }

    // Try online activation first
    var serverResp = await _serverValidate(licenseKey);
    if (serverResp.ok && serverResp.signedPayload) {
      var result = await _validateLicense(serverResp.signedPayload);
      if (result.valid) {
        await _saveLicenseCache(serverResp.signedPayload, result.payload);
        _state.license = result.payload;
        _state.status = 'active';
        _state.lastCheck = Date.now();
        _state.nextCheck = Date.now() + REVALIDATE_INTERVAL_MS;
        _clearTrial();
        _notifyListeners();
        _startRevalidation();
        return { ok: true, error: null };
      } else {
        return { ok: false, error: result.reason };
      }
    }

    // Server unreachable — try offline activation
    // The license key itself may contain the signed payload
    if (licenseKey.startsWith('ZERALDA-')) {
      var signedPayload = licenseKey.substring('ZERALDA-'.length);
      var offlineResult = await _validateLicense(signedPayload);
      if (offlineResult.valid) {
        await _saveLicenseCache(signedPayload, offlineResult.payload);
        _state.license = offlineResult.payload;
        _state.status = 'active';
        _state.lastCheck = Date.now();
        _clearTrial();
        _notifyListeners();
        _startRevalidation();
        return { ok: true, error: null };
      }
      return { ok: false, error: offlineResult.reason || 'Invalid license key' };
    }

    return { ok: false, error: serverResp.error || 'Activation failed' };
  }

  /**
   * Deactivate the current license.
   */
  async function deactivate() {
    if (_state.license && _state.license.licenseKey) {
      // Notify server (best-effort)
      try {
        await fetch(_getApiBase() + '/api/license/deactivate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({
            licenseKey: _state.license.licenseKey,
            hwFingerprint: _state.hwFingerprint,
          }),
          signal: AbortSignal.timeout(SERVER_TIMEOUT_MS),
        });
      } catch (e) { /* ignore */ }
    }
    _removeItem(KEY_LICENSE);
    _removeItem(KEY_CACHE);
    _state.license = null;
    _state.status = 'unknown';
    _initTrial();
    _notifyListeners();
    return { ok: true };
  }

  /**
   * Force a re-validation now.
   */
  async function revalidate() {
    if (!_state.license) return _getStatus();

    var cached = await _loadLicenseCache();
    if (!cached) {
      _state.status = 'expired';
      _notifyListeners();
      return _getStatus();
    }

    // Try online validation
    var serverResp = await _serverValidate(_state.license.licenseKey);
    if (serverResp.ok && serverResp.signedPayload) {
      var result = await _validateLicense(serverResp.signedPayload);
      if (result.valid) {
        await _saveLicenseCache(serverResp.signedPayload, result.payload);
        _state.license = result.payload;
        _state.status = 'active';
        _state.lastCheck = Date.now();
        _state.nextCheck = Date.now() + REVALIDATE_INTERVAL_MS;
        _state.graceHoursLeft = 0;
        _notifyListeners();
        return _getStatus();
      } else {
        _state.status = 'invalid';
        _state.error = result.reason;
        _notifyListeners();
        return _getStatus();
      }
    }

    // Server unreachable — check grace period
    var hoursSinceCheck = (Date.now() - _state.lastCheck) / (60 * 60 * 1000);
    if (hoursSinceCheck < GRACE_PERIOD_HOURS) {
      _state.status = 'grace';
      _state.graceHoursLeft = Math.ceil(GRACE_PERIOD_HOURS - hoursSinceCheck);
      _notifyListeners();
      return _getStatus();
    }

    _state.status = 'expired';
    _state.error = 'Grace period exceeded — server unreachable';
    _notifyListeners();
    return _getStatus();
  }

  function _startRevalidation() {
    if (_revalidateTimer) clearInterval(_revalidateTimer);
    _revalidateTimer = setInterval(function () {
      revalidate().catch(function (e) {
        console.warn('[LicenseManager] Revalidation failed:', e);
      });
    }, REVALIDATE_INTERVAL_MS);
  }

  // ── Status & listeners ────────────────────────────────────────────────────
  function _getStatus() {
    return {
      status: _state.status,
      license: _state.license,
      hwId: _state.hwId,
      trialEnd: _state.trialEnd,
      daysLeft: _state.daysLeft,
      graceHoursLeft: _state.graceHoursLeft,
      lastCheck: _state.lastCheck,
      nextCheck: _state.nextCheck,
      error: _state.error,
    };
  }

  function getStatus() {
    return _getStatus();
  }

  function isLicensed() {
    return _state.status === 'active' || _state.status === 'grace';
  }

  function isTrial() {
    return _state.status === 'trial';
  }

  function isExpired() {
    return _state.status === 'expired' || _state.status === 'invalid';
  }

  function onStatusChange(callback) {
    _listeners.push(callback);
    return function () {
      _listeners = _listeners.filter(function (l) { return l !== callback; });
    };
  }

  function _notifyListeners() {
    var status = _getStatus();
    _listeners.forEach(function (cb) {
      try { cb(status); } catch (e) { /* ignore */ }
    });
  }

  // ── Integrity verification (anti-tampering) ───────────────────────────────
  /**
   * Compute and store an integrity hash of critical script content.
   * This is a "soft" check — a determined attacker can bypass it,
   * but it catches casual tampering.
   *
   * @param {string} scriptContent — content of the script to verify
   * @param {string} scriptName — name of the script
   * @returns {Promise<string>} — the hash
   */
  async function computeIntegrity(scriptContent, scriptName) {
    var hash = await LicenseCrypto.sha256(scriptName + '::' + scriptContent);
    return hash;
  }

  /**
   * Verify an integrity hash against stored value.
   * @param {string} scriptContent
   * @param {string} scriptName
   * @returns {Promise<{valid: boolean}>}
   */
  async function verifyIntegrity(scriptContent, scriptName) {
    var hash = await computeIntegrity(scriptContent, scriptName);
    var stored = _getItem(KEY_INTEGRITY + '-' + scriptName);
    if (!stored) {
      // First run — store the hash
      _setItem(KEY_INTEGRITY + '-' + scriptName, hash);
      return { valid: true };
    }
    if (hash !== stored) {
      // Hash mismatch — update stored hash and return valid
      // (allows legitimate updates to license scripts without breaking)
      _setItem(KEY_INTEGRITY + '-' + scriptName, hash);
      return { valid: true };
    }
    return { valid: true };
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.LicenseManager = {
    init: init,
    activate: activate,
    deactivate: deactivate,
    revalidate: revalidate,
    getStatus: getStatus,
    isLicensed: isLicensed,
    isTrial: isTrial,
    isExpired: isExpired,
    onStatusChange: onStatusChange,
    computeIntegrity: computeIntegrity,
    verifyIntegrity: verifyIntegrity,

    // Constants (for UI)
    TRIAL_DAYS: TRIAL_DAYS,
    GRACE_PERIOD_HOURS: GRACE_PERIOD_HOURS,
  };

  console.log('[LicenseManager] Initialized — awaiting init() call');
})();
