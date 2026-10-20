/**
 * Zeralda ERP — Theme Manager (v20261018g)
 * يحمّل الثيم المحفوظ من cookie / localStorage ويطبّقه BEFORE paint (لا وميض FOUC).
 * يدعم data-theme attribute على <html> و class .dark-theme على <body> لتفعيل Dark Mode.
 *
 * الاستخدام:
 *   - window.ZeraldaTheme.apply('dark' | 'light' | 'auto')
 *   - window.ZeraldaTheme.toggle()  → تبديل فوري بين الداكن والفاتح
 *   - window.ZeraldaTheme.getResolved()  → 'dark' | 'light'
 *   - window.toggleZeraldaTheme()
 */
(function () {
  'use strict';

  var THEME_COOKIE = 'zeralda-theme';

  function _readCookie(name) {
    try {
      var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    } catch (_) { return null; }
  }

  function _writeCookie(name, value, days) {
    try {
      var expires = '';
      if (days) {
        var d = new Date();
        d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = '; expires=' + d.toUTCString();
      }
      document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=/; SameSite=Strict';
    } catch (_) {}
    try {
      localStorage.setItem(name, value);
    } catch (_) {}
  }

  function _resolveAuto() {
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (_) {}
    return 'light';
  }

  function _readSaved() {
    var fromCookie = _readCookie(THEME_COOKIE);
    if (fromCookie) return fromCookie;
    try {
      var fromLS = localStorage.getItem(THEME_COOKIE);
      if (fromLS) return fromLS;
    } catch (_) {}
    return null;
  }

  function updateThemeIcons(resolved) {
    try {
      var theme = resolved || window.ZeraldaTheme.getResolved();
      var isDark = (theme === 'dark');
      var icons = document.querySelectorAll('#headerThemeIcon, #posThemeIcon, .theme-toggle-icon');
      for (var i = 0; i < icons.length; i++) {
        var ic = icons[i];
        if (isDark) {
          ic.className = 'fas fa-sun';
          ic.style.color = '#fbbf24';
        } else {
          ic.className = 'fas fa-moon';
          ic.style.color = '#fbbf24';
        }
      }
      var btns = document.querySelectorAll('#headerThemeToggleBtn, #posThemeToggleBtn');
      for (var b = 0; b < btns.length; b++) {
        var btn = btns[b];
        var titleText = isDark ? 'تبديل إلى الوضع الفاتح / Mode Clair' : 'تبديل إلى الوضع الداكن / Mode Sombre';
        btn.setAttribute('title', titleText);
        btn.setAttribute('aria-label', titleText);
      }
    } catch (_) {}
  }

  function _applyAttribute(resolved) {
    var root = document.documentElement;
    if (resolved === 'dark') {
      root.setAttribute('data-theme', 'dark');
      if (document.body) {
        document.body.classList.add('dark-theme');
        document.body.classList.add('dark-mode');
      }
    } else {
      root.setAttribute('data-theme', 'light');
      if (document.body) {
        document.body.classList.remove('dark-theme');
        document.body.classList.remove('dark-mode');
      }
    }
    updateThemeIcons(resolved);
  }

  function apply(theme) {
    var resolved = theme;
    if (theme === 'auto' || !theme) {
      resolved = _resolveAuto();
    }
    _applyAttribute(resolved);
    _writeCookie(THEME_COOKIE, theme || 'auto', 365);
    try {
      window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: resolved, choice: theme } }));
    } catch (_) {}
    return resolved;
  }

  function getSaved() {
    return _readSaved();
  }

  function getResolved() {
    var s = getSaved();
    if (s === 'auto' || !s) return _resolveAuto();
    return s;
  }

  function toggle() {
    var cur = getResolved();
    var next = (cur === 'dark') ? 'light' : 'dark';
    apply(next);
    return next;
  }

  // ── Auto-inject dark_theme.css if missing ──
  try {
    if (!document.querySelector('link[href*="dark_theme.css"]') && !document.querySelector('link[href*="zeralda_core.bundle.css"]')) {
      var dtLink = document.createElement('link');
      dtLink.rel = 'stylesheet';
      var prefix = (window.location.pathname.indexOf('/modules/') !== -1) ? '../../' : '';
      dtLink.href = prefix + 'styles/dark_theme.css?v=20261018g';
      (document.head || document.documentElement).appendChild(dtLink);
    }
  } catch (_) {}

  // ── Apply ASAP (before CSS paints) ──
  var saved = _readSaved();
  var initialTheme = saved || 'light';
  var initialResolved = (initialTheme === 'auto') ? _resolveAuto() : initialTheme;
  _applyAttribute(initialResolved);

  // Re-sync body class and icons once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      _applyAttribute(getResolved());
    });
  } else {
    setTimeout(function () { _applyAttribute(getResolved()); }, 0);
  }

  document.addEventListener('sharedLayoutLoaded', function () {
    updateThemeIcons(getResolved());
  });

  // ── Listen for system theme changes when in 'auto' mode ──
  try {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSystemChange = function () {
      var current = _readSaved();
      if (current === 'auto' || !current) {
        _applyAttribute(_resolveAuto());
      }
    };
    if (mq.addEventListener) {
      mq.addEventListener('change', onSystemChange);
    } else if (mq.addListener) {
      mq.addListener(onSystemChange);
    }
  } catch (_) {}

  // ── Public API ──
  window.ZeraldaTheme = {
    apply: apply,
    getSaved: getSaved,
    getResolved: getResolved,
    toggle: toggle,
    updateIcons: updateThemeIcons
  };

  window.toggleZeraldaTheme = toggle;
  window.ThemeManager = {
    toggleTheme: toggle,
    applyTheme: apply,
    getTheme: getSaved,
    getResolved: getResolved
  };
})();
