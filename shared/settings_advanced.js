/**
 * ⚙️ Advanced Settings Manager for Zeralda ERP
 * نظام الإعدادات المتقدم لـ Zeralda ERP
 * Version: 2.0 | Comprehensive & Modular
 */

(function () {
    'use strict';

    const SettingsManager = {
        // ════════════════════════════════════════════════════════════════════
        // 1️⃣ PERSONAL USER SETTINGS | إعدادات المستخدم الشخصية
        // ════════════════════════════════════════════════════════════════════

        savePersonalSettings: function() {
            const currentUser = JSON.parse(ZS.getItem('zeralda-current-user') || '{}');
            const userId = currentUser.id || 'default';

            // Helper: safely read a form element's value (returns null if missing)
            function val(id) {
                var el = document.getElementById(id);
                if (!el) return null;
                return (el.type === 'checkbox') ? el.checked : el.value;
            }

            const settings = {
                theme: val('themePreference') || 'light',
                language: ZS.getItem('preferred-language') || 'en',
                dateFormat: val('dateFormatPreference') || 'YYYY-MM-DD',
                timeFormat: val('timeFormatPreference') || '24h',
                timezone: val('timezonePreference') || 'Africa/Algiers',
                numberFormat: val('numberFormatPreference') || 'comma',
                currencyPrecision: val('currencyPrecision') || '2',
                autoSaveInterval: val('autoSaveInterval') || '30',
                sidebarPosition: val('sidebarPosition') || 'left',
                compactMode: val('compactModeToggle') || false,
                savedAt: new Date().toISOString()
            };

            ZS.setItem('zeralda-personal-settings-' + userId, JSON.stringify(settings));
            this.showSuccessMessage('Personal settings saved successfully! ✅');

            // Apply theme
            this.applyTheme(settings.theme);

            if (typeof window.saveSettings === 'function') {
                window.saveSettings({
                    preferredLanguage: settings.language,
                    dateFormat: settings.dateFormat,
                    timeFormat: settings.timeFormat === '12h' ? '12' : '24',
                    timezone: settings.timezone
                });
            }

            ZS.setItem('date-format', settings.dateFormat);
            ZS.setItem('time-format', settings.timeFormat === '12h' ? '12' : '24');
            ZS.setItem('timezone', settings.timezone);

            if (window.updateDateTime) window.updateDateTime();
        },

        // ════════════════════════════════════════════════════════════════════
        // 2️⃣ SYSTEM SETTINGS | إعدادات النظام العامة
        // ════════════════════════════════════════════════════════════════════

        saveSystemSettings: function() {
            function getVal(id, fallback) {
                var el = document.getElementById(id);
                if (!el) return fallback !== undefined ? fallback : '';
                return (el.type === 'checkbox') ? el.checked : el.value;
            }

            function getText(id, fallback) {
                var el = document.getElementById(id);
                if (!el) return fallback !== undefined ? fallback : '';
                return el.textContent || el.innerText || fallback || '';
            }

            var currentSettings = {};
            try {
                currentSettings = JSON.parse(ZS.getItem('zeralda-system-settings') || '{}');
            } catch (_) {}

            const settings = {
                systemName: getVal('systemName', currentSettings.systemName || 'Zeralda ERP'),
                systemVersion: getText('systemVersion', currentSettings.systemVersion || '3.0.0'),
                maintenanceMode: getVal('maintenanceMode', currentSettings.maintenanceMode || false),
                debugMode: getVal('debugMode', currentSettings.debugMode || false),
                autoBackup: getVal('autoBackup', currentSettings.autoBackup !== false),
                backupInterval: getVal('backupInterval', currentSettings.backupInterval || 'daily'),
                dataRetentionDays: getVal('dataRetentionDays', currentSettings.dataRetentionDays || '365'),
                maxUploadSize: getVal('maxUploadSize', currentSettings.maxUploadSize || '50'),
                sessionTimeout: getVal('sessionTimeout', currentSettings.sessionTimeout || '600'),
                twoFactorAuth: getVal('twoFactorAuth', currentSettings.twoFactorAuth || false),
                apiRateLimit: getVal('apiRateLimit', currentSettings.apiRateLimit || '100'),
                auditLogging: getVal('auditLogging', currentSettings.auditLogging !== false),
                updatedAt: new Date().toISOString()
            };

            ZS.setItem('zeralda-system-settings', JSON.stringify(settings));

            // Sync with canonical zeralda-settings
            try {
                var canonical = JSON.parse(ZS.getItem('zeralda-settings') || '{}');
                canonical.system = Object.assign({}, canonical.system || {}, settings);
                if (settings.systemName) canonical.systemName = settings.systemName;
                ZS.setItem('zeralda-settings', JSON.stringify(canonical));
            } catch (_) {}

            var isAr = (ZS.getItem('preferred-language') || 'ar') === 'ar';
            var msg = isAr ? 'تم حفظ إعدادات النظام بنجاح! ✅' : 'System settings saved successfully! ✅';
            this.showSuccessMessage(msg);
            
            // Apply maintenance mode warning
            if (settings.maintenanceMode) {
                var warnMsg = isAr ? '⚠️ تم تفعيل وضع الصيانة. سيتم إشعار المستخدمين.' : '⚠️ Maintenance mode is ENABLED. Users will be notified.';
                this.showWarningMessage(warnMsg);
            }
        },

        loadSystemSettings: function() {
            var settings = {};
            try {
                settings = JSON.parse(ZS.getItem('zeralda-system-settings') || '{}');
            } catch (_) {}

            function setVal(id, val) {
                var el = document.getElementById(id);
                if (!el || val === undefined || val === null) return;
                if (el.type === 'checkbox') el.checked = Boolean(val);
                else el.value = val;
            }

            function setText(id, text) {
                var el = document.getElementById(id);
                if (!el || text === undefined || text === null) return;
                el.textContent = text;
            }

            if (settings.systemName) setVal('systemName', settings.systemName);
            if (settings.systemVersion) setText('systemVersion', settings.systemVersion);
            if (settings.sessionTimeout) setVal('sessionTimeout', settings.sessionTimeout);
            if (settings.maxUploadSize) setVal('maxUploadSize', settings.maxUploadSize);
            if (settings.maintenanceMode !== undefined) setVal('maintenanceMode', settings.maintenanceMode);
            if (settings.twoFactorAuth !== undefined) setVal('twoFactorAuth', settings.twoFactorAuth);
            if (settings.auditLogging !== undefined) setVal('auditLogging', settings.auditLogging);
            if (settings.debugMode !== undefined) setVal('debugMode', settings.debugMode);
            if (settings.autoBackup !== undefined) setVal('autoBackup', settings.autoBackup);
            if (settings.backupInterval) setVal('backupInterval', settings.backupInterval);
            if (settings.dataRetentionDays) setVal('dataRetentionDays', settings.dataRetentionDays);
            if (settings.apiRateLimit) setVal('apiRateLimit', settings.apiRateLimit);
        },

        // ════════════════════════════════════════════════════════════════════
        // 3️⃣ MODULE SETTINGS | إعدادات الوحدات
        // ════════════════════════════════════════════════════════════════════

        /**
         * Load Module Settings
         * تحميل إعدادات الوحدات
         */
        loadModuleSettings: function() {
            const moduleSettings = JSON.parse(ZS.getItem('zeralda-module-settings') || '{}');

            const modules = [
                { id: 'crm', name: 'CRM' },
                { id: 'sales', name: 'Sales' },
                { id: 'purchasing', name: 'Purchasing' },
                { id: 'inventory', name: 'Inventory' },
                { id: 'finance', name: 'Finance' },
                { id: 'hr', name: 'HR' },
                { id: 'services', name: 'Services' },
                { id: 'consulting', name: 'Consulting' },
                { id: 'reports', name: 'Reports' }
            ];

            const container = document.getElementById('modulesSettingsContainer');
            if (!container) return;

            container.innerHTML = modules.map(mod => {
                const enabled = moduleSettings[mod.id] !== false;
                return `
                    <div style="display: grid; grid-template-columns: 1fr 200px; gap: 12px; align-items: center; padding: 12px; background: #f9fafb; border-radius: 8px; margin-bottom: 8px;">
                        <div>
                            <strong>${mod.name}</strong>
                            <small style="display: block; color: #6b7280; margin-top: 2px;">Click to configure module settings.</small>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <label style="display: flex; align-items: center; gap: 6px;">
                                <input type="checkbox" ${enabled ? 'checked' : ''} onchange="SettingsManager.toggleModuleEnabled('${mod.id}', this.checked)">
                                <span>${enabled ? 'Enabled' : 'Disabled'}</span>
                            </label>
                            <button class="btn btn-secondary" onclick="SettingsManager.openModuleSettings('${mod.id}')" style="padding: 6px 12px; font-size: 12px;">
                                <i class="fas fa-cog"></i> Configure
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        },

        /**
         * Toggle Module Enabled/Disabled
         * تفعيل/تعطيل الوحدة
         */
        toggleModuleEnabled: function(moduleId, enabled) {
            const moduleSettings = JSON.parse(ZS.getItem('zeralda-module-settings') || '{}');
            moduleSettings[moduleId] = enabled;
            ZS.setItem('zeralda-module-settings', JSON.stringify(moduleSettings));
            this.showSuccessMessage(`Module "${moduleId}" ${enabled ? 'enabled' : 'disabled'}`);
        },

        /**
         * Open Module Configuration
         * فتح إعدادات الوحدة
         */
        openModuleSettings: function(moduleId) {
            const moduleConfig = JSON.parse(ZS.getItem(`zeralda-module-config-${moduleId}`) || '{}');
            console.log(`Opening settings for module: ${moduleId}`, moduleConfig);
            this.showInfoMessage(`Configure settings for ${moduleId} module.`);
        },

        // ════════════════════════════════════════════════════════════════════
        // 6️⃣ BACKUP & RESTORE | النسخ الاحتياطية والاستعادة
        // ════════════════════════════════════════════════════════════════════

        _getAuthHeaders: function() {
            if (window.ZeraldaAuth) {
                return window.ZeraldaAuth.buildAuthHeaders({ 'Content-Type': 'application/json' });
            }
            const token = ZS.getItem('zeralda-session-token')
                || ZS.getItem('zeralda-auth-token')
                || '';
            const h = { 'Content-Type': 'application/json' };
            if (token) { h['Authorization'] = 'Bearer ' + token; h['X-Session-Token'] = token; }
            return h;
        },

        _triggerDownload: function(fileName, jsonStr) {
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url; a.download = fileName;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },

        /**
         * Create Backup — شامل لبيانات السيرفر و localStorage
         */
        createBackup: async function() {
            this.showInfoMessage('جاري إنشاء النسخة الاحتياطية...');
            try {
                const headers = this._getAuthHeaders();

                // 1. جلب بيانات السيرفر كاملة
                let serverStore = {};
                let aiSettings  = {};
                try {
                    const r = await fetch('/api/backup', { headers, cache: 'no-store', credentials: 'omit' });
                    if (r.ok) {
                        const parsed = await r.json();
                        serverStore = parsed.store       || {};
                        aiSettings  = parsed.ai_settings || {};
                    }
                } catch (_) {
                    // Fallback: جلب /api/store مباشرةً
                    try {
                        const r2 = await fetch('/api/store', { headers, cache: 'no-store', credentials: 'omit' });
                        if (r2.ok) { const d = await r2.json(); serverStore = d.data || {}; }
                    } catch (_2) { /* تجاهل */ }
                }

                // 2. جمع جميع بيانات localStorage تلقائياً (لا قائمة ثابتة)
                const _skipPatterns = ['google-token', 'google-contact-sync', 'drive-search', 'temp-', 'cache-', 'session-', '-draft-'];
                const localData = {};
                for (let _i = 0; _i < ZS.length; _i++) {
                    const _k = ZS.key(_i);
                    if (!_k) continue;
                    if (_skipPatterns.some(p => _k.indexOf(p) !== -1)) continue;
                    const _v = ZS.getItem(_k);
                    if (_v !== null) localData[_k] = _v;
                }

                const timestamp = new Date().toISOString();
                const backupData = {
                    schema: '3.0',
                    timestamp,
                    store: serverStore,
                    ai_settings: aiSettings,
                    localStorage: localData
                };

                const dataStr  = JSON.stringify(backupData, null, 2);
                const fileName = `zeralda-backup-${timestamp.split('T')[0]}.json`;
                this._triggerDownload(fileName, dataStr);

                this.showSuccessMessage('✅ تم إنشاء النسخة الاحتياطية وتنزيلها!');
                this.addBackupToHistory({ timestamp, size: dataStr.length, keys: Object.keys(serverStore).length });
            } catch (err) {
                this.showErrorMessage('فشل إنشاء النسخة الاحتياطية: ' + err.message);
            }
        },

        /**
         * Add Backup to History
         */
        addBackupToHistory: function(entry) {
            const history = JSON.parse(ZS.getItem('zeralda-backup-history') || '[]');
            history.push({
                timestamp: entry.timestamp,
                size:      entry.size  || 0,
                keys:      entry.keys  || 0,
                status:    'completed'
            });
            if (history.length > 20) history.shift();
            ZS.setItem('zeralda-backup-history', JSON.stringify(history));
            this.viewBackupHistory();
        },

        /**
         * View Backup History
         */
        viewBackupHistory: function() {
            const raw = ZS.getItem('zeralda-backup-history');
            const history = raw ? JSON.parse(raw) : [];
            const container = document.getElementById('backupHistoryList');
            if (!container) return;
            if (!history.length) {
                container.innerHTML = '<p style="color:#6b7280;font-size:13px;padding:8px 0;">لا توجد نسخ احتياطية مسجّلة.</p>';
                return;
            }
            container.innerHTML = history.slice().reverse().map((backup, index) => `
                <div style="display:grid;grid-template-columns:1fr 110px 100px;gap:10px;padding:10px 12px;background:#f9fafb;border-radius:8px;margin-bottom:8px;align-items:center;border:1px solid #e5e7eb;">
                    <div>
                        <strong style="font-size:13px;">#${history.length - index}</strong>
                        <small style="display:block;color:#6b7280;font-size:11px;">${new Date(backup.timestamp).toLocaleString()}</small>
                        ${backup.keys ? `<small style="color:#9ca3af;font-size:10px;">${backup.keys} مجموعة بيانات</small>` : ''}
                    </div>
                    <div style="text-align:center;">
                        <span style="background:#e5e7eb;padding:3px 8px;border-radius:4px;font-size:11px;">
                            ${((backup.size || 0) / 1024).toFixed(1)} KB
                        </span>
                    </div>
                    <div>
                        <span style="font-size:11px;color:#10b981;"><i class="fas fa-check-circle"></i> مكتمل</span>
                    </div>
                </div>
            `).join('');
        },

        // ════════════════════════════════════════════════════════════════════
        // THEME MANAGEMENT | إدارة المواضيع
        // ════════════════════════════════════════════════════════════════════

        /**
         * Apply Theme
         * تطبيق المظهر — يستخدم data-theme attribute على <html>
         * يتم تطبيق التجاوزات الشاملة من styles/dark_theme.css
         */
        applyTheme: function(theme) {
            // Use the shared theme manager if available
            if (window.ZeraldaTheme && window.ZeraldaTheme.apply) {
                window.ZeraldaTheme.apply(theme || 'light');
                return;
            }
            // Fallback (legacy) — direct attribute manipulation
            var root = document.documentElement;
            var resolved = theme;
            if (theme === 'auto' || !theme) {
                if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    resolved = 'dark';
                } else {
                    resolved = 'light';
                }
            }
            root.setAttribute('data-theme', resolved);
            // Theme is persisted via cookie by ZeraldaTheme.apply() — no localStorage needed
            try {
                var d = new Date();
                d.setTime(d.getTime() + (365 * 24 * 60 * 60 * 1000));
                document.cookie = 'zeralda-theme=' + encodeURIComponent(theme || 'light') + '; expires=' + d.toUTCString() + '; path=/; SameSite=Strict';
            } catch (_) {}
        },

        /**
         * Load Personal Settings
         * تحميل الإعدادات الشخصية المحفوظة وملء النموذج
         */
        loadPersonalSettings: function() {
            var currentUser = {};
            try { currentUser = JSON.parse(ZS.getItem('zeralda-current-user') || '{}'); } catch (_) {}
            var userId = currentUser.id || 'default';
            var settings = {};
            try { settings = JSON.parse(ZS.getItem('zeralda-personal-settings-' + userId) || '{}'); } catch (_) {}

            // Populate theme dropdown
            var themeEl = document.getElementById('themePreference');
            if (themeEl) {
                var savedTheme = settings.theme || (window.ZeraldaTheme ? window.ZeraldaTheme.getSaved() : null) || 'light';
                themeEl.value = savedTheme;
            }

            // Populate other fields
            var fields = {
                'dateFormatPreference': settings.dateFormat || ZS.getItem('date-format') || 'YYYY-MM-DD',
                'timeFormatPreference': settings.timeFormat || (ZS.getItem('time-format') === '12' ? '12h' : '24h'),
                'timezonePreference': settings.timezone || 'Africa/Algiers',
                'numberFormatPreference': settings.numberFormat || 'comma',
                'currencyPrecision': settings.currencyPrecision || '2',
                'autoSaveInterval': settings.autoSaveInterval || '30',
                'sidebarPosition': settings.sidebarPosition || 'left',
                'compactModeToggle': settings.compactMode || false
            };
            Object.keys(fields).forEach(function(id) {
                var el = document.getElementById(id);
                if (!el) return;
                if (el.type === 'checkbox') el.checked = !!fields[id];
                else el.value = fields[id];
            });

            // Apply the saved theme immediately
            if (settings.theme) {
                this.applyTheme(settings.theme);
            }
        },

        // ════════════════════════════════════════════════════════════════════
        // UI UTILITIES | أدوات واجهة المستخدم
        // ════════════════════════════════════════════════════════════════════

        /**
         * Show Success Message
         * عرض رسالة النجاح
         */
        showSuccessMessage: function(message) {
            this._showToast(message, 'success');
        },

        /**
         * Show Error Message
         * عرض رسالة الخطأ
         */
        showErrorMessage: function(message) {
            this._showToast(message, 'error');
        },

        /**
         * Show Info Message
         * عرض رسالة معلومات
         */
        showInfoMessage: function(message) {
            this._showToast(message, 'info');
        },

        /**
         * Show Warning Message
         * عرض رسالة تحذير
         */
        showWarningMessage: function(message) {
            this._showToast(message, 'warning');
        },

        /**
         * Internal Toast Implementation
         */
        _showToast: function(message, type) {
            const container = document.getElementById('settingsToastContainer') || this._createToastContainer();
            
            const toast = document.createElement('div');
            toast.className = `settings-toast settings-toast-${type}`;
            toast.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
                    <span>${message}</span>
                </div>
            `;

            const styles = {
                success: 'background: #d1fae5; color: #065f46; border-left: 4px solid #10b981;',
                error: 'background: #fee2e2; color: #991b1b; border-left: 4px solid #ef4444;',
                info: 'background: #dbeafe; color: #1e40af; border-left: 4px solid #2563eb;',
                warning: 'background: #fef3c7; color: #92400e; border-left: 4px solid #f59e0b;'
            };

            toast.style.cssText = `
                padding: 12px 16px;
                border-radius: 8px;
                margin-bottom: 8px;
                animation: slideInRight 0.3s ease-out;
                ${styles[type]}
            `;

            container.appendChild(toast);

            setTimeout(() => {
                toast.style.animation = 'slideOutRight 0.3s ease-in';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        },

        /**
         * Create Toast Container
         */
        _createToastContainer: function() {
            const container = document.createElement('div');
            container.id = 'settingsToastContainer';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                min-width: 300px;
                pointer-events: auto;
            `;
            document.body.appendChild(container);
            return container;
        }
    };

    // Export to global scope
    window.SettingsManager = SettingsManager;

    // Initialize on page load — wait for ZDB to be ready first
    document.addEventListener('DOMContentLoaded', function() {
        var initSettings = function() {
            // Load saved personal settings into the form
            if (SettingsManager.loadPersonalSettings) {
                SettingsManager.loadPersonalSettings();
            }
            // Load saved system settings into the form
            if (SettingsManager.loadSystemSettings) {
                SettingsManager.loadSystemSettings();
            }
        // Add toast animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideInRight {
                from {
                    opacity: 0;
                    transform: translateX(300px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }

            @keyframes slideOutRight {
                from {
                    opacity: 1;
                    transform: translateX(0);
                }
                to {
                    opacity: 0;
                    transform: translateX(300px);
                }
            }

            .settings-toast {
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            }
        `;
        document.head.appendChild(style);
        };

        // Wait for ZDB (IndexedDB cache) to be ready before reading settings
        if (window.ZDB && window.ZDB.ready) {
            window.ZDB.ready().then(initSettings).catch(initSettings);
        } else {
            initSettings();
        }
    });

})();
