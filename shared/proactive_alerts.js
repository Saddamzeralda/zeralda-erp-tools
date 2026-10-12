/**
 * ============================================================================
 * PROACTIVE SMART ALERTS & NOTIFICATION HUB (مركز التنبيهات والإشعارات الاستباقية)
 * ============================================================================
 * Automatically scans active ERP databases in real-time:
 *   1. Urgent Tenders & Contracts (< 7 days deadline or overdue)
 *   2. Depleted or Critical Inventory Stock (Quantity <= Min stock)
 *   3. Overdue Invoices & Client Receivables (Unpaid past due date)
 *   4. System & Sync Health
 * ============================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ProactiveAlerts = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var _scanInterval = null;
  var _cachedAlerts = [];
  var _dismissedIds = new Set();
  var _isOpen = false;

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getActiveCompanyId() {
    try {
      var s = localStorage.getItem('zeralda-settings');
      if (s) {
        var parsed = JSON.parse(s);
        if (parsed && parsed.activeCompanyId) return parsed.activeCompanyId;
      }
    } catch (e) {}
    return localStorage.getItem('zeralda-active-company') || 'default-company';
  }

  function getScopedData(baseKey) {
    var cid = getActiveCompanyId();
    var val = null;
    if (window.ZS && typeof window.ZS.getItem === 'function') {
      val = window.ZS.getItem(baseKey + '::' + cid) || window.ZS.getItem(baseKey);
    }
    if (!val) {
      val = localStorage.getItem(baseKey + '::' + cid) || localStorage.getItem(baseKey);
    }
    if (!val) return [];
    try {
      var parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
      if (parsed && Array.isArray(parsed.data)) return parsed.data;
      if (parsed && Array.isArray(parsed.tenders)) return parsed.tenders;
      if (parsed && Array.isArray(parsed.invoices)) return parsed.invoices;
      return [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Run scanner across ERP modules
   */
  function scanAlerts() {
    var alerts = [];
    var now = new Date();
    var todayStr = now.toISOString().slice(0, 10);

    // ── 1. TENDERS SCANNER (المناقصات) ──
    try {
      var tenders = getScopedData('tenders-data');
      if (Array.isArray(tenders)) {
        tenders.forEach(function (t, idx) {
          if (!t) return;
          var status = String(t.status || '').toLowerCase();
          if (['completed', 'cancelled', 'adjudicated', 'فائزة', 'ملغاة', 'مكتملة'].indexOf(status) !== -1) {
            return;
          }

          var deadlineStr = t.deadline || t.submissionDeadline || t.dateLimit || '';
          if (!deadlineStr) return;

          var deadDate = new Date(deadlineStr);
          if (isNaN(deadDate.getTime())) return;

          var diffTime = deadDate.getTime() - now.getTime();
          var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          var tenderTitle = t.title || t.name || ('مناقصة #' + (t.reference || idx + 1));
          var tenderRef = t.reference || ('T-' + (idx + 1));

          if (diffDays < 0) {
            alerts.push({
              id: 'tender-overdue-' + tenderRef,
              type: 'tender',
              severity: 'danger',
              title: 'مناقصة منتهية الأجل تحتاج تسوية',
              message: 'المناقصة "' + tenderTitle + '" تجاوزت تاريخ الإيداع المحدد (' + deadlineStr + ').',
              link: 'consulting_tenders_management.html',
              days: diffDays,
              timestamp: Date.now()
            });
          } else if (diffDays <= 7) {
            alerts.push({
              id: 'tender-urgent-' + tenderRef,
              type: 'tender',
              severity: diffDays <= 2 ? 'danger' : 'warning',
              title: diffDays === 0 ? 'اليوم هو آخر أجل للإيداع!' : ('يتبقى ' + diffDays + ' أيام على إغلاق المناقصة'),
              message: 'المناقصة "' + tenderTitle + '" (مرجع: ' + tenderRef + ') تستوجب إيداع العرض قبل ' + deadlineStr + '.',
              link: 'consulting_tenders_management.html',
              days: diffDays,
              timestamp: Date.now()
            });
          }
        });
      }
    } catch (e) {
      console.warn('[ProactiveAlerts] Error scanning tenders', e);
    }

    // ── 2. INVENTORY STOCK SCANNER (المخزون) ──
    try {
      var products = getScopedData('products-data');
      if (Array.isArray(products)) {
        products.forEach(function (p, idx) {
          if (!p) return;
          var name = p.name || p.designation || ('منتج #' + (idx + 1));
          var qty = Number(p.quantity != null ? p.quantity : (p.stock != null ? p.stock : (p.qty || 0)));
          var minQty = Number(p.minQuantity != null ? p.minQuantity : (p.minStock != null ? p.minStock : (p.seuilAlerte || 5)));
          var ref = p.reference || p.code || ('P-' + idx);

          if (qty <= 0) {
            alerts.push({
              id: 'stock-out-' + ref,
              type: 'stock',
              severity: 'danger',
              title: 'نفاد تام للمخزون (Rupture)',
              message: 'السلعة "' + name + '" نفدت بالكامل (الكمية: 0). يُرجى إصدار طلب شراء فوري.',
              link: 'inventory_management.html',
              timestamp: Date.now()
            });
          } else if (qty <= minQty) {
            alerts.push({
              id: 'stock-low-' + ref,
              type: 'stock',
              severity: 'warning',
              title: 'تنبيه مخزون حرج (Stock Minimum)',
              message: 'السلعة "' + name + '" بلغت ' + qty + ' فقط (الحد الأدنى: ' + minQty + ').',
              link: 'inventory_management.html',
              timestamp: Date.now()
            });
          }
        });
      }
    } catch (e) {
      console.warn('[ProactiveAlerts] Error scanning products', e);
    }

    // ── 3. OVERDUE INVOICES & RECEIVABLES (الفواتير المستحقة) ──
    try {
      var invoices = getScopedData('invoices-data');
      if (Array.isArray(invoices)) {
        invoices.forEach(function (inv, idx) {
          if (!inv) return;
          var status = String(inv.status || inv.statut || '').toLowerCase();
          if (status === 'paid' || status === 'payee' || status === 'مدفوعة') return;

          var dueDate = inv.dueDate || inv.echeance || '';
          if (!dueDate) return;

          if (dueDate < todayStr) {
            var invCode = inv.code || inv.number || inv.numFacture || ('FAC-' + (idx + 1));
            var clientName = (inv.client && inv.client.name) || inv.customer || inv.clientName || 'العميل';
            var amount = Number(inv.totalTTC || inv.total || inv.montantTTC || 0);

            alerts.push({
              id: 'invoice-overdue-' + invCode,
              type: 'finance',
              severity: 'warning',
              title: 'فاتورة غير مسددة تجاوزت الأجل',
              message: 'الفاتورة ' + invCode + ' للعميل ' + clientName + ' بمبلغ ' + amount.toLocaleString('fr-DZ') + ' د.ج تجاوزت تاريخ الاستحقاق (' + dueDate + ').',
              link: 'sales_management.html',
              timestamp: Date.now()
            });
          }
        });
      }
    } catch (e) {
      console.warn('[ProactiveAlerts] Error scanning invoices', e);
    }

    // Filter out dismissed alerts
    alerts = alerts.filter(function (a) { return !_dismissedIds.has(a.id); });

    _cachedAlerts = alerts;
    updateBadgeUI();
    return alerts;
  }

  // --- UI Injection ---
  function injectWidget() {
    if (document.getElementById('zeraldaAlertsHubWrapper')) return;

    var wrapper = document.createElement('div');
    wrapper.id = 'zeraldaAlertsHubWrapper';
    wrapper.innerHTML = `
      <div id="zeraldaAlertsButton" title="مركز التنبيهات والإشعارات الذكي">
        <i class="fas fa-bell"></i>
        <span id="zeraldaAlertsBadge" style="display:none;">0</span>
      </div>

      <div id="zeraldaAlertsDropdown" style="display:none;" dir="rtl">
        <div class="alerts-hub-header">
          <div class="hub-header-title">
            <i class="fas fa-bell text-warning"></i>
            <span>مركز التنبيهات الذكي</span>
          </div>
          <div class="hub-header-actions">
            <button class="btn-hub-action" id="zeraldaAlertsRefreshBtn" title="تحديث التنبيهات"><i class="fas fa-sync-alt"></i></button>
            <button class="btn-hub-action" id="zeraldaAlertsCloseBtn" title="إغلاق"><i class="fas fa-times"></i></button>
          </div>
        </div>

        <div class="alerts-hub-tabs">
          <button class="hub-tab active" data-filter="all">الكل (<span id="countAll">0</span>)</button>
          <button class="hub-tab" data-filter="tender">مناقصات (<span id="countTender">0</span>)</button>
          <button class="hub-tab" data-filter="stock">مخزون (<span id="countStock">0</span>)</button>
          <button class="hub-tab" data-filter="finance">مالية (<span id="countFinance">0</span>)</button>
        </div>

        <div class="alerts-hub-list" id="zeraldaAlertsList">
          <div class="alerts-empty-state">
            <i class="fas fa-check-circle fa-2x text-success"></i>
            <div>جميع المؤشرات ممتازة ولا توجد تنبيهات عاجلة حالياً.</div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(wrapper);

    // Inject Styles
    var style = document.createElement('style');
    style.textContent = `
      #zeraldaAlertsHubWrapper {
        position: fixed;
        bottom: 85px;
        right: 25px;
        z-index: 9998;
        font-family: "Segoe UI", Tahoma, sans-serif;
      }
      #zeraldaAlertsButton {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: #0f172a;
        color: #f8fafc;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(0,0,0,0.25);
        border: 2px solid #334155;
        transition: all 0.25s ease;
        position: relative;
      }
      #zeraldaAlertsButton:hover {
        transform: scale(1.08);
        background: #1e293b;
        border-color: #3b82f6;
      }
      #zeraldaAlertsBadge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: #ef4444;
        color: white;
        font-size: 11px;
        font-weight: 800;
        min-width: 20px;
        height: 20px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 5px;
        border: 2px solid #fff;
        animation: pulseAlert 2s infinite;
      }
      @keyframes pulseAlert {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.15); }
      }
      #zeraldaAlertsDropdown {
        position: absolute;
        bottom: 60px;
        right: 0;
        width: 370px;
        max-height: 520px;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 14px;
        box-shadow: 0 10px 35px rgba(15,23,42,0.18);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .alerts-hub-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: #0f172a;
        color: #fff;
      }
      .hub-header-title {
        font-size: 14px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .hub-header-actions {
        display: flex;
        gap: 6px;
      }
      .btn-hub-action {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 13px;
        padding: 4px;
        border-radius: 4px;
      }
      .btn-hub-action:hover { color: #fff; background: rgba(255,255,255,0.1); }
      .alerts-hub-tabs {
        display: flex;
        background: #f8fafc;
        border-bottom: 1px solid #e2e8f0;
        padding: 4px 8px;
        gap: 4px;
      }
      .hub-tab {
        flex: 1;
        background: none;
        border: none;
        padding: 6px 4px;
        font-size: 11.5px;
        font-weight: 600;
        color: #64748b;
        border-radius: 6px;
        cursor: pointer;
        text-align: center;
      }
      .hub-tab:hover { background: #e2e8f0; color: #1e293b; }
      .hub-tab.active { background: #2563eb; color: #fff; }
      .alerts-hub-list {
        padding: 12px;
        overflow-y: auto;
        max-height: 400px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .alert-card-item {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-right: 4px solid #3b82f6;
        border-radius: 8px;
        padding: 10px 12px;
        position: relative;
        transition: transform 0.2s;
      }
      .alert-card-item:hover { transform: translateX(-3px); }
      .alert-card-item.sev-danger { border-right-color: #ef4444; background: #fef2f2; }
      .alert-card-item.sev-warning { border-right-color: #f59e0b; background: #fffbeb; }
      .alert-card-title {
        font-size: 12.5px;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 3px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .alert-card-msg {
        font-size: 11.5px;
        color: #475569;
        line-height: 1.4;
      }
      .alert-card-actions {
        margin-top: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .alert-link-btn {
        font-size: 11px;
        font-weight: 700;
        color: #2563eb;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .alert-dismiss-btn {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 11px;
      }
      .alert-dismiss-btn:hover { color: #ef4444; }
      .alerts-empty-state {
        text-align: center;
        padding: 35px 20px;
        color: #64748b;
        font-size: 12.5px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }
    `;
    document.head.appendChild(style);

    // Event Listeners
    var btn = document.getElementById('zeraldaAlertsButton');
    var dropdown = document.getElementById('zeraldaAlertsDropdown');
    var closeBtn = document.getElementById('zeraldaAlertsCloseBtn');
    var refreshBtn = document.getElementById('zeraldaAlertsRefreshBtn');

    if (btn) {
      btn.addEventListener('click', function () {
        _isOpen = !_isOpen;
        dropdown.style.display = _isOpen ? 'flex' : 'none';
        if (_isOpen) {
          renderAlertsList('all');
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        _isOpen = false;
        dropdown.style.display = 'none';
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        scanAlerts();
        renderAlertsList('all');
      });
    }

    // Tabs filter
    var tabs = wrapper.querySelectorAll('.hub-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        renderAlertsList(tab.getAttribute('data-filter') || 'all');
      });
    });
  }

  function updateBadgeUI() {
    var badge = document.getElementById('zeraldaAlertsBadge');
    if (!badge) return;
    var count = _cachedAlerts.length;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }

    // Update tab counts
    var countAll = document.getElementById('countAll');
    var countTender = document.getElementById('countTender');
    var countStock = document.getElementById('countStock');
    var countFinance = document.getElementById('countFinance');

    if (countAll) countAll.textContent = count;
    if (countTender) countTender.textContent = _cachedAlerts.filter(function (a) { return a.type === 'tender'; }).length;
    if (countStock) countStock.textContent = _cachedAlerts.filter(function (a) { return a.type === 'stock'; }).length;
    if (countFinance) countFinance.textContent = _cachedAlerts.filter(function (a) { return a.type === 'finance'; }).length;
  }

  function renderAlertsList(filterType) {
    var listEl = document.getElementById('zeraldaAlertsList');
    if (!listEl) return;

    var filtered = _cachedAlerts;
    if (filterType && filterType !== 'all') {
      filtered = _cachedAlerts.filter(function (a) { return a.type === filterType; });
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="alerts-empty-state">
          <i class="fas fa-check-circle fa-2x" style="color:#16a34a;"></i>
          <div>لا توجد تنبيهات ضمن هذا التصنيف حالياً.</div>
        </div>
      `;
      return;
    }

    var html = '';
    filtered.forEach(function (item) {
      var sevClass = item.severity === 'danger' ? 'sev-danger' : (item.severity === 'warning' ? 'sev-warning' : '');
      var icon = item.type === 'tender' ? 'fa-file-signature text-primary' : (item.type === 'stock' ? 'fa-boxes text-danger' : 'fa-money-bill-wave text-warning');

      html += `
        <div class="alert-card-item ${sevClass}" id="card-${esc(item.id)}">
          <div class="alert-card-title">
            <span><i class="fas ${icon}"></i> ${esc(item.title)}</span>
          </div>
          <div class="alert-card-msg">${esc(item.message)}</div>
          <div class="alert-card-actions">
            ${item.link ? `<a href="${esc(item.link)}" class="alert-link-btn"><i class="fas fa-external-link-alt"></i> فتح ومعالجة</a>` : '<span></span>'}
            <button class="alert-dismiss-btn" onclick="window.ProactiveAlerts.dismissAlert('${esc(item.id)}')"><i class="fas fa-eye-slash"></i> إخفاء</button>
          </div>
        </div>
      `;
    });

    listEl.innerHTML = html;
  }

  function dismissAlert(id) {
    _dismissedIds.add(id);
    _cachedAlerts = _cachedAlerts.filter(function (a) { return a.id !== id; });
    updateBadgeUI();
    var card = document.getElementById('card-' + id);
    if (card) card.remove();
    if (_cachedAlerts.length === 0) {
      renderAlertsList('all');
    }
  }

  // Auto-init on page load
  function init() {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        injectWidget();
        setTimeout(scanAlerts, 1000);
      });
    } else {
      injectWidget();
      setTimeout(scanAlerts, 1000);
    }

    // Periodic scanner every 60 seconds
    if (!_scanInterval) {
      _scanInterval = setInterval(scanAlerts, 60000);
    }
  }

  init();

  return {
    scanAlerts: scanAlerts,
    dismissAlert: dismissAlert,
    getAlerts: function () { return _cachedAlerts; }
  };
}));
