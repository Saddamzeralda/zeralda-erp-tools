/* ============================================================
   erp_export_utils.js  –  Zeralda ERP local export engine
   Formats: CSV · Excel(XLSX/XLS) · PDF · Word(DOC) · JSON · TXT · Print
   ============================================================ */
(function () {
  /* ── helpers ─────────────────────────────────────────────── */
  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeFormat(format) {
    var v = String(format || "").trim().toLowerCase();
    if (v === "xls" || v === "xlsx" || v === "excel") return "excel";
    if (v === "doc" || v === "docx" || v === "word") return "word";
    if (v === "pdf") return "pdf";
    if (v === "csv") return "csv";
    if (v === "json") return "json";
    if (v === "txt" || v === "text") return "txt";
    if (v === "print") return "print";
    return "excel";
  }

  function getFileExtension(format) {
    var map = { excel:"xlsx", word:"docx", pdf:"pdf", csv:"csv", json:"json", txt:"txt" };
    return map[format] || "txt";
  }

  function ensureFileExtension(fileName, format) {
    var base = String(fileName || "").trim();
    var ext = getFileExtension(format);
    if (!base) return "";
    var pattern = new RegExp("\\." + ext + "$", "i");
    if (pattern.test(base)) return base;
    return base + "." + ext;
  }

  

  function getSessionToken() {
    if (window.ZeraldaAuth) return window.ZeraldaAuth.getSessionToken();
    try { return ZS.getItem('zeralda-auth-token') || ''; } catch (_) { return ''; }
  }

  function buildAuthHeaders(extraHeaders) {
    if (window.ZeraldaAuth) return window.ZeraldaAuth.buildAuthHeaders(extraHeaders);
    var headers = Object.assign({}, extraHeaders || {});
    var token = getSessionToken();
    if (token) { headers.Authorization = 'Bearer ' + token; headers['X-Session-Token'] = token; }
    return headers;
  }

  /* ── download helpers ───────────────────────────────────── */
  function downloadBlobRaw(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); document.body.removeChild(a); }, 400);
  }

  function downloadText(content, fileName, mimeType, prependBom) {
    var payload = String(content == null ? "" : content);
    if (prependBom) payload = "\uFEFF" + payload;
    try {
      var blob = new Blob([payload], { type: mimeType });
      downloadBlobRaw(blob, fileName);
      return Promise.resolve();
    } catch (e) {
      // Fallback for very old browsers
      var url = "data:" + mimeType + "," + encodeURIComponent(payload);
      var a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return Promise.resolve();
    }
  }

  /* ── CSV ─────────────────────────────────────────────────── */
  function toCsv(rows, columns) {
    var header = columns.map(function (c) {
      return '"' + String(c.label).replace(/"/g, '""') + '"';
    }).join(",");
    var body = rows.map(function (row) {
      return columns.map(function (c) {
        var val = String(row[c.key] == null ? "" : row[c.key]).replace(/"/g, '""');
        return '"' + val + '"';
      }).join(",");
    });
    return [header].concat(body).join("\r\n");
  }

  /* ── TXT ─────────────────────────────────────────────────── */
  function toTxt(rows, columns, title) {
    var sep = "─".repeat(80);
    var lines = [];
    if (title) { lines.push(title); lines.push(sep); }
    var header = columns.map(function (c) {
      return String(c.label).padEnd(Math.max(12, String(c.label).length + 2));
    }).join("  ");
    lines.push(header);
    lines.push(sep);
    rows.forEach(function (row) {
      var line = columns.map(function (c) {
        var val = String(row[c.key] == null ? "" : row[c.key]);
        return val.padEnd(Math.max(12, String(c.label).length + 2));
      }).join("  ");
      lines.push(line);
    });
    lines.push(sep);
    lines.push("Rows: " + rows.length + "  |  Exported: " + new Date().toLocaleString());
    return lines.join("\r\n");
  }

  /* ── JSON ────────────────────────────────────────────────── */
  function toJson(rows, columns, title) {
    var picked = rows.map(function (row) {
      var obj = {};
      columns.forEach(function (c) {
        obj[c.label] = row[c.key] == null ? "" : row[c.key];
      });
      return obj;
    });
    return JSON.stringify({ title: title || "Export", exportedAt: new Date().toISOString(), count: picked.length, data: picked }, null, 2);
  }

  /* ── HTML table (shared) ─────────────────────────────────── */
  function toHtmlTable(rows, columns, title, opts) {
    opts = opts || {};
    var dir = opts.dir || "ltr";
    var th = columns.map(function (c) { return "<th>" + escapeHtml(c.label) + "</th>"; }).join("");
    var tr = rows.map(function (row) {
      var td = columns.map(function (c) {
        return "<td>" + escapeHtml(String(row[c.key] == null ? "" : row[c.key])) + "</td>";
      }).join("");
      return "<tr>" + td + "</tr>";
    }).join("");
    return "<!DOCTYPE html><html dir=\"" + dir + "\"><head><meta charset=\"utf-8\">" +
      "<title>" + escapeHtml(title || "Export") + "</title>" +
      "<style>*{box-sizing:border-box}body{font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#1e293b;font-size:13px}" +
      "h2{margin:0 0 6px;font-size:18px;color:#0f172a}" +
      ".meta{color:#64748b;font-size:11px;margin-bottom:16px}" +
      "table{border-collapse:collapse;width:100%;margin-top:8px}" +
      "th,td{border:1px solid #e2e8f0;padding:7px 10px;text-align:left}" +
      "thead th{background:#f1f5f9;font-weight:600;color:#334155}" +
      "tr:nth-child(even){background:#f8fafc}" +
      "@media print{body{padding:0}.no-print{display:none}}</style></head>" +
      "<body><h2>" + escapeHtml(title || "Export") + "</h2>" +
      "<p class=\"meta\">Exported: " + new Date().toLocaleString() + " &nbsp;|&nbsp; Rows: " + rows.length + "</p>" +
      "<table><thead><tr>" + th + "</tr></thead><tbody>" + tr + "</tbody></table></body></html>";
  }

  /* ── Word (HTML→DOC) ─────────────────────────────────────── */
  function toWordDoc(rows, columns, title, opts) {
    var tableHtml = toHtmlTable(rows, columns, title, opts);
    // Word-compatible HTML wrapper
    return "<html xmlns:o='urn:schemas-microsoft-com:office:office' " +
      "xmlns:w='urn:schemas-microsoft-com:office:word' " +
      "xmlns='http://www.w3.org/TR/REC-html40'><head>" +
      "<meta charset='utf-8'>" +
      "<meta name=ProgId content=Word.Document>" +
      "<meta name=Generator content='Zeralda ERP'>" +
      "<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View>" +
      "<w:Zoom>90</w:Zoom></w:WordDocument></xml><![endif]-->" +
      "<style>body{font-family:'Arial',sans-serif}table{border-collapse:collapse;width:100%}" +
      "th,td{border:1px solid #ccc;padding:6px 8px}th{background:#e8f0fe}</style>" +
      "</head><body>" + tableHtml.replace(/.*<body>/s, "").replace(/<\/body>.*/s, "") + "</body></html>";
  }

  /* ── Excel (SheetJS or HTML fallback) ───────────────────── */
  function ensureXlsx() {
    if (window.XLSX) return Promise.resolve();
    return loadScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
  }

  function exportExcel(rows, columns, fileName, title) {
    return ensureXlsx().then(function () {
      var XLSX = window.XLSX;
      if (!XLSX) throw new Error("SheetJS not loaded");

      var aoa = [columns.map(function (c) { return c.label; })];
      rows.forEach(function (row) {
        aoa.push(columns.map(function (c) {
          var v = row[c.key];
          return v == null ? "" : v;
        }));
      });

      var ws = XLSX.utils.aoa_to_sheet(aoa);

      // Column widths auto-fit
      var wscols = columns.map(function (c) {
        var maxLen = String(c.label).length;
        rows.forEach(function (r) { maxLen = Math.max(maxLen, String(r[c.key] == null ? "" : r[c.key]).length); });
        return { wch: Math.min(Math.max(maxLen + 2, 8), 40) };
      });
      ws["!cols"] = wscols;

      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, (title || "Data").slice(0, 31));
      XLSX.writeFile(wb, fileName);
    }).catch(function () {
      // Fallback: HTML table with xlsx MIME type
      var html = toHtmlTable(rows, columns, title);
      return downloadText(html, fileName.replace(/\.xlsx$/i, ".xls"), "application/vnd.ms-excel", true);
    });
  }

  /* ── PDF (jsPDF+autoTable or print fallback) ─────────────── */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-export-lib="' + CSS.escape(src) + '"]');
      if (existing && existing.dataset.loaded === "1") { resolve(); return; }
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.dataset.exportLib = src;
      s.onload = function () { s.dataset.loaded = "1"; resolve(); };
      s.onerror = function () { reject(new Error("Failed: " + src)); };
      document.head.appendChild(s);
    });
  }

  function ensurePdfLib() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    return loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js")
      .then(function () {
        return loadScript("https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js");
      });
  }

  function containsRtlOrArabic(rows, columns, title) {
    // Arabic + Hebrew Unicode ranges. jsPDF default font (helvetica) cannot render these glyphs.
    var rx = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    if (rx.test(String(title || ""))) return true;
    var i, j;
    for (i = 0; i < (columns || []).length; i++) {
      if (rx.test(String(columns[i].label || ""))) return true;
    }
    for (i = 0; i < (rows || []).length; i++) {
      var r = rows[i] || {};
      for (j = 0; j < (columns || []).length; j++) {
        var v = r[columns[j].key];
        if (v != null && rx.test(String(v))) return true;
      }
    }
    return false;
  }

  function exportPdfViaPrintHtml(rows, columns, fileName, title, opts) {
    // Renders the document via a printable HTML window — preserves Arabic/RTL glyphs.
    var dir = (opts && opts.dir) || (containsRtlOrArabic(rows, columns, title) ? "rtl" : "ltr");
    var html = toHtmlTable(rows, columns, title, { dir: dir });
    var w = window.open("", "_blank");
    if (!w) {
      // popup blocked — fall back to HTML download
      return downloadText(html, String(fileName || "export.pdf").replace(/\.pdf$/i, ".html"), "text/html");
    }
    w.document.write(html);
    w.document.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (_) {} }, 350);
    return Promise.resolve();
  }

  function exportPdf(rows, columns, fileName, title, opts) {
    // jsPDF + helvetica cannot render Arabic glyphs — detect and route to HTML print PDF.
    if (containsRtlOrArabic(rows, columns, title)) {
      return exportPdfViaPrintHtml(rows, columns, fileName, title, opts);
    }
    return ensurePdfLib().then(function () {
      var jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
      if (!jsPDFCtor) throw new Error("jsPDF unavailable");
      var doc = new jsPDFCtor({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(String(title || "Export"), 40, 40);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100);
      doc.text("Exported: " + new Date().toLocaleString() + "  |  Rows: " + rows.length, 40, 54);
      doc.setTextColor(0);

      var head = [columns.map(function (c) { return c.label; })];
      var body = rows.map(function (row) {
        return columns.map(function (c) {
          return String(row[c.key] == null ? "" : row[c.key]);
        });
      });

      if (typeof doc.autoTable === "function") {
        doc.autoTable({
          head: head,
          body: body,
          startY: 66,
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fillColor: [30, 100, 200], textColor: 255, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [245, 248, 255] }
        });
      } else {
        var y = 72;
        doc.setFontSize(9);
        doc.text(head[0].join("  |  "), 40, y);
        y += 14;
        body.forEach(function (line) {
          if (y > 560) { doc.addPage(); y = 40; }
          doc.text(line.join("  |  "), 40, y);
          y += 12;
        });
      }
      try {
        var pdfBlob = typeof doc.output === "function" ? doc.output("blob") : null;
        if (pdfBlob) {
          downloadBlobRaw(pdfBlob, fileName);
          return;
        }
      } catch (_) {}
      doc.save(fileName);
    }).catch(function () {
      // Offline fallback: open printable HTML window
      var html = toHtmlTable(rows, columns, title);
      var w = window.open("", "_blank");
      if (!w) {
        return downloadText(html, fileName.replace(/\.pdf$/, ".html"), "text/html");
      }
      w.document.write(html);
      w.document.close();
      setTimeout(function () { try { w.focus(); w.print(); } catch (_) {} }, 400);
    });
  }

  /* ── table DOM → rows+columns ────────────────────────────── */
  function tableToRowsCols(tableEl) {
    var headers = [];
    var rows = [];
    var ths = tableEl.querySelectorAll("thead th, thead td");
    if (!ths.length) ths = tableEl.querySelectorAll("tr:first-child th, tr:first-child td");
    ths.forEach(function (th) { headers.push({ key: "_c" + headers.length, label: (th.textContent || "").trim() }); });

    var trs = tableEl.querySelectorAll("tbody tr");
    if (!trs.length) {
      // no tbody – grab all rows except first
      var allTrs = tableEl.querySelectorAll("tr");
      trs = Array.prototype.slice.call(allTrs, 1);
    }
    trs.forEach(function (tr) {
      if (tr.classList.contains("d-none") || tr.style.display === "none") return;
      var tds = tr.querySelectorAll("td, th");
      if (!tds.length) return;
      var row = {};
      headers.forEach(function (h, i) {
        row[h.key] = (tds[i] ? (tds[i].textContent || "").trim() : "");
      });
      rows.push(row);
    });
    return { rows: rows, columns: headers };
  }

  /* ── main public API ─────────────────────────────────────── */

  /**
   * exportRecords(options)
   * options: { rows[], columns[{key,label}], format, fileName, title, dir }
   */
  function exportRecords(options) {
    options = options || {};
    var format = normalizeFormat(options.format || "excel");
    var title = String(options.title || "Export");
    var rows = Array.isArray(options.rows) ? options.rows : [];
    var columns = Array.isArray(options.columns) ? options.columns : [];
    var ext = getFileExtension(format);
    var rawFileName = String(options.fileName || (title.replace(/[^a-zA-Z0-9_\-\u0600-\u06ff ]/g, "_") + "_" + _dateStamp() + "." + ext));
    var fileName = ensureFileExtension(rawFileName, format);

    if (!rows.length) {
      return Promise.reject(new Error("No data to export."));
    }

    if (format === "csv") {
      return downloadText(toCsv(rows, columns), fileName, "text/csv;charset=utf-8;", true);
    }
    if (format === "txt") {
      return downloadText(toTxt(rows, columns, title), fileName, "text/plain;charset=utf-8;");
    }
    if (format === "json") {
      return downloadText(toJson(rows, columns, title), fileName, "application/json;charset=utf-8;");
    }
    if (format === "word") {
      return downloadText(toWordDoc(rows, columns, title, options), fileName, "application/vnd.ms-word;charset=utf-8;");
    }
    if (format === "excel") {
      return exportExcel(rows, columns, fileName, title);
    }
    if (format === "pdf") {
      return exportPdf(rows, columns, fileName, title, options);
    }
    if (format === "print") {
      var html = toHtmlTable(rows, columns, title, options);
      var w = window.open("", "_blank");
      if (!w) return Promise.reject(new Error("Popup blocked"));
      w.document.write(html);
      w.document.close();
      setTimeout(function () { try { w.focus(); w.print(); } catch (_) {} }, 350);
      return Promise.resolve();
    }
    return Promise.reject(new Error("Unknown format: " + format));
  }

  /**
   * exportTable(tableEl, options)
   * options: { format, fileName, title }
   */
  function exportTable(tableEl, options) {
    if (!tableEl) return Promise.reject(new Error("No table element provided"));
    var rc = tableToRowsCols(tableEl);
    if (!rc.rows.length) return Promise.reject(new Error("Table has no visible rows."));
    var opts = Object.assign({}, options || {}, { rows: rc.rows, columns: rc.columns });
    return exportRecords(opts);
  }

  /**
   * exportHtmlDocument(options)
   * options: { html, fileName, format('pdf'|'word'|'print') }
   */
  function exportHtmlDocument(options) {
    options = options || {};
    var format = normalizeFormat(options.format || "pdf");
    var html = String(options.html || "");
    var rawFileName = String(options.fileName || ("document_" + _dateStamp() + "." + getFileExtension(format)));
    var fileName = ensureFileExtension(rawFileName, format);

    if (format === "word") {
      return downloadText(html, fileName, "application/vnd.ms-word;charset=utf-8;");
    }
    if (format === "print" || format === "pdf") {
      var w = window.open("", "_blank");
      if (!w) return Promise.reject(new Error("Popup blocked"));
      w.document.write(html);
      w.document.close();
      setTimeout(function () { try { w.focus(); w.print(); } catch (_) {} }, 350);
      return Promise.resolve();
    }
    return downloadText(html, fileName, "text/html;charset=utf-8;");
  }

  /* ── date stamp helper ───────────────────────────────────── */
  function _dateStamp() {
    var d = new Date();
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
  }

  /* ── public ──────────────────────────────────────────────── */
  window.ErpExportUtils = {
    normalizeFormat:    normalizeFormat,
    exportRecords:      exportRecords,
    exportTable:        exportTable,
    exportHtmlDocument: exportHtmlDocument,
    tableToRowsCols:    tableToRowsCols,
    toHtmlTable:        toHtmlTable,
    toCsv:              toCsv,
    toJson:             toJson,
    toTxt:              toTxt,
    _loadScript:        loadScript
  };
})();