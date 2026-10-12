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
