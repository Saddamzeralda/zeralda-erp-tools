/* ============================================
   ZERALDA ERP - Settings Page Enhancements
   تحسينات شاملة لصفحة الإعدادات
   ============================================ */

(function() {
    'use strict';

    // ==========================================
    // 1. PASSWORD STRENGTH ENHANCEMENTS
    // تحسينات قوة كلمة المرور
    // ==========================================

    /**
     * Toggle password visibility
     * إظهار/إخفاء كلمة المرور
     */
    window.togglePasswordVisibility = function(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        
        // Find the button that triggered this
        const button = event && event.target ? event.target.closest('button') : null;
        
        if (input.type === 'password') {
            input.type = 'text';
            if (button) button.innerHTML = '<i class="fas fa-eye-slash"></i>';
        } else {
            input.type = 'password';
            if (button) button.innerHTML = '<i class="fas fa-eye"></i>';
        }
    };

    /**
     * Update password strength indicator
     * تحديث مؤشر قوة كلمة المرور
     */
    window.updatePasswordStrength = function(input) {
        if (!input || !input.value) {
            // Hide strength bar if password is empty
            const bar = document.getElementById(input.id + 'StrengthBar');
            const msg = document.getElementById(input.id + 'Msg');
            if (bar) bar.style.display = 'none';
            if (msg) msg.style.display = 'none';
            input.classList.remove('is-valid', 'is-error');
            return;
        }

        const value = input.value;
        let strength = 0;

        // Calculate strength score
        if (value.length >= 6) strength++;
        if (value.length >= 8) strength++;
        if (value.length >= 12) strength++;
        if (/[A-Z]/.test(value)) strength++;
        if (/[a-z]/.test(value)) strength++;
        if (/[0-9]/.test(value)) strength++;
        if (/[^A-Za-z0-9]/.test(value)) strength++;

        // Determine strength level (0-3)
        let level, color, label, fillWidth;
        
        if (strength <= 2) {
            level = 'weak';
            color = '#ef4444';
            label = {en: 'Weak', ar: 'ضعيفة', fr: 'Faible'};
            fillWidth = '25%';
        } else if (strength <= 4) {
            level = 'fair';
            color = '#f59e0b';
            label = {en: 'Fair', ar: 'متوسطة', fr: 'Moyen'};
            fillWidth = '50%';
        } else if (strength <= 5) {
            level = 'good';
            color = '#eab308';
            label = {en: 'Good', ar: 'جيدة', fr: 'Bon'};
            fillWidth = '75%';
        } else {
            level = 'strong';
            color = '#10b981';
            label = {en: 'Strong', ar: 'قوية', fr: 'Fort'};
            fillWidth = '100%';
        }

        // Get current language
        const settings = typeof getSettings === 'function' ? getSettings() : {preferredLanguage:'en'};
        const lang = settings.preferredLanguage || 'en';

        // Update UI
        const bar = document.getElementById(input.id + 'StrengthBar');
        const fill = document.getElementById(input.id + 'StrengthFill');
        const msg = document.getElementById(input.id + 'Msg');

        if (bar) {
            bar.style.display = 'block';
            if (fill) {
                fill.className = 'password-strength-fill ' + level;
                fill.style.width = fillWidth;
                fill.style.backgroundColor = color;
            }
        }

        if (msg) {
            msg.style.display = 'flex';
            msg.innerHTML = `<i class="fas fa-shield-alt"></i> ${label[lang] || label.en}`;
            msg.style.color = color;
        }

        // Apply validation classes
        if (level === 'weak' || level === 'fair') {
            input.classList.add('is-error');
            input.classList.remove('is-valid');
        } else {
            input.classList.add('is-valid');
            input.classList.remove('is-error');
        }
    };

    /**
     * Enhanced email validation
     * التحقق المحسّن من البريد الإلكتروني
     */
    window.validateEmailField = function(input) {
        if (!input) return;
        
        const email = input.value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (!email) {
            input.classList.remove('is-valid', 'is-error');
            return;
        }

        if (emailRegex.test(email)) {
            input.classList.remove('is-error');
            input.classList.add('is-valid');
        } else {
            input.classList.remove('is-valid');
            input.classList.add('is-error');
        }
    };

    /**
     * Full name validation
     * التحقق من الاسم الكامل
     */
    window.validateFullNameField = function(input) {
        if (!input) return;
        
        const name = input.value.trim();
        
        if (!name) {
            input.classList.remove('is-valid', 'is-error');
            return;
        }

        if (name.length >= 3 && /^[a-zA-Z\u0600-\u06FF\s]+$/.test(name)) {
            input.classList.remove('is-error');
            input.classList.add('is-valid');
        } else {
            input.classList.remove('is-valid');
            input.classList.add('is-error');
        }
    };

    // ==========================================
    // 2. PAGINATION FOR LONG LISTS
    // ترقيم الصفحات للقوائم الطويلة
    // ==========================================

    const ITEMS_PER_PAGE = 10;
    const paginationState = {
        companies: { currentPage: 1, searchQuery: '' },
        users: { currentPage: 1, searchQuery: '' },
        roles: { currentPage: 1, searchQuery: '' }
    };

    /**
     * Create pagination controls
     * إنشاء عناصر التحكم في الترقيم
     */
    function createPaginationControls(totalItems, currentPage, onPageChange) {
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        
        if (totalPages <= 1) return '';

        let html = '<div class="pagination-controls" style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:16px;flex-wrap:wrap;">';
        
        // Previous button
        html += `<button class="btn btn-secondary" onclick="${onPageChange}(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''} style="padding:8px 12px;">
            <i class="fas fa-chevron-left"></i>
        </button>`;
        
        // Page numbers
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);
        
        if (startPage > 1) {
            html += `<button class="btn btn-secondary" onclick="${onPageChange}(1)">1</button>`;
            if (startPage > 2) html += '<span style="padding:0 4px;">...</span>';
        }
        
        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="btn ${i === currentPage ? 'btn-primary' : 'btn-secondary'}" onclick="${onPageChange}(${i})" style="min-width:40px;">${i}</button>`;
        }
        
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += '<span style="padding:0 4px;">...</span>';
            html += `<button class="btn btn-secondary" onclick="${onPageChange}(${totalPages})">${totalPages}</button>`;
        }
        
        // Next button
        html += `<button class="btn btn-secondary" onclick="${onPageChange}(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''} style="padding:8px 12px;">
            <i class="fas fa-chevron-right"></i>
        </button>`;
        
        html += `<span style="color:#6b7280;font-size:13px;margin-left:12px;">صفحة ${currentPage} من ${totalPages}</span>`;
        html += '</div>';
        
        return html;
    }

    /**
     * Enhanced companies list rendering with pagination
     * عرض قائمة الشركات مع الترقيم
     */
    window.renderCompaniesListEnhanced = function() {
        if (typeof renderCompaniesList === 'function') {
            renderCompaniesList(); // Call original
        }
        
        // Add pagination
        const listEl = document.getElementById('companiesList');
        if (!listEl) return;
        
        const companies = typeof getCompanies === 'function' ? getCompanies() : [];
        const totalItems = companies.length;
        
        if (totalItems > ITEMS_PER_PAGE) {
            const paginationHTML = createPaginationControls(
                totalItems,
                paginationState.companies.currentPage,
                'goToCompaniesPage'
            );
            listEl.insertAdjacentHTML('afterend', paginationHTML);
        }
    };

    window.goToCompaniesPage = function(page) {
        paginationState.companies.currentPage = page;
        renderCompaniesListEnhanced();
    };

    // ==========================================
    // 3. MULTI-STEP COMPANY FORM
    // نموذج متعدد الخطوات للشركات
    // ==========================================

    const companyFormSteps = {
        current: 1,
        total: 4,
        data: {} // Store form data between steps
    };

    /**
     * Multi-step company form implementation
     * تطبيق نموذج متعدد الخطوات للشركة
     */
    window.showCompanyFormStep = function(step) {
        if (step < 1 || step > companyFormSteps.total) return;
        
        companyFormSteps.current = step;
        
        // Hide all steps
        for (let i = 1; i <= companyFormSteps.total; i++) {
            const stepEl = document.getElementById(`companyFormStep${i}`);
            if (stepEl) stepEl.style.display = 'none';
        }
        
        // Show current step
        const currentStepEl = document.getElementById(`companyFormStep${step}`);
        if (currentStepEl) currentStepEl.style.display = 'block';
        
        // Update progress indicator
        updateFormProgress();
    };

    function updateFormProgress() {
        const progress = (companyFormSteps.current / companyFormSteps.total) * 100;
        const progressBar = document.getElementById('companyFormProgress');
        if (progressBar) {
            progressBar.style.width = progress + '%';
        }
        
        // Update step buttons
        for (let i = 1; i <= companyFormSteps.total; i++) {
            const btn = document.getElementById(`stepBtn${i}`);
            if (btn) {
                btn.classList.toggle('active', i === companyFormSteps.current);
                btn.classList.toggle('completed', i < companyFormSteps.current);
            }
        }
    }

    window.nextCompanyFormStep = function() {
        if (companyFormSteps.current < companyFormSteps.total) {
            showCompanyFormStep(companyFormSteps.current + 1);
        }
    };

    window.prevCompanyFormStep = function() {
        if (companyFormSteps.current > 1) {
            showCompanyFormStep(companyFormSteps.current - 1);
        }
    };

    // ==========================================
    // 4. AUDIT LOGGING SYSTEM
    // نظام تسجيل التدقيق
    // ==========================================

    const AUDIT_LOG_KEY = 'zeralda-audit-log';

    /**
     * Log an audit event
     * تسجيل حدث تدقيق
     */
    window.logAuditEvent = function(category, action, details, userId) {
        try {
            const logs = JSON.parse(ZS.getItem(AUDIT_LOG_KEY) || '[]');

            const event = {
                id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
                timestamp: new Date().toISOString(),
                category: category, // 'user', 'company', 'role', 'settings', 'security'
                action: action, // 'create', 'update', 'delete', 'login', 'logout', 'change'
                details: details || {},
                userId: userId || (typeof getActiveUserId === 'function' ? getActiveUserId() : null),
                userAgent: navigator.userAgent.slice(0, 80) // truncate to save space
            };

            logs.push(event);

            // Keep only last 200 events (reduced from 500 to save localStorage space)
            if (logs.length > 200) {
                logs.splice(0, logs.length - 200);
            }

            try {
                ZS.setItem(AUDIT_LOG_KEY, JSON.stringify(logs));
            } catch (quotaErr) {
                // Quota exceeded — progressively trim older logs and retry
                let trimmed = logs;
                while (trimmed.length > 10) {
                    trimmed = trimmed.slice(-Math.floor(trimmed.length / 2));
                    try {
                        ZS.setItem(AUDIT_LOG_KEY, JSON.stringify(trimmed));
                        return;
                    } catch (e2) { continue; }
                }
                // Last resort: keep only the latest event
                try { ZS.setItem(AUDIT_LOG_KEY, JSON.stringify([event])); } catch (e3) {
                    try { ZS.removeItem(AUDIT_LOG_KEY); } catch (e4) {}
                }
            }
        } catch (e) {
            console.warn('Failed to log audit event:', e);
        }
    };

    /**
     * Get audit logs with filtering
     * الحصول على سجلات التدقيق مع التصفية
     */
    window.getAuditLogs = function(filters) {
        try {
            let logs = JSON.parse(ZS.getItem(AUDIT_LOG_KEY) || '[]');
            
            if (filters) {
                if (filters.category) {
                    logs = logs.filter(log => log.category === filters.category);
                }
                if (filters.action) {
                    logs = logs.filter(log => log.action === filters.action);
                }
                if (filters.userId) {
                    logs = logs.filter(log => log.userId === filters.userId);
                }
                if (filters.startDate) {
                    logs = logs.filter(log => new Date(log.timestamp) >= new Date(filters.startDate));
                }
                if (filters.endDate) {
                    logs = logs.filter(log => new Date(log.timestamp) <= new Date(filters.endDate));
                }
            }
            
            return logs.reverse(); // Most recent first
        } catch (e) {
            console.warn('Failed to get audit logs:', e);
            return [];
        }
    };

    /**
     * Render audit logs view
     * عرض سجلات التدقيق
     */
    window.renderAuditLogs = function() {
        const container = document.getElementById('audit-logs-container');
        if (!container) return;
        
        const logs = getAuditLogs();
        
        if (logs.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:24px;color:#6b7280;">لا توجد سجلات تدقيق</div>';
            return;
        }
        
        let html = '<div style="max-height:400px;overflow-y:auto;">';
        html += '<table style="width:100%;border-collapse:collapse;">';
        html += '<thead><tr style="background:#f3f4f6;"><th style="padding:8px;text-align:right;">الوقت</th><th style="padding:8px;">الفئة</th><th style="padding:8px;">الإجراء</th><th style="padding:8px;">التفاصيل</th></tr></thead><tbody>';
        
        logs.slice(0, 100).forEach(log => {
            const timestamp = new Date(log.timestamp).toLocaleString('ar-DZ');
            const categoryAr = {
                'user': 'مستخدم',
                'company': 'شركة',
                'role': 'دور',
                'settings': 'إعدادات',
                'security': 'أمان'
            }[log.category] || log.category;
            
            const actionAr = {
                'create': 'إنشاء',
                'update': 'تحديث',
                'delete': 'حذف',
                'login': 'تسجيل دخول',
                'logout': 'تسجيل خروج',
                'change': 'تغيير'
            }[log.action] || log.action;
            
            const details = JSON.stringify(log.details).slice(0, 100);
            // FIX P1: escape all dynamic content to prevent XSS via audit log details
            const escDetails = details.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
            const escCategory = categoryAr.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const escAction = actionAr.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const escTimestamp = String(timestamp).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            
            html += `<tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:8px;font-size:12px;color:#6b7280;">${escTimestamp}</td>
                <td style="padding:8px;"><span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:4px;font-size:11px;">${escCategory}</span></td>
                <td style="padding:8px;"><span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:4px;font-size:11px;">${escAction}</span></td>
                <td style="padding:8px;font-size:12px;color:#4b5563;">${escDetails}</td>
            </tr>`;
        });
        
        html += '</tbody></table></div>';
        container.innerHTML = html;
    };

    // ==========================================
    // 5. AUTO-BACKUP SYSTEM
    // نظام النسخ الاحتياطي التلقائي
    // ==========================================

    const AUTO_BACKUP_KEY = 'zeralda-auto-backup';
    const BACKUP_INTERVAL = 1000 * 60 * 30; // 30 minutes

    /**
     * Create automatic backup
     * إنشاء نسخة احتياطية تلقائية
     */
    window.createAutoBackup = function() {
        try {
            const settings = typeof getSettings === 'function' ? getSettings() : {};
            const backup = {
                timestamp: new Date().toISOString(),
                data: settings,
                version: '1.0',
                source: 'auto-backup'
            };
            
            try {
                ZS.setItem(AUTO_BACKUP_KEY, JSON.stringify(backup));
            } catch (e) {
                console.warn('Auto backup failed:', e);
                return false;
            }
            logAuditEvent('settings', 'backup', { type: 'automatic' });
            
            return true;
        } catch (e) {
            console.warn('Auto backup failed:', e);
            return false;
        }
    };

    /**
     * Restore from automatic backup
     * استعادة من النسخة الاحتياطية التلقائية
     */
    window.restoreAutoBackup = function() {
        if (!confirm('هل تريد استعادة البيانات من النسخة الاحتياطية التلقائية؟ سيتم استبدال البيانات الحالية.')) {
            return false;
        }
        
        try {
            const backupStr = ZS.getItem(AUTO_BACKUP_KEY);
            if (!backupStr) {
                alert('لا توجد نسخة احتياطية متاحة');
                return false;
            }
            
            const backup = JSON.parse(backupStr);
            
            if (typeof saveSettings === 'function') {
                saveSettings(backup.data);
            }
            
            logAuditEvent('settings', 'restore', { type: 'automatic', timestamp: backup.timestamp });
            alert('تم استعادة البيانات بنجاح');
            // Wait for ZDB to flush before reloading (settings were written
            // via ZS → async IndexedDB write).
            function doReload() { location.reload(); }
            if (window.ZDB && typeof window.ZDB.flush === 'function') {
              window.ZDB.flush().then(doReload).catch(function () { setTimeout(doReload, 150); });
            } else {
              setTimeout(doReload, 0);
            }
            
            return true;
        } catch (e) {
            console.warn('Restore failed:', e);
            alert('فشل في استعادة البيانات');
            return false;
        }
    };

    /**
     * Start auto-backup timer
     * بدء مؤقت النسخ الاحتياطي التلقائي
     */
    function startAutoBackupTimer() {
        // Initial backup
        createAutoBackup();
        
        // Periodic backup
        setInterval(createAutoBackup, BACKUP_INTERVAL);
        
        // Backup on page unload
        window.addEventListener('beforeunload', createAutoBackup);
    }

    // ==========================================
    // 6. ENHANCED CONFIRMATIONS
    // تأكيدات محسّنة
    // ==========================================

    /**
     * Show enhanced confirmation dialog
     * عرض حوار تأكيد محسّن
     */
    window.showConfirmDialog = function(options) {
        const defaults = {
            title: 'تأكيد',
            message: 'هل أنت متأكد؟',
            confirmText: 'نعم',
            cancelText: 'إلغاء',
            type: 'warning', // 'warning', 'danger', 'info'
            onConfirm: null,
            onCancel: null
        };
        
        const opts = {...defaults, ...options};
        
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'confirm-dialog-overlay';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
        
        const colors = {
            warning: '#f59e0b',
            danger: '#ef4444',
            info: '#3b82f6'
        };
        
        const icons = {
            warning: 'exclamation-triangle',
            danger: 'exclamation-circle',
            info: 'info-circle'
        };
        
        modal.innerHTML = `
            <div style="background:white;border-radius:12px;padding:24px;max-width:500px;width:90%;box-shadow:0 20px 40px rgba(0,0,0,0.3);">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                    <i class="fas fa-${icons[opts.type]}" style="font-size:32px;color:${colors[opts.type]};"></i>
                    <h3 style="margin:0;font-size:20px;color:#1f2937;">${opts.title}</h3>
                </div>
                <p style="color:#6b7280;margin:0 0 24px 0;line-height:1.6;">${opts.message}</p>
                <div style="display:flex;gap:12px;justify-content:flex-end;">
                    <button id="confirmDialogCancel" class="btn btn-secondary">${opts.cancelText}</button>
                    <button id="confirmDialogConfirm" class="btn btn-primary" style="background:${colors[opts.type]};">${opts.confirmText}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Event handlers
        document.getElementById('confirmDialogCancel').addEventListener('click', () => {
            document.body.removeChild(modal);
            if (opts.onCancel) opts.onCancel();
        });
        
        document.getElementById('confirmDialogConfirm').addEventListener('click', () => {
            document.body.removeChild(modal);
            if (opts.onConfirm) opts.onConfirm();
        });
        
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                document.body.removeChild(modal);
                if (opts.onCancel) opts.onCancel();
            }
        });
    };

    // ==========================================
    // 7. KEYBOARD SHORTCUTS
    // اختصارات لوحة المفاتيح
    // ==========================================

    /**
     * Setup keyboard shortcuts
     * إعداد اختصارات لوحة المفاتيح
     */
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', function(e) {
            // Ctrl+S / Cmd+S - Save current section
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                
                // Determine active section
                const activeSection = document.querySelector('.settings-section.active');
                if (!activeSection) return;
                
                const sectionId = activeSection.id;
                
                // Call appropriate save function
                const saveFunctions = {
                    'language': 'saveLanguageSettings',
                    'currency': 'saveCurrencySettings',
                    'company': 'saveCompanyFromForm',
                    'users': 'saveUserFromForm',
                    'notifications': 'saveNotificationSettings'
                };
                
                const saveFunc = saveFunctions[sectionId];
                if (saveFunc && typeof window[saveFunc] === 'function') {
                    window[saveFunc]();
                }
            }
            
            // Escape - Close modals / forms
            if (e.key === 'Escape') {
                const companyDrawer = document.getElementById('companyFormDrawer');
                if (companyDrawer && companyDrawer.style.display === 'block') {
                    if (typeof closeCompanyFormDrawer === 'function') {
                        closeCompanyFormDrawer();
                    }
                }
                
                const userPanel = document.getElementById('userFormPanel');
                if (userPanel && userPanel.style.display === 'block') {
                    if (typeof closeUserForm === 'function') {
                        closeUserForm();
                    }
                }
            }
        });
    }

    // ==========================================
    // INITIALIZATION
    // التهيئة
    // ==========================================

    /**
     * Initialize all enhancements
     * تهيئة جميع التحسينات
     */
    function initializeEnhancements() {
        console.log('🚀 Settings Enhancements Loaded');
        
        // Start auto-backup timer
        startAutoBackupTimer();
        
        // Setup keyboard shortcuts
        setupKeyboardShortcuts();
        
        // Add enhanced validation to existing fields
        const userPasswordInput = document.getElementById('userPassword');
        if (userPasswordInput && !userPasswordInput.hasAttribute('oninput')) {
            userPasswordInput.setAttribute('oninput', 'updatePasswordStrength(this)');
        }
        
        const userEmailInput = document.getElementById('userEmail');
        if (userEmailInput && !userEmailInput.hasAttribute('oninput')) {
            userEmailInput.setAttribute('oninput', 'validateEmailField(this)');
        }
        
        const userFullNameInput = document.getElementById('userFullName');
        if (userFullNameInput && !userFullNameInput.hasAttribute('oninput')) {
            userFullNameInput.setAttribute('oninput', 'validateFullNameField(this)');
        }
        
        console.log('✅ All enhancements initialized successfully');
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeEnhancements);
    } else {
        initializeEnhancements();
    }

})();
