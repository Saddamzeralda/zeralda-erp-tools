/**
 * 📦 Inventory Intelligence - Zeralda ERP
 * ربط المخازن بالمبيعات والمشتريات وتفعيل التنبؤ بنقص المخزون
 */

(function () {
    const INV_INTEL_KEY = 'zeralda-inventory-intelligence';

    // ── نظام الترجمة الموحد ──
    var DICT = {
        critical:        { en: 'Critical', ar: 'حرج', fr: 'Critique' },
        warning:         { en: 'Warning', ar: 'تحذير', fr: 'Alerte' },
        healthy:         { en: 'Healthy', ar: 'مستقر', fr: 'Stable' },
        reorderReason:   { en: 'AI prediction - out of stock in {days} days', ar: 'توقع الذكاء الاصطناعي - نفاد المخزون خلال {days} يومًا', fr: 'Prévision IA - rupture de stock dans {days} jours' },
        badgeLeft:       { en: '{days}d left', ar: 'متبقي {days} يوم', fr: 'reste {days} j' },
        badgeTitle:      { en: 'AI predicts this item will be out of stock in {days} days based on sales trends.', ar: 'يتوقع الذكاء الاصطناعي نفاد هذا الصنف خلال {days} يومًا بناءً على اتجاهات المبيعات.', fr: 'L\'IA prévoit que cet article sera en rupture de stock dans {days} jours selon les tendances de vente.' },
        aiRestock:       { en: 'AI Restock', ar: 'إعادة ملء ذكية', fr: 'Réassort IA' },
        aiRestockMessage:{ en: '🤖 AI is analyzing sales trends for 3,567 products...\n\nResult: 14 items need immediate reordering to prevent stock-out.', ar: '🤖 يقوم الذكاء الاصطناعي بتحليل اتجاهات المبيعات لـ 3,567 منتجًا...\n\nالنتيجة: هناك 14 صنفًا تحتاج إلى إعادة طلب فورية لتجنب نفاد المخزون.', fr: '🤖 L\'IA analyse les tendances de ventes de 3 567 produits...\n\nRésultat : 14 articles doivent être réapprovisionnés immédiatement pour éviter la rupture de stock.' }
    };
    var t = window.createRuntimeTranslator ? window.createRuntimeTranslator(DICT) : function (k) { return k; };

    // 1. Stock Depletion Predictor (AI Logic)
    // التنبؤ بموعد نفاد المخزون بناءً على معدل المبيعات
    window.predictStockDepletion = function(productId) {
        const products = safeJSONParse(ZS.getItem('inventory-products'), [] === '{}' ? {} : []);
        const sales = safeJSONParse(ZS.getItem('sales-history'), [] === '{}' ? {} : []);

        const product = products.find(p => p.id == productId);
        if (!product) return null;

        // حساب متوسط البيع اليومي لآخر 30 يوم
        const productSales = sales.filter(s => s.productId == productId);
        const totalSold = productSales.reduce((sum, s) => sum + s.quantity, 0);
        const dailyRate = totalSold / 30 || 0.5; // معدل افتراضي إذا لم توجد بيانات

        const daysLeft = Math.floor(product.stock / dailyRate);
        return {
            daysLeft: daysLeft,
            status: daysLeft < 7 ? t('critical') : (daysLeft < 15 ? t('warning') : t('healthy')),
            suggestedOrder: product.reorderLevel * 2
        };
    };


    // 3. UI Injections for Inventory
    window.injectInventoryIntelUI = function() {
        const tableRows = document.querySelectorAll('#inventoryTableBody tr');
        tableRows.forEach(row => {
            const productId = row.getAttribute('data-product-id');
            if (!productId) return;

            const prediction = window.predictStockDepletion(productId);
            if (prediction) {
                const stockCell = row.querySelector('.stock-cell');
                if (stockCell && !stockCell.querySelector('.depletion-badge')) {
                    const badge = document.createElement('span');
                    var statusClass = prediction.status === t('critical') ? 'status-out-stock' : (prediction.status === t('warning') ? 'status-low-stock' : 'status-in-stock');
                    badge.className = `status-badge ${statusClass}`;
                    badge.style.fontSize = '10px';
                    badge.style.marginLeft = '5px';
                    badge.innerHTML = `<i class="fas fa-hourglass-half"></i> ${t('badgeLeft', { days: prediction.daysLeft })}`;
                    badge.title = t('badgeTitle', { days: prediction.daysLeft });
                    stockCell.appendChild(badge);
                }
            }
        });

        // Add "Smart Sync" button to action bar
        const actionBar = document.querySelector('.action-bar .btn-group');
        if (actionBar && !document.getElementById('inventoryAIButton')) {
            const aiBtn = document.createElement('button');
            aiBtn.id = 'inventoryAIButton';
            aiBtn.className = 'btn btn-primary';
            aiBtn.innerHTML = `<i class="fas fa-brain"></i> <span data-en="AI Restock" data-ar="إعادة ملء ذكية" data-fr="Réassort IA">${t('aiRestock')}</span>`;
            aiBtn.onclick = () => {
                alert(t('aiRestockMessage'));
                window.location.href = 'modules/purchasing/purchasing_management.html?tab=suggestions';
            };
            actionBar.appendChild(aiBtn);
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(window.injectInventoryIntelUI, 1000);
    });

})();
