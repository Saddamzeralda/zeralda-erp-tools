/**
 * Zeralda ERP — Universal Command Palette (Ctrl+K / Cmd+K)
 * Fast Spotlight-style navigation, search, and instant actions across all ERP modules.
 */
(function () {
  'use strict';

  var isOpen = false;
  var selectedIndex = 0;
  var filteredItems = [];

  // Default system commands and pages
  var NAV_COMMANDS = [
    { id: 'dash', title: 'لوحة التحكم / Tableau de bord', icon: 'fas fa-th-large', category: 'nav', url: '/zeralda_erp_dashboard.html' },
    { id: 'sales', title: 'إدارة المبيعات والفواتير / Ventes & Facturation', icon: 'fas fa-shopping-cart', category: 'nav', url: '/sales.html' },
    { id: 'purchases', title: 'إدارة المشتريات / Achats & Fournisseurs', icon: 'fas fa-shopping-bag', category: 'nav', url: '/purchases.html' },
    { id: 'inventory', title: 'المخزون والمنتجات / Inventaire & Articles', icon: 'fas fa-boxes', category: 'nav', url: '/inventory.html' },
    { id: 'finance', title: 'المالية والحسابات / Finance & Comptabilité', icon: 'fas fa-dollar-sign', category: 'nav', url: '/finance.html' },
    { id: 'hr', title: 'الموارد البشرية / Ressources Humaines', icon: 'fas fa-users', category: 'nav', url: '/hr.html' },
    { id: 'crm', title: 'إدارة الزبائن والعملاء / Relations Clients (CRM)', icon: 'fas fa-user-friends', category: 'nav', url: '/crm.html' },
    { id: 'reports', title: 'التقارير والإحصائيات / Rapports & Analyses', icon: 'fas fa-chart-line', category: 'nav', url: '/reports.html' },
    { id: 'settings', title: 'إعدادات النظام / Paramètres Système', icon: 'fas fa-cogs', category: 'nav', url: '/settings.html' },
    { id: 'gdrive', title: 'الحفظ والنسخ الاحتياطي على Google Drive', icon: 'fab fa-google-drive', category: 'actions', action: function () {
      if (window.location.pathname.includes('settings.html')) {
        if (typeof window.showSection === 'function') window.showSection('backups');
      } else {
        window.location.href = '/settings.html#backups';
      }
    }},
    { id: 'new_inv', title: 'إنشاء فاتورة بيع جديدة / Nouvelle Facture', icon: 'fas fa-plus-circle', category: 'actions', action: function () {
      window.location.href = '/sales.html?action=new';
    }},
    { id: 'theme_toggle', title: 'تبديل المظهر (داكن / فاتح) / Basculer Thème', icon: 'fas fa-moon', category: 'actions', action: function () {
      if (window.ThemeManager && typeof window.ThemeManager.toggleTheme === 'function') {
        window.ThemeManager.toggleTheme();
      } else {
        var isDark = document.body.classList.toggle('dark-theme');
        try { localStorage.setItem('zeralda-theme', isDark ? 'dark' : 'light'); } catch (_) {}
      }
    }},
    { id: 'switch_comp', title: 'تبديل الشركة النشطة / Changer Entreprise', icon: 'fas fa-building', category: 'actions', action: function () {
      var sel = document.getElementById('companySwitcher');
      if (sel) { sel.focus(); sel.click(); }
    }}
  ];

  function getLocalDataItems() {
    var items = [];
    try {
      var rawSettings = (window.ZS && typeof window.ZS.getItem === 'function') ? window.ZS.getItem('zeralda-settings') : localStorage.getItem('zeralda-settings');
      var settings = rawSettings ? JSON.parse(rawSettings) : {};
      var activeCompanyId = settings.activeCompanyId || localStorage.getItem('zeralda_last_active_company') || 'default-company';

      // 1. Invoices
      var invKey = 'invoices-data::' + activeCompanyId;
      var rawInv = (window.ZS && typeof window.ZS.getItem === 'function') ? window.ZS.getItem(invKey) : localStorage.getItem(invKey);
      if (!rawInv) rawInv = localStorage.getItem('invoices-data');
      if (rawInv) {
        var invs = JSON.parse(rawInv);
        if (Array.isArray(invs)) {
          invs.slice(0, 15).forEach(function (inv) {
            var custName = (inv.customer && inv.customer.name) || inv.customerName || 'Client';
            var num = inv.invoiceNumber || inv.id || 'N/A';
            var total = Number(inv.total || inv.totalTTC || 0).toLocaleString('fr-DZ') + ' د.ج';
            items.push({
              id: 'inv_' + inv.id,
              title: 'فاتورة #' + num + ' — ' + custName + ' (' + total + ')',
              sub: 'المبيعات · تاريخ: ' + (inv.date || '-'),
              icon: 'fas fa-file-invoice-dollar',
              category: 'data',
              action: function () { window.location.href = '/sales.html?view=' + encodeURIComponent(inv.id); }
            });
          });
        }
      }

      // 2. Customers
      var custKey = 'customers-data::' + activeCompanyId;
      var rawCust = (window.ZS && typeof window.ZS.getItem === 'function') ? window.ZS.getItem(custKey) : localStorage.getItem(custKey);
      if (!rawCust) rawCust = localStorage.getItem('customers-data');
      if (rawCust) {
        var custs = JSON.parse(rawCust);
        if (Array.isArray(custs)) {
          custs.slice(0, 10).forEach(function (c) {
            items.push({
              id: 'cust_' + c.id,
              title: 'زبون: ' + (c.name || 'عميل'),
              sub: (c.phone ? 'هاتف: ' + c.phone : '') + (c.city ? ' · ' + c.city : ''),
              icon: 'fas fa-user-tag',
              category: 'data',
              action: function () { window.location.href = '/crm.html?customer=' + encodeURIComponent(c.id); }
            });
          });
        }
      }
    } catch (_) {}
    return items;
  }

  function createPaletteElements() {
    if (document.getElementById('zeraldaCommandPaletteOverlay')) return;

    var style = document.createElement('style');
    style.id = 'zeraldaCommandPaletteStyle';
    style.textContent = [
      '#zeraldaCommandPaletteOverlay {',
      '  position: fixed; inset: 0; z-index: 999999; background: rgba(15, 23, 42, 0.65);',
      '  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); display: none;',
      '  align-items: flex-start; justify-content: center; padding-top: 12vh;',
      '}',
      '#zeraldaCommandPaletteModal {',
      '  width: 90%; max-width: 620px; background: #ffffff; border-radius: 14px;',
      '  box-shadow: 0 20px 45px -10px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(226, 232, 240, 0.8);',
      '  overflow: hidden; display: flex; flex-direction: column; font-family: inherit; direction: rtl;',
      '  animation: zcpFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);',
      '}',
      '@keyframes zcpFadeIn { from { opacity: 0; transform: scale(0.96) translateY(-8px); } to { opacity: 1; transform: scale(1) translateY(0); } }',
      '.zcp-search-row { display: flex; align-items: center; padding: 14px 18px; border-bottom: 1px solid #e2e8f0; gap: 12px; }',
      '.zcp-search-row i { color: #0284c7; font-size: 18px; }',
      '.zcp-search-input {',
      '  flex: 1; border: none; outline: none; font-size: 16px; background: transparent;',
      '  color: #0f172a; font-family: inherit;',
      '}',
      '.zcp-esc-badge { font-size: 11px; padding: 3px 8px; border-radius: 5px; background: #f1f5f9; color: #64748b; font-weight: 600; border: 1px solid #cbd5e1; }',
      '.zcp-results-list { max-height: 380px; overflow-y: auto; padding: 8px; list-style: none; margin: 0; }',
      '.zcp-item {',
      '  display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 8px;',
      '  cursor: pointer; transition: background 0.12s; color: #1e293b;',
      '}',
      '.zcp-item.selected, .zcp-item:hover { background: #f0fdf4; color: #0f172a; }',
      '.zcp-item i { width: 22px; text-align: center; font-size: 15px; color: #0284c7; }',
      '.zcp-item-info { flex: 1; min-width: 0; }',
      '.zcp-item-title { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.zcp-item-sub { font-size: 12px; color: #64748b; margin-top: 2px; }',
      '.zcp-category-header { font-size: 11px; font-weight: 700; color: #94a3b8; padding: 6px 12px; text-transform: uppercase; letter-spacing: 0.5px; }',
      '.zcp-footer { padding: 10px 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #64748b; }',
      '.dark-theme #zeraldaCommandPaletteModal { background: #1e293b; color: #f8fafc; box-shadow: 0 20px 45px -10px rgba(0, 0, 0, 0.7); border-color: #334155; }',
      '.dark-theme .zcp-search-row { border-color: #334155; }',
      '.dark-theme .zcp-search-input { color: #f8fafc; }',
      '.dark-theme .zcp-item { color: #cbd5e1; }',
      '.dark-theme .zcp-item.selected, .dark-theme .zcp-item:hover { background: #334155; color: #38bdf8; }',
      '.dark-theme .zcp-footer { background: #0f172a; border-color: #334155; color: #94a3b8; }'
    ].join('\n');
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.id = 'zeraldaCommandPaletteOverlay';
    overlay.innerHTML = [
      '<div id="zeraldaCommandPaletteModal" role="dialog" aria-modal="true">',
      '  <div class="zcp-search-row">',
      '    <i class="fas fa-search"></i>',
      '    <input id="zcpSearchInput" class="zcp-search-input" type="text" placeholder="ابحث عن صفحة، فاتورة، زبون، أو إجراء سريع..." autocomplete="off" />',
      '    <span class="zcp-esc-badge">ESC</span>',
      '  </div>',
      '  <div id="zcpResultsContainer" class="zcp-results-list"></div>',
      '  <div class="zcp-footer">',
      '    <span><i class="fas fa-arrows-alt-v" style="margin-left:4px;"></i> للتنقل &nbsp;|&nbsp; <strong>Enter</strong> للتنفيذ</span>',
      '    <span><strong>Zeralda ERP</strong> Spotlight</span>',
      '  </div>',
      '</div>'
    ].join('\n');

    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closePalette();
    });

    var input = document.getElementById('zcpSearchInput');
    input.addEventListener('input', function () {
      updateFilter(input.value);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (filteredItems.length) {
          selectedIndex = (selectedIndex + 1) % filteredItems.length;
          renderList();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (filteredItems.length) {
          selectedIndex = (selectedIndex - 1 + filteredItems.length) % filteredItems.length;
          renderList();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          executeItem(filteredItems[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closePalette();
      }
    });
  }

  function updateFilter(query) {
    var q = (query || '').trim().toLowerCase();
    var all = NAV_COMMANDS.concat(getLocalDataItems());
    if (!q) {
      filteredItems = all;
    } else {
      filteredItems = all.filter(function (it) {
        var t = (it.title || '').toLowerCase();
        var s = (it.sub || '').toLowerCase();
        return t.indexOf(q) !== -1 || s.indexOf(q) !== -1;
      });
    }
    selectedIndex = 0;
    renderList();
  }

  function renderList() {
    var container = document.getElementById('zcpResultsContainer');
    if (!container) return;

    if (!filteredItems.length) {
      container.innerHTML = '<div style="padding:28px; text-align:center; color:#94a3b8; font-size:14px;"><i class="fas fa-search" style="font-size:24px; margin-bottom:8px; display:block; opacity:0.5;"></i>لا توجد نتائج مطابقة لبحثك</div>';
      return;
    }

    var html = '';
    var currentCat = '';
    filteredItems.forEach(function (item, idx) {
      var catName = item.category === 'nav' ? 'الصفحات والأقسام' : (item.category === 'actions' ? 'الإجراءات السريعة' : 'البيانات والسجلات');
      if (catName !== currentCat) {
        currentCat = catName;
        html += '<div class="zcp-category-header">' + currentCat + '</div>';
      }

      var isSel = idx === selectedIndex;
      html += '<div class="zcp-item' + (isSel ? ' selected' : '') + '" data-idx="' + idx + '">';
      html += '  <i class="' + (item.icon || 'fas fa-chevron-left') + '"></i>';
      html += '  <div class="zcp-item-info">';
      html += '    <div class="zcp-item-title">' + item.title + '</div>';
      if (item.sub) html += '    <div class="zcp-item-sub">' + item.sub + '</div>';
      html += '  </div>';
      html += '</div>';
    });

    container.innerHTML = html;

    // Attach click events
    var itemEls = container.querySelectorAll('.zcp-item');
    itemEls.forEach(function (el) {
      el.addEventListener('click', function () {
        var idx = parseInt(el.getAttribute('data-idx'), 10);
        if (filteredItems[idx]) executeItem(filteredItems[idx]);
      });
    });

    // Auto-scroll selected element into view
    var selectedEl = container.querySelector('.zcp-item.selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function executeItem(item) {
    closePalette();
    if (typeof item.action === 'function') {
      item.action();
    } else if (item.url) {
      window.location.href = item.url;
    }
  }

  function openPalette() {
    createPaletteElements();
    var overlay = document.getElementById('zeraldaCommandPaletteOverlay');
    var input = document.getElementById('zcpSearchInput');
    if (!overlay || !input) return;

    overlay.style.display = 'flex';
    isOpen = true;
    input.value = '';
    updateFilter('');
    setTimeout(function () { input.focus(); }, 50);
  }

  function closePalette() {
    var overlay = document.getElementById('zeraldaCommandPaletteOverlay');
    if (overlay) overlay.style.display = 'none';
    isOpen = false;
  }

  window.openCommandPalette = openPalette;
  window.closeCommandPalette = closePalette;

  // Global keydown listener: Ctrl+K or Cmd+K
  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (isOpen) closePalette();
      else openPalette();
    }
  });

  // Ensure no search button is injected into header (purges any existing instances)
  function purgeHeaderSearchBtn() {
    ['zcpHeaderTriggerBtn', 'headerQuickSearchBtn'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', purgeHeaderSearchBtn);
  } else {
    purgeHeaderSearchBtn();
  }
  document.addEventListener('sharedLayoutLoaded', purgeHeaderSearchBtn);
  setInterval(purgeHeaderSearchBtn, 500);
})();
