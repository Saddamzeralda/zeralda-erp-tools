/* Zeralda ERP - Unified Sales Management Bundle */

/* ========================================================= */
/* FILE: modules/sales/sales_intelligence_plus.js */
/* ========================================================= */
/**
 * 🚀 Sales Intelligence & CRM PLUS - Zeralda ERP
 * تحويل المبيعات إلى نظام اشتراكات، ولاء عملاء، وتنبؤات ذكية
 */

(function () {

    // ── نظام الترجمة الموحد ──
    var DICT = {
        forecastTitle:    { en: 'AI Sales Forecast', ar: 'توقعات المبيعات بالذكاء الاصطناعي', fr: 'Prévisions de ventes IA' },
        forecastValueLabel: { en: 'AI Next Month Forecast', ar: 'توقع الشهر القادم بالذكاء الاصطناعي', fr: 'Prévision IA du mois prochain' },
        growth:           { en: '5% Est. Growth', ar: 'نمو تقديري 5%', fr: 'Croissance estimée à 5 %' }
    };
    var t = window.createRuntimeTranslator ? window.createRuntimeTranslator(DICT) : function (k) { return k; };


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

;
/* ========================================================= */
/* FILE: modules/sales/sales_invoices_module.js */
/* ========================================================= */
(function () {
  // متغيرات Pagination و Sorting
  var currentPage = 1;
  var itemsPerPage = 20; // عدد الفواتير لكل صفحة
  var sortColumn = "date"; // العمود الافتراضي للترتيب
  var sortOrder = "desc"; // desc = من الأحدث للأقدم
  var selectedInvoiceIds = new Set();
  var localInvoiceFiltersEnabled = false;
  var localInvoiceFiltersInitialized = false;
  
  function t(key, fallback) {
    try {
      return typeof window.tr === "function" ? window.tr(key, fallback) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  // تعريف الدوال المساعدة من window (للوصول إليها من داخل الـ IIFE)
  function parseDateInput(value) {
    return typeof window.parseDateInput === "function" ? window.parseDateInput(value) : null;
  }

  function getGlobalFilters() {
    return typeof window.getGlobalFilters === "function" ? window.getGlobalFilters() : { from: null, to: null, customerId: "", productId: "", customerName: "" };
  }

  function getCustomerById(id) {
    return typeof window.getCustomerById === "function" ? window.getCustomerById(id) : null;
  }

  function isDateInRange(dateStr, from, to) {
    return typeof window.isDateInRange === "function" ? window.isDateInRange(dateStr, from, to) : true;
  }

  function getCurrencySymbol() {
    return typeof window.getCurrencySymbol === "function" ? window.getCurrencySymbol() : "$";
  }

  function escapeHTML(str) {
    return typeof window.escapeHTML === "function" ? window.escapeHTML(str) : String(str || "");
  }

  function sendInvoiceEmail(id) {
    return typeof window.sendInvoiceEmail === "function" ? window.sendInvoiceEmail(id) : null;
  }

  function viewInvoice(id) {
    return typeof window.viewInvoice === "function" ? window.viewInvoice(id) : null;
  }

  function editInvoice(id) {
    return typeof window.editInvoice === "function" ? window.editInvoice(id) : null;
  }

  function deleteInvoice(id) {
    return typeof window.deleteInvoice === "function" ? window.deleteInvoice(id) : null;
  }

  function setInvoicePaidValue(invoiceId, paidValue) {
    return typeof window.setInvoicePaidValue === "function" ? window.setInvoicePaidValue(invoiceId, paidValue) : false;
  }

  function updateStats() {
    return typeof window.updateStats === "function" ? window.updateStats() : null;
  }

  function updateInvoicesSummary(list) {
    return typeof window.updateInvoicesSummary === "function" ? window.updateInvoicesSummary(list) : null;
  }

  function generateInvoiceNumberForDate(dateValue) {
    return typeof window.generateInvoiceNumberForDate === "function" ? window.generateInvoiceNumberForDate(dateValue) : ("INV-" + Date.now());
  }

  // متغير للبيانات invoicesData (يجب أن يكون معرّفاً في window)
  var invoicesData = typeof window.invoicesData !== "undefined" ? window.invoicesData : [];

  function formatInvoiceNumber(id) {
    if (id === null || id === undefined) return "";
    var value = String(id).trim();
    if (/^\d+([/-]\d{4})?(?:[\s\-_/]+(?:Bis|Ter|Quater|[A-Za-z]+))?$/i.test(value)) return value;
    if (value.indexOf("INV-") === 0) value = value.replace(/^INV-/, "");
    return value;
  }

  function normalizePaymentMethodValue(value) {
    if (window.ErpFinanceUtils && typeof window.ErpFinanceUtils.normalizePaymentMethodValue === "function") {
      return window.ErpFinanceUtils.normalizePaymentMethodValue(value);
    }
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\/\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isDeferredPaymentMethod(value) {
    if (window.ErpFinanceUtils && typeof window.ErpFinanceUtils.isDeferredPaymentMethod === "function") {
      return window.ErpFinanceUtils.isDeferredPaymentMethod(value);
    }
    var method = normalizePaymentMethodValue(value);
    return (
      method.indexOf("deferred") >= 0 ||
      method.indexOf("differe") >= 0 ||
      method.indexOf("مؤجل") >= 0 ||
      method.indexOf("مدين") >= 0 ||
      method.indexOf("معلق") >= 0
    );
  }

  function isCashPaymentMethod(value) {
    if (window.ErpFinanceUtils && typeof window.ErpFinanceUtils.isCashPaymentMethod === "function") {
      return window.ErpFinanceUtils.isCashPaymentMethod(value);
    }
    var method = normalizePaymentMethodValue(value);
    return method.indexOf("cash") >= 0 || method.indexOf("نقد") >= 0 || method.indexOf("espece") >= 0;
  }

  function isAutoPaidPaymentMethod(value) {
    if (window.ErpFinanceUtils && typeof window.ErpFinanceUtils.isAutoPaidPaymentMethod === "function") {
      return window.ErpFinanceUtils.isAutoPaidPaymentMethod(value);
    }
    var method = normalizePaymentMethodValue(value);
    return (
      method.indexOf("cash") >= 0 ||
      method.indexOf("credit/debit card") >= 0 ||
      method.indexOf("credit") >= 0 ||
      method.indexOf("bank transfer") >= 0 ||
      method.indexOf("virement bancaire") >= 0 ||
      method.indexOf("carte bancaire") >= 0 ||
      method.indexOf("نقد") >= 0 ||
      method.indexOf("بطاقة") >= 0 ||
      method.indexOf("تحويل بنكي") >= 0
    );
  }

  function getInvoiceComputedStatus(inv) {
    if (window.ErpFinanceUtils && typeof window.ErpFinanceUtils.getInvoiceComputedStatus === "function") {
      return window.ErpFinanceUtils.getInvoiceComputedStatus(inv);
    }
    var total = Math.max(0, Number((inv && inv.total) || 0));
    var paid = Math.max(0, Number((inv && inv.paid) || 0));
    if (total <= 0 || paid <= 0) return "Pending";
    if (total > 0 && paid >= total) return "Paid";
    return "Partially Paid";
  }

  function getInvoiceStatusLabel(inv) {
    var computedStatus = getInvoiceComputedStatus(inv);
    if (computedStatus === "Paid") return t("fully_paid", "Fully Paid");
    if (computedStatus === "Partially Paid") return t("partial", "Partial");
    return t("pending", "Pending");
  }

  function reconcileInvoicePaymentStates() {
    var changed = false;
    invoicesData = (invoicesData || []).map(function (inv) {
      var next = Object.assign({}, inv);
      var total = Math.max(0, Number(next.total || 0));
      var currentPaid = Math.max(0, Number(next.paid || 0));

      if (isDeferredPaymentMethod(next.paymentMethod)) {
        var clampedPaid = Math.min(currentPaid, total);
        var status = getInvoiceComputedStatus({ total: total, paid: clampedPaid, paymentMethod: next.paymentMethod });
        if (currentPaid !== clampedPaid || next.status !== status) changed = true;
        next.paid = clampedPaid;
        next.status = status;
        return next;
      }

      if (isAutoPaidPaymentMethod(next.paymentMethod)) {
        // الدفع التلقائي (نقد، بطاقة، تحويل): يُعتبر مدفوعاً بالكامل
        // لكن إذا سجّل المستخدم دفعاً جزئياً يدوياً، نحترم ذلك
        var clampedPaid = Math.min(currentPaid, total);
        // إذا لم يكن هناك paid مسجّل أصلاً (فاتورة جديدة)، نضع paid = total
        if (currentPaid === 0 && total > 0) {
          clampedPaid = total;
        }
        var targetStatus = getInvoiceComputedStatus({ total: total, paid: clampedPaid, paymentMethod: next.paymentMethod });
        if (currentPaid !== clampedPaid || next.status !== targetStatus) changed = true;
        next.paid = clampedPaid;
        next.status = targetStatus;
        return next;
      }

      var clampedPaid = Math.min(currentPaid, total);
      var status = getInvoiceComputedStatus({ total: total, paid: clampedPaid, paymentMethod: next.paymentMethod });
      if (currentPaid !== clampedPaid || next.status !== status) changed = true;
      next.paid = clampedPaid;
      next.status = status;
      return next;
    });

    if (changed) {
      ZS.setItem("invoices-data", JSON.stringify(invoicesData));
    }
    // مزامنة window.invoicesData بعد التوفيق
    window.invoicesData = invoicesData;
  }

  function getFilteredInvoices() {
    // دائماً اقرأ من ZS أولاً للحصول على أحدث البيانات
    try {
      var storedInvoices = JSON.parse(ZS.getItem("invoices-data") || "[]");
      if (Array.isArray(storedInvoices) && storedInvoices.length > 0) {
        invoicesData = storedInvoices;
        window.invoicesData = invoicesData;
      }
    } catch (err) {}
    // إذا كانت ZS فارغة، استخدم window.invoicesData كاحتياط
    if ((!Array.isArray(invoicesData) || invoicesData.length === 0) && typeof window.invoicesData !== "undefined" && Array.isArray(window.invoicesData)) {
      invoicesData = window.invoicesData;
    }

    var g = getGlobalFilters();
    // تم حذف فيلترات التاريخ (invFilterFrom / invFilterTo) — الترتيب بالضغط على عناوين الأعمدة
    var status = String((document.getElementById("invFilterStatus") || {}).value || "").trim();
    var customer = String((document.getElementById("invFilterCustomer") || {}).value || "").trim().toLowerCase();

    var hasLocalFilters = !!(localInvoiceFiltersEnabled && (status || customer));
    var hasGlobalFilters = !!(g && (g.customerId || g.productId));
    var hasAnyFilters = hasLocalFilters || hasGlobalFilters;

    var result = (invoicesData || []).filter(function (inv) {
      if (localInvoiceFiltersEnabled && status && getInvoiceComputedStatus(inv) !== status) return false;

      var invCustomerName = (inv.customer && inv.customer.name) || ((typeof getCustomerById === "function" && getCustomerById(inv.customerId) || {}).name) || "";
      if (localInvoiceFiltersEnabled && customer && String(invCustomerName).toLowerCase().indexOf(customer) < 0) return false;

      if (g.customerId) {
        var invCid = String((inv.customer && inv.customer.id) || inv.customerId || "");
        if (invCid && invCid !== String(g.customerId)) return false;
        if (!invCid && g.customerName && String(invCustomerName).toLowerCase() !== String(g.customerName).toLowerCase()) return false;
      }

      if (g.productId) {
        var items = Array.isArray(inv.items) ? inv.items : [];
        var hasProd = items.some(function (it) { return String((it && it.productId) || "") === String(g.productId); });
        if (!hasProd) return false;
      }

      return true;
    });

    if (result.length === 0 && (invoicesData || []).length > 0 && !hasAnyFilters) {
      return (invoicesData || []).slice();
    }

    // حماية ذاتية: إذا كان الفلتر يخفي كل الفواتير مع وجود بيانات
    // تحقق من أن فلتر العميل النصي لا يحتوي على قيمة قديمة/غير صالحة
    if (result.length === 0 && (invoicesData || []).length > 0 && hasAnyFilters) {
      if (localInvoiceFiltersEnabled && customer) {
        var anyMatch = (invoicesData || []).some(function(inv) {
          var name = (inv.customer && inv.customer.name) || "";
          return name.toLowerCase().indexOf(customer) >= 0;
        });
        if (!anyMatch) {
          // قيمة الفلتر لا تطابق أي عميل - مسح تلقائي
          var custEl = document.getElementById("invFilterCustomer");
          if (custEl) custEl.value = "";
          // إعادة المحاولة بدون فلتر العميل
          var retryResult = (invoicesData || []).filter(function(inv) {
            if (status && getInvoiceComputedStatus(inv) !== status) return false;
            if (g.customerId) {
              var invCid = String((inv.customer && inv.customer.id) || inv.customerId || "");
              if (invCid && invCid !== String(g.customerId)) return false;
            }
            if (g.productId) {
              var items = Array.isArray(inv.items) ? inv.items : [];
              var hasProd = items.some(function(it) { return String((it && it.productId) || "") === String(g.productId); });
              if (!hasProd) return false;
            }
            return true;
          });
          if (retryResult.length > 0) return retryResult;
        }
      }
    }

    return result;
  }

  // دالة لترتيب الفواتير حسب العمود المحدد
  function sortInvoices(invoices) {
    if (!sortColumn) return invoices;

    return invoices.slice().sort(function(a, b) {
      var valA, valB;

      switch(sortColumn) {
        case "id":
          valA = a.invoiceNumber || a.id;
          valB = b.invoiceNumber || b.id;
          break;
        case "customer":
          valA = (a.customer && a.customer.name) || "";
          valB = (b.customer && b.customer.name) || "";
          break;
        case "date":
          valA = new Date(a.date || 0).getTime();
          valB = new Date(b.date || 0).getTime();
          break;
        case "amount":
          valA = Number(a.total || 0);
          valB = Number(b.total || 0);
          break;
        case "paid":
          // Customer Payments — sort by paid amount
          valA = Number(a.paid || 0);
          valB = Number(b.paid || 0);
          break;
        case "status":
          valA = getInvoiceComputedStatus(a);
          valB = getInvoiceComputedStatus(b);
          break;
        default:
          return 0;
      }

      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }

  // تحديث أيقونات الترتيب في عناوين الأعمدة
  function updateSortIcons() {
    var columns = ["id", "customer", "date", "amount", "paid", "status"];
    columns.forEach(function(col) {
      var icon = document.getElementById("sort-icon-" + col);
      if (!icon) return;
      if (col === sortColumn) {
        icon.className = sortOrder === "asc" ? "fas fa-sort-up" : "fas fa-sort-down";
        icon.style.opacity = "0.9";
      } else {
        icon.className = "fas fa-sort";
        icon.style.opacity = "0.5";
      }
    });
  }

  // دالة لإضافة Pagination
  function paginateInvoices(invoices) {
    var startIndex = (currentPage - 1) * itemsPerPage;
    var endIndex = startIndex + itemsPerPage;
    return invoices.slice(startIndex, endIndex);
  }

  // دالة لإنشاء controls الـ Pagination
  function renderPaginationControls(totalItems) {
    var container = document.getElementById("invoicesPaginationContainer");
    if (!container) return;
    
    container.innerHTML = "";
    var totalPages = Math.ceil(totalItems / itemsPerPage);
    
    if (totalPages <= 1) return;
    
    var nav = document.createElement("div");
    nav.style.display = "flex";
    nav.style.gap = "10px";
    nav.style.alignItems = "center";
    nav.style.justifyContent = "center";
    nav.style.marginTop = "20px";
    
    // زر السابق
    var btnPrev = document.createElement("button");
    btnPrev.className = "btn btn-secondary";
    btnPrev.textContent = "‹";
    btnPrev.disabled = currentPage === 1;
    btnPrev.onclick = function() {
      if (currentPage > 1) {
        currentPage--;
        loadInvoicesTable();
      }
    };
    nav.appendChild(btnPrev);
    
    // أرقام الصفحات
    var pageInfo = document.createElement("span");
    pageInfo.textContent = t("page", "Page") + " " + currentPage + " " + t("of", "of") + " " + totalPages;
    pageInfo.style.padding = "0 15px";
    nav.appendChild(pageInfo);
    
    // زر التالي
    var btnNext = document.createElement("button");
    btnNext.className = "btn btn-secondary";
    btnNext.textContent = "›";
    btnNext.disabled = currentPage === totalPages;
    btnNext.onclick = function() {
      if (currentPage < totalPages) {
        currentPage++;
        loadInvoicesTable();
      }
    };
    nav.appendChild(btnNext);
    
    // عدد العناصر لكل صفحة
    var selectWrapper = document.createElement("span");
    selectWrapper.style.marginLeft = "20px";
    selectWrapper.textContent = t("items_per_page", "Items per page") + ": ";
    var selectItems = document.createElement("select");
    selectItems.className = "form-select";
    selectItems.style.width = "80px";
    selectItems.style.display = "inline-block";
    [10, 20, 50, 100].forEach(function(num) {
      var opt = document.createElement("option");
      opt.value = num;
      opt.textContent = num;
      opt.selected = itemsPerPage === num;
      selectItems.appendChild(opt);
    });
    selectItems.onchange = function() {
      itemsPerPage = Number(this.value);
      currentPage = 1;
      loadInvoicesTable();
    };
    selectWrapper.appendChild(selectItems);
    nav.appendChild(selectWrapper);
    
    container.appendChild(nav);
  }

  function syncBulkCount() {
    var countEl = document.getElementById("invBulkCount");
    if (countEl) countEl.textContent = String(selectedInvoiceIds.size);
    var selectAll = document.getElementById("invSelectAll");
    if (selectAll) {
      var filtered = getFilteredInvoices();
      var pageRows = paginateInvoices(sortInvoices(filtered));
      var pageIds = pageRows.map(function (inv) { return String(inv.id); });
      var checkedOnPage = pageIds.length > 0 && pageIds.every(function (id) { return selectedInvoiceIds.has(id); });
      selectAll.checked = checkedOnPage;
    }
  }

  function getSelectedInvoices() {
    return (invoicesData || []).filter(function (inv) { return selectedInvoiceIds.has(String(inv.id)); });
  }


  function bindInvoiceFilters() {
    if (!localInvoiceFiltersInitialized) {
      var statusInit = document.getElementById("invFilterStatus");
      var customerInit = document.getElementById("invFilterCustomer");
      if (statusInit) statusInit.value = "";
      if (customerInit) customerInit.value = "";
      localInvoiceFiltersEnabled = false;
      localInvoiceFiltersInitialized = true;
    }

    ["invFilterStatus", "invFilterCustomer"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.dataset.bound === "1") return;
      el.dataset.bound = "1";
      var eventName = (id === "invFilterCustomer") ? "input" : "change";
      el.addEventListener(eventName, function () {
        localInvoiceFiltersEnabled = true;
        currentPage = 1;
        loadInvoicesTable();
      });
    });

    var resetBtn = document.getElementById("invFilterReset");
    if (resetBtn && resetBtn.dataset.bound !== "1") {
      resetBtn.dataset.bound = "1";
      resetBtn.addEventListener("click", function () {
        var status = document.getElementById("invFilterStatus");
        var customer = document.getElementById("invFilterCustomer");
        if (status) status.value = "";
        if (customer) customer.value = "";
        localInvoiceFiltersEnabled = false;
        currentPage = 1;
        loadInvoicesTable();
      });
    }
  }

  function applyBulkStatus() {
    var status = String((document.getElementById("invBulkStatus") || {}).value || "").trim();
    if (!status) {
      alert(t("select_status_first", "Please select a status first."));
      return;
    }

    if (typeof window.invoicesData !== "undefined" && Array.isArray(window.invoicesData) && window.invoicesData.length > 0) {
      invoicesData = window.invoicesData;
    } else {
      try {
        var stored = JSON.parse(ZS.getItem("invoices-data") || "[]");
        if (Array.isArray(stored)) invoicesData = stored;
      } catch (err) {}
    }

    if (selectedInvoiceIds.size === 0) {
      alert(t("select_invoices_first", "Please select at least one invoice."));
      return;
    }

    var selectedIds = new Set(Array.from(selectedInvoiceIds).map(function (id) { return String(id); }));
    var updatedCount = 0;

    (invoicesData || []).forEach(function (inv, idx) {
      if (!selectedIds.has(String(inv.id))) return;
      var total = Math.max(0, Number(inv.total || 0));
      if (status === "Paid") {
        invoicesData[idx].paid = total;
        invoicesData[idx].status = "Paid";
      } else if (status === "Partially Paid") {
        var half = total > 0 ? (total / 2) : 0;
        var partialPaid = Math.max(0, Math.min(total, half));
        invoicesData[idx].paid = partialPaid;
        invoicesData[idx].status = partialPaid > 0 && partialPaid < total ? "Partially Paid" : (partialPaid >= total && total > 0 ? "Paid" : "Pending");
      } else {
        invoicesData[idx].paid = 0;
        invoicesData[idx].status = "Pending";
      }
      updatedCount += 1;
    });

    if (updatedCount === 0) {
      alert(t("no_matching_invoices", "No matching selected invoices were found."));
      return;
    }

    ZS.setItem("invoices-data", JSON.stringify(invoicesData));
    window.invoicesData = invoicesData;
    selectedInvoiceIds.clear();
    loadInvoicesTable();
    try { if (typeof window.loadInvoicesDrawerTable === "function") window.loadInvoicesDrawerTable(); } catch (err) {}
    updateStats();
    alert(t("bulk_status_applied", "Status applied successfully."));
  }

  function deleteSelectedInvoices() {
    var selected = getSelectedInvoices();
    if (selected.length === 0) return;
    if (!confirm("Delete selected invoices?")) return;
    var ids = new Set(selected.map(function (i) { return String(i.id); }));
    invoicesData = (invoicesData || []).filter(function (inv) { return !ids.has(String(inv.id)); });
    selectedInvoiceIds.clear();
    ZS.setItem("invoices-data", JSON.stringify(invoicesData));
    window.invoicesData = invoicesData;
    loadInvoicesTable();
    updateStats();
  }

  function renderPaymentHistory(inv) {
    var container = document.getElementById("paymentHistoryList");
    if (!container) return;
    var payments = Array.isArray(inv && inv.payments) ? inv.payments.slice() : [];
    payments.sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });
    if (payments.length === 0) {
      container.innerHTML = '<div style="padding:10px;color:#64748b;">No payments recorded.</div>';
      return;
    }
    container.innerHTML = payments.map(function (p) {
      var amount = Number(p.amount || 0).toFixed(2);
      return '<div class="payment-history-item">' +
        '<div><strong>' + escapeHTML(p.date || "") + '</strong><div style="color:#64748b;">' + escapeHTML(p.method || "-") + '</div></div>' +
        '<div style="text-align:right;"><strong>' + escapeHTML(getCurrencySymbol() + amount) + '</strong><div style="color:#64748b;">' + escapeHTML(p.note || "") + '</div></div>' +
      '</div>';
    }).join("");
  }

  function openInvoicePaymentModal(invoiceId) {
    var inv = (invoicesData || []).find(function (i) { return i.id === invoiceId; });
    if (!inv) return;
    var total = Number(inv.total || 0);
    var paid = Number(inv.paid || 0);
    var remaining = Math.max(total - paid, 0);
    var idEl = document.getElementById("paymentModalInvoiceId");
    var refEl = document.getElementById("paymentInvoiceRef");
    var remEl = document.getElementById("paymentRemaining");
    var dateEl = document.getElementById("paymentDate");
    var amountEl = document.getElementById("paymentAmount");
    var methodEl = document.getElementById("paymentMethod");
    var noteEl = document.getElementById("paymentNote");
    if (idEl) idEl.value = String(invoiceId);
    if (refEl) refEl.value = formatInvoiceNumber(inv.invoiceNumber || inv.id);
    if (remEl) remEl.value = getCurrencySymbol() + remaining.toFixed(2);
    if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
    if (amountEl) amountEl.value = remaining > 0 ? remaining.toFixed(2) : "0.00";
    if (methodEl) methodEl.value = "Cash";
    if (noteEl) noteEl.value = "";
    renderPaymentHistory(inv);
    if (typeof window.openModal === "function") {
      window.openModal("invoicePaymentModal");
    }
  }

  function saveInvoicePaymentFromModal() {
    var invoiceId = String((document.getElementById("paymentModalInvoiceId") || {}).value || "");
    if (!invoiceId) return;
    var idx = (invoicesData || []).findIndex(function (i) { return String(i.id) === invoiceId; });
    if (idx < 0) return;
    var inv = invoicesData[idx];
    var total = Number(inv.total || 0);
    var currentPaid = Number(inv.paid || 0);
    var remaining = Math.max(total - currentPaid, 0);
    var amount = Number((document.getElementById("paymentAmount") || {}).value || 0);
    var date = String((document.getElementById("paymentDate") || {}).value || "").trim();
    var method = String((document.getElementById("paymentMethod") || {}).value || "").trim();
    var note = String((document.getElementById("paymentNote") || {}).value || "").trim();
    if (!isFinite(amount) || amount <= 0) return;
    if (amount > remaining) amount = remaining;
    inv.payments = Array.isArray(inv.payments) ? inv.payments : [];
    inv.payments.push({
      id: "PAY-" + Date.now(),
      date: date || new Date().toISOString().slice(0, 10),
      amount: amount,
      method: method || "Cash",
      note: note,
      createdAt: new Date().toISOString()
    });
    var nextPaid = Math.min(currentPaid + amount, total);
    inv.paid = nextPaid;
    inv.status = nextPaid >= total && total > 0 ? "Paid" : "Pending";
    invoicesData[idx] = inv;
    ZS.setItem("invoices-data", JSON.stringify(invoicesData));
    window.invoicesData = invoicesData;
    renderPaymentHistory(inv);
    loadInvoicesTable();
    updateStats();
  }

  function bindInvoiceActions() {
    bindInvoiceFilters();
    var selectAll = document.getElementById("invSelectAll");
    if (selectAll && selectAll.dataset.bound !== "1") {
      selectAll.dataset.bound = "1";
      selectAll.addEventListener("change", function () {
        var filtered = getFilteredInvoices();
        var pageRows = paginateInvoices(sortInvoices(filtered));
        pageRows.forEach(function (inv) {
          var id = String(inv.id);
          if (selectAll.checked) selectedInvoiceIds.add(id);
          else selectedInvoiceIds.delete(id);
        });
        loadInvoicesTable();
      });
    }

    var bulkStatusBtn = document.getElementById("invBulkMarkStatusBtn");
    if (bulkStatusBtn && bulkStatusBtn.dataset.bound !== "1") {
      bulkStatusBtn.dataset.bound = "1";
      bulkStatusBtn.addEventListener("click", applyBulkStatus);
    }
    var bulkDeleteBtn = document.getElementById("invBulkDeleteBtn");
    if (bulkDeleteBtn && bulkDeleteBtn.dataset.bound !== "1") {
      bulkDeleteBtn.dataset.bound = "1";
      bulkDeleteBtn.addEventListener("click", deleteSelectedInvoices);
    }
    var paySaveBtn = document.getElementById("paymentSaveBtn");
    if (paySaveBtn && paySaveBtn.dataset.bound !== "1") {
      paySaveBtn.dataset.bound = "1";
      paySaveBtn.addEventListener("click", saveInvoicePaymentFromModal);
    }
  }

  function duplicateInvoiceRecord(invoiceId) {
    var source = (invoicesData || []).find(function (i) { return i.id === invoiceId; });
    if (!source) return;
    var today = new Date().toISOString().slice(0, 10);
    var copy = JSON.parse(JSON.stringify(source));
    copy.id = "INV-" + Date.now();
    copy.invoiceNumber = generateInvoiceNumberForDate(today);
    copy.date = today;
    copy.status = "Pending";
    copy.paid = 0;
    copy.payments = [];
    copy.paymentMethod = "";
    copy.fromProforma = null;
    invoicesData.push(copy);
    ZS.setItem("invoices-data", JSON.stringify(invoicesData));
    window.invoicesData = invoicesData;
    currentPage = 1;
    loadInvoicesTable();
    try { if (typeof window.loadInvoicesDrawerTable === "function") window.loadInvoicesDrawerTable(); } catch (err) {}
    updateStats();
  }

  function createBisInvoiceFrom(invoiceId) {
    var source = (invoicesData || []).find(function (i) { return i.id === invoiceId; });
    if (!source) return;

    if (typeof openCreateInvoice === "function") {
      openCreateInvoice();
    } else if (typeof window.openCreateInvoice === "function") {
      window.openCreateInvoice();
    }

    var baseNum = String(source.invoiceNumber || formatInvoiceNumber(source.id) || "").trim();
    baseNum = baseNum.replace(/\s+(?:Bis|Ter|Quater|[A-Za-z]+)$/i, "");
    if (!/^\d+\/\d{4}$/.test(baseNum)) {
      var d = source.date || new Date().toISOString().slice(0, 10);
      baseNum = typeof getLatestBaseInvoiceNumber === "function" ? getLatestBaseInvoiceNumber(d) : generateInvoiceNumberForDate(d);
    }

    var targetSuffix = "Bis";
    var existingWithBis = (invoicesData || []).some(function(inv) {
      return String(inv.invoiceNumber || "").trim().toLowerCase() === (baseNum + " bis").toLowerCase();
    });
    if (existingWithBis) {
      var existingWithTer = (invoicesData || []).some(function(inv) {
        return String(inv.invoiceNumber || "").trim().toLowerCase() === (baseNum + " ter").toLowerCase();
      });
      targetSuffix = existingWithTer ? "Quater" : "Ter";
    }

    var invNumInput = document.getElementById("invoiceNumberInput");
    var bisCheck = document.getElementById("invoiceBisCheckbox");
    var suffixSelect = document.getElementById("invoiceNumberSuffix");
    var bisBadge = document.getElementById("invoiceBisBadge");

    if (bisCheck) bisCheck.checked = true;
    if (suffixSelect) {
      suffixSelect.value = targetSuffix;
      suffixSelect.style.display = "inline-block";
    }
    if (bisBadge) bisBadge.style.display = "inline-block";
    if (invNumInput) {
      invNumInput.value = baseNum + " " + targetSuffix;
    }

    if (source.customer && source.customer.id) {
      var custSelect = document.getElementById("invoiceCustomer");
      if (custSelect) custSelect.value = source.customer.id;
    }
    if (source.date) {
      var dateInput = document.getElementById("invoiceDate");
      if (dateInput) dateInput.value = source.date;
    }
    if (source.paymentMethod) {
      var payInput = document.getElementById("invoicePaymentMethod");
      if (payInput) payInput.value = source.paymentMethod;
    }
    if (source.stampRate !== undefined) {
      var stampInput = document.getElementById("invoiceStampRate");
      if (stampInput) stampInput.value = String(source.stampRate);
    }
    if (source.taxRate !== undefined) {
      var taxInput = document.getElementById("invoiceTaxRate");
      if (taxInput) taxInput.value = source.taxRate;
      var taxCheck = document.getElementById("invoiceIncludeTax");
      if (taxCheck) taxCheck.checked = Boolean(source.tax || source.taxRate > 0);
    }

    if (Array.isArray(source.items) && source.items.length > 0) {
      if (typeof window.invoiceItemsArray !== "undefined") {
        window.invoiceItemsArray = [];
      }
      var itemsCont = document.getElementById("invoiceItems");
      if (itemsCont) itemsCont.innerHTML = "";
      source.items.forEach(function(item) {
        if (typeof addInvoiceItem === "function") {
          addInvoiceItem();
          var arr = typeof invoiceItemsArray !== "undefined" ? invoiceItemsArray : window.invoiceItemsArray;
          if (arr && arr.length > 0) {
            var id = arr.length - 1;
            arr[id].productId = item.productId || 0;
            arr[id].description = item.description || "";
            arr[id].quantity = item.quantity || 1;
            arr[id].price = item.price || 0;
            arr[id].total = item.total || arr[id].quantity * arr[id].price;
            arr[id].unit = item.unit || "unit";
            arr[id].fp = item.fp || "";

            var row = document.getElementById("item-" + id);
            if (row) {
              var picker = row.querySelector('.product-picker');
              if (picker && picker._setProduct) {
                picker._setProduct(item.productId || 0, item.description || '');
              }
              var fpSelect = row.querySelector('select[data-role="fp"]');
              if (fpSelect) fpSelect.value = arr[id].fp || "";
              var unitSelectEl = Array.from(row.querySelectorAll("select")).find(function(s){ return s !== fpSelect; });
              if (unitSelectEl) unitSelectEl.value = arr[id].unit;
              var qtyInput = row.querySelector('input[data-role="qty"]');
              var priceInput = row.querySelector('input[data-role="price"]');
              if (qtyInput) qtyInput.value = arr[id].quantity;
              if (priceInput) priceInput.value = arr[id].price;
              var span = document.getElementById("item-total-" + id);
              if (span) span.textContent = Number(arr[id].total).toFixed(2);
            }
          }
        }
      });
      if (typeof calculateInvoiceTotal === "function") calculateInvoiceTotal();
    }
  }

  function loadInvoicesTable() {
    bindInvoiceActions();
    // تحديث أيقونات الترتيب في عناوين الأعمدة
    updateSortIcons();
    // حفظ البيانات السابقة للحماية من فقدان البيانات
    var previousData = Array.isArray(invoicesData) ? invoicesData.slice() : [];

    // دائماً اقرأ من localStorage أولاً للحصول على أحدث البيانات
    try {
      var storedInvoices = JSON.parse(ZS.getItem("invoices-data") || "[]");
      console.log('[Invoices] loadInvoicesTable: localStorage data count:', Array.isArray(storedInvoices) ? storedInvoices.length : 'N/A', 'window.invoicesData count:', (window.invoicesData || []).length);
      if (Array.isArray(storedInvoices) && storedInvoices.length > 0) {
        invoicesData = storedInvoices;
        window.invoicesData = invoicesData;
      }
    } catch (err) {
      console.error("Error rehydrating invoices data:", err);
    }

    // إذا كانت localStorage فارغة، استخدم window.invoicesData كاحتياط
    if ((!Array.isArray(invoicesData) || invoicesData.length === 0) && typeof window.invoicesData !== "undefined" && Array.isArray(window.invoicesData) && window.invoicesData.length > 0) {
      invoicesData = window.invoicesData;
    }

    // إذا كانت البيانات لا تزال فارغة، استخدم البيانات السابقة
    if ((!Array.isArray(invoicesData) || invoicesData.length === 0) && previousData.length > 0) {
      invoicesData = previousData;
    }

    // مزامنة window.invoicesData مع البيانات المحدّثة
    window.invoicesData = invoicesData;

    var tb = document.getElementById("invoicesTableBody");
    if (!tb) return;
    tb.innerHTML = "";

    var filtered = getFilteredInvoices();
    
    // تطبيق الترتيب
    var sorted = sortInvoices(filtered);
    
    // حفظ العدد الإجمالي قبل Pagination
    var totalFiltered = sorted.length;
    
    if (typeof updateInvoicesSummary === "function") updateInvoicesSummary(filtered);

    if (filtered.length === 0) {
      var noRow = document.createElement("tr");
      var noCell = document.createElement("td");
      noCell.colSpan = 8;
      noCell.style.textAlign = "center";
      noCell.style.padding = "30px";
      noCell.style.color = "#6b7280";
      noCell.textContent = t("no_invoices", "No invoices.");
      noRow.appendChild(noCell);
      tb.appendChild(noRow);
      renderPaginationControls(0);
      return;
    }

    // تطبيق Pagination مع التحقق من صلاحية الصفحة الحالية
    var totalPages = Math.ceil(sorted.length / itemsPerPage);
    if (currentPage > totalPages) currentPage = 1;
    var paginated = paginateInvoices(sorted);
    var rowsFragment = document.createDocumentFragment();

    var currency = getCurrencySymbol();
    paginated.forEach(function (inv) {
      var row = document.createElement("tr");

      var tdSelect = document.createElement("td");
      tdSelect.style.textAlign = "center";
      tdSelect.style.padding = "10px";
      var rowCheck = document.createElement("input");
      rowCheck.type = "checkbox";
      rowCheck.checked = selectedInvoiceIds.has(String(inv.id));
      rowCheck.addEventListener("change", function () {
        var id = String(inv.id);
        if (rowCheck.checked) selectedInvoiceIds.add(id);
        else selectedInvoiceIds.delete(id);
        syncBulkCount();
      });
      tdSelect.appendChild(rowCheck);

      var tdId = document.createElement("td");
      var formattedInvNum = formatInvoiceNumber(inv.invoiceNumber || inv.id);
      var isBisInvoice = /\b(bis|ter|quater)\b/i.test(formattedInvNum);
      if (isBisInvoice) {
        tdId.innerHTML = "<strong>" + escapeHTML(formattedInvNum) + "</strong> <span style=\"margin-inline-start:4px; background:#e0e7ff; color:#3730a3; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; text-transform:uppercase;\">BIS</span>";
      } else {
        tdId.innerHTML = "<strong>" + escapeHTML(formattedInvNum) + "</strong>";
      }

      var tdCustomer = document.createElement("td");
      tdCustomer.textContent = (inv.customer && inv.customer.name) || "-";

      var tdDate = document.createElement("td");
      tdDate.textContent = inv.date || "-";

      var tdAmount = document.createElement("td");
      tdAmount.innerHTML = "<strong>" + escapeHTML(currency + Number(inv.total).toFixed(2)) + "</strong>";

      var tdStatus = document.createElement("td");
      var statusSpan = document.createElement("span");
      var computedStatus = getInvoiceComputedStatus(inv);
      statusSpan.className = "badge badge-" + (computedStatus === "Paid" ? "success" : computedStatus === "Partially Paid" ? "info" : "warning");
      statusSpan.textContent = getInvoiceStatusLabel(inv);
      tdStatus.appendChild(statusSpan);

      var tdActions = document.createElement("td");
      var actionsDiv = document.createElement("div");
      actionsDiv.className = "action-buttons";

      var btnEmail = document.createElement("button");
      btnEmail.className = "btn btn-info";
      btnEmail.style.padding = "8px 12px";
      btnEmail.style.fontSize = "12px";
      btnEmail.innerHTML = '<i class="fas fa-envelope"></i>';
      btnEmail.addEventListener("click", function () { sendInvoiceEmail(inv.id); });

      var btnWhatsApp = document.createElement("button");
      btnWhatsApp.className = "btn";
      btnWhatsApp.style.cssText = "padding:8px 12px;font-size:12px;background:#25D366;color:#fff;";
      btnWhatsApp.innerHTML = '<i class="fab fa-whatsapp"></i>';
      btnWhatsApp.title = "WhatsApp";
      btnWhatsApp.addEventListener("click", function () {
        if (typeof shareInvoiceViaWhatsApp === 'function') {
          shareInvoiceViaWhatsApp(inv.id);
        } else {
          alert('WhatsApp share function not available');
        }
      });

      var btnView = document.createElement("button");
      btnView.className = "btn btn-primary";
      btnView.style.padding = "8px 12px";
      btnView.style.fontSize = "12px";
      btnView.innerHTML = '<i class="fas fa-eye"></i>';
      btnView.addEventListener("click", function () { viewInvoice(inv.id); });

      var btnEdit = document.createElement("button");
      btnEdit.className = "btn btn-primary";
      btnEdit.style.padding = "8px 12px";
      btnEdit.style.fontSize = "12px";
      btnEdit.innerHTML = '<i class="fas fa-edit"></i>';
      btnEdit.addEventListener("click", function () { editInvoice(inv.id); });

      var btnDelete = document.createElement("button");
      btnDelete.className = "btn btn-danger";
      btnDelete.style.padding = "8px 12px";
      btnDelete.style.fontSize = "12px";
      btnDelete.innerHTML = '<i class="fas fa-trash"></i>';
      btnDelete.addEventListener("click", function () { deleteInvoice(inv.id); });

      var btnDuplicate = document.createElement("button");
      btnDuplicate.className = "btn btn-secondary";
      btnDuplicate.style.padding = "8px 12px";
      btnDuplicate.style.fontSize = "12px";
      btnDuplicate.innerHTML = '<i class="fas fa-copy"></i>';
      btnDuplicate.title = t("duplicate", "Duplicate");
      btnDuplicate.addEventListener("click", function () { duplicateInvoiceRecord(inv.id); });

      var btnPay = document.createElement("button");
      btnPay.className = "btn btn-warning";
      btnPay.style.padding = "8px 12px";
      btnPay.style.fontSize = "12px";
      btnPay.innerHTML = '<i class="fas fa-money-bill-wave"></i>';
      btnPay.title = t("record_payment", "Record Payment");
      btnPay.addEventListener("click", function () {
        openInvoicePaymentModal(inv.id);
      });

      var btnBis = document.createElement("button");
      btnBis.className = "btn btn-outline-primary";
      btnBis.style.padding = "8px 12px";
      btnBis.style.fontSize = "12px";
      btnBis.innerHTML = '<span style="font-weight:700;font-size:11px;">BIS</span>';
      btnBis.title = t("create_bis_invoice", "Create Bis Invoice");
      btnBis.addEventListener("click", function () {
        createBisInvoiceFrom(inv.id);
      });

      actionsDiv.appendChild(btnView);
      actionsDiv.appendChild(btnEdit);
      actionsDiv.appendChild(btnWhatsApp);
      actionsDiv.appendChild(btnDuplicate);
      actionsDiv.appendChild(btnBis);
      actionsDiv.appendChild(btnDelete);
      actionsDiv.appendChild(btnPay);
      tdActions.appendChild(actionsDiv);

      var tdPayments = document.createElement("td");
      var paid = Number(inv.paid || 0);
      var total = Number(inv.total || 0);
      var remaining = Math.max(total - paid, 0);
      var paymentStatusHtml = "";

      if (paid < total) {
        paymentStatusHtml = '<span style="color:#b91c1c;font-weight:600;display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;">' + currency + paid.toFixed(2) + ' / ' + currency + total.toFixed(2) + '</span>';
      } else if (paid >= total && total > 0) {
        paymentStatusHtml = '<span style="color:#15803d;font-weight:600;display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;">' + currency + paid.toFixed(2) + ' / ' + currency + total.toFixed(2) + '</span>';
      } else {
        paymentStatusHtml = '<span style="color:#6b7280;">' + currency + paid.toFixed(2) + ' / ' + currency + total.toFixed(2) + '</span>';
      }

      paymentStatusHtml += '<div class="remaining-edit" style="margin-top:6px;color:#6b7280;font-size:13px;cursor:pointer;" data-invoice-id="' + String(inv.id) + '">' + t("remaining", "Remaining") + ': <strong>' + currency + remaining.toFixed(2) + '</strong></div>';
      tdPayments.innerHTML = paymentStatusHtml;

      var remEl = tdPayments.querySelector(".remaining-edit");
      if (remEl) {
        remEl.addEventListener("click", function () {
          var totalValue = Number(inv.total || 0);
          var paidValue = Number(inv.paid || 0);
          var remainingNow = Math.max(totalValue - paidValue, 0);
          var label = t("remaining", "Remaining");
          var input = prompt(label, String(remainingNow.toFixed(2)));
          if (input === null) return;
          var newRemaining = Number(input);
          if (!isFinite(newRemaining) || newRemaining < 0) return;
          if (setInvoiceRemainingValue(inv.id, newRemaining)) {
            loadInvoicesTable();
            try { loadInvoicesDrawerTable(); } catch (err) {}
            updateStats();
          }
        });
      }

      row.appendChild(tdSelect);
      row.appendChild(tdId);
      row.appendChild(tdCustomer);
      row.appendChild(tdDate);
      row.appendChild(tdAmount);
      row.appendChild(tdPayments);
      row.appendChild(tdStatus);
      row.appendChild(tdActions);
      rowsFragment.appendChild(row);
    });

    tb.appendChild(rowsFragment);

    syncBulkCount();
    
    // إضافة controls الـ Pagination
    renderPaginationControls(totalFiltered);
  }

  // دالة لتغيير الترتيب
  function setSortColumn(column) {
    if (sortColumn === column) {
      // عكس الترتيب إذا كان نفس العمود
      sortOrder = sortOrder === "asc" ? "desc" : "asc";
    } else {
      sortColumn = column;
      // الافتراضي: تصاعدي للنصوص (id, customer, status)، تنازلي للأرقام والتواريخ
      if (column === "date" || column === "amount" || column === "paid") {
        sortOrder = "desc";
      } else {
        sortOrder = "asc";
      }
    }
    currentPage = 1; // العودة للصفحة الأولى
    updateSortIcons();
    loadInvoicesTable();
  }

  window.formatInvoiceNumber = formatInvoiceNumber;
  window.normalizePaymentMethodValue = normalizePaymentMethodValue;
  window.isDeferredPaymentMethod = isDeferredPaymentMethod;
  window.isCashPaymentMethod = isCashPaymentMethod;
  window.isAutoPaidPaymentMethod = isAutoPaidPaymentMethod;
  window.getInvoiceComputedStatus = getInvoiceComputedStatus;
  window.getInvoiceStatusLabel = getInvoiceStatusLabel;
  window.reconcileInvoicePaymentStates = reconcileInvoicePaymentStates;
  window.getFilteredInvoices = getFilteredInvoices;
  window.loadInvoicesTable = loadInvoicesTable;
  window.setSortColumn = setSortColumn;
  window.duplicateInvoiceRecord = duplicateInvoiceRecord;
  window.createBisInvoiceFrom = createBisInvoiceFrom;
  window.openInvoicePaymentModal = openInvoicePaymentModal;

  window.SalesInvoicesModule = {
    loadInvoicesTable: loadInvoicesTable,
    getFilteredInvoices: getFilteredInvoices
  };

  // Defensive bootstrapping: ensures bulk action buttons are bound even if outer loader timing changes.
  if (document.getElementById("invoicesTableBody")) {
    bindInvoiceActions();
    syncBulkCount();
  }
})();

;
/* ========================================================= */
/* FILE: modules/sales/sales_proformas_module.js */
/* ========================================================= */
(function () {
  function t(key, fallback) {
    try {
      return typeof window.tr === "function" ? window.tr(key, fallback) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function formatProformaNumber(id) {
    if (id === null || id === undefined) return "";
    var value = String(id).trim();
    if (/^\d+([/-]\d{4})?(?:[\s\-_/]+(?:Bis|Ter|Quater|[A-Za-z]+))?$/i.test(value)) return value;
    if (value.indexOf("PRO-") === 0) value = value.replace(/^PRO-/, "");
    return value;
  }

  function getFilteredProformas() {
    var g = getGlobalFilters();

    return (proformasData || []).filter(function (prof) {
      var profCustomerName =
        (prof.customer && prof.customer.name) ||
        ((typeof getCustomerById === "function" && getCustomerById(prof.customerId) || {}).name) ||
        "";

      if (g.customerId) {
        var profCid = String((prof.customer && prof.customer.id) || prof.customerId || "");
        if (profCid && profCid !== String(g.customerId)) return false;
        if (!profCid && g.customerName && String(profCustomerName).toLowerCase() !== String(g.customerName).toLowerCase()) return false;
      }

      if (g.productId) {
        var items = Array.isArray(prof.items) ? prof.items : [];
        var hasProd = items.some(function (it) { return String((it && it.productId) || "") === String(g.productId); });
        if (!hasProd) return false;
      }

      if (!isDateInRange(prof.date, g.from, g.to)) return false;
      return true;
    });
  }

  function loadProformasTable() {
    var tb = document.getElementById("proformasTableBody");
    if (!tb) return;
    tb.innerHTML = "";

    var filtered = getFilteredProformas();
    if (typeof updateProformasSummary === "function") updateProformasSummary(filtered);

    if (filtered.length === 0) {
      var trNo = document.createElement("tr");
      var tdNo = document.createElement("td");
      tdNo.colSpan = 6;
      tdNo.style.textAlign = "center";
      tdNo.style.padding = "30px";
      tdNo.style.color = "#6b7280";
      tdNo.textContent = t("no_proformas", "No proforma invoices.");
      trNo.appendChild(tdNo);
      tb.appendChild(trNo);
      return;
    }

    var currency = getCurrencySymbol();
    var rowsFragment = document.createDocumentFragment();
    filtered.slice().reverse().forEach(function (prof) {
      var row = document.createElement("tr");
      row.style.borderBottom = "1px solid #333";

      var tdId = document.createElement("td");
      tdId.style.padding = "12px";
      tdId.style.border = "1px solid #333";
      var formattedProfNum = formatProformaNumber(prof.proformaNumber || prof.id);
      var isProfBis = /\b(bis|ter|quater)\b/i.test(formattedProfNum);
      if (isProfBis) {
        tdId.innerHTML = "<strong>" + escapeHTML(formattedProfNum) + "</strong> <span style=\"margin-inline-start:4px; background:#e0e7ff; color:#3730a3; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; text-transform:uppercase;\">BIS</span>";
      } else {
        tdId.innerHTML = "<strong>" + escapeHTML(formattedProfNum) + "</strong>";
      }

      var tdCustomer = document.createElement("td");
      tdCustomer.style.padding = "12px";
      tdCustomer.style.border = "1px solid #333";
      tdCustomer.textContent = (prof.customer && prof.customer.name) || "-";

      var tdDate = document.createElement("td");
      tdDate.style.padding = "12px";
      tdDate.style.border = "1px solid #333";
      tdDate.textContent = prof.date || "-";

      var tdAmount = document.createElement("td");
      tdAmount.style.padding = "12px";
      tdAmount.style.border = "1px solid #333";
      tdAmount.innerHTML = "<strong>" + escapeHTML(currency + Number(prof.total).toFixed(2)) + "</strong>";

      var tdStatus = document.createElement("td");
      tdStatus.style.padding = "12px";
      tdStatus.style.border = "1px solid #333";
      var statusSpan = document.createElement("span");
      statusSpan.className = "badge badge-" + ({ Draft: "info", Sent: "warning", Approved: "success", Rejected: "danger", Converted: "purple" }[prof.status] || "info");
      statusSpan.textContent = prof.status || "-";
      tdStatus.appendChild(statusSpan);

      var tdActions = document.createElement("td");
      tdActions.style.padding = "12px";
      tdActions.style.border = "1px solid #333";
      var actionsDiv = document.createElement("div");
      actionsDiv.className = "action-buttons";

      var btnEM = document.createElement("button");
      btnEM.className = "btn btn-info";
      btnEM.style.padding = "8px 12px";
      btnEM.style.fontSize = "12px";
      btnEM.innerHTML = '<i class="fas fa-envelope"></i>';
      btnEM.addEventListener("click", function () { sendProformaEM(prof.id, prof.customer && prof.customer.email); });

      var btnWA = document.createElement("button");
      btnWA.className = "btn";
      btnWA.style.cssText = "padding:8px 12px;font-size:12px;background:#25D366;color:#fff;";
      btnWA.innerHTML = '<i class="fab fa-whatsapp"></i>';
      btnWA.title = "WhatsApp";
      btnWA.addEventListener("click", function () {
        if (typeof shareProformaViaWhatsApp === 'function') {
          shareProformaViaWhatsApp(prof.id);
        } else {
          alert('WhatsApp share function not available');
        }
      });

      var btnView = document.createElement("button");
      btnView.className = "btn btn-primary";
      btnView.style.padding = "8px 12px";
      btnView.style.fontSize = "12px";
      btnView.innerHTML = '<i class="fas fa-eye"></i>';
      btnView.addEventListener("click", function () { viewProforma(prof.id); });

      var btnEdit = document.createElement("button");
      btnEdit.className = "btn btn-primary";
      btnEdit.style.padding = "8px 12px";
      btnEdit.style.fontSize = "12px";
      btnEdit.innerHTML = '<i class="fas fa-edit"></i>';
      btnEdit.addEventListener("click", function () { editProforma(prof.id); });

      var btnDelete = document.createElement("button");
      btnDelete.className = "btn btn-danger";
      btnDelete.style.padding = "8px 12px";
      btnDelete.style.fontSize = "12px";
      btnDelete.innerHTML = '<i class="fas fa-trash"></i>';
      btnDelete.addEventListener("click", function () { deleteProforma(prof.id); });

      actionsDiv.appendChild(btnEM);
      actionsDiv.appendChild(btnWA);
      actionsDiv.appendChild(btnView);
      actionsDiv.appendChild(btnEdit);
      actionsDiv.appendChild(btnDelete);
      tdActions.appendChild(actionsDiv);

      row.appendChild(tdId);
      row.appendChild(tdCustomer);
      row.appendChild(tdDate);
      row.appendChild(tdAmount);
      row.appendChild(tdStatus);
      row.appendChild(tdActions);
      rowsFragment.appendChild(row);
    });
    tb.appendChild(rowsFragment);
  }

  window.formatProformaNumber = formatProformaNumber;
  window.getFilteredProformas = getFilteredProformas;
  window.loadProformasTable = loadProformasTable;

  window.SalesProformasModule = {
    loadProformasTable: loadProformasTable,
    getFilteredProformas: getFilteredProformas
  };
})();

;
/* ========================================================= */
/* FILE: modules/sales/sales_customers_module.js */
/* ========================================================= */
(function () {
  var customerPreviewStyleInjected = false;

  function t(key, fallback) {
    try {
      return typeof window.tr === "function" ? window.tr(key, fallback) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function escapeHtml(value) {
    if (typeof window.escapeHTML === "function") return window.escapeHTML(value);
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatMoney(value) {
    var currency = typeof window.getCurrencySymbol === "function" ? window.getCurrencySymbol() : "$";
    var amount = Number(value || 0);
    if (!isFinite(amount)) amount = 0;
    return currency + amount.toFixed(2);
  }

  function injectCustomerPreviewStyles() {
    if (customerPreviewStyleInjected || document.getElementById("customerPreviewStyles")) {
      customerPreviewStyleInjected = true;
      return;
    }
    var style = document.createElement("style");
    style.id = "customerPreviewStyles";
    style.textContent =
      ".customer-preview-modal .modal-content{max-width:860px;width:95%;}" +
      ".customer-preview-wrap{display:flex;flex-direction:column;gap:18px;}" +
      ".customer-preview-header{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:linear-gradient(135deg,#f8fafc,#eef2ff);}" +
      ".customer-preview-name{font-size:22px;font-weight:800;line-height:1.2;color:#111827;margin-bottom:6px;}" +
      ".customer-preview-sub{color:#4b5563;font-size:13px;}" +
      ".customer-type-pill{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap;border:1px solid #cbd5e1;background:#ffffff;color:#1f2937;}" +
      ".customer-preview-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;}" +
      ".customer-stat{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px;}" +
      ".customer-stat .k{font-size:12px;color:#6b7280;margin-bottom:6px;}" +
      ".customer-stat .v{font-size:18px;font-weight:800;color:#111827;}" +
      ".customer-preview-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}" +
      ".customer-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;}" +
      ".customer-card h4{margin:0 0 10px 0;font-size:14px;color:#111827;}" +
      ".customer-row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px dashed #e5e7eb;}" +
      ".customer-row:last-child{border-bottom:none;padding-bottom:0;}" +
      ".customer-row .l{color:#6b7280;font-size:12px;}" +
      ".customer-row .r{color:#111827;font-size:13px;font-weight:600;text-align:right;max-width:60%;overflow-wrap:anywhere;}" +
      "@media (max-width: 900px){.customer-preview-stats{grid-template-columns:repeat(2,minmax(0,1fr));}.customer-preview-grid{grid-template-columns:1fr;}}";
    document.head.appendChild(style);
    customerPreviewStyleInjected = true;
  }

  function ensureCustomerPreviewModal() {
    var modal = document.getElementById("customerPreviewModal");
    if (modal) return modal;

    var shell = document.createElement("div");
    shell.id = "customerPreviewModal";
    shell.className = "modal customer-preview-modal";
    shell.innerHTML =
      '<div class="modal-content">' +
        '<div class="modal-header">' +
          '<h2>' + escapeHtml(t("customer_preview", "Customer Preview")) + '</h2>' +
          '<span class="close" id="customerPreviewClose">&times;</span>' +
        '</div>' +
        '<div class="modal-body">' +
          '<div id="customerPreviewBody" class="customer-preview-wrap"></div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(shell);

    var closeBtn = document.getElementById("customerPreviewClose");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        shell.classList.remove("active");
      });
    }
    shell.addEventListener("click", function (e) {
      if (e.target === shell) shell.classList.remove("active");
    });

    if (!document.body.dataset.customerPreviewEscBound) {
      document.body.dataset.customerPreviewEscBound = "1";
      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        var preview = document.getElementById("customerPreviewModal");
        if (preview && preview.classList.contains("active")) {
          preview.classList.remove("active");
        }
      });
    }
    return shell;
  }

  function openCustomerPreviewModal(customer, metrics) {
    injectCustomerPreviewStyles();
    var modal = ensureCustomerPreviewModal();
    var body = document.getElementById("customerPreviewBody");
    if (!modal || !body) return;

    var typeValue = customer.customerType || (customer.isCompany ? "legal" : "natural");
    var typeLabel = typeValue === "legal" ? t("legal_entity", "Legal Entity") : t("natural_person", "Natural Person");

    var legalRows = "";
    if (typeValue === "legal") {
      legalRows =
        '<div class="customer-row"><span class="l">RC</span><span class="r">' + escapeHtml(customer.rc || "-") + '</span></div>' +
        '<div class="customer-row"><span class="l">NIF</span><span class="r">' + escapeHtml(customer.nif || "-") + '</span></div>' +
        '<div class="customer-row"><span class="l">NIS</span><span class="r">' + escapeHtml(customer.nis || "-") + '</span></div>' +
        '<div class="customer-row"><span class="l">AI</span><span class="r">' + escapeHtml(customer.ai || "-") + '</span></div>' +
        '<div class="customer-row"><span class="l">ART</span><span class="r">' + escapeHtml(customer.art || "-") + '</span></div>';
    } else {
      legalRows = '<div class="customer-row"><span class="l">' + escapeHtml(t("profile_type", "Profile Type")) + '</span><span class="r">' + escapeHtml(typeLabel) + '</span></div>';
    }

    body.innerHTML =
      '<div class="customer-preview-header">' +
        '<div>' +
          '<div class="customer-preview-name">' + escapeHtml(customer.name || "-") + '</div>' +
          '<div class="customer-preview-sub">' + escapeHtml(t("customer_preview_hint", "Comprehensive customer overview")) + '</div>' +
        '</div>' +
        '<span class="customer-type-pill"><i class="fas fa-id-badge"></i> ' + escapeHtml(typeLabel) + '</span>' +
      '</div>' +
      '<div class="customer-preview-stats">' +
        '<div class="customer-stat"><div class="k">' + escapeHtml(t("total_invoices", "Total Invoices")) + '</div><div class="v">' + escapeHtml(String(metrics.invoiceCount)) + '</div></div>' +
        '<div class="customer-stat"><div class="k">' + escapeHtml(t("total_proformas", "Total Proformas")) + '</div><div class="v">' + escapeHtml(String(metrics.proformaCount)) + '</div></div>' +
        '<div class="customer-stat"><div class="k">' + escapeHtml(t("total_revenue", "Total Revenue")) + '</div><div class="v">' + escapeHtml(formatMoney(metrics.totalAmount)) + '</div></div>' +
        '<div class="customer-stat"><div class="k">' + escapeHtml(t("remaining", "Remaining")) + '</div><div class="v">' + escapeHtml(formatMoney(metrics.remainingAmount)) + '</div></div>' +
      '</div>' +
      '<div class="customer-preview-grid">' +
        '<div class="customer-card">' +
          '<h4>' + escapeHtml(t("contact_info", "Contact Information")) + '</h4>' +
          '<div class="customer-row"><span class="l">' + escapeHtml(t("email", "Email")) + '</span><span class="r">' + escapeHtml(customer.email || "-") + '</span></div>' +
          '<div class="customer-row"><span class="l">' + escapeHtml(t("phone", "Phone")) + '</span><span class="r">' + escapeHtml(customer.phone || "-") + '</span></div>' +
          '<div class="customer-row"><span class="l">' + escapeHtml(t("city", "City")) + '</span><span class="r">' + escapeHtml(customer.city || "-") + '</span></div>' +
          '<div class="customer-row"><span class="l">ID</span><span class="r">#' + escapeHtml(String(customer.id || "-")) + '</span></div>' +
        '</div>' +
        '<div class="customer-card">' +
          '<h4>' + escapeHtml(t("legal_data", "Business / Legal Data")) + '</h4>' +
          legalRows +
        '</div>' +
      '</div>';

    modal.classList.add("active");
  }

  function computeCustomerMetrics(customer) {
    var customerId = String(customer.id);
    var nameLower = String(customer.name || "").trim().toLowerCase();

    var customerInvoices = (invoicesData || []).filter(function (inv) {
      var cid = String((inv.customer && inv.customer.id) || inv.customerId || "");
      if (cid && cid === customerId) return true;
      var invName = String((inv.customer && inv.customer.name) || "").trim().toLowerCase();
      return !cid && !!nameLower && invName === nameLower;
    });

    var customerProformas = (proformasData || []).filter(function (doc) {
      var cid = String((doc.customer && doc.customer.id) || doc.customerId || "");
      if (cid && cid === customerId) return true;
      var docName = String((doc.customer && doc.customer.name) || "").trim().toLowerCase();
      return !cid && !!nameLower && docName === nameLower;
    });

    var totalAmount = customerInvoices.reduce(function (sum, inv) {
      return sum + Math.max(0, Number(inv.total || 0));
    }, 0);
    var paidAmount = customerInvoices.reduce(function (sum, inv) {
      return sum + Math.max(0, Number(inv.paid || 0));
    }, 0);

    return {
      invoiceCount: customerInvoices.length,
      proformaCount: customerProformas.length,
      totalAmount: totalAmount,
      remainingAmount: Math.max(0, totalAmount - paidAmount)
    };
  }

  function getCustomerById(id) {
    if (id === null || id === undefined || id === "") return null;
    return (customersData || []).find(function (c) { return String(c.id) === String(id); }) || null;
  }

  function getCustomerIdFromDoc(doc) {
    var cid = doc && ((doc.customer && doc.customer.id) || doc.customerId);
    if (cid !== null && cid !== undefined && cid !== "") return String(cid);

    var name = String((doc && doc.customer && doc.customer.name) || "").trim().toLowerCase();
    if (!name) return "";

    var match = (customersData || []).find(function (c) {
      return String(c.name || "").trim().toLowerCase() === name;
    });
    return match ? String(match.id) : "";
  }

  function getCustomerIdsMatchingGlobalSalesFilters() {
    var g = getGlobalFilters();
    var usesAdvanced = !!(g.from || g.to || g.productId);
    if (!usesAdvanced) return null;

    var ids = new Set();
    (invoicesData || []).forEach(function (inv) {
      if (!isDateInRange(inv.date, g.from, g.to)) return;
      if (g.productId) {
        var items = Array.isArray(inv.items) ? inv.items : [];
        var hasProd = items.some(function (it) { return String((it && it.productId) || "") === String(g.productId); });
        if (!hasProd) return;
      }
      var cid = getCustomerIdFromDoc(inv);
      if (cid) ids.add(cid);
    });
    return ids;
  }

  function viewCustomer(customerId) {
    var customer = (customersData || []).find(function (x) { return String(x.id) === String(customerId); });
    if (!customer) {
      alert(t("customer_not_found", "Customer not found!"));
      return;
    }

    var metrics = computeCustomerMetrics(customer);
    openCustomerPreviewModal(customer, metrics);
  }

  function deleteCustomer(customerId) {
    var idx = (customersData || []).findIndex(function (x) { return String(x.id) === String(customerId); });
    if (idx === -1) {
      alert(t("customer_not_found", "Customer not found!"));
      return;
    }

    if (confirm(t("delete_customer_confirm", "⚠️ Delete this customer?"))) {
      customersData.splice(idx, 1);
      ZS.setItem("customers-data", JSON.stringify(customersData));
      loadCustomersTable();
      updateStats();
      alert(t("customer_deleted", "✅ Customer deleted!"));
    }
  }

  function loadCustomersTable() {
    var tb = document.getElementById("customersTableBody");
    if (!tb) return;
    tb.innerHTML = "";

    var g = getGlobalFilters();
    var typeFilter = String((document.getElementById("customerTypeFilter") || {}).value || "").trim();
    var list = customersData || [];

    if (g.customerId) {
      list = list.filter(function (c) { return String(c.id) === String(g.customerId); });
    }

    if (typeFilter) {
      list = list.filter(function (cu) {
        var typeValue = cu.customerType || (cu.isCompany ? "legal" : "natural");
        return typeValue === typeFilter;
      });
    }

    if (list.length === 0) {
      var trNo = document.createElement("tr");
      var tdNo = document.createElement("td");
      tdNo.colSpan = 6;
      tdNo.style.textAlign = "center";
      tdNo.style.padding = "30px";
      tdNo.style.color = "#6b7280";
      tdNo.textContent = t("no_customers", "No customers.");
      trNo.appendChild(tdNo);
      tb.appendChild(trNo);
      return;
    }

    var rowsFragment = document.createDocumentFragment();
    list.forEach(function (cu) {
      var row = document.createElement("tr");

      var tdName = document.createElement("td");
      var strong = document.createElement("strong");
      strong.textContent = cu.name;
      tdName.appendChild(strong);

      var tdType = document.createElement("td");
      var typeValue = cu.customerType || (cu.isCompany ? "legal" : "natural");
      tdType.textContent = typeValue === "legal" ? t("legal_entity", "Legal Entity") : t("natural_person", "Natural Person");

      var tdEmail = document.createElement("td");
      tdEmail.textContent = cu.email || "";

      var tdPhone = document.createElement("td");
      tdPhone.textContent = cu.phone || "";

      var tdCity = document.createElement("td");
      tdCity.textContent = cu.city || "-";

      var tdActions = document.createElement("td");
      var actionsDiv = document.createElement("div");
      actionsDiv.className = "action-buttons";

      var btnView = document.createElement("button");
      btnView.className = "btn btn-primary";
      btnView.style.padding = "8px 12px";
      btnView.style.fontSize = "12px";
      btnView.innerHTML = '<i class="fas fa-eye"></i>';
      btnView.addEventListener("click", function () { viewCustomer(cu.id); });

      var btnEdit = document.createElement("button");
      btnEdit.className = "btn btn-info";
      btnEdit.style.padding = "8px 12px";
      btnEdit.style.fontSize = "12px";
      btnEdit.innerHTML = '<i class="fas fa-edit"></i>';
      btnEdit.addEventListener("click", function () { editCustomer(cu.id); });

      var btnDelete = document.createElement("button");
      btnDelete.className = "btn btn-danger";
      btnDelete.style.padding = "8px 12px";
      btnDelete.style.fontSize = "12px";
      btnDelete.innerHTML = '<i class="fas fa-trash"></i>';
      btnDelete.addEventListener("click", function () { deleteCustomer(cu.id); });

      actionsDiv.appendChild(btnView);
      actionsDiv.appendChild(btnEdit);
      actionsDiv.appendChild(btnDelete);
      tdActions.appendChild(actionsDiv);

      row.appendChild(tdName);
      row.appendChild(tdType);
      row.appendChild(tdEmail);
      row.appendChild(tdPhone);
      row.appendChild(tdCity);
      row.appendChild(tdActions);
      rowsFragment.appendChild(row);
    });
    tb.appendChild(rowsFragment);
  }

  window.getCustomerById = getCustomerById;
  window.getCustomerIdFromDoc = getCustomerIdFromDoc;
  window.getCustomerIdsMatchingGlobalSalesFilters = getCustomerIdsMatchingGlobalSalesFilters;
  window.viewCustomer = viewCustomer;
  window.deleteCustomer = deleteCustomer;
  window.loadCustomersTable = loadCustomersTable;

  window.SalesCustomersModule = {
    loadCustomersTable: loadCustomersTable
  };
})();

;
/* ========================================================= */
/* FILE: modules/sales/sales_ui_drafts_module.js */
/* ========================================================= */
(function () {
  function t(key, fallback) {
    try {
      return typeof window.tr === 'function' ? window.tr(key, fallback) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function getActiveModal() {
    return document.querySelector('.modal.active');
  }

  function getCustomerFormState() {
    return {
      name: (document.getElementById('newCustomerName')?.value || '').trim(),
      email: (document.getElementById('newCustomerEmail')?.value || '').trim(),
      phone: (document.getElementById('newCustomerPhone')?.value || '').trim(),
      city: (document.getElementById('newCustomerCity')?.value || '').trim(),
      type: (document.getElementById('newCustomerType')?.value || 'natural').trim(),
      rc: (document.getElementById('newCustomerRC')?.value || '').trim(),
      nif: (document.getElementById('newCustomerNIF')?.value || '').trim(),
      nis: (document.getElementById('newCustomerNIS')?.value || '').trim(),
      ai: (document.getElementById('newCustomerAI')?.value || '').trim(),
      art: (document.getElementById('newCustomerART')?.value || '').trim()
    };
  }

  function hasUnsavedCustomerChanges() {
    if (!customerFormInitialState) return false;
    try {
      return JSON.stringify(getCustomerFormState()) !== JSON.stringify(customerFormInitialState);
    } catch (err) {
      return false;
    }
  }

  function getInvoiceFormState() {
    return {
      date: document.getElementById('invoiceDate')?.value || '',
      customer: document.getElementById('invoiceCustomer')?.value || '',
      paymentMethod: document.getElementById('invoicePaymentMethod')?.value || '',
      stampRate: document.getElementById('invoiceStampRate')?.value || '1',
      includeTax: !!document.getElementById('invoiceIncludeTax')?.checked,
      taxRate: document.getElementById('invoiceTaxRate')?.value || '',
      items: (invoiceItemsArray || []).map(i => ({
        productId: i.productId || 0,
        description: i.description || '',
        quantity: Number(i.quantity || 0),
        price: Number(i.price || 0),
        total: Number(i.total || 0),
        unit: i.unit || 'unit'
      }))
    };
  }

  function hasUnsavedInvoiceChanges() {
    if (!invoiceFormInitialState) return false;
    try {
      return JSON.stringify(getInvoiceFormState()) !== JSON.stringify(invoiceFormInitialState);
    } catch (err) {
      return false;
    }
  }

  function getProformaFormState() {
    return {
      date: document.getElementById('proformaDate')?.value || '',
      customer: document.getElementById('proformaCustomer')?.value || '',
      includeTax: !!document.getElementById('proformaIncludeTax')?.checked,
      taxRate: document.getElementById('proformaTaxRate')?.value || '',
      notes: document.getElementById('proformaNotes')?.value || '',
      items: (proformaItemsArray || []).map(i => ({
        productId: i.productId || 0,
        description: i.description || '',
        quantity: Number(i.quantity || 0),
        price: Number(i.price || 0),
        total: Number(i.total || 0),
        unit: i.unit || 'unit'
      }))
    };
  }

  function hasUnsavedProformaChanges() {
    if (!proformaFormInitialState) return false;
    try {
      return JSON.stringify(getProformaFormState()) !== JSON.stringify(proformaFormInitialState);
    } catch (err) {
      return false;
    }
  }

  // حفظ حالة الفلاتر عند فتح نافذة المعاينة - تم حذف الفلاتر
  var savedFilterState = null;

  function saveFilterState() {
    // Filter elements have been removed
    savedFilterState = null;
  }

  function restoreFilterState() {
    // Filter elements have been removed
    savedFilterState = null;
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    const current = getActiveModal();
    if (current && current !== modal) {
      modal.dataset.prevModalId = current.id;
      if (document.activeElement && current.contains(document.activeElement)) {
        try { document.activeElement.blur(); } catch(e){}
      }
      current.classList.remove('active');
      if ('inert' in HTMLElement.prototype) current.inert = true;
      current.setAttribute('inert', '');
      current.removeAttribute('aria-hidden');
    }

    modal._previouslyFocusedElement = document.activeElement;
    if ('inert' in HTMLElement.prototype) modal.inert = false;
    modal.removeAttribute('inert');
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');

    // حفظ حالة الفلاتر عند فتح نافذة المعاينة
    if (id === 'viewInvoiceModal' || id === 'viewProformaModal') {
      saveFilterState();
    }

    const main = document.querySelector('.main-content');
    if (main) {
      if ('inert' in HTMLElement.prototype) main.inert = true;
      else main.setAttribute('aria-hidden', 'true');
    }

    const first = modal.querySelector("input, select, textarea, button, [tabindex]:not([tabindex='-1'])");
    if (first) setTimeout(() => first.focus(), 10);
    else {
      if (!modal.hasAttribute('tabindex')) modal.setAttribute('tabindex', '-1');
      setTimeout(() => modal.focus(), 10);
    }

    document.body.style.overflow = 'hidden';
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;

    if (id === 'addCustomerModal' && !customerModalForceClose && hasUnsavedCustomerChanges()) {
      if (!confirm(t('unsaved_customer_changes_confirm', '⚠️ You have unsaved customer changes. Close without saving?'))) return;
    }
    if (id === 'createInvoiceModal' && !invoiceModalForceClose && hasUnsavedInvoiceChanges()) {
      if (!confirm(t('unsaved_invoice_changes_confirm', '⚠️ You have unsaved invoice changes. Close without saving?'))) return;
    }
    if (id === 'createProformaModal' && !proformaModalForceClose && hasUnsavedProformaChanges()) {
      if (!confirm(t('unsaved_proforma_changes_confirm', '⚠️ You have unsaved proforma changes. Close without saving?'))) return;
    }

    const prevId = modal.dataset.prevModalId;

    // Move focus out of the modal BEFORE hiding it to avoid aria-hidden focus warning
    try {
      if (document.activeElement && modal.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      const prev = modal._previouslyFocusedElement;
      if (prev && document.contains(prev) && typeof prev.focus === 'function') {
        prev.focus();
      } else if (document.body) {
        if (!document.body.hasAttribute('tabindex')) {
          document.body.setAttribute('tabindex', '-1');
        }
        document.body.focus();
      }
    } catch (err) {}

    modal.classList.remove('active');
    if ('inert' in HTMLElement.prototype) modal.inert = true;
    modal.setAttribute('inert', '');
    modal.removeAttribute('aria-hidden');

    if (prevId) {
      delete modal.dataset.prevModalId;
      const prevModal = document.getElementById(prevId);
      if (prevModal) {
        if ('inert' in HTMLElement.prototype) prevModal.inert = false;
        prevModal.removeAttribute('inert');
        prevModal.classList.add('active');
        prevModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        return;
      }
    }

    const main = document.querySelector('.main-content');
    if (main) {
      if ('inert' in HTMLElement.prototype) main.inert = false;
      else main.removeAttribute('aria-hidden');
    }
    document.body.style.overflow = '';

    if (id === 'createInvoiceModal') {
      isEditingInvoice = false;
      editingInvoiceId = null;
      invoiceFormInitialState = null;
      invoiceModalForceClose = false;
      var invBisCheck = document.getElementById("invoiceBisCheckbox");
      if (invBisCheck) invBisCheck.checked = false;
      var invSuffixSelect = document.getElementById("invoiceNumberSuffix");
      if (invSuffixSelect) { invSuffixSelect.value = "Bis"; invSuffixSelect.style.display = "none"; }
      var invBisBadge = document.getElementById("invoiceBisBadge");
      if (invBisBadge) invBisBadge.style.display = "none";
      const t = translations[ZS.getItem('preferred-language') || 'en'] || {};
      const saveBtnText = document.getElementById('saveInvoiceBtnText');
      if (saveBtnText) saveBtnText.textContent = t.save_invoice || 'Save Invoice';
      // إعادة تحميل البيانات من localStorage ثم تحديث الجدول
      try {
        var storedInv = ZS.getItem('invoices-data');
        if (storedInv) {
          var parsedInv = JSON.parse(storedInv);
          if (Array.isArray(parsedInv) && parsedInv.length > 0) {
            window.invoicesData = parsedInv;
          }
        }
      } catch(e) {}
      setTimeout(function() {
        try { if (typeof loadInvoicesTable === 'function') loadInvoicesTable(); } catch(e) {}
        try { if (typeof updateStats === 'function') updateStats(); } catch(e) {}
      }, 150);
    }

    if (id === 'viewInvoiceModal') {
      // معاينة الفاتورة لا تغير البيانات - لا حاجة لإعادة تحميل الجدول
      // استعادة حالة الفلاتر لتجنب أي تغيير عرضي
      restoreFilterState();
    }

    if (id === 'createProformaModal') {
      isEditingProforma = false;
      editingProformaId = null;
      proformaFormInitialState = null;
      proformaModalForceClose = false;
      var profBisCheck = document.getElementById("proformaBisCheckbox");
      if (profBisCheck) profBisCheck.checked = false;
      var profSuffixSelect = document.getElementById("proformaNumberSuffix");
      if (profSuffixSelect) { profSuffixSelect.value = "Bis"; profSuffixSelect.style.display = "none"; }
      var profBisBadge = document.getElementById("proformaBisBadge");
      if (profBisBadge) profBisBadge.style.display = "none";
      const saveProformaBtnText = document.getElementById('saveProformaBtnText');
      if (saveProformaBtnText) {
        saveProformaBtnText.textContent = t('save_proforma', 'Save Proforma');
      }
      // إعادة تحميل جدول الفواتير الأولية بعد إغلاق Modal
      if (typeof loadProformasTable === 'function') {
        setTimeout(function() { loadProformasTable(); }, 100);
      }
    }

    if (id === 'viewProformaModal') {
      // معاينة الفاتورة الشكلية لا تغير البيانات - لا حاجة لإعادة تحميل الجدول
      restoreFilterState();
    }

    if (id === 'addCustomerModal') {
      resetCustomerModalState();
      const form = document.getElementById('addCustomerForm');
      if (form) form.reset();
      const typeSel = document.getElementById('newCustomerType');
      if (typeSel) typeSel.value = 'natural';
      toggleCustomerBusinessFields();
    }
  }

  function resetCustomerModalState() {
    isEditingCustomer = false;
    editingCustomerId = null;
    customerFormInitialState = null;
    customerModalForceClose = false;
    const titleEl = document.getElementById('addCustomerModalTitle');
    const submitEl = document.getElementById('addCustomerSubmitText');
    if (titleEl) titleEl.textContent = t('add_customer', 'Add Customer');
    if (submitEl) submitEl.textContent = t('add_customer', 'Add Customer');
  }

  function toggleCustomerBusinessFields() {
    const wrap = document.getElementById('customerBusinessFields');
    const typeSel = document.getElementById('newCustomerType');
    if (!wrap || !typeSel) return;
    wrap.style.display = typeSel.value === 'legal' ? '' : 'none';
  }

  function openAddCustomerModal() {
    resetCustomerModalState();
    const form = document.getElementById('addCustomerForm');
    if (form) form.reset();
    const typeSel = document.getElementById('newCustomerType');
    if (typeSel) typeSel.value = 'natural';
    toggleCustomerBusinessFields();
    customerFormInitialState = getCustomerFormState();
    openModal('addCustomerModal');
  }

  function openAddCustomerFor(selectId) {
    window._customerTargetSelect = selectId;
    openAddCustomerModal();
  }

  function editCustomer(customerId) {
    const customer = (customersData || []).find(c => String(c.id) === String(customerId));
    if (!customer) {
      alert(t('customer_not_found', 'Customer not found!'));
      return;
    }

    isEditingCustomer = true;
    editingCustomerId = customer.id;

    const titleEl = document.getElementById('addCustomerModalTitle');
    const submitEl = document.getElementById('addCustomerSubmitText');
    if (titleEl) titleEl.textContent = t('edit_customer', 'Edit Customer');
    if (submitEl) submitEl.textContent = t('update_customer', 'Update Customer');

    const form = document.getElementById('addCustomerForm');
    if (form) form.reset();

    document.getElementById('newCustomerName').value = customer.name || '';
    document.getElementById('newCustomerEmail').value = customer.email || '';
    document.getElementById('newCustomerPhone').value = customer.phone || '';
    document.getElementById('newCustomerCity').value = customer.city || '';

    const typeSel = document.getElementById('newCustomerType');
    if (typeSel) typeSel.value = customer.customerType || (customer.isCompany ? 'legal' : 'natural');

    document.getElementById('newCustomerRC').value = customer.rc || '';
    document.getElementById('newCustomerNIF').value = customer.nif || '';
    document.getElementById('newCustomerNIS').value = customer.nis || '';
    document.getElementById('newCustomerAI').value = customer.ai || '';
    document.getElementById('newCustomerART').value = customer.art || '';

    toggleCustomerBusinessFields();
    customerFormInitialState = getCustomerFormState();
    openModal('addCustomerModal');
  }

  function getCurrentUserKey() {
    try {
      const raw = ZS.getItem('zeralda-settings');
      if (raw) {
        const settings = JSON.parse(raw);
        const users = settings && Array.isArray(settings.users) ? settings.users : [];
        const activeId = settings && settings.activeUserId ? settings.activeUserId : null;
        const activeUser = users.find(u => u.id === activeId) || null;
        if (activeUser && activeUser.id) return String(activeUser.id);
      }
    } catch (err) {}

    const userNameEl = document.querySelector('.user-info div div');
    const name = (userNameEl && userNameEl.textContent) ? userNameEl.textContent : 'default';
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function getDraftStorageKey(type) {
    const userKey = getCurrentUserKey() || 'default';
    return type + '-draft-' + userKey;
  }

  function getDraftStatusText(mode, meta) {
    if (mode === 'saved_at') return t('draft_saved_at', 'Draft saved at') + ' ' + (meta || '');
    if (mode === 'loaded') return t('draft_loaded', 'Draft loaded');
    if (mode === 'cleared') return t('draft_cleared', 'Draft cleared');
    if (mode === 'available') return t('draft_available', 'Draft available');
    return t('no_saved_draft', 'No saved draft');
  }

  function syncDraftUI(type, statusMode, statusMeta) {
    const statusId = type === 'invoice' ? 'invoiceDraftStatus' : 'proformaDraftStatus';
    const loadBtnId = type === 'invoice' ? 'invoiceLoadDraftBtn' : 'proformaLoadDraftBtn';
    const clearBtnId = type === 'invoice' ? 'invoiceClearDraftBtn' : 'proformaClearDraftBtn';
    const hasDraft = !!ZS.getItem(getDraftStorageKey(type));

    const loadBtn = document.getElementById(loadBtnId);
    const clearBtn = document.getElementById(clearBtnId);
    const status = document.getElementById(statusId);

    if (loadBtn) loadBtn.disabled = !hasDraft;
    if (clearBtn) clearBtn.disabled = !hasDraft;

    if (status) {
      const mode = statusMode || (hasDraft ? 'available' : 'none');
      status.dataset.mode = mode;
      if (statusMeta !== undefined) status.dataset.meta = String(statusMeta);
      else if (mode !== 'saved_at') delete status.dataset.meta;
      const meta = status.dataset.meta || '';
      status.textContent = getDraftStatusText(mode, meta);
    }
  }

  function refreshDraftStatusLanguage() {
    ['invoice', 'proforma'].forEach(type => {
      const statusId = type === 'invoice' ? 'invoiceDraftStatus' : 'proformaDraftStatus';
      const statusEl = document.getElementById(statusId);
      const mode = statusEl ? (statusEl.dataset.mode || '') : '';
      const meta = statusEl ? (statusEl.dataset.meta || '') : '';
      syncDraftUI(type, mode || undefined, meta || undefined);
    });
  }

  window.getActiveModal = getActiveModal;
  window.getCustomerFormState = getCustomerFormState;
  window.hasUnsavedCustomerChanges = hasUnsavedCustomerChanges;
  window.getInvoiceFormState = getInvoiceFormState;
  window.hasUnsavedInvoiceChanges = hasUnsavedInvoiceChanges;
  window.getProformaFormState = getProformaFormState;
  window.hasUnsavedProformaChanges = hasUnsavedProformaChanges;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.resetCustomerModalState = resetCustomerModalState;
  window.toggleCustomerBusinessFields = toggleCustomerBusinessFields;
  window.openAddCustomerModal = openAddCustomerModal;
  window.openAddCustomerFor = openAddCustomerFor;
  window.editCustomer = editCustomer;
  window.getCurrentUserKey = getCurrentUserKey;
  window.getDraftStorageKey = getDraftStorageKey;
  window.getDraftStatusText = getDraftStatusText;
  window.syncDraftUI = syncDraftUI;
  window.refreshDraftStatusLanguage = refreshDraftStatusLanguage;

  window.SalesUiDraftsModule = {
    openModal: openModal,
    closeModal: closeModal,
    syncDraftUI: syncDraftUI
  };
})();

;
/* ========================================================= */
/* FILE: modules/sales/advanced_features.js */
/* ========================================================= */
/**
 * 🚀 Advanced Features Module - Zeralda ERP Sales
 * تطور: تصدير متقدم - مشاركة فواتير - تخطيط متقدم
 * Version: 1.0 | Date: 2026-02-24
 */

// ============================================
// 📊 ADVANCED EXPORT FEATURES
// ============================================

// ── Loading overlay & notification helpers ──────────────────────────────
function showLoadingOverlay(msg) {
  var existing = document.getElementById('_advLoadingOverlay');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = '_advLoadingOverlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = '<div style="background:#fff;padding:24px 32px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:Arial,sans-serif;font-size:16px;color:#333;display:flex;align-items:center;gap:12px;">' +
    '<div style="width:24px;height:24px;border:3px solid #e0e0e0;border-top-color:#25D366;border-radius:50%;animation:_advSpin 0.8s linear infinite;"></div>' +
    '<span>' + (msg || 'Loading...') + '</span></div>';
  document.body.appendChild(overlay);
  if (!document.getElementById('_advSpinStyle')) {
    var style = document.createElement('style');
    style.id = '_advSpinStyle';
    style.textContent = '@keyframes _advSpin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  }
}

function hideLoadingOverlay() {
  var overlay = document.getElementById('_advLoadingOverlay');
  if (overlay) overlay.remove();
}

function showNotification(msg, type, duration) {
  var existing = document.getElementById('_advNotification');
  if (existing) existing.remove();
  var notif = document.createElement('div');
  notif.id = '_advNotification';
  var bgColor = type === 'success' ? '#25D366' : (type === 'error' ? '#ea4335' : '#17a2b8');
  notif.style.cssText = 'position:fixed;top:20px;right:20px;background:' + bgColor + ';color:#fff;padding:16px 24px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:99999;font-family:Arial,sans-serif;font-size:14px;max-width:400px;';
  notif.textContent = msg;
  document.body.appendChild(notif);
  setTimeout(function() { if (notif.parentNode) notif.parentNode.removeChild(notif); }, duration || 5000);
}

window.showLoadingOverlay = showLoadingOverlay;
window.hideLoadingOverlay = hideLoadingOverlay;
window.showNotification = showNotification;


function downloadExportFile(filename, content, mimeType) {
  try {
    const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    return true;
  } catch (err) {
    console.error('downloadExportFile error:', err);
    return false;
  }
}

/**
 * Export invoices to CSV format
 * Supports: Invoice #, Customer, Date, Items, Amount, Status
 */
function exportToCSV(type = 'invoices') {
  try {
    const data = type === 'invoices' ? invoicesData : (type === 'proformas' ? proformasData : customersData);
    if (!data || data.length === 0) {
      alert('No data to export');
      return;
    }

    let csv = '';
    const headers = type === 'invoices'
      ? ['Invoice #', 'Customer', 'Date', 'Amount', 'Status', 'Payment Method', 'Paid', 'Remaining']
      : type === 'proformas'
      ? ['Proforma #', 'Customer', 'Date', 'Amount', 'Status', 'Items Count']
      : ['Name', 'Email', 'Phone', 'City', 'Type'];

    // Add headers
    csv += headers.map(h => `"${h}"`).join(',') + '\n';

    // Add data rows
    data.forEach(row => {
      if (type === 'invoices') {
        const customer = getCustomerById(row.customerId) || { name: 'Unknown' };
        const remaining = Math.max(0, (row.total || 0) - (row.paid || 0));
        csv += [
          `"${getInvoiceDisplayNumber(row)}"`,
          `"${customer.name}"`,
          `"${row.date}"`,
          `"${(row.total || 0).toFixed(2)}"`,
          `"${getInvoiceComputedStatus(row)}"`,
          `"${row.paymentMethod || '-'}"`,
          `"${(row.paid || 0).toFixed(2)}"`,
          `"${remaining.toFixed(2)}"`
        ].join(',') + '\n';
      } else if (type === 'proformas') {
        const customer = getCustomerById(row.customerId) || { name: 'Unknown' };
        const itemsCount = Array.isArray(row.items) ? row.items.length : 0;
        csv += [
          `"${getProformaDisplayNumber(row)}"`,
          `"${customer.name}"`,
          `"${row.date}"`,
          `"${(row.total || 0).toFixed(2)}"`,
          `"${row.status || 'Draft'}"`,
          `"${itemsCount}"`
        ].join(',') + '\n';
      } else {
        const customerType = row.customerType || (row.isCompany ? 'legal' : 'natural');
        csv += [
          `"${row.name}"`,
          `"${row.email || ''}"`,
          `"${row.phone || ''}"`,
          `"${row.city || ''}"`,
          `"${customerType}"`
        ].join(',') + '\n';
      }
    });

    const filename = `${type}_export_${new Date().toISOString().split('T')[0]}.csv`;
    downloadExportFile(filename, csv, 'text/csv;charset=utf-8;');
  } catch (error) {
    console.error('CSV export error:', error);
    alert('Failed to export CSV');
  }
}

/**
 * Export invoices to JSON format
 * Complete data with all fields for backup/integration purposes
 */
function exportToJSON(type = 'invoices') {
  try {
    const data = type === 'invoices' ? invoicesData : (type === 'proformas' ? proformasData : customersData);
    if (!data || data.length === 0) {
      alert('No data to export');
      return;
    }

    const exportData = {
      exportType: type,
      exportDate: new Date().toISOString(),
      recordCount: data.length,
      data: data,
      currency: getCurrencySymbol(),
      company: getActiveCompanyFromSettings()
    };

    const filename = `${type}_backup_${new Date().toISOString().split('T')[0]}.json`;
    downloadExportFile(filename, JSON.stringify(exportData, null, 2), 'application/json;charset=utf-8;');
  } catch (error) {
    console.error('JSON export error:', error);
    alert('Failed to export JSON');
  }
}

/**
 * Export invoices to XML format
 * For enterprise integration (SAP, Oracle, etc.)
 */
function exportToXML(type = 'invoices') {
  try {
    const data = type === 'invoices' ? invoicesData : (type === 'proformas' ? proformasData : customersData);
    if (!data || data.length === 0) {
      alert('No data to export');
      return;
    }

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<${type} exportDate="${new Date().toISOString()}" currency="${getCurrencySymbol()}">\n`;

    data.forEach((row, idx) => {
      if (type === 'invoices') {
        xml += `  <invoice id="${row.id}">\n`;
        xml += `    <number>${escapeXML(getInvoiceDisplayNumber(row))}</number>\n`;
        xml += `    <customer>${escapeXML(getCustomerById(row.customerId)?.name || 'Unknown')}</customer>\n`;
        xml += `    <date>${escapeXML(row.date)}</date>\n`;
        xml += `    <amount>${row.total || 0}</amount>\n`;
        xml += `    <paid>${row.paid || 0}</paid>\n`;
        xml += `    <status>${escapeXML(getInvoiceComputedStatus(row))}</status>\n`;
        xml += `    <paymentMethod>${escapeXML(row.paymentMethod || '')}</paymentMethod>\n`;
        if (Array.isArray(row.items)) {
          xml += `    <items>\n`;
          row.items.forEach(item => {
            xml += `      <item>\n`;
            xml += `        <description>${escapeXML(item.description || '')}</description>\n`;
            xml += `        <quantity>${item.quantity || 0}</quantity>\n`;
            xml += `        <price>${item.price || 0}</price>\n`;
            xml += `        <total>${item.total || 0}</total>\n`;
            xml += `      </item>\n`;
          });
          xml += `    </items>\n`;
        }
        xml += `  </invoice>\n`;
      } else if (type === 'proformas') {
        xml += `  <proforma id="${row.id}">\n`;
        xml += `    <number>${escapeXML(getProformaDisplayNumber(row))}</number>\n`;
        xml += `    <customer>${escapeXML(getCustomerById(row.customerId)?.name || 'Unknown')}</customer>\n`;
        xml += `    <date>${escapeXML(row.date)}</date>\n`;
        xml += `    <amount>${row.total || 0}</amount>\n`;
        xml += `    <status>${escapeXML(row.status || 'Draft')}</status>\n`;
        xml += `  </proforma>\n`;
      } else {
        xml += `  <customer id="${row.id}">\n`;
        xml += `    <name>${escapeXML(row.name)}</name>\n`;
        xml += `    <email>${escapeXML(row.email || '')}</email>\n`;
        xml += `    <phone>${escapeXML(row.phone || '')}</phone>\n`;
        xml += `    <city>${escapeXML(row.city || '')}</city>\n`;
        xml += `  </customer>\n`;
      }
    });

    xml += `</${type}>`;

    const filename = `${type}_export_${new Date().toISOString().split('T')[0]}.xml`;
    downloadExportFile(filename, xml, 'application/xml;charset=utf-8;');
  } catch (error) {
    console.error('XML export error:', error);
    alert('Failed to export XML');
  }
}

function escapeXML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ============================================
// 📤 SHARING FEATURES
// ============================================

/**
 * Share invoice via Email with shareable link
 */
function shareInvoiceViaEmail(invoiceId) {
  const invoice = invoicesData.find(i => i.id == invoiceId);
  if (!invoice) return alert('Invoice not found');

  const customer = getCustomerById(invoice.customerId) || {};
  if (!customer.email) {
    return alert('Customer has no email address');
  }

  // Generate shareable link
  const shareLink = generateShareableLink(invoiceId, 'invoice');

  // Prepare email content
  const subject = `Invoice ${getInvoiceDisplayNumber(invoice)} - ${new Date().toLocaleDateString()}`;
  const body = `
Dear ${customer.name},

Your invoice ${getInvoiceDisplayNumber(invoice)} is ready.

Amount: ${getCurrencySymbol()}${(invoice.total || 0).toFixed(2)}
Date: ${invoice.date}
Status: ${getInvoiceStatusLabel(invoice)}

View Invoice: ${shareLink}

Thank you for your business!

Best regards,
${getActiveCompanyFromSettings()?.name || 'Company'}
  `.trim();

  // Open mail client
  const mailtoLink = `mailto:${encodeURIComponent(customer.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoLink;

  // Log share event
  logShareEvent(invoiceId, 'email', customer.email);
}

async function shareInvoiceViaWhatsApp(invoiceId) {
  const invoice = invoicesData.find(i => i.id == invoiceId);
  if (!invoice) return alert('Invoice not found');

  const customer = getCustomerById(invoice.customerId) || invoice.customer || {};
  const phone = customer.phone || '';
  const invoiceNumber = typeof getInvoiceDisplayNumber === 'function' ? getInvoiceDisplayNumber(invoice) : (invoice.invoiceNumber || invoice.id);
  const companyName = (typeof getActiveCompanyFromSettings === 'function' && getActiveCompanyFromSettings()) ? (getActiveCompanyFromSettings().name || '') : '';

  // Build a short text message to accompany the PDF
  const shortText = (companyName ? companyName + '\n' : '') +
    'Facture N° ' + invoiceNumber + ' - ' + (customer.name || '') +
    ' - Total: ' + (invoice.total || 0);

  let cleanPhone = '';
  if (phone) {
    cleanPhone = String(phone).replace(/[^0-9+]/g, '');
    if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.slice(1);
    if (cleanPhone.startsWith('00')) cleanPhone = cleanPhone.slice(2);
    if (cleanPhone.length === 9 && !cleanPhone.startsWith('0')) cleanPhone = '213' + cleanPhone;
    if (cleanPhone.startsWith('0')) cleanPhone = '213' + cleanPhone.slice(1);
  }

  // Try to generate PDF and share it via Web Share API (mobile) or download + open WhatsApp (desktop)
  try {
    // Show loading indicator
    if (typeof showLoadingOverlay === 'function') {
      showLoadingOverlay('جاري إنشاء PDF للفاتورة...');
    }

    // Generate PDF blob
    const blob = typeof generateInvoicePdfBlob === 'function' ? await generateInvoicePdfBlob(invoiceId) : null;

    if (typeof hideLoadingOverlay === 'function') {
      hideLoadingOverlay();
    }

    if (blob) {
      const fileName = String(invoiceNumber || 'invoice').replace(/[^a-zA-Z0-9_-]+/g, '_') + '.pdf';
      if (window.ZeraldaShareHub && typeof window.ZeraldaShareHub.shareDocument === 'function') {
        await window.ZeraldaShareHub.shareDocument({
          title: 'Facture ' + invoiceNumber,
          text: shortText,
          phone: cleanPhone || phone,
          blob: blob,
          filename: fileName
        });
        logShareEvent(invoiceId, 'whatsapp', phone || 'no-number');
        return;
      }

      const file = new File([blob], fileName, { type: 'application/pdf' });

      // Check if Web Share API supports file sharing (mobile devices)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        // Mobile: share PDF directly via WhatsApp
        await navigator.share({
          files: [file],
          text: shortText,
          title: 'Facture ' + invoiceNumber
        });
        logShareEvent(invoiceId, 'whatsapp', phone || 'no-number');
        return;
      }

      // Desktop: download the PDF, then open WhatsApp with text message
      // (WhatsApp Web doesn't support file uploads via URL API)
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);

      // Open WhatsApp with a message telling user to attach the PDF
      const waMsg = shortText + '\n\n(PDF تم تحميله — يرجى إرفاقه في الواتساب)';
      const waUrl = cleanPhone
        ? 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(waMsg)
        : 'https://wa.me/?text=' + encodeURIComponent(waMsg);
      window.open(waUrl, '_blank');

      // Show notification explaining what to do
      if (typeof showNotification === 'function') {
        showNotification('تم تحميل PDF الفاتورة وفتح WhatsApp. يرجى إرفاق ملف PDF المُحمّل.', 'info', 8000);
      } else {
        setTimeout(function() {
          alert('تم تحميل ملف PDF للفاتورة.\nالآن في نافذة WhatsApp: اضغط على أيقونة المرفقات (📎) وأرفق ملف PDF.');
        }, 500);
      }
      logShareEvent(invoiceId, 'whatsapp', phone || 'no-number');
      return;
    }
  } catch (err) {
    if (typeof hideLoadingOverlay === 'function') {
      hideLoadingOverlay();
    }
    console.warn('PDF share failed, falling back to text:', err);
  }

  // PDF generation failed — show error instead of sending text-only
  if (typeof showNotification === 'function') {
    showNotification('فشل إنشاء ملف PDF للفاتورة. لا يمكن الإرسال عبر واتساب.', 'error', 6000);
  } else {
    alert('فشل إنشاء ملف PDF للفاتورة. لا يمكن الإرسال عبر واتساب.');
  }
  logShareEvent(invoiceId, 'whatsapp-failed', phone || 'no-number');
}

async function shareProformaViaWhatsApp(proformaId) {
  const prof = proformasData.find(p => p.id == proformaId);
  if (!prof) return alert('Proforma not found');

  const customer = getCustomerById(prof.customerId) || prof.customer || {};
  const phone = customer.phone || '';
  const proformaNumber = typeof getProformaDisplayNumber === 'function' ? getProformaDisplayNumber(prof) : (prof.proformaNumber || prof.id);
  const companyName = (typeof getActiveCompanyFromSettings === 'function' && getActiveCompanyFromSettings()) ? (getActiveCompanyFromSettings().name || '') : '';

  const shortText = (companyName ? companyName + '\n' : '') +
    'Proforma N° ' + proformaNumber + ' - ' + (customer.name || '') +
    ' - Total: ' + (prof.total || 0);

  let cleanPhone = '';
  if (phone) {
    cleanPhone = String(phone).replace(/[^0-9+]/g, '');
    if (cleanPhone.startsWith('+')) cleanPhone = cleanPhone.slice(1);
    if (cleanPhone.startsWith('00')) cleanPhone = cleanPhone.slice(2);
    if (cleanPhone.length === 9 && !cleanPhone.startsWith('0')) cleanPhone = '213' + cleanPhone;
    if (cleanPhone.startsWith('0')) cleanPhone = '213' + cleanPhone.slice(1);
  }

  try {
    if (typeof showLoadingOverlay === 'function') {
      showLoadingOverlay('جاري إنشاء PDF للبروفورما...');
    }

    const blob = typeof generateProformaPdfBlob === 'function' ? await generateProformaPdfBlob(proformaId) : null;

    if (typeof hideLoadingOverlay === 'function') {
      hideLoadingOverlay();
    }

    if (blob) {
      const fileName = String(proformaNumber || 'proforma').replace(/[^a-zA-Z0-9_-]+/g, '_') + '.pdf';
      if (window.ZeraldaShareHub && typeof window.ZeraldaShareHub.shareDocument === 'function') {
        await window.ZeraldaShareHub.shareDocument({
          title: 'Proforma ' + proformaNumber,
          text: shortText,
          phone: cleanPhone || phone,
          blob: blob,
          filename: fileName
        });
        logShareEvent(proformaId, 'whatsapp', phone || 'no-number');
        return;
      }

      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: shortText,
          title: 'Proforma ' + proformaNumber
        });
        logShareEvent(proformaId, 'whatsapp', phone || 'no-number');
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);

      const waMsg = shortText + '\n\n(PDF تم تحميله — يرجى إرفاقه في الواتساب)';
      const waUrl = cleanPhone
        ? 'https://wa.me/' + cleanPhone + '?text=' + encodeURIComponent(waMsg)
        : 'https://wa.me/?text=' + encodeURIComponent(waMsg);
      window.open(waUrl, '_blank');

      if (typeof showNotification === 'function') {
        showNotification('تم تحميل PDF البروفورما وفتح WhatsApp. يرجى إرفاق ملف PDF المُحمّل.', 'info', 8000);
      } else {
        setTimeout(function() {
          alert('تم تحميل ملف PDF للبروفورما.\nالآن في نافذة WhatsApp: اضغط على أيقونة المرفقات (📎) وأرفق ملف PDF.');
        }, 500);
      }
      logShareEvent(proformaId, 'whatsapp', phone || 'no-number');
      return;
    }
  } catch (err) {
    if (typeof hideLoadingOverlay === 'function') {
      hideLoadingOverlay();
    }
    console.warn('Proforma PDF share failed:', err);
  }

  if (typeof showNotification === 'function') {
    showNotification('فشل إنشاء ملف PDF للبروفورما. لا يمكن الإرسال عبر واتساب.', 'error', 6000);
  } else {
    alert('فشل إنشاء ملف PDF للبروفورما. لا يمكن الإرسال عبر واتساب.');
  }
  logShareEvent(proformaId, 'whatsapp-failed', phone || 'no-number');
}

/**
 * Copy shareable link to clipboard
 */
function copyShareableLink(invoiceId, type = 'invoice') {
  const link = generateShareableLink(invoiceId, type);

  if (navigator.clipboard) {
    navigator.clipboard.writeText(link).then(() => {
      alert('Link copied to clipboard!');
      logShareEvent(invoiceId, 'link-copy', link);
    }).catch(() => {
      fallbackCopyToClipboard(link);
    });
  } else {
    fallbackCopyToClipboard(link);
  }
}

function fallbackCopyToClipboard(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    alert('Link copied to clipboard!');
  } catch (err) {
    console.error('Failed to copy:', err);
  }
  document.body.removeChild(textarea);
}

/**
 * Generate QR code for invoice
 * Uses qrserver.com API for QR code generation
 */
function generateInvoiceQRCode(invoiceId) {
  const link = generateShareableLink(invoiceId, 'invoice');
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`;

  // Create modal to display QR code
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 400px;">
      <div class="modal-header">
        <h2>Invoice QR Code</h2>
        <span class="close-modal" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</span>
      </div>
      <div style="text-align: center; padding: 20px;">
        <img src="${qrUrl}" alt="QR Code" style="width: 300px; height: 300px; border: 2px solid #ddd; border-radius: 10px;">
        <p style="margin: 15px 0; color: #666;">Scan to view invoice</p>
        <button class="btn btn-primary" onclick="copyShareableLink('${invoiceId}', 'invoice'); this.parentElement.parentElement.parentElement.remove();">
          <i class="fas fa-copy"></i> Copy Link
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Close on overlay click
  modal.addEventListener('click', function (e) {
    if (e.target === this) this.remove();
  });
}

/**
 * Generate shareable link (stored in localStorage)
 * Format: {base_url}?shareId={UUID}
 */
function generateShareableLink(invoiceId, type = 'invoice') {
  const shares = safeJSONParse(ZS.getItem('invoice-shares'), {} === '{}' ? {} : []);

  if (!shares[invoiceId]) {
    shares[invoiceId] = {
      id: generateUUID(),
      invoiceId: invoiceId,
      type: type,
      createdAt: new Date().toISOString(),
      accessCount: 0,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    };
    ZS.setItem('invoice-shares', JSON.stringify(shares));
  }

  const share = shares[invoiceId];
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?viewShare=${share.id}`;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function logShareEvent(invoiceId, method, recipient) {
  const log = safeJSONParse(ZS.getItem('share-log'), [] === '{}' ? {} : []);
  log.push({
    invoiceId: invoiceId,
    method: method,
    recipient: recipient,
    timestamp: new Date().toISOString()
  });
  // Keep only last 100 entries
  if (log.length > 100) log.shift();
  ZS.setItem('share-log', JSON.stringify(log));
}

// ============================================
// ⏰ ADVANCED SCHEDULING FEATURES
// ============================================

/**
 * Schedule invoice send for later date/time
 */
function scheduleInvoiceSend(invoiceId, sendMethod = 'email') {
  const invoice = invoicesData.find(i => i.id == invoiceId);
  if (!invoice) return alert('Invoice not found');

  const customer = getCustomerById(invoice.customerId) || {};
  const contact = sendMethod === 'email' ? customer.email : customer.phone;
  if (!contact) {
    return alert(`Customer has no ${sendMethod}`);
  }

  // Create scheduling modal
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-header">
        <h2>Schedule Invoice Send</h2>
        <span class="close-modal" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</span>
      </div>
      <div style="padding: 20px;">
        <div class="form-group">
          <label class="form-label">Send Method</label>
          <select id="scheduleMethod" class="form-select">
            <option value="email" ${sendMethod === 'email' ? 'selected' : ''}>📧 Email</option>
            <option value="both">📧 Both</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Send Date</label>
          <input type="date" id="scheduleDate" class="form-input" min="${new Date().toISOString().split('T')[0]}">
        </div>
        <div class="form-group">
          <label class="form-label">Send Time</label>
          <input type="time" id="scheduleTime" class="form-input" value="09:00">
        </div>
        <div class="form-group">
          <label class="form-label">Repeat</label>
          <select id="scheduleRepeat" class="form-select" onchange="updateScheduleRepeatUI()">
            <option value="none">No Repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div class="form-group" id="repeatEndUI" style="display:none;">
          <label class="form-label">Repeat Until</label>
          <input type="date" id="scheduleRepeatEnd" class="form-input">
        </div>
        <div class="form-group">
          <label class="form-label">Reminder (days before)</label>
          <input type="number" id="scheduleReminder" class="form-input" value="0" min="0">
        </div>
        <button class="btn btn-success" style="width: 100%; margin-top: 20px;" onclick="confirmScheduleSend('${invoiceId}')">
          <i class="fas fa-calendar-check"></i> Schedule Send
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Set default date to tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('scheduleDate').value = tomorrow.toISOString().split('T')[0];

  modal.addEventListener('click', function (e) {
    if (e.target === this) this.remove();
  });
}

function updateScheduleRepeatUI() {
  const repeatSelect = document.getElementById('scheduleRepeat');
  const repeatUI = document.getElementById('repeatEndUI');
  if (repeatSelect && repeatUI) {
    repeatUI.style.display = repeatSelect.value === 'none' ? 'none' : 'block';
  }
}

function confirmScheduleSend(invoiceId) {
  const method = document.getElementById('scheduleMethod').value;
  const date = document.getElementById('scheduleDate').value;
  const time = document.getElementById('scheduleTime').value;
  const repeat = document.getElementById('scheduleRepeat').value;
  const repeatEnd = document.getElementById('scheduleRepeatEnd').value;
  const reminder = document.getElementById('scheduleReminder').value;

  if (!date) {
    return alert('Please select a send date');
  }

  const schedule = {
    id: generateUUID(),
    invoiceId: invoiceId,
    method: method,
    sendDateTime: `${date}T${time}`,
    repeat: repeat,
    repeatUntil: repeatEnd || null,
    reminderDaysBefore: Number(reminder) || 0,
    createdAt: new Date().toISOString(),
    status: 'pending',
    sentAt: null
  };

  // Save schedule
  const schedules = safeJSONParse(ZS.getItem('invoice-schedules'), [] === '{}' ? {} : []);
  schedules.push(schedule);
  ZS.setItem('invoice-schedules', JSON.stringify(schedules));

  alert(`✅ Invoice scheduled to send on ${date} at ${time}`);
  document.querySelector('.modal.active')?.remove();

  // Trigger scheduler (would normally run in background)
  checkScheduledInvoices();
}

/**
 * Check and send scheduled invoices (run periodically)
 */
function checkScheduledInvoices() {
  const schedules = safeJSONParse(ZS.getItem('invoice-schedules'), [] === '{}' ? {} : []);
  const now = new Date();

  schedules.forEach(schedule => {
    if (schedule.status !== 'pending') return;

    const sendTime = new Date(schedule.sendDateTime);
    if (now >= sendTime) {
      // Send invoice
      if (schedule.method === 'email' || schedule.method === 'both') {
        try { shareInvoiceViaEmail(schedule.invoiceId); } catch (e) { console.error('Failed to send via email', e); }
      }

      // Mark as sent
      schedule.status = 'sent';
      schedule.sentAt = now.toISOString();

      // Reschedule if repeat is enabled
      if (schedule.repeat !== 'none' && (!schedule.repeatUntil || new Date(schedule.repeatUntil) > now)) {
        const nextSend = getNextScheduleDate(sendTime, schedule.repeat);
        schedules.push({
          ...schedule,
          id: generateUUID(),
          sendDateTime: nextSend.toISOString(),
          status: 'pending',
          sentAt: null
        });
      }
    }
  });

  ZS.setItem('invoice-schedules', JSON.stringify(schedules));
}

function getNextScheduleDate(currentDate, repeatType) {
  const next = new Date(currentDate);
  switch (repeatType) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
  }
  return next;
}

/**
 * Send invoice batch (multiple invoices at once)
 */
function sendInvoiceBatch(invoiceIds, sendMethod = 'email') {
  const count = invoiceIds.length;
  const confirmed = confirm(`Send ${count} invoice${count > 1 ? 's' : ''} via ${sendMethod}?`);
  if (!confirmed) return;

  let success = 0;
  let failed = 0;

  invoiceIds.forEach(id => {
    try {
      if (sendMethod === 'email') {
        shareInvoiceViaEmail(id);
      } else if (sendMethod === 'whatsapp') {
        shareInvoiceViaWhatsApp(id);
      }
      success++;
    } catch (e) {
      console.error(`Failed to send invoice ${id}:`, e);
      failed++;
    }
  });

  alert(`Batch send complete!\nSuccess: ${success}\nFailed: ${failed}`);
}

// ============================================
// 🔄 INITIALIZE SCHEDULER
// ============================================

// Run scheduler every minute
if (typeof window !== 'undefined') {
  setInterval(checkScheduledInvoices, 60000);
  // Run once on page load
  document.addEventListener('DOMContentLoaded', checkScheduledInvoices);
}

// Export functions to window
window.exportToCSV = exportToCSV;
window.exportToJSON = exportToJSON;
window.exportToXML = exportToXML;
window.shareInvoiceViaEmail = shareInvoiceViaEmail;
window.shareInvoiceViaWhatsApp = shareInvoiceViaWhatsApp;
window.shareProformaViaWhatsApp = shareProformaViaWhatsApp;
window.copyShareableLink = copyShareableLink;
window.generateInvoiceQRCode = generateInvoiceQRCode;
window.scheduleInvoiceSend = scheduleInvoiceSend;
window.sendInvoiceBatch = sendInvoiceBatch;
window.checkScheduledInvoices = checkScheduledInvoices;

;
