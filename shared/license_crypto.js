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
