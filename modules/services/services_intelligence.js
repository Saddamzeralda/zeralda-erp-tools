/**
 * 🛠️ Services Intelligence - Zeralda ERP
 * AI-driven Resource Allocation & Deadline Prediction
 */

(function () {
    const SERVICES_INTEL_KEY = 'zeralda-services-intelligence';
    const SETTINGS_KEY = 'zeralda-settings';
    const SERVICES_KEY = 'zeralda-services';

    // ── نظام الترجمة الموحد ──
    var DICT = {
        aiAssistantTitle:    { en: 'AI Resource Assistant', ar: 'مساعد الموارد بالذكاء الاصطناعي', fr: 'Assistant de ressources IA' },
        aiSelectPrompt:      { en: 'Select a service type to see recommendation...', ar: 'اختر نوع الخدمة لعرض التوصية...', fr: 'Sélectionnez un type de service pour voir la recommandation...' },
        aiRecommended:       { en: 'Recommended: <b>{name}</b> (Available & Expert). <br>Predicted Completion: <b>{days} days</b>', ar: 'موصى به: <b>{name}</b> (متاح وخبير). <br>الإنجاز المتوقع: <b>{days} يومًا</b>', fr: 'Recommandé : <b>{name}</b> (Disponible & Expert). <br>Achèvement prévu : <b>{days} jours</b>' },
        aiNoRecommendation:  { en: 'No specific recommendation. Check manual allocation.', ar: 'لا توجد توصية محددة. تحقق من التخصيص اليدوي.', fr: 'Aucune recommandation spécifique. Vérifiez l\'attribution manuelle.' },
        highRisk:            { en: 'High Risk', ar: 'مخاطر عالية', fr: 'Risque élevé' },
        normal:              { en: 'Normal', ar: 'عادي', fr: 'Normal' },
        projects:            { en: 'Projects', ar: 'مشاريع', fr: 'projets' },
        noActiveProjects:    { en: 'No active projects to analyze', ar: 'لا توجد مشاريع نشطة للتحليل', fr: 'Aucun projet actif à analyser' },
        delayedByAI:         { en: 'Delayed by AI Analysis', ar: 'متأخرة حسب تحليل الذكاء الاصطناعي', fr: 'Retardés selon l\'analyse IA' },
        onScheduleByAI:      { en: 'On schedule by AI Analysis', ar: 'ضمن الجدول حسب تحليل الذكاء الاصطناعي', fr: 'Dans les délais selon l\'analyse IA' },
        deadlineRisks:       { en: 'Deadline Risks', ar: 'مخاطر المواعيد', fr: 'Risques d\'échéance' }
    };
    var t = window.createRuntimeTranslator ? window.createRuntimeTranslator(DICT) : function (k) { return k; };

    function getActiveCompanyId() {
        try {
            const settings = JSON.parse(ZS.getItem(SETTINGS_KEY) || '{}');
            return String((settings && settings.activeCompanyId) || 'default-company');
        } catch (_) {
            return 'default-company';
        }
    }

    function getServicesData() {
        const scopedKey = SERVICES_KEY + '::' + getActiveCompanyId();
        try {
            const raw = JSON.parse(ZS.getItem(scopedKey) || '{}');
            return {
                rentals: Array.isArray(raw.rentals) ? raw.rentals : [],
                sealLoans: Array.isArray(raw.sealLoans) ? raw.sealLoans : []
            };
        } catch (_) {
            return { rentals: [], sealLoans: [] };
        }
    }

    function parseDateSafe(value) {
        if (!value) return null;
        const d = new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    function countDeadlineRisks() {
        const data = getServicesData();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const activeRentals = data.rentals.filter(r => (r && (r.status || 'active') === 'active'));
        const activeSealLoans = data.sealLoans.filter(l => (l && (l.status || 'loaned') === 'loaned'));

        const overdueRentals = activeRentals.filter(r => {
            const end = parseDateSafe(r.endDate);
            return end && end < today;
        }).length;

        const overdueSealLoans = activeSealLoans.filter(l => {
            const expected = parseDateSafe(l.expectedReturn);
            return expected && expected < today;
        }).length;

        return {
            activeCount: activeRentals.length + activeSealLoans.length,
            atRiskCount: overdueRentals + overdueSealLoans
        };
    }

    // 1. Smart Resource Allocator (AI)
    // العثور على أفضل موظف متاح للمهمة بناءً على المهارات والحمل الحالي
    window.suggestBestEmployee = function(serviceType) {
        const employees = JSON.parse(ZS.getItem('employees-data') || '[]');
        const activeTasks = JSON.parse(ZS.getItem('services-tasks') || '[]');

        // فلترة الموظفين حسب القسم (مثال: 'Consulting', 'Technical', 'Sales')
        const eligible = employees.filter(emp => {
            if (serviceType.includes('Technical')) return emp.department === 'IT' || emp.department === 'Services';
            if (serviceType.includes('Consulting')) return emp.department === 'Consulting' || emp.department === 'Management';
            return true;
        });

        // اختيار الموظف الأقل حملاً (عدد المهام النشطة)
        let bestEmp = null;
        let minTasks = Infinity;

        eligible.forEach(emp => {
            const taskCount = activeTasks.filter(t => t.assignedTo == emp.id && t.status !== 'Completed').length;
            if (taskCount < minTasks) {
                minTasks = taskCount;
                bestEmp = emp;
            }
        });

        return bestEmp;
    };

    // 2. Deadline Predictor
    // التنبؤ بموعد التسليم الحقيقي بناءً على تعقيد المهمة
    window.predictServiceDeadline = function(baseDays, complexity) {
        const factor = complexity === 'High' ? 1.5 : (complexity === 'Medium' ? 1.2 : 1.0);
        const totalDays = Math.ceil(baseDays * factor);

        const deadline = new Date();
        deadline.setDate(deadline.getDate() + totalDays);
        return {
            date: deadline.toLocaleDateString(),
            days: totalDays,
            risk: totalDays > 15 ? t('highRisk') : t('normal')
        };
    };

    // 3. UI Injections for Services
    window.injectServicesIntelUI = function() {
        // إضافة قسم "اقتراح AI" في نموذج إضافة مهمة جديدة
        const form = document.querySelector('.card h3 i.fa-plus')?.closest('.card');
        if (form && !document.getElementById('aiSuggestionBox')) {
            const div = document.createElement('div');
            div.id = 'aiSuggestionBox';
            div.style.background = 'rgba(211, 107, 46, 0.1)';
            div.style.border = '1px dashed var(--primary-color)';
            div.style.padding = '10px';
            div.style.borderRadius = '10px';
            div.style.marginBottom = '10px';
            div.style.fontSize = '13px';

            div.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; color:var(--primary-color); font-weight:700; margin-bottom:5px;">
                    <i class="fas fa-robot"></i> ${t('aiAssistantTitle')}
                </div>
                <div id="aiSuggestionText">${t('aiSelectPrompt')}</div>
            `;
            form.insertBefore(div, form.querySelector('.form-group'));

            // ربط تغيير نوع الخدمة بتحديث الاقتراح
            const typeSelect = document.getElementById('serviceType');
            if (typeSelect) {
                typeSelect.addEventListener('change', () => {
                    const emp = window.suggestBestEmployee(typeSelect.value);
                    const text = document.getElementById('aiSuggestionText');
                    if (emp) {
                        var days = window.predictServiceDeadline(5, 'Medium').days;
                        text.innerHTML = t('aiRecommended', { name: emp.name, days: days });
                    } else {
                        text.innerHTML = t('aiNoRecommendation');
                    }
                });
            }
        }

        // إضافة بطاقة "مشاريع تحت الخطر" في الـ Dash stats
        const stats = document.querySelector('.stats');
        if (stats) {
            const risk = countDeadlineRisks();
            const valueText = `${risk.atRiskCount} ${t('projects')}`;

            const statusText = risk.activeCount === 0
                ? t('noActiveProjects')
                : (risk.atRiskCount > 0
                    ? t('delayedByAI')
                    : t('onScheduleByAI'));

            const borderColor = risk.atRiskCount > 0 ? 'var(--danger-color)' : (risk.activeCount > 0 ? 'var(--success-color)' : 'var(--info-color)');
            const textColor = risk.atRiskCount > 0 ? 'var(--danger-color)' : (risk.activeCount > 0 ? 'var(--success-color)' : 'var(--info-color)');
            const iconClass = risk.atRiskCount > 0 ? 'fa-exclamation-triangle' : (risk.activeCount > 0 ? 'fa-check-circle' : 'fa-info-circle');

            const existing = document.getElementById('serviceRiskStat');
            const riskStat = existing || document.createElement('div');
            riskStat.id = 'serviceRiskStat';
            riskStat.className = 'stat';
            riskStat.style.borderLeft = '4px solid ' + borderColor;
            riskStat.innerHTML = `
                <div class="stat-label" data-en="Deadline Risks" data-ar="مخاطر المواعيد" data-fr="Risques d'échéance">${t('deadlineRisks')}</div>
                <div class="stat-value">${valueText}</div>
                <div style="font-size:10px; color:${textColor};"><i class="fas ${iconClass}"></i> ${statusText}</div>
            `;
            if (!existing) stats.appendChild(riskStat);
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(window.injectServicesIntelUI, 1000);
    });

})();
