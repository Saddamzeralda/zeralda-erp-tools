/**
 * 🧠 AI Master Hub - Zeralda ERP
 * تجميع كافة مؤشرات الذكاء الاصطناعي من مختلف الوحدات في الداشبورد الرئيسي
 */

(function () {
    const AI_HUB_KEY = 'zeralda-ai-master-hub';

    const UI_TEXT = {
        en: {
            tendersAnalyzed: 'AI Tenders Analyzed',
            benchmarkActive: 'Benchmark active',
            salesForecast: 'Sales Forecast (AI)',
            basedOnTrends: 'Based on trends',
            hrAlerts: 'HR AI Alerts',
            needsAttention: 'Needs attention',
            stockRisks: 'Stock Depletion Risks',
            autoPoReady: 'Auto PO Ready',
            items: '{count} Items'
        },
        ar: {
            tendersAnalyzed: 'مناقصات تم تحليلها',
            benchmarkActive: 'المقارنة المرجعية مفعلة',
            salesForecast: 'توقعات المبيعات',
            basedOnTrends: 'استنادًا إلى الاتجاهات',
            hrAlerts: 'تنبيهات الموارد الذكية',
            needsAttention: 'تحتاج إلى متابعة',
            stockRisks: 'مخاطر نفاد المخزون',
            autoPoReady: 'أوامر الشراء التلقائية جاهزة',
            items: '{count} عنصر'
        },
        fr: {
            tendersAnalyzed: 'Appels d\'offres IA analysés',
            benchmarkActive: 'Benchmark actif',
            salesForecast: 'Prévisions de ventes IA',
            basedOnTrends: 'Basé sur les tendances',
            hrAlerts: 'Alertes IA RH',
            needsAttention: 'Nécessite une attention',
            stockRisks: 'Risques de rupture de stock',
            autoPoReady: 'BC automatiques prêts',
            items: '{count} articles'
        }
    };

    function getLang() {
        return localStorage.getItem('preferred-language') || 'en';
    }

    function ui(key, vars = {}) {
        const lang = getLang();
        let text = (UI_TEXT[lang] || UI_TEXT.en)[key] || UI_TEXT.en[key] || key;
        Object.keys(vars).forEach((name) => {
            text = text.replace(`{${name}}`, vars[name]);
        });
        return text;
    }

    window.refreshAIMasterStats = function() {
        const stats = {
            tenders: safeJSONParse(localStorage.getItem('zeralda-tenders-benchmarking'), [] === '{}' ? {} : []).length,
            salesForecast: localStorage.getItem('zeralda-sales-forecast') || '$0',
            hrAlerts: 0,
            stockRisks: 0,
            serviceRisks: 2 // Mock default
        };

        // جمع تنبيهات الموارد البشرية
        const employees = safeJSONParse(localStorage.getItem('employees-data'), [] === '{}' ? {} : []);
        const now = new Date();
        employees.forEach(emp => {
            if (emp.contractEndDate) {
                const expiry = new Date(emp.contractEndDate);
                if ((expiry - now) / (1000 * 60 * 60 * 24) <= 30) stats.hrAlerts++;
            }
        });

        // جمع مخاطر المخزون
        const inventory = safeJSONParse(localStorage.getItem('inventory-products'), [] === '{}' ? {} : []);
        inventory.forEach(p => {
            if (p.stock <= p.reorderLevel) stats.stockRisks++;
        });

        window.updateDashboardAIUI(stats);
    };

    window.updateDashboardAIUI = function(stats) {
        const aiGrid = document.getElementById('ai-insights-grid');
        if (!aiGrid) return;

        aiGrid.innerHTML = `
            <div class="stat-card" style="border: 2px solid #8b5cf6;" onclick="location.href='modules/consulting/consulting_tenders_management.html'">
                <div class="stat-icon purple"><i class="fas fa-robot"></i></div>
                <div class="stat-details">
                    <p data-en="AI Tenders Analyzed" data-ar="مناقصات تم تحليلها" data-fr="Appels d'offres IA analysés">${ui('tendersAnalyzed')}</p>
                    <h3>${stats.tenders}</h3>
                    <div class="stat-change positive"><i class="fas fa-check"></i> ${ui('benchmarkActive')}</div>
                </div>
            </div>
            <div class="stat-card" style="border: 2px solid #10b981;" onclick="location.href='modules/sales/sales_management.html'">
                <div class="stat-icon green"><i class="fas fa-chart-line"></i></div>
                <div class="stat-details">
                    <p data-en="Sales Forecast (AI)" data-ar="توقعات المبيعات" data-fr="Prévisions de ventes IA">${ui('salesForecast')}</p>
                    <h3>${stats.salesForecast}</h3>
                    <div class="stat-change positive"><i class="fas fa-arrow-up"></i> ${ui('basedOnTrends')}</div>
                </div>
            </div>
            <div class="stat-card" style="border: 2px solid #ef4444;" onclick="location.href='modules/hr/hr_management.html'">
                <div class="stat-icon red"><i class="fas fa-user-shield"></i></div>
                <div class="stat-details">
                    <p data-en="HR AI Alerts" data-ar="تنبيهات الموارد الذكية" data-fr="Alertes IA RH">${ui('hrAlerts')}</p>
                    <h3>${stats.hrAlerts}</h3>
                    <div class="stat-change negative"><i class="fas fa-exclamation-circle"></i> ${ui('needsAttention')}</div>
                </div>
            </div>
            <div class="stat-card" style="border: 2px solid #f59e0b;" onclick="location.href='modules/inventory/inventory_management.html'">
                <div class="stat-icon orange"><i class="fas fa-warehouse"></i></div>
                <div class="stat-details">
                    <p data-en="Stock Depletion Risks" data-ar="مخاطر نفاد المخزون" data-fr="Risques de rupture de stock">${ui('stockRisks')}</p>
                    <h3>${ui('items', { count: stats.stockRisks })}</h3>
                    <div class="stat-change negative"><i class="fas fa-truck-loading"></i> ${ui('autoPoReady')}</div>
                </div>
            </div>
        `;
    };

    // Style injection for AI insights
    const style = document.createElement('style');
    style.innerHTML = `
        .ai-header {
            margin: 40px 0 20px;
            padding: 15px;
            background: linear-gradient(90deg, #f3f4f6, #ffffff);
            border-left: 5px solid #8b5cf6;
            border-radius: 8px;
            display: flex;
            align-items: center;
            gap: 15px;
        }
        .ai-header h2 { font-size: 22px; font-weight: 700; color: #4b5563; }
        .ai-badge { background: #8b5cf6; color: white; padding: 4px 10px; border-radius: 999px; font-size: 12px; }
    `;
    document.head.appendChild(style);

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(window.refreshAIMasterStats, 1000);
    });

})();
