/**
 * 🚀 Sales Intelligence & CRM PLUS - Zeralda ERP
 * تحويل المبيعات إلى نظام اشتراكات، ولاء عملاء، وتنبؤات ذكية
 */

(function () {
    const SALES_INTEL_KEY = 'zeralda-sales-intelligence';

    // ── نظام الترجمة الموحد ──
    var DICT = {
        converted:        { en: '✅ Invoice converted to Recurring Subscription', ar: '✅ تم تحويل الفاتورة إلى اشتراك متكرر', fr: '✅ Facture convertie en abonnement récurrent' },
        standard:         { en: 'Standard Invoice', ar: 'فاتورة عادية', fr: 'Facture standard' },
        forecastTitle:    { en: 'AI Sales Forecast', ar: 'توقعات المبيعات بالذكاء الاصطناعي', fr: 'Prévisions de ventes IA' },
        forecastValueLabel: { en: 'AI Next Month Forecast', ar: 'توقع الشهر القادم بالذكاء الاصطناعي', fr: 'Prévision IA du mois prochain' },
        growth:           { en: '5% Est. Growth', ar: 'نمو تقديري 5%', fr: 'Croissance estimée à 5 %' }
    };
    var t = window.createRuntimeTranslator ? window.createRuntimeTranslator(DICT) : function (k) { return k; };

    // 1. Subscription & Recurring Revenue Logic
    // تحويل الفواتير العادية إلى اشتراكات دورية (شهرية/سنوية)
    window.toggleSubscriptionMode = function(invoiceId) {
        const invoices = safeJSONParse(ZS.getItem('invoices-data'), [] === '{}' ? {} : []);
        const idx = invoices.findIndex(inv => inv.id == invoiceId);
        if (idx === -1) return;

        const inv = invoices[idx];
        inv.isSubscription = !inv.isSubscription;
        inv.subCycle = inv.isSubscription ? 'monthly' : null;
        inv.nextBillingDate = inv.isSubscription ? calculateNextBilling(inv.date, 'monthly') : null;

        invoices[idx] = inv;
        ZS.setItem('invoices-data', JSON.stringify(invoices));
        alert(inv.isSubscription ? t('converted') : t('standard'));
        if (window.loadInvoicesTable) window.loadInvoicesTable();
    };

    function calculateNextBilling(startDate, cycle) {
        const d = new Date(startDate);
        if (cycle === 'monthly') d.setMonth(d.getMonth() + 1);
        if (cycle === 'yearly') d.setFullYear(d.getFullYear() + 1);
        return d.toISOString().split('T')[0];
    }

    // 2. Customer Loyalty Points System
    // نظام مكافآت: كل 100 دينار/دولار مبيعات = 1 نقطة ولاء
    window.calculateLoyaltyPoints = function(customerId) {
        const invoices = safeJSONParse(ZS.getItem('invoices-data'), [] === '{}' ? {} : []);
        const customerInvoices = invoices.filter(inv => inv.customerId == customerId);
        const totalSpent = customerInvoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
        return Math.floor(totalSpent / 100);
    };

    // 3. Smart Sales Forecasting (Simulated AI)
    // التنبؤ بمبيعات الشهر القادم بناءً على اتجاه الـ 3 أشهر الماضية
    window.getSalesForecast = function() {
        const invoices = safeJSONParse(ZS.getItem('invoices-data'), [] === '{}' ? {} : []);
        const now = new Date();
        const last3Months = invoices.filter(inv => {
            const d = new Date(inv.date);
            return (now - d) / (1000*60*60*24) <= 90;
        });

        const total = last3Months.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
        const avgPerMonth = total / 3;
        // Simple growth factor (simulated)
        const growth = 1.05;
        return (avgPerMonth * growth).toFixed(2);
    };

    // 4. UI Enhancements for Sales Intelligence
    window.injectSalesIntelUI = function() {
        const statsGrid = document.querySelector('.stats-grid');
        if (statsGrid && !document.getElementById('forecastCard')) {
            const forecast = window.getSalesForecast();
            const card = document.createElement('div');
            card.id = 'forecastCard';
            card.className = 'stat-card';
            card.style.border = '2px solid var(--purple-color)';
            card.innerHTML = `
                <div class="stat-icon purple"><i class="fas fa-chart-line"></i></div>
                <div class="stat-details">
                    <p data-en="AI Sales Forecast" data-ar="توقعات المبيعات (AI)" data-fr="Prévisions de ventes IA">${t('forecastValueLabel')}</p>
                    <h3>${forecast}</h3>
                    <div class="stat-change positive"><i class="fas fa-level-up-alt"></i> ${t('growth')}</div>
                </div>
            `;
            statsGrid.appendChild(card);
        }
    };

    // Listen for tab changes to inject UI
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(window.injectSalesIntelUI, 1000);
    });

})();
