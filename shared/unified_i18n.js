/**
 * Unified I18N — نظام ترجمة موحد لكل الوحدات
 * ============================================
 * النظام الموحد للترجمة (إصدار 2.0):
 * 1. data-en/data-ar/data-fr — للعناصر الثابتة في HTML
 * 2. createRuntimeTranslator() — للنصوص الديناميكية في JS
 *
 * يوفر:
 * - applyUnifiedTranslations(lang) — يترجم كل العناصر data-*
 * - createRuntimeTranslator(dict) — يُنشئ دالة ترجمة للنصوص الديناميكية
 * - trUnified(key, fallback) — دالة ترجمة موحدة
 * - getCurrentLang() — اللغة الحالية
 * - onLanguageChange(callback) — استدعاء عند تغيير اللغة
 */

(function () {
  'use strict';

  var _currentLang = 'en';
  var _listeners = [];
  var SUPPORTED = ['en', 'ar', 'fr'];

  function getCurrentLang() {
    try {
      if (typeof ZS !== 'undefined' && ZS.getItem) {
        _currentLang = ZS.getItem('preferred-language') || 'en';
      }
    } catch (e) {}
    if (SUPPORTED.indexOf(_currentLang) === -1) _currentLang = 'en';
    return _currentLang;
  }

  function setCurrentLang(lang) {
    if (SUPPORTED.indexOf(lang) === -1) lang = 'en';
    _currentLang = lang;
    try {
      if (typeof ZS !== 'undefined' && ZS.setItem) {
        ZS.setItem('preferred-language', lang);
      }
    } catch (e) {}
    // Apply RTL/LTR
    var html = document.documentElement;
    var body = document.body;
    if (lang === 'ar') {
      if (html) { html.setAttribute('dir', 'rtl'); html.setAttribute('lang', 'ar'); }
      if (body) body.classList.add('rtl');
    } else {
      if (html) { html.setAttribute('dir', 'ltr'); html.setAttribute('lang', lang); }
      if (body) body.classList.remove('rtl');
    }
    // Notify listeners
    _listeners.forEach(function (cb) {
      try { cb(lang); } catch (e) { console.warn('[i18n] Listener error:', e); }
    });
  }

  function onLanguageChange(callback) {
    if (typeof callback === 'function') _listeners.push(callback);
  }

  /**
   * createRuntimeTranslator — يُنشئ دالة ترجمة للنصوص الديناميكية في JS
   * النمط: { key: { en: 'text', ar: 'نص', fr: 'texte' } }
   * يدعم المتغيرات: t('hello', { name: 'John' }) مع 'Hello {name}'
   */
  function createRuntimeTranslator(dict) {
    var safeDict = dict || {};
    return function tRuntime(key, vars, fallback) {
      var replacements = vars;
      var defaultText = fallback;
      if (replacements == null) replacements = {};
      if (typeof replacements === 'string') {
        defaultText = replacements;
        replacements = {};
      }
      var lang = getCurrentLang();
      var entry = safeDict[key];
      var template = (entry && (entry[lang] || entry.en)) || defaultText || key;
      return String(template).replace(/\{(\w+)\}/g, function (_, name) {
        return replacements[name] != null ? replacements[name] : '';
      });
    };
  }

  /**
   * دالة ترجمة موحدة — تبحث في كل مصادر الترجمة
   */
  function tr(key, fallback) {
    var lang = getCurrentLang();
    // 1. ابحث في كائن translations المحلي (data-key system — للتوافق مع الوحدات القديمة)
    if (typeof translations !== 'undefined' && translations[lang] && translations[lang][key]) {
      return translations[lang][key];
    }
    if (typeof translations !== 'undefined' && translations.en && translations.en[key]) {
      return translations.en[key];
    }
    // 2. fallback
    return fallback || key;
  }

  /**
   * تطبيق الترجمات على كل العناصر — نظامان موحدان
   */
  function applyUnifiedTranslations(lang) {
    if (!lang) lang = getCurrentLang();
    if (SUPPORTED.indexOf(lang) === -1) lang = 'en';

    function setTextPreservingIcons(el, text) {
      if (!el || text === null || typeof text === 'undefined') return;
      var hasIcon = el.querySelector('i, svg');
      if (hasIcon) {
        var textNode = null;
        for (var i = 0; i < el.childNodes.length; i++) {
          if (el.childNodes[i].nodeType === 3 && el.childNodes[i].nodeValue.trim().length > 0) {
            textNode = el.childNodes[i];
            break;
          }
        }
        if (textNode) {
          textNode.nodeValue = ' ' + text;
        } else {
          el.appendChild(document.createTextNode(' ' + text));
        }
      } else {
        el.textContent = text;
      }
    }

    // ── النظام 1: data-en/data-ar/data-fr (للنصوص الثابتة في HTML) ──
    document.querySelectorAll('[data-' + lang + ']').forEach(function (el) {
      var v = el.getAttribute('data-' + lang);
      if (v !== null) setTextPreservingIcons(el, v);
    });

    // data-{lang}-placeholder
    document.querySelectorAll('[data-' + lang + '-placeholder]').forEach(function (el) {
      var v = el.getAttribute('data-' + lang + '-placeholder');
      if (v !== null) el.setAttribute('placeholder', v);
    });

    // data-{lang}-title
    document.querySelectorAll('[data-' + lang + '-title]').forEach(function (el) {
      var v = el.getAttribute('data-' + lang + '-title');
      if (v !== null) el.setAttribute('title', v);
    });

    // .menu-text مع data-en/data-ar/data-fr
    document.querySelectorAll('.menu-text').forEach(function (el) {
      if (lang === 'ar' && el.hasAttribute('data-ar')) {
        el.textContent = el.getAttribute('data-ar');
      } else if (lang === 'fr' && el.hasAttribute('data-fr')) {
        el.textContent = el.getAttribute('data-fr');
      } else if (el.hasAttribute('data-en')) {
        el.textContent = el.getAttribute('data-en');
      }
    });

    // ARIA labels
    document.querySelectorAll('[data-' + lang + '-aria-label]').forEach(function (el) {
      var v = el.getAttribute('data-' + lang + '-aria-label');
      if (v !== null) el.setAttribute('aria-label', v);
    });

    // ─ـ التوافق الخلفي: data-key + translations (يُحذف لاحقاً) ──
    if (typeof translations !== 'undefined' && translations) {
      document.querySelectorAll('[data-key]').forEach(function (el) {
        var key = el.getAttribute('data-key');
        if (!key) return;
        var val = (translations[lang] && translations[lang][key]) || (translations.en && translations.en[key]);
        if (val) setTextPreservingIcons(el, val);
      });
      document.querySelectorAll('[data-placeholder-key]').forEach(function (el) {
        var key = el.getAttribute('data-placeholder-key');
        if (!key) return;
        var val = (translations[lang] && translations[lang][key]) || (translations.en && translations.en[key]);
        if (val) el.setAttribute('placeholder', val);
      });
      document.querySelectorAll('[data-title-key]').forEach(function (el) {
        var key = el.getAttribute('data-title-key');
        if (!key) return;
        var val = (translations[lang] && translations[lang][key]) || (translations.en && translations.en[key]);
        if (val) el.setAttribute('title', val);
      });
    }

    // ── RTL/LTR ──
    var html = document.documentElement;
    var body = document.body;
    if (lang === 'ar') {
      if (html) { html.setAttribute('dir', 'rtl'); html.setAttribute('lang', 'ar'); }
      if (body) body.classList.add('rtl');
    } else {
      if (html) { html.setAttribute('dir', 'ltr'); html.setAttribute('lang', lang); }
      if (body) body.classList.remove('rtl');
    }

    // ── استدعاء applyTranslations المحلي إذا موجود (للعناصر الخاصة) ──
    if (typeof applyTranslations === 'function' && applyTranslations !== applyUnifiedTranslations) {
      try { applyTranslations(lang); } catch (e) {}
    }

    // ── إعادة بناء الجداول الديناميكية ──
    _listeners.forEach(function (cb) {
      try { cb(lang); } catch (e) {}
    });
  }

  /**
   * تهيئة النظام — يستدعى عند تحميل الصفحة
   */
  function init() {
    var lang = getCurrentLang();
    // تطبيق الترجمات فوراً
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        applyUnifiedTranslations(lang);
      });
    } else {
      applyUnifiedTranslations(lang);
    }
    // الاستماع لتغييرات اللغة من storage event
    window.addEventListener('storage', function (e) {
      if (e.key === 'preferred-language' && e.newValue) {
        applyUnifiedTranslations(e.newValue);
      }
    });
    // Also listen for zeraldaStoreChange (dispatched by app_sync.js when
    // cache becomes ready after page refresh). Without this, the initial
    // language from getCurrentLang() may be 'en' (cache empty) and never
    // gets corrected when the real value loads from IndexedDB.
    document.addEventListener('zeraldaStoreChange', function (e) {
      try {
        var keys = (e && e.detail && Array.isArray(e.detail.keys)) ? e.detail.keys : [];
        if (keys.indexOf('preferred-language') !== -1 || keys.indexOf('zeralda-settings') !== -1) {
          applyUnifiedTranslations(getCurrentLang());
        }
      } catch (_) {}
    });
  }

  // ── تصدير API ──
  window.UnifiedI18N = {
    getCurrentLang: getCurrentLang,
    setCurrentLang: setCurrentLang,
    applyTranslations: applyUnifiedTranslations,
    tr: tr,
    onLanguageChange: onLanguageChange,
    init: init,
    supported: SUPPORTED
  };

  // أسماء بديلة للتوافق
  window.trUnified = tr;
  window.applyUnifiedTranslations = applyUnifiedTranslations;
  // createRuntimeTranslator — النظام الموحد للنصوص الديناميكية في JS
  window.createRuntimeTranslator = createRuntimeTranslator;

  // بدء تلقائي
  init();
})();
