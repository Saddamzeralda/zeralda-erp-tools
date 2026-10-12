/**
 * runtime_i18n.js — Compatibility shim
 * Now delegates to unified_i18n.js (createRuntimeTranslator was merged there).
 * This file is kept for backward compatibility with HTML pages that still
 * reference it via <script src="shared/runtime_i18n.js">.
 * No new code should depend on this file — use unified_i18n.js instead.
 */
(function () {
  // createRuntimeTranslator is now defined in unified_i18n.js.
  // If unified_i18n.js hasn't loaded yet (script order), define a fallback
  // that will be overwritten when unified_i18n.js loads.
  if (!window.createRuntimeTranslator) {
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
        var rawLang = 'en';
        try {
          if (typeof ZS !== 'undefined' && ZS.getItem) {
            rawLang = String(ZS.getItem('preferred-language') || 'en').toLowerCase();
          }
        } catch (e) {}
        var lang = rawLang.indexOf('ar') === 0 ? 'ar' : (rawLang.indexOf('fr') === 0 ? 'fr' : 'en');
        var entry = safeDict[key];
        var template = (entry && (entry[lang] || entry.en)) || defaultText || key;
        return String(template).replace(/\{(\w+)\}/g, function (_, name) {
          return replacements[name] != null ? replacements[name] : '';
        });
      };
    }
    window.createRuntimeTranslator = createRuntimeTranslator;
  }
})();
