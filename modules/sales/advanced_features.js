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
