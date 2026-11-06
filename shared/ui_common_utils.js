/**
 * Zeralda ERP - Unified UI Common Utilities
 * Centralized helpers to eliminate cross-module code duplication:
 * - HTML escaping
 * - Currency formatting & ticker
 * - Modal management
 * - Active user profile reflection
 * - Accessible keyboard navigation & ARIA labels
 * - OCR extraction helpers
 */
(function (global) {
  'use strict';

  // ── 1. HTML Escaping ──────────────────────────────────────────
  global.escapeHtml = global.escapeHtml || function (s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c];
    });
  };

  // ── 2. Currency Helpers & Active Company Symbol ───────────────
  global.getCurrencySymbol = global.getCurrencySymbol || function () {
    try {
      if (global.ZS && typeof global.ZS.getItem === 'function') {
        var legacy = global.ZS.getItem('system-currency');
        if (legacy) {
          var map = { 'USD': '$', 'EUR': '€', 'GBP': '£', 'DZD': 'DA', 'SAR': 'SAR', 'MAD': 'MAD', 'TND': 'TND', 'EGP': 'EGP' };
          return map[legacy] || '$';
        }
        var raw = global.ZS.getItem('zeralda-settings');
        if (raw) {
          var settings = JSON.parse(raw);
          return (settings && settings.systemCurrency) ? settings.systemCurrency : '$';
        }
      }
    } catch (_) {}
    return '$';
  };

  global.getCurrencyKey = global.getCurrencyKey || function () {
    try {
      if (global.ZS && typeof global.ZS.getItem === 'function') {
        var legacy = global.ZS.getItem('system-currency');
        if (legacy) return legacy;
        var raw = global.ZS.getItem('zeralda-settings');
        if (raw) {
          var settings = JSON.parse(raw);
          return (settings && settings.systemCurrency) ? settings.systemCurrency : 'USD';
        }
      }
    } catch (_) {}
    return 'USD';
  };

  global.formatDZD = global.formatDZD || function (amount) {
    var val = parseFloat(amount) || 0;
    return val.toLocaleString('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + global.getCurrencySymbol();
  };

  global.formatCurrency = global.formatCurrency || function (amount, cur) {
    var val = parseFloat(amount) || 0;
    var symbol = cur || global.getCurrencySymbol();
    return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + symbol;
  };

  global.applyCurrencyText = global.applyCurrencyText || function (rootSelector) {
    try {
      var symbol = global.getCurrencySymbol();
      var root = (rootSelector ? document.querySelector(rootSelector) : null) || document.querySelector('.main-content') || document.body;
      if (!root) return;
      root.querySelectorAll('*').forEach(function (el) {
        if (el.children.length === 0 && el.textContent) {
          var txt = el.textContent;
          if (txt.includes(' DA') || txt.includes(' $') || txt.includes(' €') || txt.includes(' £')) {
            el.textContent = txt.replace(/\s+(DA|\$|€|£|USD|EUR|DZD|GBP)/g, ' ' + symbol);
          }
        }
      });
    } catch (_) {}
  };

  var _currencyCache = null;
  global.startCurrencyTicker = global.startCurrencyTicker || function () {
    _currencyCache = global.getCurrencyKey();
    setInterval(function () {
      var current = global.getCurrencyKey();
      if (current !== _currencyCache) {
        _currencyCache = current;
        global.applyCurrencyText();
      }
    }, 1000);
  };

  // ── 3. DOM & Modal Management ─────────────────────────────────
  global.setVal = global.setVal || function (id, value) {
    var el = document.getElementById(id);
    if (el) el.value = (value !== undefined && value !== null) ? value : '';
  };

  global.openModal = global.openModal || function (modalId) {
    var el = document.getElementById(modalId);
    if (el) {
      el.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  };

  global.closeModal = global.closeModal || function (modalId) {
    var el = document.getElementById(modalId);
    if (el) {
      el.classList.remove('active');
      document.body.style.overflow = 'auto';
    }
  };

  // ── 4. Active User Reflection ─────────────────────────────────
  global.applyActiveUserFromSettings = global.applyActiveUserFromSettings || function () {
    try {
      if (!global.ZS || typeof global.ZS.getItem !== 'function') return;
      var raw = global.ZS.getItem('zeralda-settings');
      if (!raw) return;
      var settings = JSON.parse(raw);
      var users = settings && Array.isArray(settings.users) ? settings.users : [];
      var activeId = settings && settings.activeUserId ? settings.activeUserId : null;
      var u = users.find(function (x) { return x.id === activeId; }) || null;
      if (!u) return;

      var nameEl = document.querySelector('.user-info div div') || document.getElementById('headerUserName');
      var avatarEl = document.querySelector('.user-avatar') || document.getElementById('headerUserAvatar');
      if (nameEl) nameEl.textContent = u.fullName || 'User';
      if (avatarEl) {
        var parts = (u.fullName || 'U').trim().split(/\s+/);
        var initials = (parts[0] ? parts[0][0] : 'U') + (parts[1] ? parts[1][0] : '');
        avatarEl.textContent = initials.toUpperCase();
      }
    } catch (_) {}
  };

  // ── 5. Accessibility & Keyboard Navigation ────────────────────
  global.applyLocalizedAriaLabels = global.applyLocalizedAriaLabels || function (lang) {
    try {
      var safeLang = (lang === 'ar' || lang === 'fr') ? lang : 'en';
      document.querySelectorAll('[data-en-aria-label]').forEach(function (element) {
        var value = element.getAttribute('data-' + safeLang + '-aria-label') || element.getAttribute('data-en-aria-label') || '';
        if (value) element.setAttribute('aria-label', value);
      });
    } catch (_) {}
  };

  global.initTabsKeyboardNavigation = global.initTabsKeyboardNavigation || function (containerSelector) {
    try {
      var container = document.querySelector(containerSelector || '.tabs-header') || document.querySelector('.nav-tabs');
      if (!container || container._hasTabsKeyboardNav) return;
      container._hasTabsKeyboardNav = true;

      var tabButtons = Array.from(container.querySelectorAll('[role="tab"], .tab-btn, button[data-tab]'));
      if (!tabButtons.length) return;

      container.addEventListener('keydown', function (e) {
        var activeIndex = tabButtons.indexOf(document.activeElement);
        if (activeIndex === -1) return;

        var nextIndex = activeIndex;
        var isRtl = document.documentElement.dir === 'rtl';

        if (e.key === 'ArrowRight') {
          nextIndex = isRtl ? activeIndex - 1 : activeIndex + 1;
        } else if (e.key === 'ArrowLeft') {
          nextIndex = isRtl ? activeIndex + 1 : activeIndex - 1;
        } else if (e.key === 'Home') {
          nextIndex = 0;
        } else if (e.key === 'End') {
          nextIndex = tabButtons.length - 1;
        } else {
          return;
        }

        e.preventDefault();
        if (nextIndex < 0) nextIndex = tabButtons.length - 1;
        if (nextIndex >= tabButtons.length) nextIndex = 0;

        tabButtons[nextIndex].focus();
        tabButtons[nextIndex].click();
      });
    } catch (_) {}
  };

  // ── 6. Parsing & Extraction Utilities ─────────────────────────
  global.safeJSONParse = global.safeJSONParse || function (str, fallback) {
    if (!str) return fallback !== undefined ? fallback : null;
    try {
      return JSON.parse(str);
    } catch (_) {
      return fallback !== undefined ? fallback : null;
    }
  };

  global.pickFirstNonEmpty = global.pickFirstNonEmpty || function () {
    for (var i = 0; i < arguments.length; i++) {
      var val = arguments[i];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return String(val).trim();
      }
    }
    return '';
  };

  global.extractSupplierRc = global.extractSupplierRc || function (text) {
    if (!text) return '';
    var m = String(text).match(/\bRC\s*[:.\s]?\s*([0-9A-Za-z\/\-]+)/i);
    return m ? m[1].trim() : '';
  };

  global.extractSupplierNis = global.extractSupplierNis || function (text) {
    if (!text) return '';
    var m = String(text).match(/\bNIS\s*[:.\s]?\s*([0-9\s\-]+)/i);
    return m ? m[1].replace(/\s+/g, '').trim() : '';
  };

})(typeof window !== 'undefined' ? window : this);
