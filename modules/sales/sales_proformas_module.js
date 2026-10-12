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
    var value = String(id);
    if (/^\d{1,}\/\d{4}$/.test(value)) return value;
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
      tdId.innerHTML = "<strong>" + escapeHTML(formatProformaNumber(prof.proformaNumber || prof.id)) + "</strong>";

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
