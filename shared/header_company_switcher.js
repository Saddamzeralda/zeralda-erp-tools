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
    }
    try { localStorage.setItem('zeralda-settings', str); } catch (_) {}
    if (window.ZDB && typeof window.ZDB.setItem === 'function') {
      try { window.ZDB.setItem('zeralda-settings', str); } catch (_) {}
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
    // If still missing or invalid, or if pointing to empty overlink while others exist, pick best company
    if (!activeId || !companies.some(function (c) { return c && c.id === activeId; }) || (activeId === 'company_vwd61te' && companies.length > 1)) {
      var preferred = companies.find(function(c) { return c && (c.id === 'company_fbd85142' || c.id === 'company_kq40xpm' || c.id === 'default-company'); });
      activeId = preferred ? preferred.id : companies[0].id;
      saveSettings({ ...settings, activeCompanyId: activeId });
      // Keep zeralda-active-company in sync
      if (window.ZS && typeof window.ZS.setItem === 'function') {
        window.ZS.setItem('zeralda-active-company', activeId);
      }
      try { localStorage.setItem('zeralda-active-company', activeId); } catch (_) {}
      try { localStorage.setItem('zeralda_last_active_company', activeId); } catch (_) {}
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
        // company_storage.js listens for this event, waits for ZDB.flush(),
        // then reloads the page. We no longer reload here to avoid a double
        // reload race (the flush may take longer than 60ms).
        console.log('[header_company_switcher] Dispatching activeCompanyChanged event for company:', id);
        window.dispatchEvent(new CustomEvent('activeCompanyChanged', { detail: { companyId: id } }));

        // Auto-login to Google when company changes (best-effort, non-blocking).
        // The reload is handled by company_storage.js after ZDB.flush() completes.
        setTimeout(function () {
          if (typeof ZeraldaGoogle !== 'undefined' && typeof ZeraldaGoogle.init === 'function') {
            try {
              var profile = ZeraldaGoogle.getProfile();
              if (!profile) {
                // Auto-login silently to Google
                ZeraldaGoogle.init();
                ZeraldaGoogle.requestToken(function(p) {
                  // Silent auto-login - no notification
                  console.log('Auto-login to Google:',  p ? 'success' : 'failed');
                });
              }
            } catch (e) {
              console.error('Auto-login error:', e);
            }
          }
        }, 60);
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
