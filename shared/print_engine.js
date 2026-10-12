(function() {
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isRunningInWebView2() {
    return !!(window.chrome && window.chrome.webview);
  }

  function collectPageStyles() {
    var stylesheetLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(function(link) {
        return '<link rel="stylesheet" href="' + escapeHtml(link.href) + '">';
      })
      .join('');

    var inlineStyles = Array.from(document.querySelectorAll('style'))
      .map(function(styleTag) { return styleTag.textContent || ''; })
      .join('\n');

    return { links: stylesheetLinks, inlineStyles: inlineStyles };
  }

  function defaultPrintCss(dir) {
    var align = dir === 'rtl' ? 'right' : 'left';
    var numCss = 'body{font-feature-settings:"lnum" 1;font-variant-numeric:lining-nums tabular-nums;}';
    return '' +
      '@page{size:A4 portrait;margin:10mm 8mm 10mm 8mm;}' +
      'html,body{margin:0 !important;padding:0 !important;background:#fff !important;color:#0f172a;direction:' + dir + ';font-size:11pt;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      numCss +
      'button,.no-print,.modal-footer,.modal-actions,.btn{display:none !important;}' +
      'thead{display:table-header-group !important;}' +
      'tbody{display:table-row-group !important;}' +
      'tr, tbody tr, .preview-signatures, .preview-notes, .invoice-header, .invoice-totals, .coordonnees, .totaux, .signature-section{page-break-inside:avoid !important;break-inside:avoid !important;}' +
      'table, tbody, .preview-paper, .facture-container, #doc-page, #doc-fit-root{page-break-inside:auto !important;break-inside:auto !important;}' +
      'a{text-decoration:none;color:inherit;}' +
      // padding with !important to override inline styles; wrappers reset it to avoid double padding
      '.preview-paper{box-shadow:none !important;border:0 !important;max-width:100% !important;position:relative !important;width:100% !important;min-height:auto;box-sizing:border-box;padding:0 !important;margin:0 auto;}' +
      '.preview-signatures{page-break-inside:avoid !important;break-inside:avoid !important;}' +
      '.preview-card,.preview-totals-card,.preview-notes{box-shadow:none !important;page-break-inside:avoid !important;break-inside:avoid !important;}' +
      '.preview-table-wrap{border-radius:0;border:1px solid #cbd5e1;page-break-inside:auto;}' +
      '.preview-table{width:100% !important;border-collapse:collapse !important;font-size:10pt !important;page-break-inside:auto !important;break-inside:auto !important;}' +
      '.preview-table th,.preview-table td{text-align:' + align + ';border-color:#cbd5e1;padding:5px 7px !important;font-size:10pt !important;}' +
      '.preview-hero{background:#1e293b !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '.preview-table th,.preview-summary-item,.preview-notes,.preview-totals-card{-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '.facture-container{box-shadow:none !important;border:0 !important;max-width:100% !important;width:100% !important;min-height:auto;max-height:none !important;box-sizing:border-box;border-radius:0 !important;overflow:visible !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0 !important;margin:0 auto;page-break-inside:auto !important;break-inside:auto !important;}' +
      '.facture-container table{width:100% !important;border-collapse:collapse !important;page-break-inside:auto !important;break-inside:auto !important;}' +
      '.facture-container table thead tr,.facture-container .grand-total,.facture-container tr[style*="background:#1e2b3c"]{-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '.facture-container table th,.facture-container table td{border-color:#cbd5e1 !important;}' +
      '.facture-container .coordonnees .fournisseur,.facture-container .coordonnees .client,.facture-container .notes,.facture-container .total-row{-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      // When content is inside a wrapper (#doc-page or #pf-page), reset inner padding to avoid double padding
      '#doc-page .preview-paper,#doc-page .facture-container,#pf-page .preview-paper,#pf-page .facture-container{padding:0 !important;width:auto !important;min-height:auto !important;}' +
      '@media print{html,body{margin:0 !important;padding:0 !important;background:#fff !important;} tr, tbody tr { page-break-inside:avoid !important; break-inside:avoid !important; } table, tbody, .facture-container { page-break-inside:auto !important; break-inside:auto !important; }}';
  }

  function buildPrintHtml(content, title, options) {
    var opts = options || {};
    var dir = opts.dir || document.documentElement.getAttribute('dir') || 'ltr';
    var lang = opts.lang || document.documentElement.getAttribute('lang') || 'en';
    var styles = collectPageStyles();
    var extraCss = opts.extraCss || '';

    // ── FIX: Add <base> tag so relative URLs (e.g. logo.png) resolve correctly ──
    // When opening about:blank, relative paths like "logo.png" fail to load.
    // Setting <base href> to the originating page URL fixes logo & asset loading.
    var baseUrl = '';
    try {
      var origin = window.location.origin;
      var pathname = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
      baseUrl = origin + pathname;
    } catch (e) {}

    // ── FIX: Convert relative src/href in content to absolute URLs ──
    // <base> alone may not work in all environments (e.g. WebView2 iframe).
    // This ensures images like <img src="logo.png"> become <img src="http://host/logo.png">.
    var processedContent = content || '';
    if (baseUrl) {
      // Convert relative img src, link href, script src that don't start with http/data:blob:/
      processedContent = processedContent.replace(
        /((?:src|href)\s*=\s*")((?!https?:|data:|blob:|\/\/|#|\/)[^"]*)(")/gi,
        function(match, prefix, relPath, suffix) {
          return prefix + baseUrl + relPath + suffix;
        }
      );
    }

    return '<!DOCTYPE html>' +
      '<html dir="' + escapeHtml(dir) + '" lang="' + escapeHtml(lang) + '">' +
      '<head>' +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">' +
      (baseUrl ? '<base href="' + escapeHtml(baseUrl) + '">' : '') +
      '<title>' + escapeHtml(title || 'Print') + '</title>' +
      styles.links +
      '<style>' + styles.inlineStyles + defaultPrintCss(dir) + extraCss + '</style>' +
      '</head>' +
      '<body>' + processedContent +
      '<script>window.onload=function(){window.focus();setTimeout(function(){window.print();},300);window.onafterprint=function(){window.close();};};<\/script>' +
      '</body></html>';
  }

  function printViaIframe(htmlContent) {
    var iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    var doc = iframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    iframe.onload = function() {
      setTimeout(function() {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (e) {
          console.error('[print_engine] iframe print failed', e);
        } finally {
          setTimeout(function() {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          }, 800);
        }
      }, 350);
    };
  }

  function openPrintWindow(htmlContent, options) {
    var opts = options || {};
    if (isRunningInWebView2()) {
      printViaIframe(htmlContent);
      return true;
    }

    try {
      var targetName = String(opts.targetName || 'ZeraldaPrintTab');
      var preferTab = opts.preferTab !== false;
      var popup;

      if (preferTab) {
        // Open/reuse a named browsing context as a tab in most browsers.
        popup = window.open('', targetName);
      } else {
        var width = Number(opts.width || 900);
        var height = Number(opts.height || 700);
        popup = window.open('', '', 'height=' + height + ',width=' + width);
      }

      if (!popup) return false;
      popup.document.open();
      popup.document.write(htmlContent);
      popup.document.close();
      return true;
    } catch (err) {
      console.error('[print_engine] window print failed', err);
      printViaIframe(htmlContent);
      return true;
    }
  }

  function printHtml(htmlContent, options) {
    return openPrintWindow(htmlContent, options);
  }

  function printContent(content, title, options) {
    var html = buildPrintHtml(content, title, options);
    return printHtml(html, options);
  }

  function printElement(elementOrId, title, options) {
    var element = typeof elementOrId === 'string'
      ? document.getElementById(elementOrId)
      : elementOrId;
    if (!element) return false;
    return printContent(element.innerHTML, title, options);
  }

  window.ZeraldaPrintEngine = {
    isRunningInWebView2: isRunningInWebView2,
    buildPrintHtml: buildPrintHtml,
    printHtml: printHtml,
    printContent: printContent,
    printElement: printElement
  };
})();
