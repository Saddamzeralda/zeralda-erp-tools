/**
 * Zeralda ERP — Universal Notification Center (مركز الإشعارات والتنبيهات الموحد)
 * v2026-10-30
 * Aggregates real-time alerts across:
 *   - Tenders & Bank Guarantees (المناقصات والكفالات المصرفية)
 *   - Inventory & Stock levels (نقص ونفاد المخزون)
 *   - Overdue & Pending Invoices (فواتير المبيعات المتأخرة)
 *   - Urgent Algerian Tenders Portal (فرص تندر الجزائر العاجلة)
 */
(function () {
  'use strict';

  var NOTIF_READ_KEY = 'zeralda_read_notifications';
  var NOTIF_SOUND_KEY = 'zeralda_notif_sound_enabled';
  var activeFilter = 'all';
  var currentNotifications = [];
  var lastAlertCount = 0;
  var hasPlayedInitialSound = false;

  function safeJSON(str, fallback) {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch (_) { return fallback; }
  }

  function getActiveCompanyId() {
    if (window.CompanyStorage && typeof window.CompanyStorage.getActiveCompanyId === 'function') {
      var cid = window.CompanyStorage.getActiveCompanyId();
      if (cid) return String(cid);
    }
    try {
      var s = safeJSON((window.ZS && window.ZS.getItem('zeralda-settings')) || localStorage.getItem('zeralda-settings'), {});
      if (s && s.activeCompanyId) return String(s.activeCompanyId);
    } catch (_) {}
    return 'default-company';
  }

  function getStoredList(baseKey) {
    var cid = getActiveCompanyId();
    var scopedKey = baseKey + '::' + cid;
    var raw = null;
    if (window.ZS && typeof window.ZS.getItem === 'function') {
      raw = window.ZS.getItem(scopedKey) || window.ZS.getItem(baseKey);
    }
    if (!raw) {
      try {
        raw = localStorage.getItem(scopedKey) || localStorage.getItem(baseKey);
      } catch (_) {}
    }
    if (!raw) return [];
    var list = safeJSON(raw, []);
    return Array.isArray(list) ? list : [];
  }

  function getReadIds() {
    var list = safeJSON(localStorage.getItem(NOTIF_READ_KEY), []);
    return Array.isArray(list) ? list : [];
  }

  function saveReadIds(list) {
    try {
      localStorage.setItem(NOTIF_READ_KEY, JSON.stringify(list || []));
    } catch (_) {}
  }

  function playNotificationChime() {
    try {
      var enabled = localStorage.getItem(NOTIF_SOUND_KEY);
      if (enabled === 'false') return;
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      var ctx = new AudioContextClass();
      var now = ctx.currentTime;

      // Tone 1: E5 (659 Hz)
      var osc1 = ctx.createOscillator();
      var gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.06, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.18);

      // Tone 2: A5 (880 Hz)
      var osc2 = ctx.createOscillator();
      var gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.12);
      gain2.gain.setValueAtTime(0.07, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.36);
    } catch (_) {}
  }

  function injectNotificationStyles() {
    if (document.getElementById('zeralda-notif-center-styles')) return;
    var style = document.createElement('style');
    style.id = 'zeralda-notif-center-styles';
    style.textContent = `
      .header-notif-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
        order: 998;
      }
      .header-notif-badge {
        position: absolute;
        top: -4px;
        right: -4px;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        color: #ffffff;
        font-size: 10px;
        font-weight: 800;
        line-height: 1;
        padding: 2px 5px;
        min-width: 16px;
        height: 16px;
        border-radius: 9999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #ffffff;
        box-shadow: 0 2px 5px rgba(220, 38, 38, 0.4);
        pointer-events: none;
        animation: notifPulse 2.4s infinite;
      }
      body.dark-mode .header-notif-badge,
      [data-theme="dark"] .header-notif-badge {
        border-color: #1e293b;
      }
      @keyframes notifPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.15); box-shadow: 0 0 10px rgba(239, 68, 68, 0.7); }
      }
      .header-notif-dropdown {
        position: absolute;
        top: calc(100% + 10px);
        width: 390px;
        max-width: calc(100vw - 24px);
        max-height: 560px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        box-shadow: 0 20px 45px -10px rgba(15, 23, 42, 0.25), 0 0 1px 1px rgba(0, 0, 0, 0.05);
        display: flex;
        flex-direction: column;
        z-index: 999999;
        overflow: hidden;
        direction: rtl;
        font-family: inherit;
        animation: notifDropdownFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      body.rtl .header-notif-dropdown {
        left: 0;
        right: auto;
      }
      body:not(.rtl) .header-notif-dropdown {
        right: 0;
        left: auto;
      }
      @keyframes notifDropdownFade {
        from { opacity: 0; transform: translateY(-8px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      [data-theme="dark"] .header-notif-dropdown,
      body.dark-mode .header-notif-dropdown {
        background: #1e293b;
        border-color: #334155;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.65);
        color: #f8fafc;
      }
      .notif-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        border-bottom: 1px solid #e2e8f0;
        background: #f8fafc;
      }
      [data-theme="dark"] .notif-header,
      body.dark-mode .notif-header {
        background: #0f172a;
        border-bottom-color: #334155;
      }
      .notif-header-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 800;
        color: #0f172a;
      }
      [data-theme="dark"] .notif-header-title,
      body.dark-mode .notif-header-title {
        color: #f8fafc;
      }
      .notif-header-badge {
        font-size: 10.5px;
        font-weight: 700;
        padding: 2px 7px;
        background: #eff6ff;
        color: #2563eb;
        border-radius: 9999px;
      }
      [data-theme="dark"] .notif-header-badge,
      body.dark-mode .notif-header-badge {
        background: rgba(37, 99, 235, 0.2);
        color: #93c5fd;
      }
      .notif-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .notif-action-btn {
        background: none;
        border: none;
        padding: 5px 8px;
        font-size: 11.5px;
        font-weight: 600;
        color: #64748b;
        cursor: pointer;
        border-radius: 8px;
        transition: all 0.15s ease;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .notif-action-btn:hover {
        background: #e2e8f0;
        color: #0f172a;
      }
      [data-theme="dark"] .notif-action-btn {
        color: #94a3b8;
      }
      [data-theme="dark"] .notif-action-btn:hover {
        background: #334155;
        color: #f8fafc;
      }
      .notif-filter-tabs {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 8px 12px;
        border-bottom: 1px solid #e2e8f0;
        background: #ffffff;
        overflow-x: auto;
        white-space: nowrap;
        scrollbar-width: none;
      }
      .notif-filter-tabs::-webkit-scrollbar { display: none; }
      [data-theme="dark"] .notif-filter-tabs,
      body.dark-mode .notif-filter-tabs {
        background: #1e293b;
        border-bottom-color: #334155;
      }
      .notif-filter-tab {
        padding: 4px 10px;
        font-size: 11.5px;
        font-weight: 600;
        border-radius: 20px;
        border: 1px solid transparent;
        background: #f1f5f9;
        color: #475569;
        cursor: pointer;
        transition: all 0.15s;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .notif-filter-tab:hover {
        background: #e2e8f0;
        color: #0f172a;
      }
      .notif-filter-tab.active {
        background: #2563eb;
        color: #ffffff;
      }
      [data-theme="dark"] .notif-filter-tab {
        background: #334155;
        color: #cbd5e1;
      }
      [data-theme="dark"] .notif-filter-tab:hover {
        background: #475569;
        color: #ffffff;
      }
      [data-theme="dark"] .notif-filter-tab.active {
        background: #3b82f6;
        color: #ffffff;
      }
      .notif-list-container {
        flex: 1;
        overflow-y: auto;
        max-height: 380px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .notif-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 12px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        cursor: pointer;
        transition: all 0.15s ease;
        position: relative;
      }
      .notif-item:hover {
        background: #f1f5f9;
        border-color: #cbd5e1;
        transform: translateY(-1px);
      }
      .notif-item.is-unread {
        background: #eff6ff;
        border-color: #bfdbfe;
      }
      .notif-item.is-unread::before {
        content: '';
        position: absolute;
        top: 10px;
        right: 4px;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #2563eb;
      }
      [data-theme="dark"] .notif-item {
        background: #0f172a;
        border-color: #334155;
      }
      [data-theme="dark"] .notif-item:hover {
        background: #1e293b;
        border-color: #475569;
      }
      [data-theme="dark"] .notif-item.is-unread {
        background: rgba(37, 99, 235, 0.12);
        border-color: rgba(37, 99, 235, 0.4);
      }
      .notif-item-icon {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        flex-shrink: 0;
      }
      .notif-item-icon.danger {
        background: #fee2e2;
        color: #dc2626;
      }
      .notif-item-icon.warning {
        background: #fef3c7;
        color: #d97706;
      }
      .notif-item-icon.info {
        background: #e0f2fe;
        color: #0284c7;
      }
      .notif-item-icon.success {
        background: #dcfce7;
        color: #16a34a;
      }
      [data-theme="dark"] .notif-item-icon.danger { background: rgba(220, 38, 38, 0.2); color: #f87171; }
      [data-theme="dark"] .notif-item-icon.warning { background: rgba(217, 119, 6, 0.2); color: #fbbf24; }
      [data-theme="dark"] .notif-item-icon.info { background: rgba(2, 132, 199, 0.2); color: #38bdf8; }
      [data-theme="dark"] .notif-item-icon.success { background: rgba(22, 163, 74, 0.2); color: #4ade80; }
      .notif-item-content {
        flex: 1;
        min-width: 0;
      }
      .notif-item-title {
        font-size: 12.5px;
        font-weight: 700;
        color: #0f172a;
        margin-bottom: 2px;
        line-height: 1.35;
      }
      [data-theme="dark"] .notif-item-title {
        color: #f8fafc;
      }
      .notif-item-desc {
        font-size: 11.5px;
        color: #64748b;
        line-height: 1.4;
        word-break: break-word;
      }
      [data-theme="dark"] .notif-item-desc {
        color: #94a3b8;
      }
      .notif-item-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 4px;
        font-size: 10.5px;
      }
      .notif-item-badge {
        padding: 1px 6px;
        border-radius: 6px;
        font-weight: 700;
      }
      .notif-item-badge.danger { background: #fee2e2; color: #b91c1c; }
      .notif-item-badge.warning { background: #fef3c7; color: #b45309; }
      .notif-item-badge.info { background: #e0f2fe; color: #0369a1; }
      .notif-item-badge.success { background: #dcfce7; color: #15803d; }
      [data-theme="dark"] .notif-item-badge.danger { background: rgba(185, 28, 28, 0.3); color: #fca5a5; }
      [data-theme="dark"] .notif-item-badge.warning { background: rgba(180, 83, 9, 0.3); color: #fde68a; }
      [data-theme="dark"] .notif-item-badge.info { background: rgba(3, 105, 161, 0.3); color: #bae6fd; }
      .notif-item-check-btn {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 4px;
        font-size: 12px;
        border-radius: 4px;
        transition: color 0.15s;
      }
      .notif-item-check-btn:hover {
        color: #10b981;
      }
      .notif-empty-state {
        padding: 36px 16px;
        text-align: center;
        color: #64748b;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      [data-theme="dark"] .notif-empty-state {
        color: #94a3b8;
      }
      .notif-footer {
        padding: 10px 14px;
        border-top: 1px solid #e2e8f0;
        background: #f8fafc;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11.5px;
      }
      [data-theme="dark"] .notif-footer {
        background: #0f172a;
        border-top-color: #334155;
      }
      .notif-footer a {
        color: #2563eb;
        text-decoration: none;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      [data-theme="dark"] .notif-footer a {
        color: #60a5fa;
      }
      .notif-footer a:hover {
        text-decoration: underline;
      }
    `;
    document.head.appendChild(style);
  }

  function gatherNotifications() {
    var notifs = [];
    var readIds = getReadIds();
    var readMap = {};
    readIds.forEach(function (id) { readMap[id] = true; });

    var today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── 1. Tenders & Bank Guarantees ──
    try {
      var tendersList = getStoredList('consulting-tenders-data');
      if (!tendersList.length) {
        tendersList = getStoredList('tenders-data');
      }

      tendersList.forEach(function (t, idx) {
        if (!t) return;
        var tenderId = t.id || ('tender_' + idx);
        var status = String(t.status || t.stage || 'draft').toLowerCase();
        var isClosed = ['won', 'lost', 'cancelled', 'archived', 'closed', 'ملغاة', 'فائزة', 'خاسرة'].indexOf(status) !== -1;

        // Submission deadline check
        var deadlineStr = t.submissionDeadline || t.deadline || t.closingDate;
        if (deadlineStr && !isClosed) {
          var deadline = new Date(deadlineStr);
          if (!isNaN(deadline.getTime())) {
            deadline.setHours(0, 0, 0, 0);
            var diffDays = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
              notifs.push({
                id: 'tender_overdue_' + tenderId,
                category: 'tenders',
                level: 'danger',
                icon: 'fas fa-exclamation-circle',
                title: 'انتهى أجل إيداع المناقصة: ' + (t.title || t.reference || 'مناقصة'),
                desc: 'تاريخ الإيداع المحدد: ' + deadlineStr + ' (تجاوز الأجل بـ ' + Math.abs(diffDays) + ' يوم).',
                badgeText: 'منتهية الأجل',
                targetUrl: 'modules/consulting/consulting_tenders_management.html',
                isRead: !!readMap['tender_overdue_' + tenderId]
              });
            } else if (diffDays === 0) {
              notifs.push({
                id: 'tender_today_' + tenderId,
                category: 'tenders',
                level: 'danger',
                icon: 'fas fa-stopwatch',
                title: 'اليوم هو الأجل الأخير لإيداع: ' + (t.title || t.reference || 'مناقصة'),
                desc: 'الأجل النهائي ينتهي اليوم! يرجى إيداع العروض والوثائق فوراً.',
                badgeText: 'أجل اليوم',
                targetUrl: 'modules/consulting/consulting_tenders_management.html',
                isRead: !!readMap['tender_today_' + tenderId]
              });
            } else if (diffDays <= 3) {
              notifs.push({
                id: 'tender_soon_' + tenderId,
                category: 'tenders',
                level: 'danger',
                icon: 'fas fa-hourglass-half',
                title: 'عاجل: باقي ' + diffDays + ' أيام على إيداع: ' + (t.title || t.reference || 'مناقصة'),
                desc: 'تاريخ الإيداع: ' + deadlineStr + ' — تأكد من استكمال الكفالة المصرفية وجدول الأسعار (BPU).',
                badgeText: 'باقي ' + diffDays + ' يوم',
                targetUrl: 'modules/consulting/consulting_tenders_management.html',
                isRead: !!readMap['tender_soon_' + tenderId]
              });
            } else if (diffDays <= 7) {
              notifs.push({
                id: 'tender_warning_' + tenderId,
                category: 'tenders',
                level: 'warning',
                icon: 'fas fa-clock',
                title: 'اقتراب أجل مناقصة: ' + (t.title || t.reference || 'مناقصة'),
                desc: 'تاريخ الإيداع: ' + deadlineStr + ' (متبقي ' + diffDays + ' أيام).',
                badgeText: 'باقي ' + diffDays + ' أيام',
                targetUrl: 'modules/consulting/consulting_tenders_management.html',
                isRead: !!readMap['tender_warning_' + tenderId]
              });
            }
          }
        }

        // Bank Cautions check
        var cautions = Array.isArray(t.cautions) ? t.cautions : [];
        cautions.forEach(function (c, cIdx) {
          if (!c) return;
          var cStatus = String(c.status || 'active').toLowerCase();
          if (cStatus === 'released' || cStatus === 'restituted' || cStatus === 'مسترجعة' || cStatus === 'محررة') return;
          var cExpiryStr = c.expiryDate || c.validityDate || c.date;
          if (!cExpiryStr) return;
          var cExpiry = new Date(cExpiryStr);
          if (isNaN(cExpiry.getTime())) return;
          cExpiry.setHours(0, 0, 0, 0);
          var cDiff = Math.ceil((cExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

          if (cDiff <= 15) {
            var cId = 'caution_' + tenderId + '_' + (c.id || cIdx);
            var isCrit = cDiff <= 3;
            notifs.push({
              id: cId,
              category: 'tenders',
              level: isCrit ? 'danger' : 'warning',
              icon: 'fas fa-university',
              title: 'تنبيه كفالة مصرفية (' + (c.type || 'كفالة تعهد') + '): ' + (c.bank || 'البنك'),
              desc: (cDiff <= 0 ? 'انتهت صلاحية الكفالة المصرفية' : 'باقي ' + cDiff + ' يوم على انتهاء صلاحيتها') + ' لمناقصة: ' + (t.title || t.reference || 'مناقصة') + '.',
              badgeText: cDiff <= 0 ? 'منتهية' : (cDiff + ' يوم'),
              targetUrl: 'modules/consulting/consulting_tenders_management.html',
              isRead: !!readMap[cId]
            });
          }
        });
      });
    } catch (e1) {
      console.warn('[notifications] Error checking tenders:', e1);
    }

    // ── 2. Inventory (المخزون) ──
    try {
      var productsList = getStoredList('products-data');
      productsList.forEach(function (p, idx) {
        if (!p) return;
        var pId = p.id || ('prod_' + idx);
        var stock = Number(p.stock !== undefined ? p.stock : (p.quantity !== undefined ? p.quantity : (p.currentStock !== undefined ? p.currentStock : 0)));
        var minStock = Number(p.minStock || p.alertStock || p.reorderLevel || 5);
        var pName = p.name || p.designation || p.title || ('صنف #' + pId);

        if (stock <= 0) {
          var nId = 'stock_out_' + pId;
          notifs.push({
            id: nId,
            category: 'stock',
            level: 'danger',
            icon: 'fas fa-box-open',
            title: 'نفاد المخزون بالكامل: ' + pName,
            desc: 'الرصيد المتاح حالياً هو 0 ' + (p.unit || 'وحدة') + '. يرجى إصدار طلب شراء عاجل.',
            badgeText: 'نفاد مخزون',
            targetUrl: 'modules/inventory/inventory_management.html',
            isRead: !!readMap[nId]
          });
        } else if (stock <= minStock) {
          var nId2 = 'stock_low_' + pId;
          notifs.push({
            id: nId2,
            category: 'stock',
            level: 'warning',
            icon: 'fas fa-exclamation-triangle',
            title: 'تنبيه نقص المخزون: ' + pName,
            desc: 'الرصيد الحالي (' + stock + ' ' + (p.unit || 'وحدة') + ') أقل من أو يساوي حد إعادة الطلب (' + minStock + ').',
            badgeText: 'مخزون منخفض',
            targetUrl: 'modules/inventory/inventory_management.html',
            isRead: !!readMap[nId2]
          });
        }
      });
    } catch (e2) {
      console.warn('[notifications] Error checking products:', e2);
    }

    // ── 3. Overdue Invoices (الفواتير غير المسددة) ──
    try {
      var invoicesList = getStoredList('invoices-data');
      invoicesList.forEach(function (inv, idx) {
        if (!inv) return;
        var invId = inv.id || ('inv_' + idx);
        var invNum = inv.number || inv.invoiceNumber || inv.id || ('فاتورة #' + invId);
        var clientName = inv.client || inv.customer || inv.clientName || 'عميل';
        var status = String(inv.status || 'Unpaid').toLowerCase();
        var isPaid = ['paid', 'مدفوعة', 'payée', 'annulée', 'cancelled'].indexOf(status) !== -1;

        if (!isPaid && inv.dueDate) {
          var due = new Date(inv.dueDate);
          if (!isNaN(due.getTime())) {
            due.setHours(0, 0, 0, 0);
            var invDiff = Math.ceil((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
            if (invDiff > 0) {
              var nId3 = 'inv_overdue_' + invId;
              var totalStr = inv.total ? (' — المبلغ: ' + Number(inv.total).toLocaleString('fr-FR') + ' د.ج') : '';
              notifs.push({
                id: nId3,
                category: 'invoices',
                level: 'danger',
                icon: 'fas fa-file-invoice-dollar',
                title: 'فاتورة مبيعات متأخرة: ' + invNum + ' (' + clientName + ')',
                desc: 'تجاوزت تاريخ الاستحقاق بـ ' + invDiff + ' يوم (تاريخ الاستحقاق: ' + inv.dueDate + ')' + totalStr + '.',
                badgeText: 'تأخر ' + invDiff + ' يوم',
                targetUrl: 'modules/sales/sales_management.html',
                isRead: !!readMap[nId3]
              });
            }
          }
        }
      });
    } catch (e3) {
      console.warn('[notifications] Error checking invoices:', e3);
    }

    // ── 4. Algerian Tender DZ Portal Opportunities ──
    try {
      var dzTenders = safeJSON(localStorage.getItem('tender-dz-portal-tenders'), []);
      if (Array.isArray(dzTenders)) {
        dzTenders.slice(0, 15).forEach(function (dz, idx) {
          if (!dz) return;
          var daysLeft = Number(dz.daysLeft || 0);
          if (daysLeft > 0 && daysLeft <= 3) {
            var dzId = 'dz_portal_' + (dz.id || idx);
            notifs.push({
              id: dzId,
              category: 'portal',
              level: 'info',
              icon: 'fas fa-bullhorn',
              title: 'فرصة عاجلة بتندر الجزائر: ' + (dz.title || 'مناقصة جديدة').slice(0, 48) + '...',
              desc: (dz.client || 'الهيئة المعلنة') + ' — ' + (dz.wilaya || 'الجزائر') + ' (باقي ' + daysLeft + ' أيام على الأجل النهائي).',
              badgeText: 'تندر الجزائر (' + daysLeft + ' ي)',
              targetUrl: 'modules/consulting/tender_dz_portal.html',
              isRead: !!readMap[dzId]
            });
          }
        });
      }
    } catch (e4) {
      console.warn('[notifications] Error checking Tender DZ:', e4);
    }

    // Sort: unread first, then danger, then warning, then info
    notifs.sort(function (a, b) {
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      var levelWeight = { danger: 3, warning: 2, info: 1, success: 0 };
      return (levelWeight[b.level] || 0) - (levelWeight[a.level] || 0);
    });

    return notifs;
  }

  function updateBadge() {
    var badge = document.getElementById('headerNotifBadge');
    var bellIcon = document.getElementById('headerNotifBellIcon');
    if (!badge) return;

    var unreadCount = currentNotifications.filter(function (n) { return !n.isRead; }).length;

    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.style.display = 'inline-flex';
      if (bellIcon) {
        bellIcon.style.color = '#f59e0b';
      }
    } else {
      badge.style.display = 'none';
      if (bellIcon) {
        bellIcon.style.color = 'inherit';
      }
    }

    // Play chime if unread count increased and not first silent load
    if (hasPlayedInitialSound && unreadCount > lastAlertCount) {
      playNotificationChime();
    }
    lastAlertCount = unreadCount;
    hasPlayedInitialSound = true;
  }

  function renderDropdownContent() {
    var dropdown = document.getElementById('headerNotifDropdown');
    if (!dropdown) return;

    var unreadCount = currentNotifications.filter(function (n) { return !n.isRead; }).length;
    var filtered = currentNotifications.filter(function (n) {
      if (activeFilter === 'all') return true;
      return n.category === activeFilter;
    });

    var countAll = currentNotifications.length;
    var countTenders = currentNotifications.filter(function (n) { return n.category === 'tenders'; }).length;
    var countStock = currentNotifications.filter(function (n) { return n.category === 'stock'; }).length;
    var countInvoices = currentNotifications.filter(function (n) { return n.category === 'invoices'; }).length;
    var countPortal = currentNotifications.filter(function (n) { return n.category === 'portal'; }).length;

    var soundEnabled = localStorage.getItem(NOTIF_SOUND_KEY) !== 'false';

    var html = `
      <!-- Header -->
      <div class="notif-header">
        <div class="notif-header-title">
          <i class="fas fa-bell" style="color:#f59e0b;"></i>
          <span>مركز الإشعارات والتنبيهات</span>
          <span class="notif-header-badge">${unreadCount} جديدة</span>
        </div>
        <div class="notif-header-actions">
          <button class="notif-action-btn" type="button" onclick="window.ZeraldaNotifications.markAllRead()" title="تحديد الكل كمقروء">
            <i class="fas fa-check-double"></i>
            <span>تحديد الكل</span>
          </button>
          <button class="notif-action-btn" type="button" onclick="window.ZeraldaNotifications.toggleSound()" title="${soundEnabled ? 'كتم التنبيهات الصوتية' : 'تفعيل التنبيهات الصوتية'}">
            <i class="fas ${soundEnabled ? 'fa-volume-up' : 'fa-volume-mute'}" style="color:${soundEnabled ? '#10b981' : '#94a3b8'};"></i>
          </button>
          <button class="notif-action-btn" type="button" onclick="window.ZeraldaNotifications.refresh()" title="تحديث التنبيهات">
            <i class="fas fa-sync-alt"></i>
          </button>
        </div>
      </div>

      <!-- Filter Tabs -->
      <div class="notif-filter-tabs">
        <button class="notif-filter-tab ${activeFilter === 'all' ? 'active' : ''}" type="button" onclick="window.ZeraldaNotifications.setFilter('all')">
          <span>الكل</span>
          <span>(${countAll})</span>
        </button>
        <button class="notif-filter-tab ${activeFilter === 'tenders' ? 'active' : ''}" type="button" onclick="window.ZeraldaNotifications.setFilter('tenders')">
          <i class="fas fa-file-contract"></i>
          <span>المناقصات والكفالات</span>
          <span>(${countTenders})</span>
        </button>
        <button class="notif-filter-tab ${activeFilter === 'stock' ? 'active' : ''}" type="button" onclick="window.ZeraldaNotifications.setFilter('stock')">
          <i class="fas fa-boxes"></i>
          <span>المخزون</span>
          <span>(${countStock})</span>
        </button>
        <button class="notif-filter-tab ${activeFilter === 'invoices' ? 'active' : ''}" type="button" onclick="window.ZeraldaNotifications.setFilter('invoices')">
          <i class="fas fa-file-invoice-dollar"></i>
          <span>الفواتير</span>
          <span>(${countInvoices})</span>
        </button>
        <button class="notif-filter-tab ${activeFilter === 'portal' ? 'active' : ''}" type="button" onclick="window.ZeraldaNotifications.setFilter('portal')">
          <i class="fas fa-bullhorn"></i>
          <span>تندر الجزائر</span>
          <span>(${countPortal})</span>
        </button>
      </div>

      <!-- Notifications List -->
      <div class="notif-list-container">
    `;

    if (!filtered.length) {
      html += `
        <div class="notif-empty-state">
          <div style="width:48px;height:48px;border-radius:50%;background:#dcfce7;color:#16a34a;display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:4px;">
            <i class="fas fa-check"></i>
          </div>
          <div style="font-weight:700;font-size:13px;color:#0f172a;">لا توجد تنبيهات نشطة في هذا القسم</div>
          <div style="font-size:11.5px;max-width:280px;line-height:1.4;">جميع المناقصات، حركات المخزون، والفواتير في حالة ممتازة ومستوفاة.</div>
        </div>
      `;
    } else {
      filtered.forEach(function (item) {
        html += `
          <div class="notif-item ${item.isRead ? '' : 'is-unread'}" onclick="window.ZeraldaNotifications.handleItemClick('${item.id}', '${item.targetUrl}')">
            <div class="notif-item-icon ${item.level}">
              <i class="${item.icon}"></i>
            </div>
            <div class="notif-item-content">
              <div class="notif-item-title">${escapeHTML(item.title)}</div>
              <div class="notif-item-desc">${escapeHTML(item.desc)}</div>
              <div class="notif-item-meta">
                <span class="notif-item-badge ${item.level}">${escapeHTML(item.badgeText || '')}</span>
                <button class="notif-item-check-btn" type="button" title="${item.isRead ? 'مقروء' : 'تحديد كمقروء'}" onclick="event.stopPropagation(); window.ZeraldaNotifications.toggleItemRead('${item.id}');">
                  <i class="fas ${item.isRead ? 'fa-check' : 'fa-circle'}" style="${item.isRead ? 'color:#10b981;' : 'color:#94a3b8; font-size:8px;'}"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      });
    }

    html += `
      </div>

      <!-- Footer -->
      <div class="notif-footer">
        <a href="modules/consulting/consulting_tenders_management.html">
          <i class="fas fa-file-contract"></i>
          <span>إدارة المناقصات</span>
        </a>
        <a href="pages/settings.html#notifications">
          <i class="fas fa-cog"></i>
          <span>إعدادات الإشعارات</span>
        </a>
      </div>
    `;

    dropdown.innerHTML = html;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function refresh(silent) {
    currentNotifications = gatherNotifications();
    updateBadge();
    var dropdown = document.getElementById('headerNotifDropdown');
    if (dropdown && dropdown.style.display !== 'none') {
      renderDropdownContent();
    }
  }

  function toggleDropdown(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    var dropdown = document.getElementById('headerNotifDropdown');
    if (!dropdown) return;

    if (dropdown.style.display === 'none' || !dropdown.style.display) {
      refresh(true);
      renderDropdownContent();
      dropdown.style.display = 'flex';
    } else {
      dropdown.style.display = 'none';
    }
  }

  function closeDropdown() {
    var dropdown = document.getElementById('headerNotifDropdown');
    if (dropdown) dropdown.style.display = 'none';
  }

  function markAllRead() {
    var ids = currentNotifications.map(function (n) { return n.id; });
    saveReadIds(ids);
    currentNotifications.forEach(function (n) { n.isRead = true; });
    updateBadge();
    renderDropdownContent();
  }

  function toggleItemRead(id) {
    var readIds = getReadIds();
    var idx = readIds.indexOf(id);
    if (idx === -1) {
      readIds.push(id);
    } else {
      readIds.splice(idx, 1);
    }
    saveReadIds(readIds);
    var item = currentNotifications.find(function (n) { return n.id === id; });
    if (item) item.isRead = (idx === -1);
    updateBadge();
    renderDropdownContent();
  }

  function handleItemClick(id, targetUrl) {
    var readIds = getReadIds();
    if (readIds.indexOf(id) === -1) {
      readIds.push(id);
      saveReadIds(readIds);
      var item = currentNotifications.find(function (n) { return n.id === id; });
      if (item) item.isRead = true;
      updateBadge();
    }
    closeDropdown();
    if (targetUrl) {
      window.location.href = targetUrl;
    }
  }

  function setFilter(filter) {
    activeFilter = filter;
    renderDropdownContent();
  }

  function toggleSound() {
    var enabled = localStorage.getItem(NOTIF_SOUND_KEY) !== 'false';
    localStorage.setItem(NOTIF_SOUND_KEY, enabled ? 'false' : 'true');
    if (!enabled) {
      playNotificationChime();
    }
    renderDropdownContent();
  }

  // Global document click listener to close dropdown when clicking outside
  document.addEventListener('click', function (e) {
    var dropdown = document.getElementById('headerNotifDropdown');
    var btn = document.getElementById('headerNotificationsBtn');
    if (!dropdown || dropdown.style.display === 'none') return;
    if (dropdown.contains(e.target) || (btn && btn.contains(e.target))) return;
    closeDropdown();
  });

  // ESC key closes dropdown
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDropdown();
  });

  function init() {
    injectNotificationStyles();
    refresh(true);

    // Periodic background check every 60 seconds
    setInterval(function () {
      refresh(false);
    }, 60000);
  }

  // Expose global API
  window.ZeraldaNotifications = {
    init: init,
    refresh: refresh,
    toggleDropdown: toggleDropdown,
    closeDropdown: closeDropdown,
    markAllRead: markAllRead,
    toggleItemRead: toggleItemRead,
    handleItemClick: handleItemClick,
    setFilter: setFilter,
    toggleSound: toggleSound,
    playChime: playNotificationChime
  };

  window.toggleNotificationsDropdown = toggleDropdown;

  // Listen to shared layout loading
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('sharedLayoutLoaded', function () {
    setTimeout(init, 100);
  });
})();
