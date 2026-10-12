/**
 * Zeralda ERP — AI Chat Widget v3
 * مساعد ذكي مطور: محادثة + إنترنت + بيانات الشركة + أدوات سريعة
 */

// ── Shared module map (canonical source) ──
// Defined here so all HTML pages get it without needing a separate <script> include.
// server.py has an identical MODULE_MAP dict — keep in sync.
window.MODULE_KEY_MAP = window.MODULE_KEY_MAP || {
    'customers': 'customers-data', 'clients': 'customers-data', 'client': 'customers-data', 'customer': 'customers-data',
    'suppliers': 'suppliers-data', 'fournisseurs': 'suppliers-data', 'supplier': 'suppliers-data', 'fournisseur': 'suppliers-data',
    'employees': 'employees-data', 'personnel': 'employees-data', 'employee': 'employees-data',
    'products': 'products-data', 'produits': 'products-data', 'product': 'products-data', 'produit': 'products-data',
    'invoices': 'invoices-data', 'factures': 'invoices-data', 'invoice': 'invoices-data', 'facture': 'invoices-data',
    'proformas': 'proformas-data', 'proforma': 'proformas-data',
    'tenders': 'tenders-data', 'tender': 'tenders-data',
    'consultations': 'consultations-data', 'consultation': 'consultations-data',
    'leaves': 'hr-leaves', 'leave': 'hr-leaves',
    'transactions': 'finance-transactions', 'transaction': 'finance-transactions',
    'services': 'zeralda-services', 'service': 'zeralda-services'
};

(function () {
    'use strict';

    function _chatKey(suffix) {
        var cid = 'default-company';
        try {
            if (window.CompanyStorage && window.CompanyStorage.getActiveCompanyId) {
                cid = window.CompanyStorage.getActiveCompanyId() || 'default-company';
            } else {
                cid = JSON.parse(ZS.getItem('zeralda-settings') || '{}').activeCompanyId || 'default-company';
            }
        } catch (e) {}
        return 'zeralda-ai-chat-' + suffix + '::' + cid;
    }
    function CHAT_HISTORY_KEY() { return _chatKey('history'); }
    function CHAT_SESSIONS_KEY() { return _chatKey('sessions'); }
    function CHAT_CURRENT_SESSION_KEY() { return _chatKey('current'); }
    function CHAT_MODE_KEY() { return _chatKey('mode'); }
    var ENABLE_CHAT_PERSISTENCE = true;
    var MAX_HISTORY = 60;
    var MAX_PERSIST = 30;
    var _currentSessionId = null;

    var _messages = [];
    var _open = false;
    var _loading = false;
    var _currentAbortController = null; // AbortController for the current request (stop button)
    var _mode = 'chat';
    var _lastRequest = null;
    var _pendingFile = null;
    var _pendingFileQueue = [];
    var _requireConfirmExtraction = false; // when true, module_append from file extraction requires user confirmation

    var DATA_KEYS = [
        'employees-data',
        'payroll-data',
        'products-data',
        'inventory-categories',
        'stock-movements',
        'customers-data',
        'invoices-data',
        'proformas-data',
        'suppliers-data',
        'purchases-data',
        'purchase-orders-data',
        'consultations-data',
        'tenders-data',
        'zeralda-services',
        'zeralda-services-master',
        'crm-opportunities',
        'crm-contacts',
        'finance-transactions',
        'accounting-entries',
        'sales-data',
        'hr-leaves',
        'zeralda-system-settings',
        'zeralda-backup-history',
        'zeralda-integrations',
        'zeralda-module-settings'
    ];

    var DICT = {
        title: { en: 'AI Assistant', ar: 'المساعد الذكي', fr: 'Assistant IA' },
        subtitle: { en: 'Smart ERP Assistant', ar: 'مساعد ERP المتطور', fr: 'Assistant ERP intelligent' },
        modelName: { en: 'AI Assistant', ar: 'المساعد الذكي', fr: 'Assistant IA' },
        placeholder: { en: 'Ask me anything about the ERP...', ar: 'اسألني أي شيء عن النظام...', fr: 'Posez-moi une question ERP...' },
        webPlaceholder: { en: 'Search the web for current information...', ar: 'ابحث في الإنترنت عن معلومات حديثة...', fr: 'Rechercher des informations recentes sur le web...' },
        searchPlaceholder: { en: 'Search suppliers, products, employees...', ar: 'ابحث في الموردين، السلع، الموظفين...', fr: 'Rechercher fournisseurs, produits, employes...' },
        send: { en: 'Send', ar: 'إرسال', fr: 'Envoyer' },
        stop: { en: 'Stop', ar: 'إيقاف', fr: 'Arrêter' },
        newChat: { en: 'New chat', ar: 'محادثة جديدة', fr: 'Nouvelle discussion' },
        exportChat: { en: 'Export chat', ar: 'تصدير المحادثة', fr: 'Exporter le chat' },
        close: { en: 'Close', ar: 'إغلاق', fr: 'Fermer' },
        regenerate: { en: 'Retry last answer', ar: 'إعادة توليد آخر رد', fr: 'Relancer la derniere reponse' },
        thinking: { en: 'Thinking...', ar: 'جاري التفكير...', fr: 'Reflexion en cours...' },
        webThinking: { en: 'Searching the web...', ar: 'جاري البحث في الإنترنت...', fr: 'Recherche web en cours...' },
        searching: { en: 'Searching company data...', ar: 'جاري البحث في بيانات الشركة...', fr: 'Recherche des donnees entreprise...' },
        errorNet: { en: 'Network error. Is the server running?', ar: 'خطأ في الشبكة. هل الخادم يعمل؟', fr: 'Erreur reseau. Le serveur est-il demarre?' },
        errorKey: { en: 'AI provider not configured. Please set an API key in settings.', ar: 'مزود الذكاء الاصطناعي غير مضبوط. يرجى تعيين مفتاح API في الإعدادات.', fr: 'Fournisseur IA non configure. Veuillez definir une cle API dans les parametres.' },
        welcome: { en: 'Hello! I am your AI-powered ERP assistant. I can answer ERP questions, search the web, inspect company data, and execute ERP actions.', ar: 'مرحباً! أنا مساعد ERP المدعوم بالذكاء الاصطناعي. أستطيع الإجابة عن أسئلة النظام، والبحث في الإنترنت، وتحليل بيانات الشركة، وتنفيذ الإجراءات.', fr: 'Bonjour! Je suis votre assistant ERP propulse par IA. Je peux repondre aux questions ERP, rechercher sur le web, analyser les donnees de l\'entreprise et executer des actions.' },
        notConfigured: { en: 'AI provider not configured. Please set an API key in settings.', ar: 'مزود الذكاء الاصطناعي غير مضبوط. يرجى تعيين مفتاح API في الإعدادات.', fr: 'Fournisseur IA non configure. Veuillez definir une cle API dans les parametres.' },
        uploadFile: { en: 'Upload file', ar: 'تحميل ملف', fr: 'Telecharger fichier' },
        uploadingFile: { en: 'Uploading file...', ar: 'جاري تحميل الملف...', fr: 'Telechargement en cours...' },
        analyzeFile: { en: 'Analyze file', ar: 'تحليل الملف', fr: 'Analyser fichier' },
        fileAnalyzing: { en: 'Analyzing file...', ar: 'جاري تحليل الملف...', fr: 'Analyse en cours...' },
        fileAnalyzed: { en: 'File analyzed', ar: 'تم تحليل الملف', fr: 'Fichier analyse' },
        suggestedTitle: { en: 'Quick searches:', ar: 'بحث سريع:', fr: 'Recherches rapides:' },
        quickToolsTitle: { en: 'Smart tools', ar: 'أدوات ذكية', fr: 'Outils intelligents' },
        chip1: { en: 'List all suppliers', ar: 'عرض كل الموردين', fr: 'Lister les fournisseurs' },
        chip2: { en: 'Show low stock products', ar: 'سلع المخزون المنخفض', fr: 'Produits en rupture' },
        chip3: { en: 'Recent purchases', ar: 'آخر طلبات الشراء', fr: 'Derniers achats' },
        chip4: { en: 'Employee list', ar: 'قائمة الموظفين', fr: 'Liste des employes' },
        sourcesLabel: { en: 'Sources:', ar: 'المصادر:', fr: 'Sources :' },
        badgeWeb: { en: 'Web', ar: 'ويب', fr: 'Web' },
        badgeSearch: { en: 'Data', ar: 'بيانات', fr: 'Donnees' },
        badgeChat: { en: 'AI', ar: 'AI', fr: 'IA' },
        contextCompany: { en: 'Company', ar: 'الشركة', fr: 'Societe' },
        contextPage: { en: 'Page', ar: 'الصفحة', fr: 'Page' },
        contextMode: { en: 'Mode', ar: 'الوضع', fr: 'Mode' },
        copy: { en: 'Copy', ar: 'نسخ', fr: 'Copier' },
        copied: { en: 'Copied', ar: 'تم النسخ', fr: 'Copie' },
        exportEmpty: { en: 'No conversation to export yet.', ar: 'لا توجد محادثة لتصديرها حالياً.', fr: 'Aucune conversation a exporter.' },
        regenerateEmpty: { en: 'No previous request to retry yet.', ar: 'لا يوجد طلب سابق لإعادة توليده.', fr: 'Aucune requete precedente a relancer.' },
        toolSummarizePage: { en: 'Summarize page', ar: 'تلخيص الصفحة', fr: 'Resumer la page' },
        toolExplainPage: { en: 'Explain page', ar: 'شرح الصفحة', fr: 'Expliquer la page' },
        toolNextSteps: { en: 'Next steps', ar: 'الخطوات التالية', fr: 'Prochaines etapes' },
        toolDraftReport: { en: 'Draft report', ar: 'صياغة تقرير', fr: 'Rediger rapport' },
        toolMarketUpdate: { en: 'Market update', ar: 'مستجدات السوق', fr: 'Actualites marche' },
        toolResearchTopic: { en: 'Research topic', ar: 'بحث الموضوع', fr: 'Etudier le sujet' },
        toolCompareOptions: { en: 'Compare options', ar: 'مقارنة الخيارات', fr: 'Comparer options' },
        toolFindRegulations: { en: 'Find regulations', ar: 'البحث عن القوانين', fr: 'Trouver regles' },
        toolCompanySnapshot: { en: 'Company snapshot', ar: 'ملخص الشركة', fr: 'Vue societe' },
        toolLowStock: { en: 'Low stock', ar: 'المخزون المنخفض', fr: 'Stock faible' },
        toolSuppliers: { en: 'Suppliers', ar: 'الموردون', fr: 'Fournisseurs' },
        toolEmployees: { en: 'Employees', ar: 'الموظفون', fr: 'Employes' },
        toolSalesAnalysis: { en: 'Sales analysis', ar: 'تحليل المبيعات', fr: 'Analyse ventes' },
        toolPriceSuggest: { en: 'Suggest prices', ar: 'اقتراح الأسعار', fr: 'Sugg. prix' },
        toolPaymentTracking: { en: 'Payment tracking', ar: 'تتبع المدفوعات', fr: 'Suivi paiements' },
        toolFinancialHealth: { en: 'Financial health', ar: 'الصحة المالية', fr: 'Sante financiere' },
        toolAddProduct: { en: 'Add product', ar: 'إضافة منتج', fr: 'Ajouter produit' },
        toolAddSupplier: { en: 'Add supplier', ar: 'إضافة مورد', fr: 'Ajouter fournisseur' },
        toolAddCustomer: { en: 'Add customer', ar: 'إضافة عميل', fr: 'Ajouter client' },
        toolAddEmployee: { en: 'Add employee', ar: 'إضافة موظف', fr: 'Ajouter employe' },
        toolCreateInvoice: { en: 'Create invoice', ar: 'إنشاء فاتورة', fr: 'Creer facture' },
        toolCreatePO: { en: 'Create purchase order', ar: 'إنشاء طلب شراء', fr: 'Creer bon cmd' },
        toolInventoryReport: { en: 'Inventory report', ar: 'تقرير المخزون', fr: 'Rapport stock' },
        toolTopProducts: { en: 'Top products', ar: 'المنتجات الأكثر مبيعاً', fr: 'Top produits' },
        toolReorderAlert: { en: 'Reorder alert', ar: 'تنبيه إعادة الطلب', fr: 'Alerte reorder' },
        toolProfitMargin: { en: 'Profit margins', ar: 'هوامش الربح', fr: 'Marges benef' },
        toolDataCleanup: { en: 'Data cleanup', ar: 'تنظيف البيانات', fr: 'Nettoyage donnees' },
        toolDuplicateCheck: { en: 'Find duplicates', ar: 'البحث عن المكررات', fr: 'Doublons' },
        toolImportCustomers: { en: 'Import customers from file', ar: 'استيراد عملاء من ملف', fr: 'Importer clients depuis fichier' },
        toolImportSuppliers: { en: 'Import suppliers from file', ar: 'استيراد موردين من ملف', fr: 'Importer fournisseurs depuis fichier' },
        toolImportProducts: { en: 'Import products from file', ar: 'استيراد منتجات من ملف', fr: 'Importer produits depuis fichier' },
        toolImportEmployees: { en: 'Import employees from file', ar: 'استيراد موظفين من ملف', fr: 'Importer employes depuis fichier' },
        toolImportInvoices: { en: 'Import invoices from file', ar: 'استيراد فواتير من ملف', fr: 'Importer factures depuis fichier' },
        toolImportPurchases: { en: 'Import purchase bills from file', ar: 'استيراد فواتير شراء من ملف', fr: 'Importer factures d\'achat depuis fichier' },
        toolImportFileData: { en: 'Extract data from file', ar: 'استخراج بيانات من ملف', fr: 'Extraire donnees du fichier' },
        toolImportCompany: { en: 'New company from file', ar: 'شركة جديدة من ملف', fr: 'Nouvelle entreprise depuis fichier' },
        toolCategoryTools: { en: 'Quick actions', ar: 'إجراءات سريعة', fr: 'Actions rapides' },
        toolCategoryAnalysis: { en: 'Analysis', ar: 'تحليل', fr: 'Analyse' },
        toolCategoryContext: { en: 'Page tools', ar: 'أدوات الصفحة', fr: 'Outils page' },
        toolCategoryFileImport: { en: 'File import', ar: 'استيراد من ملف', fr: 'Import fichier' },
        modeChat: { en: 'General chat', ar: 'محادثة عامة', fr: 'Chat general' },
        modeWeb: { en: 'Web search', ar: 'بحث في الإنترنت', fr: 'Recherche web' },
        modeSearch: { en: 'Company data', ar: 'بيانات الشركة', fr: 'Donnees societe' },
        modeChatShort: { en: 'Chat', ar: 'دردشة', fr: 'Chat' },
        modeWebShort: { en: 'Web', ar: 'ويب', fr: 'Web' },
        modeSearchShort: { en: 'Data', ar: 'بيانات', fr: 'Donnees' }
    };

    function getLang() {
        // FIX: guard against ZS not being defined yet
        var stored = '';
        if (typeof ZS !== 'undefined' && ZS && ZS.getItem) {
            try { stored = (ZS.getItem('preferred-language') || ZS.getItem('language') || ''); } catch(e) {}
        }
        stored = (stored || '').substring(0, 2);
        if (stored === 'ar' || stored === 'fr' || stored === 'en') return stored;
        // Try zeralda-settings.preferredLanguage as fallback
        if (typeof ZS !== 'undefined' && ZS && ZS.getItem) {
            try {
                var raw = ZS.getItem('zeralda-settings');
                if (raw) {
                    var s = JSON.parse(raw);
                    if (s && s.preferredLanguage) {
                        var pl = String(s.preferredLanguage).substring(0, 2);
                        if (pl === 'ar' || pl === 'fr' || pl === 'en') return pl;
                    }
                }
            } catch(e) {}
        }
        // Last resort: check document lang attribute, default to 'en'
        var docLang = (document.documentElement.lang || '').substring(0, 2);
        if (docLang === 'ar' || docLang === 'fr') return docLang;
        return 'en';
    }

    var t = window.createRuntimeTranslator ? window.createRuntimeTranslator(DICT) : function(k) { return k; };

    function _collectLocalData() {
        var result = {};
        DATA_KEYS.forEach(function (k) {
            try {
                var raw = ZS.getItem(k);
                if (raw) result[k] = JSON.parse(raw);
            } catch (e) {}
        });

        // Extract companies, users, roles from zeralda-settings (canonical source)
        // RADICAL FIX: zeralda-settings is the unified source — no more dual storage.
        try {
            var sysRaw = ZS.getItem('zeralda-settings');
            if (sysRaw) {
                var sys = JSON.parse(sysRaw);
                if (Array.isArray(sys.companies) && sys.companies.length)
                    result['zeralda-companies'] = sys.companies;
                if (Array.isArray(sys.users) && sys.users.length)
                    result['zeralda-users'] = sys.users.map(function(u) {
                        return { id: u.id, fullName: u.fullName, email: u.email,
                                 roleId: u.roleId, active: u.active, createdAt: u.createdAt };
                    });
                if (Array.isArray(sys.roles) && sys.roles.length)
                    result['zeralda-roles'] = sys.roles;
                if (sys.activeCompanyId)
                    result['zeralda-active-company-id'] = sys.activeCompanyId;
            }
        } catch (e4) {}

        // Active company details
        try {
            var acRaw = ZS.getItem('zeralda-active-company');
            if (acRaw) result['zeralda-active-company'] = JSON.parse(acRaw);
        } catch (e5) {}

        // Company-scoped purchasing data
        try {
            var companyId = '';
            try {
                companyId = JSON.parse(ZS.getItem('zeralda-active-company') || '{}').id || '';
            } catch (e2) {}
            var purchKey = companyId ? 'zeralda-purchasing-data-' + companyId : 'zeralda-purchasing-data';
            var raw2 = ZS.getItem(purchKey);
            if (raw2) result['zeralda-purchasing-data'] = JSON.parse(raw2);
        } catch (e3) {}

        return result;
    }

    function _saveHistory() {
        if (!ENABLE_CHAT_PERSISTENCE) return;
        try {
            var toSave = _messages.slice(-MAX_PERSIST).map(function (m) {
                return {
                    role: m.role,
                    content: m.content,
                    time: m.time,
                    isSearch: m.isSearch || false,
                    badgeText: m.badgeText || ''
                };
            });
            ZS.setItem(CHAT_HISTORY_KEY(), JSON.stringify(toSave));
        } catch (e) {}
        _saveCurrentSession();
    }

    function _loadHistory() {
        if (!ENABLE_CHAT_PERSISTENCE) return [];
        try {
            var raw = ZS.getItem(CHAT_HISTORY_KEY());
            if (!raw) return [];
            return JSON.parse(raw) || [];
        } catch (e) {
            return [];
        }
    }

    /* ── Session management ─────────────────────────────────────────────── */
    function _genSessionId() {
        return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    }

    function _getSessionTitle(msgs) {
        for (var i = 0; i < msgs.length; i++) {
            if (msgs[i].role === 'user') {
                var s = String(msgs[i].content || '').trim().replace(/\n/g, ' ');
                return s.length > 40 ? s.slice(0, 40) + '…' : s;
            }
        }
        return getLang() === 'ar' ? 'محادثة جديدة' : 'New conversation';
    }

    function _loadSessions() {
        try { return JSON.parse(ZS.getItem(CHAT_SESSIONS_KEY()) || '[]'); } catch (e) { return []; }
    }

    function _saveSessions(sessions) {
        try { ZS.setItem(CHAT_SESSIONS_KEY(), JSON.stringify(sessions)); } catch (e) {}
    }

    function _saveCurrentSession() {
        if (!ENABLE_CHAT_PERSISTENCE || _messages.length === 0) return;
        if (!_currentSessionId) _currentSessionId = _genSessionId();
        var sessions = _loadSessions();
        var now = Date.now();
        var msgs = _messages.slice(-MAX_PERSIST).map(function (m) {
            return { role: m.role, content: m.content, time: m.time, isSearch: m.isSearch || false, badgeText: m.badgeText || '' };
        });
        var found = false;
        for (var i = 0; i < sessions.length; i++) {
            if (sessions[i].id === _currentSessionId) {
                sessions[i].messages = msgs;
                sessions[i].title = _getSessionTitle(_messages);
                sessions[i].updatedAt = now;
                found = true; break;
            }
        }
        if (!found) {
            sessions.unshift({ id: _currentSessionId, title: _getSessionTitle(_messages), messages: msgs, createdAt: now, updatedAt: now });
        }
        if (sessions.length > 60) sessions = sessions.slice(0, 60);
        _saveSessions(sessions);
        try { ZS.setItem(CHAT_CURRENT_SESSION_KEY(), _currentSessionId); } catch (e) {}
        _renderSessionsList();
    }

    function _switchToSession(id) {
        var sessions = _loadSessions();
        for (var i = 0; i < sessions.length; i++) {
            if (sessions[i].id === id) {
                _currentSessionId = id;
                _messages = (sessions[i].messages || []).slice();
                var container = document.getElementById('ai-chat-messages');
                if (container) container.innerHTML = '';
                _messages.forEach(function (m) {
                    _renderMessage(m.role, m.content, m.isSearch || false, m.time, true, m.badgeText || '');
                });
                scrollToBottom();
                try { ZS.setItem(CHAT_CURRENT_SESSION_KEY(), id); } catch (e) {}
                _renderSessionsList();
                return;
            }
        }
    }

    function _deleteSession(id) {
        var sessions = _loadSessions().filter(function (s) { return s.id !== id; });
        _saveSessions(sessions);
        if (_currentSessionId === id) {
            _currentSessionId = null;
            _messages = [];
            try { ZS.removeItem(CHAT_CURRENT_SESSION_KEY()); } catch (e) {}
            var container = document.getElementById('ai-chat-messages');
            if (container) container.innerHTML = '';
            if (sessions.length > 0) { _switchToSession(sessions[0].id); return; }
            else { showWelcome(); }
        }
        _renderSessionsList();
    }

    function _formatSessionDate(ts) {
        if (!ts) return '';
        var diff = Date.now() - ts;
        var d = new Date(ts);
        if (diff < 60000) return getLang() === 'ar' ? 'الآن' : 'now';
        if (diff < 3600000) return Math.floor(diff / 60000) + (getLang() === 'ar' ? 'د' : 'm');
        if (diff < 86400000) return Math.floor(diff / 3600000) + (getLang() === 'ar' ? 'س' : 'h');
        if (diff < 604800000) return Math.floor(diff / 86400000) + (getLang() === 'ar' ? 'ي' : 'd');
        return d.toLocaleDateString(getLang() === 'ar' ? 'ar' : 'en', { month: 'short', day: 'numeric' });
    }

    function _renderSessionsList() {
        var listEl = document.getElementById('ai-sessions-list');
        if (!listEl) return;
        var sessions = _loadSessions();
        listEl.innerHTML = '';
        if (sessions.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'ai-sessions-empty';
            empty.textContent = getLang() === 'ar' ? 'لا توجد محادثات سابقة' : 'No conversations yet';
            listEl.appendChild(empty); return;
        }
        sessions.forEach(function (sess) {
            var item = document.createElement('div');
            item.className = 'ai-session-item' + (sess.id === _currentSessionId ? ' active' : '');
            var icon = document.createElement('i');
            icon.className = 'fas fa-comment-dots';
            var info = document.createElement('div');
            info.className = 'ai-session-info';
            var titleEl = document.createElement('div');
            titleEl.className = 'ai-session-title';
            titleEl.textContent = sess.title || (getLang() === 'ar' ? 'محادثة' : 'Chat');
            var dateEl = document.createElement('div');
            dateEl.className = 'ai-session-date';
            dateEl.textContent = _formatSessionDate(sess.updatedAt || sess.createdAt);
            var delBtn = document.createElement('button');
            delBtn.className = 'ai-session-del';
            delBtn.innerHTML = '<i class="fas fa-trash-can"></i>';
            delBtn.title = getLang() === 'ar' ? 'حذف' : 'Delete';
            (function (sid) {
                delBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var msg = getLang() === 'ar' ? 'حذف هذه المحادثة؟' : 'Delete this conversation?';
                    if (window.confirm(msg)) _deleteSession(sid);
                });
                item.addEventListener('click', function () { _switchToSession(sid); });
            }(sess.id));
            info.appendChild(titleEl); info.appendChild(dateEl);
            item.appendChild(icon); item.appendChild(info); item.appendChild(delBtn);
            listEl.appendChild(item);
        });
    }
    /* ── End session management ──────────────────────────────────────────── */

    function _authHeaders() {
        if (window.ZeraldaAuth) {
            return window.ZeraldaAuth.buildAuthHeaders({ 'Content-Type': 'application/json' });
        }
        var token = ZS.getItem('zeralda-auth-token') ||
            ZS.getItem('zeralda-session-token') || '';
        var headers = { 'Content-Type': 'application/json' };
        if (token) { headers.Authorization = 'Bearer ' + token; headers['X-Session-Token'] = token; }
        return headers;
    }

    function injectStyles() {
        var scriptPath = (function () {
            var scripts = document.getElementsByTagName('script');
            for (var i = 0; i < scripts.length; i++) {
                var src = scripts[i].src || '';
                if (src.indexOf('ai_chat_widget.js') !== -1) return src.substring(0, src.lastIndexOf('/'));
            }
            return '';
        })();
        var cssHref = (scriptPath ? scriptPath + '/../styles/ai_chat_widget.css' : 'styles/ai_chat_widget.css') + '?v=20260805a';
        var existing = document.getElementById('ai-chat-widget-styles');
        if (existing) {
            /* FIX: always force-update the CSS href so new versions load
             * (was checking for the OLD version string, preventing updates). */
            existing.href = cssHref;
            return;
        }
        var link = document.createElement('link');
        link.id = 'ai-chat-widget-styles';
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = cssHref;
        document.head.appendChild(link);
    }

    function buildWidget() {
        /* Guard against double-initialization (e.g. if script is included twice) */
        if (document.getElementById('ai-chat-panel')) {
            console.log('[AI Chat] Widget already initialized — skipping buildWidget');
            return;
        }
        /* ── FAB button ── */
        var fab = document.createElement('button');
        fab.id = 'ai-chat-fab';
        fab.title = t('title');
        fab.innerHTML = '<i class="fas fa-robot"></i><span class="ai-fab-badge" id="ai-fab-badge"></span>';
        fab.addEventListener('click', togglePanel);

        /* ── Full-screen panel ── */
        var panel = document.createElement('div');
        panel.id = 'ai-chat-panel';
        panel.className = 'hidden';
        panel.innerHTML =
            /* HEADER */
            '<div class="ai-chat-header">' +
            '  <div class="ai-chat-header-left">' +
            '    <div class="ai-chat-header-icon"><i class="fas fa-robot"></i></div>' +
            '    <div>' +
            '      <div class="ai-chat-title"></div>' +
            '      <div class="ai-chat-subtitle"></div>' +
            '    </div>' +
            '  </div>' +
            '  <div class="ai-mode-tabs">' +
            '    <button class="ai-mode-tab active" data-mode="chat"><i class="fas fa-comments"></i><span class="tab-lbl-text tab-chat-lbl"></span></button>' +
            '    <button class="ai-mode-tab" data-mode="web"><i class="fas fa-globe"></i><span class="tab-lbl-text tab-web-lbl"></span></button>' +
            '    <button class="ai-mode-tab" data-mode="search"><i class="fas fa-database"></i><span class="tab-lbl-text tab-search-lbl"></span></button>' +
            '  </div>' +
            '  <div class="ai-header-btns">' +
            '    <button id="ai-chat-new-btn" title=""><i class="fas fa-pen-to-square"></i></button>' +
            '    <button id="ai-chat-retry-btn" title=""><i class="fas fa-rotate-right"></i></button>' +
            '    <button id="ai-chat-settings-btn" title="Settings"><i class="fas fa-cog"></i></button>' +
            '    <button id="ai-chat-close-btn" title=""><i class="fas fa-xmark"></i></button>' +
            '  </div>' +
            '</div>' +
            /* SETTINGS MODAL */
            '<div id="ai-settings-modal" class="ai-settings-modal hidden">' +
            '  <div class="ai-settings-modal-backdrop"></div>' +
            '  <div class="ai-settings-modal-card">' +
            '    <div class="ai-settings-modal-header">' +
            '      <span data-en="AI Settings" data-ar="إعدادات الذكاء الاصطناعي" data-fr="Paramètres IA">AI Settings</span>' +
            '      <button id="ai-settings-close-btn"><i class="fas fa-xmark"></i></button>' +
            '    </div>' +
            '    <iframe id="ai-settings-frame" src="/settings.html?v=20260731g#ai"></iframe>' +
            '  </div>' +
            '</div>' +
            /* BODY */
            '<div class="ai-chat-body">' +
            /* SIDEBAR */
            '  <aside class="ai-chat-sidebar">' +
            '    <div class="ai-sessions-header">' +
            '      <span class="ai-sessions-label" id="ai-sessions-label"></span>' +
            '      <button class="ai-sessions-new-btn" id="ai-sessions-new-btn" title=""><i class="fas fa-pen-to-square"></i></button>' +
            '    </div>' +
            '    <div class="ai-sessions-list" id="ai-sessions-list"></div>' +
            '    <div class="ai-tools-bar" id="ai-tools-bar"></div>' +
            '  </aside>' +
            /* MAIN */
            '  <div class="ai-chat-main">' +
            '    <div class="ai-chat-messages" id="ai-chat-messages"></div>' +
            '    <div class="ai-chat-input-area">' +
            '      <div id="ai-file-upload-zone" class="ai-file-upload-zone">' +
            '        <i class="fas fa-paperclip" style="color:#2563eb;font-size:16px;flex-shrink:0;"></i>' +
            '        <div class="ai-file-name" id="ai-selected-file-name"></div>' +
            '        <span style="font-size:11px;color:#6b7280;margin-left:auto;white-space:nowrap;" id="ai-file-hint"></span>' +
            '        <button id="ai-file-clear-btn" type="button" style="padding:4px 9px;border-radius:6px;border:1px solid #bfdbfe;background:#fff;color:#6b7280;font-size:13px;cursor:pointer;flex-shrink:0;" title="Remove file">&times;</button>' +
            '      </div>' +
            '      <div class="ai-chat-input-row">' +
            '        <input type="file" id="ai-file-input" accept="image/*,application/pdf,.xlsx,.xls,.docx,.doc,.txt" style="display:none;" multiple>' +
            '        <label id="ai-chat-upload-btn" for="ai-file-input" style="cursor:pointer;"><i class="fas fa-paperclip"></i></label>' +
            '        <textarea id="ai-chat-input" rows="1"></textarea>' +
            '        <button id="ai-chat-send-btn"><i class="fas fa-paper-plane"></i></button>' +
            '        <button id="ai-chat-stop-btn" style="display:none;"><i class="fas fa-stop"></i></button>' +
            '      </div>' +
            '      <div class="ai-input-hint">' +
            '        <span id="ai-hint-text"></span>' +
            '        <span id="ai-char-count">0</span>' +
            '      </div>' +
            '    </div>' +
            '  </div>' +
            '</div>';

        document.body.appendChild(fab);
        document.body.appendChild(panel);

        /* ── Text labels ── */
        panel.querySelector('.ai-chat-title').textContent = t('title');
        panel.querySelector('.ai-chat-subtitle').textContent = t('subtitle');
        panel.querySelector('.tab-chat-lbl').textContent = t('modeChat');
        panel.querySelector('.tab-web-lbl').textContent = t('modeWeb');
        panel.querySelector('.tab-search-lbl').textContent = t('modeSearch');

        panel.querySelector('#ai-chat-input').placeholder = t('placeholder');
        panel.querySelector('#ai-chat-send-btn').title = t('send');
        panel.querySelector('#ai-chat-stop-btn').title = t('stop');
        panel.querySelector('#ai-chat-new-btn').title = t('newChat');
        panel.querySelector('#ai-chat-retry-btn').title = t('regenerate');
        panel.querySelector('#ai-chat-close-btn').title = t('close');

        var hintEl = panel.querySelector('#ai-hint-text');
        if (hintEl) hintEl.textContent = (getLang() === 'ar') ? 'Enter للإرسال، Shift+Enter لسطر جديد' : 'Enter to send, Shift+Enter for new line';

        /* ── Mode tabs ── */
        panel.querySelectorAll('.ai-mode-tab').forEach(function (btn) {
            btn.addEventListener('click', function () { setMode(btn.dataset.mode); });
        });

        /* ── Header buttons ── */
        panel.querySelector('#ai-chat-close-btn').addEventListener('click', closePanel);
        panel.querySelector('#ai-chat-new-btn').addEventListener('click', clearChat);
        panel.querySelector('#ai-chat-retry-btn').addEventListener('click', regenerateLastAnswer);
        panel.querySelector('#ai-chat-send-btn').addEventListener('click', sendMessage);
        panel.querySelector('#ai-chat-stop-btn').addEventListener('click', stopChat);
        panel.querySelector('#ai-chat-settings-btn').addEventListener('click', toggleSettings);
        panel.querySelector('#ai-settings-close-btn').addEventListener('click', toggleSettings);

        /* ── Input textarea ── */
        var input = document.getElementById('ai-chat-input');
        var charCount = document.getElementById('ai-char-count');
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });
        input.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 130) + 'px';
            if (charCount) charCount.textContent = this.value.length;
        });

        /* ── File upload ── */
        // FIX P0: validate file size and type before accepting uploads.
        // Previously any file type/size was accepted, allowing DoS via huge
        // files or malicious file uploads.
        var _MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
        var _ALLOWED_MIME_TYPES = [
            'application/pdf',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'text/csv',
            'text/plain',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp'
        ];
        var fileInput = document.getElementById('ai-file-input');
        fileInput.addEventListener('change', function () {
            if (this.files.length) {
                var arr = [];
                for (var fi = 0; fi < this.files.length; fi++) {
                    var file = this.files[fi];
                    if (file.size > _MAX_FILE_SIZE) {
                        alert((isAr ? 'الملف كبير جداً: ' : 'File too large: ') + file.name +
                              ' (' + (file.size / 1024 / 1024).toFixed(1) + 'MB > 10MB)');
                        continue;
                    }
                    if (_ALLOWED_MIME_TYPES.indexOf(file.type) === -1 && file.type !== '') {
                        // Allow empty type (some systems don't set it) but block known-bad types
                        if (file.type && file.type.indexOf('executable') !== -1 ||
                            file.type.indexOf('script') !== -1 || file.type.indexOf('bat') !== -1) {
                            alert((isAr ? 'نوع ملف غير مسموح: ' : 'Invalid file type: ') + file.name);
                            continue;
                        }
                    }
                    arr.push(file);
                }
                if (arr.length === 0) return;
                _pendingFileQueue = arr;
                _pendingFile = arr[0];
                _handleFileSelected(arr[0], arr.length);
            }
        });

        setupDragDrop();
        _buildToolsBar();
    }

    function setupDragDrop() {
        var panel = document.getElementById('ai-chat-panel');
        if (!panel) return;

        panel.addEventListener('dragover', function (e) {
            e.preventDefault();
            e.stopPropagation();
            document.getElementById('ai-file-upload-zone').classList.add('dragover');
        });

        panel.addEventListener('dragleave', function (e) {
            e.preventDefault();
            document.getElementById('ai-file-upload-zone').classList.remove('dragover');
        });

        panel.addEventListener('drop', function (e) {
            e.preventDefault();
            e.stopPropagation();
            document.getElementById('ai-file-upload-zone').classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                var arr = [];
                for (var di = 0; di < e.dataTransfer.files.length; di++) {
                    var dfile = e.dataTransfer.files[di];
                    if (dfile.size > _MAX_FILE_SIZE) {
                        alert((isAr ? 'الملف كبير جداً: ' : 'File too large: ') + dfile.name +
                              ' (' + (dfile.size / 1024 / 1024).toFixed(1) + 'MB > 10MB)');
                        continue;
                    }
                    arr.push(dfile);
                }
                if (arr.length === 0) return;
                _pendingFileQueue = arr;
                _pendingFile = arr[0];
                _handleFileSelected(arr[0], arr.length);
            }
        });
    }

    function _clearPendingFile() {
        _pendingFile = null;
        _pendingFileQueue = [];
        var uploadZone = document.getElementById('ai-file-upload-zone');
        if (uploadZone) uploadZone.classList.remove('visible');
        var fi = document.getElementById('ai-file-input');
        if (fi) fi.value = '';
        _buildToolsBar();
        /* إعادة شاشة AI BOOT إذا لم تكن هناك رسائل */
        if (_messages.length === 0) {
            showWelcome();
        }
    }

    function _advanceFileQueue(autoPrompt) {
        _pendingFileQueue.shift();
        if (_pendingFileQueue.length > 0) {
            _pendingFile = _pendingFileQueue[0];
            _handleFileSelected(_pendingFile);
            setTimeout(function () {
                var _nxt = _pendingFile;
                if (!_nxt) return;
                var _lang2 = getLang();
                var _autoQ = autoPrompt || (_lang2 === 'ar'
                    ? 'استخرج جميع البيانات من هذا الملف وأضفها للنظام'
                    : 'Extract all data from this file and add to system');
                _executePrompt(_autoQ, _mode, { renderUser: false });
            }, 900);
        } else {
            _pendingFileQueue = [];
            _clearPendingFile();
        }
    }

    function _handleFileSelected(file, totalCount) {
        _pendingFile = file;
        var fileNameEl = document.getElementById('ai-selected-file-name');
        var uploadZone = document.getElementById('ai-file-upload-zone');
        var hintEl = document.getElementById('ai-file-hint');
        var clearBtn = document.getElementById('ai-file-clear-btn');

        var lang = getLang();
        var isAr = lang === 'ar';
        var queueLen = _pendingFileQueue.length;
        var idx = queueLen > 1 ? (_pendingFileQueue.indexOf(file) + 1) : 1;
        var displayName = queueLen > 1
            ? file.name + ' (' + idx + '/' + queueLen + ')'
            : file.name;
        fileNameEl.textContent = displayName;
        if (hintEl) hintEl.textContent = isAr
            ? (queueLen > 1 ? 'سيتم معالجة ' + queueLen + ' ملفات تلقائياً' : 'اختر أداة الاستيراد أو اكتب أمرك وأرسل')
            : (queueLen > 1 ? queueLen + ' files queued — will process automatically' : 'Pick an import tool or write your command & send');
        uploadZone.classList.add('visible');

        if (clearBtn) {
            clearBtn.onclick = function () { _clearPendingFile(); };
        }
        _buildToolsBar();
        _showFileImportSuggestions(file);
    }

    /* ── عرض اقتراحات معالجة الملف في منطقة الرسائل (AI BOOT style) ── */
    function _showFileImportSuggestions(file) {
        var container = document.getElementById('ai-chat-messages');
        if (!container) return;
        var lang = getLang();
        var isAr = lang === 'ar';
        var pageModule = _detectPageModule();

        /* بناء أدوات الاستيراد */
        var tools = _buildFileImportTools(lang, pageModule);

        /* عنوان القسم */
        var title = isAr ? 'تم رفع الملف: ' + file.name
            : (lang === 'fr' ? 'Fichier téléversé: ' + file.name
            : 'File uploaded: ' + file.name);
        var subtitle = isAr ? 'اختر إجراء المعالجة أو اكتب أمرك الخاص'
            : (lang === 'fr' ? 'Choisissez une action de traitement ou écrivez votre commande'
            : 'Choose a processing action or write your own command');

        /* بناء شاشة الاقتراحات */
        container.innerHTML = '';
        var screen = document.createElement('div');
        screen.className = 'ai-boot-screen ai-file-suggestions';

        screen.innerHTML =
            '<div class="ai-file-suggest-header">' +
                '<div class="ai-file-suggest-icon"><i class="fas fa-file-circle-check"></i></div>' +
                '<div class="ai-file-suggest-title">' + escapeHtml(title) + '</div>' +
                '<div class="ai-file-suggest-subtitle">' + escapeHtml(subtitle) + '</div>' +
            '</div>' +
            '<div class="ai-boot-grid">' +
                tools.map(function (tool, idx) {
                    var colors = ['violet','amber','blue','rose','cyan','emerald','indigo','pink'];
                    var color = colors[idx % colors.length];
                    return '<div class="ai-boot-card" data-color="' + color + '" data-prompt="' + escapeHtml(tool.prompt) +
                        '" style="animation-delay:' + (idx * 0.06) + 's">' +
                        '<div class="ai-boot-card-icon"><i class="fas ' + tool.icon + '"></i></div>' +
                        '<div class="ai-boot-card-label">' + escapeHtml(tool.label) + '</div>' +
                    '</div>';
                }).join('') +
            '</div>';

        container.appendChild(screen);

        /* ربط النقر على البطاقات */
        var cards = screen.querySelectorAll('.ai-boot-card');
        cards.forEach(function (card) {
            card.addEventListener('click', function () {
                var prompt = card.getAttribute('data-prompt') || '';
                var input = document.getElementById('ai-chat-input');
                if (input && prompt) {
                    input.value = prompt;
                    input.dispatchEvent(new Event('input'));
                    sendMessage();
                }
            });
        });

        /* تمرير لعرض الاقتراحات */
        container.scrollTop = 0;
    }

    function _buildChips() {
        var container = document.getElementById('ai-search-chips');
        if (!container) return;
        var chips = [t('chip1'), t('chip2'), t('chip3'), t('chip4')];
        chips.forEach(function (label) {
            var btn = document.createElement('button');
            btn.className = 'ai-chip';
            btn.textContent = label;
            btn.addEventListener('click', function () {
                _executePrompt(label, 'search', { renderUser: true });
            });
            container.appendChild(btn);
        });
    }

    function _getActiveCompanyName() {
        try {
            var switcher = document.getElementById('companySwitcher');
            if (switcher && switcher.selectedIndex >= 0 && switcher.options[switcher.selectedIndex]) {
                return String(switcher.options[switcher.selectedIndex].text || '').trim();
            }
        } catch (e) {}
        try {
            var company = JSON.parse(ZS.getItem('zeralda-active-company') || '{}');
            return String(company.name || company.label || '').trim();
        } catch (e2) {}
        return '-';
    }

    function _getCurrentPageInfo() {
        var title = String(document.title || '').trim();
        var path = String((window.location && window.location.pathname) || '').split('/').pop() || 'dashboard';
        var headingEl = document.querySelector('h1, .page-title, .module-title, .dashboard-title, .section-title');
        var heading = headingEl ? String(headingEl.textContent || '').trim() : '';
        var tableCount = document.querySelectorAll('table').length;
        var formCount = document.querySelectorAll('form').length;
        var buttonCount = document.querySelectorAll('button').length;
        return {
            title: heading || title || path,
            path: path,
            heading: heading,
            tableCount: tableCount,
            formCount: formCount,
            buttonCount: buttonCount
        };
    }

    function _modeShortLabel(mode) {
        if (mode === 'web') return t('modeWebShort');
        if (mode === 'search') return t('modeSearchShort');
        return t('modeChatShort');
    }

    function _updateContextStrip() {
        var strip = document.getElementById('ai-context-strip');
        if (!strip) return;
        var page = _getCurrentPageInfo();
        var company = _getActiveCompanyName();
        strip.innerHTML = '';
        [
            { icon: 'fa-building', label: t('contextCompany'), value: company || '-' },
            { icon: 'fa-file-lines', label: t('contextPage'), value: page.title || page.path || '-' },
            { icon: 'fa-sliders', label: t('contextMode'), value: _modeShortLabel(_mode) }
        ].forEach(function (item) {
            var pill = document.createElement('div');
            pill.className = 'ai-context-pill';
            pill.innerHTML =
                '<i class="fas ' + item.icon + '"></i>' +
                '<div style="flex:1;min-width:0;">' +
                  '<div class="ai-context-pill-label">' + escapeHtml(item.label) + '</div>' +
                  '<div class="ai-context-pill-value">' + escapeHtml(item.value) + '</div>' +
                '</div>';
            strip.appendChild(pill);
        });
    }

    function _getContextSummaryText() {
        var page = _getCurrentPageInfo();
        var lines = [
            'Current page title: ' + (page.title || '-'),
            'Current page path: ' + (page.path || '-'),
            'Active company: ' + (_getActiveCompanyName() || '-'),
            'Visible tables: ' + page.tableCount,
            'Visible forms: ' + page.formCount,
            'Visible buttons: ' + page.buttonCount
        ];
        return lines.join('\n');
    }

    function _detectPageModule() {
        var path = String((window.location && window.location.pathname) || '').toLowerCase();
        var title = String(document.title || '').toLowerCase();
        var heading = '';
        var hEl = document.querySelector('h1, .page-title, .module-title, .dashboard-title, .section-title');
        if (hEl) heading = String(hEl.textContent || '').toLowerCase();
        var combined = path + ' ' + title + ' ' + heading;
        if (combined.indexOf('purchasing') !== -1 || combined.indexOf('achat') !== -1 || combined.indexOf('شراء') !== -1 || combined.indexOf('bon de commande') !== -1) return 'purchasing';
        if (combined.indexOf('sales') !== -1 || combined.indexOf('vente') !== -1 || combined.indexOf('مبيعات') !== -1 || combined.indexOf('facture') !== -1 || combined.indexOf('invoice') !== -1 || combined.indexOf('proforma') !== -1) return 'sales';
        if (combined.indexOf('invent') !== -1 || combined.indexOf('stock') !== -1 || combined.indexOf('مخزون') !== -1 || combined.indexOf('produit') !== -1) return 'inventory';
        if (combined.indexOf('hr') !== -1 || combined.indexOf('employ') !== -1 || combined.indexOf('personnel') !== -1 || combined.indexOf('موظف') !== -1 || combined.indexOf('payroll') !== -1 || combined.indexOf('rh') !== -1) return 'hr';
        if (combined.indexOf('finance') !== -1 || combined.indexOf('compt') !== -1 || combined.indexOf('مال') !== -1 || combined.indexOf('payment') !== -1 || combined.indexOf('paie') !== -1) return 'finance';
        if (combined.indexOf('crm') !== -1 || combined.indexOf('customer') !== -1 || combined.indexOf('client') !== -1 || combined.indexOf('عميل') !== -1) return 'crm';
        if (combined.indexOf('tender') !== -1 || combined.indexOf('consult') !== -1 || combined.indexOf('مناقصة') !== -1 || combined.indexOf('استشارة') !== -1) return 'tenders';
        return 'dashboard';
    }

    function _buildContextualTools(mode, lang, pageModule) {
        var tools = [];
        if (lang === 'ar') {
            switch (pageModule) {
                case 'purchasing':
                    tools.push({ icon: 'fa-cart-plus', label: t('toolCreatePO'), prompt: 'أنشئ طلب شراء جديد بناءً على بيانات الشركة الحالية. اقترح المورد والمنتجات والكميات المناسبة.' });
                    tools.push({ icon: 'fa-file-import', label: t('toolImportPurchases'), prompt: 'استخرج بيانات فواتير الشراء (فواتير الموردين) من الملف المرفوع وأضفها مباشرة إلى النظام. لكل فاتورة شراء، استخرج: رقم الفاتورة، المورد، التاريخ، المبلغ، الحالة. المورد هو الشركة التي أصدرت الفاتورة (في الأعلى مع RC/NIF/NIS). ثم استخدم [SRVEXEC:{"action":"module_append","args":{"module":"purchase-bills","record":{"number":"...","supplier":"...","billDate":"...","amount":"...","status":"Pending"}}}] لإضافة كل فاتورة شراء.' });
                    tools.push({ icon: 'fa-truck-field', label: t('toolSuppliers'), prompt: 'اعرض ملخصاً عن الموردين الموجودين مع أهم المعلومات لكل مورد.' });
                    tools.push({ icon: 'fa-warehouse', label: t('toolReorderAlert'), prompt: 'حدد المنتجات التي تحتاج إعادة طلب بناءً على المخزون الحالي ومعدل الاستهلاك.' });
                    break;
                case 'sales':
                    tools.push({ icon: 'fa-file-invoice-dollar', label: t('toolCreateInvoice'), prompt: 'أنشئ فاتورة جديدة بناءً على بيانات الشركة الحالية. اقترح العميل والمنتجات والأسعار.' });
                    tools.push({ icon: 'fa-chart-line', label: t('toolSalesAnalysis'), prompt: 'حلل بيانات المبيعات الحالية: أكثر المنتجات مبيعاً، إجمالي المبيعات، الاتجاهات الشهرية.' });
                    tools.push({ icon: 'fa-tags', label: t('toolPriceSuggest'), prompt: 'اقترح أسعاراً تنافسية للمنتجات بناءً على بيانات السوق والتكاليف الحالية.' });
                    break;
                case 'inventory':
                    tools.push({ icon: 'fa-warehouse', label: t('toolLowStock'), prompt: 'اعرض السلع ذات المخزون المنخفض أو القريب من النفاد ورتبها حسب الأولوية.' });
                    tools.push({ icon: 'fa-boxes-stacked', label: t('toolInventoryReport'), prompt: 'أنشئ تقريراً شاملاً عن المخزون: القيمة الإجمالية، المنتجات الراكدة، نسبة التغطية.' });
                    tools.push({ icon: 'fa-arrow-trend-up', label: t('toolTopProducts'), prompt: 'اعرض المنتجات الأكثر مبيعاً وحركة في المخزون.' });
                    break;
                case 'hr':
                    tools.push({ icon: 'fa-user-plus', label: t('toolAddEmployee'), prompt: 'أضف موظفاً جديد للنظام. اطلب مني البيانات المطلوبة (الاسم، المنصب، الراتب، القسم).' });
                    tools.push({ icon: 'fa-users', label: t('toolEmployees'), prompt: 'اعرض ملخصاً عن الموظفين والرواتب أو أي بيانات موارد بشرية متاحة.' });
                    tools.push({ icon: 'fa-money-check-dollar', label: t('toolFinancialHealth'), prompt: 'حلل المصاريف المالية للموارد البشرية: إجمالي الرواتب، الضرائب، التحميل المالي.' });
                    break;
                case 'finance':
                    tools.push({ icon: 'fa-coins', label: t('toolPaymentTracking'), prompt: 'تتبع المدفوعات المستحقة والمدفوعة. حدد المتأخرات والمبالغ المتبقية.' });
                    tools.push({ icon: 'fa-chart-pie', label: t('toolFinancialHealth'), prompt: 'حلل الصحة المالية للشركة: الإيرادات، المصاريف، الأرباح، التدفقات النقدية.' });
                    tools.push({ icon: 'fa-percent', label: t('toolProfitMargin'), prompt: 'احسب هوامش الربح للمنتجات والخدمات وحدد الأكثر ربحية.' });
                    break;
                case 'crm':
                    tools.push({ icon: 'fa-user-tag', label: t('toolAddCustomer'), prompt: 'أضف عميلاً جديد للنظام. اطلب مني البيانات المطلوبة (الاسم، الهاتف، العنوان).' });
                    tools.push({ icon: 'fa-chart-line', label: t('toolSalesAnalysis'), prompt: 'حلل بيانات العملاء: أفضل العملاء، معدل الشراء، القيمة الإجمالية.' });
                    break;
                case 'tenders':
                    tools.push({ icon: 'fa-brain', label: 'التسعير الذكي للمناقصات', prompt: 'حلل المناقصات المفتوحة واقترح أسعاراً تنافسية مع هوامش الربح استناداً إلى مبيعات الشركة السابقة.' });
                    tools.push({ icon: 'fa-shield-halved', label: 'تحليل مخاطر دفتر الشروط', prompt: 'افحص شروط المناقصات الحالية واستخرج أي شروط جزائية أو ثغرات تعاقدية محتملة.' });
                    tools.push({ icon: 'fa-file-signature', label: 'صياغة خطاب التقديم', prompt: 'قم بصياغة خطاب تقديم عرض رسمي (Lettre de soumission) احترافي للمناقصات الحالية.' });
                    tools.push({ icon: 'fa-list-check', label: 'تدقيق وثائق التأهيل', prompt: 'لخص قائمة الوثائق الإدارية والمالية والتقنية المطلوبة لتجهيز ملف المناقصة.' });
                    break;
                default:
                    tools.push({ icon: 'fa-chart-pie', label: t('toolCompanySnapshot'), prompt: 'اعطني ملخصاً شاملاً عن بيانات الشركة الحالية مع أهم الملاحظات والتنبيهات.' });
                    break;
            }
        } else if (lang === 'fr') {
            switch (pageModule) {
                case 'purchasing':
                    tools.push({ icon: 'fa-cart-plus', label: t('toolCreatePO'), prompt: 'Creez un bon de commande a partir des donnees actuelles. Suggerez le fournisseur, les produits et les quantites.' });
                    tools.push({ icon: 'fa-file-import', label: t('toolImportPurchases'), prompt: 'Extrayez les factures d\'achat (factures fournisseur) du fichier uploade et ajoutez-les directement au systeme. Pour chaque facture d\'achat, extrayez: numero, fournisseur, date, montant, statut. Le FOURNISSEUR est l\'entreprise qui a EMIS la facture (en haut avec RC/NIF/NIS). Puis utilisez [SRVEXEC:{"action":"module_append","args":{"module":"purchase-bills","record":{"number":"...","supplier":"...","billDate":"...","amount":"...","status":"Pending"}}}] pour ajouter chaque facture d\'achat.' });
                    tools.push({ icon: 'fa-truck-field', label: t('toolSuppliers'), prompt: 'Affichez un resume des fournisseurs avec les informations importantes pour chacun.' });
                    tools.push({ icon: 'fa-warehouse', label: t('toolReorderAlert'), prompt: 'Identifiez les produits qui necessitent une commande de reapprovisionnement.' });
                    break;
                case 'sales':
                    tools.push({ icon: 'fa-file-invoice-dollar', label: t('toolCreateInvoice'), prompt: 'Creez une facture a partir des donnees actuelles. Suggerez le client, les produits et les prix.' });
                    tools.push({ icon: 'fa-chart-line', label: t('toolSalesAnalysis'), prompt: 'Analysez les ventes actuelles : produits les plus vendus, total des ventes, tendances mensuelles.' });
                    tools.push({ icon: 'fa-tags', label: t('toolPriceSuggest'), prompt: 'Suggerez des prix competitifs pour les produits selon le marche et les couts actuels.' });
                    break;
                case 'inventory':
                    tools.push({ icon: 'fa-warehouse', label: t('toolLowStock'), prompt: 'Affichez les produits en stock faible ou proches de la rupture, classes par priorite.' });
                    tools.push({ icon: 'fa-boxes-stacked', label: t('toolInventoryReport'), prompt: 'Creez un rapport complet du stock : valeur totale, produits dormants, taux de couverture.' });
                    tools.push({ icon: 'fa-arrow-trend-up', label: t('toolTopProducts'), prompt: 'Affichez les produits les plus vendus et les plus actifs en stock.' });
                    break;
                case 'hr':
                    tools.push({ icon: 'fa-user-plus', label: t('toolAddEmployee'), prompt: 'Ajoutez un nouvel employe au systeme. Demandez-moi les informations requises.' });
                    tools.push({ icon: 'fa-users', label: t('toolEmployees'), prompt: 'Affichez un resume des employes, salaires ou autres donnees RH disponibles.' });
                    tools.push({ icon: 'fa-money-check-dollar', label: t('toolFinancialHealth'), prompt: 'Analysez les charges RH : total des salaires, charges sociales, masse salariale.' });
                    break;
                case 'finance':
                    tools.push({ icon: 'fa-coins', label: t('toolPaymentTracking'), prompt: 'Suivez les paiements dus et effectues. Identifiez les retards et les montants restants.' });
                    tools.push({ icon: 'fa-chart-pie', label: t('toolFinancialHealth'), prompt: 'Analysez la sante financiere : revenus, depenses, profits, flux de tresorerie.' });
                    tools.push({ icon: 'fa-percent', label: t('toolProfitMargin'), prompt: 'Calculez les marges beneficiaires des produits et services, identifiez les plus rentables.' });
                    break;
                case 'crm':
                    tools.push({ icon: 'fa-user-tag', label: t('toolAddCustomer'), prompt: 'Ajoutez un nouveau client au systeme. Demandez-moi les informations requises.' });
                    tools.push({ icon: 'fa-chart-line', label: t('toolSalesAnalysis'), prompt: 'Analysez les donnees clients : meilleurs clients, frequence d achat, valeur totale.' });
                    break;
                case 'tenders':
                    tools.push({ icon: 'fa-brain', label: 'Tarification des AO', prompt: 'Analysez les appels d\'offres ouverts et proposez des prix compétitifs basés sur l\'historique des ventes.' });
                    tools.push({ icon: 'fa-shield-halved', label: 'Analyse des risques AO', prompt: 'Examinez les clauses pénales et risques contractuels des appels d\'offres en cours.' });
                    tools.push({ icon: 'fa-file-signature', label: 'Lettre de soumission', prompt: 'Rédigez une lettre de soumission officielle et professionnelle pour l\'appel d\'offres sélectionné.' });
                    tools.push({ icon: 'fa-list-check', label: 'Vérification du dossier', prompt: 'Listez les pièces administratives et techniques requises pour la candidature à l\'AO.' });
                    break;
                default:
                    tools.push({ icon: 'fa-chart-pie', label: t('toolCompanySnapshot'), prompt: 'Donnez un resume complet des donnees actuelles de l entreprise avec les points importants et les alertes.' });
                    break;
            }
        } else {
            switch (pageModule) {
                case 'purchasing':
                    tools.push({ icon: 'fa-cart-plus', label: t('toolCreatePO'), prompt: 'Create a new purchase order based on current company data. Suggest supplier, products, and quantities.' });
                    tools.push({ icon: 'fa-file-import', label: t('toolImportPurchases'), prompt: 'Extract purchase bills (supplier invoices) from the uploaded file and add them directly to the system. For each purchase bill, extract: number, supplier, date, amount, status. The SUPPLIER is the company that ISSUED the invoice (at the top with RC/NIF/NIS). Then use [SRVEXEC:{"action":"module_append","args":{"module":"purchase-bills","record":{"number":"...","supplier":"...","billDate":"...","amount":"...","status":"Pending"}}}] to add each purchase bill.' });
                    tools.push({ icon: 'fa-truck-field', label: t('toolSuppliers'), prompt: 'Show a supplier summary from the available company data with the most important details for each supplier.' });
                    tools.push({ icon: 'fa-warehouse', label: t('toolReorderAlert'), prompt: 'Identify products that need reordering based on current stock and consumption rate.' });
                    break;
                case 'sales':
                    tools.push({ icon: 'fa-file-invoice-dollar', label: t('toolCreateInvoice'), prompt: 'Create a new invoice based on current company data. Suggest customer, products, and prices.' });
                    tools.push({ icon: 'fa-chart-line', label: t('toolSalesAnalysis'), prompt: 'Analyze current sales data: top-selling products, total sales, monthly trends.' });
                    tools.push({ icon: 'fa-tags', label: t('toolPriceSuggest'), prompt: 'Suggest competitive prices for products based on market data and current costs.' });
                    break;
                case 'inventory':
                    tools.push({ icon: 'fa-warehouse', label: t('toolLowStock'), prompt: 'Show the products with low stock or close to running out, ordered by priority.' });
                    tools.push({ icon: 'fa-boxes-stacked', label: t('toolInventoryReport'), prompt: 'Create a comprehensive inventory report: total value, dormant products, coverage ratio.' });
                    tools.push({ icon: 'fa-arrow-trend-up', label: t('toolTopProducts'), prompt: 'Show the best-selling and most active products in inventory.' });
                    break;
                case 'hr':
                    tools.push({ icon: 'fa-user-plus', label: t('toolAddEmployee'), prompt: 'Add a new employee to the system. Ask me for the required information (name, position, salary, department).' });
                    tools.push({ icon: 'fa-users', label: t('toolEmployees'), prompt: 'Show a summary of employees, payroll, or any available HR data in the system.' });
                    tools.push({ icon: 'fa-money-check-dollar', label: t('toolFinancialHealth'), prompt: 'Analyze HR financial costs: total salaries, taxes, payroll burden.' });
                    break;
                case 'finance':
                    tools.push({ icon: 'fa-coins', label: t('toolPaymentTracking'), prompt: 'Track due and paid payments. Identify overdue amounts and remaining balances.' });
                    tools.push({ icon: 'fa-chart-pie', label: t('toolFinancialHealth'), prompt: 'Analyze company financial health: revenue, expenses, profits, cash flow.' });
                    tools.push({ icon: 'fa-percent', label: t('toolProfitMargin'), prompt: 'Calculate profit margins for products and services, identify the most profitable ones.' });
                    break;
                case 'crm':
                    tools.push({ icon: 'fa-user-tag', label: t('toolAddCustomer'), prompt: 'Add a new customer to the system. Ask me for the required information (name, phone, address).' });
                    tools.push({ icon: 'fa-chart-line', label: t('toolSalesAnalysis'), prompt: 'Analyze customer data: top customers, purchase frequency, total value.' });
                    break;
                case 'tenders':
                    tools.push({ icon: 'fa-brain', label: 'Tender Smart Pricing', prompt: 'Analyze open tenders and suggest competitive bid prices based on historical sales benchmarks.' });
                    tools.push({ icon: 'fa-shield-halved', label: 'Tender Risk Audit', prompt: 'Examine tender specifications for penalty clauses, deadlines, and commercial risks.' });
                    tools.push({ icon: 'fa-file-signature', label: 'Draft Bid Letter', prompt: 'Draft a formal professional submission letter (Lettre de soumission) for the tender.' });
                    tools.push({ icon: 'fa-list-check', label: 'Submission Checklist', prompt: 'List mandatory administrative, fiscal, and technical documents required for the tender file.' });
                    break;
                default:
                    tools.push({ icon: 'fa-chart-pie', label: t('toolCompanySnapshot'), prompt: 'Give me a complete snapshot of the current company data and highlight the most important observations or alerts.' });
                    break;
            }
        }
        return tools;
    }

    function _buildExecutiveTools(lang) {
        if (lang === 'ar') {
            return [
                { icon: 'fa-plus-circle', label: t('toolAddProduct'), prompt: 'أريد إضافة منتج جديد للنظام. اسألني عن تفاصيل المنتج (الاسم، السعر، الكمية، الفئة).' },
                { icon: 'fa-truck-plus', label: t('toolAddSupplier'), prompt: 'أريد إضافة مورد جديد للنظام. اسألني عن تفاصيل المورد (الاسم، الهاتف، البريد، العنوان).' },
                { icon: 'fa-user-plus', label: t('toolAddCustomer'), prompt: 'أريد إضافة عميل جديد للنظام. اسألني عن تفاصيل العميل (الاسم، الهاتف، العنوان).' },
                { icon: 'fa-user-tie', label: t('toolAddEmployee'), prompt: 'أريد إضافة موظف جديد للنظام. اسألني عن تفاصيل الموظف (الاسم، المنصب، الراتب، القسم).' },
                { icon: 'fa-file-invoice', label: t('toolCreateInvoice'), prompt: 'أريد إنشاء فاتورة جديدة. اسألني عن العميل والمنتجات والكميات.' },
                { icon: 'fa-clipboard-list', label: t('toolCreatePO'), prompt: 'أريد إنشاء طلب شراء جديد. اسألني عن المورد والمنتجات والكميات.' },
                { icon: 'fa-broom', label: t('toolDataCleanup'), prompt: 'افحص بيانات الشركة وحدد السجلات غير المكتملة أو غير المتسقة واقترح تصحيحات.' },
                { icon: 'fa-clone', label: t('toolDuplicateCheck'), prompt: 'ابحث عن السجلات المكررة في بيانات الشركة (منتجات، عملاء، موردين) واقترح دمجها.' }
            ];
        } else if (lang === 'fr') {
            return [
                { icon: 'fa-plus-circle', label: t('toolAddProduct'), prompt: 'Je veux ajouter un nouveau produit au systeme. Demandez-moi les details (nom, prix, quantite, categorie).' },
                { icon: 'fa-truck-plus', label: t('toolAddSupplier'), prompt: 'Je veux ajouter un nouveau fournisseur. Demandez-moi les details (nom, telephone, email, adresse).' },
                { icon: 'fa-user-plus', label: t('toolAddCustomer'), prompt: 'Je veux ajouter un nouveau client. Demandez-moi les details (nom, telephone, adresse).' },
                { icon: 'fa-user-tie', label: t('toolAddEmployee'), prompt: 'Je veux ajouter un nouvel employe. Demandez-moi les details (nom, poste, salaire, departement).' },
                { icon: 'fa-file-invoice', label: t('toolCreateInvoice'), prompt: 'Je veux creer une nouvelle facture. Demandez-moi le client, les produits et les quantites.' },
                { icon: 'fa-clipboard-list', label: t('toolCreatePO'), prompt: 'Je veux creer un bon de commande. Demandez-moi le fournisseur, les produits et les quantites.' },
                { icon: 'fa-broom', label: t('toolDataCleanup'), prompt: 'Examinez les donnees de l entreprise et identifiez les enregistrements incomplets ou incoherents.' },
                { icon: 'fa-clone', label: t('toolDuplicateCheck'), prompt: 'Recherchez les doublons dans les donnees (produits, clients, fournisseurs) et suggererez une fusion.' }
            ];
        } else {
            return [
                { icon: 'fa-plus-circle', label: t('toolAddProduct'), prompt: 'I want to add a new product to the system. Ask me for the product details (name, price, quantity, category).' },
                { icon: 'fa-truck-plus', label: t('toolAddSupplier'), prompt: 'I want to add a new supplier. Ask me for the supplier details (name, phone, email, address).' },
                { icon: 'fa-user-plus', label: t('toolAddCustomer'), prompt: 'I want to add a new customer. Ask me for the customer details (name, phone, address).' },
                { icon: 'fa-user-tie', label: t('toolAddEmployee'), prompt: 'I want to add a new employee. Ask me for the employee details (name, position, salary, department).' },
                { icon: 'fa-file-invoice', label: t('toolCreateInvoice'), prompt: 'I want to create a new invoice. Ask me for the customer, products, and quantities.' },
                { icon: 'fa-clipboard-list', label: t('toolCreatePO'), prompt: 'I want to create a new purchase order. Ask me for the supplier, products, and quantities.' },
                { icon: 'fa-broom', label: t('toolDataCleanup'), prompt: 'Examine company data and identify incomplete or inconsistent records. Suggest corrections.' },
                { icon: 'fa-clone', label: t('toolDuplicateCheck'), prompt: 'Find duplicate records in company data (products, customers, suppliers) and suggest merging.' }
            ];
        }
    }

    function _buildAnalysisTools(lang) {
        if (lang === 'ar') {
            return [
                { icon: 'fa-chart-pie', label: t('toolCompanySnapshot'), prompt: 'اعطني ملخصاً شاملاً عن بيانات الشركة الحالية مع أهم الملاحظات والتنبيهات.' },
                { icon: 'fa-chart-line', label: t('toolSalesAnalysis'), prompt: 'حلل بيانات المبيعات: أكثر المنتجات مبيعاً، الاتجاهات، المتوسطات.' },
                { icon: 'fa-percent', label: t('toolProfitMargin'), prompt: 'احسب هوامش الربح لجميع المنتجات وحدد الأكثر ربحية.' },
                { icon: 'fa-coins', label: t('toolPaymentTracking'), prompt: 'تتبع جميع المدفوعات: المستحقة، المدفوعة، المتأخرة.' },
                { icon: 'fa-warehouse', label: t('toolLowStock'), prompt: 'اعرض السلع ذات المخزون المنخفض أو القريب من النفاد ورتبها حسب الأولوية.' },
                { icon: 'fa-arrow-trend-up', label: t('toolTopProducts'), prompt: 'اعرض المنتجات الأكثر مبيعاً وحركة.' }
            ];
        } else if (lang === 'fr') {
            return [
                { icon: 'fa-chart-pie', label: t('toolCompanySnapshot'), prompt: 'Donnez un resume complet des donnees actuelles de l entreprise avec les points importants et les alertes.' },
                { icon: 'fa-chart-line', label: t('toolSalesAnalysis'), prompt: 'Analysez les ventes : produits les plus vendus, tendances, moyennes.' },
                { icon: 'fa-percent', label: t('toolProfitMargin'), prompt: 'Calculez les marges beneficiaires de tous les produits et identifiez les plus rentables.' },
                { icon: 'fa-coins', label: t('toolPaymentTracking'), prompt: 'Suivez tous les paiements : dus, payes, en retard.' },
                { icon: 'fa-warehouse', label: t('toolLowStock'), prompt: 'Affichez les produits en stock faible ou proches de la rupture, classes par priorite.' },
                { icon: 'fa-arrow-trend-up', label: t('toolTopProducts'), prompt: 'Affichez les produits les plus vendus et les plus actifs.' }
            ];
        } else {
            return [
                { icon: 'fa-chart-pie', label: t('toolCompanySnapshot'), prompt: 'Give me a complete snapshot of the current company data and highlight the most important observations or alerts.' },
                { icon: 'fa-chart-line', label: t('toolSalesAnalysis'), prompt: 'Analyze sales data: top-selling products, trends, averages.' },
                { icon: 'fa-percent', label: t('toolProfitMargin'), prompt: 'Calculate profit margins for all products and identify the most profitable ones.' },
                { icon: 'fa-coins', label: t('toolPaymentTracking'), prompt: 'Track all payments: due, paid, overdue.' },
                { icon: 'fa-warehouse', label: t('toolLowStock'), prompt: 'Show the products with low stock or close to running out, ordered by priority.' },
                { icon: 'fa-arrow-trend-up', label: t('toolTopProducts'), prompt: 'Show the best-selling and most active products.' }
            ];
        }
    }

    function _buildFileImportTools(lang, pageModule) {
        var tools = [];
        if (lang === 'ar') {
            tools.push({ icon: 'fa-file-import', label: t('toolImportFileData'), prompt: 'استخرج جميع البيانات من الملف المرفوع واعرضها في جدول منظم. حدد نوع كل سجل (عميل، مورد، منتج، فاتورة...).' });
            tools.push({ icon: 'fa-building', label: t('toolImportCompany'), prompt: 'استخرج بيانات الشركة (الجهة المصدرة للفاتورة، عادة في أعلى الفاتورة مع RC/NIF/NIS) من الملف المرفوع وأنشئ شركة جديدة في النظام. استخرج: الاسم (name)، العنوان (siege/address)، الهاتف (phone)، البريد (email)، الموقع (website)، رقم RC (rc)، رقم NIF (nif)، رقم NIS (nis)، رقم المادة (artNumber)، رقم الترخيص (ag)، المدينة (city)، البلد (country)، رقم الضريبة (vat)، البنك (bankName)، الحساب البنكي (bankAccount)، الـ RIB (rib)، رأس المال (capital). ثم استخدم [SRVEXEC:{"action":"company_create","args":{"data":{"name":"...","siege":"...","phone":"...","email":"...","rc":"...","nif":"...","nis":"...","artNumber":"...","city":"...","country":"..."}}}] لإنشاء الشركة. ملاحظة: الشركة هي الجهة البائعة/المصدرة للفاتورة (في الأعلى)، وليست العميل.' });
            tools.push({ icon: 'fa-user-plus', label: t('toolImportCustomers'), prompt: 'استخرج بيانات العملاء (المشترين) من الملف المرفوع وأضفهم مباشرة إلى النظام. لكل عميل، استخرج: الاسم، الهاتف، البريد الإلكتروني، العنوان. تنبيه: في الفواتير، العميل هو المشتري (الذي يستلم الفاتورة)، وليس البائع (الشركة المصدرة للفاتورة). الشركة التي تظهر في الأعلى مع رقم RC/NIF/NIS هي عادة البائع وليس العميل. ثم استخدم [SRVEXEC:{"action":"module_append","args":{"module":"customers","record":{"name":"...","phone":"...","email":"...","address":"..."}}}] لإضافة كل عميل.' });
            tools.push({ icon: 'fa-truck-plus', label: t('toolImportSuppliers'), prompt: 'استخرج بيانات الموردين من الملف المرفوع وأضفهم مباشرة إلى النظام. لكل مورد، استخرج: الاسم (company)، الهاتف، البريد، العنوان، رقم RC، رقم NIF، رقم NIS، شخص الاتصال (contact). ثم استخدم [SRVEXEC:{"action":"module_append","args":{"module":"suppliers","record":{"company":"...","phone":"...","email":"...","address":"...","rc":"...","nif":"...","nis":"...","contact":"..."}}}] لإضافة كل مورد.' });
            tools.push({ icon: 'fa-box', label: t('toolImportProducts'), prompt: 'استخرج بيانات المنتجات/السلع من الملف المرفوع وأضفها مباشرة إلى النظام. لكل منتج، استخرج: الاسم، السعر، الكمية، الفئة، الوحدة. ثم استخدم [SRVEXEC:{"action":"module_append","args":{"module":"products","record":{"name":"...","price":"...","quantity":"...","category":"..."}}}] لإضافة كل منتج.' });
            tools.push({ icon: 'fa-user-tie', label: t('toolImportEmployees'), prompt: 'استخرج بيانات الموظفين من الملف المرفوع وأضفهم مباشرة إلى النظام. لكل موظف، استخرج: الاسم، المنصب، الراتب، القسم، الهاتف. ثم استخدم [SRVEXEC:{"action":"module_append","args":{"module":"employees","record":{"name":"...","position":"...","salary":"...","department":"...","phone":"..."}}}] لإضافة كل موظف.' });
            tools.push({ icon: 'fa-file-invoice-dollar', label: t('toolImportInvoices'), prompt: 'استخرج بيانات الفواتير من الملف المرفوع وأضفها مباشرة إلى النظام. لكل فاتورة، استخرج: رقم الفاتورة، العميل، التاريخ، المبلغ، المنتجات. ثم استخدم [SRVEXEC:{"action":"module_append","args":{"module":"invoices","record":{"number":"...","customer":"...","date":"...","amount":"..."}}}] لإضافة كل فاتورة.' });
            tools.push({ icon: 'fa-file-import', label: t('toolImportPurchases'), prompt: 'استخرج بيانات فواتير الشراء (فواتير الموردين) من الملف المرفوع وأضفها مباشرة إلى النظام. لكل فاتورة شراء، استخرج: رقم الفاتورة، المورد، التاريخ، المبلغ، الحالة. المورد هو الشركة التي أصدرت الفاتورة (في الأعلى مع RC/NIF/NIS). ثم استخدم [SRVEXEC:{"action":"module_append","args":{"module":"purchase-bills","record":{"number":"...","supplier":"...","billDate":"...","amount":"...","status":"Pending"}}}] لإضافة كل فاتورة شراء.' });
        } else if (lang === 'fr') {
            tools.push({ icon: 'fa-file-import', label: t('toolImportFileData'), prompt: 'Extrayez toutes les donnees du fichier uploade et affichez-les dans un tableau organise. Identifiez le type de chaque enregistrement (client, fournisseur, produit, facture...).' });
            tools.push({ icon: 'fa-building', label: t('toolImportCompany'), prompt: 'Extrayez les donnees de l\'entreprise EMETTRICE (en haut de la facture avec RC/NIF/NIS) du fichier uploade et creez une nouvelle entreprise dans le systeme. Extrayez: nom (name), adresse (siege/address), telephone (phone), email (email), site web (website), RC (rc), NIF (nif), NIS (nis), numero d\'article (artNumber), agrement (ag), ville (city), pays (country), numero TVA (vat), banque (bankName), compte bancaire (bankAccount), RIB (rib), capital (capital). Puis utilisez [SRVEXEC:{"action":"company_create","args":{"data":{"name":"...","siege":"...","phone":"...","email":"...","rc":"...","nif":"...","nis":"...","artNumber":"...","city":"...","country":"..."}}}] pour creer l\'entreprise. Note: l\'entreprise est l\'EMETTEUR de la facture (en haut), PAS le client.' });
            tools.push({ icon: 'fa-user-plus', label: t('toolImportCustomers'), prompt: 'Extrayez les donnees clients (ACHETEURS, pas vendeurs) du fichier uploade et ajoutez-les directement au systeme. Pour chaque client, extrayez: nom, telephone, email, adresse. ATTENTION: Dans une facture, le client est celui qui RECOIT la facture (apres « Facturé à », « Client », « مشتري »), PAS l\'entreprise qui l\'a émise (en haut avec RC/NIF/NIS). Puis utilisez [SRVEXEC:{"action":"module_append","args":{"module":"customers","record":{"name":"...","phone":"...","email":"...","address":"..."}}}] pour ajouter chaque client.' });
            tools.push({ icon: 'fa-truck-plus', label: t('toolImportSuppliers'), prompt: 'Extrayez les donnees fournisseurs du fichier uploade et ajoutez-les directement au systeme. Pour chaque fournisseur, extrayez: nom (company), telephone, email, adresse, RC, NIF, NIS, personne de contact (contact). Puis utilisez [SRVEXEC:{"action":"module_append","args":{"module":"suppliers","record":{"company":"...","phone":"...","email":"...","address":"...","rc":"...","nif":"...","nis":"...","contact":"..."}}}] pour ajouter chaque fournisseur.' });
            tools.push({ icon: 'fa-box', label: t('toolImportProducts'), prompt: 'Extrayez les donnees produits du fichier uploade et ajoutez-les directement au systeme. Pour chaque produit, extrayez: nom, prix, quantite, categorie, unite. Puis utilisez [SRVEXEC:{"action":"module_append","args":{"module":"products","record":{"name":"...","price":"...","quantity":"...","category":"..."}}}] pour ajouter chaque produit.' });
            tools.push({ icon: 'fa-user-tie', label: t('toolImportEmployees'), prompt: 'Extrayez les donnees employes du fichier uploade et ajoutez-les directement au systeme. Pour chaque employe, extrayez: nom, poste, salaire, departement, telephone. Puis utilisez [SRVEXEC:{"action":"module_append","args":{"module":"employees","record":{"name":"...","position":"...","salary":"...","department":"...","phone":"..."}}}] pour ajouter chaque employe.' });
            tools.push({ icon: 'fa-file-invoice-dollar', label: t('toolImportInvoices'), prompt: 'Extrayez les donnees factures du fichier uploade et ajoutez-les directement au systeme. Pour chaque facture, extrayez: numero, client, date, montant, produits. Puis utilisez [SRVEXEC:{"action":"module_append","args":{"module":"invoices","record":{"number":"...","customer":"...","date":"...","amount":"..."}}}] pour ajouter chaque facture.' });
            tools.push({ icon: 'fa-file-import', label: t('toolImportPurchases'), prompt: 'Extrayez les factures d\'achat (factures fournisseur) du fichier uploade et ajoutez-les directement au systeme. Pour chaque facture d\'achat, extrayez: numero, fournisseur, date, montant, statut. Le FOURNISSEUR est l\'entreprise qui a EMIS la facture (en haut avec RC/NIF/NIS). Puis utilisez [SRVEXEC:{"action":"module_append","args":{"module":"purchase-bills","record":{"number":"...","supplier":"...","billDate":"...","amount":"...","status":"Pending"}}}] pour ajouter chaque facture d\'achat.' });
        } else {
            tools.push({ icon: 'fa-file-import', label: t('toolImportFileData'), prompt: 'Extract all data from the uploaded file and display it in an organized table. Identify the type of each record (customer, supplier, product, invoice...).' });
            tools.push({ icon: 'fa-building', label: t('toolImportCompany'), prompt: 'Extract the ISSUING COMPANY data (at the top of the invoice with RC/NIF/NIS) from the uploaded file and create a new company in the system. Extract: name, address (siege), phone, email, website, RC (rc), NIF (nif), NIS (nis), article number (artNumber), agreement (ag), city, country, VAT number (vat), bank name (bankName), bank account (bankAccount), RIB (rib), capital. Then use [SRVEXEC:{"action":"company_create","args":{"data":{"name":"...","siege":"...","phone":"...","email":"...","rc":"...","nif":"...","nis":"...","artNumber":"...","city":"...","country":"..."}}}] to create the company. Note: the company is the INVOICE ISSUER (at the top), NOT the customer.' });
            tools.push({ icon: 'fa-user-plus', label: t('toolImportCustomers'), prompt: 'Extract CUSTOMER (BUYER, not seller) data from the uploaded file and add them directly to the system. For each customer, extract: name, phone, email, address. WARNING: In an invoice, the customer is the one who RECEIVES the invoice (after "Billed to", "Client", "مشتري"), NOT the company that issued it (at the top with RC/NIF/NIS). Then use [SRVEXEC:{"action":"module_append","args":{"module":"customers","record":{"name":"...","phone":"...","email":"...","address":"..."}}}] to add each customer.' });
            tools.push({ icon: 'fa-truck-plus', label: t('toolImportSuppliers'), prompt: 'Extract supplier data from the uploaded file and add them directly to the system. For each supplier, extract: name (company), phone, email, address, RC, NIF, NIS, contact person (contact). Then use [SRVEXEC:{"action":"module_append","args":{"module":"suppliers","record":{"company":"...","phone":"...","email":"...","address":"...","rc":"...","nif":"...","nis":"...","contact":"..."}}}] to add each supplier.' });
            tools.push({ icon: 'fa-box', label: t('toolImportProducts'), prompt: 'Extract product data from the uploaded file and add them directly to the system. For each product, extract: name, price, quantity, category, unit. Then use [SRVEXEC:{"action":"module_append","args":{"module":"products","record":{"name":"...","price":"...","quantity":"...","category":"..."}}}] to add each product.' });
            tools.push({ icon: 'fa-user-tie', label: t('toolImportEmployees'), prompt: 'Extract employee data from the uploaded file and add them directly to the system. For each employee, extract: name, position, salary, department, phone. Then use [SRVEXEC:{"action":"module_append","args":{"module":"employees","record":{"name":"...","position":"...","salary":"...","department":"...","phone":"..."}}}] to add each employee.' });
            tools.push({ icon: 'fa-file-invoice-dollar', label: t('toolImportInvoices'), prompt: 'Extract invoice data from the uploaded file and add them directly to the system. For each invoice, extract: number, customer, date, amount, products. Then use [SRVEXEC:{"action":"module_append","args":{"module":"invoices","record":{"number":"...","customer":"...","date":"...","amount":"..."}}}] to add each invoice.' });
            tools.push({ icon: 'fa-file-import', label: t('toolImportPurchases'), prompt: 'Extract purchase bills (supplier invoices) from the uploaded file and add them directly to the system. For each purchase bill, extract: number, supplier, date, amount, status. The SUPPLIER is the company that ISSUED the invoice (at the top with RC/NIF/NIS). Then use [SRVEXEC:{"action":"module_append","args":{"module":"purchase-bills","record":{"number":"...","supplier":"...","billDate":"...","amount":"...","status":"Pending"}}}] to add each purchase bill.' });
        }

        // Prioritize tools based on page module
        if (pageModule === 'crm') {
            // Move customers import to front
            tools.sort(function(a, b) { return a.label === t('toolImportCustomers') ? -1 : 0; });
        } else if (pageModule === 'purchasing') {
            tools.sort(function(a, b) { return a.label === t('toolImportPurchases') ? -1 : (a.label === t('toolImportSuppliers') ? -1 : 0); });
        } else if (pageModule === 'inventory') {
            tools.sort(function(a, b) { return a.label === t('toolImportProducts') ? -1 : 0; });
        } else if (pageModule === 'hr') {
            tools.sort(function(a, b) { return a.label === t('toolImportEmployees') ? -1 : 0; });
        } else if (pageModule === 'sales') {
            tools.sort(function(a, b) { return a.label === t('toolImportInvoices') ? -1 : 0; });
        }

        return tools;
    }

    function _buildToolsForMode(mode) {
        var lang = getLang();
        var page = _getCurrentPageInfo();
        var pageTitle = page.title || page.path || 'current ERP page';
        var pageModule = _detectPageModule();

        if (mode === 'web') {
            if (lang === 'ar') {
                return [
                    { icon: 'fa-globe', label: t('toolMarketUpdate'), prompt: 'ابحث في الإنترنت عن آخر المستجدات المتعلقة بأنظمة ERP أو المحاسبة أو الموارد البشرية أو المخزون بما يناسب بيئة العمل الحالية، ثم لخصها بشكل عملي.' },
                    { icon: 'fa-binoculars', label: t('toolResearchTopic'), prompt: 'ابحث في الإنترنت عن أفضل الممارسات والاتجاهات الحديثة المتعلقة بموضوع الصفحة الحالية: ' + pageTitle + '.' },
                    { icon: 'fa-scale-balanced', label: t('toolCompareOptions'), prompt: 'قارن عبر الإنترنت بين أفضل الخيارات أو الممارسات أو الأدوات المرتبطة بموضوع الصفحة الحالية: ' + pageTitle + '.' },
                    { icon: 'fa-landmark', label: t('toolFindRegulations'), prompt: 'ابحث في الإنترنت عن الأنظمة أو القوانين أو الإرشادات الحديثة المرتبطة بموضوع الصفحة الحالية: ' + pageTitle + '.' }
                ];
            }
            if (lang === 'fr') {
                return [
                    { icon: 'fa-globe', label: t('toolMarketUpdate'), prompt: 'Recherchez sur le web les dernieres evolutions liees aux ERP, a la comptabilite, aux RH ou a la gestion du stock, puis resumez-les de facon pratique.' },
                    { icon: 'fa-binoculars', label: t('toolResearchTopic'), prompt: 'Recherchez sur le web les meilleures pratiques et tendances modernes pour le sujet de la page actuelle : ' + pageTitle + '.' },
                    { icon: 'fa-scale-balanced', label: t('toolCompareOptions'), prompt: 'Comparez sur le web les meilleures options, outils ou pratiques lies au sujet de la page actuelle : ' + pageTitle + '.' },
                    { icon: 'fa-landmark', label: t('toolFindRegulations'), prompt: 'Cherchez sur le web les regles, lois ou directives recentes liees au sujet de la page actuelle : ' + pageTitle + '.' }
                ];
            }
            return [
                { icon: 'fa-globe', label: t('toolMarketUpdate'), prompt: 'Search the web for the latest updates related to ERP, accounting, HR, or inventory management, then summarize them in a practical way.' },
                { icon: 'fa-binoculars', label: t('toolResearchTopic'), prompt: 'Search the web for current best practices and trends related to this page topic: ' + pageTitle + '.' },
                { icon: 'fa-scale-balanced', label: t('toolCompareOptions'), prompt: 'Compare the main tools, options, or best practices on the web related to this page topic: ' + pageTitle + '.' },
                { icon: 'fa-landmark', label: t('toolFindRegulations'), prompt: 'Search the web for recent regulations, compliance rules, or official guidance related to this page topic: ' + pageTitle + '.' }
            ];
        }

        if (mode === 'search') {
            var analysis = _buildAnalysisTools(lang);
            var contextual = _buildContextualTools(mode, lang, pageModule);
            return analysis.concat(contextual);
        }

        /* chat mode: contextual + page tools + executive */
        var pageTools = [];
        if (lang === 'ar') {
            pageTools = [
                { icon: 'fa-layer-group', label: t('toolSummarizePage'), prompt: 'لخص الصفحة الحالية للمستخدم بشكل عملي مع توضيح الغرض منها وما الذي يمكن فعله فيها.\n\n' + _getContextSummaryText() },
                { icon: 'fa-circle-info', label: t('toolExplainPage'), prompt: 'اشرح وظيفة الصفحة الحالية داخل النظام، والعناصر الظاهرة فيها، وكيفية استخدامها بشكل صحيح.\n\n' + _getContextSummaryText() },
                { icon: 'fa-list-check', label: t('toolNextSteps'), prompt: 'بناءً على الصفحة الحالية، اقترح أفضل الخطوات التالية للمستخدم بشكل مرتب وقابل للتنفيذ.\n\n' + _getContextSummaryText() },
                { icon: 'fa-file-lines', label: t('toolDraftReport'), prompt: 'اكتب مسودة تقرير مهني أو ملاحظة إدارية قصيرة اعتماداً على سياق الصفحة الحالية.\n\n' + _getContextSummaryText() }
            ];
        } else if (lang === 'fr') {
            pageTools = [
                { icon: 'fa-layer-group', label: t('toolSummarizePage'), prompt: 'Resumez la page actuelle de maniere pratique en expliquant son objectif et ce que l utilisateur peut y faire.\n\n' + _getContextSummaryText() },
                { icon: 'fa-circle-info', label: t('toolExplainPage'), prompt: 'Expliquez le role de la page actuelle dans le systeme, les elements visibles et la bonne facon de l utiliser.\n\n' + _getContextSummaryText() },
                { icon: 'fa-list-check', label: t('toolNextSteps'), prompt: 'En vous basant sur la page actuelle, proposez les meilleures prochaines actions de facon claire et executable.\n\n' + _getContextSummaryText() },
                { icon: 'fa-file-lines', label: t('toolDraftReport'), prompt: 'Redigez un brouillon de rapport professionnel ou une note administrative courte a partir du contexte de la page actuelle.\n\n' + _getContextSummaryText() }
            ];
        } else {
            pageTools = [
                { icon: 'fa-layer-group', label: t('toolSummarizePage'), prompt: 'Summarize the current ERP page in a practical way, explain its purpose, and mention what the user can do on it.\n\n' + _getContextSummaryText() },
                { icon: 'fa-circle-info', label: t('toolExplainPage'), prompt: 'Explain the role of the current ERP page, the visible sections on it, and how to use it correctly.\n\n' + _getContextSummaryText() },
                { icon: 'fa-list-check', label: t('toolNextSteps'), prompt: 'Based on the current page, suggest the most useful next actions for the user in a clear executable list.\n\n' + _getContextSummaryText() },
                { icon: 'fa-file-lines', label: t('toolDraftReport'), prompt: 'Draft a short professional report or admin note based on the current page context.\n\n' + _getContextSummaryText() }
            ];
        }

        var contextual = _buildContextualTools(mode, lang, pageModule);
        var executive = _buildExecutiveTools(lang);
        var fileImport = _buildFileImportTools(lang, pageModule);
        return pageTools.concat(contextual).concat(executive).concat(fileImport);
    }

    function _buildToolsBar() {
        var container = document.getElementById('ai-tools-bar');
        if (!container) return;
        var lang = getLang();
        container.innerHTML = '<div class="ai-tools-title"><i class="fas fa-bolt"></i>' + escapeHtml(t('quickToolsTitle')) + '</div>';
        var tools = _buildToolsForMode(_mode);
        var pageModule = _detectPageModule();
        var isChat = _mode === 'chat';
        var isSearch = _mode === 'search';
        var hasFile = !!_pendingFile;

        if (isChat && tools.length > 4) {
            var fileImportCount = _buildFileImportTools(lang, pageModule).length;
            var pageTools = tools.slice(0, 4);
            var contextualTools = tools.slice(4, 4 + _buildContextualTools(_mode, lang, pageModule).length);
            var execTools = tools.slice(4 + contextualTools.length, 4 + contextualTools.length + _buildExecutiveTools(lang).length);
            var fileTools = tools.slice(4 + contextualTools.length + execTools.length);

            // Show file import section first and highlighted if a file is pending
            if (hasFile && fileTools.length) {
                _renderToolSection(container, t('toolCategoryFileImport'), fileTools, 'file-import', true);
            }

            _renderToolSection(container, t('toolCategoryContext'), pageTools, 'default', !hasFile);
            if (contextualTools.length) _renderToolSection(container, t('toolCategoryAnalysis'), contextualTools, 'context', false);
            if (execTools.length) _renderToolSection(container, t('toolCategoryTools'), execTools, 'executive', false);

            if (!hasFile && fileTools.length) {
                _renderToolSection(container, t('toolCategoryFileImport'), fileTools, 'file-import', false);
            }
        } else if (isSearch && tools.length > 6) {
            var analysisTools = tools.slice(0, 6);
            var ctxTools = tools.slice(6);
            _renderToolSection(container, t('toolCategoryAnalysis'), analysisTools, 'default', true);
            if (ctxTools.length) _renderToolSection(container, t('toolCategoryContext'), ctxTools, 'context', false);
        } else {
            tools.forEach(function (tool) {
                _appendToolBtn(container, tool, 'default');
            });
        }
    }

    function _renderToolSection(container, title, tools, style, expanded) {
        if (!tools || !tools.length) return;
        expanded = !!expanded;

        var body = document.createElement('div');
        body.className = 'ai-tools-section-body' + (expanded ? ' expanded' : '');

        var header = document.createElement('div');
        header.className = 'ai-tools-section-title' + (style === 'file-import' && _pendingFile ? ' file-import-active' : '') + (expanded ? ' expanded' : '');
        header.innerHTML = '<span>' + escapeHtml(title) + '</span><i class="fas fa-chevron-right"></i>';
        header.addEventListener('click', function() {
            body.classList.toggle('expanded');
            header.classList.toggle('expanded');
        });
        container.appendChild(header);

        tools.forEach(function (tool) {
            _appendToolBtn(body, tool, style);
        });
        container.appendChild(body);
    }

    function _appendToolBtn(container, tool, style) {
        var btn = document.createElement('button');
        var cls = 'ai-tool-btn';
        if (style === 'executive') cls += ' ai-tool-exec';
        else if (style === 'context') cls += ' ai-tool-context';
        else if (style === 'file-import') cls += ' ai-tool-file-import' + (_pendingFile ? ' has-file' : '');
        btn.className = cls;
        btn.type = 'button';
        btn.innerHTML = '<i class="fas ' + tool.icon + '"></i><span>' + escapeHtml(tool.label) + '</span>';
        btn.addEventListener('click', function () {
            _executePrompt(tool.prompt, _mode, { renderUser: true });
        });
        container.appendChild(btn);
    }

    function setMode(mode) {
        _mode = mode;
        try {
            ZS.setItem(CHAT_MODE_KEY(), mode);
        } catch (e) {}
        document.querySelectorAll('.ai-mode-tab').forEach(function (b) {
            b.classList.toggle('active', b.dataset.mode === mode);
        });
        var chipsEl = document.getElementById('ai-search-chips');
        var input = document.getElementById('ai-chat-input');
        if (chipsEl) chipsEl.classList.toggle('hidden', mode !== 'search');
        if (input) {
            if (mode === 'search') input.placeholder = t('searchPlaceholder');
            else if (mode === 'web') input.placeholder = t('webPlaceholder');
            else input.placeholder = t('placeholder');
        }
        _buildToolsBar();
    }

    function togglePanel() {
        _open ? closePanel() : openPanel();
    }

    function openPanel() {
        _open = true;
        var panel = document.getElementById('ai-chat-panel');
        var fab = document.getElementById('ai-chat-fab');
        // Move to the end of <body> before showing, to ensure it paints on top
        if (fab) document.body.appendChild(fab);
        if (panel) document.body.appendChild(panel);
        panel.classList.remove('hidden');
        document.getElementById('ai-fab-badge').style.display = 'none';

        /* ── إضافة أزرار تحكم عائمة (إغلاق + محادثة جديدة + إعدادات) ── */
        _injectBootControls();

        // Always start with a fresh welcome screen (new chat) when opening
        // the panel, so the AI BOOT layout is shown every time.
        _messages = [];
        _currentSessionId = null;
        showWelcome();

        _renderSessionsList();
        var labelEl = document.getElementById('ai-sessions-label');
        if (labelEl) labelEl.textContent = getLang() === 'ar' ? 'المحادثات' : 'Chats';
        var newSessBtn = document.getElementById('ai-sessions-new-btn');
        if (newSessBtn) {
            newSessBtn.title = getLang() === 'ar' ? 'محادثة جديدة' : 'New chat';
            newSessBtn.onclick = clearChat;
        }

        var savedMode = ZS.getItem(CHAT_MODE_KEY()) || 'chat';
        setMode(savedMode);
        scrollToBottom();
        setTimeout(function () {
            var el = document.getElementById('ai-chat-input');
            if (el) el.focus();
        }, 150);
    }

    function closePanel() {
        _open = false;
        document.getElementById('ai-chat-panel').classList.add('hidden');
        var modal = document.getElementById('ai-settings-modal');
        if (modal) modal.classList.add('hidden');
        /* إزالة أزرار التحكم العائمة */
        var closeBtn = document.getElementById('ai-boot-close');
        var controls = document.getElementById('ai-boot-controls');
        if (closeBtn) closeBtn.remove();
        if (controls) controls.remove();
    }

    function toggleSettings() {
        var modal = document.getElementById('ai-settings-modal');
        if (!modal) return;
        modal.classList.toggle('hidden');
        if (!modal.classList.contains('hidden')) {
            var frame = document.getElementById('ai-settings-frame');
            if (frame) {
                var src = '/settings.html?v=20260731g#ai';
                if (frame.src && frame.src.indexOf(src) === -1) frame.src = src;
                else if (!frame.src) frame.src = src;
            }
        }
    }

    /* ── إضافة جسيمات نيون عائمة في خلفية شاشة AI BOOT ── */
    function _injectBootParticles(screen) {
        var colors = ['#8b5cf6', '#3b82f6', '#22d3ee', '#a78bfa', '#6366f1'];
        var count = 20;
        for (var i = 0; i < count; i++) {
            var p = document.createElement('div');
            p.className = 'ai-boot-particle';
            var size = 2 + Math.random() * 4;
            var color = colors[Math.floor(Math.random() * colors.length)];
            p.style.cssText =
                'width:' + size + 'px;height:' + size + 'px;' +
                'background:' + color + ';' +
                'box-shadow:0 0 ' + (size * 3) + 'px ' + color + ';' +
                'left:' + Math.random() * 100 + '%;' +
                'bottom:' + Math.random() * 30 + '%;' +
                'animation-duration:' + (8 + Math.random() * 12) + 's;' +
                'animation-delay:' + (Math.random() * 5) + 's;' +
                '--px:' + ((Math.random() - 0.5) * 100) + 'px;';
            screen.appendChild(p);
        }
    }

    /* ── أزرار تحكم عائمة بدلاً من الشريط العلوي ── */
    function _injectBootControls() {
        /* إزالة القديم إن وجد */
        var oldClose = document.getElementById('ai-boot-close');
        var oldCtrls = document.getElementById('ai-boot-controls');
        if (oldClose) oldClose.remove();
        if (oldCtrls) oldCtrls.remove();

        var lang = getLang();
        var isAr = lang === 'ar';

        /* زر الإغلاق — أعلى اليمين */
        var closeBtn = document.createElement('button');
        closeBtn.id = 'ai-boot-close';
        closeBtn.className = 'ai-boot-close';
        closeBtn.title = isAr ? 'إغلاق' : 'Close';
        closeBtn.innerHTML = '<i class="fas fa-xmark"></i>';
        closeBtn.addEventListener('click', closePanel);
        document.body.appendChild(closeBtn);

        /* أزرار: محادثة جديدة + إعدادات — أعلى اليسار */
        var controls = document.createElement('div');
        controls.id = 'ai-boot-controls';
        controls.className = 'ai-boot-controls';

        var newBtn = document.createElement('button');
        newBtn.className = 'ai-boot-ctrl-btn';
        newBtn.title = isAr ? 'محادثة جديدة' : 'New chat';
        newBtn.innerHTML = '<i class="fas fa-pen-to-square"></i>';
        newBtn.addEventListener('click', clearChat);
        controls.appendChild(newBtn);

        var settingsBtn = document.createElement('button');
        settingsBtn.className = 'ai-boot-ctrl-btn';
        settingsBtn.title = isAr ? 'الإعدادات' : 'Settings';
        settingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
        settingsBtn.addEventListener('click', toggleSettings);
        controls.appendChild(settingsBtn);

        /* زر أرشيف الدردشات */
        var archiveBtn = document.createElement('button');
        archiveBtn.className = 'ai-boot-ctrl-btn';
        archiveBtn.title = isAr ? 'أرشيف الدردشات' : 'Chat archive';
        archiveBtn.innerHTML = '<i class="fas fa-clock-rotate-left"></i>';
        archiveBtn.addEventListener('click', _toggleArchive);
        controls.appendChild(archiveBtn);

        document.body.appendChild(controls);
    }

    /* ── نافذة أرشيف الدردشات ── */
    function _toggleArchive() {
        var existing = document.getElementById('ai-archive-modal');
        if (existing) { existing.remove(); return; }

        var lang = getLang();
        var isAr = lang === 'ar';

        var modal = document.createElement('div');
        modal.id = 'ai-archive-modal';
        modal.className = 'ai-archive-modal';

        var backdrop = document.createElement('div');
        backdrop.className = 'ai-archive-backdrop';
        backdrop.addEventListener('click', function () { modal.remove(); });

        var card = document.createElement('div');
        card.className = 'ai-archive-card';

        /* رأس النافذة */
        var header = document.createElement('div');
        header.className = 'ai-archive-header';
        header.innerHTML =
            '<div class="ai-archive-header-title"><i class="fas fa-clock-rotate-left"></i>' +
                (isAr ? 'أرشيف الدردشات' : 'Chat Archive') +
            '</div>' +
            '<button class="ai-archive-close"><i class="fas fa-xmark"></i></button>';
        card.appendChild(header);
        header.querySelector('.ai-archive-close').addEventListener('click', function () { modal.remove(); });

        /* قائمة الدردشات */
        var body = document.createElement('div');
        body.className = 'ai-archive-body';

        var sessions = _loadSessions();
        if (sessions.length === 0) {
            var empty = document.createElement('div');
            empty.className = 'ai-archive-empty';
            empty.innerHTML = '<i class="fas fa-comments"></i><p>' +
                (isAr ? 'لا توجد دردشات محفوظة بعد' : 'No saved chats yet') + '</p>';
            body.appendChild(empty);
        } else {
            sessions.forEach(function (sess) {
                var item = document.createElement('div');
                item.className = 'ai-archive-item' + (sess.id === _currentSessionId ? ' active' : '');

                var icon = document.createElement('div');
                icon.className = 'ai-archive-item-icon';
                icon.innerHTML = '<i class="fas fa-comment-dots"></i>';

                var info = document.createElement('div');
                info.className = 'ai-archive-item-info';
                var title = document.createElement('div');
                title.className = 'ai-archive-item-title';
                title.textContent = sess.title || (isAr ? 'محادثة' : 'Chat');
                var meta = document.createElement('div');
                meta.className = 'ai-archive-item-meta';
                var msgCount = (sess.messages || []).length;
                meta.textContent = _formatSessionDate(sess.updatedAt || sess.createdAt) +
                    ' · ' + msgCount + ' ' + (isAr ? 'رسالة' : 'msgs');

                var delBtn = document.createElement('button');
                delBtn.className = 'ai-archive-item-del';
                delBtn.innerHTML = '<i class="fas fa-trash-can"></i>';
                delBtn.title = isAr ? 'حذف' : 'Delete';
                (function (sid, itemEl) {
                    delBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        var msg = isAr ? 'حذف هذه المحادثة؟' : 'Delete this conversation?';
                        if (window.confirm(msg)) {
                            _deleteSession(sid);
                            /* إزالة العنصر من DOM مباشرة بدلاً من إعادة بناء النافذة */
                            itemEl.remove();
                            /* إذا لم تبقَ دردشات، أعرض رسالة الفراغ */
                            if (body.querySelectorAll('.ai-archive-item').length === 0) {
                                var clearAllBtn = body.querySelector('.ai-archive-clear-all');
                                if (clearAllBtn) clearAllBtn.remove();
                                var emptyDiv = document.createElement('div');
                                emptyDiv.className = 'ai-archive-empty';
                                emptyDiv.innerHTML = '<i class="fas fa-comments"></i><p>' +
                                    (isAr ? 'لا توجد دردشات محفوظة بعد' : 'No saved chats yet') + '</p>';
                                body.insertBefore(emptyDiv, body.firstChild);
                            }
                        }
                    });
                    item.addEventListener('click', function () {
                        _switchToSession(sid);
                        modal.remove();
                    });
                }(sess.id, item));

                info.appendChild(title);
                info.appendChild(meta);
                item.appendChild(icon);
                item.appendChild(info);
                item.appendChild(delBtn);
                body.appendChild(item);
            });
        }

        /* زر مسح الكل */
        if (sessions.length > 0) {
            var clearAll = document.createElement('button');
            clearAll.className = 'ai-archive-clear-all';
            clearAll.innerHTML = '<i class="fas fa-trash"></i> ' + (isAr ? 'مسح كل الدردشات' : 'Clear all chats');
            clearAll.addEventListener('click', function () {
                var msg = isAr ? 'حذف جميع الدردشات المحفوظة؟ لا يمكن التراجع.' : 'Delete ALL saved chats? This cannot be undone.';
                if (window.confirm(msg)) {
                    _saveSessions([]);
                    try { ZS.removeItem(CHAT_CURRENT_SESSION_KEY()); } catch (e) {}
                    _messages = [];
                    _currentSessionId = null;
                    modal.remove();
                    /* إعادة بناء شاشة الترحيب بعد إغلاق النافذة */
                    var container = document.getElementById('ai-chat-messages');
                    if (container) { container.innerHTML = ''; showWelcome(); }
                }
            });
            body.appendChild(clearAll);
        }

        card.appendChild(body);
        modal.appendChild(backdrop);
        modal.appendChild(card);
        document.body.appendChild(modal);
    }

    function showWelcome() {
        var container = document.getElementById('ai-chat-messages');
        if (!container) return;
        container.innerHTML = '';

        /* ── إخفاء الشريط العلوي والشريط الجانبي عند عرض شاشة AI BOOT ── */
        var panel = document.getElementById('ai-chat-panel');
        var header = panel && panel.querySelector('.ai-chat-header');
        var sidebar = panel && panel.querySelector('.ai-chat-sidebar');
        if (header) header.style.display = 'none';
        if (sidebar) sidebar.style.display = 'none';
        /* جعل منطقة الرسائل تأخذ كامل المساحة */
        if (panel) panel.classList.add('ai-boot-active');

        var lang = getLang();
        var isAr = lang === 'ar';
        var welcomeTitle = isAr ? 'مساعد Zeralda الذكي' : (lang === 'fr' ? 'Assistant IA Zeralda' : 'Zeralda AI Assistant');
        var welcomeSub = isAr ? 'يمكنني الإجابة عن أسئلتك، البحث في الويب، فحص بيانات الشركة، وتنفيذ إجراءات ERP.'
            : (lang === 'fr' ? 'Je peux répondre à vos questions, chercher sur le web, inspecter les données et exécuter des actions.'
            : 'I can answer your questions, search the web, inspect company data, and execute ERP actions.');

        /* ── بطاقات الوظائف مع ألوان نيون مختلفة ── */
        var suggestions = isAr ? [
            { icon: 'fa-chart-line',  text: 'ملخص المبيعات هذا الشهر',     color: 'violet'  },
            { icon: 'fa-boxes',       text: 'المنتجات منخفضة المخزون',       color: 'amber'   },
            { icon: 'fa-users',       text: 'عرض جميع العملاء',             color: 'blue'    },
            { icon: 'fa-file-invoice',text: 'كم فاتورة غير مدفوعة؟',        color: 'rose'    },
            { icon: 'fa-globe',       text: 'البحث في الإنترنت',            color: 'cyan'    },
            { icon: 'fa-database',    text: 'فحص بيانات الشركة',            color: 'emerald' },
            { icon: 'fa-bolt',        text: 'تنفيذ إجراءات ERP',            color: 'indigo'  },
            { icon: 'fa-file-lines',  text: 'تحليل فاتورة أو ملف',          color: 'pink'    }
        ] : (lang === 'fr' ? [
            { icon: 'fa-chart-line',  text: 'Résumé des ventes ce mois',     color: 'violet'  },
            { icon: 'fa-boxes',       text: 'Produits en stock faible',      color: 'amber'   },
            { icon: 'fa-users',       text: 'Afficher tous les clients',     color: 'blue'    },
            { icon: 'fa-file-invoice',text: 'Factures impayées ?',           color: 'rose'    },
            { icon: 'fa-globe',       text: 'Rechercher sur le web',         color: 'cyan'    },
            { icon: 'fa-database',    text: 'Inspecter les données',         color: 'emerald' },
            { icon: 'fa-bolt',        text: 'Exécuter des actions ERP',      color: 'indigo'  },
            { icon: 'fa-file-lines',  text: 'Analyser une facture',          color: 'pink'    }
        ] : [
            { icon: 'fa-chart-line',  text: 'Sales summary this month',      color: 'violet'  },
            { icon: 'fa-boxes',       text: 'Low stock products',            color: 'amber'   },
            { icon: 'fa-users',       text: 'Show all customers',            color: 'blue'    },
            { icon: 'fa-file-invoice',text: 'Unpaid invoices count',         color: 'rose'    },
            { icon: 'fa-globe',       text: 'Search the web',                color: 'cyan'    },
            { icon: 'fa-database',    text: 'Inspect company data',          color: 'emerald' },
            { icon: 'fa-bolt',        text: 'Execute ERP actions',           color: 'indigo'  },
            { icon: 'fa-file-lines',  text: 'Analyze invoice or file',       color: 'pink'    }
        ]);

        var badgeText = isAr ? 'النظام جاهز' : (lang === 'fr' ? 'Système prêt' : 'System Ready');
        var statusText = isAr ? 'تهيئة المساعد الذكي' : (lang === 'fr' ? 'Initialisation IA' : 'AI Initializing');

        var screen = document.createElement('div');
        screen.className = 'ai-boot-screen';

        /* ── بناء شاشة AI BOOT ── */
        screen.innerHTML =
            '<div class="ai-boot-core"><i class="fas fa-robot"></i></div>' +
            '<div class="ai-boot-title">' + escapeHtml(welcomeTitle) + '</div>' +
            '<div class="ai-boot-subtitle">' + escapeHtml(welcomeSub) + '</div>' +
            '<div class="ai-boot-badge">' + escapeHtml(badgeText) + '</div>' +
            '<div class="ai-boot-grid">' +
                suggestions.map(function (s, idx) {
                    return '<div class="ai-boot-card" data-color="' + s.color + '" data-prompt="' + escapeHtml(s.text) +
                        '" style="animation-delay:' + (idx * 0.08) + 's">' +
                        '<div class="ai-boot-card-icon"><i class="fas ' + s.icon + '"></i></div>' +
                        '<div class="ai-boot-card-label">' + escapeHtml(s.text) + '</div>' +
                    '</div>';
                }).join('') +
            '</div>' +
            '<div class="ai-boot-status">' +
                '<span>' + escapeHtml(statusText) + '</span>' +
                '<div class="ai-boot-status-bar"><div class="ai-boot-status-bar-fill"></div></div>' +
            '</div>';

        container.appendChild(screen);

        /* ── إضافة جسيمات عائمة في الخلفية ── */
        _injectBootParticles(screen);

        /* ── ربط النقر على البطاقات ── */
        var cards = screen.querySelectorAll('.ai-boot-card');
        cards.forEach(function (card) {
            card.addEventListener('click', function () {
                var prompt = card.getAttribute('data-prompt') || '';
                var input = document.getElementById('ai-chat-input');
                if (input && prompt) {
                    input.value = prompt;
                    input.dispatchEvent(new Event('input'));
                    sendMessage();
                }
            });
        });

        // Check AI status
        fetch('/api/ai/status', { headers: _authHeaders() })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data.configured) {
                    var warn = document.createElement('div');
                    warn.className = 'ai-boot-warn';
                    warn.textContent = isAr ? '⚠️ مزود الذكاء الاصطناعي غير مُعد. يرجى ضبط مفتاح API في الإعدادات.'
                        : (lang === 'fr' ? '⚠️ Fournisseur IA non configuré. Veuillez définir une clé API dans les paramètres.'
                        : '⚠️ AI provider not configured. Please set an API key in settings.');
                    screen.appendChild(warn);
                }
            })
            .catch(function () {});
    }

    function _formatContent(text) {
        var html = escapeHtml(text);
        html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
        html = html.replace(/^[-\u2022]\s+(.+)$/gm, '<span class="ai-list-item">• $1</span>');
        return html;
    }

    // FIX P0: _formatMarkdown was used in the streaming SSE handler (lines
    // 4230, 4239, 4275) but was never defined, causing a ReferenceError
    // that silently killed the stream (caught by the empty catch block).
    // It now delegates to _formatContent (which already escapes HTML first
    // then applies markdown formatting — safe against XSS).
    function _formatMarkdown(text) {
        return _formatContent(text);
    }

    function _renderMessage(role, content, isSearch, timeStr, fromHistory, badgeText) {
        var container = document.getElementById('ai-chat-messages');
        if (!container) return;

        var now = timeStr || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        if (!fromHistory) {
            var msg = {
                role: role,
                content: content,
                time: now,
                isSearch: isSearch || false,
                badgeText: badgeText || ''
            };
            if (role !== 'system') {
                _messages.push(msg);
                if (_messages.length > MAX_HISTORY) _messages = _messages.slice(-MAX_HISTORY);
                _saveHistory();
            }
        }

        var div = document.createElement('div');
        div.className = 'ai-msg ' + role + (isSearch ? ' search-result' : '');

        var actions    = (role === 'model') ? _parseActions(content)    : [];
        var srvActions = (role === 'model') ? _parseSrvActions(content) : [];
        if (role === 'model') {
            // Convert EXEC actions that target module keys to SRVEXEC format
            // AI sometimes uses [EXEC:{"action":"add","key":"suppliers",...}] instead of [SRVEXEC:...]
            var _revMap = {};
            Object.keys(_MODULE_KEY_MAP).forEach(function(m) { _revMap[_MODULE_KEY_MAP[m]] = m; });
            // Also map bare module names (without -data suffix)
            var _bareNames = ['suppliers','customers','employees','products','invoices','proformas','tenders','consultations','leaves','transactions','services'];
            _bareNames.forEach(function(n) { _revMap[n] = n; });
            var _moduleActions = { 'add': 'module_append', 'delete': 'module_delete_record', 'update': 'module_update_record', 'module_append': 'module_append', 'module_delete_record': 'module_delete_record', 'module_update_record': 'module_update_record', 'module_bulk_update': 'module_bulk_update', 'store_append': 'module_append', 'store_write': 'module_append', 'store_delete_record': 'module_delete_record', 'store_update_record': 'module_update_record' };
            var _kept = [];
            actions.forEach(function(a) {
                var modName = a.module || _revMap[a.key] || (a.key ? a.key.replace(/-data$/, '') : '');
                var srvActionType = _moduleActions[a.action];
                // Convert if action is module-related OR if key maps to a known module
                if (srvActionType && modName && _MODULE_KEY_MAP[modName]) {
                    srvActions.push({
                        action: srvActionType,
                        args: {
                            module: modName,
                            key: a.key,
                            record: a.record || a.data,
                            id: a.id,
                            name: a.name,
                            data: a.data,
                            updates: a.updates || a.record || a.data
                        }
                    });
                } else {
                    _kept.push(a);
                }
            });
            actions = _kept;
            console.log('[AI] Raw response:', content.substring(0, 500));
            console.log('[AI] Parsed EXEC actions:', actions.length, actions);
            console.log('[AI] Parsed SRVEXEC actions:', srvActions.length, srvActions);
        }
        var displayContent = content;
        if (actions.length)    displayContent = _stripActionTags(displayContent);
        if (srvActions.length) displayContent = _stripSrvActionTags(displayContent);

        var bodyDiv = document.createElement('div');
        bodyDiv.className = 'ai-msg-body';
        bodyDiv.innerHTML = _formatContent(displayContent);
        div.appendChild(bodyDiv);

        var metaDiv = document.createElement('div');
        metaDiv.className = 'ai-msg-meta';

        var timeEl = document.createElement('span');
        timeEl.className = 'ai-msg-time';
        timeEl.textContent = now;
        metaDiv.appendChild(timeEl);

        if (isSearch || badgeText) {
            var badge = document.createElement('span');
            badge.className = 'ai-msg-badge';
            badge.textContent = badgeText || t('badgeSearch');
            metaDiv.appendChild(badge);
        }

        if (role === 'model') {
            var spacer = document.createElement('span');
            spacer.className = 'ai-msg-spacer';
            metaDiv.appendChild(spacer);

            var copyBtn = document.createElement('button');
            copyBtn.className = 'ai-msg-copy';
            copyBtn.type = 'button';
            copyBtn.textContent = t('copy');
            copyBtn.addEventListener('click', function () {
                _copyToClipboard(content, copyBtn);
            });
            metaDiv.appendChild(copyBtn);
        }

        if (role === 'user') {
            var editBtn = document.createElement('button');
            editBtn.className = 'ai-msg-copy';
            editBtn.type = 'button';
            editBtn.title = getLang() === 'ar' ? 'تعديل' : 'Edit';
            editBtn.innerHTML = '<i class="fas fa-pen" style="font-size:11px;"></i>';
            editBtn.addEventListener('click', function () {
                var input = document.getElementById('ai-chat-input');
                if (!input) return;
                input.value = content;
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 130) + 'px';
                input.focus();
                /* Remove this message and everything after it from _messages */
                var idx = -1;
                for (var i = 0; i < _messages.length; i++) {
                    if (_messages[i].role === 'user' && _messages[i].content === content) {
                        idx = i; break;
                    }
                }
                if (idx !== -1) {
                    _messages.splice(idx);
                    _saveHistory();
                }
                /* Remove from DOM: this msg + any following action-block or model reply */
                var toRemove = [div];
                var sibling = div.nextSibling;
                while (sibling) {
                    var next = sibling.nextSibling;
                    if (sibling.classList &&
                        (sibling.classList.contains('ai-action-block') ||
                         (sibling.classList.contains('ai-msg') && sibling.classList.contains('model')))) {
                        toRemove.push(sibling);
                        sibling = next;
                    } else { break; }
                }
                toRemove.forEach(function(el) { if (el.parentNode) el.parentNode.removeChild(el); });
            });
            metaDiv.appendChild(editBtn);
        }

        div.appendChild(metaDiv);
        container.appendChild(div);
        if (actions.length)    _renderActionBlock(actions, container);
        if (srvActions.length) _renderSrvActionBlock(srvActions, container, fromHistory);
        scrollToBottom();
        setTimeout(scrollToBottom, 150);

        // Auto-recovery: if AI generated a truncated [SRVEXEC:...] tag, ask it to resend
        if (role === 'model' && !fromHistory && _hasTruncatedSrvAction(content) && _truncationRetryCount < 3) {
            _truncationRetryCount++;
            console.warn('[AI] Truncated SRVEXEC detected — requesting resend #' + _truncationRetryCount + ' (parsed:' + srvActions.length + ' tags so far)');
            var resendPrompt = '[SYSTEM: Your last response was cut off mid-tag. Please resend ONLY the complete [SRVEXEC:{...}] tag(s) that were cut off, with no heading or explanation before them. If all tags were complete, just reply with "DONE".]';
            setTimeout(function() {
                _messages.push({ role: 'user', content: resendPrompt });
                _executePromptInternal(resendPrompt, _mode, { renderUser: false, force: true });
            }, 600);
        }
    }

    var _typingLabel = '';

    function showTyping(label) {
        var container = document.getElementById('ai-chat-messages');
        if (!container) return;
        var existing = document.getElementById('ai-typing-indicator');
        if (existing) existing.remove();
        _typingLabel = label || t('thinking');
        var el = document.createElement('div');
        el.className = 'ai-typing';
        el.id = 'ai-typing-indicator';
        el.innerHTML =
            '<div class="ai-typing-icon">' +
            '<span class="ai-typing-dot"></span>' +
            '<span class="ai-typing-dot"></span>' +
            '<span class="ai-typing-dot"></span>' +
            '</div>' +
            '<span class="ai-typing-label">' + escapeHtml(_typingLabel) + '</span>' +
            '<span class="ai-typing-spinner"></span>';
        container.appendChild(el);
        scrollToBottom();
    }

    function updateTypingLabel(label) {
        _typingLabel = label || _typingLabel;
        var labelEl = document.querySelector('#ai-typing-indicator .ai-typing-label');
        if (labelEl) labelEl.textContent = _typingLabel;
    }

    function hideTyping() {
        var el = document.getElementById('ai-typing-indicator');
        if (el) el.remove();
    }

    function scrollToBottom() {
        var container = document.getElementById('ai-chat-messages');
        if (container) container.scrollTop = container.scrollHeight;
    }

    /* ══════════════════════════════════════════════
       AI ACTION SYSTEM — Read/Write ERP Data
       ══════════════════════════════════════════════ */

    var ACTION_LABELS = {
        add:    { ar: 'إضافة', en: 'Add',    fr: 'Ajouter' },
        delete: { ar: 'حذف',   en: 'Delete', fr: 'Supprimer' },
        update: { ar: 'تعديل', en: 'Update', fr: 'Modifier' }
    };

    var MODULE_LABELS = {
        'employees-data':        { ar: 'موظف',       en: 'Employee',     fr: 'Employé' },
        'payroll-data':          { ar: 'راتب',        en: 'Payroll',      fr: 'Paie' },
        'products-data':         { ar: 'منتج',        en: 'Product',      fr: 'Produit' },
        'inventory-categories':  { ar: 'فئة مخزون',  en: 'Category',     fr: 'Catégorie' },
        'stock-movements':       { ar: 'حركة مخزون', en: 'Stock Move',   fr: 'Mouvement' },
        'customers-data':        { ar: 'عميل',        en: 'Customer',     fr: 'Client' },
        'invoices-data':         { ar: 'فاتورة',      en: 'Invoice',      fr: 'Facture' },
        'proformas-data':        { ar: 'عرض سعر',    en: 'Proforma',     fr: 'Proforma' },
        'zeralda-purchasing-data':{ ar: 'مشتريات',   en: 'Purchase',     fr: 'Achat' },
        'zeralda-services':      { ar: 'خدمة',        en: 'Service',      fr: 'Service' },
        'consultations-data':    { ar: 'استشارة',     en: 'Consultation', fr: 'Consultation' },
        'tenders-data':          { ar: 'مناقصة',      en: 'Tender',       fr: 'Appel d\'offre' },
        'suppliers-data':        { ar: 'مورد',        en: 'Supplier',     fr: 'Fournisseur' },
        'zeralda-companies':     { ar: 'شركة',        en: 'Company',      fr: 'Entreprise' },
        'zeralda-users':         { ar: 'مستخدم',      en: 'User',         fr: 'Utilisateur' }
    };

    function _parseActions(text) {
        var actions = [];
        var tag = '[EXEC:';
        var idx = 0;
        while ((idx = text.indexOf(tag, idx)) !== -1) {
            var start = idx + tag.length;
            var depth = 0, end = -1, inStr = false, esc = false;
            for (var i = start; i < text.length; i++) {
                var ch = text[i];
                if (inStr) {
                    if (esc) { esc = false; }
                    else if (ch === '\\') { esc = true; }
                    else if (ch === '"') { inStr = false; }
                } else {
                    if (ch === '"') { inStr = true; }
                    else if (ch === '{') { depth++; }
                    else if (ch === '}') { depth--; }
                    else if (ch === ']' && depth === 0) { end = i; break; }
                }
            }
            if (end !== -1) {
                try { actions.push(JSON.parse(text.substring(start, end).trim())); } catch (e) {}
                idx = end + 1;
            } else { idx = start; }
        }
        return actions;
    }

    function _stripActionTags(text) {
        var tag = '[EXEC:';
        var lastEnd = 0, result = '';
        var idx = text.indexOf(tag);
        while (idx !== -1) {
            result += text.substring(lastEnd, idx);
            var start = idx + tag.length;
            var depth = 0, end = -1, inStr = false, esc = false;
            for (var i = start; i < text.length; i++) {
                var ch = text[i];
                if (inStr) {
                    if (esc) { esc = false; }
                    else if (ch === '\\') { esc = true; }
                    else if (ch === '"') { inStr = false; }
                } else {
                    if (ch === '"') { inStr = true; }
                    else if (ch === '{') { depth++; }
                    else if (ch === '}') { depth--; }
                    else if (ch === ']' && depth === 0) { end = i; break; }
                }
            }
            if (end !== -1) { lastEnd = end + 1; }
            else { result += tag; lastEnd = start; }
            idx = text.indexOf(tag, lastEnd);
        }
        result += text.substring(lastEnd);
        return result.trim();
    }

    function _localizedLabel(map, lang) {
        if (!map) return '';
        return map[lang] || map.ar || map.en || '';
    }

    function _describeAction(action, lang) {
        lang = lang || getLang();
        var aLabel = _localizedLabel(ACTION_LABELS[action.action], lang);
        var mLabel = _localizedLabel(MODULE_LABELS[action.key], lang) || action.key;
        var details = '';
        if (action.record) {
            var pairs = Object.entries(action.record).slice(0, 4).map(function(e) {
                return '<code>' + escapeHtml(String(e[0])) + '</code>: ' + escapeHtml(String(e[1]));
            });
            details = pairs.join(' &nbsp;|&nbsp; ');
        } else if (action.id) {
            details = '<code>id</code>: ' + escapeHtml(String(action.id));
        }
        return '<strong>' + escapeHtml(aLabel) + '</strong> ' + escapeHtml(mLabel) + (details ? ' &mdash; ' + details : '');
    }

    function _getCompanyId() {
        try {
            var s = JSON.parse(ZS.getItem('zeralda-settings') || '{}');
            return String(s.activeCompanyId || 'default-company');
        } catch (e) { return 'default-company'; }
    }

    function _getPurchasingKey() {
        return 'zeralda-purchasing-data::' + _getCompanyId();
    }

    function _syncToServer(storageKey, value) {
        try {
            if (window.UnifiedStorage && typeof window.UnifiedStorage.setItem === 'function') {
                window.UnifiedStorage.setItem(storageKey, typeof value === 'string' ? value : JSON.stringify(value));
            } else {
                var base = (window.location.origin || 'http://127.0.0.1');
                fetch(base + '/api/store', {
                    method: 'POST',
                    credentials: 'include',
                    headers: _authHeaders(),
                    body: JSON.stringify({ key: storageKey, value: value })
                }).catch(function() {});
            }
        } catch (e) {}
    }

    /* Nested-array keys: stored inside another object */
    var _NESTED_KEYS = {
        'suppliers-data':     { parent: _getPurchasingKey, field: 'suppliers' },
        'purchase-orders':    { parent: _getPurchasingKey, field: 'orders' },
        'purchase-bills':     { parent: _getPurchasingKey, field: 'bills' },
        'purchase-payments':  { parent: _getPurchasingKey, field: 'payments' }
    };

    function _executeSingleAction(action) {
        try {
            var key = String(action.key || '');
            if (!key) throw new Error('Missing key');

            // ── Special case: companies inside zeralda-system-settings ────
            if (key === 'zeralda-companies') {
                var SETTINGS_KEY = 'zeralda-system-settings';
                var sysRaw = ZS.getItem(SETTINGS_KEY);
                var sys = {};
                try { sys = JSON.parse(sysRaw || '{}'); } catch(e) {}
                if (!Array.isArray(sys.companies)) sys.companies = [];

                if (action.action === 'add') {
                    var newCompany = Object.assign({
                        id: 'c' + Date.now(),
                        name: '', siege: '', rc: '', artNumber: '', nif: '', nis: '', nin: '',
                        phone: '', ag: '', email: '', website: '', address: '',
                        city: '', country: '', vat: '', bankName: '', bankAccount: '',
                        capital: '', logoDataUrl: null, sealDataUrl: null,
                        documents: {}, createdAt: new Date().toISOString()
                    }, action.record || {});
                    sys.companies.push(newCompany);
                } else if (action.action === 'delete') {
                    var dId   = String(action.id   || (action.record && action.record.id)   || '');
                    var dName = String(action.name || (action.record && action.record.name) || '').toLowerCase();
                    sys.companies = sys.companies.filter(function(c) {
                        if (dId   && String(c.id) === dId)   return false;
                        if (dName && String(c.name || '').toLowerCase() === dName) return false;
                        return true;
                    });
                } else if (action.action === 'update') {
                    var uId   = String(action.id   || '');
                    var uName = String(action.name || '').toLowerCase();
                    sys.companies = sys.companies.map(function(c) {
                        var mId   = uId   && String(c.id) === uId;
                        var mName = uName && String(c.name || '').toLowerCase() === uName;
                        return (mId || mName) ? Object.assign({}, c, action.record || {}) : c;
                    });
                } else {
                    throw new Error('Unknown action: ' + action.action);
                }
                ZS.setItem(SETTINGS_KEY, JSON.stringify(sys));
                _syncToServer(SETTINGS_KEY, sys);
                try { window.dispatchEvent(new StorageEvent('storage', { key: SETTINGS_KEY, newValue: JSON.stringify(sys) })); } catch(e) {}
                return { ok: true };
            }

            var nested = _NESTED_KEYS[key];

            if (nested) {
                /* ── Nested case (e.g. suppliers inside zeralda-purchasing-data) ── */
                var parentKey = nested.parent();
                var parentRaw = ZS.getItem(parentKey);
                var parentData = null;
                try { parentData = JSON.parse(parentRaw || 'null'); } catch (e) {}
                if (!parentData || typeof parentData !== 'object') {
                    parentData = { orders: [], suppliers: [], bills: [], payments: [] };
                }
                if (!Array.isArray(parentData[nested.field])) parentData[nested.field] = [];

                var arr = parentData[nested.field];
                var record, targetId, targetName, uid, uname;

                if (action.action === 'add') {
                    record = Object.assign({ id: Date.now() }, action.record || {});
                    arr.push(record);
                } else if (action.action === 'delete') {
                    targetId   = String(action.id   || (action.record && action.record.id)   || '');
                    targetName = String(action.name || (action.record && action.record.name) || '').toLowerCase();
                    parentData[nested.field] = arr.filter(function(item) {
                        if (targetId   && String(item.id)   === targetId)   return false;
                        if (targetName && String(item.name || '').toLowerCase() === targetName) return false;
                        return true;
                    });
                } else if (action.action === 'update') {
                    uid   = String(action.id   || '');
                    uname = String(action.name || '').toLowerCase();
                    parentData[nested.field] = arr.map(function(item) {
                        var matchId   = uid   && String(item.id)   === uid;
                        var matchName = uname && String(item.name || '').toLowerCase() === uname;
                        return (matchId || matchName) ? Object.assign({}, item, action.record || {}) : item;
                    });
                } else {
                    throw new Error('Unknown action: ' + action.action);
                }

                ZS.setItem(parentKey, JSON.stringify(parentData));
                _syncToServer(parentKey, parentData);
                try { window.dispatchEvent(new StorageEvent('storage', { key: parentKey, newValue: JSON.stringify(parentData) })); } catch (e) {}
                return { ok: true };
            }

            /* ── Standard flat-array case ── */
            var companyId = _getCompanyId();
            var storageKey = (key === 'zeralda-purchasing-data')
                ? key + '::' + companyId : key;

            var raw = ZS.getItem(storageKey);
            var data = null;
            try { data = JSON.parse(raw || 'null'); } catch (e) {}
            if (data === null) data = [];

            if (action.action === 'add') {
                var rec = Object.assign({ id: Date.now() }, action.record || {});
                if (Array.isArray(data)) {
                    data.push(rec);
                } else if (data && typeof data === 'object') {
                    var firstArr = Object.keys(data).find(function(k) { return Array.isArray(data[k]); });
                    if (firstArr) { data[firstArr].push(rec); }
                    else { data = [rec]; }
                }
            } else if (action.action === 'delete') {
                var tId   = String(action.id   || (action.record && action.record.id)   || '');
                var tName = String(action.name || (action.record && action.record.name) || '').toLowerCase();
                if (Array.isArray(data)) {
                    data = data.filter(function(item) {
                        if (tId   && String(item.id)   === tId)   return false;
                        if (tName && String(item.name || '').toLowerCase() === tName) return false;
                        return true;
                    });
                }
            } else if (action.action === 'update') {
                var updId   = String(action.id   || '');
                var updName = String(action.name || '').toLowerCase();
                if (Array.isArray(data)) {
                    data = data.map(function(item) {
                        var mId   = updId   && (String(item.id) === updId || String(item.code || '') === updId || String(item.sku || '') === updId || String(item.reference || '') === updId || String(item._id || '') === updId);
                        var mName = updName && String(item.name || '').toLowerCase() === updName;
                        return (mId || mName) ? Object.assign({}, item, action.record || {}) : item;
                    });
                }
            } else {
                throw new Error('Unknown action: ' + action.action);
            }

            ZS.setItem(storageKey, JSON.stringify(data));
            _syncToServer(storageKey, data);
            try { window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: JSON.stringify(data) })); } catch (e) {}
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message };
        }
    }

    function _renderActionBlock(actions, parentDiv) {
        if (!actions || !actions.length) return;
        var lang = getLang();
        var block = document.createElement('div');
        block.className = 'ai-action-block';

        var title = document.createElement('div');
        title.className = 'ai-action-block-title';
        title.innerHTML = '<i class="fas fa-bolt"></i>' + (lang === 'ar' ? 'إجراءات مقترحة — تأكيد مطلوب' : 'Suggested Actions — Confirmation Required');
        block.appendChild(title);

        actions.forEach(function(action) {
            var desc = document.createElement('div');
            desc.className = 'ai-action-desc';
            desc.innerHTML = _describeAction(action, lang);
            block.appendChild(desc);

            var row = document.createElement('div');
            row.className = 'ai-action-btns-row';

            var confirmBtn = document.createElement('button');
            confirmBtn.className = 'ai-action-confirm-btn';
            confirmBtn.innerHTML = '<i class="fas fa-check"></i>' + (lang === 'ar' ? 'تأكيد التنفيذ' : 'Confirm & Execute');
            confirmBtn.addEventListener('click', function() {
                confirmBtn.disabled = true;
                var result = _executeSingleAction(action);
                if (result.ok) {
                    confirmBtn.classList.add('done');
                    confirmBtn.innerHTML = '<i class="fas fa-check-double"></i>' + (lang === 'ar' ? 'تم بنجاح' : 'Done!');
                    if (cancelBtn) cancelBtn.style.display = 'none';
                } else {
                    confirmBtn.classList.add('failed');
                    confirmBtn.innerHTML = '<i class="fas fa-times"></i>' + (lang === 'ar' ? 'فشل: ' : 'Failed: ') + escapeHtml(result.error || '');
                }
            });

            var cancelBtn = document.createElement('button');
            cancelBtn.className = 'ai-action-cancel-btn';
            cancelBtn.innerHTML = '<i class="fas fa-xmark"></i>' + (lang === 'ar' ? 'إلغاء' : 'Cancel');
            cancelBtn.addEventListener('click', function() { block.remove(); });

            row.appendChild(confirmBtn);
            row.appendChild(cancelBtn);
            block.appendChild(row);
        });

        parentDiv.appendChild(block);
        scrollToBottom();
    }

    /* ══════════════════════════════════════════════════════════
       SERVER-SIDE ACTIONS  [SRVEXEC:{...}]
       ══════════════════════════════════════════════════════════ */

    var _SRV_DESTRUCTIVE = ['user_delete', 'store_delete_record', 'store_write', 'module_delete_record', 'company_update', 'module_bulk_update', 'settings_update'];

    function _parseSrvActions(text) {
        var actions = [];
        var tag = '[SRVEXEC:';
        var idx = 0;
        while ((idx = text.indexOf(tag, idx)) !== -1) {
            var start = idx + tag.length;
            var depth = 0, end = -1, inStr = false, esc = false;
            for (var i = start; i < text.length; i++) {
                var ch = text[i];
                if (inStr) {
                    if (esc) { esc = false; }
                    else if (ch === '\\') { esc = true; }
                    else if (ch === '"') { inStr = false; }
                } else {
                    if (ch === '"') { inStr = true; }
                    else if (ch === '{') { depth++; }
                    else if (ch === '}') { depth--; }
                    else if (ch === ']' && depth === 0) { end = i; break; }
                }
            }
            if (end !== -1) {
                try { actions.push(JSON.parse(text.substring(start, end).trim())); } catch (e) {}
                idx = end + 1;
            } else { idx = start; }
        }
        return actions;
    }

    var _truncationRetryCount = 0;

    function _hasTruncatedSrvAction(text) {
        var tag = '[SRVEXEC:';
        var idx = text.indexOf(tag);
        if (idx === -1) return false;
        var start = idx + tag.length;
        var depth = 0, end = -1, inStr = false, esc = false;
        for (var i = start; i < text.length; i++) {
            var ch = text[i];
            if (inStr) {
                if (esc) { esc = false; }
                else if (ch === '\\') { esc = true; }
                else if (ch === '"') { inStr = false; }
            } else {
                if (ch === '"') { inStr = true; }
                else if (ch === '{') { depth++; }
                else if (ch === '}') { depth--; }
                else if (ch === ']' && depth === 0) { end = i; break; }
            }
        }
        return end === -1;
    }

    function _stripSrvActionTags(text) {
        var tag = '[SRVEXEC:';
        var idx = 0, result = '';
        var lastEnd = 0;
        while ((idx = text.indexOf(tag, lastEnd)) !== -1) {
            result += text.substring(lastEnd, idx);
            var start = idx + tag.length;
            var depth = 0, end = -1, inStr = false, esc = false;
            for (var i = start; i < text.length; i++) {
                var ch = text[i];
                if (inStr) {
                    if (esc) { esc = false; }
                    else if (ch === '\\') { esc = true; }
                    else if (ch === '"') { inStr = false; }
                } else {
                    if (ch === '"') { inStr = true; }
                    else if (ch === '{') { depth++; }
                    else if (ch === '}') { depth--; }
                    else if (ch === ']' && depth === 0) { end = i; break; }
                }
            }
            if (end !== -1) { lastEnd = end + 1; }
            else { result += tag; lastEnd = start; }
        }
        result += text.substring(lastEnd);
        return result.trim();
    }

    function _srvActionLabel(action) {
        var lang = getLang();
        var labels = {
            'user_list':           { ar: 'عرض المستخدمين',       en: 'List Users',           fr: 'Lister les utilisateurs' },
            'user_create':         { ar: 'إنشاء مستخدم',          en: 'Create User',          fr: 'Créer un utilisateur' },
            'user_update':         { ar: 'تعديل مستخدم',          en: 'Update User',          fr: 'Modifier un utilisateur' },
            'user_delete':         { ar: 'حذف مستخدم',            en: 'Delete User',          fr: 'Supprimer un utilisateur' },
            'settings_read':       { ar: 'قراءة الإعدادات',       en: 'Read Settings',        fr: 'Lire les paramètres' },
            'settings_update':     { ar: 'تحديث الإعدادات',       en: 'Update Settings',      fr: 'Mettre à jour les paramètres' },
            'store_read':          { ar: 'قراءة البيانات',         en: 'Read Data',            fr: 'Lire les données' },
            'store_append':        { ar: 'إضافة سجل',             en: 'Add Record',           fr: 'Ajouter un enregistrement' },
            'store_delete_record': { ar: 'حذف سجل',               en: 'Delete Record',        fr: 'Supprimer un enregistrement' },
            'store_update_record': { ar: 'تعديل سجل',             en: 'Update Record',        fr: 'Modifier un enregistrement' },
            'store_write':         { ar: 'كتابة البيانات',         en: 'Write Data',           fr: 'Écrire les données' },
            'report_summary':      { ar: 'ملخص التقارير',          en: 'Report Summary',       fr: 'Résumé des rapports' },
            'module_list':         { ar: 'عرض قائمة',             en: 'List Module',          fr: 'Lister le module' },
            'module_append':       { ar: 'إضافة سجل للقائمة',     en: 'Add Module Record',    fr: 'Ajouter au module' },
            'module_update_record':{ ar: 'تعديل سجل في القائمة',  en: 'Update Module Record',fr: 'Modifier dans le module' },
            'module_delete_record':{ ar: 'حذف سجل من القائمة',    en: 'Delete Module Record', fr: 'Supprimer du module' },
            'company_read':        { ar: 'قراءة بيانات الشركة',   en: 'Read Company',        fr: 'Lire société' },
            'company_update':      { ar: 'تحديث بيانات الشركة',   en: 'Update Company',      fr: 'Mettre à jour société' },
            'company_create':      { ar: 'إنشاء شركة جديدة',       en: 'Create Company',      fr: 'Créer société' },
            'backup_create':       { ar: 'إنشاء نسخة احتياطية',   en: 'Create Backup',       fr: 'Créer sauvegarde' },
        };
        var map = labels[action.action] || { ar: action.action, en: action.action };
        var lbl = map[lang] || map.en;
        var argSummary = '';
        var args = action.args || {};
        var rec = args.record || action.record || action.data || {};
        // Try a prioritized list of identifying fields — different modules use
        // different field names for their "primary" label (invoices have no
        // `name`, suppliers use `company`, etc.). Without this, most extracted
        // records only show the generic module name in the confirmation card.
        var primary = rec.name || rec.company || rec.fullName ||
            (rec.customer && (typeof rec.customer === 'string' ? rec.customer : rec.customer.name)) ||
            rec.invoiceNumber || rec.number || rec.title || rec.designation ||
            rec.description || args.name;
        if (primary) argSummary += ' • ' + primary;
        // Secondary identifying context (invoice number alongside customer, etc.)
        if (rec.customer && primary !== (typeof rec.customer === 'string' ? rec.customer : rec.customer.name)) {
            var custLabel = typeof rec.customer === 'string' ? rec.customer : rec.customer.name;
            if (custLabel) argSummary += ' — ' + custLabel;
        }
        if ((rec.invoiceNumber || rec.number) && primary !== (rec.invoiceNumber || rec.number)) {
            argSummary += ' (#' + (rec.invoiceNumber || rec.number) + ')';
        }
        if (rec.total || rec.amount) argSummary += ' — ' + (rec.total || rec.amount) + ' ' + (rec.currency || '');
        if (rec.phone) argSummary += ' • ' + rec.phone;
        if (rec.position) argSummary += ' (' + rec.position + ')';
        if (args.email) argSummary += ' • ' + args.email;
        if (args.role)  argSummary += ' (' + args.role + ')';
        if (args.key)   argSummary += ' • ' + args.key;
        if (args.module)argSummary += ' • ' + args.module;
        else if (action.module) argSummary += ' • ' + action.module;
        if (args.id)    argSummary += ' # ' + args.id;
        else if (action.id) argSummary += ' # ' + action.id;
        return '<strong>' + escapeHtml(lbl) + '</strong>' + (argSummary ? '<span style="color:#6b7280;font-size:12px;">' + escapeHtml(argSummary) + '</span>' : '');
    }

    function _executeSrvAction(action, onResult) {
        var base = window.location.origin || 'http://127.0.0.1';
        // Merge top-level fields into args (AI sometimes puts module/record/data outside args)
        var args = action.args || {};
        if (action.module && !args.module) args.module = action.module;
        if (action.record && !args.record) args.record = action.record;
        if (action.data && !args.record && !args.data) args.record = action.data;
        if (action.id && !args.id) args.id = action.id;
        if (action.key && !args.key) args.key = action.key;
        // Include companyId so server can scope storage keys
        if (!args.companyId) {
            try {
                var s = JSON.parse(ZS.getItem('zeralda-settings') || '{}');
                args.companyId = String(s.activeCompanyId || 'default-company');
            } catch (e) { args.companyId = 'default-company'; }
        }
        // Safety: for module_bulk_update without a filterField, the server
        // requires an explicit confirmAll flag (the user already confirmed
        // via the destructive-action UI button, so we can set it here).
        if (action.action === 'module_bulk_update' && !args.filterField) {
            args.confirmAll = true;
        }
        console.log('[AI Action] Sending to server:', { action: action.action, module: args.module, hasRecord: !!(args.record), companyId: args.companyId });
        // Destructive actions require confirm=true at the top level (the user
        // already confirmed via the destructive-action UI button).
        var _isDestr = _SRV_DESTRUCTIVE.indexOf(action.action) !== -1;
        fetch(base + '/api/ai/action', {
            method: 'POST',
            headers: _authHeaders(),
            body: JSON.stringify(Object.assign({ action: action.action, args: args }, _isDestr ? { confirm: true } : {}))
        })
        .then(function(r) {
            console.log('[AI Action] Server response status:', r.status);
            return r.json();
        })
        .then(function(data) {
            console.log('[AI Action] Server response data:', data);
            if (data.ok) {
                try { _syncSrvActionToLocal(action, data); } catch (e) { console.warn('[AI] syncToLocal failed:', e); }
            } else {
                console.warn('[AI Action] Server returned error:', data.error);
            }
            onResult(data);
        })
        .catch(function(err) {
            console.error('[AI Action] Fetch failed:', err);
            onResult({ ok: false, error: err.message || 'Network error' });
        });
    }

    // Map module names to localStorage keys
    var _MODULE_KEY_MAP = window.MODULE_KEY_MAP || {
        'customers': 'customers-data', 'clients': 'customers-data', 'client': 'customers-data', 'customer': 'customers-data',
        'suppliers': 'suppliers-data', 'fournisseurs': 'suppliers-data', 'supplier': 'suppliers-data', 'fournisseur': 'suppliers-data',
        'employees': 'employees-data', 'personnel': 'employees-data', 'employee': 'employees-data',
        'products': 'products-data', 'produits': 'products-data', 'product': 'products-data', 'produit': 'products-data',
        'invoices': 'invoices-data', 'factures': 'invoices-data', 'invoice': 'invoices-data', 'facture': 'invoices-data',
        'proformas': 'proformas-data', 'proforma': 'proformas-data',
        'tenders': 'tenders-data', 'tender': 'tenders-data',
        'consultations': 'consultations-data', 'consultation': 'consultations-data',
        'leaves': 'hr-leaves', 'leave': 'hr-leaves',
        'transactions': 'finance-transactions', 'transaction': 'finance-transactions',
        'services': 'zeralda-services', 'service': 'zeralda-services'
    };

    /* Generate sequential product code matching inventory page format: PRD-001, PRD-002, ... */
    function _getNextProductSeqNumber() {
        try {
            var companyId = _getCompanyId();
            var storageKey = 'products-data::' + companyId;
            var raw = ZS.getItem(storageKey);
            var products = [];
            try { products = JSON.parse(raw || '[]'); } catch (e) { products = []; }
            if (!Array.isArray(products)) products = [];
            // Find the max numeric suffix from existing codes (PRD-XXX)
            var maxNum = 0;
            products.forEach(function(p) {
                var code = String(p.code || p.id || '');
                var match = code.match(/PRD-0*(\d+)/i);
                if (match) {
                    var n = parseInt(match[1], 10);
                    if (n > maxNum) maxNum = n;
                }
                // Also check numeric id
                var pid = Number(p.id || 0);
                if (pid > maxNum) maxNum = pid;
            });
            return maxNum + 1;
        } catch (e) {
            return Math.floor(Date.now() / 1000) % 10000; // fallback
        }
    }

    function _normalizeInvoiceRecord(rec) {
        var normalized = Object.assign({}, rec);
        // Map invoice number
        if (!normalized.invoiceNumber && normalized.number) {
            normalized.invoiceNumber = String(normalized.number);
        }
        // Map customer: AI sends string, sales module expects {name, id}
        if (normalized.customer && typeof normalized.customer === 'string') {
            normalized.customer = { name: normalized.customer, id: '' };
        } else if (!normalized.customer) {
            // Try customerId or customerName fields
            if (normalized.customerName) {
                normalized.customer = { name: String(normalized.customerName), id: String(normalized.customerId || '') };
            } else if (normalized.customerId) {
                normalized.customer = { name: '', id: String(normalized.customerId) };
            } else {
                normalized.customer = { name: '', id: '' };
            }
        } else if (normalized.customer && typeof normalized.customer === 'object' && !normalized.customer.name) {
            if (normalized.customerName) normalized.customer.name = String(normalized.customerName);
        }
        // Map total: AI sends amount, sales module expects total
        if (!normalized.total && normalized.amount) {
            normalized.total = Number(normalized.amount) || 0;
        }
        if (!normalized.total) {
            normalized.total = Number(normalized.total || 0);
        }
        // Ensure date exists (default to today in ISO format YYYY-MM-DD)
        if (!normalized.date) {
            var now = new Date();
            var yyyy = now.getFullYear();
            var mm = String(now.getMonth() + 1).padStart(2, '0');
            var dd = String(now.getDate()).padStart(2, '0');
            normalized.date = yyyy + '-' + mm + '-' + dd;
        } else {
            // Try to normalize date to YYYY-MM-DD
            var parsed = new Date(normalized.date);
            if (!isNaN(parsed)) {
                var y = parsed.getFullYear();
                var m = String(parsed.getMonth() + 1).padStart(2, '0');
                var d = String(parsed.getDate()).padStart(2, '0');
                normalized.date = y + '-' + m + '-' + d;
            }
        }
        // Ensure status and paid fields
        if (!normalized.status) {
            normalized.status = 'Pending';
        }
        if (normalized.paid === undefined || normalized.paid === null) {
            normalized.paid = 0;
        }
        // Ensure items array and normalize each item
        if (!Array.isArray(normalized.items)) {
            normalized.items = [];
        }
        normalized.items = normalized.items.map(function(it) {
            var prc = Number(it.price || it.unitPrice || it.unit_price || 0);
            var qty = Number(it.quantity) || 1;
            return {
                name: it.name || it.description || '',
                description: it.description || it.name || '',
                quantity: qty,
                price: prc,
                unitPrice: prc,
                total: Number(it.total) || (qty * prc),
                unit: String(it.unit || 'unit'),
                productId: it.productId || 0
            };
        });
        return normalized;
    }

    /* === Sync helpers (outer scope, shared by _syncSrvActionToLocal and _renderSrvActionBlock) === */

    function _getSyncCompanyId() {
        try {
            var s = JSON.parse(ZS.getItem('zeralda-settings') || '{}');
            return String(s.activeCompanyId || 'default-company');
        } catch (e) { return 'default-company'; }
    }

    function _getSyncPurchasingKey() {
        return 'zeralda-purchasing-data::' + _getSyncCompanyId();
    }

    // Nested keys: stored inside zeralda-purchasing-data object
    var SYNC_NESTED = {
        'suppliers-data':    { parent: _getSyncPurchasingKey, field: 'suppliers' },
        'purchase-orders':   { parent: _getSyncPurchasingKey, field: 'orders' },
        'purchase-bills':    { parent: _getSyncPurchasingKey, field: 'bills' },
        'purchase-payments': { parent: _getSyncPurchasingKey, field: 'payments' }
    };

    var _DEDUP_FIELDS = ['name', 'company', 'code', 'number', 'invoiceNumber', 'email', 'phone', 'reference', 'ref', 'barcode', 'sku', 'employeeId', 'nationalId'];

    function _isDuplicateRecord(storageKey, rec) {
        // For nested keys (suppliers, purchase-bills, etc.), read from the parent object
        var nested = SYNC_NESTED[storageKey];
        var existing = [];
        if (nested) {
            var parentKey = nested.parent();
            try {
                var parentData = JSON.parse(ZS.getItem(parentKey) || 'null');
                if (parentData && typeof parentData === 'object') {
                    existing = Array.isArray(parentData[nested.field]) ? parentData[nested.field] : [];
                }
            } catch (e) { existing = []; }
        } else {
            try { existing = JSON.parse(ZS.getItem(storageKey)) || []; } catch (e) { existing = []; }
        }
        if (!Array.isArray(existing)) return false;
        // Build a map of non-empty unique-field values from rec (lowercased for string fields)
        var recValues = {};
        _DEDUP_FIELDS.forEach(function(field) {
            var val = rec[field];
            if (val !== undefined && val !== null && String(val).trim() !== '') {
                recValues[field] = String(val).trim().toLowerCase();
            }
        });
        if (Object.keys(recValues).length === 0) return false; // nothing to compare
        for (var i = 0; i < existing.length; i++) {
            var ex = existing[i];
            if (!ex || typeof ex !== 'object') continue;
            for (var field in recValues) {
                var exVal = ex[field];
                if (exVal !== undefined && exVal !== null && String(exVal).trim().toLowerCase() === recValues[field]) {
                    return true;
                }
            }
            // Also check id as a fallback
            if (rec.id && String(ex.id || '') === String(rec.id)) return true;
        }
        return false;
    }

    function _appendRecord(storageKey, rec) {
        // Check if nested key
        var nested = SYNC_NESTED[storageKey];
        if (nested) {
            var parentKey = nested.parent();
            var parentData = null;
            try { parentData = JSON.parse(ZS.getItem(parentKey) || 'null'); } catch(e) {}
            if (!parentData || typeof parentData !== 'object') {
                parentData = { orders: [], suppliers: [], bills: [], payments: [] };
            }
            if (!Array.isArray(parentData[nested.field])) parentData[nested.field] = [];
            // Dedup check for nested keys
            if (_isDuplicateRecord(storageKey, rec)) {
                console.log('[AI Sync] Skipped duplicate record for nested key:', storageKey);
                return;
            }
            parentData[nested.field].push(rec);
            ZS.setItem(parentKey, JSON.stringify(parentData));
            window.dispatchEvent(new StorageEvent('storage', { key: parentKey, newValue: JSON.stringify(parentData) }));
            console.log('[AI] Synced to nested key:', parentKey, '->', nested.field, 'total:', parentData[nested.field].length);
            return;
        }
        // Standard flat array
        var existing = [];
        try { existing = JSON.parse(ZS.getItem(storageKey)) || []; } catch (e) { existing = []; }
        if (!Array.isArray(existing)) existing = [];
        // Deduplication check
        if (_isDuplicateRecord(storageKey, rec)) {
            console.log('[AI Sync] Skipped duplicate record for', storageKey, '— name/code/number already exists');
            return;
        }
        existing.push(rec);
        ZS.setItem(storageKey, JSON.stringify(existing));
        console.log('[AI Sync] _appendRecord:', storageKey, 'records after push:', existing.length, 'scopedKey:', (window.scopedStorageKey ? window.scopedStorageKey(storageKey) : 'N/A'));
        window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: JSON.stringify(existing) }));
        console.log('[AI] Synced to ZS:', storageKey, 'total:', existing.length);
    }

    function _updateRecord(storageKey, recordId, updates) {
        var nested = SYNC_NESTED[storageKey];
        if (nested) {
            var parentKey = nested.parent();
            var parentData = null;
            try { parentData = JSON.parse(ZS.getItem(parentKey) || 'null'); } catch(e) {}
            if (!parentData || typeof parentData !== 'object') return;
            var arr = parentData[nested.field] || [];
            for (var i = 0; i < arr.length; i++) {
                if (String(arr[i].id || '') === recordId || String(arr[i].code || '') === recordId || String(arr[i].sku || '') === recordId || String(arr[i].reference || '') === recordId || String(arr[i]._id || '') === recordId) {
                    for (var k in updates) { arr[i][k] = updates[k]; }
                    break;
                }
            }
            ZS.setItem(parentKey, JSON.stringify(parentData));
            window.dispatchEvent(new StorageEvent('storage', { key: parentKey, newValue: JSON.stringify(parentData) }));
            return;
        }
        var existing = [];
        try { existing = JSON.parse(ZS.getItem(storageKey)) || []; } catch (e) { existing = []; }
        if (Array.isArray(existing)) {
            for (var i = 0; i < existing.length; i++) {
                if (String(existing[i].id || '') === recordId || String(existing[i].code || '') === recordId || String(existing[i].sku || '') === recordId || String(existing[i].reference || '') === recordId || String(existing[i]._id || '') === recordId) {
                    for (var k in updates) { existing[i][k] = updates[k]; }
                    break;
                }
            }
            ZS.setItem(storageKey, JSON.stringify(existing));
            window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: JSON.stringify(existing) }));
        }
    }

    function _deleteRecord(storageKey, recordId) {
        var nested = SYNC_NESTED[storageKey];
        if (nested) {
            var parentKey = nested.parent();
            var parentData = null;
            try { parentData = JSON.parse(ZS.getItem(parentKey) || 'null'); } catch(e) {}
            if (!parentData || typeof parentData !== 'object') return;
            var arr = parentData[nested.field] || [];
            parentData[nested.field] = arr.filter(function(r) { return String(r.id || '') !== recordId && String(r.code || '') !== recordId && String(r.sku || '') !== recordId && String(r.reference || '') !== recordId && String(r._id || '') !== recordId; });
            ZS.setItem(parentKey, JSON.stringify(parentData));
            window.dispatchEvent(new StorageEvent('storage', { key: parentKey, newValue: JSON.stringify(parentData) }));
            return;
        }
        var existing = [];
        try { existing = JSON.parse(ZS.getItem(storageKey)) || []; } catch (e) { existing = []; }
        if (Array.isArray(existing)) {
            existing = existing.filter(function(r) { return String(r.id || '') !== recordId && String(r.code || '') !== recordId && String(r.sku || '') !== recordId && String(r.reference || '') !== recordId && String(r._id || '') !== recordId; });
            ZS.setItem(storageKey, JSON.stringify(existing));
            window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: JSON.stringify(existing) }));
        }
    }

    function _syncSrvActionToLocal(action, resultData) {
        var actionType = action.action;
        var args = action.args || {};
        // Merge top-level fields into args (same logic as _executeSrvAction)
        if (action.module && !args.module) args.module = action.module;
        if (action.record && !args.record) args.record = action.record;
        if (action.data && !args.record && !args.data) args.record = action.data;
        if (action.id && !args.id) args.id = action.id;
        if (action.key && !args.key) args.key = action.key;
        var record = args.record || args.data || action.record || action.data || {};

        if (actionType === 'module_append') {
            var module = (args.module || action.module || '').toLowerCase();
            var storageKey = _MODULE_KEY_MAP[module] || (module + '-data');
            console.log('[AI Sync] module_append:', { module: module, storageKey: storageKey, hasRecord: !!record, recordKeys: Object.keys(record || {}), resultData: resultData });
            if (!record.id && resultData.id) record.id = resultData.id;
            if (!record.createdAt) record.createdAt = new Date().toISOString();
            // Normalize invoice records to match sales module structure
            if (module === 'invoices' || module === 'invoice' || module === 'facture' || module === 'factures') {
                record = _normalizeInvoiceRecord(record);
                console.log('[AI Sync] Normalized invoice:', record);
            }
            // Auto-generate sequential product code (PRD-001, PRD-002, ...)
            // Always generate a unified code — ignore any code from the invoice/OCR
            // to ensure consistent, standardized product codes across the system.
            if (module === 'products' || module === 'product' || module === 'produits' || module === 'produit') {
                record.code = 'PRD-' + String(_getNextProductSeqNumber()).padStart(3, '0');
                console.log('[AI Sync] Auto-generated product code:', record.code);
            }
            _appendRecord(storageKey, record);
            // Direct UI refresh for invoice module
            if (storageKey === 'invoices-data' && typeof window.loadInvoicesTable === 'function') {
                setTimeout(function() {
                    try {
                        var stored = JSON.parse(ZS.getItem('invoices-data') || '[]');
                        if (Array.isArray(stored)) {
                            window.invoicesData = stored;
                            window.loadInvoicesTable();
                            console.log('[AI Sync] Directly refreshed invoices table, count:', stored.length);
                        }
                    } catch (e) { console.warn('[AI Sync] Failed to refresh invoices table:', e); }
                }, 100);
            }
            // Direct UI refresh for products module
            if (storageKey === 'products-data') {
                setTimeout(function() {
                    try {
                        var stored = JSON.parse(ZS.getItem('products-data') || '[]');
                        if (Array.isArray(stored)) {
                            window.productsData = stored;
                            if (typeof window.loadProductsFromStorage === 'function') window.loadProductsFromStorage();
                            if (typeof window.loadInventoryProducts === 'function') window.loadInventoryProducts();
                            if (typeof window.renderProductsTable === 'function') window.renderProductsTable();
                            console.log('[AI Sync] Directly refreshed products table, count:', stored.length);
                        }
                    } catch (e) { console.warn('[AI Sync] Failed to refresh products table:', e); }
                }, 100);
            }
            // Direct UI refresh for customers module
            if (storageKey === 'customers-data' && typeof window.loadCustomersTable === 'function') {
                setTimeout(function() {
                    try {
                        var stored = JSON.parse(ZS.getItem('customers-data') || '[]');
                        if (Array.isArray(stored)) {
                            window.customersData = stored;
                            window.loadCustomersTable();
                            console.log('[AI Sync] Directly refreshed customers table, count:', stored.length);
                        }
                    } catch (e) { console.warn('[AI Sync] Failed to refresh customers table:', e); }
                }, 100);
            }
            // Direct UI refresh for suppliers module
            if (storageKey === 'suppliers-data') {
                setTimeout(function() {
                    try {
                        var stored = JSON.parse(ZS.getItem('suppliers-data') || '[]');
                        if (Array.isArray(stored)) {
                            window.suppliersData = stored;
                            if (typeof window.renderSuppliers === 'function') window.renderSuppliers();
                            if (typeof window.loadSuppliersTable === 'function') window.loadSuppliersTable();
                            console.log('[AI Sync] Directly refreshed suppliers table, count:', stored.length);
                        }
                    } catch (e) { console.warn('[AI Sync] Failed to refresh suppliers table:', e); }
                }, 100);
            }
        }
        else if (actionType === 'module_update_record') {
            var module = (args.module || action.module || '').toLowerCase();
            var storageKey = _MODULE_KEY_MAP[module] || (module + '-data');
            var recordId = String(args.id || action.id || '');
            var updates = args.record || args.data || {};
            _updateRecord(storageKey, recordId, updates);
            console.log('[AI] Synced module_update_record:', storageKey);
        }
        else if (actionType === 'module_delete_record') {
            var module = (args.module || action.module || '').toLowerCase();
            var storageKey = _MODULE_KEY_MAP[module] || (module + '-data');
            var recordId = String(args.id || action.id || '');
            _deleteRecord(storageKey, recordId);
            console.log('[AI] Synced module_delete_record:', storageKey);
        }
        else if (actionType === 'store_append') {
            var storageKey = args.key || action.key || '';
            if (storageKey) {
                if (!record.id && resultData.id) record.id = resultData.id;
                if (!record.createdAt) record.createdAt = new Date().toISOString();
                _appendRecord(storageKey, record);
            }
        }
        else if (actionType === 'company_create') {
            // RADICAL FIX: zeralda-settings.companies is the canonical source.
            // zeralda-companies is kept as a shadow for backward compat.
            try {
                var newCompany = {
                    id: resultData.id || record.id || ('company_' + Date.now()),
                    name: record.name || '',
                    siege: record.siege || record.address || '',
                    address: record.address || record.siege || '',
                    rc: record.rc || '',
                    artNumber: record.artNumber || '',
                    nif: record.nif || '',
                    nis: record.nis || '',
                    ag: record.ag || '',
                    nin: record.nin || '',
                    phone: record.phone || '',
                    email: record.email || '',
                    website: record.website || '',
                    city: record.city || '',
                    country: record.country || '',
                    vat: record.vat || '',
                    bankName: record.bankName || '',
                    bankAccount: record.bankAccount || '',
                    rib: record.rib || '',
                    capital: record.capital || '',
                    logo: record.logo || '',
                    createdAt: record.createdAt || new Date().toISOString(),
                    updatedAt: record.updatedAt || new Date().toISOString()
                };
                var nameLower = String(newCompany.name || '').toLowerCase();

                // Primary: update zeralda-settings.companies (canonical source)
                var s = JSON.parse(ZS.getItem('zeralda-settings') || '{}');
                if (!Array.isArray(s.companies)) s.companies = [];
                var existsInSettings = s.companies.some(function(c) {
                    return String(c.name || '').toLowerCase() === nameLower;
                });
                if (!existsInSettings) {
                    s.companies.push(newCompany);
                    ZS.setItem('zeralda-settings', JSON.stringify(s));
                }

                // Shadow: update zeralda-companies for backward compat
                try {
                    var companiesRaw = ZS.getItem('zeralda-companies');
                    var companies = companiesRaw ? JSON.parse(companiesRaw) : [];
                    if (!Array.isArray(companies)) companies = [];
                    var exists = companies.some(function(c) {
                        return String(c.name || '').toLowerCase() === nameLower;
                    });
                    if (!exists) {
                        companies.push(newCompany);
                        ZS.setItem('zeralda-companies', JSON.stringify(companies));
                    }
                } catch (e) { console.warn('[AI Sync] shadow update failed:', e); }

                console.log('[AI Sync] company_create synced locally:', newCompany);
                // Refresh settings UI if open (renderCompaniesList + company count)
                try {
                    if (typeof window.renderCompaniesList === 'function') window.renderCompaniesList();
                    var _countEl = document.getElementById('companiesCount');
                    if (_countEl) _countEl.textContent = String(s.companies.length);
                    // Dispatch event so header company switcher can refresh
                    window.dispatchEvent(new CustomEvent('zeralda-companies-updated', {detail: {companies: s.companies}}));
                } catch (e) { console.warn('[AI Sync] renderCompaniesList refresh failed:', e); }
            } catch (e) { console.warn('[AI Sync] company_create sync failed:', e); }
        }
    }

    function _formatSrvResult(data) {
        if (!data.ok) return '❌ ' + (data.error || 'Error');
        if (data.users) {
            var lines = ['✅ ' + (data.count || data.users.length) + ' users:'];
            (data.users || []).forEach(function(u) {
                lines.push('  • ' + u.email + ' — ' + u.role + (u.active === false ? ' (inactive)' : ''));
            });
            return lines.join('\n');
        }
        if (data.summary) {
            var lines2 = ['✅ ERP Summary:'];
            Object.keys(data.summary).forEach(function(k) {
                lines2.push('  • ' + k + ': ' + data.summary[k]);
            });
            return lines2.join('\n');
        }
        if (data.data !== undefined) {
            var d = data.data;
            if (Array.isArray(d)) return '✅ ' + d.length + ' records (key: ' + data.key + '):\n' + JSON.stringify(d.slice(0, 5), null, 2).slice(0, 1200);
            return '✅ ' + JSON.stringify(d, null, 2).slice(0, 800);
        }
        if (data.id)      return '✅ Created — id: ' + data.id + (data.total ? ' (total: ' + data.total + ')' : '');
        if (data.updated !== undefined) return '✅ Updated ' + data.updated + ' record(s)';
        if (data.deleted !== undefined) return '✅ Deleted ' + data.deleted + ' record(s)';
        if (data.updated_section || data.updated) return '✅ Settings updated';
        return '✅ ' + (data.message || 'Done');
    }

    function _renderSrvActionBlock(actions, parentDiv, fromHistory) {
        if (!actions || !actions.length) return;
        var lang = getLang();
        var block = document.createElement('div');
        block.className = 'ai-action-block';
        block.style.borderColor = '#7c3aed';
        block.style.background = 'linear-gradient(135deg,#faf5ff,#ede9fe)';

        // Check for duplicates among extraction actions
        var _dupCount = 0;
        if (_requireConfirmExtraction) {
            actions.forEach(function(action) {
                if (action.action === 'module_append' && action.args && action.args.module) {
                    var storageKey = _MODULE_KEY_MAP[action.args.module] || (action.args.module + '-data');
                    if (action.args.record && _isDuplicateRecord(storageKey, action.args.record)) {
                        action._isDuplicate = true;
                        _dupCount++;
                    }
                }
            });
        }

        var title = document.createElement('div');
        title.className = 'ai-action-block-title';
        if (_requireConfirmExtraction) {
            title.innerHTML = '<i class="fas fa-file-import" style="color:#7c3aed"></i>' +
                (lang === 'ar' ? 'بيانات مستخرجة من ملف — بانتظار تأكيدك' : 'Extracted Data — Awaiting Your Confirmation');
        } else {
            title.innerHTML = '<i class="fas fa-server" style="color:#7c3aed"></i>' +
                (lang === 'ar' ? 'أوامر نظام — تم التنفيذ تلقائياً' : 'System Commands — Auto-Executed');
        }
        title.style.color = '#7c3aed';
        block.appendChild(title);

        // Show duplicate warning if any
        if (_dupCount > 0) {
            var dupWarn = document.createElement('div');
            dupWarn.style.cssText = 'margin-top:8px;padding:8px 12px;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;font-size:12px;color:#92400e;';
            dupWarn.innerHTML = '<i class="fas fa-exclamation-triangle" style="margin-right:4px"></i>' +
                (lang === 'ar'
                    ? 'تنبيه: ' + _dupCount + ' سجل مكرر تم اكتشافه (موجود مسبقاً في النظام). سيتم تخطيه عند الحفظ.'
                    : 'Warning: ' + _dupCount + ' duplicate record(s) detected (already exist in system). They will be skipped on save.');
            block.appendChild(dupWarn);
        }

        var _pendingFollowupCount = 0;
        var _totalActions = actions.length;
        var _completedActions = 0;
        var _autoActions = 0;
        var _autoCompleted = 0;

        function renderResult(action, result) {
            var resultMsg = _formatSrvResult(result);
            var resultEl = document.createElement('div');
            resultEl.style.cssText = 'margin-top:8px;padding:8px;background:#fff;border-radius:6px;font-size:12px;white-space:pre-wrap;font-family:monospace;color:' + (result.ok ? '#166534' : '#991b1b');
            resultEl.textContent = resultMsg;
            block.appendChild(resultEl);
            // Inject result into next AI context
            _messages.push({ role: 'system', content: '[Action result: ' + action.action + ']\n' + resultMsg });
            scrollToBottom();
            _completedActions++;
            var isAuto = _SRV_DESTRUCTIVE.indexOf(action.action) === -1;
            if (isAuto) _autoCompleted++;
            console.log('[AI Followup] Completed:', _completedActions, '/', _totalActions, 'auto:', _autoCompleted, '/', _autoActions, 'followupCount:', _autoFollowupCount, 'pending:', _autoFollowupPending);

            if (_autoCompleted >= _autoActions && _autoActions > 0 &&
                _autoFollowupCount < MAX_AUTO_FOLLOWUPS && !_autoFollowupPending) {
                _autoFollowupPending = true;
                _autoFollowupCount++;
                _loading = false;
                var sendBtn = document.getElementById('ai-chat-send-btn');
                var stopBtn1 = document.getElementById('ai-chat-stop-btn');
                if (sendBtn) { sendBtn.disabled = false; sendBtn.style.display = ''; }
                if (stopBtn1) stopBtn1.style.display = 'none';
                var followupPrompt = '[SYSTEM: All ' + _autoCompleted + ' auto-actions executed successfully. Review the results above and provide a brief summary to the user. If any action failed, explain why and suggest a fix. Do NOT output any more [SRVEXEC:...] or [EXEC:...] tags — just summarize the results in the user\'s language.]';
                _messages.push({ role: 'user', content: followupPrompt });
                setTimeout(function() {
                    _autoFollowupPending = false;
                    _executePromptInternal(followupPrompt, _mode, { renderUser: false, force: true });
                }, 500);
                setTimeout(function() {
                    if (_autoFollowupPending) {
                        console.warn('[AI Followup] Safety timeout — resetting stuck followup');
                        _autoFollowupPending = false;
                        _loading = false;
                        var sb2 = document.getElementById('ai-chat-send-btn');
                        var stopBtn2 = document.getElementById('ai-chat-stop-btn');
                        if (sb2) { sb2.disabled = false; sb2.style.display = ''; }
                        if (stopBtn2) stopBtn2.style.display = 'none';
                    }
                }, 30000);
            } else if (_autoCompleted >= _autoActions && _autoActions > 0) {
                _loading = false;
                var sb = document.getElementById('ai-chat-send-btn');
                var stopBtn3 = document.getElementById('ai-chat-stop-btn');
                if (sb) { sb.disabled = false; sb.style.display = ''; }
                if (stopBtn3) stopBtn3.style.display = 'none';
            }
        }

        // For extraction with multiple actions, add "Confirm All" / "Cancel All" buttons
        var _confirmAllBtn = null;
        var _cancelAllBtn = null;
        if (_requireConfirmExtraction && actions.length > 1) {
            var allRow = document.createElement('div');
            allRow.className = 'ai-action-btns-row';
            allRow.style.cssText = 'margin-top:10px;padding:8px;background:#fff;border-radius:6px;';

            _confirmAllBtn = document.createElement('button');
            _confirmAllBtn.className = 'ai-action-confirm-btn';
            _confirmAllBtn.style.background = '#16a34a';
            _confirmAllBtn.innerHTML = '<i class="fas fa-check-double"></i>' + (lang === 'ar' ? 'تأكيد وحفظ الكل' : 'Confirm & Save All');

            _cancelAllBtn = document.createElement('button');
            _cancelAllBtn.className = 'ai-action-cancel-btn';
            _cancelAllBtn.style.background = '#6b7280';
            _cancelAllBtn.innerHTML = '<i class="fas fa-xmark"></i>' + (lang === 'ar' ? 'إلغاء الكل' : 'Cancel All');

            allRow.appendChild(_confirmAllBtn);
            allRow.appendChild(_cancelAllBtn);
            block.appendChild(allRow);
        }

        var _pendingActions = [];
        actions.forEach(function(action) {
            var isDestructive = _SRV_DESTRUCTIVE.indexOf(action.action) !== -1;
            // When extracting from files, require confirmation for module_append (data additions)
            var needsConfirm = isDestructive || (_requireConfirmExtraction && action.action === 'module_append');
            if (!needsConfirm) _autoActions++;
            var desc = document.createElement('div');
            desc.className = 'ai-action-desc';
            var _dupIcon = action._isDuplicate ? ' <i class="fas fa-copy" style="color:#f59e0b;margin-right:4px" title="' + (lang === 'ar' ? 'مكرر' : 'Duplicate') + '"></i>' : '';
            desc.innerHTML = (needsConfirm ? '<i class="fas fa-triangle-exclamation" style="color:#dc2626;margin-right:4px"></i>' : '<i class="fas fa-check-circle" style="color:#16a34a;margin-right:4px"></i>') +
                _dupIcon + _srvActionLabel(action);
            if (action._isDuplicate) {
                desc.style.background = '#fef3c7';
                desc.style.borderLeft = '3px solid #f59e0b';
            }
            block.appendChild(desc);

            // Destructive actions and file-extraction appends require confirmation; others run immediately
            if (needsConfirm) {
                var row = document.createElement('div');
                row.className = 'ai-action-btns-row';

                var confirmBtn = document.createElement('button');
                confirmBtn.className = 'ai-action-confirm-btn';
                confirmBtn.style.background = '#dc2626';
                confirmBtn.innerHTML = '<i class="fas fa-bolt"></i>' + (lang === 'ar' ? 'تنفيذ' : 'Execute');

                var cancelBtn = document.createElement('button');
                cancelBtn.className = 'ai-action-cancel-btn';
                cancelBtn.innerHTML = '<i class="fas fa-xmark"></i>' + (lang === 'ar' ? 'إلغاء' : 'Cancel');
                cancelBtn.addEventListener('click', function() { row.remove(); desc.style.opacity = '0.4'; });

                confirmBtn.addEventListener('click', function() {
                    confirmBtn.disabled = true;
                    cancelBtn.disabled = true;
                    confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>' + (lang === 'ar' ? 'جارٍ التنفيذ...' : 'Executing...');
                    _executeSrvAction(action, function(result) {
                        if (result.ok) {
                            confirmBtn.classList.add('done');
                            confirmBtn.innerHTML = '<i class="fas fa-check-double"></i>' + (lang === 'ar' ? 'تم' : 'Done!');
                            cancelBtn.style.display = 'none';
                        } else {
                            confirmBtn.classList.add('failed');
                            confirmBtn.innerHTML = '<i class="fas fa-times"></i>' + (lang === 'ar' ? 'فشل' : 'Failed');
                            cancelBtn.disabled = false;
                        }
                        renderResult(action, result);
                    });
                });

                row.appendChild(confirmBtn);
                row.appendChild(cancelBtn);
                block.appendChild(row);
                _pendingActions.push({ confirmBtn: confirmBtn, cancelBtn: cancelBtn, action: action, row: row, desc: desc });
            } else if (fromHistory) {
                // Already executed in a previous session — don't re-run
                var doneTag = document.createElement('div');
                doneTag.style.cssText = 'margin-top:6px;font-size:12px;color:#6b7280;font-style:italic;';
                doneTag.innerHTML = '<i class="fas fa-check-double" style="color:#16a34a;margin-right:4px"></i>' + (lang === 'ar' ? 'تم التنفيذ مسبقاً' : 'Already executed');
                block.appendChild(doneTag);
            } else {
                // Auto-execute non-destructive actions
                var spinner = document.createElement('div');
                spinner.style.cssText = 'margin-top:8px;font-size:12px;color:#6b7280;';
                spinner.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (lang === 'ar' ? 'جارٍ التنفيذ...' : 'Executing...');
                block.appendChild(spinner);
                _executeSrvAction(action, function(result) {
                    spinner.remove();
                    renderResult(action, result);
                });
            }
        });

        // Wire up "Confirm All" / "Cancel All" buttons
        if (_confirmAllBtn) {
            _confirmAllBtn.addEventListener('click', function() {
                _confirmAllBtn.disabled = true;
                _cancelAllBtn.disabled = true;
                _confirmAllBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>' + (lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...');
                _pendingActions.forEach(function(pa) {
                    if (!pa.confirmBtn.disabled) pa.confirmBtn.click();
                });
                setTimeout(function() {
                    _confirmAllBtn.innerHTML = '<i class="fas fa-check-double"></i>' + (lang === 'ar' ? 'تم حفظ الكل' : 'All Saved');
                    _cancelAllBtn.style.display = 'none';
                }, 2000);
            });
            _cancelAllBtn.addEventListener('click', function() {
                _pendingActions.forEach(function(pa) {
                    pa.row.remove();
                    pa.desc.style.opacity = '0.4';
                });
                _confirmAllBtn.style.display = 'none';
                _cancelAllBtn.style.display = 'none';
            });
        }

        // Reset the extraction flag after rendering
        _requireConfirmExtraction = false;

        parentDiv.appendChild(block);
        scrollToBottom();
    }

    function _formatWebSources(results) {
        if (!Array.isArray(results) || !results.length) return '';
        var lines = [t('sourcesLabel')];
        results.slice(0, 3).forEach(function (item) {
            var title = String(item && item.title || '').trim();
            var url = String(item && item.url || '').trim();
            if (title || url) lines.push('- ' + (title || url) + (url ? ' - ' + url : ''));
        });
        return lines.length > 1 ? '\n\n' + lines.join('\n') : '';
    }

    var _autoFollowupPending = false;
    var _autoFollowupCount = 0;
    var MAX_AUTO_FOLLOWUPS = 3;

    function _buildChatMessages(text, includeCurrentText) {
        var apiMessages = _messages
            .filter(function (m) { return m.role === 'user' || m.role === 'model' || m.role === 'system'; })
            .map(function (m) {
                if (m.role === 'system') {
                    return { role: 'user', content: m.content };
                }
                return { role: m.role, content: m.content };
            });

        if (includeCurrentText) {
            apiMessages.push({ role: 'user', content: text });
        }
        return apiMessages;
    }

    function _buildDataSummary() {
        var data = _collectLocalData();
        var LABELS = {
            'employees-data':        'الموظفون',
            'payroll-data':          'الرواتب',
            'products-data':         'المنتجات/السلع',
            'inventory-categories':  'تصنيفات المخزون',
            'stock-movements':       'حركات المخزون',
            'customers-data':        'العملاء',
            'invoices-data':         'الفواتير',
            'proformas-data':        'عروض الأسعار',
            'suppliers-data':        'الموردون',
            'purchases-data':        'المشتريات',
            'purchase-orders-data':  'أوامر الشراء',
            'finance-transactions':  'المعاملات المالية',
            'accounting-entries':    'القيود المحاسبية',
            'sales-data':            'المبيعات',
            'hr-leaves':             'الإجازات',
            'crm-opportunities':     'فرص البيع',
            'crm-contacts':          'جهات الاتصال',
            'consultations-data':    'الاستشارات',
            'tenders-data':          'المناقصات',
            'zeralda-services':      'الخدمات',
            'zeralda-purchasing-data': 'بيانات المشتريات'
        };
        var lines = [];
        var totalChars = 0;
        var MAX_TOTAL = 18000;

        Object.keys(LABELS).forEach(function(key) {
            if (totalChars >= MAX_TOTAL) return;
            var val = data[key];
            if (!val) return;
            var label = LABELS[key];
            try {
                var chunk = '';
                if (Array.isArray(val)) {
                    var total = val.length;
                    if (total === 0) return;
                    var sample = val.slice(0, 20);
                    var note = total > 20 ? ' (عرض 20 من ' + total + ')' : '';
                    chunk = '### ' + label + ' [' + total + ' سجل' + note + ']\n' + JSON.stringify(sample);
                } else if (val && typeof val === 'object') {
                    var raw = JSON.stringify(val);
                    chunk = '### ' + label + '\n' + raw.substring(0, 3000);
                } else {
                    return;
                }
                var allowed = MAX_TOTAL - totalChars;
                if (chunk.length > allowed) chunk = chunk.substring(0, allowed) + '...';
                lines.push(chunk);
                totalChars += chunk.length;
            } catch (e) {}
        });

        return lines.join('\n\n');
    }

    function _buildSystemPrompt(mode) {
        var context = _getContextSummaryText();
        var lang = getLang();

        var actionGuide = [
            '',
            '## ACTION CAPABILITIES',
            'Output action tags at the BEGINNING of response when user asks to add/delete/modify data.',
            'IMPORTANT: NEVER use [EXEC:...] for adding data. ALWAYS use [SRVEXEC:{"action":"module_append","args":{"module":"...","record":{...}}}] for ALL additions (products, suppliers, customers, employees, invoices, etc.).',
            'IMPORTANT: For update/delete operations, ALWAYS use [SRVEXEC:...] instead of [EXEC:...]. Server-side actions persist to the database. [EXEC:...] only updates browser localStorage and is unreliable.',
            '[EXEC:...] is DEPRECATED. Use [SRVEXEC:...] for ALL data operations (add/update/delete).',
            '',
            'SRVEXEC for update: [SRVEXEC:{"action":"module_update_record","args":{"module":"products","id":"PRD-0012026-1","record":{"price":295000}}}]',
            '  — id can be the record id, code, sku, or reference. The server matches against all these fields.',
            'SRVEXEC for delete: [SRVEXEC:{"action":"module_delete_record","args":{"module":"products","id":"PRD-0012026-1"}}]',
            '',
            'RULES: Always output [SRVEXEC:...] tag when adding data. Never say "done" without a tag. Multiple tags allowed in ONE response. If user asks for MULTIPLE items, output ALL [SRVEXEC:...] tags in the same response — do NOT process them one at a time. Put ALL [SRVEXEC:...] tags at the VERY BEGINNING of your response, one after another, BEFORE any text or explanation. Example: [SRVEXEC:{"action":"module_append","args":{"module":"suppliers","record":{"company":"...","phone":"...","email":"...","address":"...","rc":"...","nif":"...","contact":"..."}}}][SRVEXEC:{"action":"module_append","args":{"module":"suppliers","record":{"company":"...","phone":"...","email":"...","address":"...","rc":"...","nif":"...","contact":"..."}}}]Then add your explanation AFTER the tags. Respond in user\'s language (AR/FR/EN). IMPORTANT: For suppliers, use field name "company" (not "name") and "contact" (not "contactPerson"). IMPORTANT: For products, if no code is extracted from the file, LEAVE the "code" field EMPTY — the system will auto-generate a sequential code (PRD-001, PRD-002, ...). Do NOT invent codes like PRD-1785534426123.',
        ].join('\n');

        var srvActionGuide = [
            '',
            '## SERVER COMMANDS [SRVEXEC:{...}]',
            'Runs on server with admin privileges. Non-destructive (append/list/read/summary) auto-execute. Destructive (delete/write) need confirmation.',
            '',
            'Users: user_list|user_create|user_update|user_delete (args: email, name, role[admin|manager|user|viewer], password[8+ chars], data)',
            'Settings: settings_read (section: all|ai|general) | settings_update (section: ai|general|module|permissions, data:{...})',
            'Companies: company_read (list all companies) | company_create (data:{name,siege,address,phone,email,website,rc,nif,nis,artNumber,ag,city,country,vat,bankName,bankAccount,rib,capital,logo}) | company_update (id|name, data:{...})',
            'Store: store_read (key, limit, search) | store_append (key, record) | store_update_record (key, id|name, record) | store_delete_record (key, id|name) | store_write (key, value)',
            'Modules: products, suppliers, customers, invoices, employees, tenders, consultations, leaves, transactions, services',
            '  module_append (module, record) | module_list (module, limit, search) | module_update_record (module, id, record) | module_delete_record (module, id)',
            '  report_summary — counts across all modules',
            '',
            'FORMAT: {"action":"<type>","args":{"module":"...","record":{...}}} — module and record go INSIDE args.',
            '',
            'FILE PROCESSING: Extract all records from uploaded files. Output one [SRVEXEC:...] tag per record, ALL at the BEGINNING of your response, consecutively with no text between them. Then show summary table AFTER the tags.',
            '  customers→name,phone,email,address | suppliers→name,phone,email,address | products→name,code,price,quantity,category,unit | employees→name,position,salary,department,phone | invoices→number,customer,date,amount,items[{description,quantity,price,total,unit}]',
            '  IN INVOICES: SUPPLIER=issuer (top/header, has RC/NIF/NIS). CUSTOMER=buyer (after "Facturé à"/"Client"). Never add seller as customer.',
            '  IMPORTANT: When adding an invoice, ALSO add each line item as a product to inventory using [SRVEXEC:{"action":"module_append","args":{"module":"products","record":{"name":"...","price":...,"quantity":...,"category":"General","unit":"..."}}}] for EACH item. Output ALL product tags BEFORE the invoice tag. NEVER include the product code/ref (REF column) in the item description — only the product name.',
        ].join('\n');

        var dataSummary = _buildDataSummary();
        var dataSection = dataSummary
            ? '\n\n--- Company Data (localStorage) ---\n' + dataSummary + '\n--- End Data ---'
            : '\n\n(No local data — use [SRVEXEC:{"action":"store_read",...}] to read server data)';

        var langName = lang === 'ar' ? 'Arabic' : (lang === 'fr' ? 'French' : 'English');
        var langInstruction = '\n\n## LANGUAGE\nThe user\'s UI language is set to ' + langName + ' (' + lang.toUpperCase() + '). ALWAYS respond in ' + langName + ', regardless of the language the user types in. All explanations, summaries, and UI text must be in ' + langName + '.\n';

        var base = 'You are an ERP System Admin AI with FULL READ and WRITE access to all data, users, and settings.\n\nCurrent ERP context:\n' + context + dataSection + langInstruction + '\n' + actionGuide + '\n' + srvActionGuide;

        if (mode === 'web') {
            return base + '\n\nAlso search the web when relevant to supplement your answer.';
        }
        return base;
    }

    function _executePrompt(text, mode, options) {
        options = options || {};
        if (_loading) { console.log('[AI Execute] Blocked by _loading'); return; }
        text = String(text || '').trim();
        if (!text) { console.log('[AI Execute] Empty text, returning'); return; }

        setMode(mode || _mode);
        console.log('[AI Execute] _pendingFile:', !!_pendingFile, 'text:', text.substring(0, 100));

        // If a file is pending, process it alongside the prompt (same logic as sendMessage)
        if (_pendingFile) {
            var fileToSend = _pendingFile;
            var userQuestion = text;
            _pendingFile = null;
            var fi = document.getElementById('ai-file-input');
            if (fi) fi.value = '';

            var isTextFile = fileToSend.type && (fileToSend.type.startsWith('text') || fileToSend.name.match(/\.(txt|csv|json|xml|log|md|py|js|html|css)$/i));
            console.log('[AI Execute] File:', fileToSend.name, 'type:', fileToSend.type, 'isTextFile:', isTextFile, 'size:', fileToSend.size);

            if (isTextFile) {
                var reader = new FileReader();
                reader.onload = function (ev) {
                    var content = String(ev.target.result || '');
                    if (content.length > 6000) content = content.slice(0, 6000) + '\n...[truncated]';
                    var combined = '[FILE: ' + fileToSend.name + ']\n' + content + '\n[/FILE]\n\n' + userQuestion;
                    _executePromptInternal(combined, _mode, { renderUser: true, displayText: userQuestion + ' [+ ' + fileToSend.name + ']' });
                    _advanceFileQueue();
                };
                reader.onerror = function () {
                    _executePromptInternal(userQuestion, _mode, { renderUser: true });
                    _advanceFileQueue();
                };
                reader.readAsText(fileToSend);
            } else {
                _renderMessage('user', userQuestion + ' [+ ' + fileToSend.name + ']', false);
                showTyping(t('fileAnalyzing'));
                // Detect target module from user's prompt to choose correct analysis type
                // CRITICAL: Must detect French (client/fournisseur/employe/produit/facture),
                // Arabic (عميل/مورد/موظف/منتج/فاتورة), and English keywords.
                // STRATEGY: First try to extract module from SRVEXEC tag in the prompt
                // (most reliable — the tool prompts contain explicit module names).
                // Fall back to keyword detection for prompts without SRVEXEC tags.
                var _promptLower = (userQuestion || '').toLowerCase();
                var _analysisType = 'invoice'; // default
                var _targetModule = 'invoices';

                // Strategy 1: Extract module from SRVEXEC tag in the prompt
                var _srvexecMatch = (userQuestion || '').match(/\[SRVEXEC:.*?"module"\s*:\s*"([^"]+)"/i);
                var _srvActionMatch = (userQuestion || '').match(/\[SRVEXEC:.*?"action"\s*:\s*"([^"]+)"/i);
                if (_srvActionMatch && _srvActionMatch[1].toLowerCase() === 'company_create') {
                    _analysisType = 'suppliers'; _targetModule = 'suppliers';
                } else if (_srvexecMatch) {
                    var _srvModule = _srvexecMatch[1].toLowerCase();
                    if (_srvModule === 'customers' || _srvModule === 'clients' || _srvModule === 'client') {
                        _analysisType = 'customers'; _targetModule = 'customers';
                    } else if (_srvModule === 'suppliers' || _srvModule === 'fournisseurs' || _srvModule === 'supplier') {
                        _analysisType = 'suppliers'; _targetModule = 'suppliers';
                    } else if (_srvModule === 'products' || _srvModule === 'produits' || _srvModule === 'product') {
                        _analysisType = 'products'; _targetModule = 'products';
                    } else if (_srvModule === 'employees' || _srvModule === 'employes' || _srvModule === 'employee') {
                        _analysisType = 'employees'; _targetModule = 'employees';
                    } else if (_srvModule === 'invoices' || _srvModule === 'factures' || _srvModule === 'invoice') {
                        _analysisType = 'invoice'; _targetModule = 'invoices';
                    } else if (_srvModule === 'purchase-bills' || _srvModule === 'purchase_bills' || _srvModule === 'purchasebills' || _srvModule === 'bills') {
                        _analysisType = 'purchases'; _targetModule = 'purchase-bills';
                    } else if (_srvModule === 'purchase-orders' || _srvModule === 'purchase_orders' || _srvModule === 'purchaseorders' || _srvModule === 'orders') {
                        _analysisType = 'purchases'; _targetModule = 'purchase-orders';
                    }
                } else {
                    // Strategy 2: Keyword detection (for prompts without SRVEXEC tags, e.g. "Extraire donnees")
                    // Order matters: check general extraction FIRST (it mentions all types as examples),
                    // then facture BEFORE client (facture prompts mention "client" as a field)
                    if (_promptLower.indexOf('toutes les donnees') >= 0 || _promptLower.indexOf('all data') >= 0 || _promptLower.indexOf('جميع البيانات') >= 0 || _promptLower.indexOf('tableau organise') >= 0 || _promptLower.indexOf('organized table') >= 0) {
                        // "Extraire donnees du fichier" — general extraction (mentions all record types as examples)
                        _analysisType = 'general'; _targetModule = 'general';
                    } else if (_promptLower.indexOf('entreprise emettrice') >= 0 || _promptLower.indexOf('nouvelle entreprise') >= 0 || _promptLower.indexOf('creez une nouvelle entreprise') >= 0 || _promptLower.indexOf('شركة جديدة') >= 0 || _promptLower.indexOf('الشركة المصدرة') >= 0 || _promptLower.indexOf('الجهة المصدرة') >= 0 || _promptLower.indexOf('issuing company') >= 0 || _promptLower.indexOf('new company from') >= 0 || _promptLower.indexOf('company_create') >= 0) {
                        // Company extraction (issuer of the invoice, not customer)
                        _analysisType = 'suppliers'; _targetModule = 'suppliers';
                    } else if (_promptLower.indexOf('facture d achat') >= 0 || _promptLower.indexOf('facture fournisseur') >= 0 || _promptLower.indexOf('achat') >= 0 || _promptLower.indexOf('مشتريات') >= 0 || _promptLower.indexOf('فاتورة شراء') >= 0 || _promptLower.indexOf('فاتورة مورد') >= 0 || _promptLower.indexOf('purchase bill') >= 0 || _promptLower.indexOf('purchase-bill') >= 0 || _promptLower.indexOf('supplier invoice') >= 0 || _promptLower.indexOf('bon de commande') >= 0 || _promptLower.indexOf('purchase order') >= 0 || _promptLower.indexOf('أمر شراء') >= 0) {
                        // Purchase bills / purchase orders — from suppliers
                        _analysisType = 'purchases'; _targetModule = 'purchase-bills';
                    } else if (_promptLower.indexOf('facture') >= 0 || _promptLower.indexOf('invoice') >= 0 || _promptLower.indexOf('فاتورة') >= 0) {
                        _analysisType = 'invoice'; _targetModule = 'invoices';
                    } else if (_promptLower.indexOf('customer') >= 0 || _promptLower.indexOf('client') >= 0 || _promptLower.indexOf('عميل') >= 0 || _promptLower.indexOf('مشتري') >= 0 || _promptLower.indexOf('acheteur') >= 0) {
                        _analysisType = 'customers'; _targetModule = 'customers';
                    } else if (_promptLower.indexOf('supplier') >= 0 || _promptLower.indexOf('fournisseur') >= 0 || _promptLower.indexOf('مورد') >= 0 || _promptLower.indexOf('vendor') >= 0) {
                        _analysisType = 'suppliers'; _targetModule = 'suppliers';
                    } else if (_promptLower.indexOf('product') >= 0 || _promptLower.indexOf('produit') >= 0 || _promptLower.indexOf('منتج') >= 0 || _promptLower.indexOf('سلع') >= 0) {
                        _analysisType = 'products'; _targetModule = 'products';
                    } else if (_promptLower.indexOf('employee') >= 0 || _promptLower.indexOf('employe') >= 0 || _promptLower.indexOf('موظف') >= 0) {
                        _analysisType = 'employees'; _targetModule = 'employees';
                    } else if (_promptLower.indexOf('extraire') >= 0 || _promptLower.indexOf('extrayez') >= 0 || _promptLower.indexOf('استخرج') >= 0 || _promptLower.indexOf('extract') >= 0 || _promptLower.indexOf('donnee') >= 0 || _promptLower.indexOf('بيانات') >= 0) {
                        // "Extraire donnees du fichier" — general extraction
                        _analysisType = 'general'; _targetModule = 'general';
                    }
                }
                var r2 = new FileReader();
                r2.onload = function (ev) {
                    var fileBase64 = (ev.target.result || '').split(',')[1] || '';
                    console.log('[AI Execute] Analyzing file via /api/ai/analyze-file, base64 length:', fileBase64.length, 'analysisType:', _analysisType, 'targetModule:', _targetModule);
                    // Timeout + progress indicator for file analysis (free vision models can be slow)
                    var _analysisStart = Date.now();
                    var _analysisAbort = new AbortController();
                    var _analysisTimeoutId = setTimeout(function () { _analysisAbort.abort(); }, 120000);
                    var _analysisProgressTimer = setInterval(function () {
                        var elapsed = Math.floor((Date.now() - _analysisStart) / 1000);
                        if (elapsed < 120) {
                            updateTypingLabel(t('fileAnalyzing') + ' ' + elapsed + 's');
                        }
                    }, 3000);
                    fetch('/api/ai/analyze-file', {
                        method: 'POST',
                        headers: _authHeaders(),
                        body: JSON.stringify({ fileBase64: fileBase64, mimeType: fileToSend.type, fileName: fileToSend.name, analysisType: _analysisType, language: 'ara+fra+eng' }),
                        signal: _analysisAbort.signal
                    })
                    .then(function (r) {
                        clearTimeout(_analysisTimeoutId);
                        clearInterval(_analysisProgressTimer);
                        console.log('[AI Execute] analyze-file response status:', r.status);
                        return r.json();
                    })
                    .then(function (data) {
                        var fields = (data.analysis && data.analysis.fields) ? data.analysis.fields : {};
                        var lineItems = [];
                        if (data.analysis && Array.isArray(data.analysis.line_items)) {
                            lineItems = data.analysis.line_items;
                        } else if (Array.isArray(fields.line_items)) {
                            lineItems = fields.line_items;
                        } else if (Array.isArray(fields.items)) {
                            lineItems = fields.items;
                        }
                        console.log('[AI Execute] analyze-file result:', { ok: data.ok, textLen: (data.text||'').length, fields: Object.keys(fields), lineItemsCount: lineItems.length, engine: data.ocr_engine_used, error: data.error });
                        console.log('[AI Execute] FULL analysis object:', JSON.stringify(data.analysis).substring(0, 500));
                        console.log('[AI Execute] FULL fields object:', JSON.stringify(fields));

                        // ── ERROR HANDLING: If analyze-file failed, show clear message ──
                        if (!data.ok) {
                            hideTyping();
                            var lang = getLang();
                            var _err = data.error || '';
                            var errMsg;
                            if (_err.indexOf('429') >= 0 || _err.indexOf('quota') >= 0 || _err.toLowerCase().indexOf('quota') >= 0) {
                                errMsg = (lang === 'ar')
                                    ? '⚠️ **حصة Gemini API المجانية مستهلكة**\n\n'
                                      + 'مفتاحك صحيح لكنه مرتبط بـ **Free Tier** (حصة مجانية محدودة).\n\n'
                                      + '**لتفعيل اشتراكك PRO:**\n\n'
                                      + '1. اذهب إلى https://aistudio.google.com/apikey\n'
                                      + '2. سجّل الدخول بنفس حساب Google الذي دفعت به اشتراك PRO\n'
                                      + '3. أنشئ مفتاح API جديد\n'
                                      + '4. ضعه في **الإعدادات ← AI ← Gemini API Key**\n\n'
                                      + 'أو فعّل **Pay-as-you-go** من https://aistudio.google.com/billing\n\n'
                                      + '✅ للملفات النصية (CSV/Excel/PDF مع نص) الاستخراج يعمل بدون AI.'
                                    : '⚠️ **Quota Gemini API gratuit épuisé**\n\n'
                                      + 'Votre clé est valide mais liée au **Free Tier** (quota gratuit limité).\n\n'
                                      + '**Pour activer votre abonnement PRO:**\n\n'
                                      + '1. Allez sur https://aistudio.google.com/apikey\n'
                                      + '2. Connectez-vous avec le compte Google de votre abonnement PRO\n'
                                      + '3. Créez une nouvelle clé API\n'
                                      + '4. Mettez-la dans **Paramètres ← AI ← Clé API Gemini**\n\n'
                                      + 'Ou activez **Pay-as-you-go** sur https://aistudio.google.com/billing\n\n'
                                      + '✅ Pour les fichiers texte (CSV/Excel/PDF avec texte), l\'extraction fonctionne sans AI.';
                            } else if (_err.indexOf('API') >= 0 && _err.indexOf('key') >= 0) {
                                errMsg = (lang === 'ar')
                                    ? '⚠️ **مفتاح API غير صالح**\n\n'
                                      + 'تحقق من مفتاح Gemini API في الإعدادات ← AI.'
                                    : '⚠️ **Clé API invalide**\n\n'
                                      + 'Vérifiez votre clé Gemini API dans Paramètres ← AI.';
                            } else {
                                errMsg = (lang === 'ar')
                                    ? '⚠️ **تعذّر تحليل الملف**\n\n' + _err
                                    : '⚠️ **Impossible d\'analyser le fichier**\n\n' + _err;
                            }
                            _truncationRetryCount = 0;
                            _autoFollowupCount = MAX_AUTO_FOLLOWUPS;
                            _renderMessage('model', errMsg, false);
                            _advanceFileQueue();
                            return;
                        }

                        // ── FAST PATH: build SRVEXEC directly from structured analysis ──
                        // But ONLY for invoice imports. Other modules (customers, suppliers, products, employees)
                        // must go through the chat AI so the user's specific prompt instructions are followed.
                        // CRITICAL: Include French keywords (extrayez, ajoutez, donnees, client, etc.)
                        var _extractKeywords = [
                            'extract', 'استخرج', 'extraire', 'extrayez', 'import', 'استيراد',
                            'add to system', 'add to the system', 'أضف', 'ajoutez', 'ajouter',
                            'analyze', 'حلل', 'facture', 'فاتورة', 'invoice',
                            'بيانات', 'data', 'donnees', 'client', 'customer', 'عميل',
                            'fournisseur', 'supplier', 'مورد', 'produit', 'product', 'منتج',
                            'employe', 'employee', 'موظف',
                            'company', 'entreprise', 'شركة', 'company_create'
                        ];
                        var hasFields = fields.invoice_number || fields.invoice_date || fields.customer_name || fields.total || fields.document_number || fields.document_date || fields.total_ttc || fields.net_to_pay || fields.supplier_name || lineItems.length > 0;
                        var _isExtractRequest = !userQuestion || _extractKeywords.some(function(kw) { return userQuestion.toLowerCase().indexOf(kw) >= 0; });

                        // ── FAST PATH for MULTIPLE INVOICES from CSV: build SRVEXEC directly from records ──
                        if (data.ok && _isExtractRequest && _targetModule === 'invoices') {
                            var _invRecords = [];
                            if (data.analysis) {
                                if (Array.isArray(data.analysis.records)) _invRecords = data.analysis.records;
                            }
                            if (_invRecords.length > 1) {
                                hideTyping();
                                var lang = getLang();
                                var invTags = '';
                                var invAdded = 0;
                                _invRecords.forEach(function(rec) {
                                    if (!rec.number && !rec.customer) return;
                                    invTags += '[SRVEXEC:' + JSON.stringify({ action: 'module_append', args: { module: 'invoices', record: {
                                        invoiceNumber: String(rec.invoiceNumber || rec.number || ''),
                                        number: String(rec.number || rec.invoiceNumber || ''),
                                        customer: String(rec.customer || ''),
                                        date: String(rec.date || ''),
                                        total: Number(rec.total || rec.amount) || 0,
                                        amount: Number(rec.total || rec.amount) || 0,
                                        currency: String(rec.currency || 'DZD'),
                                        supplierName: String(rec.supplierName || ''),
                                        status: String(rec.status || 'Pending'),
                                        items: Array.isArray(rec.items) ? rec.items : []
                                    } } }) + ']';
                                    invAdded++;
                                });
                                var invSummary = (lang === 'ar')
                                    ? '✅ تم استخراج ' + invAdded + ' فاتورة من الملف وإضافتها للنظام:\n' + _invRecords.map(function(r, i) { return (i+1) + '. ' + (r.number || r.invoiceNumber || '') + ' — ' + (r.customer || '') + ' — ' + (r.total || 0); }).join('\n')
                                    : '✅ Extracted ' + invAdded + ' invoices from file and added to system:\n' + _invRecords.map(function(r, i) { return (i+1) + '. ' + (r.number || r.invoiceNumber || '') + ' — ' + (r.customer || '') + ' — ' + (r.total || 0); }).join('\n');
                                _truncationRetryCount = 0;
                                _autoFollowupCount = MAX_AUTO_FOLLOWUPS;
                                _requireConfirmExtraction = true;
                                _renderMessage('model', invTags + '\n\n' + invSummary, false);
                                _advanceFileQueue(lang === 'ar' ? 'استخرج بيانات الفواتير من هذا الملف وأضفها للنظام' : 'Extract invoice data from this file and add to system');
                                return;
                            }
                        }

                        // ── FAST PATH for SINGLE INVOICE: build SRVEXEC directly from structured analysis ──
                        if (data.ok && hasFields && _isExtractRequest && _targetModule === 'invoices') {
                            hideTyping();
                            // Map line items to ERP format
                            var items = lineItems.map(function(it) {
                                var prc = Number(it.unit_price || it.price || it.unitPrice || 0);
                                var qty = Number(it.quantity) || 1;
                                var tot = Number(it.total) || (qty * prc);
                                return {
                                    name: it.description || it.name || '',
                                    description: it.description || it.name || '',
                                    quantity: qty,
                                    price: prc,
                                    unitPrice: prc,
                                    total: tot,
                                    unit: String(it.unit || 'unit'),
                                    productId: 0
                                };
                            });
                            var calcTotal = items.reduce(function(s, i) { return s + (i.total || 0); }, 0);
                            var _supplierName = String(fields.supplier_name || fields.supplier || fields.company_name || fields.vendor || fields.seller || fields.emetteur || '');
                            var _customerName = String(fields.customer_name || fields.client || fields.buyer || fields.acheteur || fields.destinataire || fields.customer || '');
                            // If customer == supplier, it's a confusion — clear customer
                            if (_customerName && _customerName.toLowerCase() === _supplierName.toLowerCase()) {
                                console.warn('[AI] customer_name == supplier_name — clearing customer to avoid confusion');
                                _customerName = '';
                            }
                            var record = {
                                invoiceNumber: String(fields.invoice_number || fields.document_number || ''),
                                number: String(fields.invoice_number || fields.document_number || ''),
                                date: String(fields.invoice_date || fields.document_date || ''),
                                customer: _customerName,
                                supplierName: _supplierName,
                                items: items,
                                total: Number(fields.total || fields.total_ttc || fields.net_to_pay) || calcTotal || 0,
                                subtotal: Number(fields.subtotal || fields.total_ht || fields.total || fields.total_ttc) || calcTotal || 0,
                                tax: Number(fields.tax || fields.total_vat) || 0,
                                currency: String(fields.currency || 'DZD'),
                                status: 'Pending',
                                paid: 0
                            };
                            var lang = getLang();
                            var summary = (lang === 'ar')
                                ? '✅ تم استخراج الفاتورة من الملف:\n- رقم: ' + (record.number || '—') + '\n- التاريخ: ' + (record.date || '—') + '\n- العميل: ' + (record.customer || '—') + '\n- المجموع: ' + record.total + ' ' + record.currency + '\n- عدد البنود: ' + items.length + '\n- ✅ تم إضافة ' + items.length + ' منتج إلى المخزون'
                                : '✅ Invoice extracted from file:\n- N°: ' + (record.number || '—') + '\n- Date: ' + (record.date || '—') + '\n- Client: ' + (record.customer || '—') + '\n- Total: ' + record.total + ' ' + record.currency + '\n- Items: ' + items.length + '\n- ✅ Added ' + items.length + ' products to inventory';
                            // Build invoice SRVEXEC tag
                            var srvTag = '[SRVEXEC:' + JSON.stringify({ action: 'module_append', args: { module: 'invoices', record: record } }) + ']';
                            // Also build product SRVEXEC tags for each line item — add products to inventory
                            var productTags = '';
                            var _prodSeqStart = _getNextProductSeqNumber();
                            items.forEach(function(it, idx) {
                                if (it.name) {
                                    var _prodCode = 'PRD-' + String(_prodSeqStart + idx).padStart(3, '0');
                                    var prodRecord = {
                                        name: it.name,
                                        code: _prodCode,
                                        price: it.price || 0,
                                        quantity: it.quantity || 0,
                                        category: 'General',
                                        unit: it.unit || 'Piece',
                                        purchasePrice: 0,
                                        minStock: 0,
                                        maxStock: 0,
                                        brand: '',
                                        barcode: '',
                                        description: '',
                                        imageEmoji: '📦'
                                    };
                                    productTags += '[SRVEXEC:' + JSON.stringify({ action: 'module_append', args: { module: 'products', record: prodRecord } }) + ']';
                                }
                            });
                            _truncationRetryCount = 0;
                            _autoFollowupCount = MAX_AUTO_FOLLOWUPS; // prevent AI follow-up for fast-path
                            _requireConfirmExtraction = true;
                            _renderMessage('model', productTags + srvTag + '\n\n' + summary, false);
                            _advanceFileQueue();
                            return;
                        }

                        // ── FAST PATH for PRODUCTS: build SRVEXEC directly from line items ──
                        if (data.ok && lineItems.length > 0 && _isExtractRequest && _targetModule === 'products') {
                            hideTyping();
                            var lang = getLang();
                            var productTags = '';
                            var addedCount = 0;
                            var _prodSeqStart2 = _getNextProductSeqNumber();
                            lineItems.forEach(function(it, idx) {
                                var prodName = it.description || it.name || it.product_name || '';
                                if (!prodName) return;
                                var prc = Number(it.unit_price || it.price || it.unitPrice || 0);
                                var _prodCode2 = 'PRD-' + String(_prodSeqStart2 + idx).padStart(3, '0');
                                // Only name and price are imported from the file;
                                // other fields use system defaults (no quantity/code/category from file)
                                var prodRecord = {
                                    name: prodName,
                                    code: _prodCode2,
                                    price: prc,
                                    quantity: 0,
                                    category: 'General',
                                    unit: 'Piece',
                                    purchasePrice: prc,
                                    minStock: 0,
                                    maxStock: 0,
                                    brand: '',
                                    barcode: '',
                                    description: '',
                                    imageEmoji: '📦'
                                };
                                productTags += '[SRVEXEC:' + JSON.stringify({ action: 'module_append', args: { module: 'products', record: prodRecord } }) + ']';
                                addedCount++;
                            });
                            var prodSummary = (lang === 'ar')
                                ? '✅ تم استخراج ' + addedCount + ' منتج من الملف وإضافتهم إلى المخزون:\n' + lineItems.map(function(it, i) { return (i+1) + '. ' + (it.description || it.name || '') + ' — ' + (it.unit_price || it.price || 0); }).join('\n')
                                : '✅ Extracted ' + addedCount + ' products from file and added to inventory:\n' + lineItems.map(function(it, i) { return (i+1) + '. ' + (it.description || it.name || '') + ' — ' + (it.unit_price || it.price || 0); }).join('\n');
                            _truncationRetryCount = 0;
                            _autoFollowupCount = MAX_AUTO_FOLLOWUPS;
                            _requireConfirmExtraction = true;
                            _renderMessage('model', productTags + '\n\n' + prodSummary, false);
                            _advanceFileQueue();
                            return;
                        }

                        // ── FAST PATH for CUSTOMERS: build SRVEXEC directly from records ──
                        if (data.ok && _isExtractRequest && _targetModule === 'customers') {
                            var _records = [];
                            if (data.analysis) {
                                if (Array.isArray(data.analysis)) _records = data.analysis;
                                else if (Array.isArray(data.analysis.records)) _records = data.analysis.records;
                            }
                            if (_records.length > 0) {
                                hideTyping();
                                var lang = getLang();
                                var custTags = '';
                                var custAdded = 0;
                                _records.forEach(function(rec) {
                                    if (!rec.name) return;
                                    custTags += '[SRVEXEC:' + JSON.stringify({ action: 'module_append', args: { module: 'customers', record: {
                                        name: String(rec.name || ''),
                                        phone: String(rec.phone || ''),
                                        email: String(rec.email || ''),
                                        address: String(rec.address || ''),
                                        contactPerson: String(rec.contactPerson || ''),
                                        taxId: String(rec.taxId || '')
                                    } } }) + ']';
                                    custAdded++;
                                });
                                var custSummary = (lang === 'ar')
                                    ? '✅ تم استخراج ' + custAdded + ' عميل من الملف وإضافتهم للنظام:\n' + _records.map(function(r, i) { return (i+1) + '. ' + (r.name || '') + (r.phone ? ' — ' + r.phone : ''); }).join('\n')
                                    : '✅ Extracted ' + custAdded + ' customers from file and added to system:\n' + _records.map(function(r, i) { return (i+1) + '. ' + (r.name || '') + (r.phone ? ' — ' + r.phone : ''); }).join('\n');
                                _truncationRetryCount = 0;
                                _autoFollowupCount = MAX_AUTO_FOLLOWUPS;
                                _requireConfirmExtraction = true;
                                _renderMessage('model', custTags + '\n\n' + custSummary, false);
                                _advanceFileQueue();
                                return;
                            }
                        }

                        // ── FAST PATH for COMPANY CREATE: build company_create SRVEXEC directly from records/fields ──
                        var _isCompanyCreatePrompt = (userQuestion || '').indexOf('company_create') >= 0;
                        if (data.ok && _isExtractRequest && _isCompanyCreatePrompt) {
                            var _coRecords = [];
                            if (data.analysis) {
                                if (Array.isArray(data.analysis.records)) _coRecords = data.analysis.records;
                                else if (data.analysis.fields && typeof data.analysis.fields === 'object') _coRecords = [data.analysis.fields];
                            }
                            if (_coRecords.length > 0) {
                                hideTyping();
                                var lang = getLang();
                                var coTags = '';
                                var coAdded = 0;
                                _coRecords.forEach(function(rec) {
                                    var _coName = String(rec.name || rec.company || '').replace(/^-$/, '').trim();
                                    if (!_coName) return;
                                    var _clean = function(v) { v = String(v || '').trim(); return (v === '-' || v === '') ? '' : v; };
                                    coTags += '[SRVEXEC:' + JSON.stringify({ action: 'company_create', args: { data: {
                                        name: _coName,
                                        siege: _clean(rec.address || rec.siege),
                                        address: _clean(rec.address || rec.siege),
                                        phone: _clean(rec.phone),
                                        email: _clean(rec.email),
                                        website: _clean(rec.website),
                                        rc: _clean(rec.rc),
                                        nif: _clean(rec.nif),
                                        nis: _clean(rec.nis),
                                        artNumber: _clean(rec.artNumber || rec.art),
                                        ag: _clean(rec.ag),
                                        city: _clean(rec.city),
                                        country: _clean(rec.country || 'DZ'),
                                        vat: _clean(rec.vat),
                                        bankName: _clean(rec.bankName),
                                        bankAccount: _clean(rec.bankAccount),
                                        rib: _clean(rec.rib),
                                        capital: _clean(rec.capital)
                                    } } }) + ']';
                                    coAdded++;
                                });
                                if (coAdded > 0) {
                                    var coSummary = (lang === 'ar')
                                        ? '✅ تم استخراج بيانات الشركة من الملف وإنشاؤها في النظام:\n' + _coRecords.map(function(r, i) { return (i+1) + '. ' + (r.name || r.company || '') + (r.rc ? ' — RC: ' + r.rc : '') + (r.nif ? ' — NIF: ' + r.nif : ''); }).join('\n')
                                        : '✅ Société extraite du fichier et créée dans le système:\n' + _coRecords.map(function(r, i) { return (i+1) + '. ' + (r.name || r.company || '') + (r.rc ? ' — RC: ' + r.rc : '') + (r.nif ? ' — NIF: ' + r.nif : ''); }).join('\n');
                                    _truncationRetryCount = 0;
                                    _autoFollowupCount = MAX_AUTO_FOLLOWUPS;
                                    _requireConfirmExtraction = true;
                                    _renderMessage('model', coTags + '\n\n' + coSummary, false);
                                    _advanceFileQueue();
                                    return;
                                }
                            }
                        }

                        // ── FAST PATH for SUPPLIERS: build SRVEXEC directly from records ──
                        if (data.ok && _isExtractRequest && _targetModule === 'suppliers') {
                            var _supRecords = [];
                            if (data.analysis) {
                                if (Array.isArray(data.analysis)) _supRecords = data.analysis;
                                else if (Array.isArray(data.analysis.records)) _supRecords = data.analysis.records;
                            }
                            if (_supRecords.length > 0) {
                                hideTyping();
                                var lang = getLang();
                                var supTags = '';
                                var supAdded = 0;
                                var _supCodeCounter = 1;
                                _supRecords.forEach(function(rec) {
                                    var _supName = String(rec.name || rec.company || '');
                                    if (!_supName) return;
                                    var _supCode = 'SUP-' + String(Date.now() + _supCodeCounter).slice(-6);
                                    _supCodeCounter++;
                                    supTags += '[SRVEXEC:' + JSON.stringify({ action: 'module_append', args: { module: 'suppliers', record: {
                                        code: _supCode,
                                        company: _supName,
                                        contact: String(rec.contactPerson || rec.contact || ''),
                                        phone: String(rec.phone || ''),
                                        email: String(rec.email || ''),
                                        address: String(rec.address || ''),
                                        rc: String(rec.rc || ''),
                                        nif: String(rec.nif || ''),
                                        nis: String(rec.nis || ''),
                                        artNumber: String(rec.artNumber || ''),
                                        nin: String(rec.nin || ''),
                                        vat: String(rec.vat || ''),
                                        website: String(rec.website || ''),
                                        status: 'active',
                                        country: String(rec.country || 'DZ'),
                                        paymentTerms: 'net30',
                                        currency: 'DZD'
                                    } } }) + ']';
                                    supAdded++;
                                });
                                var supSummary = (lang === 'ar')
                                    ? '✅ تم استخراج ' + supAdded + ' مورد من الملف وإضافتهم للنظام:\n' + _supRecords.map(function(r, i) { return (i+1) + '. ' + (r.name || r.company || '') + (r.phone ? ' — ' + r.phone : ''); }).join('\n')
                                    : '✅ Extracted ' + supAdded + ' suppliers from file and added to system:\n' + _supRecords.map(function(r, i) { return (i+1) + '. ' + (r.name || r.company || '') + (r.phone ? ' — ' + r.phone : ''); }).join('\n');
                                _truncationRetryCount = 0;
                                _autoFollowupCount = MAX_AUTO_FOLLOWUPS;
                                _requireConfirmExtraction = true;
                                _renderMessage('model', supTags + '\n\n' + supSummary, false);
                                _advanceFileQueue();
                                return;
                            }
                        }

                        // ── FAST PATH for EMPLOYEES: build SRVEXEC directly from records ──
                        if (data.ok && _isExtractRequest && _targetModule === 'employees') {
                            var _empRecords = [];
                            if (data.analysis) {
                                if (Array.isArray(data.analysis)) _empRecords = data.analysis;
                                else if (Array.isArray(data.analysis.records)) _empRecords = data.analysis.records;
                            }
                            if (_empRecords.length > 0) {
                                hideTyping();
                                var lang = getLang();
                                var empTags = '';
                                var empAdded = 0;
                                _empRecords.forEach(function(rec) {
                                    if (!rec.name) return;
                                    empTags += '[SRVEXEC:' + JSON.stringify({ action: 'module_append', args: { module: 'employees', record: {
                                        name: String(rec.name || ''),
                                        position: String(rec.position || ''),
                                        salary: Number(rec.salary) || 0,
                                        department: String(rec.department || ''),
                                        phone: String(rec.phone || ''),
                                        email: String(rec.email || ''),
                                        hireDate: String(rec.hireDate || ''),
                                        employeeId: String(rec.employeeId || '')
                                    } } }) + ']';
                                    empAdded++;
                                });
                                var empSummary = (lang === 'ar')
                                    ? '✅ تم استخراج ' + empAdded + ' موظف من الملف وإضافتهم للنظام:\n' + _empRecords.map(function(r, i) { return (i+1) + '. ' + (r.name || '') + (r.position ? ' — ' + r.position : ''); }).join('\n')
                                    : '✅ Extracted ' + empAdded + ' employees from file and added to system:\n' + _empRecords.map(function(r, i) { return (i+1) + '. ' + (r.name || '') + (r.position ? ' — ' + r.position : ''); }).join('\n');
                                _truncationRetryCount = 0;
                                _autoFollowupCount = MAX_AUTO_FOLLOWUPS;
                                _requireConfirmExtraction = true;
                                _renderMessage('model', empTags + '\n\n' + empSummary, false);
                                _advanceFileQueue();
                                return;
                            }
                        }

                        // ── FAST PATH for GENERAL EXTRACTION: display records in table ──
                        if (data.ok && _isExtractRequest && _targetModule === 'general') {
                            var _genRecords = [];
                            if (data.analysis) {
                                if (Array.isArray(data.analysis)) _genRecords = data.analysis;
                                else if (Array.isArray(data.analysis.records)) _genRecords = data.analysis.records;
                                else if (Array.isArray(data.analysis.line_items)) _genRecords = data.analysis.line_items;
                            }
                            if (_genRecords.length > 0) {
                                hideTyping();
                                var lang = getLang();
                                // Build a markdown table from records
                                var allKeys = [];
                                _genRecords.forEach(function(r) {
                                    Object.keys(r).forEach(function(k) { if (allKeys.indexOf(k) < 0) allKeys.push(k); });
                                });
                                var tableHeader = '| # |' + allKeys.map(function(k) { return ' ' + k + ' |'; }).join('') + '\n|---|' + allKeys.map(function() { return '---|'; }).join('');
                                var tableRows = _genRecords.map(function(r, i) {
                                    return '| ' + (i+1) + ' |' + allKeys.map(function(k) {
                                        var v = String(r[k] !== undefined ? r[k] : '');
                                        return ' ' + (v.length > 50 ? v.substring(0, 47) + '...' : v) + ' |';
                                    }).join('');
                                }).join('\n');
                                var genSummary = (lang === 'ar')
                                    ? '✅ تم استخراج ' + _genRecords.length + ' سجل من الملف:\n\n' + tableHeader + '\n' + tableRows
                                    : '✅ Extracted ' + _genRecords.length + ' records from file:\n\n' + tableHeader + '\n' + tableRows;
                                _truncationRetryCount = 0;
                                _autoFollowupCount = MAX_AUTO_FOLLOWUPS;
                                _renderMessage('model', genSummary, false);
                                _advanceFileQueue();
                                return;
                            }
                        }

                        // ── FALLBACK: send raw text + analysis to chat AI ──
                        var parts = [];
                        var rawText = (data.text || '').trim();
                        if (rawText) parts.push(rawText);
                        if (data.analysis && Object.keys(fields).length > 0) {
                            parts.push('[EXTRACTED INVOICE FIELDS]\n' + JSON.stringify(fields, null, 2));
                        }
                        if (lineItems.length > 0) {
                            parts.push('[LINE ITEMS]\n' + JSON.stringify(lineItems, null, 2));
                        }
                        // Include summary/key_points from general/products analysis
                        if (!parts.length && data.analysis) {
                            if (data.analysis.summary) parts.push('[SUMMARY]\n' + data.analysis.summary);
                            if (Array.isArray(data.analysis.key_points) && data.analysis.key_points.length) {
                                parts.push('[KEY POINTS]\n' + data.analysis.key_points.join('\n'));
                            }
                            if (data.analysis.document_type) parts.push('[DOCUMENT TYPE]\n' + data.analysis.document_type);
                        }
                        if (!parts.length && data.analysis && data.analysis.raw_analysis) parts.push(data.analysis.raw_analysis);
                        var extracted = parts.join('\n\n');
                        if (!extracted) {
                            // AI Vision failed AND no analysis data — show a clear error to the user
                            // instead of sending "[No text extracted]" to the AI which says "file is empty"
                            hideTyping();
                            var lang = getLang();
                            var _visionErr = (data && data.analysis && data.analysis.error) ? data.analysis.error : '';
                            var _engineUsed = (data && data.ocr_engine_used) ? data.ocr_engine_used : '';
                            var errMsg = (lang === 'ar')
                                ? '⚠️ تعذّر استخراج البيانات من الملف. الأسباب المحتملة:\n\n'
                                  + '1. **مفتاح OpenRouter API غير صالح أو الحصة مستنفدة** — تحقق من الإعدادات ← AI\n'
                                  + '2. **الملف لا يحتوي على نص قابل للاستخراج** (صورة بدون نص واضح)\n\n'
                                  + (_visionErr ? '**خطأ AI Vision:** ' + _visionErr + '\n\n' : '')
                                  + (_engineUsed ? '**المحرك المستخدم:** ' + _engineUsed + '\n\n' : '')
                                  + 'الحل: اذهب إلى **الإعدادات ← AI** وتحقق من مفتاح OpenRouter API.'
                                : '⚠️ Impossible d\'extraire les données du fichier. Causes possibles :\n\n'
                                  + '1. **Clé OpenRouter API invalide ou quota épuisé** — vérifiez dans Paramètres ← AI\n'
                                  + '2. **Le fichier ne contient pas de texte extractible** (image sans texte clair)\n\n'
                                  + (_visionErr ? '**Erreur AI Vision:** ' + _visionErr + '\n\n' : '')
                                  + (_engineUsed ? '**Moteur utilisé:** ' + _engineUsed + '\n\n' : '')
                                  + 'Solution : allez dans **Paramètres ← AI** et vérifiez la clé OpenRouter API.';
                            _truncationRetryCount = 0;
                            _autoFollowupCount = MAX_AUTO_FOLLOWUPS;
                            _renderMessage('model', errMsg, false);
                            _advanceFileQueue();
                            return;
                        }
                        if (extracted.length > 6000) extracted = extracted.slice(0, 6000) + '\n...[truncated]';
                        var combined = '[FILE: ' + fileToSend.name + ']\n' + extracted + '\n[/FILE]\n\n' + userQuestion;
                        console.log('[AI Execute] Fallback to chat AI. Combined text length:', combined.length);
                        updateTypingLabel(t('thinking'));
                        _executePromptInternal(combined, _mode, { renderUser: false });
                        _advanceFileQueue();
                    })
                    .catch(function (err) {
                        clearTimeout(_analysisTimeoutId);
                        clearInterval(_analysisProgressTimer);
                        console.error('[AI Execute] analyze-file failed:', err);
                        hideTyping();
                        if (err.name === 'AbortError') {
                            var lang0 = getLang();
                            var timeoutMsg = (lang0 === 'ar')
                                ? '⏱️ انتهى وقت تحليل الملف (120 ثانية). النموذج المجاني قد يكون بطيئاً أو محملاً. حاول مرة أخرى أو استخدم مزوداً آخر من الإعدادات.'
                                : (lang0 === 'fr')
                                    ? "⏱️ Le délai d'analyse du fichier a expiré (120s). Le modèle gratuit peut être lent ou surchargé. Réessayez ou utilisez un autre fournisseur dans les paramètres."
                                    : '⏱️ File analysis timed out (120s). The free model may be slow or overloaded. Try again or use a different provider in Settings.';
                            _renderMessage('model', timeoutMsg, false, false, false, t('badgeChat'));
                        } else {
                            _executePromptInternal(userQuestion, _mode, { renderUser: false });
                        }
                        _advanceFileQueue();
                    });
                };
                r2.onerror = function () { console.error('[AI Execute] FileReader error'); hideTyping(); _executePromptInternal(userQuestion, _mode, { renderUser: false }); _advanceFileQueue(); };
                r2.readAsDataURL(fileToSend);
            }
            return;
        }

        _executePromptInternal(text, mode, options);
    }

    function _executePromptInternal(text, mode, options) {
        options = options || {};
        if (_loading && !options.force) {
            console.log('[AI] _executePromptInternal blocked by _loading');
            return;
        }
        text = String(text || '').trim();
        if (!text) return;

        setMode(mode || _mode);

        var displayText = options.displayText || text;
        if (options.renderUser !== false) {
            _renderMessage('user', displayText, _mode === 'search' || _mode === 'web', false, false, _mode === 'web' ? t('badgeWeb') : (_mode === 'search' ? t('badgeSearch') : t('badgeChat')));
        }

        _lastRequest = { text: text, mode: _mode };
        _loading = true;
        var sendBtn = document.getElementById('ai-chat-send-btn');
        var stopBtn = document.getElementById('ai-chat-stop-btn');
        if (sendBtn) { sendBtn.disabled = true; sendBtn.style.display = 'none'; }
        if (stopBtn) { stopBtn.style.display = ''; }

        if (_mode === 'search') {
            _sendSearch(text, options.renderUser === false);
        } else if (_mode === 'web') {
            _sendWeb(text, options.renderUser === false);
        } else {
            _sendChat(text, options.renderUser === false);
        }
    }

    function sendMessage() {
        var input = document.getElementById('ai-chat-input');
        var text = (input && input.value || '').trim();
        if (!text && !_pendingFile) return;

        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }

        // Force-reset loading state — follow-up may have left it stuck
        if (_loading) {
            console.warn('[AI] Force-resetting _loading (was stuck)');
            _loading = false;
            hideTyping();
            var sendBtn = document.getElementById('ai-chat-send-btn');
            var stopBtn = document.getElementById('ai-chat-stop-btn');
            if (sendBtn) { sendBtn.disabled = false; sendBtn.style.display = ''; }
            if (stopBtn) { stopBtn.style.display = 'none'; }
        }
        _autoFollowupCount = 0;
        _autoFollowupPending = false;
        _truncationRetryCount = 0;
        _executePrompt(text || (_pendingFile ? t('toolImportFileData') : ''), _mode, { renderUser: true });
    }

    var _streamSeq = 0;

    function _sendChat(text, appendCurrentUser) {
        showTyping(t('thinking'));

        var mySeq = ++_streamSeq;
        var messages = _buildChatMessages(text, appendCurrentUser);
        // Safety: if messages is empty (e.g. first message with appendCurrentUser=false),
        // ensure the current text is included so the API doesn't reject with 400.
        if (messages.length === 0 && text) {
            messages.push({ role: 'user', content: text });
        }
        var systemPrompt = _buildSystemPrompt('chat');

        console.log('[AI Send] appendCurrentUser:', appendCurrentUser, 'messages count:', messages.length);

        if (_currentAbortController) { try { _currentAbortController.abort(); } catch (e) {} }
        _currentAbortController = new AbortController();
        fetch('/api/ai/chat/stream', {
            method: 'POST',
            headers: _authHeaders(),
            body: JSON.stringify({
                messages: messages,
                system_prompt: systemPrompt,
                use_web: _mode === 'web'
            }),
            signal: _currentAbortController.signal
        }).then(function (r) {
            if (r.status === 401) {
                hideTyping();
                try { ZS.removeItem('zeralda-auth-token'); ZS.removeItem('zeralda-session-token'); } catch (_) {}
                _renderMessage('model', 'Session expired. Please log in again.', false);
                setTimeout(function() { window.location.href = 'login.html'; }, 2000);
                throw new Error('UNAUTHORIZED');
            }
            if (!r.body || !r.body.getReader) {
                return r.text().then(function (txt) {
                    hideTyping();
                    try {
                        var data = JSON.parse(txt);
                        if (data.ok) {
                            _renderMessage('model', data.reply || '', false, false, false, t('badgeChat'));
                        } else {
                            _renderMessage('model', data.error || 'Unknown error', false);
                        }
                    } catch (e) {
                        _renderMessage('model', t('errorNet'), false);
                    }
                }).then(_done, _done);
            }

            var container = document.getElementById('ai-chat-messages');
            var msgDiv = document.createElement('div');
            msgDiv.className = 'ai-msg model';
            msgDiv.style.display = 'none';
            var bodyDiv = document.createElement('div');
            bodyDiv.className = 'ai-msg-body';
            msgDiv.appendChild(bodyDiv);
            if (container) container.appendChild(msgDiv);

            var fullText = '';
            var reader = r.body.getReader();
            var decoder = new TextDecoder();
            var sseBuffer = '';
            var streamAborted = false;
            var firstChunkReceived = false;

            function processSSEBuffer() {
                while (sseBuffer.indexOf('\n\n') !== -1) {
                    var idx = sseBuffer.indexOf('\n\n');
                    var block = sseBuffer.substring(0, idx);
                    sseBuffer = sseBuffer.substring(idx + 2);
                    var lines = block.split('\n');
                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i].trim();
                        if (line.indexOf('data: ') === 0) {
                            try {
                                var event = JSON.parse(line.substring(6));
                                if (event.type === 'chunk' && event.text) {
                                    if (!firstChunkReceived) {
                                        firstChunkReceived = true;
                                        hideTyping();
                                        msgDiv.style.display = '';
                                    }
                                    fullText += event.text;
                                    bodyDiv.innerHTML = _formatContent(fullText);
                                    scrollToBottom();
                                } else if (event.type === 'done') {
                                    if (!firstChunkReceived) {
                                        firstChunkReceived = true;
                                        hideTyping();
                                        msgDiv.style.display = '';
                                    }
                                    fullText = event.text || fullText;
                                } else if (event.type === 'error') {
                                    hideTyping();
                                    if (msgDiv.parentNode) msgDiv.parentNode.removeChild(msgDiv);
                                    _renderMessage('model', event.error || t('errorNet'), false);
                                    _done();
                                    streamAborted = true;
                                    return;
                                }
                            } catch (e) { continue; }
                        }
                    }
                }
            }

            function readChunk() {
                if (streamAborted) return;
                reader.read().then(function (result) {
                    if (streamAborted) return;
                    if (result.done) {
                        if (!firstChunkReceived) {
                            hideTyping();
                        }
                        if (msgDiv && msgDiv.parentNode) {
                            msgDiv.parentNode.removeChild(msgDiv);
                        }
                        try {
                            if (fullText) {
                                _renderMessage('model', fullText, false, false, false, t('badgeChat'));
                            } else {
                                _renderMessage('model', t('errorNet'), false);
                            }
                        } catch (e) {
                            console.error('[AI Stream] _renderMessage threw:', e);
                        } finally {
                            _done();
                        }
                        return;
                    }
                    sseBuffer += decoder.decode(result.value, { stream: true });
                    processSSEBuffer();
                    readChunk();
                }).catch(function () {
                    hideTyping();
                    if (msgDiv && msgDiv.parentNode) {
                        msgDiv.parentNode.removeChild(msgDiv);
                    }
                    if (fullText) {
                        _renderMessage('model', fullText, false, false, false, t('badgeChat'));
                    } else {
                        _renderMessage('model', t('errorNet'), false);
                    }
                    _done();
                });
            }

            readChunk();
        }).catch(function (e) {
            if (e && e.message === 'UNAUTHORIZED') return;
            if (e && e.name === 'AbortError') { console.log('[AI] Chat stream aborted by user'); return; }
            hideTyping();
            _renderMessage('model', t('errorNet'), false);
            _done();
        });

        // Safety timeout: reset _loading after 90s if stream is stuck
        setTimeout(function() {
            if (_loading && mySeq === _streamSeq) {
                console.warn('[AI] Safety timeout — force-resetting _loading after 90s');
                hideTyping();
                _done();
            }
        }, 90000);
    }

    function _sendWeb(text, appendCurrentUser) {
        showTyping(t('webThinking'));
        var mySeq = ++_streamSeq;
        var messages = _buildChatMessages(text, appendCurrentUser);
        if (messages.length === 0 && text) {
            messages.push({ role: 'user', content: text });
        }
        var systemPrompt = _buildSystemPrompt('web');

        if (_currentAbortController) { try { _currentAbortController.abort(); } catch (e) {} }
        _currentAbortController = new AbortController();
        fetch('/api/ai/chat/stream', {
            method: 'POST',
            headers: _authHeaders(),
            body: JSON.stringify({
                messages: messages,
                system_prompt: systemPrompt,
                use_web: true
            }),
            signal: _currentAbortController.signal
        }).then(function (r) {
            if (r.status === 401) {
                hideTyping();
                try { ZS.removeItem('zeralda-auth-token'); ZS.removeItem('zeralda-session-token'); } catch (_) {}
                _renderMessage('model', 'Session expired. Please log in again.', false);
                setTimeout(function() { window.location.href = 'login.html'; }, 2000);
                throw new Error('UNAUTHORIZED');
            }
            if (!r.body || !r.body.getReader) {
                return r.text().then(function (txt) {
                    hideTyping();
                    try {
                        var data = JSON.parse(txt);
                        if (data.ok) {
                            _renderMessage('model', data.reply || '', true, false, false, t('badgeWeb'));
                        } else {
                            _renderMessage('model', data.error || 'Unknown error', false);
                        }
                    } catch (e) {
                        _renderMessage('model', t('errorNet'), false);
                    }
                }).then(_done, _done);
            }

            var container = document.getElementById('ai-chat-messages');
            var msgDiv = _renderMessage('model', '', true, true, false, t('badgeWeb'));
            var fullText = '';
            var reader = r.body.getReader();
            var decoder = new TextDecoder();
            var buffer = '';
            var actions = [];
            var srvActions = [];

            function processChunk() {
                while (true) {
                    var nlIdx = buffer.indexOf('\n');
                    if (nlIdx === -1) break;
                    var line = buffer.substring(0, nlIdx).trim();
                    buffer = buffer.substring(nlIdx + 1);
                    if (!line || line.startsWith(':')) continue;
                    if (line.startsWith('data: ')) {
                        try {
                            var evt = JSON.parse(line.substring(6));
                            if (evt.type === 'chunk') {
                                fullText += evt.text || '';
                                if (msgDiv) {
                                    var contentEl = msgDiv.querySelector('.ai-msg-content');
                                    if (contentEl) {
                                        contentEl.innerHTML = _formatMarkdown(fullText);
                                        scrollToBottom();
                                    }
                                }
                            } else if (evt.type === 'done') {
                                fullText = evt.text || fullText;
                                if (msgDiv) {
                                    var contentEl2 = msgDiv.querySelector('.ai-msg-content');
                                    if (contentEl2) {
                                        contentEl2.innerHTML = _formatMarkdown(fullText);
                                        scrollToBottom();
                                    }
                                }
                            } else if (evt.type === 'error') {
                                hideTyping();
                                if (msgDiv) msgDiv.remove();
                                _renderMessage('model', evt.error || 'Error', false, false, false, t('badgeWeb'));
                            }
                        } catch (e) {}
                    }
                }
            }

            function readChunk() {
                reader.read().then(function (chunk) {
                    if (chunk.done) {
                        if (buffer) {
                            var line = buffer.trim();
                            if (line.startsWith('data: ')) {
                                try {
                                    var evt = JSON.parse(line.substring(6));
                                    if (evt.type === 'done') {
                                        fullText = evt.text || fullText;
                                    }
                                } catch (e) {}
                            }
                        }
                        hideTyping();
                        if (fullText) {
                            actions = _parseActions(fullText);
                            srvActions = _parseSrvActions(fullText);
                            if (msgDiv) {
                                var contentEl = msgDiv.querySelector('.ai-msg-content');
                                if (contentEl) {
                                    var cleanText = fullText.replace(/\[EXEC:[^\]]+\]/g, '').replace(/\[SRVEXEC:[^\]]+\]/g, '').trim();
                                    contentEl.innerHTML = _formatMarkdown(cleanText);
                                }
                            }
                            if (actions.length) _renderActionBlock(actions, container);
                            // If file was attached and AI generated SRVEXEC tags, require confirmation
                            if (srvActions.length) {
                                if (_pendingFile || (_pendingFileQueue && _pendingFileQueue.length > 0)) {
                                    _requireConfirmExtraction = true;
                                }
                                _renderSrvActionBlock(srvActions, container);
                            }
                            _messages.push({ role: 'model', content: fullText });
                            _persistHistory();
                            scrollToBottom();
                        }
                        _done();
                        return;
                    }
                    buffer += decoder.decode(chunk.value, { stream: true });
                    processChunk();
                    readChunk();
                }).catch(function (err) {
                    hideTyping();
                    if (fullText) {
                        _messages.push({ role: 'model', content: fullText });
                        _persistHistory();
                    }
                    _done();
                });
            }
            readChunk();
        }).catch(function (e) {
            if (e && e.message === 'UNAUTHORIZED') return;
            if (e && e.name === 'AbortError') { console.log('[AI] Web stream aborted by user'); return; }
            hideTyping();
            _renderMessage('model', t('errorNet'), false);
            _done();
        });
    }

    function _sendSearch(query, appendCurrentUser) {
        showTyping(t('searching'));

        var contextData = _collectLocalData();
        var history = _messages
            .filter(function (m) { return m.role === 'user' || m.role === 'model'; })
            .slice(-10)
            .map(function (m) { return { role: m.role, content: m.content }; });

        if (appendCurrentUser) {
            history.push({ role: 'user', content: query });
        }
        // Safety: ensure at least the current query is present
        if (history.length === 0 && query) {
            history.push({ role: 'user', content: query });
        }

        if (_currentAbortController) { try { _currentAbortController.abort(); } catch (e) {} }
        _currentAbortController = new AbortController();
        fetch('/api/ai/company-search', {
            method: 'POST',
            headers: _authHeaders(),
            body: JSON.stringify({ query: query, context_data: contextData, history: history }),
            signal: _currentAbortController.signal
        })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                hideTyping();
                if (data.ok) {
                    _renderMessage('model', data.reply || '', true, false, false, t('badgeSearch'));
                } else {
                    _renderMessage('model', data.error || 'Unknown error', false);
                }
            })
            .catch(function (e) {
                if (e && e.name === 'AbortError') { console.log('[AI] Search aborted by user'); return; }
                hideTyping();
                _renderMessage('model', t('errorNet'), false);
            })
            .finally(_done);
    }

    function _done() {
        _loading = false;
        _currentAbortController = null;
        var sendBtn = document.getElementById('ai-chat-send-btn');
        var stopBtn = document.getElementById('ai-chat-stop-btn');
        if (sendBtn) { sendBtn.disabled = false; sendBtn.style.display = ''; }
        if (stopBtn) { stopBtn.style.display = 'none'; }
        var input = document.getElementById('ai-chat-input');
        if (input) input.focus();
        if (!_open) {
            var badge = document.getElementById('ai-fab-badge');
            if (badge) badge.style.display = 'block';
        }
    }

    function stopChat() {
        console.log('[AI] Stop button clicked — aborting current request');
        // Abort the current fetch request
        if (_currentAbortController) {
            try { _currentAbortController.abort(); } catch (e) {}
            _currentAbortController = null;
        }
        // Force-increment stream sequence to cancel any pending stream processing
        _streamSeq++;
        // Reset loading state and hide typing indicator
        hideTyping();
        _loading = false;
        var sendBtn = document.getElementById('ai-chat-send-btn');
        var stopBtn = document.getElementById('ai-chat-stop-btn');
        if (sendBtn) { sendBtn.disabled = false; sendBtn.style.display = ''; }
        if (stopBtn) { stopBtn.style.display = 'none'; }
        // Reset auto-followup state
        _autoFollowupCount = MAX_AUTO_FOLLOWUPS;
        _autoFollowupPending = false;
        _truncationRetryCount = 0;
        // Focus input for the next command
        var input = document.getElementById('ai-chat-input');
        if (input) input.focus();
    }

    // FIX P2: cleanup AbortControllers on page unload to prevent memory leaks.
    try {
        window.addEventListener('beforeunload', function () {
            if (_currentAbortController) {
                try { _currentAbortController.abort(); } catch (e) {}
                _currentAbortController = null;
            }
        });
    } catch (e) {}

    function clearChat() {
        // If current session is already empty/unused, don't create a duplicate new chat
        if (_messages.length === 0 && !_currentSessionId) {
            showWelcome();
            return;
        }
        _saveCurrentSession();
        _currentSessionId = null;
        _messages = [];
        _lastRequest = null;
        try {
            ZS.removeItem(CHAT_HISTORY_KEY());
            ZS.removeItem(CHAT_CURRENT_SESSION_KEY());
        } catch (e) {}
        var container = document.getElementById('ai-chat-messages');
        if (container) container.innerHTML = '';
        _renderSessionsList();
        showWelcome();
    }

    function regenerateLastAnswer() {
        if (!_lastRequest) {
            _renderMessage('model', t('regenerateEmpty'), false);
            return;
        }
        _executePrompt(_lastRequest.text, _lastRequest.mode, { renderUser: false });
    }

    function _copyToClipboard(text, button) {
        var done = function () {
            if (!button) return;
            var oldText = button.textContent;
            button.textContent = t('copied');
            setTimeout(function () {
                button.textContent = oldText;
            }, 1200);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(String(text || '')).then(done).catch(function () {
                _copyFallback(text, done);
            });
            return;
        }
        _copyFallback(text, done);
    }

    function _copyFallback(text, callback) {
        var area = document.createElement('textarea');
        area.value = String(text || '');
        area.setAttribute('readonly', 'readonly');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        try {
            document.execCommand('copy');
        } catch (e) {}
        area.remove();
        if (callback) callback();
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function applyLanguage() {
        var panel = document.getElementById('ai-chat-panel');
        if (!panel) return;
        panel.querySelector('.ai-chat-title').textContent = t('title');
        panel.querySelector('.ai-chat-subtitle').textContent = t('subtitle');
        panel.querySelector('.tab-chat-lbl').textContent = t('modeChat');
        panel.querySelector('.tab-web-lbl').textContent = t('modeWeb');
        panel.querySelector('.tab-search-lbl').textContent = t('modeSearch');
        panel.querySelector('#ai-chat-input').placeholder = t('placeholder');
        panel.querySelector('#ai-chat-send-btn').title = t('send');
        panel.querySelector('#ai-chat-stop-btn').title = t('stop');
        panel.querySelector('#ai-chat-new-btn').title = t('newChat');
        panel.querySelector('#ai-chat-retry-btn').title = t('regenerate');
        panel.querySelector('#ai-chat-close-btn').title = t('close');
        var hintEl = panel.querySelector('#ai-hint-text');
        if (hintEl) hintEl.textContent = (getLang() === 'ar') ? 'Enter للإرسال، Shift+Enter لسطر جديد' : 'Enter to send, Shift+Enter for new line';
        _buildChips();
        _buildToolsBar();
        _updateContextStrip();
    }

    function init() {
        try {
            if (!ENABLE_CHAT_PERSISTENCE) ZS.removeItem(CHAT_HISTORY_KEY());
        } catch (e) {}
        injectStyles();
        buildWidget();
        window.addEventListener('storage', function (ev) {
            if (ev.key === 'zeralda-active-company' || ev.key === 'preferred-language' || ev.key === 'language') {
                applyLanguage();
            }
            if (ev.key === 'zeralda-settings' || ev.key === 'zeralda-active-company') {
                _currentSessionId = null;
                _messages = [];
                var container = document.getElementById('ai-chat-messages');
                if (container) container.innerHTML = '';
                var loaded = _loadHistory();
                if (loaded && loaded.length > 0) {
                    _messages = loaded;
                    loaded.forEach(function (m) {
                        _renderMessage(m.role, m.content, m.isSearch || false, m.time, true, m.badgeText || '');
                    });
                    scrollToBottom();
                } else {
                    showWelcome();
                }
                _renderSessionsList();
            }
        });
        // Re-apply language when cache becomes ready (after page refresh,
        // ZS.getItem may return null during init, then cacheReady dispatches
        // zeraldaStoreChange with the correct values)
        document.addEventListener('zeraldaStoreChange', function (e) {
            try {
                var keys = (e && e.detail && Array.isArray(e.detail.keys)) ? e.detail.keys : [];
                var hasLang = keys.indexOf('preferred-language') !== -1 || keys.indexOf('zeralda-settings') !== -1;
                if (hasLang) applyLanguage();
            } catch (_) {}
        });
    }

    function startInit() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    // Wait for ZDB (IndexedDB cache) to be ready before init
    if (window.ZDB && window.ZDB.ready) {
        window.ZDB.ready().then(startInit).catch(startInit);
    } else {
        startInit();
    }
})();
