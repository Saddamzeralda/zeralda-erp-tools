/**
 * ============================================================================
 * PROACTIVE SMART ALERTS & NOTIFICATION HUB (مركز التنبيهات والإشعارات الذكي)
 * ============================================================================
 * Automatically scans active ERP databases in real-time:
 *   1. Urgent Tenders & Contracts (< 7 days deadline or overdue)
 *   2. Depleted or Critical Inventory Stock (Quantity <= Min stock)
 *   3. Overdue Invoices & Client Receivables (Unpaid past due date)
 *   4. Full Tri-lingual Support: Arabic (العربية), French (Français), English
 *   5. Seamless real-time reaction to language changes via UnifiedI18N
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
  var _activeFilter = 'all';

  // ── Tri-lingual Dictionary ──
  var DICT = {
    hubButtonTitle: {
      ar: 'مركز التنبيهات والإشعارات الذكي',
      fr: 'Centre d\'alertes et de notifications intelligent',
      en: 'Smart Alerts & Notifications Hub'
    },
    hubHeaderTitle: {
      ar: 'مركز التنبيهات الذكي',
      fr: 'Centre d\'alertes intelligent',
      en: 'Smart Alerts Hub'
    },
    refreshBtnTitle: {
      ar: 'تحديث التنبيهات',
      fr: 'Actualiser les alertes',
      en: 'Refresh alerts'
    },
    closeBtnTitle: {
      ar: 'إغلاق',
      fr: 'Fermer',
      en: 'Close'
    },
    tabAll: {
      ar: 'الكل',
      fr: 'Tous',
      en: 'All'
    },
    tabTenders: {
      ar: 'مناقصات',
      fr: 'Appels d\'offres',
      en: 'Tenders'
    },
    tabStock: {
      ar: 'مخزون',
      fr: 'Stock',
      en: 'Stock'
    },
    tabFinance: {
      ar: 'مالية',
      fr: 'Finances',
      en: 'Finance'
    },
    emptyStateAll: {
      ar: 'جميع المؤشرات ممتازة ولا توجد تنبيهات عاجلة حالياً.',
      fr: 'Tous les indicateurs sont au vert. Aucune alerte urgente pour le moment.',
      en: 'All indicators are clear. No urgent alerts at this time.'
    },
    emptyStateCategory: {
      ar: 'لا توجد تنبيهات ضمن هذا التصنيف حالياً.',
      fr: 'Aucune alerte dans cette catégorie actuellement.',
      en: 'No alerts in this category currently.'
    },
    openAndProcess: {
      ar: 'فتح ومعالجة',
      fr: 'Ouvrir et traiter',
      en: 'Open & Process'
    },
    dismissAlert: {
      ar: 'إخفاء',
      fr: 'Masquer',
      en: 'Dismiss'
    },
    tenderOverdueTitle: {
      ar: 'مناقصة متأخرة تجاوزت الأجل المحدد',
      fr: 'Appel d\'offres expiré à régulariser',
      en: 'Overdue Tender Requires Action'
    },
    tenderOverdueMsg: {
      ar: 'المناقصة "{title}" تجاوزت الموعد النهائي المحدد للإيداع ({deadline}).',
      fr: 'L\'appel d\'offres "{title}" a dépassé la date limite de soumission ({deadline}).',
      en: 'Tender "{title}" has passed its submission deadline ({deadline}).'
    },
    tenderUrgentToday: {
      ar: 'اليوم هو آخر موعد لإيداع العرض!',
      fr: 'Aujourd\'hui est le dernier jour de dépôt !',
      en: 'Today is the final submission deadline!'
    },
    tenderUrgent1Day: {
      ar: 'يتبقى يوم واحد على إغلاق المناقصة',
      fr: 'Il reste 1 jour avant la clôture de l\'appel d\'offres',
      en: '1 day remaining before tender deadline'
    },
    tenderUrgent2Days: {
      ar: 'يتبقى يومان على إغلاق المناقصة',
      fr: 'Il reste 2 jours avant la clôture de l\'appel d\'offres',
      en: '2 days remaining before tender deadline'
    },
    tenderUrgentFewDays: {
      ar: 'يتبقى {days} أيام على إغلاق المناقصة',
      fr: 'Il reste {days} jours avant la clôture de l\'appel d\'offres',
      en: '{days} days remaining before tender deadline'
    },
    tenderUrgentManyDays: {
      ar: 'يتبقى {days} يوماً على إغلاق المناقصة',
      fr: 'Il reste {days} jours avant la clôture de l\'appel d\'offres',
      en: '{days} days remaining before tender deadline'
    },
    tenderUrgentMsg: {
      ar: 'المناقصة "{title}" (مرجع: {ref}) تستوجب إيداع العرض قبل {deadline}.',
      fr: 'L\'appel d\'offres "{title}" (réf : {ref}) exige le dépôt de l\'offre avant le {deadline}.',
      en: 'Tender "{title}" (Ref: {ref}) requires proposal submission before {deadline}.'
    },
    stockOutTitle: {
      ar: 'نفاد تام للمخزون',
      fr: 'Rupture de stock totale',
      en: 'Out of Stock Alert'
    },
    stockOutMsg: {
      ar: 'المنتج "{name}" نفد بالكامل من المخزون (الكمية: 0). يُرجى إصدار طلب شراء فوري.',
      fr: 'L\'article "{name}" est en rupture totale (Quantité : 0). Veuillez passer une commande urgente.',
      en: 'Product "{name}" is completely out of stock (Quantity: 0). Please issue an urgent purchase order.'
    },
    stockLowTitle: {
      ar: 'تنبيه: بلوغ الحد الأدنى للمخزون',
      fr: 'Alerte : Seuil de stock minimum atteint',
      en: 'Critical Low Stock Alert'
    },
    stockLowMsg: {
      ar: 'المنتج "{name}" وصل إلى {qty} وحدات فقط (الحد الأدنى: {minQty}).',
      fr: 'L\'article "{name}" a atteint {qty} unités seulement (Seuil minimum : {minQty}).',
      en: 'Product "{name}" reached {qty} units only (Minimum: {minQty}).'
    },
    invoiceOverdueTitle: {
      ar: 'فاتورة غير مسددة تجاوزت موعد الاستحقاق',
      fr: 'Facture impayée échue',
      en: 'Overdue Unpaid Invoice'
    },
    invoiceOverdueMsg: {
      ar: 'الفاتورة {code} للعميل {client} بمبلغ {amount} {curr} تجاوزت تاريخ الاستحقاق ({date}).',
      fr: 'La facture {code} du client {client} d\'un montant de {amount} {curr} a dépassé la date d\'échéance ({date}).',
      en: 'Invoice {code} for client {client} ({amount} {curr}) has passed its due date ({date}).'
    },
    defaultClient: {
      ar: 'العميل',
      fr: 'Client',
      en: 'Customer'
    },
    defaultTender: {
      ar: 'مناقصة',
      fr: 'Appel d\'offres',
      en: 'Tender'
    },
    defaultProduct: {
      ar: 'منتج',
      fr: 'Produit',
      en: 'Product'
    }
  };

  function getCurrentLang() {
    try {
      if (window.UnifiedI18N && typeof window.UnifiedI18N.getCurrentLang === 'function') {
        var ul = window.UnifiedI18N.getCurrentLang();
        if (ul === 'ar' || ul === 'fr' || ul === 'en') return ul;
      }
      var s = localStorage.getItem('zeralda-settings');
      if (s) {
        var parsed = JSON.parse(s);
        if (parsed && parsed.preferredLanguage) {
          var pl = String(parsed.preferredLanguage).toLowerCase().substring(0, 2);
          if (pl === 'ar' || pl === 'fr' || pl === 'en') return pl;
        }
      }
      var l = String(localStorage.getItem('preferred-language') || '').toLowerCase().substring(0, 2);
      if (l === 'ar' || l === 'fr' || l === 'en') return l;
    } catch (_) {}
    return (document.documentElement.lang || 'ar').substring(0, 2) === 'ar' ? 'ar' : 'en';
  }

  function t(key, vars) {
    var lang = getCurrentLang();
    var entry = DICT[key];
    var str = (entry && (entry[lang] || entry.en || entry.ar)) || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
      });
    }
    return str;
  }

  function getCurrencySymbol() {
    var lang = getCurrentLang();
    if (lang === 'ar') return 'د.ج';
    if (lang === 'fr') return 'DA';
    return 'DZD';
  }

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

  function getTenderDaysTitle(diffDays) {
    if (diffDays === 0) return t('tenderUrgentToday');
    if (diffDays === 1) return t('tenderUrgent1Day');
    if (diffDays === 2) return t('tenderUrgent2Days');
    if (diffDays >= 3 && diffDays <= 10) return t('tenderUrgentFewDays', { days: diffDays });
    return t('tenderUrgentManyDays', { days: diffDays });
  }

  /**
   * Run scanner across ERP modules
   */
  function scanAlerts() {
    var alerts = [];
    var now = new Date();
    var todayStr = now.toISOString().slice(0, 10);
    var currSymbol = getCurrencySymbol();

    // ── 1. TENDERS SCANNER (المناقصات) ──
    try {
      var tenders = getScopedData('tenders-data');
      if (Array.isArray(tenders)) {
        tenders.forEach(function (tItem, idx) {
          if (!tItem) return;
          var status = String(tItem.status || '').toLowerCase();
          if (['completed', 'cancelled', 'adjudicated', 'فائزة', 'ملغاة', 'مكتملة'].indexOf(status) !== -1) {
            return;
          }

          var deadlineStr = tItem.deadline || tItem.submissionDeadline || tItem.dateLimit || '';
          if (!deadlineStr) return;

          var deadDate = new Date(deadlineStr);
          if (isNaN(deadDate.getTime())) return;

          var diffTime = deadDate.getTime() - now.getTime();
          var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          var tenderTitle = tItem.title || tItem.name || (t('defaultTender') + ' #' + (tItem.reference || idx + 1));
          var tenderRef = tItem.reference || ('T-' + (idx + 1));

          if (diffDays < 0) {
            alerts.push({
              id: 'tender-overdue-' + tenderRef,
              type: 'tender',
              severity: 'danger',
              title: t('tenderOverdueTitle'),
              message: t('tenderOverdueMsg', { title: tenderTitle, deadline: deadlineStr }),
              link: 'consulting_tenders_management.html',
              days: diffDays,
              timestamp: Date.now()
            });
          } else if (diffDays <= 7) {
            alerts.push({
              id: 'tender-urgent-' + tenderRef,
              type: 'tender',
              severity: diffDays <= 2 ? 'danger' : 'warning',
              title: getTenderDaysTitle(diffDays),
              message: t('tenderUrgentMsg', { title: tenderTitle, ref: tenderRef, deadline: deadlineStr }),
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
          var name = p.name || p.designation || (t('defaultProduct') + ' #' + (idx + 1));
          var qty = Number(p.quantity != null ? p.quantity : (p.stock != null ? p.stock : (p.qty || 0)));
          var minQty = Number(p.minQuantity != null ? p.minQuantity : (p.minStock != null ? p.minStock : (p.seuilAlerte || 5)));
          var ref = p.reference || p.code || ('P-' + idx);

          if (qty <= 0) {
            alerts.push({
              id: 'stock-out-' + ref,
              type: 'stock',
              severity: 'danger',
              title: t('stockOutTitle'),
              message: t('stockOutMsg', { name: name }),
              link: 'inventory_management.html',
              timestamp: Date.now()
            });
          } else if (qty <= minQty) {
            alerts.push({
              id: 'stock-low-' + ref,
              type: 'stock',
              severity: 'warning',
              title: t('stockLowTitle'),
              message: t('stockLowMsg', { name: name, qty: qty, minQty: minQty }),
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
            var clientName = (inv.client && inv.client.name) || inv.customer || inv.clientName || t('defaultClient');
            var amount = Number(inv.totalTTC || inv.total || inv.montantTTC || 0);

            alerts.push({
              id: 'invoice-overdue-' + invCode,
              type: 'finance',
              severity: 'warning',
              title: t('invoiceOverdueTitle'),
              message: t('invoiceOverdueMsg', {
                code: invCode,
                client: clientName,
                amount: amount.toLocaleString('fr-DZ'),
                curr: currSymbol,
                date: dueDate
              }),
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

    var lang = getCurrentLang();
    var isAr = lang === 'ar';

    var wrapper = document.createElement('div');
    wrapper.id = 'zeraldaAlertsHubWrapper';
    wrapper.innerHTML = `
      <div id="zeraldaAlertsButton"
           data-en-title="Smart Alerts & Notifications Hub"
           data-ar-title="مركز التنبيهات والإشعارات الذكي"
           data-fr-title="Centre d'alertes et de notifications intelligent"
           title="${esc(t('hubButtonTitle'))}">
        <i class="fas fa-bell"></i>
        <span id="zeraldaAlertsBadge" style="display:none;">0</span>
      </div>

      <div id="zeraldaAlertsDropdown" style="display:none;" dir="${isAr ? 'rtl' : 'ltr'}">
        <div class="alerts-hub-header">
          <div class="hub-header-title">
            <i class="fas fa-bell text-warning"></i>
            <span id="zeraldaAlertsHeaderTitle"
                  data-en="Smart Alerts Hub"
                  data-ar="مركز التنبيهات الذكي"
                  data-fr="Centre d'alertes intelligent">${esc(t('hubHeaderTitle'))}</span>
          </div>
          <div class="hub-header-actions">
            <button class="btn-hub-action" id="zeraldaAlertsRefreshBtn"
                    data-en-title="Refresh alerts"
                    data-ar-title="تحديث التنبيهات"
                    data-fr-title="Actualiser les alertes"
                    title="${esc(t('refreshBtnTitle'))}"><i class="fas fa-sync-alt"></i></button>
            <button class="btn-hub-action" id="zeraldaAlertsCloseBtn"
                    data-en-title="Close"
                    data-ar-title="إغلاق"
                    data-fr-title="Fermer"
                    title="${esc(t('closeBtnTitle'))}"><i class="fas fa-times"></i></button>
          </div>
        </div>

        <div class="alerts-hub-tabs">
          <button class="hub-tab active" data-filter="all"><span id="hubTabLabelAll" data-en="All" data-ar="الكل" data-fr="Tous">${esc(t('tabAll'))}</span> (<span id="countAll">0</span>)</button>
          <button class="hub-tab" data-filter="tender"><span id="hubTabLabelTender" data-en="Tenders" data-ar="مناقصات" data-fr="Appels d'offres">${esc(t('tabTenders'))}</span> (<span id="countTender">0</span>)</button>
          <button class="hub-tab" data-filter="stock"><span id="hubTabLabelStock" data-en="Stock" data-ar="مخزون" data-fr="Stock">${esc(t('tabStock'))}</span> (<span id="countStock">0</span>)</button>
          <button class="hub-tab" data-filter="finance"><span id="hubTabLabelFinance" data-en="Finance" data-ar="مالية" data-fr="Finances">${esc(t('tabFinance'))}</span> (<span id="countFinance">0</span>)</button>
        </div>

        <div class="alerts-hub-list" id="zeraldaAlertsList">
          <div class="alerts-empty-state">
            <i class="fas fa-check-circle fa-2x text-success"></i>
            <div id="zeraldaAlertsEmptyText"
                 data-en="All indicators are clear. No urgent alerts at this time."
                 data-ar="جميع المؤشرات ممتازة ولا توجد تنبيهات عاجلة حالياً."
                 data-fr="Tous les indicateurs sont au vert. Aucune alerte urgente pour le moment.">${esc(t('emptyStateAll'))}</div>
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
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Cairo", "Tahoma", sans-serif;
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
        width: 380px;
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
        transition: all 0.15s ease;
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
        border-inline-start: 4px solid #3b82f6;
        border-radius: 8px;
        padding: 10px 12px;
        position: relative;
        transition: transform 0.2s;
      }
      [dir="rtl"] .alert-card-item:hover { transform: translateX(-3px); }
      [dir="ltr"] .alert-card-item:hover { transform: translateX(3px); }
      .alert-card-item.sev-danger { border-inline-start-color: #ef4444; background: #fef2f2; }
      .alert-card-item.sev-warning { border-inline-start-color: #f59e0b; background: #fffbeb; }
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
        line-height: 1.45;
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
      .alert-link-btn:hover { text-decoration: underline; }
      .alert-dismiss-btn {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 11px;
        display: inline-flex;
        align-items: center;
        gap: 3px;
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
          renderAlertsList(_activeFilter);
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
        renderAlertsList(_activeFilter);
      });
    }

    // Tabs filter
    var tabs = wrapper.querySelectorAll('.hub-tab');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (tb) { tb.classList.remove('active'); });
        tab.classList.add('active');
        _activeFilter = tab.getAttribute('data-filter') || 'all';
        renderAlertsList(_activeFilter);
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
      var emptyMsg = filterType && filterType !== 'all' ? t('emptyStateCategory') : t('emptyStateAll');
      listEl.innerHTML = `
        <div class="alerts-empty-state">
          <i class="fas fa-check-circle fa-2x" style="color:#16a34a;"></i>
          <div>${esc(emptyMsg)}</div>
        </div>
      `;
      return;
    }

    var html = '';
    var openText = t('openAndProcess');
    var dismissText = t('dismissAlert');

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
            ${item.link ? `<a href="${esc(item.link)}" class="alert-link-btn"><i class="fas fa-external-link-alt"></i> ${esc(openText)}</a>` : '<span></span>'}
            <button class="alert-dismiss-btn" onclick="window.ProactiveAlerts.dismissAlert('${esc(item.id)}')"><i class="fas fa-eye-slash"></i> ${esc(dismissText)}</button>
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
      renderAlertsList(_activeFilter);
    }
  }

  /**
   * Update all Hub UI texts when system language changes
   */
  function applyLanguage(lang) {
    if (!lang) lang = getCurrentLang();
    var isAr = lang === 'ar';

    var btn = document.getElementById('zeraldaAlertsButton');
    if (btn) btn.setAttribute('title', t('hubButtonTitle'));

    var dropdown = document.getElementById('zeraldaAlertsDropdown');
    if (dropdown) {
      dropdown.setAttribute('dir', isAr ? 'rtl' : 'ltr');
    }

    var headerTitle = document.getElementById('zeraldaAlertsHeaderTitle');
    if (headerTitle) headerTitle.textContent = t('hubHeaderTitle');

    var refreshBtn = document.getElementById('zeraldaAlertsRefreshBtn');
    if (refreshBtn) refreshBtn.setAttribute('title', t('refreshBtnTitle'));

    var closeBtn = document.getElementById('zeraldaAlertsCloseBtn');
    if (closeBtn) closeBtn.setAttribute('title', t('closeBtnTitle'));

    var tabAll = document.getElementById('hubTabLabelAll');
    if (tabAll) tabAll.textContent = t('tabAll');
    var tabTender = document.getElementById('hubTabLabelTender');
    if (tabTender) tabTender.textContent = t('tabTenders');
    var tabStock = document.getElementById('hubTabLabelStock');
    if (tabStock) tabStock.textContent = t('tabStock');
    var tabFinance = document.getElementById('hubTabLabelFinance');
    if (tabFinance) tabFinance.textContent = t('tabFinance');

    // Re-scan to generate alerts in the new language & re-render
    scanAlerts();
    renderAlertsList(_activeFilter);
  }

  // Auto-init on page load
  function init() {
    if (typeof document === 'undefined') return;

    function start() {
      injectWidget();
      setTimeout(function () {
        scanAlerts();
      }, 500);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }

    // Periodic scanner every 60 seconds
    if (!_scanInterval) {
      _scanInterval = setInterval(scanAlerts, 60000);
    }

    // ── Language Change Listeners ──
    if (window.UnifiedI18N && typeof window.UnifiedI18N.onLanguageChange === 'function') {
      window.UnifiedI18N.onLanguageChange(function (newLang) {
        applyLanguage(newLang);
      });
    }

    window.addEventListener('storage', function (e) {
      if (e && (e.key === 'preferred-language' || e.key === 'zeralda-settings' || e.key === 'language')) {
        applyLanguage(getCurrentLang());
      }
    });

    document.addEventListener('zeraldaStoreChange', function (e) {
      try {
        var keys = (e && e.detail && Array.isArray(e.detail.keys)) ? e.detail.keys : [];
        if (keys.indexOf('preferred-language') !== -1 || keys.indexOf('zeralda-settings') !== -1) {
          applyLanguage(getCurrentLang());
        }
      } catch (_) {}
    });
  }

  init();

  return {
    scanAlerts: scanAlerts,
    dismissAlert: dismissAlert,
    applyLanguage: applyLanguage,
    getAlerts: function () { return _cachedAlerts; }
  };
}));
