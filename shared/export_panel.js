/* ============================================================
   export_panel.js  –  Zeralda ERP universal export panel
   Injects a persistent Export dropdown button on every module page.
   Formats: Excel · PDF · CSV · Word · JSON · TXT · Print
   ============================================================ */
(function () {
  'use strict';

  /* ── i18n labels ─────────────────────────────────────────── */
  var LABELS = {
    en: {
      export:     'Export',
      excel:      'Excel (.xlsx)',
      pdf:        'PDF',
      csv:        'CSV',
      word:       'Word (.docx)',
      json:       'JSON',
      txt:        'Text (.txt)',
      print:      'Print',
      no_data:    'No data to export.',
      exporting:  'Exporting…',
      done:       'Export complete.',
      err:        'Export failed - ',
      no_table:   'No table found on this page.',
      select_fmt: 'Select format'
    },
    ar: {
      export:     'تصدير',
      excel:      'Excel (.xlsx)',
      pdf:        'PDF',
      csv:        'CSV',
      word:       'Word (.docx)',
      json:       'JSON',
      txt:        'نص (.txt)',
      print:      'طباعة',
      no_data:    'لا توجد بيانات للتصدير.',
      exporting:  'جارٍ التصدير…',
      done:       'اكتمل التصدير.',
      err:        'فشل التصدير - ',
      no_table:   'لم يتم العثور على جدول في هذه الصفحة.',
      select_fmt: 'اختر الصيغة'
    },
    fr: {
      export:     'Exporter',
      excel:      'Excel (.xlsx)',
      pdf:        'PDF',
      csv:        'CSV',
      word:       'Word (.docx)',
      json:       'JSON',
      txt:        'Texte (.txt)',
      print:      'Imprimer',
      no_data:    'Aucune donnée à exporter.',
      exporting:  'Exportation…',
      done:       'Exportation terminée.',
      err:        'Échec de l\'export - ',
      no_table:   'Aucun tableau trouvé sur cette page.',
      select_fmt: 'Choisir le format'
    }
  };

  function getLang() {
    try { return ZS.getItem('preferred-language') || 'en'; } catch (_) { return 'en'; }
  }

  function t(key) {
    var lang = getLang();
    return (LABELS[lang] || LABELS.en)[key] || LABELS.en[key] || key;
  }

  /* ── toast helper ────────────────────────────────────────── */
  function toast(msg, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type || 'info');
      return;
    }
    // Fallback lightweight toast
    var el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position:'fixed', bottom:'20px', right:'20px', zIndex:99999,
      background: type === 'success' ? '#16a34a' : type === 'error' ? '#dc2626' : '#1d4ed8',
      color:'#fff', padding:'10px 18px', borderRadius:'8px',
      fontFamily:'Segoe UI,Arial,sans-serif', fontSize:'13px',
      boxShadow:'0 4px 16px rgba(0,0,0,.25)', maxWidth:'320px'
    });
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 3500);
  }

  /* ── CSS injection ───────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById('_erpExportStyles')) return;
    var css = [
      '#_erpExportPanel{position:fixed;bottom:28px;right:22px;z-index:9900;font-family:Segoe UI,Arial,sans-serif}',
      '#_erpExportBtn{display:flex;align-items:center;gap:7px;background:#1e40af;color:#fff;border:none;',
      '  padding:9px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;',
      '  box-shadow:0 4px 14px rgba(30,64,175,.45);transition:background .15s,transform .1s}',
      '#_erpExportBtn:hover{background:#1d3ba0;transform:translateY(-1px)}',
      '#_erpExportBtn:active{transform:translateY(0)}',
      '#_erpExportBtn svg{width:15px;height:15px;fill:currentColor}',
      '#_erpExportMenu{display:none;position:absolute;bottom:44px;right:0;background:#fff;',
      '  border:1px solid #e2e8f0;border-radius:10px;min-width:190px;',
      '  box-shadow:0 8px 28px rgba(0,0,0,.18);overflow:hidden}',
      '#_erpExportMenu.open{display:block}',
      '#_erpExportMenu .ep-title{padding:8px 14px 6px;font-size:11px;font-weight:700;',
      '  color:#64748b;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid #f1f5f9}',
      '#_erpExportMenu button{display:flex;align-items:center;gap:9px;width:100%;background:none;',
      '  border:none;padding:9px 14px;text-align:left;cursor:pointer;font-size:13px;',
      '  color:#1e293b;transition:background .12s}',
      '#_erpExportMenu button:hover{background:#f0f9ff}',
      '#_erpExportMenu button .ep-icon{width:18px;text-align:center;font-size:14px}',
      '#_erpExportMenu .ep-sep{height:1px;background:#f1f5f9;margin:2px 0}',
      '@media(max-width:480px){#_erpExportPanel{bottom:14px;right:10px}}'
    ].join('');
    var s = document.createElement('style');
    s.id = '_erpExportStyles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ── panel HTML ──────────────────────────────────────────── */
  var FORMATS = [
    { id:'excel', icon:'📊', label: function(){return t('excel');} },
    { id:'pdf',   icon:'📄', label: function(){return t('pdf');} },
    { id:'csv',   icon:'📋', label: function(){return t('csv');} },
    { sep: true },
    { id:'word',  icon:'📝', label: function(){return t('word');} },
    { id:'json',  icon:'{ }', label: function(){return t('json');} },
    { id:'txt',   icon:'📃', label: function(){return t('txt');} },
    { sep: true },
    { id:'print', icon:'🖨', label: function(){return t('print');} }
  ];

  function buildPanel() {
    var wrap = document.createElement('div');
    wrap.id = '_erpExportPanel';

    var menu = document.createElement('div');
    menu.id = '_erpExportMenu';

    var titleDiv = document.createElement('div');
    titleDiv.className = 'ep-title';
    titleDiv.textContent = t('select_fmt');
    menu.appendChild(titleDiv);

    FORMATS.forEach(function (fmt) {
      if (fmt.sep) {
        var sep = document.createElement('div');
        sep.className = 'ep-sep';
        menu.appendChild(sep);
        return;
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.fmt = fmt.id;
      btn.innerHTML = '<span class="ep-icon">' + fmt.icon + '</span>' + fmt.label();
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        menu.classList.remove('open');
        doExport(fmt.id);
      });
      menu.appendChild(btn);
    });

    var trigger = document.createElement('button');
    trigger.id = '_erpExportBtn';
    trigger.type = 'button';
    trigger.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M5 20h14v-2H5m14-9h-4V3H9v6H5l7 7 7-7z"/></svg>' +
      '<span id="_erpExportBtnLabel">' + t('export') + '</span>';
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      // Refresh labels on language change
      titleDiv.textContent = t('select_fmt');
      trigger.querySelector('#_erpExportBtnLabel').textContent = t('export');
      menu.querySelectorAll('button[data-fmt]').forEach(function (b) {
        var fmt = FORMATS.find(function (f) { return f.id === b.dataset.fmt; });
        if (fmt) b.lastChild.textContent = fmt.label();
      });
      menu.classList.toggle('open');
    });

    document.addEventListener('click', function () { menu.classList.remove('open'); });

    wrap.appendChild(menu);
    wrap.appendChild(trigger);
    return wrap;
  }

  /* ── resolve active table / data ─────────────────────────── */
  function getPageTitle() {
    // Try h1, then tab heading, else document title
    var h1 = document.querySelector('.content-area h1, .page-header h1, .card-title, h1');
    if (h1) return h1.textContent.trim();
    return document.title.replace(/ *[-|].*/, '').trim() || 'Export';
  }

  function ymdStamp() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return '' + y + m + day;
  }

  function getModuleIdFromPath() {
    var path = String((window.location && window.location.pathname) || '').toLowerCase();
    var m = path.match(/\/modules\/([^\/]+)\//);
    return m && m[1] ? m[1] : 'module';
  }

  function getActiveContextSlug() {
    var activeEl = document.querySelector(
      '.nav-link.active, .tab-link.active, .tab-btn.active, .tabs .active, [role="tab"][aria-selected="true"]'
    );
    var raw = '';
    if (activeEl) {
      raw = String(
        activeEl.getAttribute('data-tab') ||
        activeEl.getAttribute('aria-controls') ||
        activeEl.id ||
        activeEl.textContent ||
        ''
      );
    }
    if (!raw) raw = getPageTitle();
    var slug = titleToKey(raw).replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return slug || 'all';
  }

  function buildExportFileStem() {
    return titleToKey(getModuleIdFromPath() + '_' + getActiveContextSlug() + '_' + ymdStamp());
  }

  function findActiveTable() {
    // 1. Custom registered source via data-export-source attribute
    var srcEl = document.querySelector('[data-export-source]');
    if (srcEl) {
      var sel = srcEl.dataset.exportSource;
      var tbl = document.querySelector(sel);
      if (tbl) return tbl;
    }
    // 2. If active tab points to a target panel/table, prefer it.
    var activeTab = document.querySelector('[role="tab"][aria-selected="true"], .nav-link.active, .tab-link.active, .tab-btn.active');
    if (activeTab) {
      var target = activeTab.getAttribute('data-bs-target') || activeTab.getAttribute('data-target');
      var controls = activeTab.getAttribute('aria-controls');
      var byTarget = target ? document.querySelector(target + ' table, ' + target + ' table.table') : null;
      if (byTarget) return byTarget;
      var byControls = controls ? document.querySelector('#' + CSS.escape(controls) + ' table, #' + CSS.escape(controls) + ' table.table') : null;
      if (byControls) return byControls;
    }

    // 3. Active/visible tab panel table
    var activePanel = document.querySelector('.tab-pane.active table.table, .tab-content .active table');
    if (activePanel) return activePanel;
    // 4. First visible table with class "table"
    var tables = document.querySelectorAll('table.table');
    for (var i = 0; i < tables.length; i++) {
      var tbl = tables[i];
      if (tbl.offsetParent !== null) return tbl;
    }
    // 5. Any visible table
    var all = document.querySelectorAll('table');
    for (var j = 0; j < all.length; j++) {
      if (all[j].offsetParent !== null) return all[j];
    }
    return null;
  }

  /* ── registered data providers ───────────────────────────── */
  var _providers = {};

  function registerProvider(scopeName, providerFn) {
    _providers[scopeName] = providerFn;
  }

  function getRegisteredData() {
    var keys = Object.keys(_providers);
    if (!keys.length) return null;
    // Use the last registered / most relevant provider
    var last = keys[keys.length - 1];
    try { return _providers[last](); } catch (_) { return null; }
  }

  function titleToKey(text) {
    return String(text == null ? '' : text)
      .replace(/[^a-zA-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  function rowsToColumns(rows) {
    var seen = {};
    var cols = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
      Object.keys(row).forEach(function (k) {
        if (seen[k]) return;
        seen[k] = true;
        cols.push({ key: k, label: k });
      });
      if (cols.length >= 24) break;
    }
    return cols;
  }

  function tryDataFromGlobal(name) {
    try {
      var val = window[name];
      if (Array.isArray(val) && val.length) {
        return { rows: val, columns: rowsToColumns(val) };
      }
    } catch (_) {}
    return null;
  }

  function tryDataFromLocalStorage(key) {
    try {
      var raw = ZS.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return { rows: parsed, columns: rowsToColumns(parsed) };
      }
    } catch (_) {}
    return null;
  }

  function mergePriority(baseList, preferredList) {
    var seen = {};
    var merged = [];
    (preferredList || []).forEach(function (k) {
      if (!k || seen[k]) return;
      seen[k] = true;
      merged.push(k);
    });
    (baseList || []).forEach(function (k) {
      if (!k || seen[k]) return;
      seen[k] = true;
      merged.push(k);
    });
    return merged;
  }

  function getActiveContextText() {
    var parts = [];
    function pushText(v) {
      var t = String(v == null ? '' : v).trim().toLowerCase();
      if (!t) return;
      parts.push(t);
    }

    var activeSelectors = [
      '.nav-link.active',
      '.tab-link.active',
      '.tab-btn.active',
      '.tab-pane.active',
      '.tabs .active'
    ];

    activeSelectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        pushText(el.textContent);
        pushText(el.id);
        pushText(el.getAttribute && el.getAttribute('data-tab'));
        pushText(el.getAttribute && el.getAttribute('data-target'));
        pushText(el.getAttribute && el.getAttribute('data-bs-target'));
        pushText(el.getAttribute && el.getAttribute('aria-controls'));
      });
    });

    return parts.join(' ');
  }

  function contextPriorityForModule(moduleId, contextText) {
    var c = String(contextText || '').toLowerCase();
    var rules = {
      sales: [
        { tokens: ['invoice', 'فاتورة', 'facture'], globals: ['invoicesData'], storage: ['invoices-data'] },
        { tokens: ['proforma', 'pro-forma'], globals: ['proformasData'], storage: ['proformas-data'] },
        { tokens: ['customer', 'client', 'زبون', 'عميل'], globals: ['customersData'], storage: ['customers-data'] },
        { tokens: ['product', 'item', 'منتج', 'produit'], globals: ['productsData'], storage: ['products-data'] }
      ],
      hr: [
        { tokens: ['employee', 'staff', 'موظف'], globals: ['employees', 'employeesData'], storage: ['employees-data'] },
        { tokens: ['attendance', 'presence', 'حضور'], globals: ['attendanceData'], storage: ['attendance-data'] },
        { tokens: ['leave', 'vacation', 'conge', 'إجازة'], globals: ['leaveData'], storage: ['leave-data'] },
        { tokens: ['payroll', 'salary', 'راتب'], globals: ['payrollData'], storage: ['payroll-data'] }
      ],
      inventory: [
        { tokens: ['product', 'item', 'stock', 'منتج', 'مخزون'], globals: ['products', 'productsData'], storage: ['products-data', 'inventory-data'] },
        { tokens: ['movement', 'transaction', 'حركة'], globals: ['stockMovements', 'stockMovementsData'], storage: ['stock-movements'] }
      ],
      purchasing: [
        { tokens: ['purchase', 'order', 'طلب', 'شراء'], globals: ['purchaseOrders'], storage: ['purchase-orders-data'] },
        { tokens: ['supplier', 'vendor', 'fournisseur', 'مورد'], globals: ['suppliersData'], storage: ['suppliers-data'] },
        { tokens: ['product', 'item', 'منتج'], globals: ['productsData'], storage: ['products-data'] },
        { tokens: ['movement', 'stock', 'حركة'], globals: ['stockMovements'], storage: ['stock-movements'] }
      ],
      finance: [
        { tokens: ['transaction', 'قيد', 'عملية'], globals: ['transactionsData'], storage: ['transactions-data'] },
        { tokens: ['journal', 'entry', 'دفتر'], globals: ['journalEntries'], storage: ['journal-entries-data'] },
        { tokens: ['account', 'حساب'], globals: ['accountsData'], storage: ['accounts-data'] },
        { tokens: ['expense', 'مصروف'], globals: ['expensesData'], storage: ['expenses-data'] }
      ],
      crm: [
        { tokens: ['customer', 'client', 'عميل'], globals: ['customersData'], storage: ['customers-data'] },
        { tokens: ['lead', 'فرصة'], globals: ['leadsData'], storage: ['leads-data'] },
        { tokens: ['opportunit', 'opportunite'], globals: ['opportunitiesData'], storage: ['opportunities-data'] },
        { tokens: ['contact', 'جهة'], globals: ['contactsData'], storage: ['contacts-data'] }
      ],
      services: [
        { tokens: ['service', 'خدمة'], globals: ['servicesData'], storage: ['services-data'] },
        { tokens: ['appointment', 'rendez', 'موعد'], globals: ['appointmentsData'], storage: ['appointments-data'] },
        { tokens: ['ticket', 'support', 'تذكرة'], globals: ['ticketsData'], storage: ['tickets-data'] }
      ],
      consulting: [
        { tokens: ['tender', 'appel', 'مناقصة'], globals: ['tendersData'], storage: ['tenders-data'] },
        { tokens: ['project', 'مشروع'], globals: ['projectsData'], storage: ['projects-data'] },
        { tokens: ['proposal', 'عرض'], globals: ['proposalsData'], storage: ['proposals-data'] }
      ],
      reports: [
        { tokens: ['report', 'تقرير'], globals: ['reportsData', 'reportData'], storage: ['reports-data'] },
        { tokens: ['analytic', 'dashboard', 'تحليل'], globals: ['analyticsData'], storage: ['analytics-data'] }
      ]
    };

    var selected = rules[moduleId] || [];
    for (var i = 0; i < selected.length; i++) {
      var r = selected[i];
      for (var j = 0; j < r.tokens.length; j++) {
        if (c.indexOf(r.tokens[j]) >= 0) {
          return { globals: r.globals || [], storage: r.storage || [] };
        }
      }
    }
    return { globals: [], storage: [] };
  }

  function inferBestDataSet() {
    var path = String((window.location && window.location.pathname) || '').toLowerCase();
    var moduleConfigs = [
      {
        id: 'sales',
        match: '/modules/sales/',
        globals: ['invoicesData', 'proformasData', 'customersData', 'productsData'],
        storage: ['invoices-data', 'proformas-data', 'customers-data', 'products-data']
      },
      {
        id: 'hr',
        match: '/modules/hr/',
        globals: ['employees', 'employeesData', 'attendanceData', 'leaveData', 'payrollData'],
        storage: ['employees-data', 'attendance-data', 'leave-data', 'payroll-data']
      },
      {
        id: 'inventory',
        match: '/modules/inventory/',
        globals: ['products', 'productsData', 'stockMovements', 'stockMovementsData'],
        storage: ['products-data', 'stock-movements', 'inventory-data']
      },
      {
        id: 'purchasing',
        match: '/modules/purchasing/',
        globals: ['productsData', 'stockMovements', 'purchaseOrders', 'suppliersData'],
        storage: ['products-data', 'stock-movements', 'purchase-orders-data', 'suppliers-data']
      },
      {
        id: 'finance',
        match: '/modules/finance/',
        globals: ['transactionsData', 'journalEntries', 'accountsData', 'expensesData'],
        storage: ['transactions-data', 'journal-entries-data', 'accounts-data', 'expenses-data']
      },
      {
        id: 'crm',
        match: '/modules/crm/',
        globals: ['customersData', 'leadsData', 'opportunitiesData', 'contactsData'],
        storage: ['customers-data', 'leads-data', 'opportunities-data', 'contacts-data']
      },
      {
        id: 'services',
        match: '/modules/services/',
        globals: ['servicesData', 'appointmentsData', 'ticketsData'],
        storage: ['services-data', 'appointments-data', 'tickets-data']
      },
      {
        id: 'consulting',
        match: '/modules/consulting/',
        globals: ['tendersData', 'projectsData', 'proposalsData'],
        storage: ['tenders-data', 'projects-data', 'proposals-data']
      },
      {
        id: 'reports',
        match: '/modules/reports/',
        globals: ['reportData', 'reportsData', 'analyticsData'],
        storage: ['reports-data', 'analytics-data']
      }
    ];

    var cfg = null;
    for (var i = 0; i < moduleConfigs.length; i++) {
      if (path.indexOf(moduleConfigs[i].match) >= 0) {
        cfg = moduleConfigs[i];
        break;
      }
    }

    var candidates = [];
    if (cfg) {
      var activeContext = getActiveContextText();
      var contextPriority = contextPriorityForModule(cfg.id, activeContext);
      var globalOrder = mergePriority(cfg.globals, contextPriority.globals);
      var storageOrder = mergePriority(cfg.storage, contextPriority.storage);

      // Respect explicit module priority: first non-empty dataset wins.
      for (var g = 0; g < globalOrder.length; g++) {
        var fromGlobal = tryDataFromGlobal(globalOrder[g]);
        if (fromGlobal && Array.isArray(fromGlobal.rows) && fromGlobal.rows.length) {
          fromGlobal._source = 'global:' + globalOrder[g];
          candidates.push(fromGlobal);
          break;
        }
      }
      if (!candidates.length) {
        for (var s = 0; s < storageOrder.length; s++) {
          var fromStorage = tryDataFromLocalStorage(storageOrder[s]);
          if (fromStorage && Array.isArray(fromStorage.rows) && fromStorage.rows.length) {
            fromStorage._source = 'localStorage:' + storageOrder[s];
            candidates.push(fromStorage);
            break;
          }
        }
      }
    }

    // Generic fallback: only if no module-priority match was found.
    if (!candidates.length) {
      try {
        var genericCandidates = [];
        for (var idx = 0; idx < ZS.length; idx++) {
          var k = ZS.key(idx) || '';
          var low = k.toLowerCase();
          if (low.indexOf('-data') === -1 && low.indexOf('-records') === -1) continue;
          var genericData = tryDataFromLocalStorage(k);
          if (genericData && Array.isArray(genericData.rows) && genericData.rows.length) {
            genericData._source = 'localStorage:' + k;
            genericCandidates.push(genericData);
          }
        }
        genericCandidates.sort(function (a, b) { return (b.rows.length || 0) - (a.rows.length || 0); });
        if (genericCandidates.length) candidates.push(genericCandidates[0]);
      } catch (_) {}
    }

    var best = candidates.length ? candidates[0] : null;

    if (!best) return null;
    if (!best.columns || !best.columns.length) best.columns = rowsToColumns(best.rows);
    if (!best.columns.length) return null;
    return {
      rows: best.rows,
      columns: best.columns,
      title: getPageTitle(),
      fileName: buildExportFileStem()
    };
  }

  function registerAutoProvider() {
    registerProvider('__auto__', function () {
      return inferBestDataSet();
    });
  }

  /* ── do export ───────────────────────────────────────────── */
  function doExport(format) {
    if (typeof window.ErpExportUtils === 'undefined') {
      toast('ErpExportUtils not loaded', 'error');
      return;
    }

    toast(t('exporting'), 'info');

    var title = getPageTitle();

    // 1. Try registered data provider
    var providerData = getRegisteredData();
    if (providerData && providerData.rows && providerData.rows.length) {
      window.ErpExportUtils.exportRecords({
        rows:     providerData.rows,
        columns:  providerData.columns,
        format:   format,
        fileName: providerData.fileName,
        title:    providerData.title || title
      }).then(function () { toast(t('done'), 'success'); })
        .catch(function (err) { toast(t('err') + (err && err.message || err), 'error'); });
      return;
    }

    // 2. Detect table in DOM
    var tableEl = findActiveTable();
    if (!tableEl) {
      toast(t('no_table'), 'error');
      return;
    }

    window.ErpExportUtils.exportTable(tableEl, {
      format: format,
      fileName: buildExportFileStem(),
      title:  title
    }).then(function () { toast(t('done'), 'success'); })
      .catch(function (err) { toast(t('err') + (err && err.message || err), 'error'); });
  }

  /* ── init ────────────────────────────────────────────────── */
  function init() {
    if (!document.body) {
      setTimeout(init, 60);
      return;
    }
    var existing = document.getElementById('_erpExportPanel');
    if (existing) {
      var hasValidUi = !!existing.querySelector('#_erpExportBtn') && !!existing.querySelector('#_erpExportMenu');
      if (hasValidUi) return; // already injected
      if (existing.parentNode) existing.parentNode.removeChild(existing);
    }
    injectStyles();
    var panel = buildPanel();
    document.body.appendChild(panel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {});
  } else {
  }
  registerAutoProvider();
  window.addEventListener('load', function() {});

  /* ── public API ──────────────────────────────────────────── */
  window.ErpExportPanel = {
    /** Register a custom data provider for this page.
     *  providerFn must return { rows:[], columns:[{key,label}], title:'' }
     */
    register: registerProvider,
    /** Programmatically trigger an export */
    export: doExport,
    /** Re-init (e.g., after SPA navigation) */
    init: init
  };
})();
