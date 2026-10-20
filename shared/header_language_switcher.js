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
