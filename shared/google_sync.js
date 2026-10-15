/**
 * Zeralda ERP - Google Integration Module
 * =======================================
 * Features:
 * 1) Google OAuth Sign-In
 * 2) Google Drive backup / restore
 * 3) Google Contacts sync
 * 4) Gmail send (general + invoice helper)
 */
(function (root) {
  'use strict';

  var DEFAULT_CLIENT_ID = '180070533961-1douevfros9h0smkg249b0fgmmhfesjb.apps.googleusercontent.com';
  var STORAGE_KEY = 'zeralda-settings';
  var GTOKEN_KEY_BASE = 'zeralda-google-token';
  var GPROFILE_KEY_BASE = 'zeralda-google-profile';
  var DRIVE_FOLDER_NAME = 'Zeralda ERP Backups';
  var DRIVE_FILE_NAME = 'zeralda-erp-backup.json';

  // ─────────────────────────────────────────────────────────
  //  Per-user key resolution: each ERP user gets their own Google token/profile
  // ─────────────────────────────────────────────────────────
  function getActiveUserId() {
    // 1) Try zeralda-current-user (set at login)
    try {
      var cu = JSON.parse(ZS.getItem('zeralda-current-user') || '{}');
      if (cu && cu.id) return String(cu.id);
    } catch (_) {}
    // 2) Try zeralda-settings.activeUserId
    try {
      var s = JSON.parse(ZS.getItem(STORAGE_KEY) || '{}');
      if (s && s.activeUserId) return String(s.activeUserId);
    } catch (_) {}
    return 'default';
  }

  function getGTokenKey()  { return GTOKEN_KEY_BASE  + '::' + getActiveUserId(); }
  function getGProfileKey() { return GPROFILE_KEY_BASE + '::' + getActiveUserId(); }

  // Backward-compat: migrate old global keys to per-user keys on first load
  function migrateOldGoogleKeys() {
    try {
      var oldToken = ZS.getItem(GTOKEN_KEY_BASE);
      if (oldToken) {
        ZS.setItem(getGTokenKey(), oldToken);
        ZS.removeItem(GTOKEN_KEY_BASE);
      }
      var oldProfile = ZS.getItem(GPROFILE_KEY_BASE);
      if (oldProfile) {
        ZS.setItem(getGProfileKey(), oldProfile);
        ZS.removeItem(GPROFILE_KEY_BASE);
      }
    } catch (_) {}
  }

  var SCOPES = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/contacts',
    'https://www.googleapis.com/auth/gmail.send'
  ].join(' ');

  var tokenClient = null;
  var accessToken = null;
  var pendingTokenCallback = null;
  var lastClientIdUsed = null;

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  function getActiveCompany() {
    var settings = getSettings();
    var companies = Array.isArray(settings.companies) ? settings.companies : [];
    var activeId = settings.activeCompanyId || null;
    var active = null;

    if (activeId) {
      active = companies.find(function (c) { return c && c.id === activeId; }) || null;
    }
    if (!active && companies.length) {
      active = companies[0] || null;
      activeId = active && active.id ? active.id : null;
    }

    return {
      id: activeId || null,
      name: active && active.name ? active.name : ''
    };
  }

  function getDriveFileNameForActiveCompany() {
    var company = getActiveCompany();
    if (!company.id) return DRIVE_FILE_NAME;
    var safeName = slugify(company.name || 'company');
    var safeId = slugify(company.id || 'default');
    return 'zeralda-erp-backup-' + safeName + '-' + safeId + '.json';
  }

  function getLastBackupStorageKeyForActiveCompany() {
    var company = getActiveCompany();
    if (!company.id) return 'zeralda-last-drive-backup';
    return 'zeralda-last-drive-backup:' + company.id;
  }

  function getScopedBaseKeys() {
    return (root.CompanyStorage && Array.isArray(root.CompanyStorage.scopedKeys))
      ? root.CompanyStorage.scopedKeys.slice()
      : [
          'customers-data',
          'invoices-data',
          'proformas-data',
          'products-data',
          'stock-movements',
          'employees-data',
          'payroll-data',
          'inventory-categories',
          'inventory-backups',
          'inventory-audit-log'
        ];
  }

  function getScopedSet() {
    var set = {};
    getScopedBaseKeys().forEach(function (k) { set[k] = true; });
    return set;
  }

  function resolveCompanyScopeId(candidate) {
    var resolved = String(candidate || '').trim();
    return resolved || 'default-company';
  }

  function resolveBackupCompanyId(payload) {
    var backupCompanyId = String((payload && payload.companyId) || '').trim();
    if (!backupCompanyId) {
      try {
        var rawSettings = payload && payload.data ? payload.data['zeralda-settings'] : null;
        var parsedSettings = rawSettings ? JSON.parse(rawSettings) : null;
        backupCompanyId = String((parsedSettings && parsedSettings.activeCompanyId) || '').trim();
      } catch (_) {
        backupCompanyId = '';
      }
    }
    if (!backupCompanyId) {
      var activeCompany = getActiveCompany();
      backupCompanyId = String((activeCompany && activeCompany.id) || '').trim();
    }
    return resolveCompanyScopeId(backupCompanyId);
  }

  function normalizeCompanyScopedDataMap(inputData, fallbackCompanyId) {
    var rawData = inputData && typeof inputData === 'object' ? inputData : {};
    var scopedSet = getScopedSet();
    var resolvedCompanyId = resolveCompanyScopeId(fallbackCompanyId);

    var hasScopedVariants = {};
    Object.keys(rawData).forEach(function (k) {
      if (!k || k.indexOf('::') === -1) return;
      var base = k.split('::')[0];
      if (scopedSet[base]) hasScopedVariants[base] = true;
    });

    var normalizedData = {};
    var convertedBaseKeys = 0;
    var droppedBaseKeys = 0;

    Object.keys(rawData).forEach(function (k) {
      var v = rawData[k];
      if (!k) return;
      if (k.indexOf('::') !== -1) {
        normalizedData[k] = v;
        return;
      }
      if (scopedSet[k]) {
        if (hasScopedVariants[k]) {
          droppedBaseKeys += 1;
          return;
        }
        normalizedData[k + '::' + resolvedCompanyId] = v;
        convertedBaseKeys += 1;
        return;
      }
      normalizedData[k] = v;
    });

    return {
      data: normalizedData,
      resolvedCompanyId: resolvedCompanyId,
      convertedBaseKeys: convertedBaseKeys,
      droppedBaseKeys: droppedBaseKeys
    };
  }

  function getSettings() {
    try {
      return JSON.parse(ZS.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveSettings(obj) {
    var cur = getSettings();
    var merged = Object.assign({}, cur, obj);
    ZS.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }

  function isLikelyGoogleClientId(value) {
    var v = String(value || '').trim();
    return /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(v);
  }

  function getClientId() {
    var settings = getSettings();
    if (settings && settings.google && settings.google.clientId) {
      var fromSettings = String(settings.google.clientId).trim();
      if (isLikelyGoogleClientId(fromSettings)) return fromSettings;
    }
    var raw = ZS.getItem('zeralda-google-client-id');
    if (raw && String(raw).trim()) {
      var fromStorage = String(raw).trim();
      if (isLikelyGoogleClientId(fromStorage)) return fromStorage;
    }
    return DEFAULT_CLIENT_ID;
  }

  function getGoogleProfile() {
    try {
      var profile = JSON.parse(ZS.getItem(getGProfileKey())) || null;
      // Fallback: ابحث في المفتاح العام
      if (!profile) {
        var globalProfile = ZS.getItem(GPROFILE_KEY_BASE);
        if (globalProfile) {
          try {
            profile = JSON.parse(globalProfile);
            if (profile) ZS.setItem(getGProfileKey(), globalProfile);
          } catch (_) {}
        }
      }
      // Fallback: ابحث في مفاتيح مستخدمين آخرين
      if (!profile) {
        try {
          var allKeys = ZS.keys ? ZS.keys() : [];
          for (var i = 0; i < allKeys.length; i++) {
            if (allKeys[i] && allKeys[i].indexOf(GPROFILE_KEY_BASE + '::') === 0 && allKeys[i] !== getGProfileKey()) {
              var rawVal = ZS.getItem(allKeys[i]);
              if (rawVal) {
                try {
                  var p = JSON.parse(rawVal);
                  if (p && (p.email || p.name)) {
                    ZS.setItem(getGProfileKey(), rawVal);
                    profile = p;
                    break;
                  }
                } catch (_) {}
              }
            }
          }
        } catch (_) {}
      }
      return profile;
    } catch (e) {
      return null;
    }
  }

  function saveGoogleProfile(profile) {
    ZS.setItem(getGProfileKey(), JSON.stringify(profile || {}));
  }

  function clearGoogleProfile() {
    ZS.removeItem(getGProfileKey());
  }

  function saveGoogleToken(token) {
    var normalized = Object.assign({}, token || {});
    var nowMs = Date.now();
    normalized.issued_at = nowMs;
    normalized.user_id = getActiveUserId();
    if (Number(normalized.expires_in) > 0) {
      normalized.expires_at = nowMs + (Number(normalized.expires_in) * 1000);
    }
    ZS.setItem(getGTokenKey(), JSON.stringify(normalized));
    accessToken = normalized && normalized.access_token ? normalized.access_token : null;
  }

  function loadGoogleToken() {
    try {
      var token = JSON.parse(ZS.getItem(getGTokenKey()));
      // Fallback: ابحث في المفتاح العام أو مفاتيح مستخدمين آخرين
      if (!token) {
        var globalToken = ZS.getItem(GTOKEN_KEY_BASE);
        if (globalToken) {
          try { token = JSON.parse(globalToken); } catch (_) {}
        }
      }
      if (!token) {
        // ابحث في كل المفاتيح التي تبدأ بـ zeralda-google-token::
        try {
          var allKeys = ZS.keys ? ZS.keys() : [];
          for (var i = 0; i < allKeys.length; i++) {
            if (allKeys[i] && allKeys[i].indexOf(GTOKEN_KEY_BASE + '::') === 0 && allKeys[i] !== getGTokenKey()) {
              var rawVal = ZS.getItem(allKeys[i]);
              if (rawVal) {
                try {
                  var t = JSON.parse(rawVal);
                  if (t && t.access_token) {
                    // هجرة التوكن إلى المفتاح الحالي
                    ZS.setItem(getGTokenKey(), rawVal);
                    token = t;
                    break;
                  }
                } catch (_) {}
              }
            }
          }
        } catch (_) {}
      }
      if (token && Number(token.expires_at) > 0 && Date.now() >= Number(token.expires_at)) {
        // Token expired — keep metadata for silent refresh, but clear access_token
        token.expired = true;
        accessToken = null;
        return token;
      }
      if (token && token.access_token) accessToken = token.access_token;
      return token;
    } catch (e) {
      return null;
    }
  }

  function clearGoogleToken() {
    ZS.removeItem(getGTokenKey());
    accessToken = null;
  }

  // ─────────────────────────────────────────────────────────
  //  Manual OAuth (implicit flow) — fallback for WebView2/Launcher
  //  Uses window.location redirect instead of GIS popup.
  // ─────────────────────────────────────────────────────────

  function isLikelyWebView2() {
    try {
      // 1) Definitive: WebView2 host object (set by host app via AddHostObjectToScript)
      if (window.chrome && window.chrome.webview) return true;
      // 2) Reliable heuristic: Edge-based UA but chrome.runtime absent.
      //    Real Edge browser always has chrome.runtime; WebView2 typically doesn't.
      var ua = String(navigator.userAgent || '');
      var isEdgeBased = /Edg\//.test(ua);
      if (!isEdgeBased) return false;
      var hasRuntime = !!(window.chrome && window.chrome.runtime);
      return !hasRuntime;
    } catch (e) {
      return false;
    }
  }

  function getManualOAuthRedirectUri() {
    var origin = '';
    try {
      origin = String((window.location && window.location.origin) || '').trim();
    } catch (e) {
      origin = '';
    }

    if (!origin) {
      return 'http://127.0.0.1:8080/oauth_callback.html';
    }

    try {
      var url = new URL(origin);
      // Support localhost, Railway, custom domains, and HTTPS
      return url.origin.replace(/\/+$/, '') + '/oauth_callback.html';
    } catch (e) {
      return origin.replace(/\/+$/, '') + '/oauth_callback.html';
    }
  }

  function startManualOAuth() {
    var clientId = getClientId();
    var redirectUri = getManualOAuthRedirectUri();
    var state = btoa(String(Date.now()) + ':' + Math.random());
    ZS.setItem('zeralda-google-oauth-state', state);

    // Save current page so we can restore scroll position after redirect
    ZS.setItem('zeralda-oauth-redirect-from', window.location.href);
    ZS.setItem('zeralda-oauth-redirect-time', String(Date.now()));

    var url = 'https://accounts.google.com/o/oauth2/v2/auth' +
      '?client_id=' + encodeURIComponent(clientId) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&response_type=token' +
      '&scope=' + encodeURIComponent(SCOPES) +
      '&state=' + encodeURIComponent(state) +
      '&prompt=consent' +
      '&include_granted_scopes=true';

    // Show loading overlay so user doesn't see white screen
    showOAuthLoadingOverlay('Redirecting to Google Sign-In...');

    // Small delay to let overlay render before navigation
    setTimeout(function () {
      window.location.href = url;
    }, 100);
  }

  function showOAuthLoadingOverlay(message) {
    try {
      var existing = document.getElementById('zeralda-oauth-overlay');
      if (existing) existing.remove();
      var div = document.createElement('div');
      div.id = 'zeralda-oauth-overlay';
      div.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#f8fafc;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;';
      div.innerHTML = '<div style="width:48px;height:48px;border:4px solid #e5e7eb;border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:16px;"></div>' +
        '<div style="color:#374151;font-size:16px;font-weight:500;">' + (message || 'Loading...') + '</div>' +
        '<style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
      document.body.appendChild(div);
    } catch (e) {}
  }

  function hideOAuthLoadingOverlay() {
    try {
      var el = document.getElementById('zeralda-oauth-overlay');
      if (el) el.remove();
    } catch (e) {}
  }

  function tryHandleManualOAuthRedirect() {
    // Always hide overlay on page load (in case we came back from OAuth)
    hideOAuthLoadingOverlay();

    var hash = window.location.hash;
    if (!hash || hash.indexOf('access_token=') === -1) {
      // Also check for error in hash
      if (hash && hash.indexOf('error=') !== -1) {
        var errParams = new URLSearchParams(hash.substring(1));
        var err = errParams.get('error');
        console.error('[Manual OAuth] Error in URL hash:', err);
        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        return true; // handled (error)
      }
      return false;
    }

    console.log('[Manual OAuth] Detected access_token in URL hash');

    var params = new URLSearchParams(hash.substring(1));
    var token = params.get('access_token');
    var expiresIn = params.get('expires_in');
    var state = params.get('state');
    var error = params.get('error');

    // Clear hash from URL
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

    if (error) {
      console.error('[Manual OAuth] Error:', error);
      return true; // handled
    }

    if (!token) {
      console.warn('[Manual OAuth] No token found despite access_token in hash');
      return false;
    }

    // Validate state
    var savedState = ZS.getItem('zeralda-google-oauth-state');
    ZS.removeItem('zeralda-google-oauth-state');
    if (savedState && state !== savedState) {
      console.error('[Manual OAuth] State mismatch, possible CSRF');
      return true;
    }

    accessToken = token;
    var tokenData = {
      access_token: token,
      expires_at: Date.now() + (parseInt(expiresIn || '3600', 10) * 1000)
    };
    saveGoogleToken(tokenData);

    console.log('[Manual OAuth] Token saved, fetching profile...');

    // Fetch profile then signal ready
    fetchProfile().then(function () {
      console.log('[Manual OAuth] Signed in successfully');
    }).catch(function () {
      console.log('[Manual OAuth] Token acquired (profile fetch failed)');
    });

    return true;
  }

  function initTokenClient(forceRecreate) {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) return;

    var resolvedClientId = getClientId();
    if (!forceRecreate && tokenClient && lastClientIdUsed === resolvedClientId) return;

    // Check settings for preferred mode, or auto-detect WebView2
    var settings = getSettings();
    var googleSettings = settings && settings.google ? settings.google : {};
    var preferredMode = googleSettings.oauthMode || 'auto'; // 'auto', 'popup', 'redirect'

    var useRedirect = preferredMode === 'redirect' || (preferredMode === 'auto' && isLikelyWebView2());

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: resolvedClientId,
      scope: SCOPES,
      // Use redirect mode for WebView2 (no popup support) or if explicitly set
      ux_mode: useRedirect ? 'redirect' : 'popup',
      redirect_uri: useRedirect ? getManualOAuthRedirectUri() : undefined,
      error_callback: function (err) {
        var mapped = err || {};
        var t = String(mapped.type || '').toLowerCase();
        if (!mapped.error) {
          if (t === 'popup_failed_to_open') mapped.error = 'popup_failed_to_open';
          else if (t === 'popup_closed') mapped.error = 'popup_closed_by_user';
          else mapped.error = t || 'oauth_error';
        }
        console.warn('[OAuth error_callback]', mapped);
        if (mapped.error === 'popup_failed_to_open') {
          console.warn('[GoogleSync] Popup blocked by browser. Automatically falling back to direct redirect OAuth mode...');
          startManualOAuth();
          return;
        }
        if (pendingTokenCallback) pendingTokenCallback(mapped);
        pendingTokenCallback = null;
      },
      callback: function (resp) {
        if (resp && resp.error) {
          if (resp.error === 'invalid_client') {
            var setupOrigin = typeof window !== 'undefined' && window.location ?
                             (window.location.origin || 'https://your-domain.com') : 'https://your-domain.com';
            var err = new Error('Invalid OAuth Client ID or origin mismatch.\n\n' +
                               'Add to Google Cloud Console:\n' +
                               'Authorized JavaScript origin: ' + setupOrigin + '\n' +
                               'Authorized redirect URI: ' + getManualOAuthRedirectUri());
            err.code = 'invalid_client';
            if (pendingTokenCallback) pendingTokenCallback(err);
            pendingTokenCallback = null;
            return;
          }
          if (pendingTokenCallback) pendingTokenCallback(resp);
          pendingTokenCallback = null;
          return;
        }

        accessToken = resp.access_token;
        saveGoogleToken(resp);

        fetchProfile().then(function () {
          if (pendingTokenCallback) pendingTokenCallback(null, resp);
          pendingTokenCallback = null;
        }).catch(function () {
          if (pendingTokenCallback) pendingTokenCallback(null, resp);
          pendingTokenCallback = null;
        });
      }
    });

    lastClientIdUsed = resolvedClientId;
  }

  function requestToken(cb, forceConsent) {
    pendingTokenCallback = cb;
    initTokenClient(true);

    if (!tokenClient) {
      if (cb) cb(new Error('Google Identity Services not loaded'));
      return;
    }

    tokenClient.requestAccessToken({ prompt: forceConsent ? 'consent' : '' });
  }

  function setClientId(clientId) {
    var value = String(clientId || '').trim();
    var settings = getSettings();
    settings.google = settings.google || {};

    if (!value) {
      delete settings.google.clientId;
      ZS.removeItem('zeralda-google-client-id');
    } else {
      settings.google.clientId = value;
      ZS.setItem('zeralda-google-client-id', value);
    }

    saveSettings(settings);
    tokenClient = null;
    lastClientIdUsed = null;
  }

  // ─────────────────────────────────────────────────────────
  //  Silent token refresh — re-request token without UI prompt
  //  Used when the saved token has expired but user previously connected.
  //  GIS with prompt:'' will silently refresh if Google session is active.
  // ─────────────────────────────────────────────────────────
  var _silentRefreshInProgress = false;

  function silentRefreshToken(cb) {
    if (_silentRefreshInProgress) {
      if (cb) cb(false);
      return;
    }
    if (isLikelyWebView2()) {
      // In WebView2/redirect mode, silent refresh isn't possible without a popup.
      // Keep the expired token metadata so user appears "connected" and can re-consent manually.
      if (cb) cb(false);
      return;
    }
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      if (cb) cb(false);
      return;
    }

    _silentRefreshInProgress = true;
    pendingTokenCallback = function (err, resp) {
      _silentRefreshInProgress = false;
      if (err) {
        if (cb) cb(false);
      } else {
        if (cb) cb(true);
      }
    };

    initTokenClient(true);
    if (!tokenClient) {
      _silentRefreshInProgress = false;
      pendingTokenCallback = null;
      if (cb) cb(false);
      return;
    }

    // prompt:'' = silent refresh (no consent dialog, no popup if session active)
    try {
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
      _silentRefreshInProgress = false;
      pendingTokenCallback = null;
      if (cb) cb(false);
    }
  }

  function tryAutoReconnect(cb) {
    var savedToken = loadGoogleToken();

    // No saved token at all — never connected
    if (!savedToken) {
      if (cb) cb(false);
      return;
    }

    // Token expired — attempt silent refresh before giving up
    if (savedToken.expired || !savedToken.access_token) {
      silentRefreshToken(function (ok) {
        if (ok) {
          // Refresh succeeded — re-load the fresh token and verify
          var freshToken = loadGoogleToken();
          if (freshToken && freshToken.access_token) {
            // Verify the fresh token works
            fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { 'Authorization': 'Bearer ' + freshToken.access_token }
            }).then(function (r) {
              if (r.ok) {
                return r.json().then(function (info) {
                  saveGoogleProfile({
                    email: info && info.email,
                    name: info && info.name,
                    picture: info && info.picture,
                    sub: info && info.sub
                  });
                  if (cb) cb(true);
                }).catch(function () { if (cb) cb(true); });
              } else if (r.status === 401) {
                clearGoogleToken();
                clearGoogleProfile();
                if (cb) cb(false);
              } else {
                if (cb) cb(true);
              }
            }).catch(function () { if (cb) cb(true); });
          } else {
            if (cb) cb(true); // Token saved but couldn't verify yet
          }
        } else {
          // Silent refresh failed — user needs to manually re-connect
          if (cb) cb(false);
        }
      });
      return;
    }

    // Token still valid — verify it
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': 'Bearer ' + savedToken.access_token }
    }).then(function (r) {
      if (r.ok) {
        return r.json().then(function (info) {
          accessToken = savedToken.access_token;
          saveGoogleProfile({
            email: info && info.email,
            name: info && info.name,
            picture: info && info.picture,
            sub: info && info.sub
          });
          if (cb) cb(true);
        }).catch(function () {
          accessToken = savedToken.access_token;
          if (cb) cb(true);
        });
      }

      if (r.status === 401) {
        // Token is invalid — try silent refresh before clearing
        silentRefreshToken(function (ok) {
          if (ok) {
            if (cb) cb(true);
          } else {
            clearGoogleToken();
            clearGoogleProfile();
            if (cb) cb(false);
          }
        });
        return;
      }

      accessToken = savedToken.access_token;
      if (cb) cb(true);
    }).catch(function () {
      accessToken = savedToken.access_token;
      if (cb) cb(true);
    });
  }

  function signOut() {
    if (accessToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
      try {
        google.accounts.oauth2.revoke(accessToken, function () {});
      } catch (_) {}
    }
    clearGoogleToken();
    clearGoogleProfile();
    accessToken = null;
  }

  function fetchProfile() {
    if (!accessToken) return Promise.reject(new Error('Not signed in'));
    return fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    }).then(function (r) {
      if (!r.ok) {
        if (r.status === 401) {
          // Do not clear token immediately; 401 can be transient right after OAuth.
          throw new Error('Google profile not available yet. Please retry in a moment.');
        }
        throw new Error('Failed to fetch profile');
      }
      return r.json();
    }).then(function (info) {
      var profile = {
        email: info.email,
        name: info.name,
        picture: info.picture,
        sub: info.sub
      };
      saveGoogleProfile(profile);
      return profile;
    });
  }

  function gFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Authorization': 'Bearer ' + accessToken }, opts.headers || {});

    return fetch(url, opts).then(function (r) {
      if (r.status === 401) {
        clearGoogleToken();
        throw new Error('Token expired');
      }
      if (r.status === 403) {
        return new Promise(function (resolve, reject) {
          requestToken(function (err) {
            if (err) {
              reject(new Error('Access denied. Re-authorize and try again.'));
              return;
            }

            var retryOpts = Object.assign({}, opts);
            retryOpts.headers = Object.assign({}, retryOpts.headers, { 'Authorization': 'Bearer ' + accessToken });
            fetch(url, retryOpts).then(function (r2) {
              if (r2.status === 403) {
                reject(new Error('API access denied (403). Enable the API in Google Cloud Console.'));
                return;
              }
              resolve(r2);
            }).catch(reject);
          }, true);
        });
      }
      return r;
    });
  }

  function findOrCreateFolder() {
    var q = "name='" + DRIVE_FOLDER_NAME + "' and mimeType='application/vnd.google-apps.folder' and trashed=false";

    return gFetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.files && data.files.length > 0) return data.files[0].id;

        return gFetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' })
        }).then(function (r) { return r.json(); }).then(function (f) { return f.id; });
      });
  }

  function collectAllData() {
    var company = getActiveCompany();
    var scopedSet = getScopedSet();
    var companyScopeId = resolveCompanyScopeId(company && company.id);
    
    // Exclude temporary/technical keys that shouldn't be backed up
    var excludePatterns = [
      'google-token',           // Temporary OAuth token
      'google-contact-sync',    // Temporary sync state
      'drive-search',           // Temporary search cache
      'temp-',                  // Any temporary data
      'cache-',                 // Cache data
      'session-',               // Session data
      '-draft-'                 // Draft/temporary items
    ];

    var payload = {
      exportedAt: new Date().toISOString(),
      origin: location.origin,
      companyId: companyScopeId,
      companyName: company.name,
      data: {}
    };

    // Collect ALL localStorage keys (not just hardcoded list)
    for (var i = 0; i < ZS.length; i++) {
      var key = ZS.key(i);
      if (!key) continue;
      
      // Skip excluded patterns
      var shouldExclude = excludePatterns.some(function (pattern) {
        return key.indexOf(pattern) !== -1;
      });
      
      if (!shouldExclude) {
        var raw = ZS.getItem(key);
        if (raw !== null) {
          var normalizedKey = key;
          if (scopedSet[key] && key.indexOf('::') === -1) {
            normalizedKey = key + '::' + companyScopeId;
          }
          payload.data[normalizedKey] = raw;
        }
      }
    }

    // Also include critical data keys that MUST be backed up
    // (ensures companies, users, roles and all ERP data are never missed)
    var criticalKeys = [
      // ── إعدادات النظام والشركات والمستخدمين ──────────────────────────
      'zeralda-settings',
      'zeralda-system-settings',
      'zeralda-active-company',
      'zeralda-companies',
      'zeralda-users',
      'zeralda-roles',
      'zeralda-module-settings',
      'zeralda-integrations',
      'zeralda-backup-history',
      'zeralda-personal-settings-default',
      // ── بيانات ERP الأساسية ───────────────────────────────────────────
      'employees-data',
      'payroll-data',
      'customers-data',
      'invoices-data',
      'proformas-data',
      'sales-data',
      'products-data',
      'inventory-categories',
      'stock-movements',
      'suppliers-data',
      'purchases-data',
      'purchase-orders-data',
      'zeralda-purchasing-data',
      'finance-transactions',
      'accounting-entries',
      'hr-leaves',
      'crm-opportunities',
      'crm-contacts',
      'consultations-data',
      'tenders-data',
      'zeralda-services',
      'zeralda-services-master'
    ];

    criticalKeys.forEach(function(key) {
      var normalizedKey = (scopedSet[key] && key.indexOf('::') === -1)
        ? (key + '::' + companyScopeId)
        : key;
      if (!Object.prototype.hasOwnProperty.call(payload.data, normalizedKey)) {
        var val = ZS.getItem(key);
        if (val !== null) {
          payload.data[normalizedKey] = val;
        }
      }
    });

    payload.data = normalizeCompanyScopedDataMap(payload.data, companyScopeId).data;
    return payload;
  }

  function repairCompanyScopedData(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var activeCompany = getActiveCompany();
    var companyScopeId = resolveCompanyScopeId(activeCompany && activeCompany.id);
    var scopedSet = getScopedSet();

    var rawKeys = [];
    for (var i = 0; i < ZS.length; i++) {
      var k = ZS.key(i);
      if (k) rawKeys.push(k);
    }

    var rawSet = {};
    rawKeys.forEach(function (k) { rawSet[k] = true; });

    var created = 0;
    var legacyGlobalKeys = [];
    var syncedPatch = {};

    Object.keys(scopedSet).forEach(function (baseKey) {
      var scopedKey = baseKey + '::' + companyScopeId;
      var hasLegacyGlobal = !!rawSet[baseKey];
      var hasScoped = !!rawSet[scopedKey];
      if (!hasLegacyGlobal) return;
      legacyGlobalKeys.push(baseKey);
      if (hasScoped) return;

      var rawValue = ZS.getItem(baseKey);
      if (rawValue === null || rawValue === undefined) return;
      ZS.setItem(scopedKey, rawValue);
      syncedPatch[scopedKey] = rawValue;
      created += 1;
    });

    var pendingState = _loadPendingServerSyncData();
    var pendingData = pendingState.data && typeof pendingState.data === 'object' ? pendingState.data : {};
    var normalizedPending = normalizeCompanyScopedDataMap(pendingData, companyScopeId).data;
    var pendingChanged = JSON.stringify(pendingData) !== JSON.stringify(normalizedPending);
    if (pendingChanged) {
      _savePendingServerSyncData(normalizedPending);
    }

    var shouldSync = opts.syncToServer !== false;
    var token = _getSessionToken();
    var patchKeys = Object.keys(syncedPatch);

    if (!shouldSync || !token || patchKeys.length === 0) {
      return Promise.resolve({
        ok: true,
        companyId: companyScopeId,
        createdScopedKeys: created,
        detectedLegacyGlobalKeys: legacyGlobalKeys,
        pendingNormalized: pendingChanged,
        syncedToServer: false,
        reason: !shouldSync ? 'sync_disabled' : (!token ? 'missing_session_token' : 'nothing_to_sync')
      });
    }

    var headers = { 'Content-Type': 'application/json' };
    headers['Authorization'] = 'Bearer ' + token;
    headers['X-Session-Token'] = token;

    return _syncDataToServer(syncedPatch, headers, 'repair_scoped_data', normalizedPending)
      .then(function (summary) {
        _savePendingServerSyncData(normalizedPending);
        return {
          ok: true,
          companyId: companyScopeId,
          createdScopedKeys: created,
          detectedLegacyGlobalKeys: legacyGlobalKeys,
          pendingNormalized: pendingChanged,
          syncedToServer: true,
          summary: summary
        };
      })
      .catch(function (err) {
        return {
          ok: false,
          companyId: companyScopeId,
          createdScopedKeys: created,
          detectedLegacyGlobalKeys: legacyGlobalKeys,
          pendingNormalized: pendingChanged,
          syncedToServer: false,
          error: err && err.message ? err.message : String(err || 'unknown_error')
        };
      });
  }

  function _getSessionToken() {
    if (window.ZeraldaAuth) return window.ZeraldaAuth.getSessionToken();
    return ZS.getItem('zeralda-auth-token') ||
           ZS.getItem('zeralda-session-token') || '';
  }

  var _pendingServerSyncKey = 'zeralda-google-pending-server-sync';

  function _loadPendingServerSyncData() {
    try {
      var raw = ZS.getItem(_pendingServerSyncKey);
      if (!raw) return { updatedAt: null, data: {} };
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { updatedAt: null, data: {} };
      var data = parsed.data && typeof parsed.data === 'object' ? parsed.data : {};
      return {
        updatedAt: parsed.updatedAt || null,
        data: data
      };
    } catch (_) {
      return { updatedAt: null, data: {} };
    }
  }

  function _savePendingServerSyncData(data) {
    var obj = data && typeof data === 'object' ? data : {};
    var count = Object.keys(obj).length;
    if (!count) {
      ZS.removeItem(_pendingServerSyncKey);
      return;
    }
    ZS.setItem(_pendingServerSyncKey, JSON.stringify({
      updatedAt: new Date().toISOString(),
      count: count,
      data: obj
    }));
  }

  function _emitGoogleSyncState(detail) {
    try {
      root.dispatchEvent(new CustomEvent('zeralda-google-sync-state', {
        detail: detail || {}
      }));
    } catch (_) {}
  }

  function getPendingServerSyncStatus() {
    var pending = _loadPendingServerSyncData();
    var keys = Object.keys(pending.data || {});
    return {
      pendingCount: keys.length,
      pendingKeysSample: keys.slice(0, 20),
      updatedAt: pending.updatedAt || null
    };
  }

  function _retryPendingInBackground() {
    var status = getPendingServerSyncStatus();
    if (!status.pendingCount) return;
    retryPendingServerSync().catch(function () {});
  }

  function _sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms || 0); });
  }

  function _chunkObject(obj, maxKeys) {
    var out = [];
    var current = {};
    var count = 0;
    var limit = Math.max(1, Number(maxKeys || 80));

    Object.keys(obj || {}).forEach(function (k) {
      current[k] = obj[k];
      count += 1;
      if (count >= limit) {
        out.push(current);
        current = {};
        count = 0;
      }
    });

    if (count > 0) out.push(current);
    return out;
  }

  function _syncChunkFallbackPerKey(chunk, headers) {
    var entries = Object.entries(chunk || {});
    var written = 0;
    var skipped = 0;
    var failedKeys = [];
    var chain = Promise.resolve();

    entries.forEach(function (entry) {
      chain = chain.then(function () {
        return fetch('/api/store', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ key: entry[0], value: entry[1] })
        }).then(function (r) {
          if (r.ok) written += 1;
          else {
            skipped += 1;
            failedKeys.push(entry[0]);
          }
        }).catch(function () {
          skipped += 1;
          failedKeys.push(entry[0]);
        });
      });
    });

    return chain.then(function () {
      return { written: written, skipped: skipped, failedKeys: failedKeys };
    });
  }

  function _syncChunkWithRetry(chunk, headers, attempt, maxAttempts) {
    var currentAttempt = Number(attempt || 1);
    var maxTry = Number(maxAttempts || 3);

    return fetch('/api/store/bulk', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ data: chunk })
    }).then(function (r) {
      return r.json().catch(function () {
        return { ok: false, error: 'Invalid JSON response from server' };
      }).then(function (d) {
        if (r.ok && d && d.ok) {
          return {
            ok: true,
            written: Number(d.written || 0),
            skipped: Number(d.skipped || 0),
            skippedKeys: Array.isArray(d.skipped_keys) ? d.skipped_keys : []
          };
        }

        var retriable = (r.status === 408 || r.status === 429 || r.status >= 500);
        if (retriable && currentAttempt < maxTry) {
          return _sleep(350 * currentAttempt).then(function () {
            return _syncChunkWithRetry(chunk, headers, currentAttempt + 1, maxTry);
          });
        }

        return {
          ok: false,
          status: r.status,
          error: (d && d.error) || ('HTTP ' + r.status)
        };
      });
    }).catch(function (err) {
      if (currentAttempt < maxTry) {
        return _sleep(350 * currentAttempt).then(function () {
          return _syncChunkWithRetry(chunk, headers, currentAttempt + 1, maxTry);
        });
      }

      return {
        ok: false,
        status: 0,
        error: (err && err.message) ? err.message : 'Network error'
      };
    });
  }

  function _syncDataToServer(dataToSync, headers, sourceTag, pendingDataRef) {
    var chunks = _chunkObject(dataToSync || {}, 80);
    var totalWritten = 0;
    var totalSkipped = 0;
    var totalFailedChunks = 0;
    var skippedKeySamples = [];
    var index = 0;

    function _markFailedKeys(keys, chunk) {
      (keys || []).forEach(function (k) {
        if (!k || !chunk || !Object.prototype.hasOwnProperty.call(chunk, k)) return;
        pendingDataRef[k] = chunk[k];
      });
    }

    function _markSuccessKeys(chunkKeys) {
      (chunkKeys || []).forEach(function (k) {
        delete pendingDataRef[k];
      });
    }

    function syncNextChunk() {
      if (index >= chunks.length) return Promise.resolve();
      var chunk = chunks[index++];
      var chunkKeys = Object.keys(chunk);

      return _syncChunkWithRetry(chunk, headers, 1, 3).then(function (res) {
        if (res && res.ok) {
          var serverSkippedKeys = Array.isArray(res.skippedKeys)
            ? res.skippedKeys.map(function (x) { return x && x.key ? x.key : null; }).filter(Boolean)
            : [];

          if (Number(res.skipped || 0) > 0 && serverSkippedKeys.length === 0) {
            return _syncChunkFallbackPerKey(chunk, headers).then(function (fb) {
              totalWritten += Number((fb && fb.written) || 0);
              totalSkipped += Number((fb && fb.skipped) || 0);
              _markSuccessKeys(chunkKeys);
              _markFailedKeys((fb && fb.failedKeys) || [], chunk);
              return syncNextChunk();
            });
          }

          totalWritten += Number(res.written || 0);
          totalSkipped += Number(res.skipped || 0);
          _markSuccessKeys(chunkKeys);
          _markFailedKeys(serverSkippedKeys, chunk);

          if (Array.isArray(res.skippedKeys) && res.skippedKeys.length) {
            skippedKeySamples = skippedKeySamples.concat(res.skippedKeys.slice(0, 5));
          }
          return syncNextChunk();
        }

        totalFailedChunks += 1;
        return _syncChunkFallbackPerKey(chunk, headers).then(function (fb) {
          totalWritten += Number((fb && fb.written) || 0);
          totalSkipped += Number((fb && fb.skipped) || 0);
          _markSuccessKeys(chunkKeys);
          _markFailedKeys((fb && fb.failedKeys) || [], chunk);
          return syncNextChunk();
        });
      });
    }

    return syncNextChunk().then(function () {
      var sampleKeys = skippedKeySamples
        .slice(0, 5)
        .map(function (x) { return x && x.key ? x.key : ''; })
        .filter(Boolean);
      var pendingCount = Object.keys(pendingDataRef).length;

      if (totalSkipped > 0 || pendingCount > 0) {
        console.warn('[Google Sync] Completed with skips. source=' + sourceTag + ', written=' + totalWritten + ', skipped=' + totalSkipped + ', failed_chunks=' + totalFailedChunks + ', pending=' + pendingCount + (sampleKeys.length ? ', sample_keys=' + sampleKeys.join(',') : ''));
      } else {
        console.log('[Google Sync] ✅ Completed. source=' + sourceTag + ', written=' + totalWritten + ', chunks=' + chunks.length + ', fallback_chunks=' + totalFailedChunks);
      }

      var detail = {
        source: sourceTag,
        written: totalWritten,
        skipped: totalSkipped,
        failedChunks: totalFailedChunks,
        pendingCount: pendingCount,
        sampleKeys: sampleKeys
      };
      _emitGoogleSyncState(detail);
      return detail;
    });
  }

  function retryPendingServerSync() {
    var token = _getSessionToken();
    if (!token) {
      var noTokenStatus = { ok: false, skipped: true, reason: 'missing_session_token', pendingCount: getPendingServerSyncStatus().pendingCount };
      _emitGoogleSyncState({ source: 'retry_pending', pendingCount: noTokenStatus.pendingCount, skipped: true, reason: 'missing_session_token' });
      return Promise.resolve(noTokenStatus);
    }

    var pending = _loadPendingServerSyncData();
    var pendingData = pending.data && typeof pending.data === 'object' ? pending.data : {};
    var pendingCount = Object.keys(pendingData).length;
    if (!pendingCount) {
      _emitGoogleSyncState({ source: 'retry_pending', pendingCount: 0, skipped: true, reason: 'nothing_pending' });
      return Promise.resolve({ ok: true, skipped: true, reason: 'nothing_pending', pendingCount: 0 });
    }

    var headers = { 'Content-Type': 'application/json' };
    headers['Authorization'] = 'Bearer ' + token;
    headers['X-Session-Token'] = token;

    var syncData = Object.assign({}, pendingData);
    return _syncDataToServer(syncData, headers, 'retry_pending', pendingData)
      .then(function (summary) {
        _savePendingServerSyncData(pendingData);
        return {
          ok: true,
          retried: pendingCount,
          pendingCount: Object.keys(pendingData).length,
          summary: summary
        };
      })
      .catch(function (err) {
        _savePendingServerSyncData(pendingData);
        var detail = {
          source: 'retry_pending',
          pendingCount: Object.keys(pendingData).length,
          error: err && err.message ? err.message : String(err || 'unknown_error')
        };
        _emitGoogleSyncState(detail);
        return {
          ok: false,
          error: detail.error,
          pendingCount: detail.pendingCount
        };
      });
  }

  function restoreAllData(payload) {
    if (!payload || !payload.data) return Promise.resolve(0);

    var backupCompanyId = resolveBackupCompanyId(payload);
    var normalizedData = normalizeCompanyScopedDataMap(payload.data, backupCompanyId).data;

    var keys = Object.keys(normalizedData);

    // إصلاح: اسحب البيانات الحالية من الخادم أولاً، ثم ادمج قبل الكتابة
    var token = _getSessionToken();
    var headers = { 'Content-Type': 'application/json' };
    if (token) { headers['Authorization'] = 'Bearer ' + token; headers['X-Session-Token'] = token; }

    var pendingState = _loadPendingServerSyncData();
    var pendingData = pendingState.data && typeof pendingState.data === 'object' ? pendingState.data : {};

    if (!token) {
      // لا يوجد token — اكتب محلياً فقط
      keys.forEach(function (k) {
        try { ZS.setItem(k, normalizedData[k]); } catch (e) {}
      });
      console.warn('[Google Restore] No auth token. Local restore completed; server sync skipped.');
      Object.keys(normalizedData || {}).forEach(function (k) { pendingData[k] = normalizedData[k]; });
      _savePendingServerSyncData(pendingData);
      _emitGoogleSyncState({ source: 'restore', pendingCount: Object.keys(pendingData).length, skipped: true, reason: 'missing_session_token' });
      return Promise.resolve(keys.length);
    }

    // إصلاح: اسحب البيانات الحالية من الخادم وادمج قبل الكتابة
    return _pullAndMergeForRestore(normalizedData, headers).then(function (mergedData) {
      // 1. Write merged data to localStorage
      Object.keys(mergedData).forEach(function (k) {
        try { ZS.setItem(k, mergedData[k]); } catch (e) {}
      });

      // 2. Bulk push merged data to server
      return _syncDataToServer(mergedData, headers, 'restore', pendingData).then(function () {
        _savePendingServerSyncData(pendingData);
        return Object.keys(mergedData).length;
      });
    }).catch(function (err) {
      // Fallback: اكتب محلياً بدون merge
      console.warn('[Google Restore] Merge failed, doing direct restore:', err && err.message ? err.message : err);
      keys.forEach(function (k) {
        try { ZS.setItem(k, normalizedData[k]); } catch (e) {}
      });
      Object.keys(normalizedData || {}).forEach(function (k) { pendingData[k] = normalizedData[k]; });
      _savePendingServerSyncData(pendingData);
      _emitGoogleSyncState({
        source: 'restore',
        pendingCount: Object.keys(pendingData).length,
        error: err && err.message ? err.message : String(err || 'unknown_error')
      });
      return keys.length;
    });
  }

  // إصلاح: اسحب البيانات الحالية من الخادم وادمج مع بيانات النسخة الاحتياطية
  function _pullAndMergeForRestore(backupData, headers) {
    var keys = Object.keys(backupData);
    if (keys.length === 0) return Promise.resolve({});

    // اسحب البيانات الحالية من الخادم
    return fetch('/api/store/mget', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ keys: keys })
    }).then(function (res) {
      if (!res.ok) return backupData; // إذا فشل، استخدم بيانات النسخة فقط
      return res.json().then(function (body) {
        var serverData = body.data || body.store || {};
        var merged = {};

        keys.forEach(function (k) {
          var backupVal = backupData[k];
          var serverVal = serverData[k];

          if (serverVal === undefined || serverVal === null) {
            // لا توجد بيانات في الخادم — استخدم بيانات النسخة
            merged[k] = backupVal;
            return;
          }

          // ادمج: إذا كلاهما مصفوفات، ادمج بالـ id
          var backupParsed = backupVal;
          var serverParsed = serverVal;
          if (typeof backupVal === 'string') { try { backupParsed = JSON.parse(backupVal); } catch (_) {} }
          if (typeof serverVal === 'string') { try { serverParsed = JSON.parse(serverVal); } catch (_) {} }

          if (Array.isArray(backupParsed) && Array.isArray(serverParsed)) {
            // ادمج المصفوفات بالـ id
            var mergedArr = [];
            var seen = {};
            serverParsed.forEach(function (item) {
              if (item && item.id) { seen[String(item.id)] = item; mergedArr.push(item); }
              else mergedArr.push(item);
            });
            backupParsed.forEach(function (item) {
              if (item && item.id) {
                if (!seen[String(item.id)]) { seen[String(item.id)] = item; mergedArr.push(item); }
              } else {
                var exists = mergedArr.some(function (m) { return JSON.stringify(m) === JSON.stringify(item); });
                if (!exists) mergedArr.push(item);
              }
            });
            merged[k] = JSON.stringify(mergedArr);
          } else if (typeof backupParsed === 'object' && typeof serverParsed === 'object' && !Array.isArray(backupParsed) && !Array.isArray(serverParsed)) {
            // ادمج الكائنات
            merged[k] = JSON.stringify(Object.assign({}, serverParsed, backupParsed));
          } else {
            // بيانات النسخة الاحتياطية تفوق
            merged[k] = backupVal;
          }
        });

        return merged;
      });
    }).catch(function () {
      return backupData; // إذا فشل السحب، استخدم بيانات النسخة فقط
    });
  }

  function getBackupPassphrase() {
    var settings = getSettings();
    var google = settings && settings.google ? settings.google : {};
    var fromSettings = String(google.backupPassphrase || '').trim();
    if (fromSettings) return fromSettings;
    var fromStorage = String(ZS.getItem('zeralda-google-backup-passphrase') || '').trim();
    return fromStorage || '';
  }

  function bytesToBase64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function base64ToBytes(b64) {
    var bin = atob(String(b64 || ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }

  function deriveAesKey(passphrase, saltBytes, usage) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey'])
      .then(function (baseKey) {
        return crypto.subtle.deriveKey({
          name: 'PBKDF2',
          salt: saltBytes,
          iterations: 120000,
          hash: 'SHA-256'
        }, baseKey, { name: 'AES-GCM', length: 256 }, false, usage);
      });
  }

  function maybeEncryptBackupPayload(payload) {
    var passphrase = getBackupPassphrase();
    var hasCrypto = !!(root.crypto && root.crypto.subtle && root.crypto.getRandomValues);
    if (!passphrase || !hasCrypto) {
      return Promise.resolve({ payload: payload, encrypted: false });
    }

    var enc = new TextEncoder();
    var plaintext = enc.encode(JSON.stringify(payload));
    var salt = root.crypto.getRandomValues(new Uint8Array(16));
    var iv = root.crypto.getRandomValues(new Uint8Array(12));

    return deriveAesKey(passphrase, salt, ['encrypt'])
      .then(function (key) {
        return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, plaintext);
      })
      .then(function (cipherBuffer) {
        var wrapped = {
          encrypted: true,
          version: 1,
          alg: 'AES-GCM-256',
          kdf: 'PBKDF2-SHA256',
          iterations: 120000,
          salt: bytesToBase64(salt),
          iv: bytesToBase64(iv),
          ciphertext: bytesToBase64(new Uint8Array(cipherBuffer))
        };
        return { payload: wrapped, encrypted: true };
      });
  }

  function maybeDecryptBackupPayload(payload) {
    if (!payload || payload.encrypted !== true) {
      return Promise.resolve(payload);
    }

    var passphrase = getBackupPassphrase();
    var hasCrypto = !!(root.crypto && root.crypto.subtle && root.crypto.getRandomValues);
    if (!hasCrypto) {
      return Promise.reject(new Error('Browser crypto is not available for encrypted backup restore'));
    }
    if (!passphrase) {
      return Promise.reject(new Error('Encrypted backup detected. Set google.backupPassphrase before restore.'));
    }

    var salt = base64ToBytes(payload.salt);
    var iv = base64ToBytes(payload.iv);
    var cipher = base64ToBytes(payload.ciphertext);
    var dec = new TextDecoder();

    return deriveAesKey(passphrase, salt, ['decrypt'])
      .then(function (key) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, cipher);
      })
      .then(function (plainBuffer) {
        var text = dec.decode(new Uint8Array(plainBuffer));
        return JSON.parse(text);
      })
      .catch(function () {
        throw new Error('Failed to decrypt backup. Passphrase is missing or invalid.');
      });
  }

  function _fetchServerData() {
    var token = _getSessionToken();
    var headers = {};
    if (token) { headers['Authorization'] = 'Bearer ' + token; headers['X-Session-Token'] = token; }
    return fetch('/api/store', { headers: headers })
      .then(function (r) { return r.ok ? r.json() : { ok: false }; })
      .then(function (d) { return (d.ok && d.data && typeof d.data === 'object') ? d.data : {}; })
      .catch(function () { return {}; });
  }

  // Prune old versioned Drive backups (files matching baseName-TIMESTAMP.json),
  // keeping only the most recent MAX_DRIVE_BACKUP_VERSIONS copies.
  var MAX_DRIVE_BACKUP_VERSIONS = 5;
  function _pruneOldDriveBackups(folderId, baseFileName) {
    var basePrefix = baseFileName.replace(/\.json$/i, '') + '-';
    var q = "'" + folderId + "' in parents and trashed=false and name contains '" + basePrefix + "'";
    return gFetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
      '&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc')
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.files || res.files.length <= MAX_DRIVE_BACKUP_VERSIONS) return;
        // res.files is sorted by modifiedTime desc (newest first).
        // Delete everything after the first MAX_DRIVE_BACKUP_VERSIONS.
        var toDelete = res.files.slice(MAX_DRIVE_BACKUP_VERSIONS);
        var deletePromises = [];
        for (var i = 0; i < toDelete.length; i++) {
          // Only delete files that match the versioned pattern (baseName-TIMESTAMP.json)
          if (toDelete[i].name && toDelete[i].name.indexOf(basePrefix) === 0) {
            deletePromises.push(gFetch('https://www.googleapis.com/drive/v3/files/' + toDelete[i].id, {
              method: 'DELETE'
            }).catch(function () {})); // best-effort
          }
        }
        return Promise.all(deletePromises);
      }).catch(function () {}); // best-effort — pruning failure is non-fatal
  }

  // إصلاح: cross-tab lock لمنع نسخ احتياطي متزامن من عدة تبويبات
  var _backupLockKey = 'zeralda-google-backup-lock';
  var _backupLockTTL = 60000; // 60 seconds

  function _acquireBackupLock() {
    try {
      var raw = ZS.getItem(_backupLockKey);
      if (raw) {
        var lock = JSON.parse(raw);
        if (lock && Date.now() - lock.timestamp < _backupLockTTL) {
          // قفل نشط من تبويب آخر
          return false;
        }
      }
      ZS.setItem(_backupLockKey, JSON.stringify({ timestamp: Date.now(), tabId: (window.ZDB && window.ZDB.getTabId) ? window.ZDB.getTabId() : 'unknown' }));
      return true;
    } catch (_) { return true; }
  }

  function _releaseBackupLock() {
    try { ZS.removeItem(_backupLockKey); } catch (_) {}
  }

  // إصلاح: Drive file ID cache — تجنب البحث في كل مرة
  function _getDriveFileIdCache(folderId, fileName) {
    try {
      var cacheKey = 'zeralda-drive-file-id::' + folderId + '::' + fileName;
      var raw = ZS.getItem(cacheKey);
      if (raw) {
        var cache = JSON.parse(raw);
        if (cache && cache.fileId && Date.now() - cache.timestamp < 86400000) { // 24h TTL
          return cache.fileId;
        }
      }
    } catch (_) {}
    return null;
  }

  function _setDriveFileIdCache(folderId, fileName, fileId) {
    try {
      var cacheKey = 'zeralda-drive-file-id::' + folderId + '::' + fileName;
      ZS.setItem(cacheKey, JSON.stringify({ fileId: fileId, timestamp: Date.now() }));
    } catch (_) {}
  }

  // إصلاح: تحقق من صلاحية file ID قبل استخدامه (قد يكون محذوفاً من Drive)
  function _verifyDriveFileId(fileId) {
    if (!fileId) return Promise.resolve(false);
    return gFetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=id,trashed')
      .then(function (r) {
        if (!r.ok) return false; // 404 = محذوف
        return r.json();
      })
      .then(function (meta) {
        if (!meta || !meta.id) return false;
        if (meta.trashed) return false; // في سلة المحذوفات
        return true;
      })
      .catch(function () { return false; });
  }

  // إصلاح: احصل على file ID مع التحقق من صلاحيته
  function _getValidatedDriveFileId(folderId, fileName) {
    var cachedId = _getDriveFileIdCache(folderId, fileName);
    if (!cachedId) return Promise.resolve(null);
    // تحقق من صلاحية الـ ID
    return _verifyDriveFileId(cachedId).then(function (isValid) {
      if (isValid) return cachedId;
      // ID غير صالح — امسح الـ cache وأرجع null
      try {
        var cacheKey = 'zeralda-drive-file-id::' + folderId + '::' + fileName;
        ZS.removeItem(cacheKey);
      } catch (_) {}
      return null;
    });
  }

  // إصلاح: backup verification — تحقق من رفع النسخة بنجاح
  function _verifyBackupUpload(fileId, expectedSize) {
    return gFetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=size,md5Checksum,name')
      .then(function (r) {
        if (!r.ok) throw new Error('Verification failed: HTTP ' + r.status);
        return r.json();
      })
      .then(function (meta) {
        if (!meta || !meta.size) throw new Error('Verification failed: no size');
        var actualSize = parseInt(meta.size, 10);
        if (actualSize === 0) throw new Error('Verification failed: empty file');
        if (expectedSize && Math.abs(actualSize - expectedSize) > 100) {
          console.warn('[google_sync] Backup size mismatch: expected', expectedSize, 'got', actualSize);
        }
        console.log('[google_sync] Backup verified:', meta.name, 'size:', actualSize);
        return true;
      });
  }

  function backupToDrive(onProgress) {
    if (!accessToken) return Promise.reject(new Error('Not signed in'));

    // إصلاح: احصل على القفل قبل البدء
    if (!_acquireBackupLock()) {
      return Promise.reject(new Error('Backup already in progress from another tab'));
    }

    if (onProgress) onProgress('finding_folder');

    return findOrCreateFolder().then(function (folderId) {
      if (onProgress) onProgress('uploading');

      // Merge server data + localStorage to get the complete picture
      return _fetchServerData().then(function (serverData) {
        var payload = collectAllData();
        var normalizedServerData = normalizeCompanyScopedDataMap(serverData, payload.companyId).data;
        // Server data fills any gaps that localStorage might miss
        Object.keys(normalizedServerData).forEach(function (k) {
          if (!payload.data.hasOwnProperty(k)) {
            payload.data[k] = typeof normalizedServerData[k] === 'string'
              ? normalizedServerData[k]
              : JSON.stringify(normalizedServerData[k]);
          }
        });

        var driveFileName = getDriveFileNameForActiveCompany();
      var metadata = {
        name: driveFileName,
        mimeType: 'application/json',
        parents: [folderId]
      };

      // إصلاح: استخدم Drive file ID cache مع التحقق من الصلاحية
      return _getValidatedDriveFileId(folderId, driveFileName).then(function (cachedFileId) {

      return maybeEncryptBackupPayload(payload).then(function (prepared) {
        if (onProgress && prepared.encrypted) onProgress('encrypting');

        var fileContent = JSON.stringify(prepared.payload, null, 2);
        var expectedSize = fileContent.length;

        // إذا لدينا fileId مُخزّن وصالح، استخدمه مباشرة
        if (cachedFileId) {
          var versionedName = driveFileName.replace(/\.json$/i, '') + '-' +
            new Date().toISOString().replace(/[:.]/g, '-') + '.json';
          var copyPromise = gFetch('https://www.googleapis.com/drive/v3/files/' + cachedFileId + '/copy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: versionedName })
          }).then(function () { return _pruneOldDriveBackups(folderId, driveFileName); })
            .catch(function (e) { console.warn('[google_sync] Version copy failed (non-fatal):', e); });

          return copyPromise.then(function () {
            var blob = new Blob([fileContent], { type: 'application/json' });
            return gFetch('https://www.googleapis.com/upload/drive/v3/files/' + cachedFileId + '?uploadType=media', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: blob
            }).then(function (r) { return r.json(); });
          }).then(function (result) {
            // إصلاح: تحقق من الرفع
            return _verifyBackupUpload(cachedFileId, expectedSize).then(function () {
              _setDriveFileIdCache(folderId, driveFileName, cachedFileId);
              return result;
            });
          });
        }

        // لا يوجد cache — ابحث في Drive
        var q = "name='" + driveFileName + "' and '" + folderId + "' in parents and trashed=false";
        return gFetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id)')
        .then(function (r) { return r.json(); })
        .then(function (res) {
          var blob = new Blob([fileContent], { type: 'application/json' });

          if (res.files && res.files.length > 0) {
            var fileId = res.files[0].id;
            _setDriveFileIdCache(folderId, driveFileName, fileId);
            // Versioning: copy the existing backup to a timestamped name BEFORE
            // overwriting it. This preserves the previous version so a failed
            // upload or accidental overwrite can be recovered. We keep the last
            // 5 versioned copies and delete older ones.
            var versionedName = driveFileName.replace(/\.json$/i, '') + '-' +
              new Date().toISOString().replace(/[:.]/g, '-') + '.json';
            var copyPromise = gFetch('https://www.googleapis.com/drive/v3/files/' + fileId + '/copy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: versionedName })
            }).then(function () { return _pruneOldDriveBackups(folderId, driveFileName); })
              .catch(function (e) { console.warn('[google_sync] Version copy failed (non-fatal):', e); });

            // Don't wait for the copy to finish before uploading — it's best-effort.
            // The upload proceeds in parallel; the copy is a safety net.
            return copyPromise.then(function () {
              return gFetch('https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=media', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: blob
              }).then(function (r) { return r.json(); });
            }).then(function (result) {
              // إصلاح: تحقق من الرفع
              return _verifyBackupUpload(fileId, expectedSize).then(function () {
                return result;
              });
            });
          }

          var boundary = 'zeralda_boundary_' + Date.now();
          var body = '--' + boundary + '\r\n' +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) + '\r\n' +
            '--' + boundary + '\r\n' +
            'Content-Type: application/json\r\n\r\n' +
            fileContent + '\r\n' +
            '--' + boundary + '--';

          return gFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
            body: body
          }).then(function (r) { return r.json(); }).then(function (result) {
            if (result && result.id) {
              _setDriveFileIdCache(folderId, driveFileName, result.id);
              // إصلاح: تحقق من الرفع
              return _verifyBackupUpload(result.id, expectedSize).then(function () {
                return result;
              });
            }
            return result;
          });
        }).then(function (result) {
          // Record last backup timestamp for UI display
          var storageKey = getLastBackupStorageKeyForActiveCompany();
          ZS.setItem(storageKey, JSON.stringify({
            timestamp: new Date().toISOString(),
            success: true
          }));
          return result;
        });
      });
      }); // closes maybeEncryptBackupPayload.then
      }); // closes _getValidatedDriveFileId.then
    }).catch(function (err) {
      // إصلاح: تأكد من تحرير القفل عند الفشل
      _releaseBackupLock();
      throw err;
    }).then(function (result) {
      // إصلاح: تحرير القفل عند النجاح
      _releaseBackupLock();
      return result;
    });
  }

  function restoreFromDrive(onProgress) {
    if (!accessToken) return Promise.reject(new Error('Not signed in'));
    if (onProgress) onProgress('finding_folder');

    return findOrCreateFolder().then(function (folderId) {
      var driveFileName = getDriveFileNameForActiveCompany();
      var q = "name='" + driveFileName + "' and '" + folderId + "' in parents and trashed=false";

      return gFetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name,modifiedTime)')
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (!res.files || res.files.length === 0) throw new Error('No backup found');
          if (onProgress) onProgress('downloading');

          var fileId = res.files[0].id;
          return gFetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media');
        })
        .then(function (r) { return r.json(); })
        .then(function (payload) {
          if (onProgress) onProgress('decrypting');
          return maybeDecryptBackupPayload(payload);
        })
        .then(function (decryptedPayload) {
          if (onProgress) onProgress('restoring');
          return restoreAllData(decryptedPayload).then(function (count) {
            return { restoredKeys: count, exportedAt: decryptedPayload.exportedAt };
          });
        });
    });
  }

  function listDriveBackups() {
    if (!accessToken) return Promise.reject(new Error('Not signed in'));

    return findOrCreateFolder().then(function (folderId) {
      var q = "'" + folderId + "' in parents and trashed=false";
      return gFetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name,size,modifiedTime)&orderBy=modifiedTime desc')
        .then(function (r) { return r.json(); })
        .then(function (res) { return res.files || []; });
    });
  }

  function fetchGoogleContacts() {
    if (!accessToken) return Promise.reject(new Error('Not signed in'));

    return gFetch('https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,organizations,addresses&pageSize=1000')
      .then(function (r) { return r.json(); })
      .then(function (data) { return data.connections || []; });
  }

  function createGoogleContact(customer) {
    if (!accessToken) return Promise.reject(new Error('Not signed in'));

    var body = {
      names: [{ givenName: customer.name || customer.fullName || '' }],
      emailAddresses: customer.email ? [{ value: customer.email }] : [],
      phoneNumbers: customer.phone ? [{ value: customer.phone }] : [],
      organizations: customer.company ? [{ name: customer.company }] : [],
      addresses: customer.address ? [{ formattedValue: customer.address }] : []
    };

    return gFetch('https://people.googleapis.com/v1/people:createContact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  function syncCustomersToGoogle(onProgress) {
    if (!accessToken) return Promise.reject(new Error('Not signed in'));
    if (onProgress) onProgress('fetching_contacts');

    return fetchGoogleContacts().then(function (existing) {
      var existingEmails = {};
      existing.forEach(function (c) {
        if (!c.emailAddresses) return;
        c.emailAddresses.forEach(function (e) {
          if (e && e.value) existingEmails[String(e.value).toLowerCase()] = true;
        });
      });

      var rawCustomers = ZS.getItem('customers-data');
      var customers = [];
      try { customers = JSON.parse(rawCustomers) || []; } catch (_) {}
      if (!Array.isArray(customers)) customers = [];

      var toSync = customers.filter(function (c) {
        if (!c || !c.email) return false;
        return !existingEmails[String(c.email).toLowerCase()];
      });

      if (onProgress) onProgress('syncing', { total: toSync.length, done: 0 });

      var chain = Promise.resolve();
      var synced = 0;
      toSync.forEach(function (c) {
        chain = chain.then(function () {
          return createGoogleContact(c).then(function () {
            synced += 1;
            if (onProgress) onProgress('syncing', { total: toSync.length, done: synced });
          });
        });
      });

      return chain.then(function () {
        return {
          synced: synced,
          total: customers.length,
          skipped: customers.length - toSync.length
        };
      });
    });
  }

  function importGoogleContacts(onProgress) {
    if (!accessToken) return Promise.reject(new Error('Not signed in'));
    if (onProgress) onProgress('fetching');

    return fetchGoogleContacts().then(function (contacts) {
      var rawCustomers = ZS.getItem('customers-data');
      var customers = [];
      try { customers = JSON.parse(rawCustomers) || []; } catch (_) {}
      if (!Array.isArray(customers)) customers = [];

      var existingEmails = {};
      customers.forEach(function (c) {
        if (c && c.email) existingEmails[String(c.email).toLowerCase()] = true;
      });

      var imported = 0;
      contacts.forEach(function (gc) {
        var name = gc.names && gc.names[0] ? (gc.names[0].displayName || gc.names[0].givenName || '') : '';
        var email = gc.emailAddresses && gc.emailAddresses[0] ? gc.emailAddresses[0].value : '';
        var phone = gc.phoneNumbers && gc.phoneNumbers[0] ? gc.phoneNumbers[0].value : '';
        var company = gc.organizations && gc.organizations[0] ? gc.organizations[0].name : '';
        var address = gc.addresses && gc.addresses[0] ? gc.addresses[0].formattedValue : '';

        if (email && existingEmails[String(email).toLowerCase()]) return;

        customers.push({
          id: 'gc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
          name: name,
          email: email,
          phone: phone,
          company: company,
          address: address,
          source: 'google-contacts',
          createdAt: new Date().toISOString()
        });

        imported += 1;
        if (email) existingEmails[String(email).toLowerCase()] = true;
      });

      ZS.setItem('customers-data', JSON.stringify(customers));
      if (onProgress) onProgress('done', { imported: imported });

      return { imported: imported, totalContacts: contacts.length };
    });
  }

  function sendGmail(opts) {
    if (!accessToken) return Promise.reject(new Error('Not signed in'));

    var boundary = 'zeralda_mail_' + Date.now();
    var profile = getGoogleProfile() || {};
    var from = profile.email || '';

    var mimeMsg = [
      'From: ' + from,
      'To: ' + (opts.to || ''),
      'Subject: =?UTF-8?B?' + btoa(unescape(encodeURIComponent(opts.subject || ''))) + '?=',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="' + boundary + '"',
      '',
      '--' + boundary,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(opts.bodyHtml || opts.body || '')))
    ];

    if (opts.attachments && opts.attachments.length) {
      opts.attachments.forEach(function (att) {
        mimeMsg.push('--' + boundary);
        mimeMsg.push('Content-Type: ' + (att.mimeType || 'application/octet-stream'));
        mimeMsg.push('Content-Disposition: attachment; filename="' + (att.filename || 'file') + '"');
        mimeMsg.push('Content-Transfer-Encoding: base64');
        mimeMsg.push('');
        mimeMsg.push(att.base64Data || '');
      });
    }

    mimeMsg.push('--' + boundary + '--');

    var raw = btoa(unescape(encodeURIComponent(mimeMsg.join('\r\n'))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return gFetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: raw })
    }).then(function (r) { return r.json(); });
  }

  function sendInvoiceByEmail(invoice, toEmail, lang) {
    lang = lang || 'en';

    var labels = {
      ar: { subject: 'فاتورة رقم ', body: 'مرفق الفاتورة رقم ', from: 'من شركة ', regards: 'مع تحياتنا' },
      fr: { subject: 'Facture N° ', body: 'Veuillez trouver ci-joint la facture N° ', from: 'De la part de ', regards: 'Cordialement' },
      en: { subject: 'Invoice #', body: 'Please find attached invoice #', from: 'From ', regards: 'Best regards' }
    };

    var t = labels[lang] || labels.en;
    var settings = getSettings();
    var companies = settings.companies || [];
    var companyName = companies.length > 0 ? (companies[0].name || 'Zeralda') : 'Zeralda';

    var invoiceNum = (invoice && (invoice.number || invoice.id)) ? (invoice.number || invoice.id) : '---';
    var subject = t.subject + invoiceNum;

    var body = '<div dir="' + (lang === 'ar' ? 'rtl' : 'ltr') + '" style="font-family:Arial,sans-serif;font-size:14px;">' +
      '<p>' + t.body + '<strong>' + invoiceNum + '</strong></p>' +
      '<p>' + t.from + '<strong>' + companyName + '</strong></p>' +
      '<br><p>' + t.regards + '</p>' +
      '</div>';

    return sendGmail({ to: toEmail, subject: subject, bodyHtml: body });
  }

  function isSignedIn() {
    if (accessToken) return true;
    var savedToken = loadGoogleToken();
    // Consider user "signed in" if they have a token (even expired),
    // because tryAutoReconnect will silently refresh it.
    return !!(savedToken && (savedToken.access_token || savedToken.expired));
  }

  function init(callbacks) {
    callbacks = callbacks || {};

    // Migrate old global keys to per-user keys (one-time)
    migrateOldGoogleKeys();

    var savedToken = loadGoogleToken();

    // Always hide any leftover overlay from previous OAuth attempt
    hideOAuthLoadingOverlay();

    // 1) Handle manual OAuth implicit-flow redirect (used by WebView2/Launcher)
    if (tryHandleManualOAuthRedirect()) {
      // Manual OAuth redirect was handled; signal ready after profile fetch
      _retryPendingInBackground();
      if (callbacks.onReady) callbacks.onReady(true);
      return;
    }

    // 2) Handle GIS redirect callback (legacy)
    if (typeof window !== 'undefined' && window.location && window.location.search) {
      var params = new URLSearchParams(window.location.search);
      var error = params.get('error');
      if (error) {
        console.error('[OAuth Redirect] Error:', error);
        window.history.replaceState({}, document.title, window.location.pathname);
        if (callbacks.onReady) callbacks.onReady(false);
        return;
      }
    }

    // 3) In WebView2/Launcher, skip GIS entirely (popups are broken)
    if (isLikelyWebView2()) {
      if (savedToken && (savedToken.access_token || savedToken.expired)) {
        tryAutoReconnect(function (ok) {
          if (ok) _retryPendingInBackground();
          if (callbacks.onReady) callbacks.onReady(ok);
        });
      } else {
        if (callbacks.onReady) callbacks.onReady(false);
      }
      return;
    }

    // 4) Normal browser — use Google Identity Services
    if (typeof google !== 'undefined' && google.accounts) {
      initTokenClient();
    }

    if (savedToken && (savedToken.access_token || savedToken.expired)) {
      tryAutoReconnect(function (ok) {
        if (ok) _retryPendingInBackground();
        if (callbacks.onReady) callbacks.onReady(ok);
      });
    } else if (callbacks.onReady) {
      callbacks.onReady(false);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  Automatic Backup (throttled)
  // ══════════════════════════════════════════════════════════
  
  var _autoBackupPending = false;
  var _autoBackupTimer = null;
  var _autoBackupMinInterval = 30000; // 30 seconds minimum between backups
  var _lastAutoBackupAt = 0;
  
  function isAutoBackupEnabled() {
    var settings = getSettings();
    if (settings && settings.google && typeof settings.google.autoBackupEnabled === 'boolean') {
      return settings.google.autoBackupEnabled;
    }
    // Default to true when connected to Google so backup & sync is seamless
    return true;
  }
  
  function setAutoBackupEnabled(enabled) {
    var settings = getSettings();
    settings.google = settings.google || {};
    settings.google.autoBackupEnabled = !!enabled;
    saveSettings(settings);
    return settings.google.autoBackupEnabled;
  }
  
  function _showGoogleSyncToast(message, type) {
    if (typeof window.showToast === 'function') {
      try {
        window.showToast(message, type || 'info');
        return;
      } catch (_) {}
    }
    try {
      var toastId = 'zeralda-google-sync-toast';
      var existing = document.getElementById(toastId);
      if (existing) existing.remove();
      var t = document.createElement('div');
      t.id = toastId;
      var bg = type === 'success' ? '#10b981' : (type === 'error' ? '#ef4444' : '#2563eb');
      t.style.cssText = 'position:fixed;bottom:24px;left:24px;background:' + bg + ';color:#fff;padding:12px 18px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 10px 25px rgba(0,0,0,0.25);z-index:999999;display:flex;align-items:center;gap:10px;animation:fadeIn 0.3s ease;direction:rtl;font-family:system-ui,-apple-system,sans-serif;';
      t.innerHTML = '<i class="fab fa-google-drive" style="font-size:16px;"></i><span>' + message + '</span>';
      document.body.appendChild(t);
      setTimeout(function () {
        if (t && t.parentNode) t.remove();
      }, 4500);
    } catch (_) {}
  }

  function autoSyncOnLogin(force) {
    var flag = ZS.getItem('zeralda-drive-auto-sync-on-login');
    if (!flag && !force) {
      // If not flagged for login sync, just ensure silent reconnect in background
      if (!isSignedIn()) {
        tryAutoReconnect(function (ok) {
          if (ok) {
            console.log('[Google Drive] Auto-reconnected in background');
            _emitGoogleSyncState({ connected: true, action: 'reconnect' });
          }
        });
      }
      return;
    }

    function doSync() {
      if (!isSignedIn()) {
        console.log('[Google Drive] Cannot auto-sync on login: not signed in');
        ZS.removeItem('zeralda-drive-auto-sync-on-login');
        return;
      }

      console.log('[Google Drive] Executing automatic sync upon login...');
      _showGoogleSyncToast('جاري الاتصال بـ Google Drive ومزامنة البيانات تلقائياً...', 'info');

      backupToDrive().then(function (res) {
        ZS.removeItem('zeralda-drive-auto-sync-on-login');
        console.log('[Google Drive] Auto-sync on login completed successfully!', res);
        _showGoogleSyncToast('✅ اكتملت المزامنة والنسخ الاحتياطي السحابي على Google Drive بنجاح', 'success');
        _emitGoogleSyncState({ connected: true, action: 'auto_sync_completed', timestamp: new Date().toISOString() });
      }).catch(function (err) {
        console.warn('[Google Drive] Auto-sync on login failed:', err);
        ZS.removeItem('zeralda-drive-auto-sync-on-login');
      });
    }

    if (isSignedIn()) {
      doSync();
    } else {
      tryAutoReconnect(function (ok) {
        if (ok) {
          doSync();
        } else {
          console.log('[Google Drive] tryAutoReconnect failed, clearing login sync flag');
          ZS.removeItem('zeralda-drive-auto-sync-on-login');
        }
      });
    }
  }

  function triggerAutoBackup() {
    if (!isAutoBackupEnabled()) {
      return Promise.resolve({ skipped: true, reason: 'auto_backup_disabled' });
    }
    
    if (!isSignedIn()) {
      return Promise.resolve({ skipped: true, reason: 'not_signed_in' });
    }
    
    // Throttle: don't backup if last backup was less than 30 seconds ago
    var now = Date.now();
    if (now - _lastAutoBackupAt < _autoBackupMinInterval) {
      if (!_autoBackupPending) {
        _autoBackupPending = true;
        _autoBackupTimer = setTimeout(function() {
          _autoBackupPending = false;
          triggerAutoBackup();
        }, _autoBackupMinInterval - (now - _lastAutoBackupAt));
      }
      return Promise.resolve({ skipped: true, reason: 'throttled' });
    }
    
    // Cancel any pending backup
    if (_autoBackupTimer) {
      clearTimeout(_autoBackupTimer);
      _autoBackupTimer = null;
    }
    
    _lastAutoBackupAt = now;
    
    return backupToDrive().then(function(result) {
      // Store last backup timestamp
      var storageKey = getLastBackupStorageKeyForActiveCompany();
      ZS.setItem(storageKey, JSON.stringify({
        timestamp: new Date().toISOString(),
        success: true
      }));
      return { success: true, timestamp: new Date().toISOString() };
    }).catch(function(err) {
      console.warn('[Google Auto Backup] Failed:', err);
      return { success: false, error: err.message };
    });
  }

  // ─────────────────────────────────────────────────────────
  //  Switch ERP user — reload Google session for the new user
  // ─────────────────────────────────────────────────────────
  function switchUser() {
    // Clear in-memory token (will be re-loaded from per-user key)
    accessToken = null;
    var savedToken = loadGoogleToken();
    if (savedToken && (savedToken.access_token || savedToken.expired)) {
      tryAutoReconnect(function (ok) {
        // Notify UI to refresh
        try {
          window.dispatchEvent(new CustomEvent('zeralda-google-sync-state'));
        } catch (_) {}
      });
    } else {
      // No token for this user — notify UI to show "Connect" button
      try {
        window.dispatchEvent(new CustomEvent('zeralda-google-sync-state'));
      } catch (_) {}
    }
  }

  root.ZeraldaGoogle = {
    CLIENT_ID: getClientId,
    setClientId: setClientId,
    isLikelyGoogleClientId: isLikelyGoogleClientId,
    init: init,
    requestToken: requestToken,
    tryAutoReconnect: tryAutoReconnect,
    signOut: signOut,
    isSignedIn: isSignedIn,
    getProfile: getGoogleProfile,

    // Per-user session management
    getActiveUserId: getActiveUserId,
    switchUser: switchUser,
    silentRefreshToken: silentRefreshToken,

    // Manual OAuth fallback for WebView2/Launcher
    isLikelyWebView2: isLikelyWebView2,
    getManualOAuthRedirectUri: getManualOAuthRedirectUri,
    startManualOAuth: startManualOAuth,

    backupToDrive: backupToDrive,
    restoreFromDrive: restoreFromDrive,
    listDriveBackups: listDriveBackups,
    getDriveFileNameForActiveCompany: getDriveFileNameForActiveCompany,
    getLastBackupStorageKeyForActiveCompany: getLastBackupStorageKeyForActiveCompany,

    syncCustomersToGoogle: syncCustomersToGoogle,
    importGoogleContacts: importGoogleContacts,
    fetchGoogleContacts: fetchGoogleContacts,

    // Auto backup functions
    isAutoBackupEnabled: isAutoBackupEnabled,
    setAutoBackupEnabled: setAutoBackupEnabled,
    triggerAutoBackup: triggerAutoBackup,
    autoSyncOnLogin: autoSyncOnLogin,

    // Pending server sync diagnostics/retry
    getPendingServerSyncStatus: getPendingServerSyncStatus,
    retryPendingServerSync: retryPendingServerSync,
    repairCompanyScopedData: repairCompanyScopedData,

    sendGmail: sendGmail,
    sendInvoiceByEmail: sendInvoiceByEmail
  };
})(window);
