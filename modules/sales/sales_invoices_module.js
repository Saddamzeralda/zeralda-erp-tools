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
    var value = String(id);
    if (/^\d{1,}\/\d{4}$/.test(value)) return value;
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
      tdId.innerHTML = "<strong>" + escapeHTML(formatInvoiceNumber(inv.invoiceNumber || inv.id)) + "</strong>";

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

      actionsDiv.appendChild(btnView);
      actionsDiv.appendChild(btnEdit);
      actionsDiv.appendChild(btnWhatsApp);
      actionsDiv.appendChild(btnDuplicate);
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
