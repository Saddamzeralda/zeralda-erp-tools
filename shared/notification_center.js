/**
 * Zeralda ERP — Universal Notification Center (مركز الإشعارات والتنبيهات الموحد)
 * v2026-11-01 - Full Trilingual I18N (AR / FR / EN) & RTL/LTR dynamic reactivity
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

  // ── Language Detection ──
  function getAppLang() {
    try {
      if (typeof window.UnifiedI18N !== 'undefined' && typeof window.UnifiedI18N.getCurrentLang === 'function') {
        var l = String(window.UnifiedI18N.getCurrentLang() || '').toLowerCase();
        if (l === 'ar' || l === 'fr' || l === 'en') return l;
      }
    } catch (_) {}
    try {
      var headerSelect = document.getElementById('headerLanguageSelect') || document.getElementById('headerLanguageSwitcher');
      if (headerSelect && headerSelect.value) {
        var hl = String(headerSelect.value).toLowerCase();
        if (hl === 'ar' || hl === 'fr' || hl === 'en') return hl;
      }
    } catch (_) {}
    try {
      if (typeof window.ZS !== 'undefined' && typeof window.ZS.getItem === 'function') {
        var pl = String(window.ZS.getItem('preferred-language') || window.ZS.getItem('language') || '').toLowerCase();
        if (pl === 'ar' || pl === 'fr' || pl === 'en') return pl;
      }
    } catch (_) {}
    try {
      if (typeof localStorage !== 'undefined') {
        var pl = String(localStorage.getItem('preferred-language') || localStorage.getItem('language') || '').toLowerCase();
        if (pl === 'ar' || pl === 'fr' || pl === 'en') return pl;
      }
    } catch (_) {}
    try {
      var raw = (typeof window.ZS !== 'undefined' && typeof window.ZS.getItem === 'function')
        ? window.ZS.getItem('zeralda-settings')
        : (typeof localStorage !== 'undefined' ? localStorage.getItem('zeralda-settings') : null);
      if (raw) {
        var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        var sl = String((parsed && (parsed.preferredLanguage || parsed.language)) || '').toLowerCase();
        if (sl === 'ar' || sl === 'fr' || sl === 'en') return sl;
      }
    } catch (_) {}
    try {
      var dl = String(document.documentElement.lang || '').toLowerCase().substring(0, 2);
      if (dl === 'ar' || dl === 'fr' || dl === 'en') return dl;
    } catch (_) {}
    return 'ar';
  }

  // ── Unified Notification Dictionaries ──
  var NOTIF_I18N = {
    // Dropdown Header
    center_title: {
      ar: 'مركز الإشعارات والتنبيهات',
      fr: 'Centre de notifications & alertes',
      en: 'Notifications & Alerts Center'
    },
    new_badge: {
      ar: '{count} جديدة',
      fr: '{count} nouvelle(s)',
      en: '{count} new'
    },
    mark_all_read: {
      ar: 'تحديد الكل كمقروء',
      fr: 'Tout marquer comme lu',
      en: 'Mark all as read'
    },
    mark_all: {
      ar: 'تحديد الكل',
      fr: 'Tout marquer',
      en: 'Mark all'
    },
    mute_sound: {
      ar: 'كتم التنبيهات الصوتية',
      fr: 'Couper les alertes sonores',
      en: 'Mute sound alerts'
    },
    unmute_sound: {
      ar: 'تفعيل التنبيهات الصوتية',
      fr: 'Activer les alertes sonores',
      en: 'Enable sound alerts'
    },
    refresh: {
      ar: 'تحديث التنبيهات',
      fr: 'Actualiser les alertes',
      en: 'Refresh alerts'
    },

    // Tabs
    tab_all: {
      ar: 'الكل',
      fr: 'Tous',
      en: 'All'
    },
    tab_tenders: {
      ar: 'المناقصات والكفالات',
      fr: 'Appels d\'offres & Cautions',
      en: 'Tenders & Guarantees'
    },
    tab_stock: {
      ar: 'المخزون',
      fr: 'Stock & Inventaire',
      en: 'Inventory'
    },
    tab_invoices: {
      ar: 'الفواتير',
      fr: 'Factures',
      en: 'Invoices'
    },
    tab_portal: {
      ar: 'تندر الجزائر',
      fr: 'Tender DZ',
      en: 'Tender DZ'
    },

    // Empty state
    empty_title: {
      ar: 'لا توجد تنبيهات نشطة في هذا القسم',
      fr: 'Aucune alerte active dans cette section',
      en: 'No active alerts in this section'
    },
    empty_desc: {
      ar: 'جميع المناقصات، حركات المخزون، والفواتير في حالة ممتازة ومستوفاة.',
      fr: 'Tous les appels d\'offres, mouvements de stock et factures sont à jour.',
      en: 'All tenders, inventory movements, and invoices are up to date and in order.'
    },

    // Footer
    manage_tenders: {
      ar: 'إدارة المناقصات',
      fr: 'Gestion des appels d\'offres',
      en: 'Tenders Management'
    },
    notif_settings: {
      ar: 'إعدادات الإشعارات',
      fr: 'Paramètres des notifications',
      en: 'Notification Settings'
    },

    // Item actions & state
    read: {
      ar: 'مقروء',
      fr: 'Lu',
      en: 'Read'
    },
    mark_read: {
      ar: 'تحديد كمقروء',
      fr: 'Marquer comme lu',
      en: 'Mark as read'
    },

    // Tenders notifications
    default_tender: {
      ar: 'مناقصة',
      fr: 'Appel d\'offres',
      en: 'Tender'
    },
    tender_overdue_title: {
      ar: 'انتهى أجل إيداع المناقصة: {name}',
      fr: 'Date limite dépassée pour l\'appel d\'offres : {name}',
      en: 'Tender submission deadline expired: {name}'
    },
    tender_overdue_desc: {
      ar: 'تاريخ الإيداع المحدد: {date} (تجاوز الأجل بـ {days} يوم).',
      fr: 'Date limite fixée : {date} (dépassée de {days} jour(s)).',
      en: 'Submission deadline: {date} (overdue by {days} day(s)).'
    },
    badge_expired: {
      ar: 'منتهية الأجل',
      fr: 'Expiré',
      en: 'Expired'
    },
    tender_today_title: {
      ar: 'اليوم هو الأجل الأخير لإيداع: {name}',
      fr: 'Dernier délai de dépôt aujourd\'hui pour : {name}',
      en: 'Today is the final submission deadline for: {name}'
    },
    tender_today_desc: {
      ar: 'الأجل النهائي ينتهي اليوم! يرجى إيداع العروض والوثائق فوراً.',
      fr: 'L\'échéance finale est aujourd\'hui ! Veuillez déposer les offres immédiatement.',
      en: 'Final deadline expires today! Please submit bids and documents immediately.'
    },
    badge_today: {
      ar: 'أجل اليوم',
      fr: 'Aujourd\'hui',
      en: 'Today'
    },
    tender_soon_title: {
      ar: 'عاجل: باقي {days} أيام على إيداع: {name}',
      fr: 'Urgent : plus que {days} j pour déposer : {name}',
      en: 'Urgent: {days} day(s) remaining to submit: {name}'
    },
    tender_soon_desc: {
      ar: 'تاريخ الإيداع: {date} — تأكد من استكمال الكفالة المصرفية وجدول الأسعار (BPU).',
      fr: 'Date de dépôt : {date} — Assurez-vous de finaliser la caution et le bordereau des prix (BPU).',
      en: 'Submission date: {date} — Ensure bank guarantee and unit price schedule (BPU) are ready.'
    },
    tender_warning_title: {
      ar: 'اقتراب أجل مناقصة: {name}',
      fr: 'Échéance proche pour l\'appel d\'offres : {name}',
      en: 'Tender deadline approaching: {name}'
    },
    tender_warning_desc: {
      ar: 'تاريخ الإيداع: {date} (متبقي {days} أيام).',
      fr: 'Date de dépôt : {date} ({days} jour(s) restant(s)).',
      en: 'Submission date: {date} ({days} day(s) remaining).'
    },
    badge_days_left: {
      ar: 'باقي {days} يوم',
      fr: '{days} j restant(s)',
      en: '{days} day(s) left'
    },

    // Bank Caution notifications
    caution_title: {
      ar: 'تنبيه كفالة مصرفية ({type}): {bank}',
      fr: 'Alerte caution bancaire ({type}) : {bank}',
      en: 'Bank guarantee alert ({type}): {bank}'
    },
    caution_expired_desc: {
      ar: 'انتهت صلاحية الكفالة المصرفية لمناقصة: {name}.',
      fr: 'La caution bancaire a expiré pour l\'appel d\'offres : {name}.',
      en: 'Bank guarantee has expired for tender: {name}.'
    },
    caution_soon_desc: {
      ar: 'باقي {days} يوم على انتهاء صلاحيتها لمناقصة: {name}.',
      fr: 'Plus que {days} jour(s) de validité pour l\'appel d\'offres : {name}.',
      en: '{days} day(s) left before expiration for tender: {name}.'
    },
    default_caution_type: {
      ar: 'كفالة تعهد',
      fr: 'Caution de soumission',
      en: 'Bid bond'
    },
    default_bank: {
      ar: 'البنك',
      fr: 'Banque',
      en: 'Bank'
    },

    // Inventory notifications
    stock_out_title: {
      ar: 'نفاد المخزون بالكامل: {name}',
      fr: 'Rupture de stock totale : {name}',
      en: 'Out of stock: {name}'
    },
    stock_out_desc: {
      ar: 'الرصيد المتاح حالياً هو 0 {unit}. يرجى إصدار طلب شراء عاجل.',
      fr: 'Le stock disponible est actuellement de 0 {unit}. Veuillez émettre un bon de commande d\'achat.',
      en: 'Current available stock is 0 {unit}. Please issue an urgent purchase order.'
    },
    badge_stock_out: {
      ar: 'نفاد مخزون',
      fr: 'Rupture',
      en: 'Out of stock'
    },
    stock_low_title: {
      ar: 'تنبيه نقص المخزون: {name}',
      fr: 'Alerte stock bas : {name}',
      en: 'Low stock alert: {name}'
    },
    stock_low_desc: {
      ar: 'الرصيد الحالي ({stock} {unit}) أقل من أو يساوي حد إعادة الطلب ({min}).',
      fr: 'Le stock actuel ({stock} {unit}) est inférieur ou égal au seuil de réapprovisionnement ({min}).',
      en: 'Current stock ({stock} {unit}) is at or below the reorder level ({min}).'
    },
    badge_stock_low: {
      ar: 'مخزون منخفض',
      fr: 'Stock bas',
      en: 'Low stock'
    },
    unit_default: {
      ar: 'وحدة',
      fr: 'unité',
      en: 'unit'
    },

    // Invoice notifications
    invoice_overdue_title: {
      ar: 'فاتورة مبيعات متأخرة: {number} ({client})',
      fr: 'Facture en retard : {number} ({client})',
      en: 'Overdue sales invoice: {number} ({client})'
    },
    invoice_overdue_desc: {
      ar: 'تجاوزت تاريخ الاستحقاق بـ {days} يوم (تاريخ الاستحقاق: {date}){amount}.',
      fr: 'Échéance dépassée de {days} jour(s) (date d\'échéance : {date}){amount}.',
      en: 'Due date exceeded by {days} day(s) (due date: {date}){amount}.'
    },
    invoice_amount_label: {
      ar: ' — المبلغ: {amount} د.ج',
      fr: ' — Montant : {amount} DZD',
      en: ' — Amount: {amount} DZD'
    },
    badge_overdue_days: {
      ar: 'تأخر {days} يوم',
      fr: 'Retard {days} j',
      en: '{days} d overdue'
    },
    default_client: {
      ar: 'زبون',
      fr: 'Client',
      en: 'Customer'
    },

    // Algerian Tender DZ Portal
    default_dz_title: {
      ar: 'مناقصة جديدة',
      fr: 'Nouvel appel d\'offres',
      en: 'New tender'
    },
    dz_portal_title: {
      ar: 'فرصة عاجلة بتندر الجزائر: {name}',
      fr: 'Opportunité urgente Tender DZ : {name}',
      en: 'Urgent opportunity on Tender DZ: {name}'
    },
    dz_portal_desc: {
      ar: '{client} — {wilaya} (باقي {days} أيام على الأجل النهائي).',
      fr: '{client} — {wilaya} ({days} jour(s) restant(s) avant la clôture).',
      en: '{client} — {wilaya} ({days} day(s) remaining until deadline).'
    },
    badge_dz_portal: {
      ar: 'تندر الجزائر ({days} ي)',
      fr: 'Tender DZ ({days} j)',
      en: 'Tender DZ ({days} d)'
    },
    default_dz_client: {
      ar: 'الهيئة المعلنة',
      fr: 'Organisme émetteur',
      en: 'Issuing agency'
    },
    default_dz_wilaya: {
      ar: 'الجزائر',
      fr: 'Alger',
      en: 'Algiers'
    }
  };

  function _t(key, params) {
    var lang = getAppLang();
    var entry = NOTIF_I18N[key];
    var text = (entry && (entry[lang] || entry.en || entry.ar)) || key;
    if (params && typeof params === 'object') {
      Object.keys(params).forEach(function (p) {
        text = text.replace(new RegExp('\\{' + p + '\\}', 'g'), params[p]);
      });
    }
    return text;
  }

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
        width: 410px;
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
        font-family: inherit;
        animation: notifDropdownFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .header-notif-dropdown[dir="rtl"] {
        direction: rtl;
        text-align: right;
      }
      .header-notif-dropdown[dir="ltr"] {
        direction: ltr;
        text-align: left;
      }
      body.rtl .header-notif-dropdown,
      [dir="rtl"] .header-notif-dropdown {
        left: 0;
        right: auto;
      }
      body:not(.rtl) .header-notif-dropdown,
      [dir="ltr"] .header-notif-dropdown {
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
        font-size: 11px;
        font-weight: 700;
        background: #eff6ff;
        color: #2563eb;
        border: 1px solid #bfdbfe;
        border-radius: 9999px;
        padding: 2px 8px;
      }
      [data-theme="dark"] .notif-header-badge,
      body.dark-mode .notif-header-badge {
        background: #1e3a8a;
        color: #93c5fd;
        border-color: #1e40af;
      }
      .notif-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .notif-action-btn {
        background: transparent;
        border: 1px solid #e2e8f0;
        color: #64748b;
        font-size: 11.5px;
        font-weight: 600;
        padding: 4px 8px;
        border-radius: 8px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        transition: all 0.15s ease;
      }
      .notif-action-btn:hover {
        background: #ffffff;
        color: #0f172a;
        border-color: #cbd5e1;
      }
      [data-theme="dark"] .notif-action-btn,
      body.dark-mode .notif-action-btn {
        border-color: #334155;
        color: #94a3b8;
      }
      [data-theme="dark"] .notif-action-btn:hover,
      body.dark-mode .notif-action-btn:hover {
        background: #1e293b;
        color: #f8fafc;
        border-color: #475569;
      }
      .notif-filter-tabs {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 8px 12px;
        background: #ffffff;
        border-bottom: 1px solid #f1f5f9;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .notif-filter-tabs::-webkit-scrollbar {
        display: none;
      }
      [data-theme="dark"] .notif-filter-tabs,
      body.dark-mode .notif-filter-tabs {
        background: #1e293b;
        border-bottom-color: #334155;
      }
      .notif-filter-tab {
        background: transparent;
        border: none;
        color: #64748b;
        font-size: 11.5px;
        font-weight: 700;
        padding: 6px 10px;
        border-radius: 8px;
        cursor: pointer;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        transition: all 0.15s ease;
      }
      .notif-filter-tab:hover {
        background: #f1f5f9;
        color: #0f172a;
      }
      .notif-filter-tab.active {
        background: #fef3c7;
        color: #b45309;
      }
      [data-theme="dark"] .notif-filter-tab,
      body.dark-mode .notif-filter-tab {
        color: #94a3b8;
      }
      [data-theme="dark"] .notif-filter-tab:hover,
      body.dark-mode .notif-filter-tab:hover {
        background: #334155;
        color: #f8fafc;
      }
      [data-theme="dark"] .notif-filter-tab.active,
      body.dark-mode .notif-filter-tab.active {
        background: #78350f;
        color: #fef3c7;
      }
      .notif-list-container {
        flex: 1;
        overflow-y: auto;
        max-height: 380px;
        padding: 6px 0;
      }
      .notif-empty-state {
        padding: 36px 20px;
        text-align: center;
        color: #64748b;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      [data-theme="dark"] .notif-empty-state,
      body.dark-mode .notif-empty-state {
        color: #94a3b8;
      }
      .notif-item {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px 16px;
        border-bottom: 1px solid #f1f5f9;
        cursor: pointer;
        transition: background 0.15s ease;
        position: relative;
      }
      .notif-item:hover {
        background: #f8fafc;
      }
      .notif-item.is-unread {
        background: #fffbeb;
      }
      .notif-item.is-unread::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        width: 3.5px;
        background: #f59e0b;
      }
      .header-notif-dropdown[dir="rtl"] .notif-item.is-unread::before {
        right: 0;
      }
      .header-notif-dropdown[dir="ltr"] .notif-item.is-unread::before {
        left: 0;
      }
      [data-theme="dark"] .notif-item,
      body.dark-mode .notif-item {
        border-bottom-color: #334155;
      }
      [data-theme="dark"] .notif-item:hover,
      body.dark-mode .notif-item:hover {
        background: #334155;
      }
      [data-theme="dark"] .notif-item.is-unread,
      body.dark-mode .notif-item.is-unread {
        background: #451a03;
      }
      .notif-item-icon {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 14px;
      }
      .notif-item-icon.danger {
        background: #fee2e2;
        color: #ef4444;
      }
      .notif-item-icon.warning {
        background: #fef3c7;
        color: #f59e0b;
      }
      .notif-item-icon.info {
        background: #e0f2fe;
        color: #0284c7;
      }
      .notif-item-icon.success {
        background: #dcfce7;
        color: #16a34a;
      }
      [data-theme="dark"] .notif-item-icon.danger {
        background: #7f1d1d;
        color: #fca5a5;
      }
      [data-theme="dark"] .notif-item-icon.warning {
        background: #78350f;
        color: #fde68a;
      }
      [data-theme="dark"] .notif-item-icon.info {
        background: #075985;
        color: #7dd3fc;
      }
      .notif-item-content {
        flex: 1;
        min-width: 0;
      }
      .notif-item-title {
        font-size: 12.5px;
        font-weight: 700;
        color: #0f172a;
        line-height: 1.35;
        margin-bottom: 3px;
      }
      [data-theme="dark"] .notif-item-title,
      body.dark-mode .notif-item-title {
        color: #f8fafc;
      }
      .notif-item-desc {
        font-size: 11.5px;
        color: #64748b;
        line-height: 1.4;
        margin-bottom: 6px;
      }
      [data-theme="dark"] .notif-item-desc,
      body.dark-mode .notif-item-desc {
        color: #94a3b8;
      }
      .notif-item-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .notif-item-badge {
        font-size: 10px;
        font-weight: 700;
        padding: 1.5px 6px;
        border-radius: 6px;
        display: inline-block;
      }
      .notif-item-badge.danger {
        background: #fee2e2;
        color: #b91c1c;
      }
      .notif-item-badge.warning {
        background: #fef3c7;
        color: #92400e;
      }
      .notif-item-badge.info {
        background: #e0f2fe;
        color: #0369a1;
      }
      [data-theme="dark"] .notif-item-badge.danger {
        background: #991b1b;
        color: #fee2e2;
      }
      [data-theme="dark"] .notif-item-badge.warning {
        background: #92400e;
        color: #fef3c7;
      }
      [data-theme="dark"] .notif-item-badge.info {
        background: #0369a1;
        color: #e0f2fe;
      }
      .notif-item-check-btn {
        background: transparent;
        border: none;
        padding: 4px;
        cursor: pointer;
        color: #94a3b8;
        font-size: 12px;
        border-radius: 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s ease;
      }
      .notif-item-check-btn:hover {
        color: #10b981;
      }
      .notif-footer {
        padding: 10px 16px;
        border-top: 1px solid #e2e8f0;
        background: #f8fafc;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        font-weight: 700;
      }
      [data-theme="dark"] .notif-footer,
      body.dark-mode .notif-footer {
        background: #0f172a;
        border-top-color: #334155;
      }
      .notif-footer a {
        color: #2563eb;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        transition: color 0.15s ease;
      }
      .notif-footer a:hover {
        color: #1d4ed8;
        text-decoration: underline;
      }
      [data-theme="dark"] .notif-footer a {
        color: #60a5fa;
      }
      [data-theme="dark"] .notif-footer a:hover {
        color: #93c5fd;
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
    var lang = getAppLang();

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
        var tName = t.title || t.reference || _t('default_tender');

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
                title: _t('tender_overdue_title', { name: tName }),
                desc: _t('tender_overdue_desc', { date: deadlineStr, days: Math.abs(diffDays) }),
                badgeText: _t('badge_expired'),
                targetUrl: 'modules/consulting/consulting_tenders_management.html',
                isRead: !!readMap['tender_overdue_' + tenderId]
              });
            } else if (diffDays === 0) {
              notifs.push({
                id: 'tender_today_' + tenderId,
                category: 'tenders',
                level: 'danger',
                icon: 'fas fa-stopwatch',
                title: _t('tender_today_title', { name: tName }),
                desc: _t('tender_today_desc'),
                badgeText: _t('badge_today'),
                targetUrl: 'modules/consulting/consulting_tenders_management.html',
                isRead: !!readMap['tender_today_' + tenderId]
              });
            } else if (diffDays <= 3) {
              notifs.push({
                id: 'tender_soon_' + tenderId,
                category: 'tenders',
                level: 'danger',
                icon: 'fas fa-hourglass-half',
                title: _t('tender_soon_title', { name: tName, days: diffDays }),
                desc: _t('tender_soon_desc', { date: deadlineStr }),
                badgeText: _t('badge_days_left', { days: diffDays }),
                targetUrl: 'modules/consulting/consulting_tenders_management.html',
                isRead: !!readMap['tender_soon_' + tenderId]
              });
            } else if (diffDays <= 7) {
              notifs.push({
                id: 'tender_warning_' + tenderId,
                category: 'tenders',
                level: 'warning',
                icon: 'fas fa-clock',
                title: _t('tender_warning_title', { name: tName }),
                desc: _t('tender_warning_desc', { date: deadlineStr, days: diffDays }),
                badgeText: _t('badge_days_left', { days: diffDays }),
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
              title: _t('caution_title', { type: c.type || _t('default_caution_type'), bank: c.bank || _t('default_bank') }),
              desc: (cDiff <= 0 ? _t('caution_expired_desc', { name: tName }) : _t('caution_soon_desc', { days: cDiff, name: tName })),
              badgeText: cDiff <= 0 ? _t('badge_expired') : _t('badge_days_left', { days: cDiff }),
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
        var pName = p.name || p.designation || p.title || ('#' + pId);

        if (stock <= 0) {
          var nId = 'stock_out_' + pId;
          notifs.push({
            id: nId,
            category: 'stock',
            level: 'danger',
            icon: 'fas fa-box-open',
            title: _t('stock_out_title', { name: pName }),
            desc: _t('stock_out_desc', { unit: p.unit || _t('unit_default') }),
            badgeText: _t('badge_stock_out'),
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
            title: _t('stock_low_title', { name: pName }),
            desc: _t('stock_low_desc', { stock: stock, unit: p.unit || _t('unit_default'), min: minStock }),
            badgeText: _t('badge_stock_low'),
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
        var invNum = inv.number || inv.invoiceNumber || inv.id || ('#' + invId);
        var clientName = (inv.customer && inv.customer.name) || inv.client || inv.customer || inv.clientName || _t('default_client');
        var status = String(inv.status || 'Unpaid').toLowerCase();
        var isPaid = ['paid', 'مدفوعة', 'payée', 'annulée', 'cancelled'].indexOf(status) !== -1;

        if (!isPaid && inv.dueDate) {
          var due = new Date(inv.dueDate);
          if (!isNaN(due.getTime())) {
            due.setHours(0, 0, 0, 0);
            var invDiff = Math.ceil((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
            if (invDiff > 0) {
              var nId3 = 'inv_overdue_' + invId;
              var locale = lang === 'ar' ? 'ar-DZ' : (lang === 'fr' ? 'fr-FR' : 'en-US');
              var totalStr = inv.total ? _t('invoice_amount_label', { amount: Number(inv.total).toLocaleString(locale) }) : '';
              notifs.push({
                id: nId3,
                category: 'invoices',
                level: 'danger',
                icon: 'fas fa-file-invoice-dollar',
                title: _t('invoice_overdue_title', { number: invNum, client: clientName }),
                desc: _t('invoice_overdue_desc', { days: invDiff, date: inv.dueDate, amount: totalStr }),
                badgeText: _t('badge_overdue_days', { days: invDiff }),
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
            var dzName = (dz.title || _t('default_dz_title')).slice(0, 48) + '...';
            notifs.push({
              id: dzId,
              category: 'portal',
              level: 'info',
              icon: 'fas fa-bullhorn',
              title: _t('dz_portal_title', { name: dzName }),
              desc: _t('dz_portal_desc', { client: dz.client || _t('default_dz_client'), wilaya: dz.wilaya || _t('default_dz_wilaya'), days: daysLeft }),
              badgeText: _t('badge_dz_portal', { days: daysLeft }),
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

    // Update button tooltip according to active language
    var btn = document.getElementById('headerNotificationsBtn');
    if (btn) {
      var lang = getAppLang();
      var baseTitle = _t('center_title');
      btn.setAttribute('title', unreadCount > 0 ? (baseTitle + ' (' + unreadCount + ')') : baseTitle);
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

    var lang = getAppLang();
    var isAr = lang === 'ar';
    dropdown.setAttribute('dir', isAr ? 'rtl' : 'ltr');
    dropdown.setAttribute('lang', lang);

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
          <span>${_t('center_title')}</span>
          <span class="notif-header-badge">${_t('new_badge', { count: unreadCount })}</span>
        </div>
        <div class="notif-header-actions">
          <button class="notif-action-btn" type="button" onclick="window.ZeraldaNotifications.markAllRead()" title="${_t('mark_all_read')}">
            <i class="fas fa-check-double"></i>
            <span>${_t('mark_all')}</span>
          </button>
          <button class="notif-action-btn" type="button" onclick="window.ZeraldaNotifications.toggleSound()" title="${soundEnabled ? _t('mute_sound') : _t('unmute_sound')}">
            <i class="fas ${soundEnabled ? 'fa-volume-up' : 'fa-volume-mute'}" style="color:${soundEnabled ? '#10b981' : '#94a3b8'};"></i>
          </button>
          <button class="notif-action-btn" type="button" onclick="window.ZeraldaNotifications.refresh()" title="${_t('refresh')}">
            <i class="fas fa-sync-alt"></i>
          </button>
        </div>
      </div>

      <!-- Filter Tabs -->
      <div class="notif-filter-tabs">
        <button class="notif-filter-tab ${activeFilter === 'all' ? 'active' : ''}" type="button" onclick="window.ZeraldaNotifications.setFilter('all')">
          <span>${_t('tab_all')}</span>
          <span>(${countAll})</span>
        </button>
        <button class="notif-filter-tab ${activeFilter === 'tenders' ? 'active' : ''}" type="button" onclick="window.ZeraldaNotifications.setFilter('tenders')">
          <i class="fas fa-file-contract"></i>
          <span>${_t('tab_tenders')}</span>
          <span>(${countTenders})</span>
        </button>
        <button class="notif-filter-tab ${activeFilter === 'stock' ? 'active' : ''}" type="button" onclick="window.ZeraldaNotifications.setFilter('stock')">
          <i class="fas fa-boxes"></i>
          <span>${_t('tab_stock')}</span>
          <span>(${countStock})</span>
        </button>
        <button class="notif-filter-tab ${activeFilter === 'invoices' ? 'active' : ''}" type="button" onclick="window.ZeraldaNotifications.setFilter('invoices')">
          <i class="fas fa-file-invoice-dollar"></i>
          <span>${_t('tab_invoices')}</span>
          <span>(${countInvoices})</span>
        </button>
        <button class="notif-filter-tab ${activeFilter === 'portal' ? 'active' : ''}" type="button" onclick="window.ZeraldaNotifications.setFilter('portal')">
          <i class="fas fa-bullhorn"></i>
          <span>${_t('tab_portal')}</span>
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
          <div style="font-weight:700;font-size:13px;color:#0f172a;">${_t('empty_title')}</div>
          <div style="font-size:11.5px;max-width:280px;line-height:1.4;">${_t('empty_desc')}</div>
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
                <button class="notif-item-check-btn" type="button" title="${item.isRead ? _t('read') : _t('mark_read')}" onclick="event.stopPropagation(); window.ZeraldaNotifications.toggleItemRead('${item.id}');">
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
          <span>${_t('manage_tenders')}</span>
        </a>
        <a href="pages/settings.html#notifications">
          <i class="fas fa-cog"></i>
          <span>${_t('notif_settings')}</span>
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

  // ── Reactive Language and Company Switch Listeners ──
  document.addEventListener('layoutLanguageChanged', function () {
    refresh(true);
  });
  window.addEventListener('languageChanged', function () {
    refresh(true);
  });
  window.addEventListener('activeCompanyChanged', function () {
    refresh(true);
  });
  if (window.UnifiedI18N && typeof window.UnifiedI18N.onLanguageChange === 'function') {
    try {
      window.UnifiedI18N.onLanguageChange(function () {
        refresh(true);
      });
    } catch (_) {}
  }

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
    playChime: playNotificationChime,
    t: _t
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
