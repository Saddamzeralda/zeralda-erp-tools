/**
 * Zeralda ERP — Theme Manager
 * يحمّل الثيم المحفوظ من cookie ويطبّقه BEFORE paint (لا وميض FOUC).
 * يستخدم data-theme attribute على <html> لتفعيل تجاوزات CSS في dark_theme.css.
 *
 * ملاحظة: نستخدم cookie (وليس localStorage) لأنه متزامن ومتاح فوراً قبل أي JS.
 *
 * الاستخدام:
 *   - يُحمّل هذا الملف في <head> قبل أي CSS لتفادي وميض الشاشة.
 *   - window.ZeraldaTheme.apply('dark' | 'light' | 'auto')
 *   - window.ZeraldaTheme.getSaved()  → 'dark' | 'light' | 'auto' | null
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
    return _readCookie(THEME_COOKIE) || null;
  }

  function _applyAttribute(resolved) {
    var root = document.documentElement;
    if (resolved === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.setAttribute('data-theme', 'light');
    }
  }

  function apply(theme) {
    var resolved = theme;
    if (theme === 'auto' || !theme) {
      resolved = _resolveAuto();
    }
    _applyAttribute(resolved);
    // Persist the user's *choice* (not the resolved value) in cookie
    _writeCookie(THEME_COOKIE, theme || 'auto', 365);
    return resolved;
  }

  function getSaved() {
    return _readSaved();
  }

  // ── Apply ASAP (before CSS paints) ──
  var saved = _readSaved();
  var initialTheme = saved || 'light';
  var resolved = (initialTheme === 'auto') ? _resolveAuto() : initialTheme;
  _applyAttribute(resolved);

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
    getResolved: function () {
      var s = getSaved();
      if (s === 'auto' || !s) return _resolveAuto();
      return s;
    }
  };
})();
