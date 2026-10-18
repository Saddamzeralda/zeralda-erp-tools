/* Zeralda ERP — Shared Layout Shell Loader (v2026-02-26)
 * Fetches shared/layout_shell.html and injects the header + sidebar
 * into any page that contains <div id="sharedLayoutMount" data-active-page="...">.
 */
(function () {
  'use strict';

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
        var allDivs = document.querySelectorAll('div, section, aside, header');
        for (var i = 0; i < allDivs.length; i++) {
          var txt = allDivs[i].textContent || '';
          if (txt.indexOf("Centre d'alertes") !== -1 || txt.indexOf("مركز التنبيهات الذكي") !== -1 || txt.indexOf("Smart Alerts Hub") !== -1 || txt.indexOf("مركز المزامنة") !== -1 || txt.indexOf("Sync & Backup") !== -1) {
            var target = allDivs[i].closest('[style*="fixed"], [style*="absolute"], .zeralda-sync-pill, .alerts-hub-wrapper') || allDivs[i];
            if (target && target.parentNode && target !== document.body && target !== document.documentElement && !target.closest('#backups') && !target.closest('.settings-content')) {
              target.parentNode.removeChild(target);
            }
          }
        }
      } catch (_) {}
    }
    __purgeFloatingWidgets();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', __purgeFloatingWidgets);
    }
    window.addEventListener('load', __purgeFloatingWidgets);
    setInterval(__purgeFloatingWidgets, 400);

    if (window.MutationObserver) {
      new MutationObserver(function(muts) {
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
      }).observe(document.documentElement, { childList: true, subtree: true });
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

    // Wait for ZDB to flush pending IndexedDB writes, THEN reload.
    // Without this, the async IndexedDB write may not complete before the
    // reload, and the new language is lost (cache reloads from stale IDB).
    function doReload() { location.reload(); }
    if (window.ZDB && typeof window.ZDB.flush === 'function') {
      window.ZDB.flush().then(doReload).catch(function () {
        // Fallback: wait 150ms then reload (IDB write usually completes by then)
        setTimeout(doReload, 150);
      });
    } else {
      // No ZDB — reload immediately
      setTimeout(doReload, 0);
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
    if (!btn) return;

    updateFullscreenButtonState();
    btn.style.display = 'inline-flex';

    document.addEventListener('fullscreenchange', updateFullscreenButtonState);
    document.addEventListener('webkitfullscreenchange', updateFullscreenButtonState);
    document.addEventListener('msfullscreenchange', updateFullscreenButtonState);

    // Intercept F11 keypress: use our Fullscreen API toggle instead of browser native,
    // so the button and F11 key behave identically.
    window.addEventListener('keydown', function (ev) {
      if (ev && ev.key === 'F11') {
        ev.preventDefault();
        toggleHeaderFullscreen();
      }
    });
  }
  window.initHeaderFullscreenButton = initHeaderFullscreenButton;

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
    if (fsBtn) fsBtn.style.display = 'inline-flex';

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
  // Cache the layout HTML in ZS to avoid re-fetching on every page navigation.
  // ZS is synchronous (in-memory cache) and survives navigation within the same tab.
  var _layoutCacheVersion = '20261018i';
  var _cachedLayoutHTML = null;
  try {
    var cachedVersion = ZS.getItem('zeralda-layout-shell-version');
    if (cachedVersion === _layoutCacheVersion) {
      _cachedLayoutHTML = ZS.getItem('zeralda-layout-shell-html');
    } else {
      ZS.removeItem('zeralda-layout-shell-html');
      ZS.setItem('zeralda-layout-shell-version', _layoutCacheVersion);
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
      : fetch('shared/layout_shell.html?v=20261018h')
          .then(function (res) {
            if (!res.ok) throw new Error('Failed to load layout_shell.html: ' + res.status);
            return res.text();
          })
          .then(function (html) {
            _cachedLayoutHTML = html; // Cache for subsequent navigations
            try { ZS.setItem('zeralda-layout-shell-html', html); } catch (_) {}
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

        // When user clicks on menu links, set fullscreen intent before navigation
        var menuItems = document.querySelectorAll('.sidebar .menu-item');
        menuItems.forEach(function(link) {
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
    s.src = 'shared/share_sync_hub.js?v=20260306a';
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
      s.src = 'shared/google_sync.js?v=20261015a';
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
    if (!document.querySelector('link[href*="ocr_unified.css"]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'styles/ocr_unified.css?v=20261012d';
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
