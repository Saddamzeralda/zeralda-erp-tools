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
              link: 'modules/consulting/consulting_tenders_management.html',
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
              link: 'modules/consulting/consulting_tenders_management.html',
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
              link: 'modules/inventory/inventory_management.html',
              timestamp: Date.now()
            });
          } else if (qty <= minQty) {
            alerts.push({
              id: 'stock-low-' + ref,
              type: 'stock',
              severity: 'warning',
              title: t('stockLowTitle'),
              message: t('stockLowMsg', { name: name, qty: qty, minQty: minQty }),
              link: 'modules/inventory/inventory_management.html',
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
              link: 'modules/sales/sales_management.html',
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

  // --- UI Injection Disabled ---
  function injectWidget() {
    ['zeraldaAlertsHubWrapper', 'zeraldaAlertsButton', 'zeraldaAlertsDropdown'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
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
