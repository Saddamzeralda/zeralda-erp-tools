/* Zeralda ERP — Shared Layout Shell Loader (v2026-02-26)
 * Fetches shared/layout_shell.html and injects the header + sidebar
 * into any page that contains <div id="sharedLayoutMount" data-active-page="...">.
 */
(function () {
  'use strict';

  if (typeof window !== 'undefined' && !window.safeJSONParse) {
    window.safeJSONParse = function (str, fallback) {
      if (str === null || str === undefined || str === '') return fallback !== undefined ? fallback : null;
      if (typeof str !== 'string') return str;
      try {
        return JSON.parse(str);
      } catch (e) {
        return fallback !== undefined ? fallback : null;
      }
    };
  }

  // Immediately kill any floating sync indicator, alerts hub, or modal
  try {
    if (typeof window !== 'undefined' && 'caches' in window && !sessionStorage.getItem('zeralda_bust_20261017')) {
      caches.keys().then(function (names) {
        names.forEach(function (name) { caches.delete(name); });
      });
      sessionStorage.setItem('zeralda_bust_20261017', '1');
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) { reg.update(); });
      });
    }
    var hideStyle = document.createElement('style');
    hideStyle.id = 'zeralda-kill-sync-pill-style';
    hideStyle.textContent = '#zcpHeaderTriggerBtn, #headerQuickSearchBtn, #headerUniversalScanBtn, #zeraldaSyncPill, #zeraldaSyncHubModal, #zeraldaAlertsHubWrapper, #zeraldaAlertsButton, #zeraldaAlertsDropdown, #zeraldaAlertsBadge, #zeraldaMobileNotifBanner, .zeralda-sync-pill, .alerts-hub-wrapper, .proactive-alerts-hub { display:none !important; visibility:hidden !important; pointer-events:none !important; opacity:0 !important; width:0 !important; height:0 !important; position:absolute !important; left:-99999px !important; top:-99999px !important; }';
    (document.head || document.documentElement).appendChild(hideStyle);

    function __purgeFloatingWidgets() {
      ['zcpHeaderTriggerBtn', 'headerQuickSearchBtn', 'headerUniversalScanBtn', 'zeraldaSyncPill', 'zeraldaSyncHubModal', 'zeraldaAlertsHubWrapper', 'zeraldaAlertsButton', 'zeraldaAlertsDropdown', 'zeraldaAlertsBadge', 'zeraldaMobileNotifBanner'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el && el.parentNode) el.parentNode.removeChild(el);
      });
      try {
        var badNodes = document.querySelectorAll('[id*="zeraldaAlerts"], .alerts-hub-wrapper, .proactive-alerts-hub, .zeralda-alerts-dropdown');
        for (var b = 0; b < badNodes.length; b++) {
          if (badNodes[b] && badNodes[b].parentNode) badNodes[b].parentNode.removeChild(badNodes[b]);
        }
      } catch (_) {}
    }
    __purgeFloatingWidgets();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', __purgeFloatingWidgets);
    }
    window.addEventListener('load', __purgeFloatingWidgets);

    if (window.MutationObserver) {
      var _purgeObserver = new MutationObserver(function(muts) {
        for (var i = 0; i < muts.length; i++) {
          var nodes = muts[i].addedNodes;
          for (var j = 0; j < nodes.length; j++) {
            var n = nodes[j];
            if (n && n.nodeType === 1) {
              if (n.id === 'zeraldaSyncPill' || n.id === 'zeraldaSyncHubModal' || n.id === 'zeraldaAlertsHubWrapper' || (n.id && n.id.indexOf('zeraldaAlerts') !== -1)) {
                if (n.parentNode) n.parentNode.removeChild(n);
              }
            }
          }
        }
      });
      _purgeObserver.observe(document.documentElement, { childList: true, subtree: true });
      window.addEventListener('load', function() {
        setTimeout(function() {
          try { _purgeObserver.disconnect(); } catch (_) {}
        }, 2000);
      });
    }
  } catch (_) {}

  var __clientLivenessTimer = null;

  function getClientSessionId() {
    try {
      var key = 'zeralda-client-session-id';
      var existing = ZS.getItem(key);
      if (existing) return existing;
      var sid = 'sid_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      ZS.setItem(key, sid);
      return sid;
    } catch (_) {
      return 'sid_fallback_' + Math.random().toString(36).slice(2, 10);
    }
  }

  function postClientSignal(path, payload) {
    var body = JSON.stringify(payload || {});
    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(path, blob);
        return;
      } catch (_) {
      }
    }
    try {
      fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        credentials: 'omit',
        cache: 'no-store'
      }).catch(function () {});
    } catch (_) {
    }
  }

  function startClientLivenessBeacon() {
    if (__clientLivenessTimer) return;
    var sid = getClientSessionId();

    function alive() {
      postClientSignal('/api/client/alive', {
        sessionId: sid,
        page: window.location.pathname,
        ts: Date.now()
      });
    }

    // Delay first beacon by 3 seconds to let the page settle
    // (avoids adding network load during initial page render)
    setTimeout(alive, 3000);
    __clientLivenessTimer = setInterval(alive, 15000);

    window.addEventListener('beforeunload', function () {
      /* FIX: تنظيف المؤقت لمنع تسرب الذاكرة */
      if (__clientLivenessTimer) { clearInterval(__clientLivenessTimer); __clientLivenessTimer = null; }
      postClientSignal('/api/client/bye', {
        sessionId: sid,
        page: window.location.pathname,
        ts: Date.now()
      });
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') alive();
    });
  }

  /* ── Toggle Sidebar (Mobile: slide in/out) ────────────── */
  function toggleSidebar() {
    var sb = document.getElementById('sidebar');
    if (!sb) return;
    var isNowOpen = !sb.classList.contains('active');
    sb.classList.toggle('active');
    document.body.classList.toggle('sidebar-open', isNowOpen);
  }
  window.toggleSidebar = toggleSidebar;

  /* Close sidebar when user taps the overlay backdrop on mobile */
  document.addEventListener('click', function (e) {
    var sb = document.getElementById('sidebar');
    if (!sb) return;
    if (!document.body.classList.contains('sidebar-open')) return;
    /* If the click is outside the sidebar and not on the hamburger button, close */
    if (!sb.contains(e.target) && !e.target.closest('.mobile-menu-btn')) {
      sb.classList.remove('active');
      document.body.classList.remove('sidebar-open');
    }
  });

  /* ── Toggle Sidebar Collapse (Desktop: expand/collapse) ── */
  function toggleSidebarCollapse() {
    var sb = document.getElementById('sidebar');
    var icon = document.getElementById('sidebarToggleIcon');
    if (!sb) return;

    var isCollapsed = sb.classList.contains('collapsed');
    if (isCollapsed) {
      sb.classList.remove('collapsed');
      document.body.classList.remove('sidebar-collapsed');
      if (icon) icon.className = 'fas fa-bars';
      ZS.setItem('sidebar-collapsed', 'false');
    } else {
      sb.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
      if (icon) icon.className = 'fas fa-angle-double-right';
      ZS.setItem('sidebar-collapsed', 'true');
    }

    // Recalculate layout after toggle
    setTimeout(applyLayoutGeometry, 100);
  }
  window.toggleSidebarCollapse = toggleSidebarCollapse;

  /* ── Apply Saved Sidebar State ─────────────────────────── */
  function applySidebarState() {
    var sb = document.getElementById('sidebar');
    var icon = document.getElementById('sidebarToggleIcon');
    if (!sb) return;

    var isCollapsed = ZS.getItem('sidebar-collapsed') === 'true';
    if (isCollapsed) {
      sb.classList.add('collapsed');
      document.body.classList.add('sidebar-collapsed');
      if (icon) icon.className = 'fas fa-angle-double-right';
    } else {
      sb.classList.remove('collapsed');
      document.body.classList.remove('sidebar-collapsed');
      if (icon) icon.className = 'fas fa-bars';
    }
  }
  window.applySidebarState = applySidebarState;

  /* ── Header Language Selector ─────────────────────────── */
  function applyGlobalLanguageSetting(lang) {
    var safe = (lang || '').toLowerCase();
    if (safe !== 'en' && safe !== 'ar' && safe !== 'fr') safe = 'en';

    // Avoid redundant reload if the language hasn't actually changed.
    var current = (ZS.getItem('preferred-language') || 'en').toLowerCase();
    if (current === safe) return;

    // Write through ZS (Zeralda Storage) → ZDB (IndexedDB).
    // ZS.setItem() updates the in-memory cache synchronously AND queues an
    // async IndexedDB write. We MUST wait for that write to flush before
    // reloading, otherwise the reload re-loads an empty/stale cache from
    // IndexedDB and the language change is lost.
    ZS.setItem('preferred-language', safe);
    ZS.setItem('language', safe);

    // Keep settings blob in sync when available.
    try {
      var raw = ZS.getItem('zeralda-settings');
      if (raw) {
        var parsed = JSON.parse(raw);
        // حماية: لا تحذف الشركات عند تحديث اللغة فقط
        if (!parsed.companies) {
          var oldRaw = ZS.getItem('zeralda-companies');
          if (oldRaw) {
            try {
              parsed.companies = JSON.parse(oldRaw);
            } catch (_) {}
          }
        }
        parsed.preferredLanguage = safe;
        ZS.setItem('zeralda-settings', JSON.stringify(parsed));
      }
    } catch (e) {
      console.warn('[layout_shell] Failed to sync preferred language into settings blob', e);
    }

    // Apply direction + data-* attributes immediately so the reload shows
    // the correct RTL/LTR layout from the first paint.
    applyLayoutLanguage();

    // In-place language transition without forced reload
    if (window.UnifiedI18N && typeof window.UnifiedI18N.applyTranslations === 'function') {
      try { window.UnifiedI18N.applyTranslations(safe); } catch(_) {}
    }

    if (window.ZDB && typeof window.ZDB.flush === 'function') {
      window.ZDB.flush().catch(function() {});
    }

    if (window.__ZERALDA_RELOAD_ON_LANG_CHANGE__ === true) {
      function doReload() { location.reload(); }
      if (window.ZDB && typeof window.ZDB.flush === 'function') {
        window.ZDB.flush().then(doReload).catch(function () {
          setTimeout(doReload, 150);
        });
      } else {
        setTimeout(doReload, 0);
      }
    }
  }
  window.applyGlobalLanguageSetting = applyGlobalLanguageSetting;

  function initHeaderLanguageSelector() {
    var select = document.getElementById('headerLanguageSelect');
    if (!select) return;

    var current = (ZS.getItem('preferred-language') || 'en').toLowerCase();
    if (current !== 'en' && current !== 'ar' && current !== 'fr') current = 'en';
    select.value = current;

    select.addEventListener('change', function () {
      applyGlobalLanguageSetting(select.value || 'en');
    });
  }
  window.initHeaderLanguageSelector = initHeaderLanguageSelector;

  var PAGE_ZOOM_KEY = 'zeralda-page-zoom';
  var PAGE_ZOOM_MIN = 50;
  var PAGE_ZOOM_MAX = 140;
  var PAGE_ZOOM_STEP = 10;
  var _headerZoomExpanded = false;

  function normalizePageZoom(value) {
    var parsed = parseInt(value, 10);
    if (!isFinite(parsed)) parsed = 100;
    if (parsed < PAGE_ZOOM_MIN) parsed = PAGE_ZOOM_MIN;
    if (parsed > PAGE_ZOOM_MAX) parsed = PAGE_ZOOM_MAX;
    parsed = Math.round(parsed / PAGE_ZOOM_STEP) * PAGE_ZOOM_STEP;
    if (parsed < PAGE_ZOOM_MIN) parsed = PAGE_ZOOM_MIN;
    if (parsed > PAGE_ZOOM_MAX) parsed = PAGE_ZOOM_MAX;
    return parsed;
  }

  function getSavedPageZoom() {
    try {
      return normalizePageZoom(ZS.getItem(PAGE_ZOOM_KEY) || '100');
    } catch (_) {
      return 100;
    }
  }

  function updateHeaderZoomControls() {
    var zoom = getSavedPageZoom();
    var controls = document.querySelector('.header-zoom-controls');
    var outBtn = document.getElementById('headerZoomOutBtn');
    var inBtn = document.getElementById('headerZoomInBtn');
    var resetBtn = document.getElementById('headerZoomResetBtn');
    var lang = (ZS.getItem('preferred-language') || 'en').toLowerCase();
    var resetLabel = lang === 'ar'
      ? 'أزرار التكبير (' + zoom + '%)'
      : (lang === 'fr' ? 'Controles du zoom (' + zoom + '%)' : 'Zoom controls (' + zoom + '%)');
    if (controls) controls.classList.toggle('expanded', !!_headerZoomExpanded);
    if (outBtn) outBtn.disabled = zoom <= PAGE_ZOOM_MIN;
    if (inBtn) inBtn.disabled = zoom >= PAGE_ZOOM_MAX;
    if (resetBtn) {
      resetBtn.title = resetLabel;
      resetBtn.setAttribute('aria-label', resetLabel);
    }
  }
  window.updateHeaderZoomControls = updateHeaderZoomControls;

  function applyHeaderZoom(zoomValue) {
    var zoom = normalizePageZoom(zoomValue);
    try {
      ZS.setItem(PAGE_ZOOM_KEY, String(zoom));
    } catch (_) {
    }

    document.documentElement.style.zoom = String(zoom / 100);
    updateHeaderZoomControls();

    setTimeout(function () {
      try { applyLayoutGeometry(); } catch (_) {}
    }, 40);
  }
  window.applyHeaderZoom = applyHeaderZoom;

  function changeHeaderZoom(delta) {
    applyHeaderZoom(getSavedPageZoom() + (parseInt(delta, 10) || 0));
  }
  window.changeHeaderZoom = changeHeaderZoom;

  function toggleHeaderZoomControls(forceState) {
    if (typeof forceState === 'boolean') _headerZoomExpanded = forceState;
    else _headerZoomExpanded = !_headerZoomExpanded;
    updateHeaderZoomControls();
  }
  window.toggleHeaderZoomControls = toggleHeaderZoomControls;

  function resetHeaderZoom() {
    applyHeaderZoom(100);
  }
  window.resetHeaderZoom = resetHeaderZoom;

  function initHeaderZoomControls() {
    _headerZoomExpanded = false;
    updateHeaderZoomControls();
    applyHeaderZoom(getSavedPageZoom());
  }
  window.initHeaderZoomControls = initHeaderZoomControls;

  document.addEventListener('click', function (event) {
    var controls = document.querySelector('.header-zoom-controls');
    if (!controls || !_headerZoomExpanded) return;
    if (controls.contains(event.target)) return;
    toggleHeaderZoomControls(false);
  });

  function isFullscreenActive() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  }

  var FULLSCREEN_INTENT_KEY = 'zeralda-fullscreen-intent';

  function setFullscreenIntent(enabled) {
    try {
      ZS.setItem(FULLSCREEN_INTENT_KEY, enabled ? '1' : '0');
    } catch (_) {
    }
  }

  function requestFullscreenNow() {
    var root = document.documentElement;
    if (root.requestFullscreen) return root.requestFullscreen();
    if (root.webkitRequestFullscreen) return root.webkitRequestFullscreen();
    if (root.msRequestFullscreen) return root.msRequestFullscreen();
    return Promise.reject(new Error('fullscreen-not-supported'));
  }

  function updateFullscreenButtonState() {
    var btn = document.getElementById('headerFullscreenBtn');
    if (!btn) return;
    var icon = btn.querySelector('i');
    var active = isFullscreenActive();
    if (icon) {
      icon.className = active ? 'fas fa-compress' : 'fas fa-expand';
    }
  }
  window.updateFullscreenButtonState = updateFullscreenButtonState;

  function toggleHeaderFullscreen() {
    try {
      if (isFullscreenActive()) {
        setFullscreenIntent(false);
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
      } else {
        setFullscreenIntent(true);
        requestFullscreenNow().catch(function () {
          var lang = (ZS.getItem('preferred-language') || 'en').toLowerCase();
          var msg = lang === 'ar'
            ? 'تعذر تفعيل ملء الشاشة. اضغط F11'
            : (lang === 'fr' ? 'Impossible d activer le plein ecran. Appuyez sur F11.' : 'Unable to activate fullscreen. Press F11.');
          if (typeof window.showToast === 'function') {
            try { window.showToast(msg, 'info'); } catch (_) {}
          }
        });
      }
    } catch (_) {}
  }
  window.toggleHeaderFullscreen = toggleHeaderFullscreen;

  function initHeaderFullscreenButton() {
    var btn = document.getElementById('headerFullscreenBtn');
    if (btn) btn.remove();
  }
  window.initHeaderFullscreenButton = initHeaderFullscreenButton;

  /* ── Header License Duration & User Status Badge ─────────── */
  var _lastLicenseStatus = null;

  function initHeaderLicenseBadge() {
    var badge = document.getElementById('headerLicenseBadge');
    var textEl = document.getElementById('headerLicenseDurationText');
    var iconEl = document.getElementById('headerLicenseIcon');
    var userNameEl = document.getElementById('layoutUserName');
    var userAvatarEl = document.getElementById('layoutUserAvatar');
    var userRoleEl = document.getElementById('layoutUserRole');

    // 1. Identify logged-in user
    var currentUser = null;
    try {
      var cuRaw = (typeof ZS !== 'undefined' ? ZS.getItem('zeralda-current-user') : null) ||
                  (typeof localStorage !== 'undefined' ? localStorage.getItem('zeralda-current-user') : null);
      if (cuRaw) currentUser = JSON.parse(cuRaw);
    } catch (_) {}

    var isDev = false;
    if (currentUser) {
      if (currentUser.is_developer || currentUser.never_expires || currentUser.role === 'developer') {
        isDev = true;
      }
      var email = String(currentUser.email || currentUser.username || '').toLowerCase();
      if (email.indexOf('saddamzeralda') !== -1 || email.indexOf('admin@zeralda.dz') !== -1 || email.indexOf('zitouni') !== -1) {
        isDev = true;
      }
      var phone = String(currentUser.phone || currentUser.id || currentUser.username || '');
      if (phone.indexOf('0559666951') !== -1 || phone.indexOf('0696409083') !== -1) {
        isDev = true;
      }

      // Populate user info in header
      if (userNameEl) {
        var displayName = currentUser.username || currentUser.fullName || currentUser.email || 'User';
        userNameEl.textContent = displayName;
        if (isDev && userRoleEl) {
          userRoleEl.textContent = 'المطور (صلاحية دائمة)';
          userRoleEl.style.display = 'block';
          userRoleEl.style.color = '#059669';
          userRoleEl.style.fontWeight = '700';
        } else if (userRoleEl && currentUser.role) {
          userRoleEl.textContent = currentUser.role;
          userRoleEl.style.display = 'block';
        }
      }
      if (userAvatarEl) {
        var avText = (currentUser.username || currentUser.fullName || currentUser.email || 'US').trim().substring(0, 2).toUpperCase();
        userAvatarEl.textContent = avText;
        if (isDev) {
          userAvatarEl.style.background = 'linear-gradient(135deg, #059669, #10b981)';
          userAvatarEl.style.color = '#ffffff';
        }
      }
    }

    function renderBadge(statusData) {
      if (!badge || !textEl) return;
      var lang = (typeof ZS !== 'undefined' ? ZS.getItem('preferred-language') : null) || 
                 (typeof localStorage !== 'undefined' ? localStorage.getItem('preferred-language') : null) || 'ar';
      lang = String(lang).toLowerCase();

      badge.style.background = 'transparent';
      badge.style.border = 'none';
      badge.style.padding = '0';
      badge.style.fontSize = '10px';
      badge.style.fontWeight = '600';

      // Developer Account -> Permanent & never expires
      if (isDev || (statusData && statusData.isDeveloper)) {
        badge.style.color = '#10b981';
        if (iconEl) iconEl.className = 'fas fa-infinity';
        textEl.textContent = 'Licence : Développeur (Illimitée)';
        badge.title = 'Compte développeur — Validité permanente et illimitée';
        return;
      }

      var st = (statusData && statusData.status) ? statusData.status : 'active';
      var expAt = (statusData && statusData.expiresAt !== undefined) ? statusData.expiresAt : 0;
      var daysLeft = (statusData && statusData.daysLeft !== undefined) ? statusData.daysLeft : 0;

      if (st === 'active') {
        if (!expAt || expAt === 0) {
          badge.style.color = '#10b981';
          if (iconEl) iconEl.className = 'fas fa-shield-alt';
          textEl.textContent = lang === 'fr' ? 'Licence : Illimitée (Permanente)' : (lang === 'en' ? 'License: Lifetime' : 'Licence : Développeur (Illimitée)');
        } else {
          var expDate = new Date(expAt * 1000);
          var dateStr = expDate.toISOString().split('T')[0];
          badge.style.color = '#0284c7';
          if (iconEl) iconEl.className = 'fas fa-calendar-check';
          textEl.textContent = lang === 'fr' 
            ? 'Licence : ' + daysLeft + 'j restants (' + dateStr + ')'
            : (lang === 'en' ? 'License: ' + daysLeft + 'd left (' + dateStr + ')' : 'مدة الترخيص: متبقي ' + daysLeft + ' يوم (' + dateStr + ')');
        }
      } else if (st === 'trial') {
        badge.style.color = '#d97706';
        if (iconEl) iconEl.className = 'fas fa-hourglass-half';
        textEl.textContent = lang === 'fr'
          ? 'Essai : ' + daysLeft + ' jours restants'
          : (lang === 'en' ? 'Trial: ' + daysLeft + ' days left' : 'مدة الترخيص: تجريبي (متبقي ' + daysLeft + ' يوم)');
      } else if (st === 'grace') {
        badge.style.color = '#ea580c';
        if (iconEl) iconEl.className = 'fas fa-exclamation-triangle';
        var hrs = (statusData && statusData.graceHoursLeft) || 0;
        textEl.textContent = lang === 'fr' ? 'Grâce (' + hrs + 'h)' : (lang === 'en' ? 'Grace (' + hrs + 'h)' : 'فترة سماح (متبقي ' + hrs + ' ساعة)');
      } else {
        badge.style.color = '#dc2626';
        if (iconEl) iconEl.className = 'fas fa-ban';
        textEl.textContent = lang === 'fr' ? 'Licence : Expirée' : (lang === 'en' ? 'License: Expired' : 'الترخيص: منتهي الصلاحية');
      }
    }

    renderBadge(_lastLicenseStatus || (isDev ? { status: 'active', expiresAt: 0, isDeveloper: true } : null));

    fetch('/api/license/server-status')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.status) {
          _lastLicenseStatus = data.status;
          renderBadge(_lastLicenseStatus);
        }
      })
      .catch(function () {});

    document.addEventListener('layoutLanguageChanged', function () {
      renderBadge(_lastLicenseStatus);
    });
  }
  window.initHeaderLicenseBadge = initHeaderLicenseBadge;

  /* ── Enforce Header/Sidebar/Main Geometry ───────────── */
  function applyLayoutGeometry() {
    var header = document.querySelector('.header');
    var sidebar = document.getElementById('sidebar');
    var main = document.getElementById('mainContent') || document.querySelector('.main-content');
    if (!header || !sidebar || !main) return;

    var isRtl = document.body.classList.contains('rtl') || document.documentElement.dir === 'rtl';
    var isMobile = window.matchMedia('(max-width: 768px)').matches;
    var isSidebarCollapsed = sidebar.classList.contains('collapsed');
    var headerHeight = Math.max(28, Math.ceil(header.getBoundingClientRect().height));
    var sbRectWidth = Math.ceil(sidebar.getBoundingClientRect().width || 0);
    var sbCssWidth = parseInt(window.getComputedStyle(sidebar).width, 10) || 0;
    var rootSidebarWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'), 10) || 280;
    var sidebarWidth = isSidebarCollapsed ? 0 : Math.max(280, sbRectWidth, sbCssWidth, rootSidebarWidth);

    // Keep CSS variables aligned with real rendered sizes.
    document.documentElement.style.setProperty('--header-height', headerHeight + 'px');
    document.documentElement.style.setProperty('--sidebar-width', sidebarWidth + 'px');

    sidebar.style.setProperty('top', headerHeight + 'px', 'important');
    sidebar.style.setProperty('height', 'calc(100vh - ' + headerHeight + 'px)', 'important');
    main.style.setProperty('margin-top', headerHeight + 'px', 'important');

    if (isMobile) {
      main.style.setProperty('margin-left', '0', 'important');
      main.style.setProperty('margin-right', '0', 'important');
      main.style.setProperty('width', '100%', 'important');
    } else if (isRtl) {
      main.style.setProperty('margin-left', '0', 'important');
      main.style.setProperty('margin-right', sidebarWidth + 'px', 'important');
      main.style.setProperty('width', 'calc(100% - ' + sidebarWidth + 'px)', 'important');
    } else {
      main.style.setProperty('margin-left', sidebarWidth + 'px', 'important');
      main.style.setProperty('margin-right', '0', 'important');
      main.style.setProperty('width', 'calc(100% - ' + sidebarWidth + 'px)', 'important');
    }

  }
  window.applyLayoutGeometry = applyLayoutGeometry;

  /* ── Migrate legacy 12h default to 24h ────────────────── */
  // FIX: guard against ZS not being defined yet (zeralda_db.js must load first)
  if (typeof ZS !== 'undefined' && ZS && ZS.getItem) {
    if (!ZS.getItem('time-format') || ZS.getItem('time-format') === '12') {
      ZS.setItem('time-format', '24');
    }
  }

  /* ── Update Date & Analog Clock ──────────────────────── */
  function buildClockMarks() {
    var g = document.getElementById('clockMarks');
    if (!g || g.children.length) return;
    for (var i = 0; i < 12; i++) {
      var angle = (i * 30) * Math.PI / 180;
      var x1 = 50 + Math.sin(angle) * 42;
      var y1 = 50 - Math.cos(angle) * 42;
      var x2 = 50 + Math.sin(angle) * 46;
      var y2 = 50 - Math.cos(angle) * 46;
      var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1.toFixed(1));
      line.setAttribute('y1', y1.toFixed(1));
      line.setAttribute('x2', x2.toFixed(1));
      line.setAttribute('y2', y2.toFixed(1));
      line.setAttribute('class', 'clock-mark');
      g.appendChild(line);
    }
  }

  function updateDateTime() {
    var now = new Date();
    var df = ZS.getItem('date-format') || 'YYYY-MM-DD';
    var d = String(now.getDate()).padStart(2, '0');
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var y = now.getFullYear();
    var ds = df === 'DD/MM/YYYY' ? d + '/' + m + '/' + y
           : df === 'MM/DD/YYYY' ? m + '/' + d + '/' + y
           : y + '-' + m + '-' + d;
    var de = document.getElementById('currentDate');
    if (de) de.textContent = ds;

    // Analog clock hands
    buildClockMarks();
    var secs = now.getSeconds();
    var mins = now.getMinutes();
    var hrs = now.getHours() % 12;
    var secAngle = secs * 6;
    var minAngle = mins * 6 + secs * 0.1;
    var hrAngle = hrs * 30 + mins * 0.5;
    var sh = document.getElementById('clockSecondHand');
    var mh = document.getElementById('clockMinuteHand');
    var hh = document.getElementById('clockHourHand');
    if (sh) sh.setAttribute('transform', 'rotate(' + secAngle.toFixed(1) + ' 50 50)');
    if (mh) mh.setAttribute('transform', 'rotate(' + minAngle.toFixed(1) + ' 50 50)');
    if (hh) hh.setAttribute('transform', 'rotate(' + hrAngle.toFixed(1) + ' 50 50)');
  }
  window.updateDateTime = updateDateTime;

  /* ── Set Active Menu Item ────────────────────────────── */
  function applyActiveMenu(pageFile) {
    if (!pageFile) return;
    var items = document.querySelectorAll('.sidebar .menu-item');
    for (var i = 0; i < items.length; i++) {
      var href = items[i].getAttribute('href') || '';
      if (href === pageFile || href.indexOf(pageFile) !== -1) {
        items[i].classList.add('active');
      } else {
        items[i].classList.remove('active');
      }
    }
  }

  /* ── Force Western digits on number inputs ───────────────
   * Chromium renders <input type="number"> values using Eastern
   * Arabic-Indic digits (١٢٣...) when the browser locale is Arabic,
   * regardless of lang="en". The only reliable fix is to switch to
   * type="text" with inputmode="decimal" so the browser never
   * localises the displayed digits. */
  function forceWesternDigitsOnNumberInputs(root) {
    var scope = root || document;
    var inputs = scope.querySelectorAll('input[type="number"]');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      el.type = 'text';
      el.setAttribute('inputmode', 'decimal');
      el.setAttribute('dir', 'ltr');
      el.style.textAlign = el.style.textAlign || 'left';
      if (!el.getAttribute('pattern')) {
        el.setAttribute('pattern', '[0-9.]*');
      }
    }
  }

  function initNumberInputDigitFix() {
    forceWesternDigitsOnNumberInputs();
    try {
      var observer = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var node = added[j];
            if (node.nodeType !== 1) continue;
            if (node.matches && node.matches('input[type="number"]')) {
              node.type = 'text';
              node.setAttribute('inputmode', 'decimal');
              node.setAttribute('dir', 'ltr');
              node.style.textAlign = node.style.textAlign || 'left';
              if (!node.getAttribute('pattern')) node.setAttribute('pattern', '[0-9.]*');
            } else if (node.querySelectorAll) {
              forceWesternDigitsOnNumberInputs(node);
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  }

  /* ── Apply Language to Injected Layout ───────────────── */
  function applyLayoutLanguage() {
    var lang = (ZS.getItem('preferred-language') || 'en').toLowerCase();
    if (lang !== 'ar' && lang !== 'fr' && lang !== 'en') lang = 'en';

    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
    if (lang === 'ar') {
      document.body.classList.add('rtl');
    } else {
      document.body.classList.remove('rtl');
    }
    forceWesternDigitsOnNumberInputs();

    document.querySelectorAll('[data-' + lang + ']').forEach(function (el) {
      var val = el.getAttribute('data-' + lang);
      if (val !== null) el.textContent = val;
    });

    document.querySelectorAll('[data-' + lang + '-placeholder]').forEach(function (el) {
      var val = el.getAttribute('data-' + lang + '-placeholder');
      if (val !== null) el.setAttribute('placeholder', val);
    });

    document.querySelectorAll('[data-' + lang + '-title]').forEach(function (el) {
      var val = el.getAttribute('data-' + lang + '-title');
      if (val !== null) el.setAttribute('title', val);
    });

    var langSelect = document.getElementById('headerLanguageSelect');
    if (langSelect && langSelect.value !== lang) {
      langSelect.value = lang;
    }

    var fsBtn = document.getElementById('headerFullscreenBtn');
    if (fsBtn) fsBtn.remove();

    // Direction change affects geometry.
    applyLayoutGeometry();

    document.dispatchEvent(new CustomEvent('layoutLanguageChanged', { detail: { language: lang } }));
  }
  window.applyLayoutLanguage = applyLayoutLanguage;

  function installExportDisableGuards() {
    // Legacy export disable guards are intentionally disabled to allow
    // local export features across ERP modules.
    window.__ZERALDA_EXPORT_DISABLED__ = false;
  }

  /* ── Load Shared Layout via fetch ────────────────────── */
  // Cache the layout HTML in sessionStorage (tab-local only; never pollute server kv_store).
  var _layoutCacheVersion = '20261030_v4';
  var _cachedLayoutHTML = null;
  try {
    // Purge legacy server-synced layout shell key from ZS so stale menu links never return
    if (typeof ZS !== 'undefined' && ZS.removeItem) {
      ZS.removeItem('zeralda-layout-shell-html');
      ZS.removeItem('zeralda-layout-shell-version');
    }
    var cachedVersion = sessionStorage.getItem('zeralda-layout-shell-version');
    if (cachedVersion === _layoutCacheVersion) {
      _cachedLayoutHTML = sessionStorage.getItem('zeralda-layout-shell-html');
    } else {
      sessionStorage.removeItem('zeralda-layout-shell-html');
      sessionStorage.setItem('zeralda-layout-shell-version', _layoutCacheVersion);
    }
  } catch (_) {}

  function loadSharedLayout() {
    var mount = document.getElementById('sharedLayoutMount');
    if (!mount) {
      console.warn('[layout_shell] No #sharedLayoutMount element found.');
      return Promise.resolve();
    }
    var activePage = mount.getAttribute('data-active-page') || '';

    // Use cached HTML if available (avoids fetch on every page navigation)
    var fetchPromise = _cachedLayoutHTML
      ? Promise.resolve(_cachedLayoutHTML)
      : fetch('shared/layout_shell.html?v=20261027_v3')
          .then(function (res) {
            if (!res.ok) throw new Error('Failed to load layout_shell.html: ' + res.status);
            return res.text();
          })
          .then(function (html) {
            _cachedLayoutHTML = html; // Cache for subsequent navigations
            try { sessionStorage.setItem('zeralda-layout-shell-html', html); } catch (_) {}
            return html;
          });

    return fetchPromise
      .then(function (html) {
        console.log('[layout_shell] Layout HTML loaded, has onchange:', html.indexOf('onHeaderCompanySwitch') !== -1);
        mount.insertAdjacentHTML('afterend', html);
        mount.remove();

        // Eliminate redundant developer credit duplicates (keep single official card in sidebar footer)
        try {
          var dupCredits = document.querySelectorAll('.shell-global-footer, .shell-developer-credit');
          for (var dc = 0; dc < dupCredits.length; dc++) {
            if (dupCredits[dc] && dupCredits[dc].parentNode) {
              dupCredits[dc].parentNode.removeChild(dupCredits[dc]);
            }
          }
        } catch (_) {}

        initHeaderLanguageSelector();
        initHeaderZoomControls();
        initHeaderFullscreenButton();
        initHeaderLicenseBadge();
        if (window.ZeraldaTheme && typeof window.ZeraldaTheme.updateIcons === 'function') {
          window.ZeraldaTheme.updateIcons();
        }
        applyActiveMenu(activePage);
        applyLayoutLanguage();
        applySidebarState();
        applyLayoutGeometry();
        updateDateTime();
        setInterval(updateDateTime, 1000);

        // Notify other scripts that the shared layout is ready
        document.dispatchEvent(new CustomEvent('sharedLayoutLoaded'));

        // Auto-load Unified Document Printer if not already loaded & permanently remove floating alerts
        try {
          // Permanently cleanup any floating Smart Alerts Hub or Sync & Backup floating pill
          ['zeraldaAlertsHubWrapper', 'zeraldaAlertsButton', 'zeraldaAlertsDropdown', 'zeraldaAlertsBadge', 'zeraldaSyncPill', 'zeraldaSyncHubModal', 'zeraldaMobileNotifBanner'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el && el.parentNode) el.parentNode.removeChild(el);
          });
          var hideStyle = document.createElement('style');
          hideStyle.textContent = '#zeraldaAlertsHubWrapper, #zeraldaAlertsButton, #zeraldaAlertsDropdown, #zeraldaAlertsBadge, #zeraldaSyncPill, #zeraldaSyncHubModal, #zeraldaMobileNotifBanner, .alerts-hub-wrapper, .proactive-alerts-hub { display:none !important; visibility:hidden !important; pointer-events:none !important; opacity:0 !important; }';
          document.head.appendChild(hideStyle);

          if (!window.UnifiedDocumentPrinter) {
            var sp = document.createElement('script');
            sp.src = 'shared/unified_document_printer.js?v=20261009a';
            sp.defer = true;
            document.head.appendChild(sp);
          }

          if (!document.querySelector('script[src*="command_palette.js"]')) {
            var cp = document.createElement('script');
            cp.src = 'shared/command_palette.js?v=20261017_v1';
            cp.defer = true;
            document.head.appendChild(cp);
          }
        } catch (_) {}

        // Keep server alive while page is open and allow auto-shutdown after close.
        startClientLivenessBeacon();

        // Force-disable export features on all loaded pages.
        installExportDisableGuards();

        // ── Fast Navigation Prefetching (Instant Page Transitions) ──
        var _prefetchedUrls = {};
        function prefetchLink(href) {
          if (!href || href === '#' || href.indexOf('javascript:') === 0 || _prefetchedUrls[href]) return;
          _prefetchedUrls[href] = true;
          try {
            var pl = document.createElement('link');
            pl.rel = 'prefetch';
            pl.href = href;
            pl.as = 'document';
            document.head.appendChild(pl);
          } catch (_) {
            try { fetch(href, { priority: 'low', credentials: 'include' }).catch(function () {}); } catch (_) {}
          }
        }

        // When user hovers or touches menu links, prefetch target page ahead of click
        var navLinks = document.querySelectorAll('.sidebar .menu-item, a[href$=".html"]');
        navLinks.forEach(function(link) {
          var targetHref = link.getAttribute('href');
          if (targetHref && targetHref !== '#' && targetHref.indexOf('javascript:') !== 0) {
            link.addEventListener('pointerenter', function() { prefetchLink(link.getAttribute('href')); }, { passive: true });
            link.addEventListener('touchstart', function() { prefetchLink(link.getAttribute('href')); }, { passive: true });
          }
          link.addEventListener('click', function() {
            if (isFullscreenActive()) {
              setFullscreenIntent(true);
            }
          });
        });

        // Do not auto-request fullscreen after navigation.
        // Fullscreen can only be entered via explicit button click.
      })
      .catch(function (err) {
        console.error('[layout_shell]', err);
      });
  }
  window.loadSharedLayout = loadSharedLayout;

  function ensureShareSyncHub() {
    if (window.ZeraldaShareHub) return;
    if (document.querySelector('script[data-share-sync-hub="1"]')) return;
    var s = document.createElement('script');
    s.src = 'shared/share_sync_hub.js?v=20261020_hotfix2';
    s.defer = true;
    s.setAttribute('data-share-sync-hub', '1');
    document.head.appendChild(s);
  }

  function ensureGoogleDriveSync() {
    function runSync() {
      if (window.ZeraldaGoogle && typeof window.ZeraldaGoogle.init === 'function') {
        window.ZeraldaGoogle.init({
          onReady: function () {
            if (typeof window.ZeraldaGoogle.autoSyncOnLogin === 'function') {
              window.ZeraldaGoogle.autoSyncOnLogin();
            }
          }
        });
      }
    }

    if (window.ZeraldaGoogle) {
      runSync();
      return;
    }

    if (!document.querySelector('script[src*="google_sync.js"]')) {
      if (!window.google || !window.google.accounts) {
        var gsi = document.createElement('script');
        gsi.src = 'https://accounts.google.com/gsi/client';
        gsi.async = true;
        gsi.defer = true;
        document.head.appendChild(gsi);
      }
      var s = document.createElement('script');
      s.src = 'shared/google_sync.js?v=20261028_pdf_v2';
      s.defer = true;
      s.onload = function () {
        runSync();
      };
      document.head.appendChild(s);
    } else {
      var checkInterval = setInterval(function () {
        if (window.ZeraldaGoogle) {
          clearInterval(checkInterval);
          runSync();
        }
      }, 100);
      setTimeout(function () { clearInterval(checkInterval); }, 5000);
    }
  }

  /* ── Auto-initialise on DOMContentLoaded ─────────────── */
  function init() {
    ensureShareSyncHub();
    ensureGoogleDriveSync();
    installExportDisableGuards();
    initNumberInputDigitFix();
    if (document.getElementById('sharedLayoutMount')) {
      loadSharedLayout();
    }
  }

  // Wait for ZDB (IndexedDB cache) to be ready before init
  function startInit() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // Re-apply layout language when cache becomes fully loaded (after page refresh,
  // ZDB.ready() resolves before cache is populated, so applyLayoutLanguage may
  // read stale/default values. zeraldaStoreChange is dispatched by app_sync.js
  // after cacheReady() completes).
  window.showNetworkHostingModal = function () {
    var modalId = 'zeraldaNetworkHostModal';
    var existing = document.getElementById(modalId);
    if (existing) { existing.remove(); }

    var overlay = document.createElement('div');
    overlay.id = modalId;
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.7);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
    overlay.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:540px;width:90%;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,0.3);font-family:sans-serif;direction:rtl;" id="netHostModalContent"><div style="text-align:center;padding:20px;color:#2563eb;"><i class="fas fa-spinner fa-spin fa-2x"></i><div style="margin-top:10px;font-weight:700;">جاري جلب معلومات الشبكة والاستضافة...</div></div></div>';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    fetch('/api/system/network-info')
      .then(function(r){ return r.json(); })
      .then(function(data){
        var content = document.getElementById('netHostModalContent');
        if (!content) return;
        var isCloudHost = window.location.hostname && !['localhost', '127.0.0.1'].includes(window.location.hostname) && !/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))/.test(window.location.hostname);
        var directLan = data.directLanUrl || ('http://' + (data.primaryIp || '127.0.0.1') + '/');
        var lanUrl = isCloudHost ? (data.directLanUrl || directLan) : directLan;
        var remoteUrl = data.remoteUrl || (isCloudHost ? window.location.origin : (data.productionUrl || 'https://zeralda-erp-employees-main-production.up.railway.app'));

        content.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:16px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:38px;height:38px;border-radius:10px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;font-size:18px;">
                <i class="fas fa-network-wired"></i>
              </div>
              <div>
                <h3 style="margin:0;font-size:16px;font-weight:800;color:#0f172a;">الاستضافة والربط الشبكي للبرنامج</h3>
                <p style="margin:0;font-size:11px;color:#64748b;">${isCloudHost ? 'البرنامج متصل بالخادم السحابي المباشر (Cloud Production)' : 'جهازك يعمل الآن كمستضيف مركزي (Host Server)'}</p>
              </div>
            </div>
            <button onclick="document.getElementById('${modalId}').remove()" style="border:none;background:none;font-size:20px;cursor:pointer;color:#94a3b8;">&times;</button>
          </div>

          <div style="display:flex;flex-direction:column;gap:14px;">
            <!-- QR Code Connect Hub Link -->
            <a href="connect.html" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;background:linear-gradient(135deg, #2563eb, #7c3aed);color:#fff;border-radius:12px;text-decoration:none;font-weight:700;font-size:13.5px;box-shadow:0 4px 12px rgba(37,99,235,0.25);">
              <i class="fas fa-qrcode"></i>
              <span>📱 فتح صفحة الباركود (QR Code) لمسحها بالهاتف مباشرة</span>
              <span>↗</span>
            </a>

            <!-- Remote Worldwide / Cloud Access -->
            <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:12px;padding:14px;">
              <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#166534;margin-bottom:6px;">
                <i class="fas fa-globe"></i> 1. رابط الاستضافة السحابية والعالمية (Cloud / 4G / HTTPS):
              </div>
              ${remoteUrl ? `
                <p style="font-size:11.5px;color:#15803d;margin:0 0 8px 0;">متاح عالمياً من أي هاتف أو كمبيوتر عبر الإنترنت:</p>
                <div style="display:flex;gap:6px;align-items:center;">
                  <input type="text" readonly value="${remoteUrl}" style="flex:1;padding:8px 12px;font-size:13px;font-weight:700;color:#166534;background:#fff;border:1px solid #86efac;border-radius:8px;direction:ltr;text-align:left;">
                  <button onclick="navigator.clipboard.writeText('${remoteUrl}'); if(window.showToast) window.showToast('تم نسخ الرابط الخارجي!', 'success');" style="padding:8px 14px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
                    <i class="fas fa-copy"></i> نسخ
                  </button>
                  <a href="${remoteUrl}" target="_blank" style="padding:8px 14px;background:#15803d;color:#fff;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;">
                    فتح ↗
                  </a>
                </div>
              ` : `
                <p style="font-size:11.5px;color:#475569;margin:0 0 6px 0;">لفتح رابط خارجي آمن مشفر بـ HTTPS للوصول من خارج المكتب:</p>
                <div style="font-size:11px;background:#fff;border:1px dashed #86efac;border-radius:8px;padding:8px 10px;color:#166534;">
                  قم بتشغيل ملف <strong>START_REMOTE_TUNNEL.cmd</strong> الموجود في مجلد البرنامج لإنشاء رابط عالمي فوري مجاناً.
                </div>
              `}
            </div>

            <!-- Hostname / Domain Access -->
            <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:12px;padding:14px;">
              <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#1d4ed8;margin-bottom:6px;">
                <i class="fas fa-wifi"></i> 2. الدخول المباشر بالشبكة المحلية (Wi-Fi):
              </div>
              <p style="font-size:11.5px;color:#334155;margin:0 0 8px 0;">يعمل فوراً على أي هاتف أو كمبيوتر في نفس الواي فاي المحلي:</p>
              <div style="display:flex;flex-direction:column;gap:6px;">
                <div style="display:flex;gap:6px;align-items:center;">
                  <input type="text" readonly value="${lanUrl}" style="flex:1;padding:8px 12px;font-size:13px;font-weight:800;color:#1e40af;background:#fff;border:1px solid #60a5fa;border-radius:8px;direction:ltr;text-align:left;">
                  <button onclick="navigator.clipboard.writeText('${lanUrl}'); if(window.showToast) window.showToast('تم نسخ الرابط!', 'success');" style="padding:8px 14px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">
                    <i class="fas fa-copy"></i> نسخ
                  </button>
                </div>
              </div>
            </div>

            <!-- Quick Info -->
            <div style="font-size:11px;color:#64748b;display:flex;justify-content:space-between;padding:0 4px;">
              <span>عنوان IP الجهاز: <strong>${data.primaryIp}</strong></span>
              <span>المنفذ: <strong>${data.port || '8080'}</strong></span>
              <span>الحالة: <strong style="color:#16a34a;">خادم مستضيف نشط</strong></span>
            </div>
          </div>
        `;
      })
      .catch(function(err){
        var content = document.getElementById('netHostModalContent');
        if (content) content.innerHTML = '<div style="color:#ef4444;text-align:center;">تعذر جلب معلومات الشبكة: ' + err + '</div>';
      });
  };

  document.addEventListener('zeraldaStoreChange', function (e) {
    try {
      var keys = (e && e.detail && Array.isArray(e.detail.keys)) ? e.detail.keys : [];
      if (keys.indexOf('preferred-language') !== -1 || keys.indexOf('zeralda-settings') !== -1) {
        applyLayoutLanguage();
      }
    } catch (_) {}
  });

  // Universal OCR dynamic loader for header button
  window.openUniversalOcrModal = function (opts) {
    if (window.ZeraldaOCR) {
      window.ZeraldaOCR.open(opts || { mode: 'universal' });
      return;
    }
    if (!document.querySelector('link[href*="ocr_unified.css"]') && !document.querySelector('link[href*="zeralda_core.bundle.css"]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'styles/zeralda_core.bundle.css?v=20261021_b1';
      document.head.appendChild(link);
    }
    var existingScript = document.querySelector('script[src*="ocr.js"]');
    if (!existingScript) {
      var script = document.createElement('script');
      script.src = 'shared/ocr.js?v=20261012d';
      script.onload = function () {
        if (window.ZeraldaOCR) {
          window.ZeraldaOCR.open(opts || { mode: 'universal' });
        }
      };
      document.body.appendChild(script);
    } else {
      setTimeout(function () {
        if (window.ZeraldaOCR) window.ZeraldaOCR.open(opts || { mode: 'universal' });
      }, 500);
    }
  };

  if (window.ZDB && window.ZDB.ready) {
    window.ZDB.ready().then(startInit).catch(startInit);
  } else {
    startInit();
  }
})();


/* === EMBEDDED HEADER SWITCHERS (Company & Language) === */
(function () {
  function getSettings() {
    try {
      var raw = (window.ZS && typeof window.ZS.getItem === 'function') ? window.ZS.getItem('zeralda-settings') : null;
      if (!raw) {
        try { raw = localStorage.getItem('zeralda-settings'); } catch (_) {}
      }
      if (!raw && window.ZDB && typeof window.ZDB.getItem === 'function') {
        try { raw = window.ZDB.getItem('zeralda-settings'); } catch (_) {}
      }
      var parsed = raw ? JSON.parse(raw) : {};
      var companies = Array.isArray(parsed.companies) ? parsed.companies : [];

      // Fallback: check legacy shadow keys if companies list is empty
      if (!companies.length) {
        try {
          var legRaw = (window.ZS && typeof window.ZS.getItem === 'function') ? window.ZS.getItem('zeralda-companies') : null;
          if (!legRaw) legRaw = localStorage.getItem('zeralda-companies');
          if (legRaw) {
            var legParsed = JSON.parse(legRaw);
            if (Array.isArray(legParsed) && legParsed.length) {
              companies = legParsed;
            }
          }
        } catch (_) {}
      }

      return {
        companies: companies,
        activeCompanyId: parsed.activeCompanyId || null,
        ...parsed
      };
    } catch (e) {
      return { companies: [], activeCompanyId: null };
    }
  }

  function saveSettings(next) {
    const current = getSettings();
    // حماية: لا تحذف الشركات إذا لم يتم تمريرها في next
    if (!next.hasOwnProperty('companies') && current.companies) {
      next.companies = current.companies;
    }
    if (!next.hasOwnProperty('activeCompanyId') && current.activeCompanyId) {
      next.activeCompanyId = current.activeCompanyId;
    }
    var str = JSON.stringify(next);
    if (window.ZS && typeof window.ZS.setItem === 'function') {
      window.ZS.setItem('zeralda-settings', str);
      if (next.activeCompanyId) {
        window.ZS.setItem('zeralda-active-company', next.activeCompanyId);
      }
    }
    try {
      localStorage.setItem('zeralda-settings', str);
      if (next.activeCompanyId) {
        localStorage.setItem('zeralda-active-company', next.activeCompanyId);
        localStorage.setItem('zeralda_last_active_company', next.activeCompanyId);
      }
    } catch (_) {}
    if (window.ZDB && typeof window.ZDB.setItem === 'function') {
      try {
        window.ZDB.setItem('zeralda-settings', str);
        if (next.activeCompanyId) {
          window.ZDB.setItem('zeralda-active-company', next.activeCompanyId);
        }
      } catch (_) {}
    }
  }

  function normalizeActive(settings) {
    const companies = Array.isArray(settings.companies) ? settings.companies : [];
    if (!companies.length) return { companies: [], activeId: null };
    
    // Check user persistent preference first
    let activeId = null;
    try {
      var savedPref = localStorage.getItem('zeralda_last_active_company');
      if (savedPref && companies.some(function (c) { return c && c.id === savedPref; })) {
        activeId = savedPref;
      }
    } catch (_) {}

    if (!activeId) {
      activeId = settings.activeCompanyId;
    }

    // If activeCompanyId is missing or invalid, try zeralda-active-company fallback
    if (!activeId || !companies.some(function (c) { return c && c.id === activeId; })) {
      try {
        var ac = (window.ZS && typeof window.ZS.getItem === 'function') ? window.ZS.getItem('zeralda-active-company') : localStorage.getItem('zeralda-active-company');
        if (ac) {
          try { activeId = String(JSON.parse(ac).id || ''); } catch (_) { activeId = String(ac); }
        }
      } catch (_) {}
    }
    // If still missing or invalid, pick first available company
    if (!activeId || !companies.some(function (c) { return c && c.id === activeId; })) {
      activeId = companies[0].id;
      saveSettings({ ...settings, activeCompanyId: activeId });
    }
    return { companies: companies, activeId: activeId };
  }

  var _fetchAttempted = false;

  function renderCompanySwitcher() {
    const switcher = document.getElementById('companySwitcher');
    if (!switcher) return;

    const wrap = switcher.closest('.company-switcher');
    const settings = getSettings();
    const state = normalizeActive(settings);

    // If companies are still empty, try async fetch from server once
    if (!state.companies.length && !_fetchAttempted) {
      _fetchAttempted = true;
      tryFetchSettingsFromServer();
    }

    switcher.innerHTML = '';

    if (!state.companies.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '...جاري التحميل / Loading';
      switcher.appendChild(opt);
      switcher.disabled = true;
      // Do NOT hide the wrap on mobile! Keep it visible so layout remains stable
      if (wrap) {
        wrap.style.display = 'inline-flex';
        wrap.style.opacity = '0.85';
      }
      return;
    }

    if (wrap) {
      wrap.style.display = 'inline-flex';
      wrap.style.opacity = '1';
    }
    switcher.disabled = false;

    state.companies.forEach(function (company) {
      if (!company || !company.id) return;
      const opt = document.createElement('option');
      opt.value = company.id;
      opt.textContent = company.name || 'Company';
      switcher.appendChild(opt);
    });

    switcher.value = state.activeId || '';

    if (typeof window.applyLayoutGeometry === 'function') {
      try { window.applyLayoutGeometry(); } catch (_) {}
    }
  }

  function tryFetchSettingsFromServer() {
    try {
      fetch('/api/store?key=zeralda-settings', {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      })
      .then(function (res) {
        if (!res.ok) throw new Error('status ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var val = data && data.value;
        if (!val && data && typeof data === 'object' && data['zeralda-settings']) {
          val = data['zeralda-settings'];
        }
        if (typeof val === 'string') {
          try { val = JSON.parse(val); } catch (_) {}
        }
        if (val && Array.isArray(val.companies) && val.companies.length) {
          var str = JSON.stringify(val);
          if (window.ZS && typeof window.ZS.setItem === 'function') {
            window.ZS.setItem('zeralda-settings', str);
          }
          try { localStorage.setItem('zeralda-settings', str); } catch (_) {}
          renderCompanySwitcher();
        }
      })
      .catch(function () {});
    } catch (_) {}
  }

  if (typeof window.onHeaderCompanySwitch !== 'function') {
    window.onHeaderCompanySwitch = function (id) {
      console.log('[header_company_switcher] onHeaderCompanySwitch called with id:', id);
      const settings = getSettings();
      const companies = Array.isArray(settings.companies) ? settings.companies : [];
      if (!id || !companies.some(function (c) { return c && c.id === id; })) return;

      if (String(settings.activeCompanyId || '') === String(id)) {
        renderCompanySwitcher();
        return;
      }

      // إصلاح جذري: flush pending writes BEFORE changing company ID.
      // إذا غيّرنا ID أولاً، فإن flushPending سيستخدم ID الجديد ويُرسل
      // بيانات الشركة القديمة بمفتاح الشركة الجديدة (تلوث البيانات!).
      // المفاتيح في _pendingWrites هي بالفعل scoped (من queueSet)،
      // لكن ZDB.flush و AppSync.flushPending يجب أن يكتملا قبل التبديل.
      var flushPromise = Promise.resolve();
      if (window.AppSync && typeof window.AppSync.flushPending === 'function') {
        flushPromise = flushPromise.then(function () {
          return window.AppSync.flushPending().catch(function () {});
        });
      }
      if (window.ZDB && typeof window.ZDB.flush === 'function') {
        flushPromise = flushPromise.then(function () {
          return window.ZDB.flush().catch(function () {});
        });
      }

      flushPromise.then(function () {
        // NOW safe to switch — all pending writes for the old company are flushed
        saveSettings({ ...settings, activeCompanyId: id });
        // Keep zeralda-active-company in sync (used as sync fallback in company_storage.js)
        if (window.ZS && typeof window.ZS.setItem === 'function') {
          window.ZS.setItem('zeralda-active-company', id);
        }
        try { localStorage.setItem('zeralda-active-company', id); } catch (_) {}
        try { localStorage.setItem('zeralda_last_active_company', id); } catch (_) {}
        renderCompanySwitcher();

        // Apply company-specific data context immediately across current module.
        // company_storage.js listens for this event, flushes pending state,
        // and safely reloads the page.
        console.log('[header_company_switcher] Dispatching activeCompanyChanged event for company:', id);
        window.dispatchEvent(new CustomEvent('activeCompanyChanged', { detail: { companyId: id } }));
      });
    };
  }

  window.addEventListener('storage', function (event) {
    if (!event || event.key === 'zeralda-settings' || event.key === 'zeralda-companies' || event.key === 'zeralda-active-company') {
      renderCompanySwitcher();
    }
  });

  // Re-render when store or cache becomes ready
  document.addEventListener('zeraldaStorageReady', renderCompanySwitcher);
  document.addEventListener('zeraldaStoreChange', function (e) {
    if (!e || !e.detail || !e.detail.keys || e.detail.keys.indexOf('zeralda-settings') !== -1 || e.detail.keys.indexOf('zeralda-companies') !== -1) {
      renderCompanySwitcher();
    }
  });
  window.addEventListener('activeCompanyChanged', renderCompanySwitcher);
  window.addEventListener('zdb-remote-write', renderCompanySwitcher);
  window.addEventListener('zdb-remote-company-change', renderCompanySwitcher);
  document.addEventListener('sharedLayoutLoaded', renderCompanySwitcher);

  // Poll / retry for the first few seconds if companies are not yet loaded
  var retryCount = 0;
  var retryTimer = setInterval(function () {
    retryCount++;
    var s = getSettings();
    if ((s.companies && s.companies.length) || retryCount > 15) {
      clearInterval(retryTimer);
    }
    renderCompanySwitcher();
  }, 300);

  function startInit() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderCompanySwitcher);
    } else {
      renderCompanySwitcher();
    }
  }

  // Wait for cacheReady (not just openDB ready) to ensure cache is populated
  var cachePromise = Promise.resolve();
  if (window.ZDB && typeof window.ZDB.cacheReady === 'function') {
    cachePromise = window.ZDB.cacheReady();
  } else if (window.ZS && typeof window.ZS.cacheReady === 'function') {
    cachePromise = window.ZS.cacheReady();
  } else if (window.ZDB && window.ZDB.ready) {
    cachePromise = window.ZDB.ready();
  }

  cachePromise.then(startInit).catch(startInit);
})();

;
(function () {
  const STORAGE_KEY = 'zeralda-settings';

  function readSettings() {
    try {
      const raw = ZS.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function writeLanguage(lang) {
    const settings = readSettings();
    settings.preferredLanguage = lang;
    settings.language = lang;
    try { ZS.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch(_) {}
    try { ZS.setItem('preferred-language', lang); } catch(_) {}
    try { ZS.setItem('language', lang); } catch(_) {}
    try { localStorage.setItem('preferred-language', lang); } catch(_) {}
    try { localStorage.setItem('language', lang); } catch(_) {}
    try { document.cookie = 'preferred-language=' + encodeURIComponent(lang) + ';path=/;max-age=31536000;SameSite=Lax'; } catch(_) {}
  }

  function getLanguage() {
    const settings = readSettings();
    const fromSettings = (settings.preferredLanguage || settings.language || '').toLowerCase();
    if (fromSettings === 'ar' || fromSettings === 'fr' || fromSettings === 'en') return fromSettings;
    const fromPreferred = (ZS.getItem('preferred-language') || '').toLowerCase();
    if (fromPreferred === 'ar' || fromPreferred === 'fr' || fromPreferred === 'en') return fromPreferred;
    const legacy = (ZS.getItem('language') || '').toLowerCase();
    if (legacy === 'ar' || legacy === 'fr' || legacy === 'en') return legacy;
    return 'ar';
  }

  function updateLangLabel(lang) {
    const label = document.getElementById('current-lang');
    if (!label) return;
    const names = { en: 'English', ar: 'العربية', fr: 'Français' };
    label.textContent = names[lang] || 'العربية';
  }

  function updateDirection(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === 'ar') ? 'rtl' : 'ltr';
    if (document.body) {
      if (lang === 'ar') {
        document.body.classList.add('rtl');
      } else {
        document.body.classList.remove('rtl');
      }
    }
  }

  function getSelectElement() {
    return document.getElementById('headerLanguageSelect') || document.getElementById('headerLanguageSwitcher');
  }

  function applySelectionOnly(lang) {
    const select = getSelectElement();
    if (select && select.value !== lang) select.value = lang;
    updateLangLabel(lang);
    updateDirection(lang);
    if (window.applyUnifiedTranslations) {
      try { window.applyUnifiedTranslations(lang); } catch (e) {}
    }
    if (window.applyLayoutLanguage) {
      try { window.applyLayoutLanguage(); } catch (e) {}
    }
  }

  function onChangeLanguage(lang) {
    writeLanguage(lang);
    applySelectionOnly(lang);

    // Broadcast through UnifiedI18N
    if (window.UnifiedI18N && typeof window.UnifiedI18N.setCurrentLang === 'function') {
      try { window.UnifiedI18N.setCurrentLang(lang); } catch(e) {}
    }

    // Call page-level handlers if present
    if (typeof window.loadLanguage === 'function') {
      try { window.loadLanguage(); } catch(e) {}
    } else if (typeof window.changeLanguage === 'function') {
      try { window.changeLanguage(lang); } catch(e) {}
    } else if (typeof window.applyTranslations === 'function' && window.applyTranslations !== window.applyUnifiedTranslations) {
      try { window.applyTranslations(lang); } catch(e) {}
    }

    // Dispatch event across DOM
    try {
      document.dispatchEvent(new CustomEvent('layoutLanguageChanged', { detail: { language: lang } }));
    } catch(e) {}

    // Flush IndexedDB in background
    if (window.ZDB && typeof window.ZDB.flush === 'function') {
      window.ZDB.flush().catch(function() {});
    }

    // Only reload if the page specifically demands it
    if (window.__ZERALDA_RELOAD_ON_LANG_CHANGE__ === true) {
      location.reload();
    }
  }

  // Expose globally so inline onchange works
  window.onHeaderLanguageSwitch = function (value) {
    var lang = String(value || 'ar').toLowerCase();
    if (lang !== 'en' && lang !== 'ar' && lang !== 'fr') return;
    onChangeLanguage(lang);
  };

  function initLanguageSwitcher() {
    var select = getSelectElement();
    if (!select) return;

    var current = getLanguage();
    applySelectionOnly(current);

    if (!select._hasLangListener) {
      select._hasLangListener = true;
      select.addEventListener('change', function (e) {
        onChangeLanguage(e.target.value);
      });
    }
  }

  window.addEventListener('storage', function (event) {
    if (!event || (event.key !== 'preferred-language' && event.key !== STORAGE_KEY && event.key !== 'language')) return;
    applySelectionOnly(getLanguage());
  });

  function startInit() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initLanguageSwitcher);
    } else {
      initLanguageSwitcher();
    }
  }

  // Wait for ZDB (IndexedDB cache) to be ready
  if (window.ZDB && window.ZDB.ready) {
    window.ZDB.ready().then(startInit).catch(startInit);
  } else {
    startInit();
  }

  // Re-init when shared layout is loaded asynchronously
  document.addEventListener('sharedLayoutLoaded', initLanguageSwitcher);
})();

;
