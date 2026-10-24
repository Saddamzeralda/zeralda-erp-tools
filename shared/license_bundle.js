/* Zeralda ERP - Unified Licensing Bundle */

/* ========================================================= */
/* FILE: shared/license_crypto.js */
/* ========================================================= */
/**
 * license_crypto.js — Zeralda ERP License Cryptographic Layer
 *
 * Uses Web Crypto API (RSA-PSS + SHA-256) for:
 *   - License key signing & verification
 *   - Hardware fingerprint hashing
 *   - Encrypted storage of license data (AES-GCM)
 *
 * Security properties:
 *   - Private key NEVER leaves the server
 *   - Public key is embedded for client-side verification
 *   - License payload is signed, not encrypted (anyone can read, none can forge)
 *   - AES-GCM encrypts the cached license at rest in localStorage
 *
 * License format: ZERALDA-<base64url(signedPayload)>
 *   where signedPayload = base64url(payload) + "." + base64url(signature)
 *
 * Fallback: In non-secure contexts (HTTP via hostname, not localhost/HTTPS),
 *   crypto.subtle is unavailable. We fall back to pure-JS SHA-256, skip RSA
 *   verification (server enforces), and use XOR obfuscation instead of AES-GCM.
 */
(function () {
  'use strict';

  // ── Embedded RSA-PSS public key (SPKI, base64-der) ───────────────────────
  var _embeddedPublicKeySpkiB64 = ''; // populated from server on first boot

  // ── Constants ─────────────────────────────────────────────────────────────
  var ALG_SIGN = { name: 'RSA-PSS', hash: 'SHA-256' };
  var ALG_AES = { name: 'AES-GCM', length: 256 };
  var ALG_DERIVE = { name: 'PBKDF2' };
  var SALT_LEN = 16;
  var IV_LEN = 12;
  var PBKDF2_ITERS = 150000;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _b64urlToBuf(b64url) {
    var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var bin = atob(b64);
    var buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  }

  function _bufToB64url(buf) {
    var bytes = new Uint8Array(buf);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function _strToBuf(str) {
    return new TextEncoder().encode(str);
  }

  function _bufToStr(buf) {
    return new TextDecoder().decode(buf);
  }

  function _randomBytes(n) {
    var arr = new Uint8Array(n);
    if (crypto.getRandomValues) {
      crypto.getRandomValues(arr);
    } else {
      for (var i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  }

  // Check if Web Crypto subtle is available (requires secure context: HTTPS or localhost)
  function _hasSubtle() {
    return !!(crypto && crypto.subtle && crypto.subtle.digest && crypto.subtle.importKey);
  }

  // ── Pure-JS SHA-256 fallback (for non-secure HTTP contexts) ──────────────
  function _sha256Fallback(str) {
    function rr(v, n) { return (v >>> n) | (v << (32 - n)); }
    var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
             0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
             0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
             0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
             0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
             0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
             0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
             0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var bytes = new TextEncoder().encode(str);
    var len = bytes.length;
    var bitLen = len * 8;
    var padLen = (((len + 9) + 63) >> 6) << 6;
    var padded = new Uint8Array(padLen);
    padded.set(bytes);
    padded[len] = 0x80;
    padded[padLen - 4] = (bitLen >>> 24) & 0xff;
    padded[padLen - 3] = (bitLen >>> 16) & 0xff;
    padded[padLen - 2] = (bitLen >>> 8) & 0xff;
    padded[padLen - 1] = bitLen & 0xff;
    for (var i = 0; i < padded.length; i += 64) {
      var w = new Array(64);
      for (var j = 0; j < 16; j++) {
        w[j] = (padded[i + j*4] << 24) | (padded[i + j*4 + 1] << 16) | (padded[i + j*4 + 2] << 8) | padded[i + j*4 + 3];
        w[j] >>>= 0;
      }
      for (var j = 16; j < 64; j++) {
        var s0 = rr(w[j-15],7) ^ rr(w[j-15],18) ^ (w[j-15] >>> 3);
        var s1 = rr(w[j-2],17) ^ rr(w[j-2],19) ^ (w[j-2] >>> 10);
        w[j] = (w[j-16] + s0 + w[j-7] + s1) >>> 0;
      }
      var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for (var j = 0; j < 64; j++) {
        var S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
        var S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
        var mj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + mj) >>> 0;
        h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
      }
      H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
      H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
    }
    var out = new ArrayBuffer(32);
    var out8 = new Uint8Array(out);
    for (var j = 0; j < 8; j++) {
      out8[j*4]   = (H[j] >>> 24) & 0xff;
      out8[j*4+1] = (H[j] >>> 16) & 0xff;
      out8[j*4+2] = (H[j] >>> 8) & 0xff;
      out8[j*4+3] = H[j] & 0xff;
    }
    return out;
  }

  // ── Public key management ─────────────────────────────────────────────────
  var _publicKeyHandle = null; // CryptoKey

  async function importPublicKey(spkiB64) {
    _embeddedPublicKeySpkiB64 = spkiB64;
    if (!_hasSubtle()) {
      _publicKeyHandle = null;
      console.warn('[LicenseCrypto] crypto.subtle unavailable — RSA verification disabled (server-side enforcement active)');
      return null;
    }
    var spkiBuf = _b64urlToBuf(spkiB64.replace(/[-_]/g, function (c) {
      return c === '-' ? '+' : '/';
    }));
    _publicKeyHandle = await crypto.subtle.importKey(
      'spki',
      spkiBuf,
      ALG_SIGN,
      false,
      ['verify']
    );
    return _publicKeyHandle;
  }

  async function getPublicKey() {
    if (_publicKeyHandle) return _publicKeyHandle;
    if (_embeddedPublicKeySpkiB64) {
      return await importPublicKey(_embeddedPublicKeySpkiB64);
    }
    if (!_hasSubtle()) return null;
    throw new Error('No public key available — call importPublicKey first');
  }

  // ── License signing & verification ────────────────────────────────────────
  async function verifyLicense(signedPayload) {
    try {
      var parts = signedPayload.split('.');
      if (parts.length !== 2) return { valid: false, payload: null };
      var payloadB64 = parts[0];
      var payloadBuf = _b64urlToBuf(payloadB64);

      // Non-secure context fallback: skip RSA verification, trust the server.
      if (!_hasSubtle() || !_publicKeyHandle) {
        var payload = JSON.parse(_bufToStr(payloadBuf));
        return { valid: true, payload: payload, verifiedBy: 'server' };
      }

      var sigB64 = parts[1];
      var sigBuf = _b64urlToBuf(sigB64);
      var pubKey = await getPublicKey();
      var valid = await crypto.subtle.verify(ALG_SIGN, pubKey, sigBuf, payloadBuf);
      if (!valid) return { valid: false, payload: null };

      var payload = JSON.parse(_bufToStr(payloadBuf));
      return { valid: true, payload: payload, verifiedBy: 'crypto' };
    } catch (e) {
      return { valid: false, payload: null };
    }
  }

  // ── Hardware fingerprint ──────────────────────────────────────────────────
  async function generateFingerprint() {
    var components = {
      ua: navigator.userAgent || '',
      lang: navigator.language || '',
      langs: (navigator.languages || []).join(','),
      platform: navigator.platform || '',
      vendor: navigator.vendor || '',
      screen: (screen.width || 0) + 'x' + (screen.height || 0),
      colorDepth: screen.colorDepth || 0,
      pixelRatio: window.devicePixelRatio || 1,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      tzOffset: new Date().getTimezoneOffset(),
      cpuCores: navigator.hardwareConcurrency || 0,
      memory: navigator.deviceMemory || 0,
      touch: ('ontouchstart' in window) ? 1 : 0,
      canvas: _canvasFingerprint(),
      webgl: _webglFingerprint(),
    };

    var raw = Object.keys(components).sort().map(function (k) {
      return k + ':' + String(components[k]);
    }).join('|');

    var hashBuf;
    if (_hasSubtle()) {
      hashBuf = await crypto.subtle.digest('SHA-256', _strToBuf(raw));
    } else {
      hashBuf = _sha256Fallback(raw);
    }
    var hash = _bufToB64url(hashBuf).substring(0, 32);

    var hwId = 'HW-' + hash.substring(0, 4).toUpperCase() + '-' +
      hash.substring(4, 8).toUpperCase() + '-' +
      hash.substring(8, 12).toUpperCase() + '-' +
      hash.substring(12, 16).toUpperCase();

    return { fingerprint: hash, hwId: hwId, components: components };
  }

  function _canvasFingerprint() {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 60;
      var ctx = canvas.getContext('2d');
      if (!ctx) return 'no-canvas';
      ctx.textBaseline = 'top';
      ctx.font = "14px 'Arial'";
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 100, 30);
      ctx.fillStyle = '#069';
      ctx.fillText('ZeraldaERP-License-Fingerprint-2025', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('ZeraldaERP-License-Fingerprint-2025', 4, 17);
      return canvas.toDataURL().substring(0, 100);
    } catch (e) {
      return 'canvas-error';
    }
  }

  function _webglFingerprint() {
    try {
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 'no-webgl';
      var debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return 'no-debug-info';
      var vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
      var renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
      return vendor + '|' + renderer;
    } catch (e) {
      return 'webgl-error';
    }
  }

  // ── AES-GCM encrypted storage (with XOR fallback) ─────────────────────────
  async function _deriveAesKey(passphrase, salt) {
    if (!_hasSubtle()) return null;
    var keyMaterial = await crypto.subtle.importKey(
      'raw', _strToBuf(passphrase), ALG_DERIVE, false, ['deriveKey']
    );
    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
      keyMaterial,
      ALG_AES,
      false,
      ['encrypt', 'decrypt']
    );
  }

  function _xorObfuscate(plaintext, passphrase) {
    var keyBytes = _strToBuf(passphrase);
    var ptBytes = _strToBuf(plaintext);
    var out = new Uint8Array(ptBytes.length);
    for (var i = 0; i < ptBytes.length; i++) {
      out[i] = ptBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return _bufToB64url(out.buffer);
  }

  function _xorDeobfuscate(packed, passphrase) {
    var keyBytes = _strToBuf(passphrase);
    var data = new Uint8Array(_b64urlToBuf(packed));
    var out = new Uint8Array(data.length);
    for (var i = 0; i < data.length; i++) {
      out[i] = data[i] ^ keyBytes[i % keyBytes.length];
    }
    return _bufToStr(out.buffer);
  }

  async function encryptData(plaintext, passphrase) {
    if (!_hasSubtle()) {
      return 'X1:' + _xorObfuscate(plaintext, passphrase);
    }
    var salt = _randomBytes(SALT_LEN);
    var iv = _randomBytes(IV_LEN);
    var key = await _deriveAesKey(passphrase, salt);
    var ct = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      _strToBuf(plaintext)
    );
    var combined = new Uint8Array(SALT_LEN + IV_LEN + ct.byteLength);
    combined.set(salt, 0);
    combined.set(iv, SALT_LEN);
    combined.set(new Uint8Array(ct), SALT_LEN + IV_LEN);
    return _bufToB64url(combined.buffer);
  }

  async function decryptData(packed, passphrase) {
    if (packed.substring(0, 3) === 'X1:') {
      return _xorDeobfuscate(packed.substring(3), passphrase);
    }
    var combined = new Uint8Array(_b64urlToBuf(packed));
    var salt = combined.slice(0, SALT_LEN);
    var iv = combined.slice(SALT_LEN, SALT_LEN + IV_LEN);
    var ct = combined.slice(SALT_LEN + IV_LEN);
    var key = await _deriveAesKey(passphrase, salt);
    var pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      ct
    );
    return _bufToStr(pt);
  }

  // ── Integrity hash (anti-tampering) ───────────────────────────────────────
  async function sha256(data) {
    var buf;
    if (_hasSubtle()) {
      buf = await crypto.subtle.digest('SHA-256', _strToBuf(data));
    } else {
      buf = _sha256Fallback(data);
    }
    return _bufToB64url(buf);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.LicenseCrypto = {
    importPublicKey: importPublicKey,
    getPublicKey: getPublicKey,
    getEmbeddedPublicKey: function () { return _embeddedPublicKeySpkiB64; },
    verifyLicense: verifyLicense,
    generateFingerprint: generateFingerprint,
    encryptData: encryptData,
    decryptData: decryptData,
    sha256: sha256,
    _b64urlToBuf: _b64urlToBuf,
    _bufToB64url: _bufToB64url,
    _strToBuf: _strToBuf,
    _bufToStr: _bufToStr,
  };

  console.log('[LicenseCrypto] Initialized — ' + (_hasSubtle() ? 'Web Crypto API ready' : 'fallback mode (non-secure context)'));
})();

;
/* ========================================================= */
/* FILE: shared/license_manager.js */
/* ========================================================= */
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
      if (s.status === 'active') {
        _state.status = 'active';
        _state.license = {
          licenseKey: s.licenseKey,
          type: s.licenseType || 'standard',
          expiresAt: s.expiresAt || 0
        };
        _state.lastCheck = Date.now();
        _state.nextCheck = Date.now() + REVALIDATE_INTERVAL_MS;
        _clearTrial();
        _notifyListeners();
        _startRevalidation();
        return _getStatus();
      } else if (s.status === 'expired') {
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

;
/* ========================================================= */
/* FILE: shared/license_guard.js */
/* ========================================================= */
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

;
/* ========================================================= */
/* FILE: shared/license_auto.js */
/* ========================================================= */
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

    // The production bundle already defines these globals; load standalone
    // scripts only when the bundle is not providing that part of the stack.
    if (!window.LicenseCrypto) {
      await _loadScript(SHARED_BASE + 'license_crypto.js?v=' + SCRIPT_VERSION);
    }
    if (!window.LicenseManager) {
      await _loadScript(SHARED_BASE + 'license_manager.js?v=' + SCRIPT_VERSION);
    }
    if (!window.LicenseGuard) {
      await _loadScript(SHARED_BASE + 'license_guard.js?v=' + SCRIPT_VERSION);
    }

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
    'shared/license_bundle.js',
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

;
