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
    ZS.setItem(STORAGE_KEY, JSON.stringify(settings));
    ZS.setItem('preferred-language', lang);
    ZS.setItem('language', lang);
  }

  function getLanguage() {
    const settings = readSettings();
    const fromSettings = (settings.preferredLanguage || settings.language || '').toLowerCase();
    if (fromSettings === 'ar' || fromSettings === 'fr' || fromSettings === 'en') return fromSettings;
    const fromPreferred = (ZS.getItem('preferred-language') || '').toLowerCase();
    if (fromPreferred === 'ar' || fromPreferred === 'fr' || fromPreferred === 'en') return fromPreferred;
    const legacy = (ZS.getItem('language') || '').toLowerCase();
    if (legacy === 'ar' || legacy === 'fr' || legacy === 'en') return legacy;
    return 'en';
  }

  function updateLangLabel(lang) {
    const label = document.getElementById('current-lang');
    if (!label) return;
    const names = { en: 'English', ar: 'العربية', fr: 'Français' };
    label.textContent = names[lang] || 'English';
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
  }

  function onChangeLanguage(lang) {
    writeLanguage(lang);
    applySelectionOnly(lang);
    // Wait for ZDB (IndexedDB) to flush the write before reloading.
    // Without this, the async IndexedDB write may not complete before
    // the reload and the language change is lost.
    function doReload() { location.reload(); }
    if (window.ZDB && typeof window.ZDB.flush === 'function') {
      window.ZDB.flush().then(doReload).catch(function () {
        setTimeout(doReload, 150);
      });
    } else {
      setTimeout(doReload, 0);
    }
  }

  // Expose globally so the inline onchange in layout_shell.html works
  // (same pattern as onHeaderCompanySwitch)
  window.onHeaderLanguageSwitch = function (value) {
    var lang = String(value || 'en').toLowerCase();
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
